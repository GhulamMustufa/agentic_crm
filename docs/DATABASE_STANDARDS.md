# Database Engineering Standards: Agentic Business OS

**Document Status:** Authoritative Database Architecture & PostgreSQL Standards  
**Target Engine:** PostgreSQL 16+  
**ORM / Query Layer:** Prisma ORM / Kysely Query Builder  
**Authority:** Governs all relational schema design, migrations, indexes, transactions, and tenant isolation

---

## 1. Relational Schema Design & Architecture

The database architecture is designed for absolute financial consistency, strict multi-tenant isolation, and zero data loss.

### 1.1 Structural Invariants

1. **Third Normal Form (3NF) for Core Ledger:** The operational and accounting core (journal entries, lines, bank transactions, invoices) is strictly normalized to eliminate update anomalies.
2. **Materialized Views for Reporting:** Financial statements (P&L, Balance Sheet) query incremental materialized account balance tables rather than scanning millions of raw historical ledger lines on every request.
3. **Immutable Accounting Tables:** Tables recording posted financial events (`journal_entries`, `journal_entry_lines`, `audit_events`) are **append-only**. `UPDATE` and `DELETE` operations are blocked by application rules and database triggers.

---

## 2. Naming Standards

| Database Object          | Convention                       | Example                                       |
| :----------------------- | :------------------------------- | :-------------------------------------------- |
| **Tables**               | `snake_case`, Plural             | `journal_entries`, `bank_accounts`, `tenants` |
| **Primary Key Columns**  | `id` (UUID)                      | `id`                                          |
| **Foreign Key Columns**  | `singular_table_name_id`         | `tenant_id`, `bank_account_id`, `invoice_id`  |
| **Monetary Columns**     | `amount_cents` or `[name]_cents` | `amount_cents`, `debit_cents`, `credit_cents` |
| **High-Precision Rates** | `[name]_rate` or `unit_cost`     | `exchange_rate`, `unit_cost_cents`            |
| **Timestamps**           | `[verb]_at` (TIMESTAMPTZ)        | `created_at`, `updated_at`, `reconciled_at`   |
| **Date-Only Columns**    | `[name]_date` (DATE)             | `entry_date`, `due_date`, `statement_date`    |
| **Booleans**             | `is_[adjective]` or `has_[noun]` | `is_active`, `is_reconciled`, `has_receipt`   |
| **Indexes**              | `idx_{table}_{columns}`          | `idx_journal_entries_tenant_date`             |
| **Unique Constraints**   | `uq_{table}_{columns}`           | `uq_bank_accounts_tenant_number`              |
| **Foreign Keys**         | `fk_{table}_{target}`            | `fk_journal_entries_tenants`                  |

---

## 3. Primary Keys, Foreign Keys & Constraints

### 3.1 Primary Keys

- **UUID v7 (or v4):** All tables use UUID primary keys (`id UUID PRIMARY KEY DEFAULT gen_random_uuid()`).
- UUID v7 is preferred for time-ordered index locality, preventing B-tree fragmentation on high-write tables.

### 3.2 Foreign Keys & Deletion Rules

- **Explicit Foreign Key Constraints:** All relations must declare explicit foreign keys.
- **Default Deletion Rule: `ON DELETE RESTRICT`:** Never use `ON DELETE CASCADE` on financial or operational tables (`journal_entries`, `invoices`, `bank_transactions`). Deleting a parent organization or account must be blocked if historical transactions depend upon it.
- Cascading deletes (`ON DELETE CASCADE`) are permitted only for tightly coupled transient children (e.g., draft invoice line items prior to posting).

### 3.3 Check Constraints for Financial Data

Database-level `CHECK` constraints guarantee invariants even if application code contains a bug:

```sql
-- Ensure positive minor amounts
ALTER TABLE journal_entry_lines
  ADD CONSTRAINT chk_positive_debit CHECK (debit_cents >= 0),
  ADD CONSTRAINT chk_positive_credit CHECK (credit_cents >= 0),
  ADD CONSTRAINT chk_exclusive_amount CHECK (
    (debit_cents > 0 AND credit_cents = 0) OR
    (credit_cents > 0 AND debit_cents = 0)
  );
```

---

## 4. Multi-Tenant Isolation at the Database Layer

Every table (with the exception of global system tables like `system_migrations`) must enforce tenant ownership.

### 4.1 Mandatory Tenant Column

Every table must include:

```sql
tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
```

### 4.2 Compound Tenant Indexes

Indexes on tenant-scoped tables must lead with `tenant_id` to allow PostgreSQL index-only scans within the tenant partition:

```sql
CREATE INDEX idx_transactions_tenant_status_date
  ON bank_transactions (tenant_id, status, transaction_date DESC);
```

### 4.3 PostgreSQL Row-Level Security (RLS)

As a defense-in-depth measure behind the application-layer `TenantContext`, PostgreSQL Row-Level Security (RLS) is applied to all tenant-scoped tables:

```sql
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON journal_entries
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);
```

---

## 5. Monetary & Quantitative Precision

- **Integer Cents (`BIGINT`):** Authoritative monetary balances and transaction line amounts must be stored as minor currency units:
  - `$100.50` &rarr; `10050`
  - `BIGINT` prevents rounding errors, guarantees exact integer arithmetic, and supports up to $\$92$ quadrillion in minor units.
- **Fixed-Point Decimal (`NUMERIC(18, 4)`):** Used strictly for unit costs (e.g., inventory parts priced at `$0.0412` per screw) or exchange rates (`1.0842`).
- **Floating Point (`FLOAT`, `REAL`, `DOUBLE PRECISION`) is strictly forbidden** anywhere in the database schema.

---

## 6. Concurrency, Locking & Optimistic Versioning

### 6.1 Optimistic Locking

Mutable entities that may be updated concurrently (e.g., vendor profiles, draft invoices, reconcile proposals) must include a `version` column:

```sql
version INT NOT NULL DEFAULT 1
```

Application updates must assert:

```sql
UPDATE invoices
SET status = 'APPROVED', version = version + 1
WHERE id = :id AND version = :expectedVersion;
```

If 0 rows are updated, the service throws a `ConflictException` (concurrent modification).

### 6.2 Pessimistic Locking for Financial Closes

When performing operations with strict serial requirements (e.g., closing an accounting period or allocating batch inventory), use explicit pessimistic row locking:

```sql
SELECT * FROM accounting_periods
WHERE id = :periodId AND tenant_id = :tenantId
FOR UPDATE;
```

---

## 7. Migration Discipline & Zero-Downtime Schema Evolution

Database schema changes must follow **Expand-and-Contract** zero-downtime practices.

### 7.1 Migration Rules

1. **All Migrations Must Be Tested:** Test migrations both forward (`migrate up`) and reverse (`migrate down`) in CI against a real PostgreSQL instance before merging.
2. **Never Drop or Rename Columns in a Single Release:**
   - _Phase 1 (Expand):_ Add new column (nullable or with safe default). Deploy application writing to both old and new columns.
   - _Phase 2 (Backfill):_ Run background data migration script.
   - _Phase 3 (Contract):_ Deploy application reading only from new column. Drop old column in subsequent release.
3. **No Heavy Locks on Large Tables:**
   - Adding indexes on high-volume tables must use `CONCURRENTLY`:
     ```sql
     CREATE INDEX CONCURRENTLY idx_audit_logs_timestamp ON audit_logs (created_at);
     ```

---

## 8. Query Optimization & Connection Management

- **Zero N+1 Queries:** Repositories must use eager joining or batch loading (`WHERE id IN (...)`).
- **Connection Pooling:** In production, use **PgBouncer** or managed RDS Proxy to pool connections. Keep application server pools conservative (max 10-20 connections per container instance) to avoid exhausting database RAM and context-switch limits.
- **Explain Analyze Review:** Any query powering primary dashboards or tables that takes $> 50\text{ms}$ in staging must be inspected with `EXPLAIN (ANALYZE, BUFFERS)` to verify index usage.
