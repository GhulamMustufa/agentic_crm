# ADR-0002: Selection of Modular Monolith over Microservices

**Status:** Accepted  
**Date:** 2026-10-05  
**Author:** Principal Architect  
**Deciders:** Core Engineering Team

---

## 1. Context & Problem Statement

The platform must support multiple operational domains over time (Finance, Payroll, Inventory, HR, CRM, Sales, Support). A common architectural decision for enterprise platforms is whether to launch with distributed microservices from day one or adopt a Modular Monolith.

In financial software, distributed microservices introduce distributed transaction coordination (Two-Phase Commit / complex Sagas), cross-service network latency, data consistency anomalies, and significant DevOps operational complexity.

---

## 2. Decision Drivers

1. **Financial Transaction Atomicity:** General Ledger, Banking, Invoices, and Inventory must maintain strict ACID consistency within unified database transaction boundaries.
2. **Developer Velocity & Operational Simplicity:** Fast local development, unified CI/CD, and single-step database migrations.
3. **Strict Domain Boundaries:** Clear in-process separation of concerns to allow extraction of standalone services in future phases if scaling requires it.
4. **Zero Premature Overhead:** Avoiding premature Kubernetes service mesh and distributed tracing infrastructure costs during early phases.

---

## 3. Considered Options

- **Option A: Distributed Microservices from Day 1** (Separate services for Auth, Ledger, Banking, Recon, AI).
- **Option B: Modular Monolith in NestJS** (Strictly bounded internal modules with in-process Dependency Injection and BullMQ workers).
- **Option C: Unstructured Monolith** (Single monolithic codebase without strict internal boundary enforcement).

---

## 4. Decision Outcome

**Chosen: Option B (Modular Monolith in NestJS).**

### Specific Architectural Rules

- Each domain capability is an autonomous NestJS Module with internal presentation, application, domain, and infrastructure layers.
- Cross-module interactions occur via typed service interfaces or domain events, never direct cross-boundary database mutations.
- Background workers (BullMQ) run as separate process containers sharing the same code base and data models.
- If a domain (such as Document OCR or AI Reasoning) experiences high CPU loads, worker processes can be scaled independently without breaking the modular monolith architecture.

---

## 5. Consequences

- **Positive:** Guaranteed ACID transactions for double-entry ledger postings; zero network serialization latency between core modules; rapid feature velocity for Phase 1 and Phase 2.
- **Negative:** Requires rigorous code review and linting enforcement to prevent engineers from bypassing module boundaries or introducing circular module dependencies.
