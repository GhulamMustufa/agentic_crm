# Architecture Stress-Test & Production-Readiness Gap Report

**Document Status:** Adversarial Review & Production-Readiness Gap Analysis  
**Reviewing Roles:** Skeptical Staff Engineer, Security Engineer, CPA/Controller (Accountant), Site Reliability Engineer (SRE)  
**Target:** Architecture defined in [`/docs/ARCHITECTURE.md`](file:///Users/mac/Desktop/projects/agentic_crm/docs/ARCHITECTURE.md) and associated ADRs  
**Date:** October 2026

---

## 1. Executive Summary & Review Verdict

This review conducts an adversarial failure-mode analysis of the **Agentic Business OS** across 18 high-risk failure scenarios.

### The Verdict:

The fundamental architectural boundary—**DETERMINISTIC GENERAL LEDGER vs. UNTRUSTED ADVISORY AI**—is sound and robust. The 6-stage validation gate, integer cents representation (`BIGINT`), and transactional outbox pattern prevent the most catastrophic failure modes (such as an LLM hallucinating out-of-balance debits or silently mutating cash reserves).

However, **there are 5 critical production-readiness gaps** that must be engineered before this system can safely handle production financial traffic.

---

## 2. Adversarial Scenario Stress-Tests

---

### Scenario 1: Same Bank Statement Uploaded Twice

- **Failure Mode:** User or integration uploads the exact same statement file twice (or uploads a renamed duplicate with identical transaction periods).
- **Impact:** Duplicate bank transaction records, skewed cash positions, duplicate expense entries, and corrupted reconciliation.
- **Prevention:**
  1. **File-Level Hash:** S3 upload triggers SHA-256 content hashing: `UNIQUE(tenant_id, file_sha256)`. If hash matches, reject immediately at API boundary with `409 Conflict`.
  2. **Statement Period Unique Constraint:** Composite constraint on `bank_statements`:
     ```sql
     UNIQUE (tenant_id, bank_account_id, statement_start_date, statement_end_date)
     ```
  3. **Transaction Deduplication Hash:** Step 4 of the 17-step pipeline computes a deterministic hash per row: `SHA-256(tenant_id + bank_account_id + date + amount_cents + normalized_description)`.
- **Detection:** Database unique constraint violation (`23505`); metric `statement_duplicate_upload_total` increments.
- **Recovery:** API returns `409 Conflict` referencing existing `statementId`. The upload worker exits with zero mutations.

---

### Scenario 2: Same Transaction Processed Twice

- **Failure Mode:** A transaction line is fed through the proposal/reconciliation pipeline twice due to a worker retry or simultaneous webhook delivery.
- **Impact:** Double posting of journal entries, doubling of expenses/revenue, unbalanced cash ledger.
- **Prevention:**
  1. Transaction table constraint: `UNIQUE(tenant_id, bank_account_id, transaction_hash)`.
  2. State machine assertion: A bank transaction must be in `UNRECONCILED` state to generate a proposal or post an entry.
  3. Database-level reconciliation link constraint:
     ```sql
     UNIQUE(bank_transaction_id) ON TABLE reconciled_transactions
     ```
- **Detection:** Unique constraint error on attempt to link transaction twice. Metric `transaction_duplicate_detected_total`.
- **Recovery:** Transaction rollback. Worker drops duplicate execution and returns existing journal entry ID.

---

### Scenario 3: Worker Crashes Halfway Through Processing

- **Failure Mode:** Background worker running a 10-page statement ingestion crashes (OOM, Kubernetes pod eviction, SIGKILL) after processing 35 of 100 rows.
- **Impact:** Orphaned staging records, half-reconciled statements, stuck `PROCESSING` state in the UI.
- **Prevention:**
  1. **Batch Atomicity:** Staging rows for a statement must be written within an atomic database transaction. If the batch fails, zero rows persist.
  2. **BullMQ Stalled Job Detection:** BullMQ heartbeat lock (lock renewal every $15\text{s}$). If the worker dies, the lock expires.
  3. **Idempotent Job Handler:** When the job is re-queued, the handler begins with `DELETE FROM staging_transactions WHERE statement_id = :id AND status = 'DRAFT'`.
- **Detection:** BullMQ `stalled` event fires; Sentry catches container termination; Prometheus metric `queue_jobs_stalled_total` increments.
- **Recovery:** BullMQ re-assigns the job to a healthy worker. The new worker cleans uncommitted drafts and re-executes parsing cleanly.

---

### Scenario 4: AI Provider Times Out

- **Failure Mode:** External LLM API (Gemini/Claude/OpenAI) hangs or times out after 45s during OCR or classification.
- **Impact:** Worker threads blocked, delayed reconciliation, UI statement status stuck in `PROCESSING`.
- **Prevention:**
  1. Strict `AbortController` timeout on all external AI HTTP requests ($30\text{s}$ for classification, $60\text{s}$ for visual OCR).
  2. Circuit Breaker in `AiModelGateway` (trips if failure rate exceeds $20\%$ over a 2-minute rolling window).
  3. Provider Fallback: Primary (Gemini 1.5 Pro) &rarr; Secondary (Claude 3.5 Sonnet).
- **Detection:** OpenTelemetry span records `ai_timeout`; metric `ai_provider_timeout_total{provider="gemini"}` increments.
- **Recovery:** If all retries fail, mark statement as `EXTRACTION_FAILED` with user-facing explanation: _"Document extraction timed out with upstream provider. [Retry Extraction] or [Upload as CSV]"_.

---

### Scenario 5: AI Returns Invalid Classification

- **Failure Mode:** Model hallucinates a non-existent Chart of Accounts code (`9999 - Crypto Speculation`) or classifies an outgoing vendor expense as a Revenue account.
- **Impact:** Corrupted P&L statement, miscategorized tax liabilities.
- **Prevention:**
  1. **Schema Constrained Decoding:** Tool parameters must validate against the tenant's active account IDs via Zod enum or database lookup.
  2. **Directional Invariant Check:** A negative bank transaction (withdrawal) cannot map to a Revenue account without explicit user confirmation of an unusual customer refund.
  3. **Confidence Scoring Threshold:** Any model output with $< 95\%$ confidence is barred from auto-posting.
- **Detection:** Validation failure at Stage 1 or Stage 2 of the 6-Stage Gate. Metric `ai_classification_invalid_total`.
- **Recovery:** The proposal is created with status `AWAITING_APPROVAL`, tagged with `FLAG: UNRECOGNIZED_ACCOUNT`, and routed to the Exception Center. Human selects the proper account in 1 click.

---

### Scenario 6: AI Suggests an Invalid Journal Entry

- **Failure Mode:** Model generates an unbalanced proposal ($\sum Dr = \$120$, $\sum Cr = \$100$) or suggests negative line amounts.
- **Impact:** If posted, destroys General Ledger equality ($\sum Dr \ne \sum Cr$).
- **Prevention:**
  1. **Stage 4 Deterministic Gate:** Pure mathematical check asserts `sum(debitCents) - sum(creditCents) === 0`.
  2. **Database CHECK Constraints:**
     ```sql
     CHECK (debit_cents >= 0 AND credit_cents >= 0),
     CHECK ((debit_cents > 0 AND credit_cents = 0) OR (credit_cents > 0 AND debit_cents = 0))
     ```
  3. **Zero Agent Write Privileges:** AI agent identity cannot write to `journal_entries`.
- **Detection:** Invariant check fails immediately. `ledger_unbalanced_attempts_total` metric increments. Critical alert triggers.
- **Recovery:** Proposal is rejected and marked `FAILED_VALIDATION`. It never reaches the general ledger. The Exception Center displays: _"System blocked unbalanced proposal: Debits ($120.00) did not balance Credits ($100.00)"_.

---

### Scenario 7: Two Workers Process the Same Transaction

- **Failure Mode:** Network delay causes BullMQ to assume Worker A died; Worker B is assigned the same transaction reconciliation job while Worker A is still executing.
- **Impact:** Race condition: duplicate ledger lines or conflicting account balance mutations.
- **Prevention:**
  1. **Distributed Lock:** Distributed mutex in Redis: `SET lock:reconcile:<tx_id> <worker_id> NX EX 30`.
  2. **Database Row Lock:** Inside the transaction, execute:
     ```sql
     SELECT * FROM bank_transactions WHERE id = :id FOR UPDATE;
     ```
  3. **Unique Reconciliation Constraint:** `UNIQUE(bank_transaction_id)` prevents dual reconciliation.
- **Detection:** Worker B fails to acquire the Redis lock or blocks on the PostgreSQL row lock, subsequently failing with a unique constraint error (`23505`).
- **Recovery:** Worker B catches the conflict exception, logs an informational trace (`"Transaction already being processed"`), and exits cleanly. Worker A finishes successfully.

---

### Scenario 8: Two Users Edit the Same Accounting Record

- **Failure Mode:** Controller Alex and Bookkeeper Elena open the same invoice draft simultaneously; both apply conflicting categories and click Save at the same moment.
- **Impact:** Lost Update anomaly: the second user silently overwrites the first user's validated changes.
- **Prevention:**
  1. **Optimistic Concurrency Control (OCC):** Every mutable entity includes `version INT NOT NULL DEFAULT 1`.
  2. Update assertion:
     ```sql
     UPDATE invoices
     SET category_id = :cat, version = version + 1
     WHERE id = :id AND version = :expectedVersion;
     ```
- **Detection:** If rows updated $== 0$, throw `ConflictError` (`409`).
- **Recovery:** The second user receives a `409 Conflict` envelope: _"This record was modified by Alex. Reloading latest state."_ Elena's screen reloads and highlights the diff.

---

### Scenario 9: One Tenant Attempts to Access Another Tenant's Data

- **Failure Mode:** Malicious user in Tenant A changes an API route parameter to `/api/v1/bank-accounts/<tenant_b_uuid>` or passes a forged header.
- **Impact:** Data breach, compliance violation, cross-tenant data exposure.
- **Prevention:**
  1. **Server-Derived Context:** `TenantContext` is extracted strictly from the cryptographically verified JWT session via `AsyncLocalStorage`. Never trusted from client requests.
  2. **Query Scoping:** Every repository query forces `WHERE tenant_id = :tenantId`.
  3. **Database RLS (Defense-in-Depth):** PostgreSQL Row-Level Security blocks reads/writes where `tenant_id != current_setting('app.current_tenant_id')`.
- **Detection:** Query returns 0 rows. Application returns `404 Not Found` (never `403` to prevent ID probing). If JWT tenant does not match route organization, emit high-severity security audit event.
- **Recovery:** Request terminated. IP and user session flagged in security logs.

---

### Scenario 10: User Changes an AI-Generated Classification

- **Failure Mode:** AI classified a charge as `6100 - Software`. User changes it to `6200 - Professional Fees`.
- **Impact:** Potential regression if AI keeps making the wrong suggestion on future imports.
- **Prevention:**
  1. AI proposal is strictly a draft until approved. User modification replaces the draft lines.
  2. Modification logs an audit record: `PROPOSAL_OVERRIDDEN` with `original_account` vs `modified_account`.
  3. Continuous Learning Feedback: The modification updates the tenant's verified counterparty cache:
     ```sql
     INSERT INTO counterparty_mappings (tenant_id, payee_pattern, default_account_id, verified_by_user)
     VALUES (:tenantId, :normalizedPayee, :newAccountId, true)
     ON CONFLICT (tenant_id, payee_pattern) DO UPDATE SET default_account_id = :newAccountId;
     ```
- **Detection:** Tracked in metric `ai_proposal_user_override_total`.
- **Recovery:** The ledger entry posts with the user's selected account. Future transactions from this merchant automatically default to the human-corrected account with $99\%$ confidence.

---

### Scenario 11: Financial Correction is Required on a Posted Entry

- **Failure Mode:** An entry posted 2 weeks ago is discovered to have the wrong vendor or account code.
- **Impact:** Destructive `UPDATE` would destroy historical audit trail and alter closed period balances.
- **Prevention:**
  1. Posted journal entries are strictly immutable. PostgreSQL trigger blocks `UPDATE` or `DELETE` on `journal_entries` where `status = 'POSTED'`.
  2. Application exposes no update endpoint for posted entries.
- **Detection:** Application blocks direct edit attempts; surfaces only **"Create Reversal"**.
- **Recovery:** System posts a signed **Reversing Journal Entry** with inverted debit/credit lines (`reverses_entry_id = :oldId`) in the current open period. A new corrected entry is then posted. Both entries are linked in audit logs.

---

### Scenario 12: Payroll Calculation is Rerun

- **Failure Mode:** Controller modifies an employee bonus and re-runs the October payroll calculation after a preliminary run was already executed.
- **Impact:** Duplicate wage liabilities, double tax withholding, payroll clearing ledger out of balance.
- **Prevention:**
  1. Strict state machine on `payroll_runs`: `DRAFT` &rarr; `CALCULATING` &rarr; `AWAITING_APPROVAL` &rarr; `APPROVED` &rarr; `POSTED`.
  2. Recalculation is permitted **only** when status is `DRAFT` or `AWAITING_APPROVAL`.
  3. Once `POSTED`, the run is locked. Changes require a formal `SUPPLEMENTAL` payroll run.
  4. Unique constraint: `UNIQUE(tenant_id, pay_period_id, run_type)`.
- **Detection:** Attempting to rerun a posted payroll run throws `DomainError: "Finalized payroll run cannot be modified"`.
- **Recovery:** User is guided to create a `SUPPLEMENTAL` payroll run for the delta bonus amount.

---

### Scenario 13: Inventory Movement is Duplicated

- **Failure Mode:** Fulfillment webhook triggers twice or worker retries warehouse dispatch, attempting to deplete stock twice for the same sales order.
- **Impact:** Inventory count halved twice; COGS doubled; potential negative inventory.
- **Prevention:**
  1. Idempotency key on stock movement: `UNIQUE(tenant_id, order_id, movement_type)`.
  2. Database constraint: `CHECK (quantity >= 0)` on `stock_batches`.
  3. Atomic FIFO depletion using row-level locking (`SELECT ... FOR UPDATE` on available stock batches).
- **Detection:** Second worker hit unique constraint or throws `InsufficientInventoryError`. Metric `inventory_depletion_duplicate_total`.
- **Recovery:** Transaction rolled back. Worker returns existing stock movement record.

---

### Scenario 14: User Deletes a Document Referenced by Accounting

- **Failure Mode:** User attempts to delete a PDF bank statement or invoice receipt in the file manager while a posted journal entry references it.
- **Impact:** Broken audit trail, unbacked tax deductions, failing external audit.
- **Prevention:**
  1. Database Foreign Key: `journal_entries.source_document_id` references `documents.id` with `ON DELETE RESTRICT`.
  2. S3 Object Lock / Soft Deletion: Storage layer enforces `is_archived = true` instead of permanent S3 deletion.
- **Detection:** Database throws foreign key restriction error (`23503`).
- **Recovery:** API returns `400 Bad Request`: _"This document is attached to posted Journal Entry #1042 and cannot be deleted. It has been archived instead."_

---

### Scenario 15: Accounting Period is Closed

- **Failure Mode:** An async worker or late user approval attempts to post an entry dated September 15th after September was closed and locked on October 1st.
- **Impact:** Retroactive alterations to finalized financial statements and tax declarations.
- **Prevention:**
  1. Application assertion: `assertPeriodOpen(tenantId, entryDate)`.
  2. Checked inside the database transaction:
     ```sql
     SELECT status FROM accounting_periods
     WHERE tenant_id = :tenantId AND :entryDate BETWEEN start_date AND end_date
     FOR SHARE;
     ```
     If `status == 'LOCKED'`, throw `PeriodClosedError`.
- **Detection:** Service throws `PeriodClosedError`. Metric `period_closed_post_attempt_total`.
- **Recovery:** Entry posting is blocked. The Exception Center offers two standard accounting remedies:
  1. Post the entry to the **first day of the current open period** (GAAP standard).
  2. Authorized Controller temporarily unlocks the period (elevated permission, logged as high-severity audit event).

---

### Scenario 16: Background Job is Retried

- **Failure Mode:** BullMQ job fails due to temporary Redis disconnect and is retried 2 minutes later after partial execution.
- **Impact:** Duplicate side-effects (duplicate emails sent, duplicate webhook notifications emitted).
- **Prevention:**
  1. Job handlers check entity state upon entry:
     ```typescript
     const statement = await this.repo.findById(statementId);
     if (statement.status === 'RECONCILED') return; // Idempotent exit
     ```
  2. External side-effects (e.g., sending emails) use an idempotency table `dispatched_notifications` recording `job_id`.
- **Detection:** Log record: `JOB_ALREADY_PROCESSED_SKIPPING` with `jobId`.
- **Recovery:** Job exits successfully without re-executing mutations.

---

### Scenario 17: AI Provider Changes Model Behavior

- **Failure Mode:** Upstream provider updates foundation model weights without notice; parsing accuracy drops or output formatting shifts.
- **Impact:** Sudden drop in straight-through reconciliation rate, spike in exceptions, or degraded classification quality.
- **Prevention:**
  1. Pinned model versions (`gemini-1.5-pro-002`, `claude-3-5-sonnet-20241022`) instead of floating aliases (`gemini-latest`).
  2. Strict JSON Schema decoding (Structured Outputs).
  3. Continuous Automated Evaluation: Nightly regression test running a golden test suite of 50 varied statements against the model endpoint.
- **Detection:** Prometheus alert triggers if `reconciliation_straight_through_ratio` drops by $> 15\%$ over a 6-hour window.
- **Recovery:** `AiModelGateway` dynamically reroutes traffic to a secondary model provider via feature flag with zero application downtime.

---

### Scenario 18: Database Transaction Fails Halfway

- **Failure Mode:** Application attempts to post a 6-line journal entry; lines 1 through 5 insert successfully, but line 6 triggers a constraint failure or connection loss.
- **Impact:** Partial write: general ledger left in an unbalanced state.
- **Prevention:**
  1. Single atomic PostgreSQL transaction (`BEGIN ... COMMIT`).
  2. If any line fails, PostgreSQL issues a complete `ROLLBACK`.
  3. No application state is committed outside the database transaction.
- **Detection:** Database transaction error intercepted by NestJS transaction manager. Metric `db_transaction_aborted_total` increments.
- **Recovery:** Zero partial records exist in the database. Client receives `500 InfrastructureError`. Worker retries the entire atomic unit.

---

## 3. Production-Readiness Gap Report

While the architectural design is sound, the following **5 Critical Gaps** must be addressed before this system is production-ready:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CRITICAL GAPS REQUIRING ENGINEERING                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Distributed Lock Standard for Transaction Reconciliation (Redlock)       │
│ 2. Automated S3 Content De-duplication Checksum Pre-flight                  │
│ 3. Automated Model Drift & Golden Dataset Evaluation Pipeline (CI Eval)     │
│ 4. Transactional Outbox Relay Polling & Dead-Letter Escalation              │
│ 5. Formal Reversible Accounting Entry Workflows (Debit/Credit Memos)        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Gap 1: Distributed Lock Standard for Reconciliation

- **Finding:** While database row-level locking (`SELECT ... FOR UPDATE`) protects single records, multi-transaction reconciliation (e.g., matching 1 bank line to 3 partial invoices) can cause database deadlocks if two workers lock records in opposing orders.
- **Remedy:** Implement ordered distributed locking or sort record locks deterministically by UUID before acquiring PostgreSQL row locks.

### Gap 2: S3 Pre-Flight Checksum Validation

- **Finding:** Current upload specification accepts the file into S3 before computing the SHA-256 deduplication hash.
- **Remedy:** Enforce client-side `Content-MD5` or SHA-256 calculation passed in presigned URL headers, rejecting duplicate uploads _before_ bytes land in storage.

### Gap 3: Model Evaluation Harness

- **Finding:** Model updates by external providers can silently degrade classification precision without throwing exceptions.
- **Remedy:** Build an offline evaluation harness that benchmarks model changes against a synthetic & sanitized real-world test suite before promoting model version updates in production.

### Gap 4: Outbox Table Partitioning & Archival

- **Finding:** High transaction volume will cause `outbox_events` and `audit_events` to grow by millions of rows, potentially degrading relay polling performance.
- **Remedy:** Implement date-range partitioning (PostgreSQL declarative partitioning) on `outbox_events` and an automated archival worker moving processed events to cold storage.

### Gap 5: Formal Reversible Entry UI Workflows

- **Finding:** Accounting principles mandate that posted entries are never mutated. If a user clicks "Undo" or "Fix", the system must guide them through an intuitive Reversing Entry flow without confusing non-accountants.
- **Remedy:** Build the 1-click **"Reverse & Correct"** component blueprint into the frontend design system.

---

## 4. Items Requiring External Technical Validation

1. **Visual Document OCR Token Economics:** Validate the exact token cost and latency of processing a dense 20-page bank statement via Gemini 1.5 Pro vs. AWS Textract hybrid pipeline.
2. **PostgreSQL RLS Performance Overhead:** Benchmark query latency on tables with 10M+ rows under PostgreSQL Row-Level Security (RLS) policies to verify that index usage remains optimal.
3. **Plaid / Banking Aggregator Webhook Idempotency:** Validate third-party banking webhook delivery behaviors under network partitions to ensure bank transaction IDs are globally unique across re-connections.
