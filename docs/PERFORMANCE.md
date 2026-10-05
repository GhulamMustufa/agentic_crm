# Performance Standards & Scalability Guidelines: Agentic Business OS

**Document Status:** Authoritative Performance Specifications & Optimization Guidelines  
**Version:** 1.0.0  
**Authority:** Governs latency targets, caching tiers, concurrency limits, and database query budgets

---

## 1. System Latency Targets & Budgets

Performance budgets ensure the application remains fast and responsive under operational load.

| Layer / Operation          | Target Metric                   | Target Benchmark                                                         | Measurement Strategy                    |
| :------------------------- | :------------------------------ | :----------------------------------------------------------------------- | :-------------------------------------- |
| **Frontend Page Load**     | Largest Contentful Paint (LCP)  | $< 2.0\text{ seconds}$                                                   | Real User Monitoring (RUM) / Lighthouse |
| **Frontend Interaction**   | Interaction to Next Paint (INP) | $< 100\text{ ms}$                                                        | Web Vitals instrumentation              |
| **Frontend Layout Shift**  | Cumulative Layout Shift (CLS)   | $< 0.05$                                                                 | Web Vitals instrumentation              |
| **Synchronous Read APIs**  | $p95$ Latency                   | $< 150\text{ ms}$                                                        | API Gateway Prometheus Histogram        |
| **Synchronous Write APIs** | $p95$ Latency                   | $< 250\text{ ms}$                                                        | API Gateway Prometheus Histogram        |
| **Database Queries**       | Execution Time                  | $< 20\text{ ms}$ ($< 50\text{ ms}$ for reporting)                        | PostgreSQL `pg_stat_statements`         |
| **Worker Statement OCR**   | 10-Page Statement Ingestion     | _Target to establish via benchmark testing_ (Tentative: $30-60\text{s}$) | Worker Job Duration Timer               |
| **AI Classification Tool** | Single-Line Proposal Latency    | _Target to establish via benchmark testing_ (Tentative: $< 1.5\text{s}$) | OpenTelemetry Tool Span Duration        |

---

## 2. Frontend Performance & Asset Optimization

1. **JavaScript Bundle Budgets:** Initial client bundle for the dashboard shell must remain $< 150\text{ KB}$ gzipped.
2. **Lazy Loading Heavy Primitives:**
   - Statement PDF viewer, large report charting widgets, and export generators must be loaded dynamically using Next.js `dynamic()` with fallback skeletons.
3. **Optimistic UI Mutations:** Approving an exception proposal or marking an invoice paid must reflect in the UI in $< 50\text{ms}$ optimistically, rolling back only on server failure.
4. **Preventing Re-Render Thrashing:**
   - Large financial data tables ($> 50$ rows) must use virtualized scrolling (`@tanstack/react-virtual`) if rendered without pagination.

---

## 3. Database Optimization & Query Hygiene

1. **Unbounded Queries Strictly Forbidden:** Every `SELECT` query returning a collection must enforce an explicit `LIMIT` (default: 25, maximum allowable: 100).
2. **Partial Indexes for Queue Workloads:**
   - Optimize the Exception Center query by indexing only unresolved rows:
     ```sql
     CREATE INDEX idx_proposals_pending_exceptions
       ON proposals (tenant_id, priority, created_at)
       WHERE status = 'PENDING';
     ```
3. **Eager Joining & Dataloaders:** Always fetch nested relationships (e.g., Journal Entry &rarr; Lines &rarr; Accounts) using joined relations or batch dataloaders to eliminate N+1 query cascades.
4. **Connection Pool Bounds:** Application containers must limit connection pool size to $10 - 20$ connections per instance to prevent exhausting PostgreSQL server RAM.

---

## 4. Multi-Tier Caching Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TIER 1: HTTP / BROWSER CACHE                      │
│  Static assets, fonts, icons (Immutable, Cache-Control: max-age=31536000)   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       TIER 2: REDIS DISTRIBUTED CACHE                       │
│  • Chart of Accounts hierarchy (TTL: 1h, Invalidated on COA edit)          │
│  • Tenant settings & active fiscal periods (TTL: 24h, Event-invalidated)    │
│  • Session & RBAC permissions (TTL: 15m)                                    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  TIER 3: DATABASE MATERIALIZED BALANCES                     │
│  Materialized monthly account balances updated on ledger post               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Caching Invariants

- **Tenant-Prefixed Keys:** Every Redis key must start with `cache:<tenant_id>:` to prevent accidental cross-tenant data pollution.
- **Never Cache Unreconciled Ledger Balances Without TTL:** Live cash position caches must have short TTLs ($< 60\text{s}$) or be invalidated synchronously on journal posting.

---

## 5. Background Workers & Queue Concurrency

1. **BullMQ Concurrency Limits:** Statement extraction workers are concurrency-capped (e.g., max 5 concurrent OCR jobs per worker process) to avoid CPU starvation and third-party AI rate limits.
2. **Batch Ingestion:** When writing parsed transactions to the database, use batch inserts (`INSERT INTO bank_transactions ... VALUES (...), (...)`) in chunks of 100 rows rather than executing 100 individual SQL inserts.
3. **Queue Prioritization:** BullMQ queues are partitioned into priority tiers:
   - Priority 1 (High): User-triggered single-transaction approvals.
   - Priority 2 (Standard): 10-page bank statement parsing jobs.
   - Priority 3 (Low): Nightly recurring materialized report aggregations.
