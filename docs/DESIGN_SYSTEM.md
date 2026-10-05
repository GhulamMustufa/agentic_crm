# Design System Specification: Agentic Business OS

**Document Status:** Authoritative Frontend Design System  
**Version:** 1.0.0  
**Stack Target:** React 18+, Tailwind CSS (v3/v4), Radix UI Primitives, Lucide Icons  
**Design Philosophy:** Minimalist, Purpose-Driven, High-Density Financial Precision

---

## 1. Design System Philosophy & Architecture

Every component in this design system exists for a concrete operational reason. We strictly avoid adding components simply because legacy enterprise ERPs have them (e.g., no multi-nested tree grids, no ornamental gauge charts, no 5-tier nested tab bars).

### Core Principles

1. **Semantic Color Tokens Only:** No component directly references raw hex codes or fixed Tailwind color steps (e.g., avoid `bg-blue-600` or `text-slate-900` in component templates). All classes reference semantic CSS tokens mapped into Tailwind config (e.g., `bg-primary`, `bg-surface`, `text-primary`, `border-subtle`).
2. **Tabular Numerical Alignment:** Currency, dates, and quantitative figures always use `tabular-nums` and right-align in tables.
3. **Accessibility First:** Built upon headless accessible primitives (Radix UI / ARIA patterns) with standard focus rings, keyboard navigation, and high contrast compliance.
4. **Zero Vanity Noise:** Shadows are soft and restrained. Animations strictly serve state communication ($100-150\text{ms}$).

---

## 2. Design Tokens & Tailwind Configuration

### 2.1 CSS Variables Definition (`globals.css`)

```css
@layer base {
  :root {
    /* Backgrounds & Surfaces */
    --bg-canvas: 210 20% 98%; /* #f8fafc */
    --bg-surface: 0 0% 100%; /* #ffffff */
    --bg-subtle: 210 20% 95%; /* #f1f5f9 */
    --bg-elevated: 0 0% 100%; /* #ffffff */
    --bg-overlay: 222 47% 11% / 0.5; /* Backdrop with opacity */

    /* Typography */
    --text-primary: 222 47% 11%; /* #0f172a - High contrast text */
    --text-secondary: 215 16% 47%; /* #64748b - Labels & metadata */
    --text-muted: 215 16% 65%; /* #94a3b8 - Placeholders & hints */
    --text-inverse: 210 40% 98%; /* #f8fafc - High contrast on dark */

    /* Borders */
    --border-subtle: 214 32% 91%; /* #e2e8f0 - Dividers & cards */
    --border-strong: 215 20% 75%; /* #cbd5e1 - Inputs & active items */
    --border-focus: 221 83% 53%; /* #2563eb - Focus rings */

    /* Brand & Primary Actions */
    --primary: 221 83% 53%; /* #2563eb */
    --primary-hover: 224 76% 48%; /* #1d4ed8 */
    --primary-foreground: 0 0% 100%; /* #ffffff */

    /* Functional / Status Tokens */
    --success-bg: 152 76% 96%; /* #ecfdf5 */
    --success-border: 149 80% 80%; /* #a7f3d0 */
    --success-text: 161 94% 20%; /* #065f46 */
    --success-base: 158 64% 42%; /* #10b981 */

    --warning-bg: 48 100% 96%; /* #fffbeb */
    --warning-border: 45 93% 77%; /* #fde68a */
    --warning-text: 35 92% 23%; /* #92400e */
    --warning-base: 38 92% 50%; /* #f59e0b */

    --danger-bg: 0 86% 97%; /* #fef2f2 */
    --danger-border: 0 93% 82%; /* #fecaca */
    --danger-text: 0 74% 32%; /* #991b1b */
    --danger-base: 0 84% 60%; /* #ef4444 */

    --info-bg: 214 100% 97%; /* #eff6ff */
    --info-border: 213 94% 85%; /* #bfdbfe */
    --info-text: 219 78% 30%; /* #1e40af */
    --info-base: 221 83% 53%; /* #2563eb */

    /* Radii & Shadows */
    --radius-sm: 0.25rem; /* 4px */
    --radius-md: 0.375rem; /* 6px */
    --radius-lg: 0.5rem; /* 8px */
    --radius-full: 9999px;
  }

  .dark {
    /* Backgrounds & Surfaces */
    --bg-canvas: 222 47% 7%; /* #0b0f19 - Deep dark slate */
    --bg-surface: 217 33% 12%; /* #131b2e - Slightly raised container */
    --bg-subtle: 217 33% 16%; /* #1a243b - Hover & sub-rows */
    --bg-elevated: 217 33% 18%; /* #202b44 - Modals & popovers */
    --bg-overlay: 222 47% 4% / 0.75;

    /* Typography */
    --text-primary: 210 40% 98%; /* #f8fafc */
    --text-secondary: 215 20% 65%; /* #94a3b8 */
    --text-muted: 215 16% 45%; /* #64748b */
    --text-inverse: 222 47% 11%; /* #0f172a */

    /* Borders */
    --border-subtle: 217 25% 20%; /* #24304a */
    --border-strong: 217 20% 32%; /* #3e4e6e */
    --border-focus: 217 91% 60%; /* #3b82f6 */

    /* Brand & Primary Actions */
    --primary: 217 91% 60%; /* #3b82f6 */
    --primary-hover: 221 83% 53%; /* #2563eb */
    --primary-foreground: 0 0% 100%;

    /* Functional / Status Tokens (Subtle dark-mode variants) */
    --success-bg: 160 84% 10%; /* Deep green tint */
    --success-border: 160 70% 22%;
    --success-text: 152 76% 75%;
    --success-base: 158 64% 45%;

    --warning-bg: 35 100% 10%; /* Deep amber tint */
    --warning-border: 35 80% 24%;
    --warning-text: 45 93% 75%;
    --warning-base: 38 92% 50%;

    --danger-bg: 0 75% 12%; /* Deep crimson tint */
    --danger-border: 0 65% 26%;
    --danger-text: 0 85% 80%;
    --danger-base: 0 84% 60%;

    --info-bg: 222 80% 12%; /* Deep blue tint */
    --info-border: 217 70% 25%;
    --info-text: 213 94% 82%;
    --info-base: 217 91% 60%;
  }
}
```

### 2.2 Tailwind Config Mapping (`tailwind.config.js`)

```javascript
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: 'hsl(var(--bg-canvas) / <alpha-value>)',
        surface: {
          DEFAULT: 'hsl(var(--bg-surface) / <alpha-value>)',
          subtle: 'hsl(var(--bg-subtle) / <alpha-value>)',
          elevated: 'hsl(var(--bg-elevated) / <alpha-value>)',
        },
        content: {
          primary: 'hsl(var(--text-primary) / <alpha-value>)',
          secondary: 'hsl(var(--text-secondary) / <alpha-value>)',
          muted: 'hsl(var(--text-muted) / <alpha-value>)',
          inverse: 'hsl(var(--text-inverse) / <alpha-value>)',
        },
        border: {
          subtle: 'hsl(var(--border-subtle) / <alpha-value>)',
          strong: 'hsl(var(--border-strong) / <alpha-value>)',
          focus: 'hsl(var(--border-focus) / <alpha-value>)',
        },
        brand: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          hover: 'hsl(var(--primary-hover) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        status: {
          success: {
            bg: 'hsl(var(--success-bg))',
            border: 'hsl(var(--success-border))',
            text: 'hsl(var(--success-text))',
            base: 'hsl(var(--success-base))',
          },
          warning: {
            bg: 'hsl(var(--warning-bg))',
            border: 'hsl(var(--warning-border))',
            text: 'hsl(var(--warning-text))',
            base: 'hsl(var(--warning-base))',
          },
          danger: {
            bg: 'hsl(var(--danger-bg))',
            border: 'hsl(var(--danger-border))',
            text: 'hsl(var(--danger-text))',
            base: 'hsl(var(--danger-base))',
          },
          info: {
            bg: 'hsl(var(--info-bg))',
            border: 'hsl(var(--info-border))',
            text: 'hsl(var(--info-text))',
            base: 'hsl(var(--info-base))',
          },
        },
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        elevated: '0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.04)',
        modal: '0 10px 15px -3px rgba(0, 0, 0, 0.12), 0 4px 6px -4px rgba(0, 0, 0, 0.08)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
};
```

---

## 3. Core Foundation Tokens

### 3.1 Typography Hierarchy

| Style Token         | Font Size / Line Height                   | Weight         | Tailwind Utility Classes                                                  | Use Case                                     |
| :------------------ | :---------------------------------------- | :------------- | :------------------------------------------------------------------------ | :------------------------------------------- |
| **Heading 1**       | $24\text{px} / 32\text{px}$ (`1.5rem`)    | SemiBold (600) | `text-2xl font-semibold tracking-tight text-content-primary`              | Page title (single per screen)               |
| **Heading 2**       | $18\text{px} / 26\text{px}$ (`1.125rem`)  | SemiBold (600) | `text-lg font-semibold text-content-primary`                              | Card/Drawer title, section headers           |
| **Heading 3**       | $14\text{px} / 20\text{px}$ (`0.875rem`)  | Medium (500)   | `text-sm font-medium text-content-primary`                                | Sub-sections, table column group headers     |
| **Body (Default)**  | $14\text{px} / 20\text{px}$ (`0.875rem`)  | Regular (400)  | `text-sm text-content-primary`                                            | Default text, descriptions, table body       |
| **Body Secondary**  | $13\text{px} / 18\text{px}$ (`0.8125rem`) | Regular (400)  | `text-xs text-content-secondary`                                          | Timestamps, secondary notes, hints           |
| **Label / Caption** | $11\text{px} / 14\text{px}$ (`0.6875rem`) | Medium (500)   | `text-[11px] font-medium uppercase tracking-wider text-content-secondary` | Table header titles, metadata tags           |
| **Tabular Numbers** | Inherited / $14\text{px}$                 | Medium (500)   | `tabular-nums font-mono text-sm text-content-primary`                     | Currency balances, bank amounts, invoice IDs |

### 3.2 Spacing & Layout Scale

- Built on a standard $4\text{px}$ increment grid:
  - `space-1` ($4\text{px}$): Tight inline badge padding, icon margins.
  - `space-2` ($8\text{px}$): Input padding, gap between compact actions.
  - `space-3` ($12\text{px}$): Table cell vertical padding, card inner gutter.
  - `space-4` ($16\text{px}$): Standard card padding, toolbar spacing.
  - `space-6` ($24\text{px}$): Page margin on mobile, section dividers.
  - `space-8` ($32\text{px}$): Desktop layout outer gutters.

### 3.3 Shadows & Elevation

- **No Shadow:** Flat surfaces and sub-rows use `shadow-none border border-border-subtle`.
- **Subtle (`shadow-subtle`):** Base cards and table containers.
- **Elevated (`shadow-elevated`):** Dropdowns, tooltips, slide-over panels.
- **Modal (`shadow-modal`):** Dialog overlays, command menu palette.

---

## 4. Reusable Component Specifications

### 4.1 Buttons

Buttons represent actionable intent. Every screen has at most **one primary button**.

```tsx
// Variants & Usage:
// 1. Primary: One per screen (Approve, Save, Ingest)
// 2. Secondary: Supporting actions (Filter, Export, Cancel)
// 3. Ghost: Inline table actions, icon triggers
// 4. Danger: Irreversible destructive actions (Reject, Delete)
```

| Variant         | Tailwind Classes                                                                                                                                                                          | Focus / State Notes                                                                           |
| :-------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------- |
| **Primary**     | `bg-brand text-brand-foreground hover:bg-brand-hover active:scale-[0.99] font-medium text-sm px-3.5 py-1.5 rounded-md shadow-subtle transition-all duration-100`                          | Focus ring: `focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:outline-none` |
| **Secondary**   | `bg-surface hover:bg-surface-subtle text-content-primary border border-border-subtle font-medium text-sm px-3.5 py-1.5 rounded-md shadow-subtle transition-all`                           | Standard non-accented action.                                                                 |
| **Ghost**       | `hover:bg-surface-subtle text-content-secondary hover:text-content-primary font-medium text-sm px-2.5 py-1.5 rounded-md transition-colors`                                                | Minimalist inline action.                                                                     |
| **Danger**      | `bg-status-danger-bg text-status-danger-text border border-status-danger-border hover:bg-status-danger-text hover:text-white font-medium text-sm px-3.5 py-1.5 rounded-md transition-all` | Requires explicit user intent.                                                                |
| **Icon Button** | `h-8 w-8 inline-flex items-center justify-center rounded-md text-content-secondary hover:text-content-primary hover:bg-surface-subtle transition-colors`                                  | For search toggles, row actions.                                                              |

---

### 4.2 Inputs & Numeric Controls

Accounting requires error-free data entry. Numerical and currency fields are formatted consistently.

```tsx
// Text Input Standard:
<div className="relative">
  <input
    type="text"
    className="w-full bg-surface border border-border-subtle focus:border-border-focus
               focus:ring-1 focus:ring-border-focus rounded-md px-3 py-1.5 text-sm
               text-content-primary placeholder:text-content-muted transition-colors"
  />
</div>

// Currency / Monetary Input (Right-aligned, tabular):
<div className="relative flex items-center">
  <span className="absolute left-3 text-content-muted text-sm">$</span>
  <input
    type="text"
    inputMode="decimal"
    placeholder="0.00"
    className="w-full bg-surface border border-border-subtle focus:border-border-focus
               rounded-md pl-7 pr-3 py-1.5 text-sm text-right tabular-nums font-mono
               text-content-primary transition-colors"
  />
</div>
```

---

### 4.3 Selects & Comboboxes

- Replaces raw HTML `<select>` with keyboard-navigable combobox (Radix UI Select or Popover).
- Allows instant live filtering by typing account codes (e.g., typing `6100` or `Software` immediately jumps to the Chart of Accounts item).
- Selected state clearly displays the code and name: `6100 · Software & Subscriptions`.

---

### 4.4 Data Tables (Financial Grade)

Data tables are the primary working surface for accountants. They must be dense, legible, and right-align all numerical quantities.

```tsx
<div className="w-full overflow-x-auto rounded-lg border border-border-subtle bg-surface shadow-subtle">
  <table className="w-full text-left text-sm border-collapse">
    <thead className="bg-surface-subtle border-b border-border-subtle text-[11px] font-medium uppercase tracking-wider text-content-secondary">
      <tr>
        <th className="py-2.5 px-3">Date</th>
        <th className="py-2.5 px-3">Description / Payee</th>
        <th className="py-2.5 px-3">Account Proposal</th>
        <th className="py-2.5 px-3">Status</th>
        <th className="py-2.5 px-3 text-right">Amount</th>
        <th className="py-2.5 px-3 text-right">Actions</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-border-subtle text-content-primary">
      <tr className="hover:bg-surface-subtle transition-colors group">
        <td className="py-2.5 px-3 text-content-secondary whitespace-nowrap">2026-10-02</td>
        <td className="py-2.5 px-3 font-medium">GitHub Inc.</td>
        <td className="py-2.5 px-3 text-content-secondary">6100 · Software</td>
        <td className="py-2.5 px-3">
          <Badge status="automatic" />
        </td>
        <td className="py-2.5 px-3 text-right tabular-nums font-mono font-medium">-$42.00</td>
        <td className="py-2.5 px-3 text-right opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="sm">
            Inspect
          </Button>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

---

### 4.5 AI Status Badges & Operational Indicators

The interface strictly differentiates between autonomous machine actions, recommendations, and required human sign-offs.

```tsx
// Component: <StatusBadge variant={status} label={customLabel} />
```

| Status Key              | Visual Specification                               | Tailwind Class String                                                                                                                                                                  | Rendered Appearance    |
| :---------------------- | :------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------- |
| **`automatic`**         | Subtle slate/neutral outline with solid checkmark. | `inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-surface-subtle border border-border-subtle text-content-secondary`                                   | `[✓ Auto-Reconciled]`  |
| **`suggested`**         | Light blue/cyan tint with Sparkle icon.            | `inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-status-info-bg border border-status-info-border text-status-info-text`                               | `[✦ AI Suggestion]`    |
| **`awaiting_approval`** | High-contrast amber tint with Alert icon.          | `inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-status-warning-bg border border-status-warning-border text-status-warning-text animate-pulse-subtle` | `[● Needs Approval]`   |
| **`completed`**         | Calm emerald green with checkmark.                 | `inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-status-success-bg border border-status-success-border text-status-success-text`                      | `[✓ Cleared / Posted]` |
| **`failed`**            | Clear ruby red with exclamation mark.              | `inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-status-danger-bg border border-status-danger-border text-status-danger-text`                         | `[! Extraction Error]` |

---

### 4.6 Cards & Exception Deck

Cards house discrete operational units. On mobile, cards replace wide tables entirely.

- **Exception Card Anatomy:**
  1. **Header:** Status Pill (`Needs Approval`), Source Account badge, Confidence score meter.
  2. **Core Body:** Transaction amount (prominently displayed in right-aligned or bold header), raw statement string vs. cleaned counterparty name.
  3. **AI Rationale Box:** Subtle info-surface box explaining _why_ the proposal was formed.
  4. **Action Footer:** Primary **Approve** button, secondary **Modify** and **Reject** buttons.

---

### 4.7 Alerts & Callouts

Alerts communicate system-level operational feedback. They are never dismissed without saving or resolving the underlying issue.

- **Types:**
  - **Success:** Green banner for batch completed (`"42 items reconciled successfully"`).
  - **Warning:** Amber banner for threshold triggers (`"Statement opening balance differs from cash ledger by $12.00"`).
  - **Danger:** Red banner for critical blockers (`"Double-entry invariant violated: Ledger is out of balance by $400.00"`).
- **Styling:** Left-bordered card (`border-l-4 border-status-warning-base bg-status-warning-bg p-3 rounded-r-md text-sm text-status-warning-text`).

---

### 4.8 Modals & Slide-Over Drawers

- **Modals (Dialogs):** Used exclusively for high-friction, decisive moments (e.g., closing an accounting period, confirming a batch reject). Dimensions: constrained width ($480\text{px} - 560\text{px}$), centered with dark semi-transparent backdrop (`bg-overlay`).
- **Slide-Over Drawers (Sheets):** Used for inspecting details (e.g., viewing a 10-line journal entry, checking the uploaded PDF statement alongside the parsed table).
  - Opens from right on desktop ($480\text{px} - 640\text{px}$).
  - Opens from bottom on mobile as a bottom sheet.

---

### 4.9 Command Menu (`Cmd + K`)

The primary power-user navigation component.

- Instant global search indexed by:
  - Accounts (`1010 - Checking`, `6100 - Software`)
  - Vendors & Customers (`Stripe`, `AWS`, `Acme Corp`)
  - Invoices & Transactions (`#INV-2026-081`, `$1,420.00`)
  - Navigation shortcuts (`Go to Exception Center`, `View Trial Balance`)

---

### 4.10 Navigation Architecture

```
Desktop Navigation:
┌────────────────────────────────────────────────────────────────────────┐
│ [Logo] Agentic OS  |  Org: Acme Corp [v]  |  [ Search Cmd+K ]  | (Theme)│
├──────────────┬─────────────────────────────────────────────────────────┤
│ • Exceptions │                                                         │
│ • Banking    │  Main Application Workspace                             │
│ • Ledger     │                                                         │
│ • Invoices   │                                                         │
│ • Reports    │                                                         │
│ • Settings   │                                                         │
└──────────────┴─────────────────────────────────────────────────────────┘

Mobile Navigation:
┌────────────────────────────────────────────────────────────────────────┐
│ Header: [Logo] Acme Corp                          Exceptions: (3) [!]  │
├────────────────────────────────────────────────────────────────────────┤
│ Vertical Triage Deck                                                   │
├────────────────────────────────────────────────────────────────────────┤
│ Bottom Bar: [ Triage (3) ]   [ Banking ]   [ Activity ]   [ Menu ]     │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 4.11 Empty, Loading, and Error States

1. **Empty States:** Must be affirmative and informative.
   - _Example:_ An empty Exception Center displays an emerald icon, a calm title _"Zero Pending Exceptions"_, and a sub-caption _"All 142 statement items for October have been matched and posted."_
2. **Loading States:** No spinning wheels blocking the entire page.
   - Table skeleton loaders: 5 pulsed rectangular rows (`bg-surface-subtle animate-pulse h-9 w-full rounded`).
3. **Error States:** Contextual and recoverable.
   - Always provide an explicit remedy button (`"Retry Extraction"`, `"Manual Classification"`, `"Contact Support"`).

---

## 5. Developer Implementation Rules

To maintain aesthetic consistency and code maintainability, frontend developers must adhere to these five component rules:

1. **Rule 1: No Arbitrary Color Classes:** Do not write `text-gray-500`, `bg-blue-600`, or `border-zinc-200`. Use `text-content-secondary`, `bg-brand`, and `border-border-subtle`.
2. **Rule 2: Currency Formatter Utility:** Never manually concatenate `'$' + amount`. Always use the standardized currency helper:
   ```typescript
   export function formatCurrency(amount: number, currency = 'USD'): string {
     return new Intl.NumberFormat('en-US', {
       style: 'currency',
       currency,
       minimumFractionDigits: 2,
     }).format(amount);
   }
   ```
3. **Rule 3: Confidence Score Visualization:** AI confidence scores must be formatted as integer percentages ($\text{e.g. } 94\%$) accompanied by a semantic color indicator:
   - $\ge 95\%$: Emerald (`text-status-success-base`)
   - $75\% - 94\%$: Amber (`text-status-warning-base`)
   - $< 75\%$: Muted Slate or Red (`text-status-danger-base`)
4. **Rule 4: Keyboard Action Bindings:** Every primary approval screen must support the standard accounting review keys:
   - `Enter` or `A`: Approve current proposal
   - `M`: Modify proposal
   - `X`: Reject proposal
   - `J` / `K` or `ArrowDown` / `ArrowUp`: Next / Previous item
5. **Rule 5: Responsive Table Fallback:** Any table rendered on screens $< 768\text{px}$ must either support smooth horizontal touch scrolling with sticky identification columns, or automatically switch to the card triage representation.
