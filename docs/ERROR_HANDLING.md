# Error Handling Architecture & Taxonomy: Agentic Business OS

**Document Status:** Authoritative Error Handling Specification  
**Version:** 1.0.0  
**Authority:** Governs error propagation, classification, retries, and recovery across all system layers

---

> [!TIP]
>
> ### Error Handling in 60 Seconds
>
> **Errors are classified into 4 simple real-world groups:**
>
> 1. **Accounting Rule Errors (`DomainError` - 422):** The action is mathematically or legally impossible (e.g. Total Debits don't equal Total Credits, or trying to edit a closed tax year). _Cannot be retried without fixing the numbers._
> 2. **Bad Form Data (`ValidationError` - 400):** A required field was missing or formatted incorrectly (e.g. an invalid date or negative price).
> 3. **Simultaneous Edit Conflict (`ConflictError` - 409):** Two teammates tried to update the same invoice at the exact same millisecond. _System automatically pauses and safely retries._
> 4. **Temporary Network Glitches (`InfraError` / `ExternalApiError`):** An external service (Stripe or cloud database) took too long to respond. _System retries automatically with exponential backoff._

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
│  (Business Rule) │ (Form/Format)    │  (Login/Access)  │ (Simultaneous)   │
├──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│   InfraError     │ ExternalApiError │ AIProviderError  │  JobWorkerError  │
│  (DB, S3, Redis) │ (Stripe, Plaid)  │  (OpenAI/Gemini) │ (Background Job) │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘
```

### 1.1 Detailed Error Categories in Plain English

| Error Classification   | What Happened (Plain English)                              | HTTP Code            | Safe to Auto-Retry? | Real-World Example                                                                      |
| :--------------------- | :--------------------------------------------------------- | :------------------- | :------------------ | :-------------------------------------------------------------------------------------- |
| **`DomainError`**      | An accounting rule or invariant was broken.                | `422 Unprocessable`  | No (Requires fix)   | Debits don't equal Credits ($\sum Dr \ne \sum Cr$); trying to edit a closed tax period. |
| **`ValidationError`**  | Form data was missing or formatted incorrectly.            | `400 Bad Request`    | No (Requires fix)   | Negative price entered, missing customer name, invalid date string.                     |
| **`AuthError`**        | User is not logged in (`401`) or lacks permission (`403`). | `401 / 403`          | No                  | Expired login token, trying to view another company's records.                          |
| **`ConflictError`**    | Simultaneous edits or duplicate submission detected.       | `409 Conflict`       | Yes (Auto-retried)  | Two teammates clicked "Save" on the same invoice at the exact same millisecond.         |
| **`InfraError`**       | Temporary database or cloud connection hiccup.             | `500 Server Error`   | Yes (Auto-retried)  | Database connection pool momentarily busy; brief network blip.                          |
| **`ExternalApiError`** | External partner service (Stripe, Plaid) is down.          | `502 / 504 Gateway`  | Contextual          | Bank API rate limit exceeded; upstream gateway timeout.                                 |
| **`AIProviderError`**  | External AI model timed out or returned invalid format.    | `502 Gateway Error`  | Contextual          | AI response took too long; retry with structured schema prompt.                         |
| **`JobWorkerError`**   | Background queue job ran into an issue.                    | Logged in background | Contextual          | Corrupted bank PDF file (Routes straight to Review & Approvals desk).                   |

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
