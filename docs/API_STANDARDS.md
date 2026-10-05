# API Contract Standards: Agentic Business OS

**Document Status:** Authoritative API Specifications & Contract Standards  
**Version:** 1.0.0  
**Protocol:** RESTful over HTTPS (JSON)  
**Authority:** Governs all client-to-server, server-to-server, and webhook API surfaces

---

## 1. REST Architecture & Conventions

All external and internal HTTP APIs adhere to strict RESTful design principles.

### 1.1 URI Structure & Naming Conventions

- **Base URI:** `/api/v{version}/` (e.g., `/api/v1/bank-statements`).
- **Resource Plurality:** URIs use plural kebab-case nouns:
  - `/api/v1/journal-entries`
  - `/api/v1/bank-accounts`
  - `/api/v1/exceptions`
- **Sub-Resources (Max 2 levels deep):**
  - `/api/v1/bank-accounts/:accountId/statements`
  - `/api/v1/invoices/:invoiceId/lines`
  - _Avoid deep nesting beyond 2 levels._ Instead of `/api/v1/orgs/:orgId/accounts/:accId/entries/:entryId/lines`, use top-level `/api/v1/journal-entries/:entryId/lines`.
- **Actions / State Transitions (RPC-Style Exceptions):**
  When a state transition cannot be cleanly mapped to standard CRUD verbs, use an explicit sub-action POST endpoint:
  - `POST /api/v1/proposals/:id/approve`
  - `POST /api/v1/accounting-periods/:id/lock`
  - `POST /api/v1/bank-statements/:id/reconcile`
  - `POST /api/v1/payroll/runs/:id/approve`
  - `POST /api/v1/payroll/runs/:id/post`
  - `POST /api/v1/inventory/purchases`
  - `POST /api/v1/inventory/sales`
  - `POST /api/v1/inventory/adjustments`

### 1.2 HTTP Methods & Expected Semantics

| Method       | Usage                                                | Idempotent            | Request Body | Success Status               |
| :----------- | :--------------------------------------------------- | :-------------------- | :----------- | :--------------------------- |
| **`GET`**    | Read resource or collection. Zero side effects.      | Yes                   | None         | `200 OK`                     |
| **`POST`**   | Create a new resource or execute an explicit action. | No* (See Idempotency) | Required     | `201 Created` or `200 OK`    |
| **`PUT`**    | Full replacement of a mutable resource.              | Yes                   | Required     | `200 OK`                     |
| **`PATCH`**  | Partial update of specific fields.                   | Yes                   | Required     | `200 OK`                     |
| **`DELETE`** | Soft-delete or archive a resource.                   | Yes                   | None         | `200 OK` or `204 No Content` |

---

## 2. Standardized Response Envelopes

To maintain client consistency, all API responses return uniform structure.

### 2.1 Single Resource Response (`200 OK` / `201 Created`)

```json
{
  "data": {
    "id": "je_01928471b",
    "entryDate": "2026-10-02",
    "description": "Monthly AWS Subscription",
    "status": "POSTED",
    "totalDebitCents": 14250,
    "totalCreditCents": 14250,
    "createdAt": "2026-10-02T14:32:00Z"
  }
}
```

### 2.2 Paginated Collection Response (`200 OK`)

For large transaction streams and audit logs, cursor-based pagination is preferred over offset pagination.

```json
{
  "data": [
    { "id": "tx_01", "amountCents": 4200, "status": "RECONCILED" },
    { "id": "tx_02", "amountCents": 1850, "status": "PENDING" }
  ],
  "meta": {
    "pagination": {
      "hasNextPage": true,
      "hasPreviousPage": false,
      "startCursor": "cursor_tx_01",
      "endCursor": "cursor_tx_02",
      "totalCount": 148
    }
  }
}
```

---

## 3. Query Parameters: Filtering, Sorting & Pagination

Standardized query parameter formats prevent ad-hoc implementations across controllers:

1. **Pagination:**
   - Cursor: `?after=cursor_xyz&limit=25`
   - Offset (small tables only): `?page=1&limit=25`
   - Maximum allowed `limit` across all endpoints is `100`.
2. **Sorting:**
   - Prefix with `-` for descending, no prefix for ascending:
   - `?sort=-createdAt` (newest first)
   - `?sort=accountCode,-entryDate`
3. **Filtering:**
   - Exact matching: `?status=PENDING&accountId=acc_091`
   - Range queries: `?dateFrom=2026-10-01&dateTo=2026-10-31`
   - Amount thresholds: `?minAmountCents=10000`

---

## 4. Idempotency & Financial Operations

Network retries or double-clicks must never result in duplicate financial postings.

- **`Idempotency-Key` Header:** All state-mutating POST endpoints (`/proposals/:id/approve`, `/journal-entries`, `/payroll/runs`) require or support an `Idempotency-Key: <UUID>` header.
- **Idempotency Lifecycle:**
  1. Server checks Redis for `idempotency:<tenant_id>:<key>`.
  2. If key exists with status `PROCESSING`: return `409 Conflict` (Operation currently in-flight).
  3. If key exists with status `COMPLETED`: return the cached response payload immediately without re-executing.
  4. If key is new: acquire lock, execute transaction, cache response with a 24-hour TTL, and return.

---

## 5. Standardized Error Format (RFC 7807 / Problem Details)

All error responses return a standardized, machine-readable envelope:

```json
{
  "statusCode": 422,
  "errorCode": "UNBALANCED_JOURNAL_ENTRY",
  "message": "The proposed journal entry is unbalanced. Debits must equal credits.",
  "details": [
    {
      "field": "lines",
      "message": "Total debits ($140.00) do not equal total credits ($120.00). Discrepancy: +$20.00."
    }
  ],
  "correlationId": "req_f819a02b4",
  "timestamp": "2026-10-04T15:30:00Z"
}
```

### Standard Error Status Codes

- `400 Bad Request`: Schema validation failure, malformed JSON.
- `401 Unauthorized`: Missing or invalid Bearer JWT.
- `403 Forbidden`: Authenticated, but lacks role/tenant permission.
- `404 Not Found`: Resource does not exist in the tenant's scope.
- `409 Conflict`: Resource locked, concurrent edit, or duplicate idempotency key.
- `422 Unprocessable Entity`: Semantic domain violation (e.g., closed accounting period).
- `429 Too Many Requests`: Rate limit exceeded.
- `500 Internal Server Error`: Masked unexpected infrastructure failure.

---

## 6. Authentication & Tenant Authorization

- **Bearer Token:** All authenticated requests pass `Authorization: Bearer <JWT>`.
- **Tenant Identification:** The tenant ID is **never** accepted in query or body parameters for tenant-scoped operations. It is extracted from the verified JWT payload.
- **Cross-Tenant Guardrail:** Any URL parameter referencing a resource (e.g., `/bank-accounts/:accountId`) must be verified to belong to the authenticated tenant before returning or modifying data. If not found under that tenant, return `404 Not Found` (never `403`, to avoid leaking existence of other tenants' records).

---

## 7. Versioning & Backwards Compatibility

- **URL Versioning:** Breaking changes require incrementing the URL path (`/api/v1` &rarr; `/api/v2`).
- **Additive Changes:** Adding optional fields to request bodies or new fields to response payloads is considered non-breaking and permitted within a version.
- **Deprecation Notice:** Deprecated endpoints return the standard `Sunset` and `Deprecation` HTTP headers 6 months prior to removal:
  ```http
  Deprecation: @1790000000
  Sunset: Wed, 11 Nov 2026 00:00:00 GMT
  ```

---

## 8. OpenAPI Documentation & Contract Testing

- **Auto-Generated OpenAPI (Swagger):** All NestJS controllers must use `@ApiTags()`, `@ApiOperation()`, `@ApiResponse()`, and `@ApiProperty()` decorators.
- **Contract Verification:** OpenAPI specs are automatically generated and committed at `/docs/api/openapi.json`. Frontend client SDKs and mock servers are generated directly from this spec.
