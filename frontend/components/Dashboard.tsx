"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Server, Activity, StopCircle, Search, SlidersHorizontal, Sun, Moon } from "lucide-react";
import { fetchInstances } from "@/lib/api";
import { Instance } from "@/lib/types";
import { useTheme } from "@/lib/theme";
import StatCard from "./StatCard";
import InstanceTable from "./InstanceTable";

export default function Dashboard() {
  const { theme, toggle } = useTheme();

  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await fetchInstances();
      setInstances(data);
      setLastUpdated(new Date());
      if (!isRefresh) {
        setSelectedProfiles([...new Set(data.map(i => i.Profile))]);
        setSelectedStates([...new Set(data.map(i => i.State))]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const allProfiles = [...new Set(instances.map(i => i.Profile))].sort();
  const allStates   = [...new Set(instances.map(i => i.State))].sort();

  const filtered = instances.filter(i => {
    const matchProfile = selectedProfiles.length === 0 || selectedProfiles.includes(i.Profile);
    const matchState   = selectedStates.length === 0 || selectedStates.includes(i.State);
    const matchSearch  = !search || i.Name.toLowerCase().includes(search.toLowerCase());
    return matchProfile && matchState && matchSearch;
  });

  const runningCount = filtered.filter(i => i.State === "running").length;
  const stoppedCount = filtered.filter(i => i.State === "stopped").length;

  const toggleFilter = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter(x => x !== value) : [...list, value]);
  };

  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar ── */}
      <aside className="w-64 shrink-0 flex flex-col bg-white border-r border-slate-200 dark:bg-[#161825] dark:border-[#2a2d3a]">
        {/* Logo */}
        <div className="p-6 border-b border-slate-200 dark:border-[#2a2d3a] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">☁️</span>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white leading-tight">AWS EC2</h1>
              <p className="text-xs text-slate-400 dark:text-slate-500">Dashboard</p>
            </div>
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-300 dark:hover:bg-white/5 transition-colors"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
          {/* Search */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 block">
              Search
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Instance name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors dark:bg-[#0f1117] dark:border-[#2a2d3a] dark:text-slate-200 dark:placeholder-slate-600"
              />
            </div>
          </div>

          {/* Profile filter */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1">
              <SlidersHorizontal size={11} /> Profile
            </label>
            <div className="space-y-1">
              {allProfiles.map(p => (
                <button
                  key={p}
                  onClick={() => toggleFilter(selectedProfiles, setSelectedProfiles, p)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedProfiles.includes(p)
                      ? "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-600/20 dark:text-blue-300 dark:border-blue-500/30"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-white/5"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* State filter */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1">
              <SlidersHorizontal size={11} /> State
            </label>
            <div className="space-y-1">
              {allStates.map(s => (
                <button
                  key={s}
                  onClick={() => toggleFilter(selectedStates, setSelectedStates, s)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedStates.includes(s)
                      ? s === "running"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-600/20 dark:text-emerald-300 dark:border-emerald-500/30"
                        : "bg-red-50 text-red-700 border border-red-200 dark:bg-red-600/20 dark:text-red-300 dark:border-red-500/30"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-white/5"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </nav>

        {/* Refresh */}
        <div className="p-4 border-t border-slate-200 dark:border-[#2a2d3a]">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50 dark:bg-blue-600/20 dark:hover:bg-blue-600/30 dark:border-blue-500/30 dark:text-blue-300"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          {lastUpdated && (
            <p className="text-center text-xs text-slate-400 dark:text-slate-600 mt-2">
              Updated {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 p-8 overflow-auto bg-slate-100 dark:bg-[#0f1117]">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Instances</h2>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
            {filtered.length} of {instances.length} instances shown
          </p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <StatCard label="Total"   value={filtered.length} color="blue"  icon={<Server size={20} />} />
          <StatCard label="Running" value={runningCount}    color="green" icon={<Activity size={20} />} />
          <StatCard label="Stopped" value={stoppedCount}    color="red"   icon={<StopCircle size={20} />} />
        </div>

        {/* Table / states */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-3 text-slate-400 dark:text-slate-500">
            <RefreshCw size={28} className="animate-spin" />
            <p>Loading instances…</p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-600 dark:border-red-500/30 dark:bg-red-950/20 dark:text-red-400">
            <p className="font-semibold mb-1">Failed to load instances</p>
            <p className="text-sm opacity-80">{error}</p>
            <button onClick={() => load()} className="mt-3 text-sm underline hover:no-underline">
              Try again
            </button>
          </div>
        ) : (
          <InstanceTable instances={filtered} />
        )}
      </main>
    </div>
  );
}
