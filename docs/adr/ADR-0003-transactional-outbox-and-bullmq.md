# ADR-0003: Transactional Outbox Pattern with BullMQ for Reliable Event Dispatch

**Status:** Accepted  
**Date:** 2026-10-05  
**Author:** Principal Architect  
**Deciders:** Core Engineering Team

---

## 1. Context & Problem Statement

When a financial event occurs (e.g., a journal entry is posted or a bank statement is uploaded), downstream actions must be triggered (e.g., updating materialized balances, enqueuing OCR extraction, emitting audit logs).

If an application service writes to PostgreSQL and then immediately publishes an event to Redis/BullMQ, a system crash or network glitch between the two operations results in a "Dual-Write Inconsistency": the database transaction succeeds, but the event is lost forever (or vice versa).

---

## 2. Decision Drivers

1. **Guaranteed At-Least-Once Delivery:** Financial events must never be lost.
2. **Atomic Consistency:** Event persistence must be bound to the primary database transaction.
3. **Idempotent Consumption:** Downstream workers must safely handle duplicate events.

---

## 3. Considered Options

- **Option A: Direct In-Memory Event Dispatching** (`EventEmitter2` in-memory). (Risk: Lost events on server restart).
- **Option B: Dual-Write to Redis & PostgreSQL directly.** (Risk: Inconsistent state on partial failure).
- **Option C: Transactional Outbox Pattern.** (Events inserted into an `outbox_events` table within the primary DB transaction, then asynchronously polled and dispatched to BullMQ/Redis).

---

## 4. Decision Outcome

**Chosen: Option C (Transactional Outbox Pattern with BullMQ).**

### Specific Architectural Rules

- Every domain service that publishes events writes an event record to `outbox_events` within the active PostgreSQL transaction.
- An outbox relay worker polls `outbox_events` (`SELECT ... FOR UPDATE SKIP LOCKED`), dispatches the job to BullMQ, and updates the outbox status to `PUBLISHED`.
- All BullMQ consumers enforce idempotency via unique `jobId` hashes.

---

## 5. Consequences

- **Positive:** Complete elimination of dual-write discrepancies; 100% reliable event dispatching even through sudden worker or database restarts.
- **Negative:** Slight latency (typically $< 250\text{ms}$) between database commit and worker pickup; requires managing the `outbox_events` table cleanup.
