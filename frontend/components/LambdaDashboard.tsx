"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw,
  Zap,
  Globe,
  Search,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Copy,
  Check,
  X,
  Clock,
  AlertTriangle,
} from "lucide-react";
import {
  fetchLambdas,
  fetchSchedulerStatus,
  triggerSchedulerPoll,
  updateSchedulerInterval,
  SchedulerStatus,
} from "@/lib/api";
import { LambdaFunction, EnvTag } from "@/lib/types";
import StatCard from "./StatCard";
import SkeletonRow from "./SkeletonRow";
import ProfileBadge from "./ProfileBadge";
import Pagination, { PageSize } from "./Pagination";
import SlideOverDrawer from "./SlideOverDrawer";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {state || "—"}
    </span>
  );
}

// ── CopyButton ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="ml-1.5 transition-opacity text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
    >
      {copied ? (
        <Check size={12} className="text-emerald-500" />
      ) : (
        <Copy size={12} />
      )}
    </button>
  );
}

// ── DropdownChip ───────────────────────────────────────────────────────────

interface DropdownChipProps {
  label: string;
  allItems: string[];
  selectedItems: string[];
  onChange: (items: string[]) => void;
  renderItem?: (item: string) => React.ReactNode;
}

function DropdownChip({ label, allItems, selectedItems, onChange, renderItem }: DropdownChipProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const allSelected = selectedItems.length === 0 || selectedItems.length === allItems.length;
  const activeCount =
    selectedItems.length > 0 && selectedItems.length < allItems.length
      ? selectedItems.length
      : null;

  const toggle = (item: string) => {
    if (selectedItems.includes(item)) {
      onChange(selectedItems.filter((x) => x !== item));
    } else {
      onChange([...selectedItems, item]);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors
          ${activeCount !== null
            ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500/60 dark:bg-blue-600/15 dark:text-blue-300"
            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-300 dark:hover:bg-white/5"
          }`}
      >
        {label}
        {activeCount !== null && (
          <span className="rounded-full bg-blue-500 text-white text-xs w-4 h-4 flex items-center justify-center leading-none">
            {activeCount}
          </span>
        )}
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 min-w-[180px] rounded-xl border border-slate-200 bg-white shadow-lg dark:border-[#2a2d3a] dark:bg-[#161825]">
          <div className="flex items-center gap-3 px-3 pt-2 pb-1.5 border-b border-slate-100 dark:border-[#2a2d3a]">
            <button type="button" onClick={() => onChange([])} className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
              Select all
            </button>
            <button type="button" onClick={() => onChange([])} className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">
              Clear
            </button>
          </div>
          <ul className="py-1 max-h-56 overflow-y-auto">
            {allItems.map((item) => {
              const checked = allSelected ? true : selectedItems.includes(item);
              return (
                <li key={item}>
                  <label className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(item)}
                      className="accent-blue-500 w-3.5 h-3.5 shrink-0"
                    />
                    {renderItem ? renderItem(item) : (
                      <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{item}</span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── SchedulerBadge ─────────────────────────────────────────────────────────

const INTERVAL_PRESETS = [
  { label: "1 min",  seconds: 60 },
  { label: "2 min",  seconds: 120 },
  { label: "5 min",  seconds: 300 },
  { label: "15 min", seconds: 900 },
  { label: "30 min", seconds: 1800 },
];

function SchedulerBadge({
  status,
  onIntervalChange,
}: {
  status: SchedulerStatus | null;
  onIntervalChange: (seconds: number) => Promise<void>;
}) {
  const [updating, setUpdating] = useState(false);
  if (!status) return null;

  const nextRun = status.next_run_at ? new Date(status.next_run_at) : null;
  const secondsUntil = nextRun
    ? Math.max(0, Math.round((nextRun.getTime() - Date.now()) / 1000))
    : null;

  const statusColor =
    status.last_status === "partial"
      ? "text-amber-600 dark:text-amber-400"
      : status.last_status === "error"
      ? "text-red-500 dark:text-red-400"
      : "";

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!val) return;
    setUpdating(true);
    try { await onIntervalChange(val); } finally { setUpdating(false); }
  };

  return (
    <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
      <Clock size={12} />
      <span>Auto-refresh every</span>
      <select
        value={status.poll_interval_seconds}
        onChange={handleChange}
        disabled={updating}
        className="text-xs rounded-md border border-slate-200 bg-white text-slate-600 px-1.5 py-0.5 disabled:opacity-50 dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-300 cursor-pointer hover:border-indigo-400 transition-colors"
        aria-label="Poll interval"
      >
        {!INTERVAL_PRESETS.some((p) => p.seconds === status.poll_interval_seconds) && (
          <option value={status.poll_interval_seconds}>{status.poll_interval_seconds}s</option>
        )}
        {INTERVAL_PRESETS.map((p) => (
          <option key={p.seconds} value={p.seconds}>{p.label}</option>
        ))}
      </select>
      {secondsUntil !== null && (
        <>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span>next in {secondsUntil}s</span>
        </>
      )}
      {(status.last_status === "partial" || status.last_status === "error") && (
        <span title={status.last_error ?? undefined} className={`flex items-center gap-0.5 ${statusColor}`}>
          <AlertTriangle size={12} />
          {status.last_status === "partial" ? "some profiles failed" : "poll error"}
        </span>
      )}
    </div>
  );
}

// ── Lambda Drawer ──────────────────────────────────────────────────────────

function LambdaDrawer({ fn, onClose }: { fn: LambdaFunction | null; onClose: () => void }) {
  return (
    <SlideOverDrawer isOpen={!!fn} onClose={onClose} title={fn ? fn.FunctionName : ""}>
      {fn && (
        <div className="space-y-6 text-sm">

          {/* Identity */}
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Function</p>
            <dl className="space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Name</dt>
                <dd className="font-mono text-xs text-slate-700 dark:text-slate-200 text-right break-all">{fn.FunctionName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Handler</dt>
                <dd className="font-mono text-xs text-slate-600 dark:text-slate-300 text-right break-all">{fn.Handler || "—"}</dd>
              </div>
              {fn.Description && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400 shrink-0">Description</dt>
                  <dd className="text-slate-600 dark:text-slate-300 text-right text-xs">{fn.Description}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">State</dt>
                <dd><LambdaStateBadge state={fn.State} /></dd>
              </div>
            </dl>
          </div>

          {/* Runtime & Config */}
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Configuration</p>
            <dl className="space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Runtime</dt>
                <dd>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                    {fn.Runtime || "—"}
                  </span>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Memory</dt>
                <dd className="text-slate-600 dark:text-slate-300 text-xs">{fn.MemorySize > 0 ? `${fn.MemorySize} MB` : "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Timeout</dt>
                <dd className="text-slate-600 dark:text-slate-300 text-xs">{fn.Timeout > 0 ? `${fn.Timeout}s` : "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Code size</dt>
                <dd className="text-slate-600 dark:text-slate-300 text-xs">{fn.CodeSize > 0 ? formatBytes(fn.CodeSize) : "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Last modified</dt>
                <dd className="text-slate-600 dark:text-slate-300 text-xs">{formatDate(fn.LastModified)}</dd>
              </div>
            </dl>
          </div>

          {/* Deployment */}
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Deployment</p>
            <dl className="space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Profile</dt>
                <dd><ProfileBadge profile={fn.Profile} color={fn.ProfileColor} envTag={fn.ProfileEnvTag} /></dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Region</dt>
                <dd className="text-slate-600 dark:text-slate-300 text-xs font-mono">{fn.Region}</dd>
              </div>
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

function LambdaTable({
  functions,
  loading,
  onClearFilters,
  hasActiveFilters,
  page,
  pageSize,
  onRowClick,
}: {
  functions: LambdaFunction[];
  loading: boolean;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  page: number;
  pageSize: PageSize;
  onRowClick: (fn: LambdaFunction) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("FunctionName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = [...functions].sort((a, b) => {
    const av = a[sortKey] ?? "";
    const bv = b[sortKey] ?? "";
    // Numeric sort for memory/timeout
    if (sortKey === "MemorySize" || sortKey === "Timeout") {
      const cmp = Number(av) - Number(bv);
      return sortDir === "asc" ? cmp : -cmp;
    }
    const cmp = String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (col !== sortKey) return <ChevronsUpDown size={13} className="text-slate-300 dark:text-slate-600" />;
    return sortDir === "asc"
      ? <ChevronUp size={13} className="text-blue-500" />
      : <ChevronDown size={13} className="text-blue-500" />;
  };

  if (!loading && sorted.length === 0) {
    if (hasActiveFilters) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <p className="text-lg font-medium text-slate-600 dark:text-slate-300">
            No functions match the current filters.
          </p>
          <button
            onClick={onClearFilters}
            className="mt-3 px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-[#2a2d3a] dark:hover:bg-[#33374a] dark:text-slate-300 transition-colors"
          >
            Clear filters
          </button>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <p className="text-lg font-medium">No Lambda functions found</p>
        <p className="text-xs mt-1">
          No functions are cached yet — click Refresh to poll AWS
        </p>
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
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-slate-600 select-none whitespace-nowrap dark:text-slate-500 dark:hover:text-slate-300"
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <SortIcon col={col.key} />
                  </span>
                </th>
              ))}

            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#2a2d3a]">
            {loading
              ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={8} />)
              : paginated.map((fn) => {
                  return (
                    <tr
                      key={`${fn.Profile}:${fn.Region}:${fn.FunctionName}`}
                      onClick={() => onRowClick(fn)}
                      className="group bg-white hover:bg-slate-50 transition-colors dark:bg-[#1c1f2e] dark:hover:bg-[#222538] cursor-pointer"
                    >
                      {/* Function name */}
                      <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-200 max-w-[200px] w-[200px]">
                        <div className="flex items-center min-w-0">
                          <span className="truncate" title={fn.FunctionName}>{fn.FunctionName}</span>
                          <span className="shrink-0"><CopyButton text={fn.FunctionName} /></span>
                        </div>
                        {fn.Description && (
                          <p className="text-slate-400 dark:text-slate-500 truncate text-xs font-sans mt-0.5" title={fn.Description}>
                            {fn.Description}
                          </p>
                        )}
                      </td>

                      {/* Profile */}
                      <td className="px-4 py-3">
                        <ProfileBadge
                          profile={fn.Profile}
                          color={fn.ProfileColor}
                          envTag={fn.ProfileEnvTag}
                        />
                      </td>

                      {/* Region */}
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap dark:text-slate-300 text-xs">
                        {fn.Region}
                      </td>

                      {/* Runtime */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                          {fn.Runtime || "—"}
                        </span>
                      </td>

                      {/* State */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <LambdaStateBadge state={fn.State} />
                      </td>

                      {/* Memory */}
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap dark:text-slate-400 text-xs">
                        {fn.MemorySize > 0 ? `${fn.MemorySize} MB` : "—"}
                      </td>

                      {/* Timeout */}
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap dark:text-slate-400 text-xs">
                        {fn.Timeout > 0 ? `${fn.Timeout}s` : "—"}
                      </td>

                      {/* Last Modified */}
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap dark:text-slate-400 text-xs">
                        {formatDate(fn.LastModified)}
                      </td>


                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── LambdaDashboard ────────────────────────────────────────────────────────

export default function LambdaDashboard() {
  const [functions, setFunctions] = useState<LambdaFunction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedRuntimes, setSelectedRuntimes] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);

  // Drawer
  const [selectedFn, setSelectedFn] = useState<LambdaFunction | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const s = await fetchSchedulerStatus();
      setSchedulerStatus(s);
    } catch {
      // non-critical
    }
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
      try {
        await triggerSchedulerPoll();
        await new Promise((r) => setTimeout(r, 2000));
      } catch {
        // best-effort
      }
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await fetchLambdas();
      setFunctions(data);
      setLastUpdated(new Date());
      if (!isRefresh) {
        setSelectedProfiles([...new Set(data.map((f) => f.Profile))]);
        setSelectedRegions([...new Set(data.map((f) => f.Region))]);
        setSelectedRuntimes([...new Set(data.map((f) => f.Runtime))]);
        setSelectedStates([...new Set(data.map((f) => f.State))]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    await loadStatus();
  }, [loadStatus]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const id = setInterval(loadStatus, 10_000);
    return () => clearInterval(id);
  }, [loadStatus]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const allProfiles = [...new Set(functions.map((f) => f.Profile))].sort();
  const allRegions  = [...new Set(functions.map((f) => f.Region))].sort();
  const allRuntimes = [...new Set(functions.map((f) => f.Runtime))].sort();
  const allStates   = [...new Set(functions.map((f) => f.State))].sort();

  const profileColorMap = Object.fromEntries(
    functions.map((f) => [f.Profile, f.ProfileColor])
  );

  const total       = functions.length;
  const activeCount = functions.filter((f) => f.State === "Active").length;
  const regionCount = new Set(functions.map((f) => f.Region)).size;

  // ── Filter logic ──────────────────────────────────────────────────────────

  const filtered = functions.filter((f) => {
    const matchProfile = selectedProfiles.length === 0 || selectedProfiles.includes(f.Profile);
    const matchRegion  = selectedRegions.length === 0  || selectedRegions.includes(f.Region);
    const matchRuntime = selectedRuntimes.length === 0 || selectedRuntimes.includes(f.Runtime);
    const matchState   = selectedStates.length === 0   || selectedStates.includes(f.State);
    const matchSearch  = !search || f.FunctionName.toLowerCase().includes(search.toLowerCase());
    return matchProfile && matchRegion && matchRuntime && matchState && matchSearch;
  });

  const hasActiveFilters =
    search.trim() !== "" ||
    (selectedProfiles.length > 0 && selectedProfiles.length < allProfiles.length) ||
    (selectedRegions.length > 0 && selectedRegions.length < allRegions.length) ||
    (selectedRuntimes.length > 0 && selectedRuntimes.length < allRuntimes.length) ||
    (selectedStates.length > 0 && selectedStates.length < allStates.length);

  const handleClearAll = () => {
    setSearch("");
    setSelectedProfiles([...new Set(functions.map((f) => f.Profile))]);
    setSelectedRegions([...new Set(functions.map((f) => f.Region))]);
    setSelectedRuntimes([...new Set(functions.map((f) => f.Runtime))]);
    setSelectedStates([...new Set(functions.map((f) => f.State))]);
    setPage(1);
  };

  const handleIntervalChange = async (seconds: number) => {
    try {
      const updated = await updateSchedulerInterval(seconds);
      setSchedulerStatus(updated);
    } catch {
      // non-critical
    }
  };

  return (
    <div className="p-6 overflow-auto bg-slate-100 dark:bg-[#0f1117] min-h-full">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Lambda Functions
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {lastUpdated && `Cache read at ${lastUpdated.toLocaleTimeString()}`}
          </p>
          <div className="mt-1">
            <SchedulerBadge status={schedulerStatus} onIntervalChange={handleIntervalChange} />
          </div>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-300 dark:hover:bg-white/5"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Polling AWS…" : "Refresh"}
        </button>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Total Functions"
          value={loading ? 0 : total}
          total={total}
          color="blue"
          icon={<Zap size={20} />}
        />
        <StatCard
          label="Active"
          value={loading ? 0 : activeCount}
          total={total}
          color="green"
          icon={<Zap size={20} />}
        />
        <StatCard
          label="Regions"
          value={loading ? 0 : regionCount}
          total={regionCount}
          color="purple"
          icon={<Globe size={20} />}
        />
      </div>

      {/* ── Filter toolbar ── */}
      <div className="mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search functions…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-400 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-200 dark:placeholder-slate-500"
            />
          </div>

          <DropdownChip
            label="Profile"
            allItems={allProfiles}
            selectedItems={selectedProfiles}
            onChange={(v) => { setSelectedProfiles(v); setPage(1); }}
            renderItem={(name) => {
              const color = profileColorMap[name] ?? "#6366f1";
              return (
                <span className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 truncate">
                  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  {name}
                </span>
              );
            }}
          />

          <DropdownChip
            label="Region"
            allItems={allRegions}
            selectedItems={selectedRegions}
            onChange={(v) => { setSelectedRegions(v); setPage(1); }}
          />

          <DropdownChip
            label="Runtime"
            allItems={allRuntimes}
            selectedItems={selectedRuntimes}
            onChange={(v) => { setSelectedRuntimes(v); setPage(1); }}
          />

          <DropdownChip
            label="State"
            allItems={allStates}
            selectedItems={selectedStates}
            onChange={(v) => { setSelectedStates(v); setPage(1); }}
          />

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearAll}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              <X size={12} />
              Clear filters
            </button>
          )}

          <span className="ml-auto text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
            {filtered.length} of {total} functions
          </span>
          {total > 0 && (
            <Pagination
              total={filtered.length}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            />
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-950/20 p-6 text-red-600 dark:text-red-400">
          <p className="font-semibold mb-1">Failed to load Lambda functions</p>
          <p className="text-sm font-mono opacity-80 mb-3">{error}</p>
          <button onClick={() => load()} className="text-sm underline hover:no-underline">
            Try again
          </button>
        </div>
      ) : (
        <LambdaTable
          functions={filtered}
          loading={loading}
          onClearFilters={handleClearAll}
          hasActiveFilters={hasActiveFilters}
          page={page}
          pageSize={pageSize}
          onRowClick={setSelectedFn}
        />
      )}

      <LambdaDrawer fn={selectedFn} onClose={() => setSelectedFn(null)} />
    </div>
  );
}
