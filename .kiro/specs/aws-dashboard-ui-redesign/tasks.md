# Implementation Tasks

## AWS EC2 Dashboard — UI/UX Redesign

Tasks are ordered by dependency. Each task references the requirements and design sections it satisfies.

---

- [x] 1. Create `SkeletonRow` component
  **File:** `frontend/components/SkeletonRow.tsx`
  - Create new component accepting `columns: number` prop
  - Render a `<tr>` with `columns` `<td>` cells, each containing `<div className="animate-pulse bg-slate-200 dark:bg-slate-700 rounded h-4" />`
  - No external dependencies
  **Refs:** Design §2.4, Req 7

- [x] 2. Update `StateBadge` to filled style
  **File:** `frontend/components/StateBadge.tsx`
  - Change running badge: `bg-emerald-500 text-white` (remove border/outline style)
  - Change stopped badge: `bg-slate-400 text-white`
  - Change fallback badge: `bg-amber-400 text-white`
  - Keep animated pulse dot for running, static dot for stopped
  **Refs:** Design §3.3, Req 4.6

- [x] 3. Update `StatCard` to be interactive with ratio label
  **File:** `frontend/components/StatCard.tsx`
  - Add props: `onClick?: () => void`, `isActive?: boolean`, `ratio?: string`
  - Render root as `<button>` when `onClick` provided, `<div>` otherwise
  - Add `ring-2 ring-offset-2` with appropriate color when `isActive` is true
  - Render `ratio` as `<p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">` below the value
  - Change value font from `text-3xl` to `text-2xl`
  **Refs:** Design §3.1, Req 2, Req 11

- [x] 4. Create `TopNavbar` component
  **File:** `frontend/components/TopNavbar.tsx`
  - `"use client"` — uses `usePathname()` and `useTheme()`
  - Height `h-12`, full-width, `border-b`, `bg-white dark:bg-[#161825]`
  - Left: ☁️ logo + "AWS EC2" text
  - Nav links: "Instances" (`href="/"`) and "Profiles" (`href="/profiles"`)
  - Active tab: `border-b-2 border-blue-500 text-slate-900 dark:text-white font-medium`
  - Right: theme toggle button (Sun/Moon icon from `useTheme`)
  **Refs:** Design §2.1, Req 1, Req 10

- [x] 5. Update `app/layout.tsx` to include `TopNavbar`
  **File:** `frontend/app/layout.tsx`
  - Import and render `<TopNavbar />` above `{children}` inside `ThemeProvider`
  - Wrap body content in `<div className="flex flex-col min-h-screen">`
  - Move `bg-slate-100 dark:bg-[#0f1117]` background to the body or wrapper div
  **Refs:** Design §4, Req 1.7

- [x] 6. Create `FilterToolbar` component
  **File:** `frontend/components/FilterToolbar.tsx`
  - Implement props interface from Design §2.2
  - Search input with magnifier icon
  - Three dropdown chips: Profile, State, Instance Type
  - Each chip: button that toggles open state, floating checklist panel with outside-click close via `useRef` + `useEffect`
  - Checklist items: checkbox + label, "Select all" / "Clear" links
  - Show active filter count in chip label when subset selected, e.g. "State (1)"
  - "× Clear filters" button — only visible when any filter is non-default
  - Result count label: `"N of M instances"` right-aligned
  **Refs:** Design §2.2, Req 3

- [x] 7. Create `SlideOverDrawer` component
  **File:** `frontend/components/SlideOverDrawer.tsx`
  - `"use client"` — uses `useEffect` for Escape key and portal
  - Implement props: `isOpen`, `onClose`, `title`, `children`
  - Use `createPortal(content, document.body)` — handle SSR with `mounted` state
  - Overlay: `fixed inset-0 bg-black/40 z-40`, click fires `onClose`
  - Panel: `fixed top-0 right-0 h-full w-96 z-50`, slide via `translate-x-0 / translate-x-full`
  - `transition-transform duration-300 ease-in-out` on panel
  - Escape key closes via `useEffect` event listener
  - Panel header: title + X close button
  - `role="dialog"`, `aria-modal="true"`, `aria-label={title}`
  **Refs:** Design §2.3, Req 5

- [x] 8. Update `InstanceTable` — columns, actions, persistent copy, skeleton, empty states
  **File:** `frontend/components/InstanceTable.tsx`
  - Add props: `loading?: boolean`, `onClearFilters?: () => void`, `hasActiveFilters?: boolean`
  - Remove Profile column from `COLUMNS` array
  - Remove AZ column from `COLUMNS` array
  - Add `title={inst.AZ}` tooltip to Instance Type `<td>`
  - Make copy icons always visible (remove `opacity-0 group-hover:opacity-100` from `CopyButton`)
  - Add Actions column (non-sortable) with Copy SSH button and AWS Console `<a>` link
    - Region derived as `inst.AZ.slice(0, -1)`
    - Console URL: `https://{region}.console.aws.amazon.com/ec2/v2/home?region={region}#Instances:instanceId={id}`
    - SSH command: `ssh ec2-user@{Public IP}` — disabled + muted when no IP
  - Loading state: render `Array.from({length:5}, (_,i) => <SkeletonRow key={i} columns={7} />)` in `<tbody>` when `loading`
  - Empty state (filter): show "No instances match the current filters" + "Clear filters" button when `sorted.length === 0 && hasActiveFilters`
  - Empty state (no data): show "No instances found" when `sorted.length === 0 && !hasActiveFilters`
  **Refs:** Design §3.2, Req 4, Req 7, Req 8

- [x] 9. Update `Dashboard.tsx` — remove sidebar, wire toolbar and stat cards
  **File:** `frontend/components/Dashboard.tsx`
  - Remove entire `<aside>` sidebar JSX block
  - Add `selectedTypes` state, default to all types on load
  - Add `activeStatCardFilter` state
  - Implement `handleStatCardClick(state)` — toggles `activeStatCardFilter` and sets `selectedStates`
  - Implement `handleClearAll()` — resets all four filters
  - Update filter logic to include `selectedTypes` match
  - Render `<FilterToolbar>` above stat cards, passing all filter state and handlers
  - Wire stat cards: "Running" and "Stopped" get `onClick`, `isActive`, `ratio` props; "Total" remains non-interactive
  - Update page heading to `text-lg font-semibold`
  - Update content padding to `p-6`
  - Move refresh button to page header row (next to heading), with `lastUpdated` timestamp
  - Update error state: show HTTP status + error message separately, add `CopyErrorButton`, keep "Try again"
  - Pass `loading`, `onClearFilters`, `hasActiveFilters` to `InstanceTable`
  **Refs:** Design §3.4, Req 1.6, Req 2, Req 3, Req 7, Req 9, Req 11

- [x] 10. Update `ProfilesPage.tsx` — remove sidebar, add drawer, inline delete, skeleton
  **File:** `frontend/components/ProfilesPage.tsx`
  - Remove entire `<aside>` sidebar JSX block (navigation is in `TopNavbar`)
  - Add `drawerOpen`, `drawerMode`, `drawerProfile` state
  - Add `confirmDeleteId` state (replaces `window.confirm`)
  - Add `deleteErrors: Record<number, string>` state (replaces `window.alert`)
  - Implement `openAddDrawer`, `openEditDrawer(profile)`, `closeDrawer` handlers
  - Render `<SlideOverDrawer>` with profile form content inside
  - Live preview in drawer header: `<ProfileAvatar>` + name + env tag, updates as form fields change
  - "Add Profile" button now calls `openAddDrawer` instead of `setShowAddForm`
  - Edit pencil button calls `openEditDrawer(profile)` instead of `startEdit(profile)`
  - Delete button: clicking sets `confirmDeleteId = profile.id`; row shows inline "Confirm / Cancel" controls
  - `handleDelete` no longer calls `window.confirm` or `window.alert`; errors go to `deleteErrors[id]`
  - Loading state: replace spinner with 3 skeleton rows (avatar placeholder + two text line placeholders)
  - Update page heading to `text-lg font-semibold`
  - Error state: enrich with HTTP status, "Copy error details" button, "Try again"
  **Refs:** Design §3.5, Req 5, Req 6, Req 7, Req 9, Req 10.3, Req 11
