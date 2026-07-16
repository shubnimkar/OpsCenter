"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Server, Activity, StopCircle, Copy, Check, Clock, AlertTriangle } from "lucide-react";
import { fetchInstances, fetchSchedulerStatus, triggerSchedulerPoll, updateSchedulerInterval, SchedulerStatus } from "@/lib/api";
import { Instance } from "@/lib/types";
import StatCard from "./StatCard";
import InstanceTable from "./InstanceTable";
import FilterToolbar from "./FilterToolbar";

// ── CopyErrorButton ────────────────────────────────────────────────────────

function CopyErrorButton({ error }: { error: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(error);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-red-300 text-red-600 hover:bg-red-100 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10 transition-colors"
    >
      {copied ? (
        <>
          <Check size={13} className="text-emerald-500" />
          Copied
        </>
      ) : (
        <>
          <Copy size={13} />
          Copy error details
        </>
      )}
    </button>
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
    try {
      await onIntervalChange(val);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
      <Clock size={12} />
      <span>
        Auto-refresh every
      </span>
      {/* Interval picker */}
      <select
        value={status.poll_interval_seconds}
        onChange={handleChange}
        disabled={updating}
        className="text-xs rounded-md border border-slate-200 bg-white text-slate-600 px-1.5 py-0.5 disabled:opacity-50 dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-300 cursor-pointer hover:border-indigo-400 transition-colors"
        aria-label="Poll interval"
      >
        {/* If the current value isn't in presets, show it as a custom option */}
        {!INTERVAL_PRESETS.some(p => p.seconds === status.poll_interval_seconds) && (
          <option value={status.poll_interval_seconds}>
            {status.poll_interval_seconds}s
          </option>
        )}
        {INTERVAL_PRESETS.map(p => (
          <option key={p.seconds} value={p.seconds}>{p.label}</option>
        ))}
      </select>
      {secondsUntil !== null && (
        <span className="text-slate-300 dark:text-slate-600">·</span>
      )}
      {secondsUntil !== null && (
        <span>next in {secondsUntil}s</span>
      )}
      {(status.last_status === "partial" || status.last_status === "error") && (
        <span
          title={status.last_error ?? undefined}
          className={`flex items-center gap-0.5 ${statusColor}`}
        >
          <AlertTriangle size={12} />
          {status.last_status === "partial" ? "some profiles failed" : "poll error"}
        </span>
      )}
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [activeStatCardFilter, setActiveStatCardFilter] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const s = await fetchSchedulerStatus();
      setSchedulerStatus(s);
    } catch {
      // non-critical — silently ignore
    }
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
      // Tell the backend to kick off a fresh AWS poll, then wait briefly
      // before reading the cache so we get up-to-date data.
      try {
        await triggerSchedulerPoll();
        // Small delay to give the background poll time to write results
        await new Promise(r => setTimeout(r, 2000));
      } catch {
        // Best-effort — still reload the cache even if trigger fails
      }
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await fetchInstances();
      setInstances(data);
      setLastUpdated(new Date());
      if (!isRefresh) {
        setSelectedProfiles([...new Set(data.map(i => i.Profile))]);
        setSelectedStates([...new Set(data.map(i => i.State))]);
        setSelectedTypes([...new Set(data.map(i => i["Instance Type"]))]);
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

  // Refresh the scheduler countdown every 10 seconds
  useEffect(() => {
    const id = setInterval(loadStatus, 10_000);
    return () => clearInterval(id);
  }, [loadStatus]);

  // ── Derived data ───────────────────────────────────────────────────────

  const allProfiles = [...new Set(instances.map(i => i.Profile))].sort();
  const allStates   = [...new Set(instances.map(i => i.State))].sort();
  const allTypes    = [...new Set(instances.map(i => i["Instance Type"]))].sort();

  const profileColorMap = Object.fromEntries(
    instances.map(i => [i.Profile, i.ProfileColor])
  );

  const allProfileObjects = allProfiles.map(name => ({
    name,
    color: profileColorMap[name] ?? "#6366f1",
  }));

  // ── Filter logic ───────────────────────────────────────────────────────

  const filtered = instances.filter(i => {
    const matchProfile = selectedProfiles.length === 0 || selectedProfiles.includes(i.Profile);
    const matchState   = selectedStates.length === 0 || selectedStates.includes(i.State);
    const matchType    = selectedTypes.length === 0 || selectedTypes.includes(i["Instance Type"]);
    const matchSearch  = !search || i.Name.toLowerCase().includes(search.toLowerCase());
    return matchProfile && matchState && matchType && matchSearch;
  });

  const total        = instances.length;
  const runningCount = instances.filter(i => i.State === "running").length;
  const stoppedCount = instances.filter(i => i.State === "stopped").length;

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleStatCardClick = (state: string) => {
    if (activeStatCardFilter === state) {
      setActiveStatCardFilter(null);
      setSelectedStates([...new Set(instances.map(i => i.State))]);
    } else {
      setActiveStatCardFilter(state);
      setSelectedStates([state]);
    }
  };

  const handleIntervalChange = async (seconds: number) => {
    try {
      const updated = await updateSchedulerInterval(seconds);
      setSchedulerStatus(updated);
    } catch {
      // non-critical — ignore silently; the badge will still show the old value
    }
  };
  const handleClearAll = () => {
    setSearch("");
    setSelectedProfiles([...new Set(instances.map(i => i.Profile))]);
    setSelectedStates([...new Set(instances.map(i => i.State))]);
    setSelectedTypes([...new Set(instances.map(i => i["Instance Type"]))]);
    setActiveStatCardFilter(null);
  };

  const hasActiveFilters =
    search.trim() !== "" ||
    (selectedProfiles.length > 0 && selectedProfiles.length < allProfiles.length) ||
    (selectedStates.length > 0 && selectedStates.length < allStates.length) ||
    (selectedTypes.length > 0 && selectedTypes.length < allTypes.length);

  // ── Stat card ratio helpers ────────────────────────────────────────────

  const ratio = (value: number, t: number) =>
    t === 0
      ? "0 of 0 (0%)"
      : `${value} of ${t} (${Math.round((value / t) * 100)}%)`;

  return (
    <div className="p-6 overflow-auto bg-slate-100 dark:bg-[#0f1117] min-h-full">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Instances</h2>
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
          label="Total"
          value={total}
          total={total}
          color="blue"
          icon={<Server size={20} />}
        />
        <StatCard
          label="Running"
          value={runningCount}
          total={total}
          color="green"
          icon={<Activity size={20} />}
          onClick={() => handleStatCardClick("running")}
          isActive={activeStatCardFilter === "running"}
          ratio={ratio(runningCount, total)}
        />
        <StatCard
          label="Stopped"
          value={stoppedCount}
          total={total}
          color="red"
          icon={<StopCircle size={20} />}
          onClick={() => handleStatCardClick("stopped")}
          isActive={activeStatCardFilter === "stopped"}
          ratio={ratio(stoppedCount, total)}
        />
      </div>

      {/* ── Filter toolbar ── */}
      <div className="mb-4">
        <FilterToolbar
          allProfiles={allProfileObjects}
          allStates={allStates}
          allTypes={allTypes}
          selectedProfiles={selectedProfiles}
          selectedStates={selectedStates}
          selectedTypes={selectedTypes}
          search={search}
          resultCount={filtered.length}
          totalCount={total}
          onSearchChange={setSearch}
          onProfilesChange={setSelectedProfiles}
          onStatesChange={setSelectedStates}
          onTypesChange={setSelectedTypes}
          onClearAll={handleClearAll}
        />
      </div>

      {/* ── Main content ── */}
      {error ? (
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
      ) : (
        <InstanceTable
          instances={filtered}
          loading={loading}
          onClearFilters={handleClearAll}
          hasActiveFilters={hasActiveFilters}
        />
      )}
    </div>
  );
}
