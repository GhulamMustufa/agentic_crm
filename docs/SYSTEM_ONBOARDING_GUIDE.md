# Agentic Business OS — Plain English Platform Guide

> **Welcome to the Agentic Business OS!**  
> This guide is written for anyone—whether you are a non-technical stakeholder, a founder, or a junior engineer—to understand **what this platform does**, **how to use it**, **how the code is organized**, and **why each technology was chosen**.

---

## 1. The Big Picture: What is This Platform?

Think of **Agentic Business OS** as an **"Autonomous AI Accountant & Financial Operating System"** for businesses.

### The Problem It Solves

Running a company requires hundreds of hours of tedious financial paperwork:

- Uploading bank statements and matching line items.
- Writing customer invoices and tracking overdue payments.
- Categorizing expenses (Is this office equipment, cloud hosting, or travel?).
- Running payroll and deducting employee taxes.
- Generating Profit & Loss (P&L) and Balance Sheet reports.

Traditionally, a human bookkeeper spends hours doing this manually every week.

### The Solution: Autonomous AI with "Guardrails"

This platform uses **AI agents** (like specialized digital accountants) to do 95% of that manual work automatically:

1. It reads bank statements and matches them to invoices.
2. It categorizes purchases into the right accounting categories.
3. It balances the company ledger automatically.

### The Golden Rule: "Deterministic Guardrails"

Large Language Models (AI) can hallucinate or make arithmetic errors. Because you cannot afford mistakes with money, the platform enforces a strict golden rule:

> **The AI is only an Advisor. Deterministic Code is the Boss.**

- The AI **proposes** ("I think this $1,420 charge is Cloudflare hosting").
- The math code **validates** (Does Debits == Credits? Does the organization exist? Is the money positive?).
- If the AI is unsure (confidence < 90%), it stops and sends an alert to the **Exception Resolution Center** for a human to click "Approve" or "Reject".

---

## 2. Walkthrough: The User Journey & Screen Flows

Here is how a real user interacts with the platform step-by-step:

```
[1. Register / Login]
         │
         ▼
[2. Executive Dashboard (/)] ───► See today's books status & AI activity
         │
         ├───► [3. Banking Feed (/banking)] ──────► Upload bank statement PDF/CSV
         │                                              │ AI extracts transactions
         │                                              ▼
         ├───► [4. Review & Approvals (/exceptions)] ◄─ If AI is unsure, human confirms
         │
         ├───► [5. Invoices & Bills (/invoices)] ──► Manage customer invoices & vendor bills
         │
         ├───► [6. Transactions (/transactions)] ──► View verified balanced records
         │
         └───► [7. Reports (/reports)] ────────────► Live P&L, Balance Sheet & Trial Balance
```

### Screen 1: Registration & Login (`/register`, `/login`)

- **What it does:** Allows a business owner to create an account, name their organization (e.g. _Acme Corp_), and set a secure password.
- **Why it matters:** Enforces **Multi-Tenant Isolation**. This means Company A can _never_ see Company B's financial data. Every piece of data is stamped with an organization ID (`tenantId`).

### Screen 2: Executive Dashboard (`/`)

- **What it does:** The morning overview for the CEO or CFO.
- **What you see:**
  - **Books Status:** A green checkmark stating "Up to date".
  - **Transactions Processed:** How many transactions the AI categorized autonomously (e.g. 97% auto-categorized).
  - **Reconciled Amount:** Total dollar amount matched this month.
  - **Action Cards:** Quick shortcuts to upload statements or review exceptions.

### Screen 3: Banking & Statement Upload (`/banking`)

- **What it does:** This is where raw financial documents enter the system.
- **The Flow:**
  1. The user drags and drops a monthly bank statement (PDF or CSV).
  2. The AI background worker goes through 4 automatic stages:
     - **Extracting:** Reads text and numbers from the PDF.
     - **Classifying:** Resolves messy strings (e.g., `AMZN*MKTP US` -> _Amazon Web Services_).
     - **Reconciling:** Matches the bank deduction to an existing unpaid vendor bill.
     - **Complete:** Stamps the transaction into the double-entry books.

### Screen 4: Review & Approvals (`/exceptions`)

- **What it does:** The review desk for transactions needing quick confirmation. Whenever the AI is less than 90% certain of who was paid or which category applies, it stops and brings it here instead of guessing with your money.
- **The 5 Types of Exceptions:**
  1. **Unrecognized Payee:** New vendor or unclear wire memo.
  2. **Invoice Mismatch:** Amount paid differs from the open invoice total.
  3. **Duplicate Entry:** The same statement or charge was detected twice.
  4. **Missing Receipt:** Card swipe missing tax receipt proof.
  5. **File Issue:** Blurry, corrupted, or password-protected PDF.
- **The User Actions:** The user reviews the AI suggestion and clicks **"Approve & Record"** (adds directly to books), **"Ignore / Unmatched"** (discards duplicate or leaves untouched), or **"Decide Later"**.
- **Deep-Dive Documentation:** See [`ACCOUNTING_CONCEPTS_AND_EXCEPTIONS.md`](./ACCOUNTING_CONCEPTS_AND_EXCEPTIONS.md) for the complete guide.

### Screen 5: Invoices & Bills (`/invoices`)

- **What it does:** Tracks money coming in from clients (Accounts Receivable / Money In) and bills owed to suppliers (Accounts Payable / Money Out).
- **What you see:**
  - List of customer invoices and vendor bills.
  - Status badges: `Paid`, `Awaiting Payment`, `Overdue`, `Draft`.
  - Real-time calculation of outstanding receivables and upcoming vendor obligations.

### Screen 6: Transactions & Records (`/transactions`)

- **What it does:** The verified accounting book of record.
- **What you see:**
  - Every single financial movement with its debit, credit, standard account code (`1010 Cash`, `1200 AR`, `4010 Revenue`, `5010 Hosting`), and balanced status.
  - Guarantees 100% balance: Total Debits always equals Total Credits down to the exact cent.

### Screen 7: Real-Time Financial Reports (`/reports`)

- **What it does:** Generates authoritative financial statements on the fly:
  1. **Profit & Loss (P&L):** Revenue minus Expenses = Net Income.
  2. **Balance Sheet:** Assets = Liabilities + Owner Equity.
  3. **Trial Balance:** Account-by-account invariant proof.
  4. **AI Financial Commentary:** Plain-English summary explaining cash runway and burn rate.

---

## 3. Technology Stack & Why Each Tool Was Chosen

We chose modern, battle-tested tools to ensure enterprise reliability and ease of maintenance:

| Tool / Technology         | What it is                     | Why we use it (Plain English Reason)                                                                                                            |
| :------------------------ | :----------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Node.js (v20+)**        | JavaScript Runtime             | Runs both the frontend and backend on all operating systems without extra software.                                                             |
| **TypeScript**            | Type-safe programming language | Catches errors _before_ the code ever runs. Prevents typos, missing properties, and calculation mistakes.                                       |
| **NestJS**                | Enterprise Backend Framework   | Organizes server code into clean, modular blocks (Controllers, Services, Repositories) so complex financial code never becomes messy spaghetti. |
| **Next.js 16 (React 19)** | Modern Frontend Framework      | Builds fast, responsive web pages with instant page navigation and server-side rendering.                                                       |
| **TailwindCSS**           | Styling Framework              | Allows rapid, beautiful UI styling with consistent colors, dark mode support, and clean spacing.                                                |
| **Prisma ORM**            | Database Toolkit               | Acts as the translator between TypeScript and SQL. Makes database queries safe, readable, and type-checked.                                     |
| **Neon PostgreSQL**       | Cloud SQL Database             | The gold-standard relational database for financial records. Guarantees ACID compliance (transactions never partially fail).                    |
| **Vitest & Supertest**    | Backend Test Runners           | Runs 128 automated tests in 10 seconds to verify every single math calculation and security gate.                                               |
| **Playwright**            | Browser Automation Tester      | A robot that opens a real browser, clicks buttons, types text, and ensures the screens work for real users.                                     |
| **Husky & Lint-Staged**   | Git Pre-commit Police          | Prevents broken code, ugly formatting, or bad commit messages from ever being pushed to GitHub.                                                 |

---

## 4. File Structure & Where Everything Lives

Here is how the project files are laid out:

```
agentic_crm/
├── docs/                        # Architectural documentation, design system, coding rules
├── prisma/
│   └── schema.prisma            # The database blueprint (Users, Invoices, Ledger, Exceptions)
│
├── src/                         # BACKEND CODE (NestJS Server - Port 4000)
│   ├── main.ts                  # Backend entry point (starts server, CORS, error handling)
│   ├── app.module.ts            # Root module wiring all sub-modules together
│   ├── core/                    # Core infrastructure
│   │   ├── config/              # Environment variables schema validation (Zod)
│   │   ├── errors/              # Standard system error handling & HTTP filters
│   │   ├── logging/             # Structured JSON logger
│   │   ├── prisma/              # Database connection service
│   │   └── queue/               # In-memory background task queue
│   │
│   └── modules/                 # BUSINESS MODULES
│       ├── identity/            # User registration, login, JWT security tokens
│       ├── organization/        # Multi-tenant companies, members, settings
│       ├── ledger/              # Core accounting: Chart of Accounts, Journal Entries, Reports
│       ├── counterparties/      # Customers and Vendors directory
│       ├── invoices/            # Customer invoicing, vendor bills, payment recording
│       ├── banking/             # Bank accounts, statement uploads, transaction matching
│       ├── payroll/             # Employees, salary compensations, deterministic payroll runs
│       ├── inventory/           # Products, stock batches, FIFO valuation, recount adjustments
│       ├── exceptions/          # AI Exception Resolution Center (human approvals)
│       ├── agents/              # AI Agents (Accountant Agent, Payroll Agent, Inventory Agent)
│       └── audit/               # Immutable audit trail recording every user and AI action
│
├── frontend/                    # FRONTEND CODE (Next.js Web App - Port 3000)
│   ├── package.json             # Frontend dependencies and scripts
│   ├── src/
│   │   ├── app/                 # Next.js App Router (The Pages)
│   │   │   ├── (auth)/          # Login, Register, Setup pages
│   │   │   └── (dashboard)/     # Main app layout with sidebar navigation
│   │   │       ├── page.tsx     # Overview dashboard (/)
│   │   │       ├── banking/     # Bank statement upload page (/banking)
│   │   │       ├── exceptions/  # AI Exception Center page (/exceptions)
│   │   │       ├── invoices/    # Invoices & Bills page (/invoices)
│   │   │       ├── transactions/# General ledger transactions page (/transactions)
│   │   │       └── reports/     # Financial statements P&L & Balance Sheet (/reports)
│   │   │
│   │   ├── components/ui/       # Reusable UI widgets (Button, Card, Table, Badge, Input)
│   │   └── lib/                 # Frontend helpers (API client, currency formatting)
│   └── e2e/                     # Playwright automated browser test suites
│
└── package.json                 # Root project scripts (npm run dev, npm test, etc.)
```

---

## 5. How Data Flows Through the System

Here is an example of what happens when a user performs an action:

```
[User Browser]
      │  Types email/password and logs in
      ▼
[Frontend Next.js]
      │  Sends HTTP POST to http://localhost:4000/api/v1/auth/login
      ▼
[NestJS Backend Controller]
      │  Validates request schema (Zod / class-validator)
      ▼
[Identity Service]
      │  Hashes password with bcrypt, checks database via Prisma
      ▼
[PostgreSQL Database]
      │  Returns user record
      ▼
[NestJS Backend]
      │  Generates JWT Access Token & Refresh Token, records an Audit Log entry
      ▼
[User Browser]
      │  Stores token in session and redirects to Dashboard (/)
```

---

## 6. How a Fresh Developer Can Get Started in 5 Minutes

If a new engineer joins the project today, here are the only steps they need to follow:

```bash
# 1. Clone the repository and install dependencies
git clone https://github.com/GhulamMustufa/agentic_crm.git
cd agentic_crm
npm install
cd frontend && npm install && cd ..

# 2. Synchronize database schema (connects to live Neon cloud DB in .env)
npx prisma db push

# 3. Start both backend and frontend together with ONE command
npm run dev

# 4. Open browser
# Frontend: http://localhost:3000
# Backend API: http://localhost:4000/api/v1
```

To run all automated quality tests:

```bash
npm run typecheck       # Checks for TypeScript errors
npm test                # Runs all 128 backend unit & integration tests
npm run frontend:test   # Runs 5 Playwright automated browser E2E tests
```

---

## 7. What is Done vs. What Can Be Built in the Future

### Currently Completed (Phases 1, 2, 3)

- [x] **Multi-Tenant Foundation:** Safe company onboarding, JWT auth, role-based permissions.
- [x] **Double-Entry General Ledger:** Immutable accounts, debits/credits balance invariant.
- [x] **Customer Invoicing & Vendor Bills:** AR/AP flows with FIFO inventory depletion.
- [x] **Banking Statement Pipeline:** Ingestion, automated entity matching, and rule checks.
- [x] **AI Exception Center:** Human-in-the-loop review for ambiguous transactions.
- [x] **Deterministic Payroll:** Gross-to-net salary withholding formulas and ledger posting.
- [x] **Real-time Financial Reporting:** P&L, Balance Sheet, Trial Balance.
- [x] **Full Frontend UI:** Responsive dashboard, banking upload, invoices, transactions, reports.
- [x] **Automated Testing Suite:** 20 test files, 128 backend tests, 5 Playwright browser tests.
- [x] **CI/CD Pipeline:** GitHub Actions workflow with parallel test validation.

### Future Roadmap (Ideas for Phase 4 & Beyond)

1. **Live Bank Feed Integrations:** Connect to Plaid or Stripe Financial Connections to pull bank transactions automatically in real-time without uploading PDFs.
2. **Real LLM Providers:** Plug in Google Gemini 2.5 Pro or Claude 3.7 to analyze complex receipts and generate natural-language financial recommendations.
3. **Notification Bots:** Send Slack or WhatsApp alerts to the founder whenever an invoice is paid or an exception needs review.
4. **Multi-Currency Support:** Support international transactions with automatic FX rate conversions and foreign exchange gain/loss ledger accounts.
5. **PDF Invoice Generator:** Generate downloadable PDF invoices with custom company logos for customers.
