# Frontend Engineering Standards: Agentic Business OS

**Document Status:** Authoritative Frontend Architecture & Engineering Guidelines  
**Stack Target:** Next.js (App Router), React 18+, TypeScript, Tailwind CSS, TanStack Query, Zod  
**Authority:** Governs all client-side and fullstack Next.js web application code

---

## 1. Architecture & App Router Conventions

The frontend application is built using the **Next.js App Router** with React Server Components (RSC) as the default paradigm.

### 1.1 Directory Structure

```
frontend/
├── app/                              # Next.js App Router routes
│   ├── (auth)/                       # Route group: Login, invite, setup
│   │   ├── login/
│   │   └── layout.tsx
│   ├── (dashboard)/                  # Route group: Authenticated workspace
│   │   ├── layout.tsx                # Shell: Sidebar, TopBar, CommandMenu
│   │   ├── exceptions/               # The Exception Center (Default landing)
│   │   │   ├── page.tsx              # Server Component (Initial fetch)
│   │   │   └── loading.tsx           # Skeleton screen
│   │   ├── banking/                  # Bank statements & reconciliation
│   │   ├── ledger/                   # General ledger & journal entries
│   │   └── reports/                  # Financial statements (P&L, Balance Sheet)
│   ├── api/                          # Next.js BFF (Backend-For-Frontend) proxies
│   ├── layout.tsx                    # Root HTML layout, ThemeProvider
│   └── globals.css                   # Semantic CSS tokens & Tailwind imports
├── components/                       # Shared UI & domain components
│   ├── ui/                           # Headless primitives (Button, Input, Badge, Dialog)
│   ├── feedback/                     # Skeletons, ErrorBoundaries, EmptyStates
│   └── domain/                       # Business-domain widgets (ExceptionCard, LedgerTable)
├── hooks/                            # Custom reusable React hooks
├── lib/                              # Client utilities, formatters, API client
│   ├── api-client.ts                 # Type-safe Fetch wrapper
│   ├── formatters.ts                 # Currency and date utilities
│   └── query-client.ts               # TanStack Query client configuration
└── types/                            # Frontend-specific DTOs and view models
```

### 1.2 Route Organization Rules

- **Route Groups `(group)`:** Use route groups to separate layouts (e.g., public authentication vs. authenticated dashboard shell) without impacting URL paths.
- **Colocation of Route Assets:** Route-specific helper components, hooks, or schemas that are only used in a single page must be colocated within that route directory (e.g., `app/(dashboard)/exceptions/_components/exception-filter.tsx`). Shared cross-cutting components live in `/components`.

---

## 2. Server Components vs. Client Components

Understanding the boundary between Server Components and Client Components is critical for performance and bundle size.

### 2.1 The Server Component Default Rule

- **Default to Server Components:** Every component in `app/` is a Server Component by default. Do not add `'use client'` unless the component explicitly requires:
  - Interactive state (`useState`, `useReducer`)
  - Lifecycle or side effects (`useEffect`)
  - Browser-only APIs (`window`, `localStorage`, `navigator`)
  - DOM event listeners (`onClick`, `onChange`, `onSubmit`)
  - Client-side hooks (`useQuery`, `useForm`, `useRouter`)

### 2.2 Boundary Pushing

Push `'use client'` down to the leaves of the component tree. Keep page containers and data-fetching shells as Server Components, importing compact interactive client components inside them.

```tsx
// GOOD: Server Component fetches data, passes to Client Component
// app/(dashboard)/exceptions/page.tsx (Server Component)
import { getPendingExceptions } from '@/lib/api/exceptions';
import { ExceptionListClient } from './_components/exception-list-client';

export default async function ExceptionsPage() {
  const initialData = await getPendingExceptions();

  return (
    <main className="p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-content-primary">Exception Center</h1>
        <p className="text-sm text-content-secondary">
          Review and approve AI proposals requiring human sign-off.
        </p>
      </header>
      <ExceptionListClient initialData={initialData} />
    </main>
  );
}
```

---

## 3. Data Fetching & TanStack Query

For dynamic interactive views, optimistic mutations, and real-time updates, the application uses **TanStack Query (v5)**.

### 3.1 Query Key Architecture

Query keys must follow a strictly typed hierarchical array convention:

```typescript
export const exceptionKeys = {
  all: ['exceptions'] as const,
  lists: () => [...exceptionKeys.all, 'list'] as const,
  list: (filters: ExceptionFilterParams) => [...exceptionKeys.lists(), filters] as const,
  details: () => [...exceptionKeys.all, 'detail'] as const,
  detail: (id: string) => [...exceptionKeys.details(), id] as const,
};
```

### 3.2 Data Mutation & Optimistic Updates

When approving or modifying transactions, use TanStack Query mutations with **optimistic UI updates** to ensure the interface responds in $< 50\text{ms}$.

```typescript
export function useApproveProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (proposalId: string) => api.post(`/api/v1/proposals/${proposalId}/approve`),
    onMutate: async (proposalId) => {
      // Cancel outgoing queries so they do not overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: exceptionKeys.lists() });

      // Snapshot previous state
      const previousData = queryClient.getQueryData(exceptionKeys.lists());

      // Optimistically remove the approved item from the queue
      queryClient.setQueryData(exceptionKeys.lists(), (old: any) => ({
        ...old,
        items: old.items.filter((item: any) => item.id !== proposalId),
        totalCount: old.totalCount - 1,
      }));

      return { previousData };
    },
    onError: (err, proposalId, context) => {
      // Rollback on network/validation error
      if (context?.previousData) {
        queryClient.setQueryData(exceptionKeys.lists(), context.previousData);
      }
      toast.error('Failed to approve transaction proposal. Please try again.');
    },
    onSettled: () => {
      // Invalidate to guarantee fresh server state
      queryClient.invalidateQueries({ queryKey: exceptionKeys.all });
    },
  });
}
```

---

## 4. State Management Discipline

Avoid adding heavy global state management libraries (Redux, Zustand, MobX) unless a verified global workflow requires it.

### 4.1 State Hierarchy

1. **Server State:** Handled by Server Components and TanStack Query cache.
2. **URL State (Search Parameters):** Pagination, sorting, search queries, active tab filters, and drawer open/closed state must be stored in the URL (`useSearchParams`, `useRouter`). This ensures views are bookmarkable and shareable.
3. **Local Component State (`useState`):** Form input drafts, dropdown toggle state, hover states.
4. **React Context:** Reserved exclusively for cross-cutting application configuration: `ThemeProvider`, `AuthSessionProvider`, `CommandMenuProvider`.

---

## 5. Forms & Input Validation

All form interactions and user inputs must use **React Hook Form** with **Zod** schema validation.

### 5.1 Rules for Forms

- **Define Zod Schema First:** Every form defines a strict Zod schema before building the UI.
- **Controlled via RHF:** Form controls must use React Hook Form's `register` or `Controller` (for custom select/combobox primitives).
- **Inline Error Messages:** Field errors appear directly below the offending input with `text-status-danger-text text-xs mt-1`.
- **Disable Submit During In-Flight Requests:** Buttons must show a subtle loading indicator and remain disabled during submission to prevent duplicate POST requests.

```tsx
const createAccountSchema = z.object({
  code: z.string().regex(/^\d{4}$/, 'Account code must be exactly 4 digits'),
  name: z.string().min(2, 'Account name must be at least 2 characters').max(100),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
});

type CreateAccountInput = z.infer<typeof createAccountSchema>;
```

---

## 6. Styling, Tokens & Tailwind Conventions

All styling must adhere to the design token system established in [`/docs/DESIGN_SYSTEM.md`](file:///Users/mac/Desktop/projects/agentic_crm/docs/DESIGN_SYSTEM.md).

### 6.1 Prohibited Practices

- **No Raw Hex Values or Fixed Color Steps:** Never write `className="bg-[#1e293b] text-blue-600 border-gray-200"`.
- **Use Semantic Token Classes:** Always write `className="bg-surface text-content-primary border-border-subtle"`.
- **No Inline Styles (`style={{ ... }}`):** Inline styles are prohibited except for dynamic coordinates (e.g., drag-and-drop handles or CSS variables).
- **No Arbitrary Spacing:** Stick to the 4px increment scale (`p-1`, `p-2`, `p-4`, `p-6`). Do not use ad-hoc arbitrary values like `p-[17px]`.

---

## 7. Accessibility (A11y) & Usability Standards

Financial interfaces demand absolute precision and keyboard accessibility.

- **Radix UI Primitives:** Dropdowns, dialogs, popovers, tooltips, and tabs must build upon Radix UI primitives to ensure WAI-ARIA compliance, focus trapping, and screen-reader support.
- **Keyboard Navigation:** Every actionable item must be focusable. Modals must close on `Escape`. Confirmation buttons must be actionable with `Enter`.
- **Focus Rings:** Never remove focus outlines without providing an accessible replacement:
  ```css
  focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:outline-none
  ```
- **Contrast Compliance:** All text-to-background combinations must meet WCAG 2.1 AA standards ($4.5:1$ for normal text, $3:1$ for large headings).

---

## 8. Financial Formatting & Tabular Rules

- **Tabular Numbers Mandatory:** All monetary amounts, dates, percentages, and quantity numbers must use tabular figures:
  ```tsx
  <span className="tabular-nums font-mono text-right">{formatCurrency(amount)}</span>
  ```
- **Right-Aligned Numerical Columns:** In tables and card lists, numbers align to the right edge. Headers for numeric columns must also be right-aligned.
- **Standardized Formatter Imports:** Never format currency inline. Always import `formatCurrency` and `formatIsoDate` from `@/lib/formatters`.

---

## 9. Performance & Bundle Optimization

- **Dynamic Code Splitting:** Heavy client components (e.g., PDF statement viewer, chart libraries) must be dynamically imported with `next/dynamic`:
  ```tsx
  const StatementPdfViewer = dynamic(
    () => import('@/components/domain/banking/StatementPdfViewer'),
    { loading: () => <Skeleton className="h-[600px] w-full" />, ssr: false },
  );
  ```
- **Optimize Images:** All visual assets must use `next/image` with explicit dimensions to prevent Cumulative Layout Shift (CLS).
- **Avoid Unnecessary Re-renders:** Pass stable callbacks (`useCallback`) and memoize expensive financial derived calculations (`useMemo`) when rendering large transaction lists.

---

## 10. Frontend Testing Standards

- **Unit Tests (Vitest + React Testing Library):**
  - Test individual UI components (buttons, badges, inputs, formatters).
  - Verify validation errors trigger on malformed user input.
- **Integration Tests (Mock Service Worker / MSW):**
  - Test data-fetching hooks and form submission flows with intercepted API mock responses.
- **E2E Tests (Playwright):**
  - Validate critical user workflows: login &rarr; view exceptions &rarr; approve batch &rarr; verify updated ledger view.
