# Documentation Standards & Architecture Records: Agentic Business OS

**Document Status:** Authoritative Documentation Specification  
**Version:** 1.0.0  
**Authority:** Governs engineering documentation, ADRs, code comments, and API specs

---

## 1. Documentation Principles

Documentation is an engineered product asset. Like code, it must be accurate, concise, version-controlled, and actively maintained.

### 1.1 Core Rules

1. **Explain the WHY, Not the Obvious WHAT:** Code reveals _what_ is happening; documentation explains _why_ the design was chosen, the business constraints, and the tradeoffs accepted.
2. **Single Source of Truth:** Never duplicate business rules in multiple documents where they can drift out of sync. Link directly to the authoritative document.
3. **Docs Evolve with PRs:** Any pull request that alters an architectural boundary, database schema, or domain rule must update the corresponding `/docs` file in the same PR.

---

## 2. What Must Be Documented

| Category                                | Storage Location               | Content Requirements                                                                             |
| :-------------------------------------- | :----------------------------- | :----------------------------------------------------------------------------------------------- |
| **Architecture Decision Records (ADR)** | `/docs/adr/`                   | Significant architectural choices, alternatives considered, decision drivers, consequences.      |
| **Domain Logic & Invariants**           | `/docs/`                       | Complex accounting algorithms, double-entry validation rules, FIFO/WAV inventory costing models. |
| **Public API Contracts**                | OpenAPI / NestJS Swagger       | Endpoint descriptions, request DTOs, response schemas, error codes.                              |
| **AI Agent Tools**                      | In-code Zod schemas + `/docs/` | Tool input parameters, execution boundaries, failure modes, permissions.                         |
| **Operational Runbooks**                | `/docs/runbooks/`              | Disaster recovery, database restore, worker queue draining, migration rollback procedures.       |

---

## 3. Architecture Decision Records (ADR)

Significant architectural shifts (e.g., selecting BullMQ over Kafka, choosing Prisma + Kysely over TypeORM, adopting UUID v7) must be memorialized as an ADR.

### 3.1 Standard ADR Template (`/docs/adr/ADR-YYYYMMDD-title.md`)

```markdown
# ADR-001: Selection of Integer Cents for Monetary Representation

**Status:** Accepted  
**Date:** 2026-10-04  
**Author:** Principal Engineer

## 1. Context & Problem Statement

JavaScript IEEE 754 floating-point numbers produce rounding errors (e.g., `0.1 + 0.2 === 0.30000000000000004`), which is unacceptable for authoritative general ledger accounting.

## 2. Decision Drivers

- Zero rounding errors on monetary calculations.
- High query performance in PostgreSQL.
- Simplicity of serialization across REST and WebSocket APIs.

## 3. Considered Options

- Option A: PostgreSQL `NUMERIC(18, 4)` across all tables.
- Option B: PostgreSQL `BIGINT` representing minor units (cents) with minor-unit math.
- Option C: JavaScript `number` floats with rounding functions.

## 4. Decision Outcome

Chosen Option B (`BIGINT` minor units / integer cents) for all transaction lines, account balances, and invoices. High-precision rates (unit costs, FX) will use Option A (`NUMERIC(18, 4)`).

## 5. Consequences

- Positive: Impossibility of floating-point drift; fast arithmetic in database and memory.
- Negative: Frontend must use standardized formatters (`formatCurrency`) to render decimal amounts.
```

---

## 4. Code Comments: Best Practices vs. Anti-Patterns

### 4.1 Banned Comment Anti-Patterns

- **Never write comments that paraphrase the code:**
  ```typescript
  // BAD: Redundant comment
  // Get the bank account by id
  const bankAccount = await this.bankAccountRepo.findById(id);
  ```
- **Never leave commented-out dead code:**
  ```typescript
  // BAD: Delete dead code; Git tracks history
  // const oldTaxCalculation = amount * 0.08;
  ```

### 4.2 Required Comments

- **Business Constraints & Edge Cases:**
  ```typescript
  // Note: Stripe fees on refunds are not returned by the payment processor.
  // We book the refund gross amount to Customer Refunds (4200) and preserve
  // the original Merchant Processing Fee (6120) entry as non-recoverable.
  ```
- **Workarounds for Third-Party Quirks:**
  ```typescript
  // Chase Bank PDF export occasionally reports trailing negative signs (e.g. "140.50-").
  // Regex normalizes this to "-140.50" prior to integer conversion.
  ```
