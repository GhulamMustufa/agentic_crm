# Plain-English Guide: Chart of Accounts & Exception Resolutions

> **Who is this guide for?**  
> Founders, business owners, clients, and developers who want a clear, jargon-free explanation of how account codes work and how the Review & Approvals (Exceptions) center operates.

---

## Part 1: Chart of Accounts (COA) & 4-Digit Numbering System

### 1. Why Do Accounts Have 4-Digit Numbers?

In professional bookkeeping, accounts don't just have names—they have **standardized 4-digit codes** (like `1010`, `1200`, `4010`).

Think of these numbers like **postal ZIP codes for your money**:

- Instead of relying on messy text names that can vary (e.g., _"Mercury Checking"_, _"Bank Deposit"_, _"Operating Cash"_), every system in the world knows that an account starting with `1` is an **Asset**.
- Numbers allow software and accountants to organize, filter, and balance reports instantly and reliably.

---

### 2. The Universal 5-Bucket Numbering Rule

Every account code follows a standard universal prefix based on where it belongs in your financial statements:

| Code Range        | Category             | Plain English Meaning                   | Real-World Examples                                            |
| :---------------- | :------------------- | :-------------------------------------- | :------------------------------------------------------------- |
| **`1000 – 1999`** | **Assets**           | Money you **own** or are **owed**       | Cash in bank, money owed by clients, inventory                 |
| **`2000 – 2999`** | **Liabilities**      | Money you **owe** to other people       | Bills from suppliers, credit card balances, payroll taxes owed |
| **`3000 – 3999`** | **Equity**           | The **net worth** of the business       | Money invested by founders, accumulated company profits        |
| **`4000 – 4999`** | **Revenue (Income)** | Money you **earn** from sales           | Client consulting fees, subscription sales, product revenue    |
| **`5000 – 5999`** | **Expenses**         | Money you **spend** to run the business | Cloud hosting, software subscriptions, office rent, salaries   |

---

### 3. The 6 Core Accounts Used in This System

Below are the most important account codes you will see throughout the application:

#### 1. `1010` — Operating Cash (Asset)

- **What it is:** The actual cash balance sitting inside your main company bank account (e.g., Mercury, Chase, Maybank).
- **When it moves:**
  - **Increases** when a client pays an invoice or you deposit funds.
  - **Decreases** when you pay a supplier bill, transfer salaries, or pay hosting fees.

#### 2. `1200` — Accounts Receivable / "AR" (Asset)

- **What it is:** The total money that **clients currently owe you** for invoices you have sent but have not yet received payment for.
- **Why it is an Asset:** Because that money legally belongs to you—it just hasn't arrived in your bank account yet.
- **When it moves:**
  - When you create and post an invoice for $5,000, `1200 AR` increases by $5,000.
  - When the client's bank wire arrives, `1200 AR` decreases to $0, and `1010 Cash` increases by $5,000.

#### 3. `2010` — Accounts Payable / "AP" (Liability)

- **What it is:** The total money **you owe to your suppliers and vendors** for bills received that you haven't paid yet.
- **When it moves:**
  - When you receive an invoice from a supplier for $1,200, `2010 AP` increases (you owe $1,200).
  - When you pay that bill from your bank, `2010 AP` drops to $0, and `1010 Cash` decreases by $1,200.

#### 4. `4010` — Sales Revenue (Income)

- **What it is:** The total income earned by your business from selling services or products.
- **When it moves:**
  - Whenever a customer invoice is posted, `4010 Sales Revenue` increases, showing your company made money on the Profit & Loss statement.

#### 5. `5010` — Cloud Hosting & Software (Expense)

- **What it is:** Operational technology expenses (e.g., AWS, GitHub, Google Cloud, Vercel).
- **When it moves:**
  - Whenever card charges or vendor payments for infrastructure are detected on your bank statement, they are categorized into `5010`.

#### 6. `9999` — Suspense / Unallocated Account (Temporary Clearing)

- **What it is:** A temporary digital holding bucket.
- **When it moves:**
  - If a wire arrives with an unknown description, the system temporarily places it into `9999` and flags it for human review. Once you confirm the category, the money is moved from `9999` into the real category.

---

## Part 2: Review & Approvals (Exceptions Guide)

### 1. What is an "Exception"?

In this system, an **Exception is NOT a software bug or crash**.  
It is an **intentional safety checkpoint**:

> **The Rule of Financial Safety:**  
> If the AI bookkeeping assistant is less than **90% confident** about who a payment went to or which tax category it belongs in, it **refuses to guess blindly with your company's money**.  
> Instead, it stops, drafts a suggestion, and brings it to the **Review & Approvals** screen for your quick confirmation.

---

### 2. The 5 Types of Exceptions & What Causes Them

```
                              ┌──────────────────────────────────┐
                              │  Bank Statement / Transaction    │
                              └─────────────────┬────────────────┘
                                                │
                 ┌──────────────────────────────┼──────────────────────────────┐
                 ▼                              ▼                              ▼
        [1. Unrecognized Payee]        [2. Invoice Mismatch]            [3. Duplicates]
      • New vendor or unclear memo   • Paid amount ≠ Invoice amount   • Same statement uploaded twice
      • AI suggests best category    • Wire fee or partial payment    • Same charge on same date
                 │                              │                              │
                 ▼                              ▼                              ▼
        [4. Missing Receipt]           [5. File Issues]               [Human Action]
      • Debit card swipe without     • Corrupted or blurry PDF        • Approve & Record
        tax receipt attachment       • Balance doesn't add up         • Ignore / Unmatched
                                                                      • Decide Later
```

---

### Category 1: Unrecognized Payee or Unclear Transaction

_(System Codes: `UNRECOGNIZED_VENDOR`, `AMBIGUOUS_TRANSACTION`, `UNKNOWN_TRANSACTION`, `LOW_CONFIDENCE`)_

- **What happened:** Money came into or left your bank account, but the bank memo (e.g. `"WIRE-TRANSFER-88419X"` or `"MISC PYMT"`) does not match any known supplier, customer, or past rule.
- **Why it is flagged:** To prevent misclassifying an expense and distorting your tax deductions.
- **How to resolve it:**
  - **Approve & Record:** Check the suggested category (e.g. _Office Supplies_). Click **"Approve & Record"**. The transaction is added to your books and balanced immediately.
  - **Ignore / Unmatched:** If you do not know who this was paid to yet, click **"Ignore / Unmatched"** or **"Decide Later"** until you have more details.

---

### Category 2: Invoice or Bill Amount Mismatch

_(System Codes: `UNMATCHED_PAYMENT`, `INVOICE_MISMATCH`, `INVOICE_TOTAL_MISMATCH`)_

- **What happened:** A payment came in or went out, but the dollar amount does not match the open invoice on file.
  - _Example:_ The bank shows a deposit of **RM 5,300**, but Invoice #101 was for **RM 5,000** (an extra RM 300).
  - _Example:_ A bank memo references Invoice `#INV-999`, but that invoice has already been marked paid or does not exist.
- **Why it is flagged:** To prevent marking an invoice as paid when there is an overpayment, underpayment, or bank wire fee discrepancy.
- **How to resolve it:**
  - **Partial / Adjusted Match:** Match the payment to the open invoice and record the remaining difference as a bank fee or discount.
  - **Record as Customer Credit:** Store the excess amount as an advance credit for the client's next invoice.

---

### Category 3: Duplicate Statement or Transaction

_(System Codes: `DUPLICATE_TRANSACTION`, `DUPLICATE_STATEMENT`, `DUPLICATE`)_

- **What happened:**
  - A user accidentally uploaded the same monthly bank statement twice, **OR**
  - Two identical transactions appeared with the exact same date, amount, and payee.
- **Why it is flagged:** To stop the system from double-counting your sales or expenses, which would distort your bank balance and inflate your taxes.
- **How to resolve it:**
  - **Ignore / Discard:** Click **"Ignore / Unmatched"**. The system discards the duplicate line and keeps your original verified books untouched.
  - **Confirm Both:** If you genuinely made two identical purchases on the same day (e.g., two identical RM 50 office supply orders), confirm the second charge to record both.

---

### Category 4: Missing Receipt or Information

_(System Codes: `MISSING_RECEIPT`, `MISSING_FIELDS`, `MISSING_INFORMATION`)_

- **What happened:** A card swipe occurred, but tax rules require proof of expense (an itemized receipt), or a mandatory field (such as transaction date or tax rate) is missing.
- **Why it is flagged:** To ensure tax audit compliance.
- **How to resolve it:**
  - **Upload Receipt:** Click **"Upload Receipt"** directly on the review card to attach the receipt image or PDF.
  - **Approve Without Receipt:** If no receipt is needed (e.g. a small recurring bank account fee), click **"Approve & Record"**.

---

### Category 5: File Reading or Format Issues

_(System Codes: `MALFORMED_PDF`, `INVALID_FILE_FORMAT`, `EXTRACTION_UNCERTAIN`, `BALANCE_MISMATCH`)_

- **What happened:**
  - The uploaded bank PDF was password-protected, corrupted, or scanned with low visual quality, **OR**
  - The starting balance plus all deposits and withdrawals doesn't equal the ending balance printed on the bank statement.
- **Why it is flagged:** The platform enforces strict mathematical precision. It will never invent numbers from unreadable files.
- **How to resolve it:**
  - **Re-upload Statement:** Export a clean PDF or CSV directly from your bank's website and re-upload it.
  - **Manual Check:** If only one blurry line was missed, enter that specific line manually.

---

## Part 3: What Happens Behind the Scenes When You Click a Button

| Button Clicked           | What the System Does                                                                                        | Effect on Your Books                                                          |
| :----------------------- | :---------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------- |
| **"Approve & Record"**   | Accepts the suggested category, creates a balanced double-entry journal entry, and marks the item resolved. | Your Cash (`1010`), Invoices (`1200`/`2010`), and Reports update immediately. |
| **"Ignore / Unmatched"** | Discards or unlinks the suggestion without making any journal entry.                                        | Your general ledger remains untouched. No phantom expenses are recorded.      |
| **"Decide Later"**       | Leaves the item in the queue and jumps to the next item in line.                                            | Does not change anything. Lets you finish other items first.                  |
| **"Upload Receipt"**     | Stores the receipt file securely in object storage and attaches it to the transaction.                      | Keeps your business fully audit-compliant.                                    |

---

## Part 4: Plain-English Quick Translation Table

| Technical / Internal Term    | What It Actually Means to You                        |
| :--------------------------- | :--------------------------------------------------- |
| **Exception**                | Item needing your quick confirmation                 |
| **Counterparty**             | Client, supplier, or payee                           |
| **Ingestion**                | Importing and reading your bank statement            |
| **Deterministic**            | 100% mathematically verified (no AI guessing)        |
| **Immutable**                | Permanent and locked for audit protection            |
| **Invariant Check**          | Balance check (Total Debits equal Total Credits)     |
| **Chart of Accounts**        | The list of all expense, income, and bank categories |
| **AR (Accounts Receivable)** | Money your clients owe you                           |
| **AP (Accounts Payable)**    | Money you owe to your suppliers                      |
