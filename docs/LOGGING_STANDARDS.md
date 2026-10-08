# Logging Standards & Redaction Policies: Agentic Business OS

**Document Status:** Authoritative Logging Architecture & Privacy Standards  
**Version:** 1.0.0  
**Target Engine:** Structured JSON via Pino / NestJS Custom Logger  
**Authority:** Governs all application, worker, agent, and security audit log streams

---

> [!TIP]
>
> ### Logging & Privacy in 60 Seconds
>
> **Clean structured logs, zero private data leaks.**
>
> 1. **Structured JSON format:** Instead of messy text strings, logs are emitted as neat JSON objects that can be searched and filtered instantly.
> 2. **Automatic Privacy Masking (Zero PII Leaks):** Passwords, credit cards, bank account numbers, and API tokens are automatically replaced with `[REDACTED]` before anything is saved to disk.
> 3. **Trace every request:** Every log entry carries a `correlationId` and `tenantId`, so engineers can follow any transaction from start to finish across all server processes.

---

## 1. Structured Logging Principles

All logs generated in production must be machine-readable, structured JSON emitted directly to standard system output.

### 1.1 Core Logging Rules

1. **Use the App Logger:** Raw `console.log()` is avoided in production. Use the centralized `AppLoggerService`.
2. **Contextual Enrichment:** Every log record automatically includes request IDs, company IDs (`tenantId`), and module names.
3. **Zero Sensitive Data:** All passwords, tokens, and bank details are scrubbed before printing.
4. **Clean Log Levels:** Use `ERROR` for failures, `WARN` for unusual issues, and `INFO` for normal completed milestones.

---

## 2. Standardized Log Schema

Every emitted JSON log line must adhere to the following top-level structure:

```json
{
  "timestamp": "2026-10-04T15:30:00.123Z",
  "level": "INFO",
  "message": "Statement line successfully matched to vendor invoice",
  "context": "BankReconciliationService",
  "correlationId": "req_88f912b3-90ab",
  "tenantId": "org_7f8a91b2",
  "userId": "usr_3b91c84f",
  "workflowId": "wf_stmt_ingest_019",
  "agentExecutionId": "agent_exec_4492a",
  "durationMs": 142,
  "data": {
    "statementLineId": "line_99182",
    "invoiceId": "inv_00412",
    "matchedAmountCents": 12450,
    "confidenceScore": 0.98
  }
}
```

---

## 3. Log Levels & Usage Criteria

| Log Level   | Numeric | When to Use                                                                                                                           | Alerting / Notification                               |
| :---------- | :------ | :------------------------------------------------------------------------------------------------------------------------------------ | :---------------------------------------------------- |
| **`FATAL`** | 60      | Unrecoverable system failure causing immediate crash or total service unavailability (e.g., failed DB startup, corrupted migration).  | PagerDuty / On-call notification immediately.         |
| **`ERROR`** | 50      | Handled 500 exceptions, background worker job death, external payment gateway down, financial invariant violation.                    | High-priority Slack alert / Error Tracker (Sentry).   |
| **`WARN`**  | 40      | Recoverable anomalies, 4xx client errors (repeated auth failures, 429 rate limit triggers), slow database queries ($> 200\text{ms}$). | Aggregated in dashboard metrics; no direct page.      |
| **`INFO`**  | 30      | High-level milestones in business workflows: statement uploaded, batch posted, period closed, user invitation accepted.               | Searchable in log aggregator (Datadog/Elastic).       |
| **`DEBUG`** | 20      | Detailed diagnostic information: tool call payloads, intermediate matching heuristics, SQL query parameters (in dev only).            | Disabled in production by default (`LOG_LEVEL=info`). |
| **`TRACE`** | 10      | Verbose network frames, full raw LLM token streams.                                                                                   | Local development only.                               |

---

## 4. Sensitive Data Redaction Policies

To maintain compliance with SOC 2, GDPR, and PCI-DSS, logs must automatically redact sensitive fields.

### 4.1 Automatically Redacted Field Names

The logging serializer runs an automated recursive deep-scrubber that replaces values matching these key patterns with `"[REDACTED]"`:

- `*password*`, `*secret*`, `*token*`, `*auth*`, `*jwt*`
- `*api_key*`, `*apikey*`, `*private_key*`
- `*ssn*`, `*social_security*`, `*tax_id*`
- `*credit_card*`, `*card_number*`, `*cvv*`
- `*cookie*`

### 4.2 Financial Account Truncation

Bank account numbers, routing numbers, and IBANs must **never** be logged in full. They must be masked to display only the last 4 characters:

```typescript
export function maskAccountNumber(rawNumber: string): string {
  if (!rawNumber || rawNumber.length < 4) return '****';
  return `...${rawNumber.slice(-4)}`;
}
// Output: "...4092"
```

---

## 5. Correlated Tracing & Flow Identifiers

To diagnose multi-agent workflows spanning webhooks, API calls, and background jobs, every execution thread carries a trace context:

- **`correlationId`:** Generated at the edge API gateway (`x-correlation-id`) or forwarded from external clients. Propagated through all internal HTTP calls and BullMQ jobs.
- **`tenantId`:** Extracted from the authenticated session context.
- **`workflowId`:** Assigned to multi-step sagas (e.g., Statement Ingestion Pipeline steps 1 through 17).
- **`agentExecutionId`:** Unique identifier for a single AI agent invocation. Allows engineers to filter all logs, prompts, and tool calls produced by a specific agent run.
