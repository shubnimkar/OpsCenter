# Technical Design Document

## AWS EC2 Dashboard — UI/UX Redesign

**Spec:** aws-dashboard-ui-redesign  
**Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Lucide React  
**Constraint:** No new npm dependencies

---

## 1. Architecture Overview

### Current Layout Pattern
Both pages currently own their own `<aside>` sidebar. The sidebar holds the logo, nav links, theme toggle, and (on the Dashboard) filters and refresh. This means the sidebar is duplicated across two page-level components.

### New Layout Pattern

```
app/layout.tsx
└── ThemeProvider
    └── <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-[#0f1117]">
        ├── <TopNavbar />          ← NEW: shared across all routes
        └── <main>{children}</main>
```

`TopNavbar` is rendered once in `layout.tsx` above `{children}`. It reads the active route via `usePathname()` (Next.js `"use client"` component). Both `/` and `/profiles` automatically get the same navbar. Neither page component needs to render navigation or theme toggle anymore.

### New Component Tree (Dashboard page `/`)

```
Dashboard.tsx
├── FilterToolbar.tsx         ← NEW: replaces sidebar filters
├── StatCard × 3              ← MODIFIED: interactive, ratio label
└── InstanceTable.tsx         ← MODIFIED: actions column, skeleton, no Profile col
    └── SkeletonRow.tsx       ← NEW: shimmer placeholder rows
```

### New Component Tree (Profiles page `/profiles`)

```
ProfilesPage.tsx
├── [search input + Add Profile button]
├── SlideOverDrawer.tsx       ← NEW: add/edit form
│   └── [profile form fields]
└── [profile list rows with inline delete confirm]
```

---

## 2. New Components

### 2.1 `TopNavbar` — `frontend/components/TopNavbar.tsx`

**Requirement refs:** Req 1, Req 10

```typescript
// No props — reads context and router internally
```

**Behavior:**
- `"use client"` directive (needs `usePathname`, `useTheme`)
- Height: `h-12` (48px), full width, `border-b`
- Left: logo (`☁️` + "AWS EC2" text)
- Center-left: tab links — "Instances" (`href="/"`) and "Profiles" (`href="/profiles"`)
- Active tab detection: `usePathname() === "/"` → Instances active; `usePathname() === "/profiles"` → Profiles active
- Active tab style: `border-b-2 border-blue-500 text-slate-900 dark:text-white font-medium`
- Inactive tab style: `text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200`
- Right: theme toggle button — Sun icon when `theme === "dark"`, Moon icon when `theme === "light"`
- Right: Refresh button with `lastUpdated` timestamp (moved from sidebar footer — Dashboard passes these down via a context or the navbar reads a refresh callback; simplest approach: keep refresh in Dashboard, move only the toggle to navbar)

**Layout structure:**
```tsx
<header className="h-12 flex items-center px-6 border-b bg-white dark:bg-[#161825] border-slate-200 dark:border-[#2a2d3a] shrink-0">
  {/* Logo */}
  <div className="flex items-center gap-2 mr-8">...</div>
  {/* Nav tabs */}
  <nav className="flex items-center gap-1 flex-1">
    <Link href="/" className={activeTab === "/" ? activeCls : inactiveCls}>Instances</Link>
    <Link href="/profiles" className={activeTab === "/profiles" ? activeCls : inactiveCls}>Profiles</Link>
  </nav>
  {/* Theme toggle */}
  <button onClick={toggle} aria-label="Toggle theme">...</button>
</header>
```

---

### 2.2 `FilterToolbar` — `frontend/components/FilterToolbar.tsx`

**Requirement refs:** Req 3

```typescript
interface FilterToolbarProps {
  allProfiles: { name: string; color: string }[];
  allStates: string[];
  allTypes: string[];
  selectedProfiles: string[];
  selectedStates: string[];
  selectedTypes: string[];
  search: string;
  resultCount: number;
  totalCount: number;
  onSearchChange: (value: string) => void;
  onProfilesChange: (profiles: string[]) => void;
  onStatesChange: (states: string[]) => void;
  onTypesChange: (types: string[]) => void;
  onClearAll: () => void;
}
```

**Internal state per dropdown chip:**
```typescript
const [profileOpen, setProfileOpen] = useState(false);
const [stateOpen, setStateOpen] = useState(false);
const [typeOpen, setTypeOpen] = useState(false);
```

**Behavior:**
- Single horizontal `flex` row: `[🔍 Search] [Profile ▾] [State ▾] [Type ▾]  [clear?]  N of M instances`
- Search input: controlled, `onChange` fires `onSearchChange`, case-insensitive match on instance name
- Each dropdown chip:
  - Button shows label + count of active selections if < all selected, e.g. "Profile (2)"
  - Clicking opens a floating checklist panel (absolute positioned, `z-50`)
  - Outside-click closes: `useRef` on the wrapper div + `useEffect` listening to `document.mousedown`
  - Checklist: each item is a checkbox + label; toggling calls the parent handler
  - "Select all" / "Clear" links at top of dropdown
  - Zero selections = treat as "show all" (same as all selected)
- `onClearAll` button: only visible when any filter is active (search non-empty OR not all profiles/states/types selected). Renders as a small `× Clear filters` text button
- Result count: `"N of M instances"` right-aligned, `text-xs text-slate-400`

---

### 2.3 `SlideOverDrawer` — `frontend/components/SlideOverDrawer.tsx`

**Requirement refs:** Req 5

```typescript
interface SlideOverDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}
```

**Behavior:**
- Rendered via `createPortal(content, document.body)` to escape stacking contexts
- Two layers:
  1. Overlay: `fixed inset-0 bg-black/40 z-40` — clicking fires `onClose`
  2. Panel: `fixed top-0 right-0 h-full w-96 z-50 bg-white dark:bg-[#161825] shadow-xl overflow-y-auto`
- Panel slide animation: `transition-transform duration-300 ease-in-out` with `translate-x-0` when open, `translate-x-full` when closed
- Overlay fade: `transition-opacity duration-300` with `opacity-100` when open, `opacity-0 pointer-events-none` when closed
- Escape key: `useEffect` adds `keydown` listener on `document`, calls `onClose` on `Escape`
- Panel header: fixed `h-14` strip with `title` text + close `X` button (`onClose`)
- Panel body: scrollable, `p-6`, renders `children`
- Accessibility: `role="dialog"`, `aria-modal="true"`, `aria-label={title}`, focus trap (first focusable element gets focus on open)

**Usage in ProfilesPage:**
```tsx
<SlideOverDrawer isOpen={drawerOpen} onClose={closeDrawer} title={editingId ? "Edit Profile" : "New Profile"}>
  <ProfileForm ... />
</SlideOverDrawer>
```

---

### 2.4 `SkeletonRow` — `frontend/components/SkeletonRow.tsx`

**Requirement refs:** Req 7

```typescript
interface SkeletonRowProps {
  columns: number;
}
```

**Behavior:**
- Renders a single `<tr>` with `columns` `<td>` elements
- Each `<td>`: `px-4 py-3`
- Each shimmer block: `<div className="animate-pulse bg-slate-200 dark:bg-slate-700 rounded h-4" />`
- Column widths vary to feel realistic: first col `w-24`, second `w-32`, third `w-16`, rest `w-20` — achieved via `min-w` on the div or letting the table column sizes drive it naturally

**Usage:**
```tsx
{loading
  ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={7} />)
  : sorted.map(inst => <tr>...</tr>)
}
```

---

## 3. Modified Components

### 3.1 `StatCard.tsx`

**Requirement refs:** Req 2, Req 11

**New props interface:**
```typescript
interface StatCardProps {
  label: string;
  value: number;
  total: number;           // NEW: total instances for ratio
  color: "blue" | "green" | "red";
  icon: React.ReactNode;
  onClick?: () => void;    // NEW: makes card a filter button
  isActive?: boolean;      // NEW: ring highlight when filter active
}
```

**Changes:**
- Root element: `<button>` when `onClick` is provided, `<div>` otherwise
- `isActive` adds `ring-2 ring-offset-2` using the card's color (e.g. `ring-emerald-500`)
- Ratio label: computed in `Dashboard.tsx` as `"${value} of ${total} (${Math.round(value/total*100)}%)"` — rendered as `<p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">`
- Value font: `text-2xl font-bold` (was `text-3xl`)
- Zero-division guard: if `total === 0`, ratio shows `"0 of 0 (0%)"` 
- For "Total" card: no `onClick`, renders as non-interactive `<div>`

---

### 3.2 `InstanceTable.tsx`

**Requirement refs:** Req 4, Req 7, Req 8

**New props interface:**
```typescript
interface InstanceTableProps {
  instances: Instance[];
  loading?: boolean;        // NEW: triggers skeleton rows
  onClearFilters?: () => void; // NEW: for empty-state CTA
  hasActiveFilters?: boolean;  // NEW: distinguishes filter-empty vs truly-empty
}
```

**Column changes:**

| Before | After |
|--------|-------|
| Profile | ~~removed~~ |
| Name | Name (unchanged) |
| State | State (StateBadge updated) |
| Instance ID | Instance ID (persistent copy icon) |
| Type | Type (AZ in `title` tooltip) |
| Public IP | Public IP (persistent copy icon) |
| Private IP | Private IP (unchanged) |
| AZ | ~~removed~~ |
| — | Actions (NEW: Copy SSH + AWS Console link) |

**New COLUMNS array (7 columns):**
```typescript
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "Name",          label: "Name" },
  { key: "State",         label: "State" },
  { key: "Instance ID",   label: "Instance ID" },
  { key: "Instance Type", label: "Type" },
  { key: "Public IP",     label: "Public IP" },
  { key: "Private IP",    label: "Private IP" },
];
// Actions column rendered separately (not sortable)
```

**Row actions cell:**
```tsx
// Derive region from AZ (strip last character)
const region = inst.AZ ? inst.AZ.slice(0, -1) : "us-east-1";
const consoleUrl = `https://${region}.console.aws.amazon.com/ec2/v2/home?region=${region}#Instances:instanceId=${inst["Instance ID"]}`;
const sshCmd = `ssh ec2-user@${inst["Public IP"]}`;
const hasIp = inst["Public IP"] && inst["Public IP"] !== "-" && inst["Public IP"] !== "";

<td className="px-4 py-3 whitespace-nowrap">
  <div className="flex items-center gap-1">
    {/* Copy SSH */}
    <button
      onClick={() => copyToClipboard(sshCmd)}
      disabled={!hasIp}
      title={hasIp ? `Copy: ${sshCmd}` : "No public IP"}
      className={`p-1.5 rounded text-xs font-mono transition-colors ${
        hasIp
          ? "text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/5"
          : "text-slate-300 dark:text-slate-700 cursor-not-allowed"
      }`}
    >
      <Terminal size={14} />
    </button>
    {/* AWS Console */}
    <a
      href={consoleUrl}
      target="_blank"
      rel="noopener noreferrer"
      title="Open in AWS Console"
      className="p-1.5 rounded text-slate-500 hover:text-orange-600 hover:bg-orange-50 dark:text-slate-400 dark:hover:text-orange-400 dark:hover:bg-orange-950/30 transition-colors"
    >
      <ExternalLink size={14} />
    </a>
  </div>
</td>
```

**Copy icon visibility:** Remove `opacity-0 group-hover:opacity-100` from `CopyButton`. Always visible.

**AZ tooltip:** `<td title={inst.AZ} className="...">` on the Instance Type cell.

**Loading state:**
```tsx
<tbody>
  {loading
    ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={7} />)
    : sorted.map((inst, i) => <tr key={...}>...</tr>)
  }
</tbody>
```

**Empty states (Req 8):**
```tsx
if (!loading && sorted.length === 0) {
  if (hasActiveFilters) {
    return (
      <div className="...">
        <p>No instances match the current filters.</p>
        <button onClick={onClearFilters}>Clear filters</button>
      </div>
    );
  }
  return (
    <div className="...">
      <p>No instances found.</p>
    </div>
  );
}
```

---

### 3.3 `StateBadge.tsx`

**Requirement refs:** Req 4.6

Change from outline/subtle pill to filled solid pill for stronger visual weight:

```typescript
// running
"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-500 text-white dark:bg-emerald-600"

// stopped  
"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-slate-400 text-white dark:bg-slate-500"

// other states
"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-400 text-white dark:bg-amber-500"
```

Keep the animated pulse dot for running, static dot for stopped.

---

### 3.4 `Dashboard.tsx`

**Requirement refs:** Req 1, Req 2, Req 3, Req 7, Req 8, Req 9, Req 11

**State additions:**
```typescript
const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
const [activeStatCardFilter, setActiveStatCardFilter] = useState<string | null>(null);
```

**Removed:** entire `<aside>` sidebar JSX block. Navigation and theme toggle are now in `TopNavbar`.

**Filter logic update:**
```typescript
const filtered = instances.filter(i => {
  const matchProfile = selectedProfiles.length === 0 || selectedProfiles.includes(i.Profile);
  const matchState   = selectedStates.length === 0 || selectedStates.includes(i.State);
  const matchType    = selectedTypes.length === 0 || selectedTypes.includes(i["Instance Type"]);
  const matchSearch  = !search || i.Name.toLowerCase().includes(search.toLowerCase());
  return matchProfile && matchState && matchType && matchSearch;
});
```

**Stat card filter wiring:**
```typescript
const handleStatCardClick = (state: string) => {
  if (activeStatCardFilter === state) {
    setActiveStatCardFilter(null);
    setSelectedStates([...new Set(instances.map(i => i.State))]);
  } else {
    setActiveStatCardFilter(state);
    setSelectedStates([state]);
  }
};
```

**Clear all:**
```typescript
const handleClearAll = () => {
  setSearch("");
  setSelectedProfiles([...new Set(instances.map(i => i.Profile))]);
  setSelectedStates([...new Set(instances.map(i => i.State))]);
  setSelectedTypes([...new Set(instances.map(i => i["Instance Type"]))]);
  setActiveStatCardFilter(null);
};
```

**Error state (Req 9):**
```tsx
{error && (
  <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-950/20 p-6 text-red-600 dark:text-red-400">
    <p className="font-semibold mb-1">Failed to load instances</p>
    <p className="text-sm font-mono opacity-80 mb-3">{error}</p>
    <div className="flex items-center gap-3">
      <CopyErrorButton error={error} />
      <button onClick={() => load()} className="text-sm underline hover:no-underline">
        Try again
      </button>
    </div>
  </div>
)}
```

`CopyErrorButton` is a small local component that uses the same `CopyButton` pattern (copied state for 1500ms).

**Page heading:** `<h2 className="text-lg font-semibold text-slate-900 dark:text-white">`

**Content padding:** `<main className="flex-1 p-6 overflow-auto">`

**Refresh button:** Moves from sidebar to a small button in the page header row, next to the heading. Layout:
```tsx
<div className="flex items-center justify-between mb-6">
  <div>
    <h2 className="text-lg font-semibold ...">Instances</h2>
    <p className="text-xs text-slate-400 mt-0.5">{lastUpdated && `Updated ${lastUpdated.toLocaleTimeString()}`}</p>
  </div>
  <button onClick={() => load(true)} ...><RefreshCw size={14} /> Refresh</button>
</div>
```

---

### 3.5 `ProfilesPage.tsx`

**Requirement refs:** Req 5, Req 6, Req 7, Req 9, Req 11

**State changes:**
```typescript
// Remove: showAddForm, editingId, editForm, editOriginal, editError, saving
// Add:
const [drawerOpen, setDrawerOpen] = useState(false);
const [drawerMode, setDrawerMode] = useState<"add" | "edit">("add");
const [drawerProfile, setDrawerProfile] = useState<Profile | null>(null); // null for add mode
const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
const [deleteErrors, setDeleteErrors] = useState<Record<number, string>>({});
```

**Sidebar removed:** The `<aside>` block is deleted. `TopNavbar` handles navigation.

**Opening drawer:**
```typescript
const openAddDrawer = () => { setDrawerMode("add"); setDrawerProfile(null); setDrawerOpen(true); };
const openEditDrawer = (p: Profile) => { setDrawerMode("edit"); setDrawerProfile(p); setDrawerOpen(true); };
const closeDrawer = () => setDrawerOpen(false);
```

**Drawer contents (`ProfileForm`):** Extract the form JSX into a `ProfileForm` component (internal to the file or separate) that accepts mode, initial values, onSuccess, onClose callbacks. The form is identical to the existing add/edit form — same fields, same `SemanticColorPicker`, same `EnvTagSelector`, same `TestBadge`. Live preview in the drawer header.

**Inline delete confirmation (Req 6):**
```tsx
// In profile row — normal state
<button onClick={() => setConfirmDeleteId(profile.id)}>
  <Trash2 size={15} />
</button>

// In profile row — confirming state (replaces action buttons)
{confirmDeleteId === profile.id && (
  <div className="flex items-center gap-2 text-xs">
    <span className="text-slate-600 dark:text-slate-300">Delete?</span>
    <button
      onClick={() => handleDelete(profile.id)}
      disabled={deletingId === profile.id}
      className="px-2 py-1 bg-red-600 text-white rounded font-medium hover:bg-red-700 disabled:opacity-50"
    >
      {deletingId === profile.id ? <RefreshCw size={11} className="animate-spin" /> : "Confirm"}
    </button>
    <button
      onClick={() => { setConfirmDeleteId(null); setDeleteErrors(e => { const n = {...e}; delete n[profile.id]; return n; }); }}
      className="px-2 py-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
    >
      Cancel
    </button>
  </div>
)}

// Inline error (shown below row if delete failed)
{deleteErrors[profile.id] && (
  <p className="text-xs text-red-500 mt-1 ml-12">{deleteErrors[profile.id]}</p>
)}
```

**Delete handler update:**
```typescript
const handleDelete = async (id: number) => {
  setDeletingId(id);
  try {
    await deleteProfile(id);
    setProfiles(prev => prev.filter(p => p.id !== id));
    setConfirmDeleteId(null);
  } catch (e) {
    setDeleteErrors(prev => ({ ...prev, [id]: e instanceof Error ? e.message : "Failed to delete" }));
    setConfirmDeleteId(null); // reset to normal row (error shown inline)
  } finally {
    setDeletingId(null);
  }
};
```

**Loading skeleton (Req 7):** Replace the spinner `<RefreshCw animate-spin>` with 3 skeleton rows:
```tsx
{loading ? (
  <ul>
    {Array.from({ length: 3 }, (_, i) => (
      <li key={i} className="px-6 py-4 border-b border-slate-100 dark:border-[#2a2d3a]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full animate-pulse bg-slate-200 dark:bg-slate-700" />
          <div className="space-y-1.5">
            <div className="w-32 h-3.5 rounded animate-pulse bg-slate-200 dark:bg-slate-700" />
            <div className="w-20 h-3 rounded animate-pulse bg-slate-200 dark:bg-slate-700" />
          </div>
        </div>
      </li>
    ))}
  </ul>
) : ...}
```

**Page heading:** `text-lg font-semibold` (Req 11).

---

## 4. Layout File Change — `app/layout.tsx`

```typescript
import TopNavbar from "@/components/TopNavbar";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-slate-100 dark:bg-[#0f1117]`}>
        <ThemeProvider>
          <div className="flex flex-col min-h-screen">
            <TopNavbar />
            <main className="flex-1">{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

`TopNavbar` is a `"use client"` component. `ThemeProvider` is already client-side. No SSR issues.

---

## 5. State Management Summary

All filter state lives in `Dashboard.tsx` (no global store needed):

| State | Type | Default | Reset value |
|-------|------|---------|-------------|
| `search` | `string` | `""` | `""` |
| `selectedProfiles` | `string[]` | all profile names | all profile names |
| `selectedStates` | `string[]` | all states | all states |
| `selectedTypes` | `string[]` | all types | all types |
| `activeStatCardFilter` | `string \| null` | `null` | `null` |

Filter precedence: `activeStatCardFilter`, when set, overrides `selectedStates` (the stat card click sets `selectedStates` to a single-item array). Clearing the stat card restores all states. This means the two systems are unified — the card is simply a fast-path setter for the state filter.

---

## 6. Tailwind & CSS Notes

| Feature | Approach |
|---------|----------|
| Shimmer skeleton | `animate-pulse` (Tailwind built-in) |
| Drawer slide animation | `transition-transform duration-300 ease-in-out translate-x-0 / translate-x-full` |
| Overlay fade | `transition-opacity duration-300 opacity-100 / opacity-0 pointer-events-none` |
| Dropdown outside-click | `useRef` + `useEffect` on `document.mousedown` |
| AZ tooltip | Native `title` attribute on `<td>` |
| AWS Console URL | Built from `inst.AZ.slice(0, -1)` for region, `inst["Instance ID"]` for ID |
| SSH command | `ssh ec2-user@${inst["Public IP"]}` |
| No new libraries | All patterns use React, Next.js, and Tailwind primitives |

---

## 7. File Change Summary

| File | Action |
|------|--------|
| `frontend/app/layout.tsx` | Modified — add `TopNavbar`, wrap in flex column |
| `frontend/components/TopNavbar.tsx` | **New** |
| `frontend/components/FilterToolbar.tsx` | **New** |
| `frontend/components/SlideOverDrawer.tsx` | **New** |
| `frontend/components/SkeletonRow.tsx` | **New** |
| `frontend/components/Dashboard.tsx` | Modified — remove sidebar, add toolbar, wire stat cards, update error/loading |
| `frontend/components/InstanceTable.tsx` | Modified — columns, actions, skeleton, empty states |
| `frontend/components/StatCard.tsx` | Modified — interactive, ratio label, smaller font |
| `frontend/components/StateBadge.tsx` | Modified — filled style |
| `frontend/components/ProfilesPage.tsx` | Modified — remove sidebar, drawer, inline delete, skeleton |
| `frontend/app/page.tsx` | No change |
| `frontend/app/profiles/page.tsx` | No change |
