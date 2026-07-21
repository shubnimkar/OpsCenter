"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, Database, Globe, ChevronUp, ChevronDown, ChevronsUpDown, Copy, Check } from "lucide-react";
import { fetchS3Buckets, triggerSchedulerPoll } from "@/lib/api";
import { S3Bucket } from "@/lib/types";
import StatCard from "./StatCard";
import SkeletonRow from "./SkeletonRow";
import ProfileBadge from "./ProfileBadge";
import Pagination, { PageSize } from "./Pagination";
import { FilterToolbar, useFilterState, applyFilters } from "./filters";
import type { FilterConfig, FilterOption } from "./filters";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

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
      {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
    </button>
  );
}

// ── S3 Table ───────────────────────────────────────────────────────────────

type SortKey = "BucketName" | "Profile" | "Region" | "CreationDate";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "BucketName", label: "Bucket Name" },
  { key: "Profile", label: "Profile" },
  { key: "Region", label: "Region" },
  { key: "CreationDate", label: "Created" },
];

function S3Table({
  buckets,
  loading,
  onClearFilters,
  hasActiveFilters,
  page,
  pageSize,
}: {
  buckets: S3Bucket[];
  loading: boolean;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  page: number;
  pageSize: PageSize;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("BucketName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = useMemo(
    () =>
      [...buckets].sort((a, b) => {
        const cmp = String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""));
        return sortDir === "asc" ? cmp : -cmp;
      }),
    [buckets, sortKey, sortDir]
  );

  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (col !== sortKey) return <ChevronsUpDown size={13} className="text-slate-300 dark:text-slate-600" />;
    return sortDir === "asc"
      ? <ChevronUp size={13} className="text-blue-500" />
      : <ChevronDown size={13} className="text-blue-500" />;
  };

  if (!loading && sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <p className="text-lg font-medium text-slate-600 dark:text-slate-300">
          {hasActiveFilters ? "No buckets match the current filters." : "No buckets found"}
        </p>
        {hasActiveFilters ? (
          <button onClick={onClearFilters} className="mt-3 px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-[#2a2d3a] dark:hover:bg-[#33374a] dark:text-slate-300 transition-colors">
            Clear filters
          </button>
        ) : (
          <p className="text-xs mt-1">No S3 buckets are cached yet — click Refresh to poll AWS</p>
        )}
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
            {loading
              ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={4} />)
              : paginated.map((bucket) => (
                  <tr key={`${bucket.Profile}:${bucket.BucketName}`}
                    className="group bg-white hover:bg-slate-50 transition-colors dark:bg-[#1c1f2e] dark:hover:bg-[#222538]">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap dark:text-slate-200">
                      <span className="inline-flex items-center">
                        {bucket.BucketName}
                        <CopyButton text={bucket.BucketName} />
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ProfileBadge profile={bucket.Profile} color={bucket.ProfileColor} envTag={bucket.ProfileEnvTag} />
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap dark:text-slate-300 text-xs">
                      {bucket.Region}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap dark:text-slate-400 text-xs">
                      {formatDate(bucket.CreationDate)}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── S3Dashboard ────────────────────────────────────────────────────────────

export default function S3Dashboard() {
  const [buckets, setBuckets] = useState<S3Bucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);

  const { filterState, setFilter, clearFilters, search, setSearch, debouncedSearch } =
    useFilterState({ onFilterChange: () => setPage(1) });

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
      try { await triggerSchedulerPoll(); await new Promise((r) => setTimeout(r, 2000)); } catch { /* best-effort */ }
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await fetchS3Buckets();
      setBuckets(data);
      setLastUpdated(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived ────────────────────────────────────────────────────────────

  const allProfiles = useMemo(() => [...new Set(buckets.map((b) => b.Profile))].sort(), [buckets]);
  const allRegions = useMemo(() => [...new Set(buckets.map((b) => b.Region))].sort(), [buckets]);
  const profileColorMap = useMemo(
    () => Object.fromEntries(buckets.map((b) => [b.Profile, b.ProfileColor])),
    [buckets]
  );

  const allOptionsByKey: Record<string, string[]> = useMemo(
    () => ({ profile: allProfiles, region: allRegions }),
    [allProfiles, allRegions]
  );

  // Filter config — recommended order: search | region | profile
  const profileOptions: FilterOption[] = useMemo(
    () => allProfiles.map((name) => ({ value: name, label: name, color: profileColorMap[name] ?? "#6366f1" })),
    [allProfiles, profileColorMap]
  );

  const filters: FilterConfig[] = useMemo(
    () => [
      { key: "region", label: "Region", type: "multi-select", options: allRegions.map((r) => ({ value: r })) },
      { key: "profile", label: "Profile", type: "multi-select", options: profileOptions },
    ],
    [allRegions, profileOptions]
  );

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
        buckets,
        filterState,
        debouncedSearch,
        (b, key) => {
          if (key === "profile") return b.Profile;
          if (key === "region") return b.Region;
          return "";
        },
        (b) => [b.BucketName]
      ),
    [buckets, filterState, debouncedSearch]
  );

  const total = buckets.length;
  const regionCount = useMemo(() => new Set(buckets.map((b) => b.Region)).size, [buckets]);

  const handleClearAll = () => { clearFilters(); setPage(1); };

  return (
    <div className="p-6 overflow-auto bg-slate-100 dark:bg-[#0f1117] min-h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">S3 Buckets</h2>
          {lastUpdated && <p className="text-xs text-slate-400 mt-0.5">Synced {lastUpdated.toLocaleTimeString()}</p>}
        </div>
        <button onClick={() => load(true)} disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-300 dark:hover:bg-white/5">
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Polling AWS…" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard label="Total Buckets" value={loading ? 0 : total} total={total} color="blue" icon={<Database size={20} />} />
        <StatCard label="Regions" value={loading ? 0 : regionCount} total={regionCount} color="green" icon={<Globe size={20} />} />
      </div>

      <div className="mb-4">
        <FilterToolbar
          filters={filters}
          filterState={filterState}
          onFilterChange={(key, values) => { setFilter(key, values); setPage(1); }}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search buckets…"
          hasActiveFilters={hasActiveFilters}
          onClearAll={handleClearAll}
          resultCount={filtered.length}
          totalCount={total}
          resultLabel="buckets"
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

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-950/20 p-6 text-red-600 dark:text-red-400">
          <p className="font-semibold mb-1">Failed to load S3 buckets</p>
          <p className="text-sm font-mono opacity-80 mb-3">{error}</p>
          <button onClick={() => load()} className="text-sm underline hover:no-underline">Try again</button>
        </div>
      ) : (
        <S3Table
          buckets={filtered}
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
