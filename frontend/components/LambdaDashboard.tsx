"use client";

import { useState, useCallback, useMemo } from "react";
import {
  RefreshCw, Zap, Globe,
  ChevronDown, ChevronUp, ChevronsUpDown,
  Copy, Check,
} from "lucide-react";
import { fetchLambdas, triggerSchedulerPoll } from "@/lib/api";
import { useResourceLoad } from "@/lib/useInitialFetch";
import { LambdaFunction } from "@/lib/types";
import StatCard from "./StatCard";
import SkeletonRow from "./SkeletonRow";
import ProfileBadge from "./ProfileBadge";
import Pagination, { PageSize } from "./Pagination";
import SlideOverDrawer from "./SlideOverDrawer";
import { FilterToolbar, useFilterState, applyFilters } from "./filters";
import type { FilterConfig, FilterOption } from "./filters";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

const STATE_COLORS: Record<string, string> = {
  Active:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  Inactive: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  Pending:  "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  Failed:   "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400",
};

function LambdaStateBadge({ state }: { state: string }) {
  const cls = STATE_COLORS[state] ?? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{state || "—"}</span>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="ml-1.5 transition-opacity text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">
      {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
    </button>
  );
}

// ── Lambda Drawer ──────────────────────────────────────────────────────────

function LambdaDrawer({ fn, onClose }: { fn: LambdaFunction | null; onClose: () => void }) {
  return (
    <SlideOverDrawer isOpen={!!fn} onClose={onClose} title={fn ? fn.FunctionName : ""}>
      {fn && (
        <div className="space-y-6 text-sm">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Function</p>
            <dl className="space-y-2">
              <div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400 shrink-0">Name</dt><dd className="font-mono text-xs text-slate-700 dark:text-slate-200 text-right break-all">{fn.FunctionName}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400 shrink-0">Handler</dt><dd className="font-mono text-xs text-slate-600 dark:text-slate-300 text-right break-all">{fn.Handler || "—"}</dd></div>
              {fn.Description && <div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400 shrink-0">Description</dt><dd className="text-slate-600 dark:text-slate-300 text-right text-xs">{fn.Description}</dd></div>}
              <div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400 shrink-0">State</dt><dd><LambdaStateBadge state={fn.State} /></dd></div>
            </dl>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Configuration</p>
            <dl className="space-y-2">
              <div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400 shrink-0">Runtime</dt><dd><span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">{fn.Runtime || "—"}</span></dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400 shrink-0">Memory</dt><dd className="text-slate-600 dark:text-slate-300 text-xs">{fn.MemorySize > 0 ? `${fn.MemorySize} MB` : "—"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400 shrink-0">Timeout</dt><dd className="text-slate-600 dark:text-slate-300 text-xs">{fn.Timeout > 0 ? `${fn.Timeout}s` : "—"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400 shrink-0">Code size</dt><dd className="text-slate-600 dark:text-slate-300 text-xs">{fn.CodeSize > 0 ? formatBytes(fn.CodeSize) : "—"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400 shrink-0">Last modified</dt><dd className="text-slate-600 dark:text-slate-300 text-xs">{formatDate(fn.LastModified)}</dd></div>
            </dl>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Deployment</p>
            <dl className="space-y-2">
              <div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400 shrink-0">Profile</dt><dd><ProfileBadge profile={fn.Profile} color={fn.ProfileColor} envTag={fn.ProfileEnvTag} /></dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400 shrink-0">Region</dt><dd className="text-slate-600 dark:text-slate-300 text-xs font-mono">{fn.Region}</dd></div>
            </dl>
          </div>
        </div>
      )}
    </SlideOverDrawer>
  );
}

// ── Lambda Table ───────────────────────────────────────────────────────────

type SortKey = "FunctionName" | "Profile" | "Region" | "Runtime" | "State" | "LastModified" | "MemorySize" | "Timeout";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "FunctionName", label: "Function" },
  { key: "Profile",      label: "Profile" },
  { key: "Region",       label: "Region" },
  { key: "Runtime",      label: "Runtime" },
  { key: "State",        label: "State" },
  { key: "MemorySize",   label: "Memory" },
  { key: "Timeout",      label: "Timeout" },
  { key: "LastModified", label: "Last Modified" },
];

function LambdaTable({ functions, loading, onClearFilters, hasActiveFilters, page, pageSize, onRowClick }: {
  functions: LambdaFunction[]; loading: boolean; onClearFilters: () => void;
  hasActiveFilters: boolean; page: number; pageSize: PageSize; onRowClick: (fn: LambdaFunction) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("FunctionName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = useMemo(() =>
    [...functions].sort((a, b) => {
      const av = a[sortKey] ?? ""; const bv = b[sortKey] ?? "";
      if (sortKey === "MemorySize" || sortKey === "Timeout") { const cmp = Number(av) - Number(bv); return sortDir === "asc" ? cmp : -cmp; }
      const cmp = String(av).localeCompare(String(bv)); return sortDir === "asc" ? cmp : -cmp;
    }), [functions, sortKey, sortDir]);

  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const SortIcon = ({ col }: { col: SortKey }) => col !== sortKey
    ? <ChevronsUpDown size={13} className="text-slate-300 dark:text-slate-600" />
    : sortDir === "asc" ? <ChevronUp size={13} className="text-blue-500" /> : <ChevronDown size={13} className="text-blue-500" />;

  if (!loading && sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <p className="text-lg font-medium text-slate-600 dark:text-slate-300">
          {hasActiveFilters ? "No functions match the current filters." : "No Lambda functions found"}
        </p>
        {hasActiveFilters
          ? <button onClick={onClearFilters} className="mt-3 px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-[#2a2d3a] dark:hover:bg-[#33374a] dark:text-slate-300 transition-colors">Clear filters</button>
          : <p className="text-xs mt-1">No functions are cached yet — click Refresh to poll AWS</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 shadow-sm dark:border-[#2a2d3a] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-[#2a2d3a] dark:bg-[#161825]">
              {COLUMNS.map((col) => (
                <th key={col.key} onClick={() => handleSort(col.key)}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-slate-600 select-none whitespace-nowrap dark:text-slate-500 dark:hover:text-slate-300">
                  <span className="inline-flex items-center gap-1">{col.label}<SortIcon col={col.key} /></span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#2a2d3a]">
            {loading ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={8} />) : paginated.map((fn) => (
              <tr key={`${fn.Profile}:${fn.Region}:${fn.FunctionName}`} onClick={() => onRowClick(fn)}
                className="group bg-white hover:bg-slate-50 transition-colors dark:bg-[#1c1f2e] dark:hover:bg-[#222538] cursor-pointer">
                <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-200 max-w-[200px] w-[200px]">
                  <div className="flex items-center min-w-0">
                    <span className="truncate" title={fn.FunctionName}>{fn.FunctionName}</span>
                    <span className="shrink-0"><CopyButton text={fn.FunctionName} /></span>
                  </div>
                  {fn.Description && <p className="text-slate-400 dark:text-slate-500 truncate text-xs font-sans mt-0.5" title={fn.Description}>{fn.Description}</p>}
                </td>
                <td className="px-4 py-3"><ProfileBadge profile={fn.Profile} color={fn.ProfileColor} envTag={fn.ProfileEnvTag} /></td>
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap dark:text-slate-300 text-xs">{fn.Region}</td>
                <td className="px-4 py-3 whitespace-nowrap"><span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">{fn.Runtime || "—"}</span></td>
                <td className="px-4 py-3 whitespace-nowrap"><LambdaStateBadge state={fn.State} /></td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap dark:text-slate-400 text-xs">{fn.MemorySize > 0 ? `${fn.MemorySize} MB` : "—"}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap dark:text-slate-400 text-xs">{fn.Timeout > 0 ? `${fn.Timeout}s` : "—"}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap dark:text-slate-400 text-xs">{formatDate(fn.LastModified)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── LambdaDashboard ────────────────────────────────────────────────────────

export default function LambdaDashboard() {
  const [functions, setFunctions] = useState<LambdaFunction[]>([]);
  const [selectedFn, setSelectedFn] = useState<LambdaFunction | null>(null);

  const beforeRefresh = useCallback(async () => {
    await triggerSchedulerPoll();
    await new Promise((r) => setTimeout(r, 2000));
  }, []);

  const { loading, error, lastUpdated, refreshing, load } = useResourceLoad({
    fetcher: fetchLambdas,
    onData: setFunctions,
    beforeRefresh,
  });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);

  const { filterState, setFilter, clearFilters, search, setSearch, debouncedSearch } =
    useFilterState({ onFilterChange: () => setPage(1) });

  // ── Derived option lists ────────────────────────────────────────────────

  const allProfiles = useMemo(() => [...new Set(functions.map((f) => f.Profile))].sort(), [functions]);
  const allRegions  = useMemo(() => [...new Set(functions.map((f) => f.Region))].sort(), [functions]);
  const allRuntimes = useMemo(() => [...new Set(functions.map((f) => f.Runtime))].sort(), [functions]);
  const allStates   = useMemo(() => [...new Set(functions.map((f) => f.State))].sort(), [functions]);
  const profileColorMap = useMemo(() => Object.fromEntries(functions.map((f) => [f.Profile, f.ProfileColor])), [functions]);

  const allOptionsByKey = useMemo(() => ({
    region: allRegions, state: allStates, runtime: allRuntimes, profile: allProfiles,
  }), [allRegions, allStates, allRuntimes, allProfiles]);

  // Filter config — order: search | region | state | runtime | profile
  const profileOptions: FilterOption[] = useMemo(
    () => allProfiles.map((name) => ({ value: name, label: name, color: profileColorMap[name] ?? "#6366f1" })),
    [allProfiles, profileColorMap]
  );

  const filters: FilterConfig[] = useMemo(() => [
    { key: "region",  label: "Region",  type: "multi-select", options: allRegions.map((r) => ({ value: r })) },
    { key: "state",   label: "State",   type: "multi-select", options: allStates.map((s) => ({ value: s })) },
    { key: "runtime", label: "Runtime", type: "multi-select", options: allRuntimes.map((r) => ({ value: r })) },
    { key: "profile", label: "Profile", type: "multi-select", options: profileOptions },
  ], [allRegions, allStates, allRuntimes, profileOptions]);

  const hasActiveFilters = useMemo(() => {
    if (debouncedSearch.trim()) return true;
    return Object.entries(filterState).some(([key, selected]) => {
      const total = allOptionsByKey[key as keyof typeof allOptionsByKey]?.length ?? 0;
      return selected.length > 0 && selected.length < total;
    });
  }, [filterState, debouncedSearch, allOptionsByKey]);

  // ── Filter logic ────────────────────────────────────────────────────────

  const filtered = useMemo(() => applyFilters(
    functions, filterState, debouncedSearch,
    (f, key) => {
      if (key === "profile") return f.Profile;
      if (key === "region")  return f.Region;
      if (key === "runtime") return f.Runtime;
      if (key === "state")   return f.State;
      return "";
    },
    (f) => [f.FunctionName]
  ), [functions, filterState, debouncedSearch]);

  const total       = functions.length;
  const activeCount = useMemo(() => functions.filter((f) => f.State === "Active").length, [functions]);
  const regionCount = useMemo(() => new Set(functions.map((f) => f.Region)).size, [functions]);

  const handleClearAll = () => { clearFilters(); setPage(1); };

  return (
    <div className="p-6 overflow-auto bg-slate-100 dark:bg-[#0f1117] min-h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Lambda Functions</h2>
          {lastUpdated && <p className="text-xs text-slate-400 mt-0.5">Synced {lastUpdated.toLocaleTimeString()}</p>}
        </div>
        <button onClick={() => load(true)} disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-300 dark:hover:bg-white/5">
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Polling AWS…" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Functions" value={loading ? 0 : total} total={total} color="blue" icon={<Zap size={20} />} />
        <StatCard label="Active" value={loading ? 0 : activeCount} total={total} color="green" icon={<Zap size={20} />} />
        <StatCard label="Regions" value={loading ? 0 : regionCount} total={regionCount} color="purple" icon={<Globe size={20} />} />
      </div>

      <div className="mb-4">
        <FilterToolbar
          filters={filters}
          filterState={filterState}
          onFilterChange={(key, values) => { setFilter(key, values); setPage(1); }}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search functions…"
          hasActiveFilters={hasActiveFilters}
          onClearAll={handleClearAll}
          resultCount={filtered.length}
          totalCount={total}
          resultLabel="functions"
          paginationSlot={
            total > 0 ? (
              <Pagination total={filtered.length} page={page} pageSize={pageSize}
                onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
            ) : undefined
          }
        />
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-950/20 p-6 text-red-600 dark:text-red-400">
          <p className="font-semibold mb-1">Failed to load Lambda functions</p>
          <p className="text-sm font-mono opacity-80 mb-3">{error}</p>
          <button onClick={() => load()} className="text-sm underline hover:no-underline">Try again</button>
        </div>
      ) : (
        <LambdaTable functions={filtered} loading={loading} onClearFilters={handleClearAll}
          hasActiveFilters={hasActiveFilters} page={page} pageSize={pageSize} onRowClick={setSelectedFn} />
      )}

      <LambdaDrawer fn={selectedFn} onClose={() => setSelectedFn(null)} />
    </div>
  );
}
