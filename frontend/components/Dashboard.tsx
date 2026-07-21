"use client";

import { useState, useCallback, useMemo } from "react";
import { RefreshCw, Server, Activity, StopCircle, Copy, Check } from "lucide-react";
import { fetchInstances, triggerSchedulerPoll } from "@/lib/api";
import { useResourceLoad } from "@/lib/useInitialFetch";
import { Instance } from "@/lib/types";
import StatCard from "./StatCard";
import InstanceTable from "./InstanceTable";
import { FilterToolbar, useFilterState, applyFilters } from "./filters";
import type { FilterConfig, FilterOption } from "./filters";
import Pagination, { PageSize } from "./Pagination";

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

// ── Dashboard ──────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [instances, setInstances] = useState<Instance[]>([]);

  const beforeRefresh = useCallback(async () => {
    await triggerSchedulerPoll();
    await new Promise((r) => setTimeout(r, 2000));
  }, []);

  const { loading, error, lastUpdated, refreshing, load } = useResourceLoad({
    fetcher: fetchInstances,
    onData: setInstances,
    beforeRefresh,
  });

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);

  // Filter state — convention: [] = show all
  const {
    filterState,
    setFilter,
    clearFilters,
    search,
    setSearch,
    debouncedSearch,
  } = useFilterState({ onFilterChange: () => setPage(1) });

  // ── Derived option lists ────────────────────────────────────────────────

  const allProfiles = useMemo(
    () => [...new Set(instances.map((i) => i.Profile))].sort(),
    [instances]
  );
  const allStates = useMemo(
    () => [...new Set(instances.map((i) => i.State))].sort(),
    [instances]
  );
  const allTypes = useMemo(
    () => [...new Set(instances.map((i) => i["Instance Type"]))].sort(),
    [instances]
  );

  const profileColorMap = useMemo(
    () => Object.fromEntries(instances.map((i) => [i.Profile, i.ProfileColor])),
    [instances]
  );

  const allOptionsByKey: Record<string, string[]> = useMemo(
    () => ({ profile: allProfiles, state: allStates, type: allTypes }),
    [allProfiles, allStates, allTypes]
  );

  // ── Filter config ───────────────────────────────────────────────────────
  // Recommended order: search | environment | region | status | type | profile

  const profileOptions: FilterOption[] = useMemo(
    () =>
      allProfiles.map((name) => ({
        value: name,
        label: name,
        color: profileColorMap[name] ?? "#6366f1",
      })),
    [allProfiles, profileColorMap]
  );

  const filters: FilterConfig[] = useMemo(
    () => [
      {
        key: "state",
        label: "State",
        type: "multi-select" as const,
        options: allStates.map((s) => ({ value: s })),
      },
      {
        key: "type",
        label: "Instance Type",
        type: "multi-select" as const,
        options: allTypes.map((t) => ({ value: t })),
      },
      {
        key: "profile",
        label: "Profile",
        type: "multi-select" as const,
        options: profileOptions,
      },
    ],
    [allStates, allTypes, profileOptions]
  );

  // ── Active filter detection ─────────────────────────────────────────────

  const hasActiveFilters = useMemo(() => {
    if (debouncedSearch.trim()) return true;
    return Object.entries(filterState).some(([key, selected]) => {
      const total = allOptionsByKey[key]?.length ?? 0;
      return selected.length > 0 && selected.length < total;
    });
  }, [filterState, debouncedSearch, allOptionsByKey]);

  // ── Filter logic ────────────────────────────────────────────────────────

  const filtered = useMemo(
    () =>
      applyFilters(
        instances,
        filterState,
        debouncedSearch,
        (inst, key) => {
          if (key === "profile") return inst.Profile;
          if (key === "state") return inst.State;
          if (key === "type") return inst["Instance Type"];
          return "";
        },
        (inst) => [inst.Name]
      ),
    [instances, filterState, debouncedSearch]
  );

  // ── Stat counts ─────────────────────────────────────────────────────────

  const total = instances.length;
  const runningCount = useMemo(
    () => instances.filter((i) => i.State === "running").length,
    [instances]
  );
  const stoppedCount = useMemo(
    () => instances.filter((i) => i.State === "stopped").length,
    [instances]
  );

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleStatCardClick = (state: string) => {
    const current = filterState["state"] ?? [];
    if (current.length === 1 && current[0] === state) {
      // Toggle off — clear the state filter
      setFilter("state", []);
    } else {
      setFilter("state", [state]);
    }
    setPage(1);
  };

  const handleClearAll = () => {
    clearFilters();
    setPage(1);
  };

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
          {lastUpdated && (
            <p className="text-xs text-slate-400 mt-0.5">
              Synced {lastUpdated.toLocaleTimeString()}
            </p>
          )}
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
          isActive={
            (filterState["state"] ?? []).length === 1 &&
            filterState["state"][0] === "running"
          }
          ratio={ratio(runningCount, total)}
        />
        <StatCard
          label="Stopped"
          value={stoppedCount}
          total={total}
          color="red"
          icon={<StopCircle size={20} />}
          onClick={() => handleStatCardClick("stopped")}
          isActive={
            (filterState["state"] ?? []).length === 1 &&
            filterState["state"][0] === "stopped"
          }
          ratio={ratio(stoppedCount, total)}
        />
      </div>

      {/* ── Filter toolbar ── */}
      <div className="mb-4">
        <FilterToolbar
          filters={filters}
          filterState={filterState}
          onFilterChange={(key, values) => { setFilter(key, values); setPage(1); }}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search instances…"
          hasActiveFilters={hasActiveFilters}
          onClearAll={handleClearAll}
          resultCount={filtered.length}
          totalCount={total}
          resultLabel="instances"
          paginationSlot={
            total > 0 ? (
              <Pagination
                total={filtered.length}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
              />
            ) : undefined
          }
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
          page={page}
          pageSize={pageSize}
        />
      )}
    </div>
  );
}
