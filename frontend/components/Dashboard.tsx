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

function CopyErrorButton({ error }: { error: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(error); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors duration-150"
      style={{ border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444" }}
    >
      {copied ? <><Check size={13} className="text-emerald-500" />Copied</> : <><Copy size={13} />Copy error</>}
    </button>
  );
}

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

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);

  const { filterState, setFilter, clearFilters, search, setSearch, debouncedSearch } =
    useFilterState({ onFilterChange: () => setPage(1) });

  const allProfiles = useMemo(() => [...new Set(instances.map((i) => i.Profile))].sort(), [instances]);
  const allStates   = useMemo(() => [...new Set(instances.map((i) => i.State))].sort(), [instances]);
  const allTypes    = useMemo(() => [...new Set(instances.map((i) => i["Instance Type"]))].sort(), [instances]);
  const profileColorMap = useMemo(() => Object.fromEntries(instances.map((i) => [i.Profile, i.ProfileColor])), [instances]);
  const allOptionsByKey = useMemo(() => ({ profile: allProfiles, state: allStates, type: allTypes }), [allProfiles, allStates, allTypes]);

  const profileOptions: FilterOption[] = useMemo(
    () => allProfiles.map((name) => ({ value: name, label: name, color: profileColorMap[name] ?? "#6366f1" })),
    [allProfiles, profileColorMap]
  );

  const filters: FilterConfig[] = useMemo(() => [
    { key: "state",   label: "State",         type: "multi-select" as const, options: allStates.map((s) => ({ value: s })) },
    { key: "type",    label: "Instance Type",  type: "multi-select" as const, options: allTypes.map((t) => ({ value: t })) },
    { key: "profile", label: "Profile",        type: "multi-select" as const, options: profileOptions },
  ], [allStates, allTypes, profileOptions]);

  const hasActiveFilters = useMemo(() => {
    if (debouncedSearch.trim()) return true;
    return Object.entries(filterState).some(([key, selected]) => {
      const total = allOptionsByKey[key as keyof typeof allOptionsByKey]?.length ?? 0;
      return selected.length > 0 && selected.length < total;
    });
  }, [filterState, debouncedSearch, allOptionsByKey]);

  const filtered = useMemo(() => applyFilters(
    instances, filterState, debouncedSearch,
    (inst, key) => {
      if (key === "profile") return inst.Profile;
      if (key === "state")   return inst.State;
      if (key === "type")    return inst["Instance Type"];
      return "";
    },
    (inst) => [inst.Name]
  ), [instances, filterState, debouncedSearch]);

  const total        = instances.length;
  const runningCount = useMemo(() => instances.filter((i) => i.State === "running").length, [instances]);
  const stoppedCount = useMemo(() => instances.filter((i) => i.State === "stopped").length, [instances]);

  const handleStatCardClick = (state: string) => {
    const current = filterState["state"] ?? [];
    setFilter("state", current.length === 1 && current[0] === state ? [] : [state]);
    setPage(1);
  };

  const handleClearAll = () => { clearFilters(); setPage(1); };
  const pct = (v: number, t: number) => t === 0 ? "0%" : `${Math.round((v / t) * 100)}%`;

  return (
    <div className="p-6 min-h-full" style={{ background: "var(--bg-page)" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            EC2 Instances
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
            {lastUpdated ? `Synced ${lastUpdated.toLocaleTimeString()}` : "Loading…"}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors duration-150 disabled:opacity-50"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Polling AWS…" : "Refresh"}
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Instances" value={loading ? 0 : total} color="blue" icon={<Server size={18} />} />
        <StatCard
          label="Running"
          value={loading ? 0 : runningCount}
          color="green"
          icon={<Activity size={18} />}
          onClick={() => handleStatCardClick("running")}
          isActive={(filterState["state"] ?? []).length === 1 && filterState["state"][0] === "running"}
          ratio={`${pct(runningCount, total)} of total`}
        />
        <StatCard
          label="Stopped"
          value={loading ? 0 : stoppedCount}
          color="red"
          icon={<StopCircle size={18} />}
          onClick={() => handleStatCardClick("stopped")}
          isActive={(filterState["state"] ?? []).length === 1 && filterState["state"][0] === "stopped"}
          ratio={`${pct(stoppedCount, total)} of total`}
        />
      </div>

      {/* Filter toolbar */}
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

      {/* Content */}
      {error ? (
        <div className="rounded-xl border p-6" style={{ background: "rgba(239,68,68,0.05)", borderColor: "rgba(239,68,68,0.2)" }}>
          <p className="text-[14px] font-semibold mb-1" style={{ color: "#ef4444" }}>Failed to load instances</p>
          <p className="text-[13px] font-mono mb-3 opacity-80" style={{ color: "#ef4444" }}>{error}</p>
          <div className="flex items-center gap-3">
            <CopyErrorButton error={error} />
            <button onClick={() => load()} className="text-[13px] underline hover:no-underline" style={{ color: "var(--text-secondary)" }}>
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
