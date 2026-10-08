# Engineering Coding Standards: Agentic Business OS

**Document Status:** Authoritative Master Engineering Standards  
**Version:** 1.0.0  
**Scope:** Frontend, Backend, Workers, Database, AI Agents, Infrastructure, and Testing  
**Authority:** Master document governing code quality, design invariants, security, and developer discipline

---

> [!TIP]
>
> ### Coding Standards in 60 Seconds
>
> **Clean code, strict types, zero financial bugs.**
>
> 1. **Keep it simple and readable:** Avoid clever, overly complicated code tricks. Clean code that a junior developer can read in 2 minutes is always better than complex "magic".
> 2. **Strict TypeScript (`any` is banned):** Every variable, function return, and API response has a strict type. This catches bugs _before_ code ever runs in production.
> 3. **Never let AI write to balances directly:** AI suggestions must pass through strict validation code before any money changes hands or ledgers are updated.
> 4. **Fail safely:** If an operation hits an error halfway through, cancel and roll it back completely. Never leave a financial transaction half-recorded.

---

## 1. Core Engineering Principles

Engineering in the Agentic Business OS is guided by practical, battle-tested principles rather than academic theory. Our priority is correctness, security, maintainability, and clean developer speed.

### 1.1 The Invariant Principles

1. **Keep It Simple (KISS):** The simplest design that solves the problem clearly is the best design. Avoid intricate or confusing patterns.
2. **Build What You Need Now (YAGNI):** Build for current real requirements. Do not over-engineer speculative features before they are needed.
3. **Don't Repeat Yourself (DRY) — Pragmatically:** Avoid duplicate business rules. However, if two small pieces of code look similar but represent different business concepts, prefer simple duplication over a confusing, over-complicated shared abstraction.
4. **SOLID Principles:**
   - **Single Responsibility (SRP):** A class, service, or function should have one reason to change. Separate invoice tax calculation from invoice PDF generation.
   - **Open/Closed:** Core accounting workflows must be open for extension (e.g., adding a new document parser) but closed for modification (the core ledger engine remains untouched).
   - **Liskov Substitution:** Subtypes or interchangeable implementations (e.g., local storage vs. S3 bucket client) must honor identical contracts and behavioral invariants.
   - **Interface Segregation:** Prefer small, client-specific interfaces over monolithic contracts.
   - **Dependency Inversion (DIP):** High-level domain workflows depend upon abstractions, not concrete database drivers or external API SDKs.
5. **Composition Over Inheritance:** Avoid class inheritance hierarchies deeper than one level. Favor functional composition, dependency injection, and interface implementation.
6. **Explicit Over Implicit:** Magic auto-wiring, global mutable state, implicit type coercion, and dynamic runtime monkey-patching are prohibited. Dependencies, configuration, and data transformations must be transparent.
7. **Least Privilege & Secure by Default:** Every service, database role, API token, and AI agent operates with the absolute minimum access required to perform its function. Default to deny.
8. **Fail Safely & Deterministically:** When an unexpected condition occurs, the system must halt the affected transaction, rollback uncommitted state, emit structured diagnostic logs, and surface a recoverable failure. Never leave financial state half-mutated.

---

## 2. TypeScript Standards

All code across the repository (frontend, backend, workers, scripts) must be written in **strict TypeScript**.

### 2.1 Compiler & Configuration Rules

- `strict: true` must be enabled across all `tsconfig.json` configurations.
- `noImplicitAny: true`, `strictNullChecks: true`, `noImplicitReturns: true`, and `noFallthroughCasesInSwitch: true` are non-negotiable.
- `skipLibCheck: true` is allowed for build performance, but application code must be fully type-checked.

### 2.2 Type System Discipline

- **`any` is strictly prohibited.** Pull requests introducing `any` or `as any` will be rejected by CI lint rules. If an external library lacks typings, write a type declaration file (`.d.ts`) or wrap it with an explicit schema.
- **Avoid `unknown` unless narrowed immediately:** Use `unknown` for raw, untrusted boundary data (e.g., webhook bodies, JSON parse results), but it must immediately pass through a Zod schema or type guard before use.
- **Explicit Return Types for Public APIs:** All service methods, controller actions, exported utilities, and repository queries must declare explicit return types. Do not rely on type inference for exported boundaries.
- **Discriminated Unions for Domain States:** Model complex states using tagged/discriminated unions rather than sprawling optional fields:
  ```typescript
  // BAD: Sprawling optional fields
  interface TransactionProposal {
    status: 'pending' | 'approved' | 'rejected';
    approvedAt?: Date;
    approverId?: string;
    rejectionReason?: string;
  }

  // GOOD: Discriminated Union
  type TransactionProposal =
    | { status: 'PENDING'; proposalId: string; generatedAt: Date }
    | { status: 'APPROVED'; proposalId: string; approvedAt: Date; approverId: string }
    | { status: 'REJECTED'; proposalId: string; rejectedAt: Date; rejectionReason: string };
  ```
- **No Unjustified Non-Null Assertions (`!`):** The non-null assertion operator (`foo!.bar`) is forbidden unless preceded by an explicit invariant assertion function or within isolated test fixtures.
- **Enums vs. String Unions:** Prefer `const` objects with `as const` or string literal unions over TypeScript numeric `enum` to preserve clean JS compilation and serialization compatibility:
  ```typescript
  export const AccountType = {
    ASSET: 'ASSET',
    LIABILITY: 'LIABILITY',
    EQUITY: 'EQUITY',
    REVENUE: 'REVENUE',
    EXPENSE: 'EXPENSE',
  } as const;

  export type AccountType = (typeof AccountType)[keyof typeof AccountType];
  ```

---

## 3. Naming Standards

Names must communicate business intent, not transient implementation details.

### 3.1 Casing Conventions

| Artifact                         | Convention                                  | Example                                                       |
| :------------------------------- | :------------------------------------------ | :------------------------------------------------------------ |
| **Files & Folders (Backend)**    | `kebab-case`                                | `bank-statement.service.ts`, `reconcile-transaction/`         |
| **Files & Folders (Frontend)**   | `kebab-case` or `PascalCase` for Components | `button.tsx`, `ExceptionCard.tsx`, `use-reconciliation.ts`    |
| **Classes & Interfaces**         | `PascalCase`                                | `JournalEntryRepository`, `BankStatementParser`               |
| **Types & Discriminated Unions** | `PascalCase`                                | `TransactionStatus`, `ReconciliationResult`                   |
| **Functions & Methods**          | `camelCase` (Verb-first)                    | `calculateGrossPay()`, `validateLedgerBalance()`              |
| **Variables & Properties**       | `camelCase`                                 | `openingBalance`, `vendorInvoice`                             |
| **Constants & Enums**            | `UPPER_SNAKE_CASE`                          | `MAX_RETRY_ATTEMPTS`, `DEFAULT_CURRENCY`                      |
| **Database Tables**              | `snake_case` (Plural)                       | `journal_entries`, `bank_accounts`, `tenants`                 |
| **Database Columns**             | `snake_case`                                | `tenant_id`, `created_at`, `amount_cents`                     |
| **API Endpoints**                | `kebab-case` (Plural nouns)                 | `POST /api/v1/bank-statements`, `GET /api/v1/journal-entries` |
| **DTOs**                         | `PascalCase` ending in `Dto`                | `CreateInvoiceDto`, `ReconcileTransactionDto`                 |
| **Domain Events**                | `PascalCase` (Past tense noun)              | `TransactionReconciledEvent`, `InvoiceVoidedEvent`            |
| **CQRS Commands**                | `PascalCase` (Imperative verb)              | `PostJournalEntryCommand`, `IngestStatementCommand`           |
| **CQRS Queries**                 | `PascalCase` (Query prefix/suffix)          | `GetTrialBalanceQuery`, `FindExceptionsQuery`                 |
| **React Components**             | `PascalCase`                                | `TransactionTable`, `ExceptionDrawer`                         |
| **React Custom Hooks**           | `camelCase` starting with `use`             | `useAccountBalance()`, `useTheme()`                           |
| **AI Agents & Tools**            | `PascalCase` for Agent, `snake_case` Tool   | `AccountantAgent`, `extract_bank_statement_lines`             |

### 3.2 Banned Vague Names

Do not use generic, context-free identifiers. The following names are banned unless isolated within generic algorithmic utilities:

- `data`, `info`, `item`, `thing`, `obj`
- `manager`, `handler`, `processor`, `helper`, `utils`, `misc`
- `handleStuff()`, `doProcess()`, `runTask()`

_Instead, use intent-revealing names:_  
`unreconciledBankLines`, `StatementParsingPipeline`, `matchInvoiceToDisbursement()`.

---

## 4. Function & Method Design

Functions must be small, predictable, and single-purpose.

### 4.1 Function Guidelines

- **Target Size:** Aim for functions under 40 lines. If a function exceeds 60 lines, review it for distinct responsibilities and extract helper sub-functions.
- **Parameter Count:** Maximum 3 positional parameters. For 4 or more arguments, use a typed options/parameter object.
- **Pure Functions for Core Logic:** Isolate mathematical calculations, state transformations, and tax formulas into pure functions with zero I/O side effects.
- **Early Returns (Guard Clauses):** Avoid deep `if/else` nesting. Validate inputs and preconditions upfront, returning early or throwing defined domain exceptions:
  ```typescript
  // BAD: Deeply nested pyramid of doom
  function postEntry(entry: JournalEntry) {
    if (entry) {
      if (entry.lines.length > 0) {
        if (isBalanced(entry)) {
          // core logic...
        }
      }
    }
  }

  // GOOD: Guard clauses
  function postEntry(entry: JournalEntry): LedgerPostingResult {
    if (!entry || entry.lines.length === 0) {
      throw new EmptyJournalEntryException();
    }
    if (!isBalanced(entry)) {
      throw new UnbalancedJournalEntryException(entry.delta);
    }
    // Clean core posting logic follows...
  }
  ```
- **No Surprising Mutations:** Never mutate parameters passed into a function. Return fresh objects or copies.

---

## 5. Error Handling Architecture

Error handling must be intentional, structured, and safe. Silently swallowing errors is considered a critical bug.

### 5.1 The Error Taxonomy

All errors in the application inherit from a base `AppError`:

1. **`DomainError`:** Invariant violations, business logic blocks (e.g., `PeriodClosedException`, `UnbalancedEntryException`). HTTP status: `422 Unprocessable Entity` or `400 Bad Request`.
2. **`ValidationError`:** Malformed request schemas, invalid formats, unparsable dates. HTTP status: `400 Bad Request`.
3. **`AuthenticationError`:** Missing, expired, or invalid credentials. HTTP status: `401 Unauthorized`.
4. **`AuthorizationError`:** Authenticated user or agent lacks permission for the tenant or resource. HTTP status: `403 Forbidden`.
5. **`NotFoundError`:** Resource does not exist within the tenant's scope. HTTP status: `404 Not Found`.
6. **`ConflictError`:** Idempotency key collision, concurrent version mismatch. HTTP status: `409 Conflict`.
7. **`InfrastructureError`:** Database timeouts, S3 failures, Redis disconnects. HTTP status: `500 Internal Server Error` (masked from client).
8. **`ExternalServiceError`:** Third-party API failure (e.g., OpenAI, Stripe, Plaid). Marked retryable or terminal.

### 5.2 Mandatory Error Rules

- **Never Swallow Errors:** Empty `catch {}` blocks are strictly forbidden. Catch blocks must either handle, log with context, wrap, or rethrow.
- **No Stack Traces to Clients:** In production, clients receive standardized, sanitized error envelopes:
  ```json
  {
    "statusCode": 422,
    "errorCode": "LEDGER_UNBALANCED",
    "message": "The proposed journal entry debits do not equal credits.",
    "correlationId": "req_88f912b3",
    "timestamp": "2026-10-04T15:30:00Z"
  }
  ```
- **Preserve Error Cause Chains:** When wrapping low-level errors into domain exceptions, use the ES2022 `cause` property:
  ```typescript
  try {
    await this.s3Client.send(command);
  } catch (err) {
    throw new DocumentStorageException('Failed to upload bank statement artifact', { cause: err });
  }
  ```

---

## 6. Asynchronous Programming Standards

Asynchronous execution must be resilient against timeouts, memory leaks, and cascading network failures.

- **Always Handle Rejections:** Every Promise must have an `await` within a `try/catch` or an explicit `.catch()` handler. Unhandled promise rejections will terminate worker processes.
- **Avoid Unnecessary Sequential Awaits:** Independent I/O operations should run concurrently:
  ```typescript
  // BAD: 600ms sequential latency
  const accounts = await this.getAccounts(tenantId);
  const periods = await this.getOpenPeriods(tenantId);

  // GOOD: 300ms parallel execution
  const [accounts, periods] = await Promise.all([
    this.getAccounts(tenantId),
    this.getOpenPeriods(tenantId),
  ]);
  ```
- **Controlled Concurrency for Batch Operations:** Never run `Promise.all()` over an unbounded list (e.g., 5,000 transactions). Use chunking or a concurrency limiter (`p-limit`, BullMQ worker pools) to prevent connection pool exhaustion.
- **Enforce Timeouts on External Calls:** All HTTP and external AI provider requests must specify an explicit timeout (e.g., $15\text{s}$ for standard APIs, $45\text{s}$ for visual LLM statement parsing) via `AbortController`.
- **Idempotent Background Jobs:** All worker jobs (BullMQ) must be idempotent. If a worker crashes and retries a bank statement ingestion job, it must not create duplicate transactions.

---

## 7. Input Validation & System Boundaries

Compile-time TypeScript types vanish at runtime. All untrusted external inputs must pass strict schema validation at the system boundary using **Zod** or **Class-Validator**.

### 7.1 What Must Be Validated

- All REST/GraphQL request bodies, query parameters, and route parameters.
- All parsed CSV, OFX, and PDF extracted tabular structures.
- All AI model outputs and tool invocation arguments.
- All incoming webhook payloads (Stripe, banks).
- All environment variables loaded at startup (`process.env`).

### 7.2 Boundary Validation Rule

- Validate at the ingress boundary (Controller / Ingestion Pipeline / Worker Entry).
- Once data is parsed into a validated domain model, internal trusted domain methods do not need redundant defensive re-validation.

---

## 8. Configuration & Environment Variables

- **Zero Hard-Coded Secrets:** API keys, database passwords, signing secrets, and webhook secrets must **never** appear in source code or default configuration files.
- **Fail-Fast Startup Validation:** Environment variables must be validated on application bootstrap using a typed schema (e.g., `Zod` or `@nestjs/config` with Joi). If `DATABASE_URL` or `JWT_SECRET` is missing, the service must immediately terminate with a clear log message.
- **Tenant-Specific Settings in Database:** System-level flags belong in environment variables; tenant-specific rules (e.g., auto-posting approval dollar threshold) belong in the database `tenant_settings` table.

---

## 9. Security & Multi-Tenant Isolation

### 9.1 The Tenant Isolation Invariant

- **Tenant Context is Immutable & Server-Derived:** The `tenant_id` must **never** be accepted from a client request body, query parameter, or mutable header in multi-tenant operations. It is extracted strictly from the cryptographically verified JWT / session context on the server.
- **Query-Level Scoping:** Every database query targeting tenant-owned data must include `WHERE tenant_id = :tenantId`.
- **Zero Cross-Tenant Leakage:** Integration tests must continuously verify that Organization A cannot view, mutate, or reference records belonging to Organization B, even if Organization A guesses valid record UUIDs.

### 9.2 Defense-in-Depth

- **SQL Injection Prevention:** Use parameterized queries or ORM query builders (Prisma, Kysely, TypeORM) exclusively. Raw string concatenation in SQL is strictly forbidden.
- **XSS Prevention:** In the frontend, never use `dangerouslySetInnerHTML` without rigorous HTML sanitization (`DOMPurify`).
- **Rate Limiting:** Protect all public API routes and authentication endpoints with IP and tenant-level rate limiting (`@nestjs/throttler` or Redis token bucket).
- **Safe File Uploads:** Uploaded bank statements must be inspected for file size, MIME-type, and magic bytes before storage. Stored in isolated S3 buckets with restricted presigned URLs.

---

## 10. Financial Domain & Ledger Standards

Financial accounting demands an order of magnitude higher standard of correctness than typical SaaS CRUD features.

### 10.1 Inviolable Financial Rules

1. **Never Use Floating Point Numbers for Money:** Never store or calculate currency values using JavaScript `number` (IEEE 754 float).
   - **Database:** Store monetary values as `BIGINT` representing minor currency units (cents, e.g., `$100.50` stored as `10050`) or `NUMERIC(18, 4)` for high-precision unit costing.
   - **Application:** Use fixed-point integer math or dedicated libraries (e.g., `decimal.js`, `dinero.js`).
2. **Double-Entry Equality Invariant:** Every journal entry must strictly balance:
   $$\sum \text{Debits} - \sum \text{Credits} = 0$$
   A database transaction that attempts to persist an unbalanced journal entry must be aborted by application logic and constrained by database triggers/checks.
3. **Immutable Historical Records:** Once a journal entry is posted to a closed period or reconciled, it is **immutable**. It cannot be updated or deleted (`UPDATE` and `DELETE` queries are prohibited).
4. **Correction via Reversal Entries:** To fix a mistake in a posted entry, post a formal reversing entry or an adjustment entry with full cross-referencing audit notes.

---

## 11. AI & Autonomous Agent Standards

AI agents in the Agentic Business OS are controlled business tools, not autonomous black boxes with open-ended capabilities.

### 11.1 The Deterministic vs. AI Separation of Concerns

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            PROBABILISTIC / AI DOMAIN                        │
│                                                                             │
│  • Document OCR & Layout Extraction       • Semantic Vendor Matching        │
│  • Transaction Category Suggestions      • Anomaly Hypothesis Generation   │
│  • Natural-Language Explanations         • Extraction Confidence Scoring    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Proposals & Drafts Only (Untrusted)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STRICT 6-STAGE FINANCIAL VALIDATION GATE                 │
│                                                                             │
│  1. Zod Schema Validation ─────────> Check structure, types, and boundaries │
│  2. Business Rule Validation ──────> Account active? Policy allows auto-post?│
│  3. RBAC & Tenant Verification ────> Tenant match? Agent authorized?       │
│  4. Deterministic Ledger Math ─────> sum(Debits) == sum(Credits) == 0       │
│  5. Database Transaction Boundary ─> Atomically write ledger & recon status │
│  6. Immutable Audit Log Trail ─────> Record agent, prompt version & score   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Approved & Verified
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     DETERMINISTIC GENERAL LEDGER ENGINE                     │
│                                                                             │
│  • Authoritative Balances                • Strict Period Closes             │
│  • Financial Reports (P&L, Balance Sheet) • Immutable Audit History         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Agent Constraints & Rules

- **No Direct Ledger Write Privileges:** AI agents never have direct write access to the `journal_entries` or `accounts` tables. Agents write candidate records to a `proposals` staging table.
- **Strict Tool Schemas:** All agent tools must define explicit JSON/Zod schemas for parameters. Tool inputs and outputs are validated before and after execution.
- **Execution & Token Budgets:** Every agent execution loop must have a hard boundary on iterations (e.g., maximum 5 tool calls per task) and execution timeout ($30\text{s}$). Infinite loops or chain-of-thought runaways must be caught and killed.
- **Auditable Agent Signatures:** Every automated action must log:
  - `agentId`: System identifier of the agent model.
  - `modelName`: Exact foundation model version (e.g., `gemini-1.5-pro-002`).
  - `confidenceScore`: Normalized score ($0.00 - 1.00$).
  - `rationale`: Plain-text explanation of why the action was suggested.

---

## 12. Logging, Observability & Tracing

### 12.1 Structured JSON Logging

All application logs in production must be formatted as structured JSON written to `stdout`.

#### Standard Log Schema

```json
{
  "timestamp": "2026-10-04T15:30:00.123Z",
  "level": "INFO",
  "message": "Bank statement successfully ingested and parsed",
  "context": "BankStatementService",
  "tenantId": "org_7f8a91b2",
  "userId": "usr_3b91c84f",
  "correlationId": "req_c9201948",
  "statementId": "stmt_019284",
  "transactionCount": 48,
  "durationMs": 412
}
```

### 12.2 Prohibited Log Data

To comply with SOC 2, GDPR, and PCI-DSS standards, the following data must **never** be logged:

- Passwords, password hashes, and PINs.
- Bearer tokens, JWTs, and session cookies.
- Full bank account numbers and credit card numbers (truncate to last 4 digits: `...4092`).
- Unencrypted Social Security Numbers or Tax IDs.

---

## 13. Testing Standards

Every layer of the application must be backed by automated tests. Tests are not optional; code without tests will not be merged.

### 13.1 Testing Pyramid

1. **Unit Tests (Jest / Vitest):**
   - Target: Pure business logic, accounting formulas, tax tables, Zod validators, React hooks.
   - Requirement: 100% deterministic, zero network or database dependencies, execution in milliseconds.
2. **Integration Tests (NestJS TestContainers / Supertest):**
   - Target: Repositories, database transactions, API controllers, worker pipelines.
   - Requirement: Run against a real PostgreSQL and Redis instance (via Docker/TestContainers), validating actual migrations and constraints.
3. **End-to-End (E2E) & Workflow Tests (Playwright):**
   - Target: Critical user journeys: bank statement upload &rarr; AI parsing &rarr; exception triage &rarr; ledger post &rarr; balance sheet verification.
   - Requirement: Must run against clean isolated tenant fixtures in staging/CI.

### 13.2 Financial Testing Invariant

The General Ledger double-entry engine and bank reconciliation logic must include generative property-based tests (e.g., `fast-check`) verifying that for thousands of randomized multi-currency entries, debits and credits always maintain strict mathematical equality.

---

## 14. Performance & Scalability Discipline

- **No Premature Optimization:** Focus first on clean domain design and database constraints.
- **Eliminate N+1 Queries:** Use eager joining or dataloaders (`DataLoader`, NestJS QueryBuilder joins) when fetching related entities (e.g., invoices with their line items and tax codes).
- **Unbounded Queries Forbidden:** Every query returning a list must enforce pagination with a strict maximum `limit` (default: 25, max: 100). Never execute `SELECT * FROM transactions` without a `tenant_id` and `LIMIT`.
- **Offload Heavy Work to Background Workers:** Statement OCR, batch reconciliation, and PDF export must run in asynchronous BullMQ workers, returning a job ticket (`202 Accepted`) to the HTTP client.

---

## 15. Dependency Management & Hygiene

- **Strict Dependency Vetting:** Before running `npm install <package>`, the engineer must verify:
  1. Does an existing library in the workspace already solve this?
  2. Is the package actively maintained (commits within the last 6 months)?
  3. Does it have an enterprise-friendly open-source license (MIT, Apache 2.0, BSD)?
  4. What is the bundle size impact? (Avoid heavyweight packages for trivial utilities).
- **Zero Dead Code Policy:** Unused imports, orphaned files, commented-out code blocks, and obsolete feature flags must be purged immediately. CI checks (`eslint-plugin-unused-imports`) will enforce this automatically.

---

## 16. AI-Assisted Code Quality Guarantee

AI coding assistants (including Antigravity, Claude, Copilot, ChatGPT) are used as productivity accelerators. However:

1. **Engineers are 100% Responsible:** The human engineer who commits code is solely responsible for every line, edge case, and potential vulnerability.
2. **No Hallucinated Packages:** Check package manifests before committing. Never import non-existent libraries suggested by LLMs.
3. **Mandatory Local Verification:** Before committing code generated or modified with AI assistance, engineers must verify:
   ```bash
   npm run lint
   npm run typecheck
   npm run test
   npm run build
   ```
