# UX Principles & Design System Guidelines: Agentic Business OS

**Document Status:** Authoritative UX Context & Developer Guidelines  
**Version:** 1.0.0  
**Target Platform:** Web (Desktop, Tablet, Mobile Responsive)  
**Primary Aesthetic & Tone:** Modern, Trustworthy, Elegant, Professional, Calm, Financial, Intelligent

---

## 1. Primary UX Objective

> **"Show me what the AI did, what needs my attention, and what I can safely ignore."**

Traditional enterprise ERPs and accounting CRMs overwhelm operators with sprawling navigation, dense multi-tab menus, manual entry grids, and noisy dashboards packed with vanity charts.

The **Agentic Business OS** flips this paradigm completely:

1. **The background engine does the work.** The interface is not a tool for manual data entry; it is a command and review surface.
2. **Silence is success.** If 150 transactions were parsed, normalized, reconciled, and posted with 99% confidence, they do not demand a 150-row manual review. They are summarized cleanly in the background stream.
3. **High-urgency triage.** Human attention is treated as a scarce, high-value asset. The system highlights anomalies, policy violations, and approval requests with extreme clarity, providing 1-click resolution paths.

---

## 2. Core UX Design Principles

### Principle 1: Minimal Cognitive Load

- Do not make the user think about bookkeeping mechanics or database relationships.
- Group related items by business outcome rather than internal database schemas.
- Keep screens clean, with ample whitespace, structured hierarchy, and zero decorative visual clutter.

### Principle 2: Progressive Disclosure

- Surface only what is essential for the current decision at the top level.
- Secondary data (e.g., raw OCR strings, double-entry debit/credit ledger breakdown, system timestamps, model tokens) should be accessible via 1-click drawer, expandable accordion, or hover preview—never cluttering the default view.

### Principle 3: One Primary Action Per Screen

- Every view has a single, unmistakable primary call to action (e.g., **"Approve Batch (12)"**, **"Resolve Exception"**, **"Upload Statement"**).
- Secondary actions (e.g., "Edit Details", "Split Transaction", "Export CSV") are visually de-emphasized. Destructive actions ("Reject", "Delete") require deliberate friction or immediate undo capability.

### Principle 4: Prominent Exceptions (Management by Exception)

- When an item requires human review, it must be impossible to miss.
- The **Exception Center** surfaces items ordered strictly by priority (financial impact, due date, confidence score).
- The user should immediately see _why_ the item was flagged without reading a paragraph of error logs.

### Principle 5: Routine Work Disappears into Automation

- Successful automated tasks collapse into quiet, reassuring status counters (e.g., _"48 transactions auto-reconciled &middot; View log"_).
- Never force a user to click "Confirm" on routine, high-confidence, policy-compliant actions.

### Principle 6: Zero Configuration Overwhelm

- The system must work out of the box with sensible, opinionated defaults (e.g., standard Chart of Accounts, standard confidence thresholds).
- Do not present multi-page setup wizards with 50 toggles. Surface configuration contextually at the exact moment a policy rule is triggered.

### Principle 7: Avoid Unnecessary Dashboards

- Banish decorative "vanity metric" dashboards that force users to scroll past generic bar charts to get to their work.
- Replace empty analytical charts with actionable operational state:
  - What needs approval right now?
  - What is the reconciled cash position?
  - What is today's burn or open AR/AP?

### Principle 8: Avoid Excessive Navigation

- Flatten navigation to an intuitive, high-level hierarchy.
- Users should never be more than 2 clicks away from any core task.
- Support instant global command palette (`Cmd + K` / `Ctrl + K`) to jump to any account, vendor, invoice, or exception immediately.

### Principle 9: Prefer Contextual Actions

- Place actions directly alongside the data they affect (in-row action buttons, swipe actions, contextual hover bars).
- Avoid redirecting users to separate "Edit" pages just to confirm a category or change an account code.

### Principle 10: Explain AI Decisions Clearly

- Every AI recommendation must answer:
  1. _What did the agent propose?_
  2. _Why did it make this choice?_ (e.g., _"Matched to recurring vendor 'GitHub Inc.' based on 14 prior identical monthly charges"_).
  3. _What is the confidence level?_

### Principle 11: Make Financial Actions Auditable & Reversible

- Every state change must record actor, timestamp, prior state, and new state.
- Where safe, provide an immediate **"Undo"** notification toast (10-second grace window) before permanently locking ledger entries.

---

## 3. Explicit Operational State Indicators

Every transaction, proposal, bill, invoice, or background process in the application must clearly display one of five standardized operational states. Ambiguous states (e.g., a generic spinner or unlabelled row) are strictly prohibited.

```
┌─────────────────┐   Confidence >= 95%   ┌─────────────────┐   Post / Clear   ┌─────────────────┐
│   [SUGGESTED]   │ ────────────────────> │  [AWAITING APP] │ ───────────────> │   [COMPLETED]   │
└────────┬────────┘   or Policy Threshold └────────┬────────┘                  └─────────────────┘
         │                                         │
         │ Parsing / Rule Failure                  │ User Rejection / Network Error
         ▼                                         ▼
┌─────────────────┐                       ┌─────────────────┐
│    [FAILED]     │                       │    [FAILED]     │
└─────────────────┘                       └─────────────────┘

* Note: High-confidence routine items may bypass [AWAITING APP] and move directly to [COMPLETED]
  via straight-through processing, tagged explicitly as [AUTOMATIC].
```

### The 5 Standard System States

| State                   | Purpose & Meaning                                                                                                   | Badge Visual Specification                                            | User Action Required                                        |
| :---------------------- | :------------------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------- | :---------------------------------------------------------- |
| **`AUTOMATIC`**         | Executed autonomously by the agent with zero human intervention. High confidence, compliant with all guardrails.    | Pill badge, subtle neutral/slate border, muted checkmark icon.        | None. Informational only (auditable).                       |
| **`SUGGESTED`**         | Proposed by AI agent based on document extraction or matching heuristics; waiting for evaluation or auto-run timer. | Pill badge, subtle blue/cyan background, sparkle or robot icon.       | Quick glance; will auto-promote or escalate.                |
| **`AWAITING APPROVAL`** | Explicit human sign-off required (low confidence, high dollar threshold, or policy trigger).                        | Pill badge, prominent amber/warm-gold background, alert circle icon.  | **Immediate attention.** 1-click Approve or Modify.         |
| **`COMPLETED`**         | Fully executed, balanced, and posted to the immutable general ledger or bank record.                                | Pill badge, calm emerald green background, solid checkmark icon.      | None. Item is settled and locked.                           |
| **`FAILED`**            | Extraction failure, mathematical unbalance, network failure, or explicit user rejection.                            | Pill badge, clear crimson/ruby red background, warning triangle icon. | **Investigation required.** Clear explanation + manual fix. |

---

## 4. Visual Identity & Aesthetic Standards

### 4.1 Emotional Tone: Calm, Financial Authority

The application must convey the rigor of a Swiss private bank blended with the speed and precision of a world-class developer tool (e.g., Linear, Stripe).

- **No Gimmicks:** Strictly avoid floating 3D graphics, heavy glowing drop-shadows, trendy glassmorphism, distracting particle animations, or playful cartoon illustrations.
- **Functional Polish:** Micro-interactions must be fast ($< 150\text{ms}$ transitions), purposeful, and crisp. Animations exist solely to indicate state transitions (e.g., an exception row smoothly sliding out upon approval).

### 4.2 Semantic Design Token System

Developers must use **semantic CSS variables / design tokens** across all components. **Hard-coded hex codes and ad-hoc color classes are prohibited.**

```
Semantic Token Hierarchy:
├── Surface / Background:   --bg-canvas, --bg-surface, --bg-subtle, --bg-elevated
├── Border / Divider:       --border-subtle, --border-strong, --border-focus
├── Typography:             --text-primary, --text-secondary, --text-muted, --text-inverse
├── Brand / Interactive:    --primary, --primary-hover, --primary-contrast
└── Semantic Feedback:
    ├── Success (Completed):--success-bg, --success-border, --success-text
    ├── Warning (Attention):--warning-bg, --warning-border, --warning-text
    ├── Danger  (Failed):   --danger-bg,  --danger-border,  --danger-text
    └── Info    (Suggested):--info-bg,    --info-border,    --info-text
```

#### Token Palette Specifications

| Token Role         | Light Mode Value (HSL / Hex)     | Dark Mode Value (HSL / Hex)      | Usage                            |
| :----------------- | :------------------------------- | :------------------------------- | :------------------------------- |
| `--bg-canvas`      | `hsl(210, 20%, 98%)` (`#F8FAFC`) | `hsl(222, 47%, 7%)` (`#0B0F19`)  | Underlying application canvas    |
| `--bg-surface`     | `hsl(0, 0%, 100%)` (`#FFFFFF`)   | `hsl(217, 33%, 12%)` (`#131B2E`) | Cards, table containers, sheets  |
| `--bg-subtle`      | `hsl(210, 20%, 95%)` (`#F1F5F9`) | `hsl(217, 33%, 16%)` (`#1A243B`) | Row hover, secondary input bg    |
| `--border-subtle`  | `hsl(214, 32%, 91%)` (`#E2E8F0`) | `hsl(217, 25%, 20%)` (`#24304A`) | Table dividers, card borders     |
| `--border-strong`  | `hsl(215, 20%, 75%)` (`#CBD5E1`) | `hsl(217, 20%, 32%)` (`#3E4E6E`) | Focused inputs, active borders   |
| `--text-primary`   | `hsl(222, 47%, 11%)` (`#0F172A`) | `hsl(210, 40%, 98%)` (`#F8FAFC`) | High-contrast body, table values |
| `--text-secondary` | `hsl(215, 16%, 47%)` (`#64748B`) | `hsl(215, 20%, 65%)` (`#94A3B8`) | Labels, metadata, captions       |
| `--text-muted`     | `hsl(215, 16%, 65%)` (`#94A3B8`) | `hsl(215, 16%, 45%)` (`#64748B`) | Disabled items, hints            |
| `--primary`        | `hsl(221, 83%, 53%)` (`#2563EB`) | `hsl(217, 91%, 60%)` (`#3B82F6`) | Primary action buttons           |
| `--success-base`   | `hsl(158, 64%, 42%)` (`#10B981`) | `hsl(158, 64%, 45%)` (`#10B981`) | Balanced, Completed, Verified    |
| `--warning-base`   | `hsl(38, 92%, 50%)` (`#F59E0B`)  | `hsl(38, 92%, 50%)` (`#F59E0B`)  | Awaiting Review, Needs Match     |
| `--danger-base`    | `hsl(0, 84%, 60%)` (`#EF4444`)   | `hsl(0, 84%, 60%)` (`#EF4444`)   | Failed, Unbalanced, Error        |

### 4.3 Typography & Numerical Clarity

- **Font Family:** Inter or system sans-serif (`system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`).
- **Tabular Figures for Accounting:** All currency amounts, balances, invoice numbers, dates, and percentages **must** enforce tabular numerical spacing:
  ```css
  .tabular-nums,
  .currency,
  .balance,
  .table-cell-amount {
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
  }
  ```
- **Alignment Rule:** Currency amounts and numbers in data tables must **always be right-aligned**. Headers for numeric columns must likewise be right-aligned with the figures below them.

---

## 5. Responsive Behavior: Mobile-First Strategy

The platform is engineered to support busy founders on a phone in an airport, controllers reviewing exceptions on an iPad, and accountants running multi-window month-end closes on desktop monitors.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ DESKTOP (> 1024px)                                                          │
│ ┌──────────┬──────────────────────────────────────────────────────────────┐ │
│ │ Collapsed│ Breadcrumbs • Organization Switcher • Search [Cmd+K] • Theme │ │
│ │ or Fixed ├──────────────────────────────────────────────────────────────┤ │
│ │ Side Nav │ Dense Data Tables • Split-Screen PDF/Proposal Verification   │ │
│ │          │ Multi-Column Reconcile View • Bulk Action Sticky Bottom Bar  │ │
│ └──────────┴──────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│ TABLET (768px - 1024px)                                                     │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Top Bar: Brand • Quick Stats • Search • Profile Drawer                  │ │
│ │ Collapsible Off-Canvas Navigation • Horizontal Scrollable Data Tables   │ │
│ │ Touch-Friendly Slide-Over Drawers for Exception Inspection              │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│ MOBILE (< 768px)                                                            │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ App Header: Cash Balance • Urgent Action Count [3]                      │ │
│ │ Card-Based Feed (Triage Deck) • 1 Exception per Card                    │ │
│ │ Big Touch Targets (min 44x44px) • Swipe to Approve / Tap to Inspect     │ │
│ │ Bottom App Bar: [Review (3)]  [Cash]  [Activity]  [More]                │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Form-Factor Specifications

#### 1. Desktop Experience ($> 1024px$)

- **Layout:** Persistent or collapsible side navigation with high screen efficiency.
- **Workspace Density:** High-information tables with sorting, quick filter chips, and inline action bars that appear on row hover.
- **Side-by-Side Verification:** When resolving an exception (e.g., bank line vs. vendor invoice), desktop displays a split view: original PDF on the left, AI proposal and ledger impact on the right.
- **Keyboard Navigation:** Full power-user keyboard accessibility (`J`/`K` to navigate rows, `A` to approve, `E` to edit, `X` to reject, `/` to filter).

#### 2. Tablet Experience ($768px - 1024px$)

- **Layout:** Top bar with responsive off-canvas side drawer.
- **Touch Targets:** Minimum interactive target size of $40 \times 40\text{px}$.
- **Inspection Drawers:** Clicking an exception slides open a 50% width right drawer for review, preserving table context underneath.

#### 3. Mobile Experience ($< 768px$)

- **Mobile-First Priority:** Mobile is an executive approval & monitoring console, not a general ledger configuration editor.
- **Cards Over Massive Tables:** Data tables convert into clean, vertical card decks.
- **Triage View:** The mobile home screen opens directly to **"Needs Attention"**, presenting open exceptions as prioritized cards.
- **Bottom Navigation Bar:** Fixed bottom bar with 4 primary targets (`Triage`, `Cash`, `Activity`, `Menu`). Touch targets are minimum $44 \times 44\text{px}$.

---

## 6. Authoritative UX Rules for Developers

Engineers building frontend features for the Agentic Business OS must adhere strictly to these 10 implementation rules. Pull requests that violate these rules must be blocked.

### Rule 1: No Unlabeled AI Proposals

- **Violation:** Displaying a category or account code without indicating how it was populated.
- **Mandate:** Any field populated by an AI agent must carry a subtle visual indicator (`AI Suggestion` badge or sparkle icon) and expose the rationale on hover/focus.

### Rule 2: Strict Double-Entry Verification in the UI

- **Violation:** Allowing a user to submit a manual or modified journal entry where $\sum \text{Debits} \ne \sum \text{Credits}$.
- **Mandate:** The submission button must remain disabled, displaying a live delta tag: _"Unbalanced: +$14.20 Debit discrepancy"_.

### Rule 3: Reversible Actions & Instant Feedback

- **Violation:** Showing a blocking modal saying _"Are you sure you want to approve this \$25.00 transaction?"_.
- **Mandate:** Approve immediately, animate the item off the screen, and display an ephemeral bottom toast: _"Transaction #1084 reconciled &middot; [Undo (8s)]"_.

### Rule 4: Right-Align All Currency Figures

- **Violation:** Left-aligning or centering dollar values in tables.
- **Mandate:** Align numeric values to the right. Use tabular numerals (`tabular-nums`) to ensure decimal points vertically align across all rows.

### Rule 5: Standardized Empty & Zero States

- **Violation:** An empty white box with _"No records found"_.
- **Mandate:** Empty states must celebrate productivity:
  - Example for Exception Center: _"All caught up! Zero exceptions pending. The AI Accountant processed 42 transactions today without issues."_ with a link to the Activity Log.

### Rule 6: No Modal Stacking

- **Violation:** Opening a modal dialog on top of another modal dialog.
- **Mandate:** Use slide-over sheets for secondary drill-downs, or replace the content within the current sheet with clean back-navigation breadcrumbs.

### Rule 7: Zero Jargon in Error Messages

- **Violation:** _"NullReferenceException: Cannot read property 'id' of undefined at LedgerService:142"_.
- **Mandate:** Plain-language financial explanation: _"We couldn't match this transaction because the vendor 'Acme Corp' has no default expense account configured. [Select an Account]"_.

### Rule 8: Loading State Skeletons Over Spinners

- **Violation:** A blank white screen with a centered spinning circle.
- **Mandate:** Render structural skeleton screens mirroring the exact layout of the target table or card deck to minimize perceived layout shift.

### Rule 9: Optimistic UI Updates for User Approvals

- **Violation:** Freezing the UI for 1.5 seconds while waiting for the server to confirm a single exception approval.
- **Mandate:** Optimistically transition the item to `COMPLETED` immediately; roll back gracefully with an alert toast if the API returns an error.

### Rule 10: Strict Contrast & Color-Blind Safety

- **Violation:** Using color alone (e.g., green dot vs. red dot) to communicate status.
- **Mandate:** Always pair color with an explicit text label or unambiguous icon (e.g., checkmark, warning triangle, clock) to guarantee accessibility.

---

## 7. Component Pattern Blueprints

### 7.1 The Exception Card Pattern (Mobile & Desktop Drawer)

```
┌────────────────────────────────────────────────────────────────────────┐
│ [!] AWAITING APPROVAL                           Confidence: 84%        │
├────────────────────────────────────────────────────────────────────────┤
│ Date: Oct 02, 2026      Account: Silicon Valley Bank (...4092)         │
│ Raw Description:        AMZN MKTP US*2A8194 RETAIL SEATTLE WA          │
│ Amount:                 -$148.50                                       │
├────────────────────────────────────────────────────────────────────────┤
│ AI Proposal:                                                           │
│ Vendor:                 Amazon.com LLC [Mapped from history]           │
│ Account:                6200 - Office Supplies & Equipment             │
│ Rationale:              "Matches 6 previous purchases under $200 from  │
│                          this merchant. Receipt not yet attached."     │
├────────────────────────────────────────────────────────────────────────┤
│ [ Approve (Enter) ]        [ Modify Category (M) ]        [ Reject (X) ]│
└────────────────────────────────────────────────────────────────────────┘
```

### 7.2 The Reconciled Stream Summary (Quiet Background Pattern)

```
┌────────────────────────────────────────────────────────────────────────┐
│ ✓ 38 Transactions Auto-Reconciled                    Total: $14,290.40  │
│ Chase Operating (...8812) • Ingested 12m ago • 0 Exceptions Flagged    │
│                                                   [ View Ledger Entries ]│
└────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Summary Checklist for Feature Delivery

Before shipping any UI screen or component, verify:

- [ ] Can the user immediately tell what the AI did, what needs attention, and what can be ignored?
- [ ] Are all financial states categorized under one of the 5 explicit states (`AUTOMATIC`, `SUGGESTED`, `AWAITING APPROVAL`, `COMPLETED`, `FAILED`)?
- [ ] Is the primary action visually distinct and bound to a primary keyboard shortcut on desktop?
- [ ] Does the screen look great and function seamlessly on a $375\text{px}$ mobile viewport without horizontal scrolling?
- [ ] Are all color usages referencing semantic design tokens (`--bg-surface`, `--text-primary`, etc.) in both light and dark modes?
- [ ] Are currency amounts and balance totals right-aligned with `tabular-nums`?
- [ ] Is there an immediate "Undo" pathway or confirmation safeguard for destructive actions?
