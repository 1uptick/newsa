# Refactor opportunities

Suggestions after auditing pages and shared code. Apply incrementally.

---

## 1. Shared utilities (HTML / date)

**Duplication:** `capitalDashboard.tsx`, `capitalarticlePages.tsx`, and possibly others each define:

- `sanitizeHtml` / DOMPurify config
- `decodeHtmlEntities`, `getHtmlContent`
- `formatDate` / `formatCreateDate` (also in `Capital/types.ts`)

**Suggestion:** Move to a shared module, e.g. `src/lib/html.ts` and `src/lib/date.ts` (or reuse `Capital/types.ts` for date formatting), and import in all Capital pages.

---

## 2. Shared types and interfaces

**Duplication:** `capitalDashboard.tsx` defines local `DashboardItem`, `PendingItem` that overlap with `CapitalKeywordItem` and list shapes used in `capitalapproval.tsx` and `capitalkeywords.tsx`.

**Suggestion:** Centralize in `src/pages/Capital/types.ts`: export `CapitalKeywordItem`, `DashboardItem`, `PendingItem`, and any shared list-item types. Use these in dashboard, approval, keywords, and articles so one change updates all.

---

## 3. Reusable list / table layout

**Pattern:** Capital pages (Keywords, Topics/Approval, Articles, Dashboard) use similar patterns:

- Loading / error state
- List of cards or rows with actions (approve, reject, edit, etc.)
- Modals for detail or edit
- Mobile vs desktop layouts

**Suggestion:** Extract small, focused components:

- `PageState` (or similar): loading spinner, error message, empty state.
- Optional `DataTable` or `ListContainer`: receives `columns` (or config) and `data`; structure (headers, styles) is separate from data so only data drives re-renders. Memoize column config where possible.

---

## 4. Modal patterns

**Duplication:** Revise modal, read-article modal, approval modal, edit modal share similar structure: overlay, title, body, footer with Cancel + primary action.

**Suggestion:** Add a single `Modal` component (e.g. in `src/components/Modal.tsx`) with props: `open`, `onClose`, `title`, `children`, `footer`. Use it across Capital pages to cut repeated overlay/close/footer markup.

---

## 5. API fetch + state

**Pattern:** Several pages use the same pattern: `authFetch`, `useState` for list + loading + error, `useEffect` to fetch on mount or when deps change.

**Suggestion:** Consider a small `useAuthFetch` hook that returns `{ data, loading, error, refetch }` for a given URL (and optionally method/body). Use it in Capital list pages to reduce boilerplate and keep behavior consistent.

---

## 6. Constants and config

**Duplication:** Table IDs, field lists, and options (e.g. source types) are repeated in server and sometimes in client.

**Suggestion:** Keep a single source of truth: e.g. server-only for Airtable table IDs; shared constants file for field names or enums used by both (if any). Avoid duplicating the same list in multiple handlers or components.

---

## Summary

| Area              | Action                                      |
|-------------------|---------------------------------------------|
| HTML / date utils | Extract to `src/lib/html.ts`, `date.ts`     |
| Types             | Centralize in `Capital/types.ts`            |
| List/table UI     | Optional `PageState` + `DataTable`/layout   |
| Modals            | Single `Modal` component                    |
| Data fetching     | Optional `useAuthFetch` hook                |
| Constants         | Single source for table/field config        |

Applying (1) and (2) first gives the most benefit with minimal risk; (3)–(5) can be done step by step as you touch each page.
