# ADR-0001: Integer Cents Representation for Authoritative Monetary Balances

**Status:** Accepted  
**Date:** 2026-10-04  
**Author:** Principal Engineer  
**Deciders:** Core Engineering Team

---

## 1. Context & Problem Statement

In financial software and general ledger systems, floating-point arithmetic (e.g., IEEE 754 `number` in JavaScript/TypeScript, `FLOAT` in PostgreSQL) introduces cumulative binary rounding errors (e.g., `0.1 + 0.2 === 0.30000000000000004`). In double-entry bookkeeping, even a single-cent discrepancy violates the fundamental invariant:
$$\sum \text{Debits} - \sum \text{Credits} = 0$$

The Agentic Business OS requires an absolute, deterministic monetary representation that guarantees exact balance equality across all transactions, statements, ledgers, and reporting layers.

---

## 2. Decision Drivers

1. **Zero Arithmetic Drift:** No rounding discrepancies across multi-line journal entries.
2. **Database Performance & Storage:** High-speed indexing and aggregation in PostgreSQL without costly numeric conversions.
3. **API Serialization Simplicity:** Clean, lossless representation across JSON payloads without stringified float ambiguities.
4. **Deterministic Invariants:** Unambiguous database `CHECK` constraints on debit/credit signs and equality.

---

## 3. Considered Options

- **Option A: PostgreSQL `NUMERIC(18, 4)` for all currency fields.**
- **Option B: Minor Currency Units / Integer Cents (`BIGINT`) with fixed-point math.**
- **Option C: JavaScript `number` floats with custom application rounding utilities.**

---

## 4. Decision Outcome

**Chosen: Option B (Minor Currency Units / Integer Cents stored as `BIGINT`).**

### Specific Architectural Rules

- **Authoritative Balances & Ledger Lines:** All transactions, journal lines, invoices, and bank statement lines store amounts as `BIGINT` minor units (e.g., USD cents: `$1,250.75` &rarr; `125075`).
- **High-Precision Unit Rates:** Unit costs (e.g., fractional inventory parts) and foreign exchange rates use Option A (`NUMERIC(18, 4)`).
- **Frontend Presentation:** The frontend receives integer cents and formats values for display strictly through the shared `formatCurrency()` utility.
- **LLM Ban:** Under no circumstances may an LLM perform monetary additions, subtractions, or balance checks. All calculations are executed by deterministic integer math functions.

---

## 5. Consequences

- **Positive:** Complete elimination of floating-point drift; exact double-entry balancing; high-performance integer arithmetic in PostgreSQL.
- **Negative:** Engineers must ensure display values are divided by 100 before showing decimal formats to end users and multiplied by 100 upon input ingestion.
