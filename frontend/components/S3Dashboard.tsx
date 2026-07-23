"use client";

import { useState, useCallback, useMemo } from "react";
import { RefreshCw, Database, Globe, ChevronUp, ChevronDown, ChevronsUpDown, Copy, Check } from "lucide-react";
import { fetchS3Buckets, triggerSchedulerPoll } from "@/lib/api";
import { useResourceLoad } from "@/lib/useInitialFetch";
import { S3Bucket } from "@/lib/types";
import StatCard from "./StatCard";
import SkeletonRow from "./SkeletonRow";
import ProfileBadge from "./ProfileBadge";
import Pagination, { PageSize } from "./Pagination";
import { FilterToolbar, useFilterState, applyFilters } from "./filters";
import type { FilterConfig, FilterOption } from "./filters";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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

type SortKey = "BucketName" | "Profile" | "Region" | "CreationDate";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "BucketName",    label: "Bucket Name" },
  { key: "Profile",       label: "Profile" },
  { key: "Region",        label: "Region" },
  { key: "CreationDate",  label: "Created" },
];

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown size={12} style={{ color: "var(--text-tertiary)" }} />;
  return sortDir === "asc" ? <ChevronUp size={12} style={{ color: "var(--brand)" }} /> : <ChevronDown size={12} style={{ color: "var(--brand)" }} />;
}

function S3Table({ buckets, loading, onClearFilters, hasActiveFilters, page, pageSize }: {
  buckets: S3Bucket[]; loading: boolean; onClearFilters: () => void;
  hasActiveFilters: boolean; page: number; pageSize: PageSize;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("BucketName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = useMemo(() =>
    [...buckets].sort((a, b) => {
      const cmp = String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    }), [buckets, sortKey, sortDir]);

  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  if (!loading && sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 rounded-xl border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "var(--bg-subtle)" }}>
          <Database size={22} style={{ color: "var(--text-tertiary)" }} />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            {hasActiveFilters ? "No buckets match" : "No buckets found"}
          </p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {hasActiveFilters ? "Try adjusting your filters." : "Click Refresh to poll AWS for S3 buckets."}
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
              ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={4} />)
              : paginated.map((bucket) => (
                  <tr
                    key={`${bucket.Profile}:${bucket.BucketName}`}
                    className="group/row border-b table-row-hover"
                    style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-card)")}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center font-mono text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                        {bucket.BucketName}
                        <CopyButton text={bucket.BucketName} />
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <ProfileBadge profile={bucket.Profile} color={bucket.ProfileColor} envTag={bucket.ProfileEnvTag} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[12px] font-medium" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                        {bucket.Region}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                      {formatDate(bucket.CreationDate)}
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function S3Dashboard() {
  const [buckets, setBuckets] = useState<S3Bucket[]>([]);

  const beforeRefresh = useCallback(async () => {
    await triggerSchedulerPoll();
    await new Promise((r) => setTimeout(r, 2000));
  }, []);

  const { loading, error, lastUpdated, refreshing, load } = useResourceLoad({
    fetcher: fetchS3Buckets,
    onData: setBuckets,
    beforeRefresh,
  });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);

  const { filterState, setFilter, clearFilters, search, setSearch, debouncedSearch } =
    useFilterState({ onFilterChange: () => setPage(1) });

  const allProfiles = useMemo(() => [...new Set(buckets.map((b) => b.Profile))].sort(), [buckets]);
  const allRegions  = useMemo(() => [...new Set(buckets.map((b) => b.Region))].sort(), [buckets]);
  const profileColorMap = useMemo(() => Object.fromEntries(buckets.map((b) => [b.Profile, b.ProfileColor])), [buckets]);
  const allOptionsByKey = useMemo(() => ({ profile: allProfiles, region: allRegions }), [allProfiles, allRegions]);

  const profileOptions: FilterOption[] = useMemo(
    () => allProfiles.map((name) => ({ value: name, label: name, color: profileColorMap[name] ?? "#6366f1" })),
    [allProfiles, profileColorMap]
  );

  const filters: FilterConfig[] = useMemo(() => [
    { key: "region",  label: "Region",  type: "multi-select" as const, options: allRegions.map((r) => ({ value: r })) },
    { key: "profile", label: "Profile", type: "multi-select" as const, options: profileOptions },
  ], [allRegions, profileOptions]);

  const hasActiveFilters = useMemo(() => {
    if (debouncedSearch.trim()) return true;
    return Object.entries(filterState).some(([key, selected]) => {
      const total = allOptionsByKey[key as keyof typeof allOptionsByKey]?.length ?? 0;
      return selected.length > 0 && selected.length < total;
    });
  }, [filterState, debouncedSearch, allOptionsByKey]);

  const filtered = useMemo(() => applyFilters(
    buckets, filterState, debouncedSearch,
    (b, key) => { if (key === "profile") return b.Profile; if (key === "region") return b.Region; return ""; },
    (b) => [b.BucketName]
  ), [buckets, filterState, debouncedSearch]);

  const total       = buckets.length;
  const regionCount = useMemo(() => new Set(buckets.map((b) => b.Region)).size, [buckets]);
  const handleClearAll = () => { clearFilters(); setPage(1); };

  return (
    <div className="p-6 min-h-full" style={{ background: "var(--bg-page)" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>S3 Buckets</h1>
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

      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard label="Total Buckets" value={loading ? 0 : total}       color="blue"  icon={<Database size={18} />} />
        <StatCard label="Regions"       value={loading ? 0 : regionCount} color="green" icon={<Globe size={18} />} />
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
              <Pagination total={filtered.length} page={page} pageSize={pageSize}
                onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
            ) : undefined
          }
        />
      </div>

      {error ? (
        <div className="rounded-xl border p-6" style={{ background: "rgba(239,68,68,0.05)", borderColor: "rgba(239,68,68,0.2)" }}>
          <p className="text-[14px] font-semibold mb-1" style={{ color: "#ef4444" }}>Failed to load S3 buckets</p>
          <p className="text-[13px] font-mono mb-3 opacity-80" style={{ color: "#ef4444" }}>{error}</p>
          <button onClick={() => load()} className="text-[13px] underline" style={{ color: "var(--text-secondary)" }}>Try again</button>
        </div>
      ) : (
        <S3Table buckets={filtered} loading={loading} onClearFilters={handleClearAll}
          hasActiveFilters={hasActiveFilters} page={page} pageSize={pageSize} />
      )}
    </div>
  );
}
