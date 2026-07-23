"use client";

import { useState, useCallback, useMemo } from "react";
import { RefreshCw, Zap, Globe, ChevronDown, ChevronUp, ChevronsUpDown, Copy, Check } from "lucide-react";
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="ml-1.5 p-0.5 rounded opacity-0 group-hover/row:opacity-100 transition-opacity duration-150"
      style={{ color: "var(--text-tertiary)" }}
    >
      {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
    </button>
  );
}

const STATE_META: Record<string, { bg: string; text: string; dot: string }> = {
  Active:   { bg: "rgba(16,185,129,0.1)",  text: "#10b981", dot: "#10b981" },
  Inactive: { bg: "var(--bg-subtle)",       text: "var(--text-tertiary)", dot: "var(--text-tertiary)" },
  Pending:  { bg: "rgba(245,158,11,0.1)",  text: "#f59e0b", dot: "#f59e0b" },
  Failed:   { bg: "rgba(239,68,68,0.1)",   text: "#ef4444", dot: "#ef4444" },
};

function LambdaStateBadge({ state }: { state: string }) {
  const m = STATE_META[state] ?? STATE_META.Inactive;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: m.bg, color: m.text }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: m.dot }} />
      {state || "—"}
    </span>
  );
}

// ── Drawer ─────────────────────────────────────────────────────────────────

function DrawerSection({ title }: { title: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider mb-3 mt-5 first:mt-0" style={{ color: "var(--text-tertiary)" }}>
      {title}
    </p>
  );
}

function DrawerRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <span className="text-[13px] shrink-0" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <span className="text-[13px] text-right" style={{ color: "var(--text-primary)" }}>{value || "—"}</span>
    </div>
  );
}

function LambdaDrawer({ fn, onClose }: { fn: LambdaFunction | null; onClose: () => void }) {
  return (
    <SlideOverDrawer isOpen={!!fn} onClose={onClose} title={fn ? fn.FunctionName : ""}>
      {fn && (
        <div>
          <DrawerSection title="Function" />
          <DrawerRow label="Name" value={<span className="font-mono text-[12px] break-all">{fn.FunctionName}</span>} />
          <DrawerRow label="Handler" value={<span className="font-mono text-[12px] break-all">{fn.Handler || "—"}</span>} />
          {fn.Description && <DrawerRow label="Description" value={fn.Description} />}
          <DrawerRow label="State" value={<LambdaStateBadge state={fn.State} />} />

          <DrawerSection title="Configuration" />
          <DrawerRow label="Runtime" value={
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: "rgba(139,92,246,0.1)", color: "#8b5cf6" }}>{fn.Runtime || "—"}</span>
          } />
          <DrawerRow label="Memory" value={fn.MemorySize > 0 ? `${fn.MemorySize} MB` : "—"} />
          <DrawerRow label="Timeout" value={fn.Timeout > 0 ? `${fn.Timeout}s` : "—"} />
          <DrawerRow label="Code size" value={fn.CodeSize > 0 ? formatBytes(fn.CodeSize) : "—"} />
          <DrawerRow label="Last modified" value={formatDate(fn.LastModified)} />
          <DrawerRow label="Last triggered" value={fn.LastInvocationTime ? formatDate(fn.LastInvocationTime) : <span style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>Never / no logs</span>} />

          <DrawerSection title="Deployment" />
          <DrawerRow label="Profile" value={<ProfileBadge profile={fn.Profile} color={fn.ProfileColor} envTag={fn.ProfileEnvTag} />} />
          <DrawerRow label="Region" value={<span className="font-mono text-[12px]">{fn.Region}</span>} />
        </div>
      )}
    </SlideOverDrawer>
  );
}

// ── Table ──────────────────────────────────────────────────────────────────

type SortKey = "FunctionName" | "Profile" | "Region" | "Runtime" | "State" | "LastModified" | "MemorySize" | "Timeout" | "LastInvocationTime";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "FunctionName",       label: "Function" },
  { key: "Profile",            label: "Profile" },
  { key: "Region",             label: "Region" },
  { key: "Runtime",            label: "Runtime" },
  { key: "State",              label: "State" },
  { key: "MemorySize",         label: "Memory" },
  { key: "Timeout",            label: "Timeout" },
  { key: "LastInvocationTime", label: "Last Triggered" },
  { key: "LastModified",       label: "Last Modified" },
];

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown size={12} style={{ color: "var(--text-tertiary)" }} />;
  return sortDir === "asc" ? <ChevronUp size={12} style={{ color: "var(--brand)" }} /> : <ChevronDown size={12} style={{ color: "var(--brand)" }} />;
}

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

  const sorted = useMemo(() => [...functions].sort((a, b) => {
    const av = a[sortKey] ?? ""; const bv = b[sortKey] ?? "";
    if (sortKey === "MemorySize" || sortKey === "Timeout") { const cmp = Number(av) - Number(bv); return sortDir === "asc" ? cmp : -cmp; }
    const cmp = String(av).localeCompare(String(bv)); return sortDir === "asc" ? cmp : -cmp;
  }), [functions, sortKey, sortDir]);

  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  if (!loading && sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 rounded-xl border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "var(--bg-subtle)" }}>
          <Zap size={22} style={{ color: "var(--text-tertiary)" }} />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            {hasActiveFilters ? "No functions match" : "No Lambda functions found"}
          </p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {hasActiveFilters ? "Try adjusting your filters." : "Click Refresh to poll AWS."}
          </p>
        </div>
        {hasActiveFilters && (
          <button onClick={onClearFilters} className="px-4 py-1.5 rounded-lg text-[13px] font-medium" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
            Clear filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border" style={{ background: "var(--bg-card)", borderColor: "var(--border)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b" style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}>
              {COLUMNS.map((col) => (
                <th key={col.key} onClick={() => handleSort(col.key)} className="px-4 py-3 text-left select-none cursor-pointer whitespace-nowrap">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: sortKey === col.key ? "var(--brand)" : "var(--text-tertiary)" }}>
                    {col.label}
                    <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={9} />)
              : paginated.map((fn) => (
                  <tr
                    key={`${fn.Profile}:${fn.Region}:${fn.FunctionName}`}
                    onClick={() => onRowClick(fn)}
                    className="group/row border-b table-row-hover cursor-pointer"
                    style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-card)")}
                  >
                    <td className="px-4 py-3 max-w-[220px]">
                      <div className="flex items-center min-w-0">
                        <span className="font-mono text-[13px] font-medium truncate" style={{ color: "var(--text-primary)" }} title={fn.FunctionName}>{fn.FunctionName}</span>
                        <CopyButton text={fn.FunctionName} />
                      </div>
                      {fn.Description && (
                        <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--text-tertiary)" }}>{fn.Description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap"><ProfileBadge profile={fn.Profile} color={fn.ProfileColor} envTag={fn.ProfileEnvTag} /></td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[12px] font-medium" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>{fn.Region}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: "rgba(139,92,246,0.1)", color: "#8b5cf6" }}>{fn.Runtime || "—"}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap"><LambdaStateBadge state={fn.State} /></td>
                    <td className="px-4 py-3 whitespace-nowrap text-[13px]" style={{ color: "var(--text-secondary)" }}>{fn.MemorySize > 0 ? `${fn.MemorySize} MB` : "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-[13px]" style={{ color: "var(--text-secondary)" }}>{fn.Timeout > 0 ? `${fn.Timeout}s` : "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-[13px]" style={{ color: "var(--text-secondary)" }}>{formatDate(fn.LastInvocationTime)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-[13px]" style={{ color: "var(--text-secondary)" }}>{formatDate(fn.LastModified)}</td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

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

  const allProfiles = useMemo(() => [...new Set(functions.map((f) => f.Profile))].sort(), [functions]);
  const allRegions  = useMemo(() => [...new Set(functions.map((f) => f.Region))].sort(), [functions]);
  const allRuntimes = useMemo(() => [...new Set(functions.map((f) => f.Runtime))].sort(), [functions]);
  const allStates   = useMemo(() => [...new Set(functions.map((f) => f.State))].sort(), [functions]);
  const profileColorMap = useMemo(() => Object.fromEntries(functions.map((f) => [f.Profile, f.ProfileColor])), [functions]);
  const allOptionsByKey = useMemo(() => ({ region: allRegions, state: allStates, runtime: allRuntimes, profile: allProfiles }), [allRegions, allStates, allRuntimes, allProfiles]);

  const profileOptions: FilterOption[] = useMemo(
    () => allProfiles.map((name) => ({ value: name, label: name, color: profileColorMap[name] ?? "#6366f1" })),
    [allProfiles, profileColorMap]
  );

  const filters: FilterConfig[] = useMemo(() => [
    { key: "region",  label: "Region",  type: "multi-select" as const, options: allRegions.map((r) => ({ value: r })) },
    { key: "state",   label: "State",   type: "multi-select" as const, options: allStates.map((s) => ({ value: s })) },
    { key: "runtime", label: "Runtime", type: "multi-select" as const, options: allRuntimes.map((r) => ({ value: r })) },
    { key: "profile", label: "Profile", type: "multi-select" as const, options: profileOptions },
  ], [allRegions, allStates, allRuntimes, profileOptions]);

  const hasActiveFilters = useMemo(() => {
    if (debouncedSearch.trim()) return true;
    return Object.entries(filterState).some(([key, selected]) => {
      const total = allOptionsByKey[key as keyof typeof allOptionsByKey]?.length ?? 0;
      return selected.length > 0 && selected.length < total;
    });
  }, [filterState, debouncedSearch, allOptionsByKey]);

  const filtered = useMemo(() => applyFilters(
    functions, filterState, debouncedSearch,
    (f, key) => { if (key === "profile") return f.Profile; if (key === "region") return f.Region; if (key === "runtime") return f.Runtime; if (key === "state") return f.State; return ""; },
    (f) => [f.FunctionName]
  ), [functions, filterState, debouncedSearch]);

  const total       = functions.length;
  const activeCount = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return functions.filter((f) => f.LastInvocationTime && new Date(f.LastInvocationTime).getTime() >= cutoff).length;
  }, [functions]);
  const regionCount = useMemo(() => new Set(functions.map((f) => f.Region)).size, [functions]);
  const handleClearAll = () => { clearFilters(); setPage(1); };

  return (
    <div className="p-6 min-h-full" style={{ background: "var(--bg-page)" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Lambda Functions</h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
            {lastUpdated ? `Synced ${lastUpdated.toLocaleTimeString()}` : "Loading…"}
          </p>
        </div>
        <button
          onClick={() => load(true)} disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors duration-150 disabled:opacity-50"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Polling AWS…" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Functions" value={loading ? 0 : total}        color="blue"   icon={<Zap size={18} />} />
        <StatCard label="Invoked (7d)"    value={loading ? 0 : activeCount}  color="green"  icon={<Zap size={18} />} ratio={`of ${total} total`} />
        <StatCard label="Regions"         value={loading ? 0 : regionCount}  color="purple" icon={<Globe size={18} />} />
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
        <div className="rounded-xl border p-6" style={{ background: "rgba(239,68,68,0.05)", borderColor: "rgba(239,68,68,0.2)" }}>
          <p className="text-[14px] font-semibold mb-1" style={{ color: "#ef4444" }}>Failed to load Lambda functions</p>
          <p className="text-[13px] font-mono mb-3 opacity-80" style={{ color: "#ef4444" }}>{error}</p>
          <button onClick={() => load()} className="text-[13px] underline" style={{ color: "var(--text-secondary)" }}>Try again</button>
        </div>
      ) : (
        <LambdaTable functions={filtered} loading={loading} onClearFilters={handleClearAll}
          hasActiveFilters={hasActiveFilters} page={page} pageSize={pageSize} onRowClick={setSelectedFn} />
      )}

      <LambdaDrawer fn={selectedFn} onClose={() => setSelectedFn(null)} />
    </div>
  );
}
