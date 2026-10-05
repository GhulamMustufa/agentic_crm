# Error Handling Architecture & Taxonomy: Agentic Business OS

**Document Status:** Authoritative Error Handling Specification  
**Version:** 1.0.0  
**Authority:** Governs error propagation, classification, retries, and recovery across all system layers

---

## 1. Unified Error Taxonomy

Every error across the frontend, backend, workers, and AI agents falls into one of eight standardized classifications:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             APP ERROR BASE CLASS                            │
│  Properties: errorCode, message, statusCode, isRetryable, details, cause    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Inherited By
                                       ▼
┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│   DomainError    │ ValidationError  │    AuthError     │  ConflictError   │
│  (Business Rule) │ (Schema/Format)  │  (AuthN & AuthZ) │ (Lock/Version)   │
├──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│   InfraError     │ ExternalApiError │ AIProviderError  │  JobWorkerError  │
│  (DB, S3, Redis) │ (Stripe, Plaid)  │  (OpenAI/Gemini) │ (BullMQ Queue)   │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘
```

### 1.1 Detailed Error Categories

| Error Classification   | Description                                                                            | HTTP Status                               | Retryable?         | Example Trigger                                                                   |
| :--------------------- | :------------------------------------------------------------------------------------- | :---------------------------------------- | :----------------- | :-------------------------------------------------------------------------------- |
| **`DomainError`**      | Core business invariant or accounting rule violation.                                  | `422 Unprocessable Entity`                | No                 | Posting an entry where $\sum Dr \ne \sum Cr$; posting to a locked fiscal period.  |
| **`ValidationError`**  | Ingress data schema mismatch, invalid field format, missing required parameter.        | `400 Bad Request`                         | No                 | Invalid date string, negative debit amount, malformed UUID.                       |
| **`AuthError`**        | Authentication failure (`401`) or authorization / tenant membership denial (`403`).    | `401 Unauthorized` / `403 Forbidden`      | No                 | Expired JWT, insufficient RBAC role, cross-tenant resource tampering.             |
| **`ConflictError`**    | Concurrency version mismatch, state machine race condition, duplicate idempotency key. | `409 Conflict`                            | Yes (with backoff) | Concurrent modification of an invoice draft; concurrent period closure attempt.   |
| **`InfraError`**       | Database connection timeout, Redis crash, S3 network disruption.                       | `500 Internal Server Error` (Masked)      | Yes                | PostgreSQL connection pool saturation, transient network partition.               |
| **`ExternalApiError`** | Failure communicating with upstream vendor or banking API.                             | `502 Bad Gateway` / `504 Gateway Timeout` | Contextual         | Plaid token invalid (No); Stripe API 503 rate limit (Yes).                        |
| **`AIProviderError`**  | LLM API rate limit, context window overflow, hallucinated invalid JSON output.         | `502 Bad Gateway`                         | Contextual         | Model outputs unparsable JSON (Retry with correction prompt); Context limit (No). |
| **`JobWorkerError`**   | Background asynchronous job failure in BullMQ.                                         | N/A (Logged/Queued)                       | Contextual         | Corrupt bank statement PDF (Terminal &rarr; Route to Exception Center).           |

---

## 2. End-to-End Error Flow Across System Layers

Errors travel through distinct boundaries. Each boundary has explicit responsibilities for transformation, logging, and sanitization:

```
[ Frontend Client ]
       ▲
       │ 6. Sanitized JSON Envelope (Correlation ID + Plain Error Message)
       ▼
[ HTTP API Layer (Controller / Filter) ]
       ▲
       │ 5. Catches Domain & Infra Errors, Maps Status, Emits Audit Log
       ▼
[ Application & Domain Layer (Services) ]
       ▲
       │ 4. Validates Invariants, Throws DomainError or Re-wraps InfraError
       ▼
[ Infrastructure Layer (Repositories & Adapters) ]
       ▲
       │ 3. Catches Driver Exceptions, Wraps in Typed InfraError with ES2022 cause
       ▼
[ Background Workers & AI Agents (BullMQ / LLM) ]
       ▲
       │ 1. AI Output Validation Failure ───> 2. Structured Retry / Exception Center Route
```

### 2.1 Layer Responsibilities

#### Layer 1: AI Agent & Tool Execution

- **Behavior on Failure:** Never let an unhandled model error crash the runtime.
- If a model returns malformed JSON or invalid tool arguments:
  - Attempt 1 programmatic repair with a structured correction prompt.
  - If the second attempt fails, catch the error, mark the proposal as `FAILED`, and route the raw document directly to the **Exception Center** for human review.

#### Layer 2: Background Workers (BullMQ)

- **Retry Strategy:**
  - **Transient Errors (Network, DB lock):** Retry up to 3 times with exponential backoff:
    $$\text{delay} = 2^{\text{attempt}} \times 1000\text{ms} + \text{jitter}$$
  - **Deterministic Errors (Corrupt PDF, Unparseable format):** Mark job terminal immediately. Do not waste compute on infinite retries. Post an exception notification to the tenant's workspace.

#### Layer 3: Infrastructure Adapters (Database, Storage, External APIs)

- Catch raw library exceptions (e.g., `PrismaClientKnownRequestError`, `AwsClientError`).
- Wrap into typed application exceptions preserving the root error via ES2022 `cause`:
  ```typescript
  try {
    return await this.prisma.journalEntry.create(...);
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictError('A journal entry with this reference already exists', { cause: error });
    }
    throw new DatabaseInfrastructureError('Database write failed', { cause: error });
  }
  ```

#### Layer 4: Application & Domain Layer

- Pure domain exceptions carry complete accounting context (e.g., `UnbalancedJournalEntryError` carries `debitTotal`, `creditTotal`, and `discrepancyCents`).
- Services ensure uncommitted database transactions are rolled back immediately before propagating errors.

#### Layer 5: Presentation & Global Exception Filter

- Intercepts all unhandled exceptions.
- Maps domain errors to semantic HTTP status codes (`400`, `401`, `403`, `404`, `409`, `422`).
- Logs internal 500 errors with full stack traces and correlation IDs.
- **Sanitization:** Masks raw SQL errors, stack traces, and database schemas from external clients. Returns standard RFC 7807 JSON.

#### Layer 6: Frontend Client Layer

- **Field-Level Errors:** Forms display validation messages directly beneath the corresponding input field.
- **Optimistic Rollback:** Mutations that fail roll back optimistic UI updates immediately, alerting the user via toast:
  _"Unable to approve entry. Period is locked for edits. [Refresh]"_
- **Full-Page Crash Prevention:** Critical page sub-trees are wrapped in React `ErrorBoundary` components to ensure a broken chart or widget does not crash the entire application navigation.
