# AGENTS.md: Repository Governance & AI Pair-Programming Directives

**Repository:** Agentic Business OS  
**Status:** Authoritative Repository Enforcement Layer  
**Audience:** All Human Engineers, AI Coding Assistants (Antigravity, Claude, Copilot, ChatGPT), and Automated Tooling

---

## 1. The 17 Mandatory Engineering Directives

Every engineer and AI agent operating within this codebase must strictly observe these 17 mandates without exception:

1. **Read Relevant `/docs` First:** Before writing or modifying code, inspect relevant documentation in `/docs` to understand architectural context, design tokens, and domain rules.
2. **Follow `CODING_STANDARDS.md`:** Adhere strictly to the master engineering principles, TypeScript rules, and naming conventions in [`/docs/CODING_STANDARDS.md`](file:///Users/mac/Desktop/projects/agentic_crm/docs/CODING_STANDARDS.md).
3. **Follow Domain-Specific Standards:** Adhere to [`FRONTEND_STANDARDS.md`](file:///Users/mac/Desktop/projects/agentic_crm/docs/FRONTEND_STANDARDS.md), [`BACKEND_STANDARDS.md`](file:///Users/mac/Desktop/projects/agentic_crm/docs/BACKEND_STANDARDS.md), [`API_STANDARDS.md`](file:///Users/mac/Desktop/projects/agentic_crm/docs/API_STANDARDS.md), and [`DATABASE_STANDARDS.md`](file:///Users/mac/Desktop/projects/agentic_crm/docs/DATABASE_STANDARDS.md).
4. **Never Invent Requirements:** Build strictly what is specified in product requirements and task descriptions. Do not invent speculative regulatory rules, tax calculations, or enterprise features.
5. **Never Bypass Architectural Boundaries:** Controllers must remain thin. Repositories must not contain business logic. Domain models must not depend on database drivers. Never circumvent layers for quick convenience.
6. **No Authoritative Financial Logic in the Frontend:** The frontend is a presentation and interaction surface. All monetary arithmetic, ledger balances, tax withholdings, and accounting invariants must be computed deterministically on the server.
7. **Never Allow AI to Directly Control Authoritative Financial State:** LLMs are probabilistic. They must **never** directly write to general ledger tables, alter account balances, or sign payroll files. AI output is strictly advisory, passing through deterministic validation gates.
8. **Preserve Multi-Tenant Isolation:** Every tenant-sensitive operation must enforce tenant context derived from verified server session state. Never trust a client-provided `tenantId`.
9. **Validate External and AI-Generated Input:** Every request body, uploaded file, webhook payload, third-party API response, and AI tool argument must pass strict schema validation (Zod / class-validator).
10. **Add or Update Tests for Meaningful Changes:** Production code must be accompanied by deterministic tests. Financial domain logic requires 100% test coverage of edge cases and rounding behavior.
11. **Update Documentation Alongside Code:** When modifying an API contract, database schema, or architectural pattern, update the corresponding `/docs` files within the same pull request.
12. **Run Lint, Typecheck, Tests, and Build:** Never declare a task complete without executing and verifying all automated quality gates.
13. **Never Claim Work is Complete Without Verification:** Do not state that a feature or bugfix is ready until you have verified the compiled build and passing test suites.
14. **Prefer the Smallest Correct Change:** Keep diffs focused, minimal, and reviewable. Solve the specific problem cleanly.
15. **Do Not Perform Unrelated Refactors:** Do not reformat unrelated files, modify unrelated dependencies, or restructure architectures in the middle of a focused feature or bugfix task.
16. **Ask or Document Uncertainty Rather Than Guessing:** If a requirement or domain rule is ambiguous, state the assumption clearly or ask the user for clarification before writing speculative code.
17. **Highest Priority: Security, Financial Correctness & Data Integrity:** Operational speed must never compromise data integrity, double-entry ledger balance, or tenant isolation.

---

## 2. Authoritative Map of Engineering Concerns

When making changes, consult the authoritative source of truth for each specific concern:

| Engineering Concern                             | Authoritative Document                                                                                               |
| :---------------------------------------------- | :------------------------------------------------------------------------------------------------------------------- |
| **System Architecture, Domains & Threat Model** | [`/docs/ARCHITECTURE.md`](file:///Users/mac/Desktop/projects/agentic_crm/docs/ARCHITECTURE.md)                       |
| **Product Vision, Scope & Personas**            | [`/docs/PRODUCT.md`](file:///Users/mac/Desktop/projects/agentic_crm/docs/PRODUCT.md)                                 |
| **UX Objectives, Workflows & Exception Center** | [`/docs/UX_PRINCIPLES.md`](file:///Users/mac/Desktop/projects/agentic_crm/docs/UX_PRINCIPLES.md)                     |
| **Design Tokens, Components & Badges**          | [`/docs/DESIGN_SYSTEM.md`](file:///Users/mac/Desktop/projects/agentic_crm/docs/DESIGN_SYSTEM.md)                     |
| **Master Coding Standards & Principles**        | [`/docs/CODING_STANDARDS.md`](file:///Users/mac/Desktop/projects/agentic_crm/docs/CODING_STANDARDS.md)               |
| **Next.js, React, Tailwind & Client State**     | [`/docs/FRONTEND_STANDARDS.md`](file:///Users/mac/Desktop/projects/agentic_crm/docs/FRONTEND_STANDARDS.md)           |
| **NestJS, Clean Architecture, DI & Queues**     | [`/docs/BACKEND_STANDARDS.md`](file:///Users/mac/Desktop/projects/agentic_crm/docs/BACKEND_STANDARDS.md)             |
| **REST APIs, Request/Response & Idempotency**   | [`/docs/API_STANDARDS.md`](file:///Users/mac/Desktop/projects/agentic_crm/docs/API_STANDARDS.md)                     |
| **PostgreSQL, Migrations, Indexes & RLS**       | [`/docs/DATABASE_STANDARDS.md`](file:///Users/mac/Desktop/projects/agentic_crm/docs/DATABASE_STANDARDS.md)           |
| **Relational Schemas, DDL & Domain Models**     | [`/docs/DATABASE_SCHEMA.md`](file:///Users/mac/Desktop/projects/agentic_crm/docs/DATABASE_SCHEMA.md)                 |
| **Error Taxonomy & System Error Flow**          | [`/docs/ERROR_HANDLING.md`](file:///Users/mac/Desktop/projects/agentic_crm/docs/ERROR_HANDLING.md)                   |
| **Structured JSON Logs & PII Redaction**        | [`/docs/LOGGING_STANDARDS.md`](file:///Users/mac/Desktop/projects/agentic_crm/docs/LOGGING_STANDARDS.md)             |
| **Metrics, Tracing, Health & Alerting**         | [`/docs/OBSERVABILITY.md`](file:///Users/mac/Desktop/projects/agentic_crm/docs/OBSERVABILITY.md)                     |
| **Latency Budgets, Caching & Queues**           | [`/docs/PERFORMANCE.md`](file:///Users/mac/Desktop/projects/agentic_crm/docs/PERFORMANCE.md)                         |
| **Branches, Conventional Commits & Releases**   | [`/docs/GIT_WORKFLOW.md`](file:///Users/mac/Desktop/projects/agentic_crm/docs/GIT_WORKFLOW.md)                       |
| **ADRs, Code Comments & Runbooks**              | [`/docs/DOCUMENTATION_STANDARDS.md`](file:///Users/mac/Desktop/projects/agentic_crm/docs/DOCUMENTATION_STANDARDS.md) |

---

## 3. Strict Boundary: Deterministic vs. AI-Assisted Code

To guarantee financial correctness, the codebase maintains an inviolable partition:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       DETERMINISTIC CODE (AUTHORITATIVE)                    │
│                                                                             │
│  • Double-Entry General Ledger Balance (sum(Debits) == sum(Credits))        │
│  • Account Balances & Cash Roll-Forwards                                    │
│  • Currency Conversions & Fixed-Point Integer Math                          │
│  • Payroll Gross-to-Net Withholding Formulas                                │
│  • Inventory Quantities, FIFO / WAV Cost Calculations                       │
│  • Multi-Tenant Isolation & Row-Level Security                              │
│  • Role-Based Access Control (RBAC) & Authorization Guards                  │
│  • Idempotency Keys & Database Transaction Boundaries                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                       ▲
                                       │ Enforces Constraints On
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     AI-ASSISTED CODE (ADVISORY & UNTRUSTED)                 │
│                                                                             │
│  • PDF / CSV Statement OCR & Document Layout Extraction                     │
│  • Counterparty Entity Resolution (Messy Strings -> Clean Vendor)           │
│  • Transaction Chart of Accounts Classification Proposals                   │
│  • Fuzzy Invoice-to-Payment Matching Recommendations                        │
│  • Anomaly Detection & Contextual Hypotheses                                │
│  • Plain-English Rationale Generation for Exceptions                        │
│  • Natural-Language Executive Queries & Summaries                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Verification Checklist Before Marking Work Complete

Before submitting any pull request or declaring a coding task finished, the developer or AI agent must verify:

- [ ] Strict TypeScript compilation passes with zero errors: `npm run typecheck`
- [ ] ESLint rules pass with zero warnings or errors: `npm run lint`
- [ ] Code formatting conforms to Prettier: `npm run format:check`
- [ ] Unit and integration test suites pass deterministically: `npm run test`
- [ ] Production build succeeds without errors: `npm run build`
- [ ] Relevant documentation has been updated to reflect architectural or contract changes.
