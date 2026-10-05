# ADR-0004: AI Agent Staging & Zero Direct Ledger Mutation

**Status:** Accepted  
**Date:** 2026-10-05  
**Author:** Principal Architect  
**Deciders:** Core Engineering Team

---

## 1. Context & Problem Statement

Large Language Models (LLMs) and probabilistic AI agents are susceptible to hallucinations, model drift, and non-deterministic behavior. In an autonomous business OS, granting an AI agent write permissions directly to general ledger tables (`journal_entries`, `journal_entry_lines`, `accounts`) or financial disbursement endpoints exposes the enterprise to catastrophic financial errors and regulatory liability.

---

## 2. Decision Drivers

1. **Absolute Financial Integrity:** General ledger state must be 100% deterministic and compliant with double-entry invariants ($\sum Dr == \sum Cr$).
2. **Safe Autonomous Acceleration:** Harnessing AI for high-velocity classification and entity matching without risk of corrupted state.
3. **Auditable Human-in-the-Loop Safeguards:** Clear escalation pathways for low-confidence or anomalous outputs.

---

## 3. Considered Options

- **Option A: Direct Ledger Writes by AI Agents** with post-hoc auditing. (High Risk: Corrupted balances, unrecoverable bad entries).
- **Option B: Staging Proposals Table with 6-Stage Deterministic Validation Gate.** (AI writes advisory proposals to `proposals`; deterministic code enforces business rules, balance checks, and policy thresholds before posting).
- **Option C: Pure Chatbot Interface with Manual Copy-Pasting.** (Violates product philosophy: requires excessive human manual work).

---

## 4. Decision Outcome

**Chosen: Option B (Staging Proposals Table with 6-Stage Deterministic Validation Gate).**

### Specific Architectural Rules

- AI agents operate under non-human service principal identities with write permissions restricted strictly to the `proposals` staging table.
- AI proposals must pass through the **6-Stage Deterministic Gate**:
  1. Zod Schema Validation
  2. Business Rule Validation (Active accounts, valid period)
  3. RBAC & Tenant Verification
  4. Deterministic Ledger Math ($\sum Dr == \sum Cr == 0$)
  5. Atomic Database Transaction Boundary
  6. Cryptographically Chained Immutable Audit Log
- If confidence $\ge 95\%$ and all 6 stages pass without policy blocks, the proposal is posted automatically; otherwise, it is routed to the **Exception Center** for 1-click human review.

---

## 5. Consequences

- **Positive:** Mathematical impossibility of AI-induced ledger imbalance; complete audit trail; high degree of safe automation.
- **Negative:** Staging proposals table requires maintenance and lifecycle management (purging rejected drafts).
