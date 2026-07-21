"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw, Globe, Search, ChevronDown, ChevronUp, ChevronsUpDown,
  Copy, Check, X, Lock, Unlock, List,
} from "lucide-react";
import {
  fetchRoute53Zones, fetchRoute53Records,
  triggerSchedulerPoll,
} from "@/lib/api";
import { Route53Zone, Route53Record } from "@/lib/types";
import StatCard from "./StatCard";
import SkeletonRow from "./SkeletonRow";
import ProfileBadge from "./ProfileBadge";
import Pagination, { PageSize } from "./Pagination";
import SlideOverDrawer from "./SlideOverDrawer";

// ── Helpers ────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="ml-1.5 transition-opacity text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
    >
      {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
    </button>
  );
}

const RECORD_TYPE_COLORS: Record<string, string> = {
  A:     "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  AAAA:  "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  CNAME: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  MX:    "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  TXT:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  NS:    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  SOA:   "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  SRV:   "bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300",
  CAA:   "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  PTR:   "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
};

function RecordTypeBadge({ type }: { type: string }) {
  const cls = RECORD_TYPE_COLORS[type] ?? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium font-mono ${cls}`}>
      {type}
    </span>
  );
}

function ZoneTypeBadge({ isPrivate }: { isPrivate: boolean }) {
  return isPrivate ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
      <Lock size={10} /> Private
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
      <Unlock size={10} /> Public
    </span>
  );
}

// ── DropdownChip ───────────────────────────────────────────────────────────

interface DropdownChipProps {
  label: string; allItems: string[]; selectedItems: string[];
  onChange: (items: string[]) => void; renderItem?: (item: string) => React.ReactNode;
}

function DropdownChip({ label, allItems, selectedItems, onChange, renderItem }: DropdownChipProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const allSelected = selectedItems.length === 0 || selectedItems.length === allItems.length;
  const activeCount = selectedItems.length > 0 && selectedItems.length < allItems.length ? selectedItems.length : null;
  const toggle = (item: string) => {
    if (selectedItems.includes(item)) onChange(selectedItems.filter((x) => x !== item));
    else onChange([...selectedItems, item]);
  };
  return (
    <div ref={wrapperRef} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors
          ${activeCount !== null
            ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500/60 dark:bg-blue-600/15 dark:text-blue-300"
            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-300 dark:hover:bg-white/5"}`}>
        {label}
        {activeCount !== null && <span className="rounded-full bg-blue-500 text-white text-xs w-4 h-4 flex items-center justify-center leading-none">{activeCount}</span>}
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 min-w-[180px] rounded-xl border border-slate-200 bg-white shadow-lg dark:border-[#2a2d3a] dark:bg-[#161825]">
          <div className="flex items-center gap-3 px-3 pt-2 pb-1.5 border-b border-slate-100 dark:border-[#2a2d3a]">
            <button type="button" onClick={() => onChange([])} className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400">Select all</button>
            <button type="button" onClick={() => onChange([])} className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500">Clear</button>
          </div>
          <ul className="py-1 max-h-56 overflow-y-auto">
            {allItems.map((item) => (
              <li key={item}>
                <label className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5">
                  <input type="checkbox" checked={allSelected ? true : selectedItems.includes(item)} onChange={() => toggle(item)} className="accent-blue-500 w-3.5 h-3.5 shrink-0" />
                  {renderItem ? renderItem(item) : <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{item}</span>}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Zone Drawer ────────────────────────────────────────────────────────────

function ZoneDrawer({ zone, records, onClose }: { zone: Route53Zone | null; records: Route53Record[]; onClose: () => void }) {
  const zoneRecords = zone ? records.filter((r) => r.ZoneId === zone.ZoneId) : [];
  const recordTypes = [...new Set(zoneRecords.map((r) => r.RecordType))].sort();

  return (
    <SlideOverDrawer isOpen={!!zone} onClose={onClose} title={zone ? zone.Name : ""}>
      {zone && (
        <div className="space-y-6 text-sm">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Hosted Zone</p>
            <dl className="space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Name</dt>
                <dd className="font-mono text-xs text-slate-700 dark:text-slate-200 text-right break-all flex items-center gap-1">{zone.Name}<CopyButton text={zone.Name} /></dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Zone ID</dt>
                <dd className="font-mono text-xs text-slate-600 dark:text-slate-300 text-right flex items-center gap-1">{zone.ZoneId}<CopyButton text={zone.ZoneId} /></dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Type</dt>
                <dd><ZoneTypeBadge isPrivate={zone.PrivateZone} /></dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Records</dt>
                <dd className="text-slate-600 dark:text-slate-300 text-xs">{zone.RecordCount.toLocaleString()}</dd>
              </div>
              {zone.Comment && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400 shrink-0">Comment</dt>
                  <dd className="text-slate-600 dark:text-slate-300 text-xs text-right">{zone.Comment}</dd>
                </div>
              )}
            </dl>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Profile</p>
            <dl className="space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Account</dt>
                <dd><ProfileBadge profile={zone.Profile} color={zone.ProfileColor} envTag={zone.ProfileEnvTag} /></dd>
              </div>
            </dl>
          </div>
          {Object.keys(zone.Tags).length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(zone.Tags).map(([k, v]) => (
                  <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <span className="font-medium">{k}:</span>{v}
                  </span>
                ))}
              </div>
            </div>
          )}
          {recordTypes.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Record Types</p>
              <div className="flex flex-wrap gap-1.5">
                {recordTypes.map((t) => <RecordTypeBadge key={t} type={t} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </SlideOverDrawer>
  );
}

// ── Record Drawer ──────────────────────────────────────────────────────────

function RecordDrawer({ record, onClose }: { record: Route53Record | null; onClose: () => void }) {
  return (
    <SlideOverDrawer isOpen={!!record} onClose={onClose} title={record ? `${record.RecordName} — ${record.RecordType}` : ""}>
      {record && (
        <div className="space-y-6 text-sm">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Record</p>
            <dl className="space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Name</dt>
                <dd className="font-mono text-xs text-slate-700 dark:text-slate-200 text-right break-all flex items-center gap-1">{record.RecordName}<CopyButton text={record.RecordName} /></dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Type</dt>
                <dd><RecordTypeBadge type={record.RecordType} /></dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">TTL</dt>
                <dd className="text-slate-600 dark:text-slate-300 text-xs">{record.AliasTarget ? "Alias (no TTL)" : record.TTL != null ? `${record.TTL}s` : "—"}</dd>
              </div>
            </dl>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Values</p>
            {record.AliasTarget ? (
              <div className="rounded-lg border border-slate-200 dark:border-[#2a2d3a] p-3 bg-slate-50 dark:bg-[#0f1117]">
                <p className="text-xs text-slate-400 mb-1">Alias target</p>
                <p className="font-mono text-xs text-slate-700 dark:text-slate-200 break-all">{record.AliasTarget}</p>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {record.Values.map((v, i) => (
                  <li key={i} className="rounded-lg border border-slate-200 dark:border-[#2a2d3a] p-2.5 bg-slate-50 dark:bg-[#0f1117] flex items-start justify-between gap-2">
                    <span className="font-mono text-xs text-slate-700 dark:text-slate-200 break-all">{v}</span>
                    <CopyButton text={v} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          {(record.SetIdentifier || record.Weight != null || record.Region || record.Failover) && (
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Routing Policy</p>
              <dl className="space-y-2">
                {record.SetIdentifier && <div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400 shrink-0">Identifier</dt><dd className="text-slate-600 dark:text-slate-300 text-xs">{record.SetIdentifier}</dd></div>}
                {record.Weight != null && <div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400 shrink-0">Weight</dt><dd className="text-slate-600 dark:text-slate-300 text-xs">{record.Weight}</dd></div>}
                {record.Region && <div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400 shrink-0">Region</dt><dd className="font-mono text-xs text-slate-600 dark:text-slate-300">{record.Region}</dd></div>}
                {record.Failover && <div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400 shrink-0">Failover</dt><dd className="text-slate-600 dark:text-slate-300 text-xs">{record.Failover}</dd></div>}
              </dl>
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Deployment</p>
            <dl className="space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Profile</dt>
                <dd><ProfileBadge profile={record.Profile} color={record.ProfileColor} envTag={record.ProfileEnvTag} /></dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Zone ID</dt>
                <dd className="font-mono text-xs text-slate-600 dark:text-slate-300">{record.ZoneId}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </SlideOverDrawer>
  );
}

// ── Zones Table ────────────────────────────────────────────────────────────

type ZoneSortKey = "Name" | "Profile" | "RecordCount" | "PrivateZone";
type SortDir = "asc" | "desc";

function ZonesTable({ zones, loading, onClearFilters, hasActiveFilters, page, pageSize, onRowClick }: {
  zones: Route53Zone[]; loading: boolean; onClearFilters: () => void;
  hasActiveFilters: boolean; page: number; pageSize: PageSize; onRowClick: (z: Route53Zone) => void;
}) {
  const [sortKey, setSortKey] = useState<ZoneSortKey>("Name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const handleSort = (k: ZoneSortKey) => { if (k === sortKey) setSortDir((d) => d === "asc" ? "desc" : "asc"); else { setSortKey(k); setSortDir("asc"); } };
  const sorted = [...zones].sort((a, b) => {
    const av = a[sortKey] ?? ""; const bv = b[sortKey] ?? "";
    if (typeof av === "number") { const cmp = (av as number) - (bv as number); return sortDir === "asc" ? cmp : -cmp; }
    if (typeof av === "boolean") { const cmp = Number(av) - Number(bv as boolean); return sortDir === "asc" ? cmp : -cmp; }
    const cmp = String(av).localeCompare(String(bv)); return sortDir === "asc" ? cmp : -cmp;
  });
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);
  const SortIcon = ({ col }: { col: ZoneSortKey }) => col !== sortKey ? <ChevronsUpDown size={13} className="text-slate-300 dark:text-slate-600" /> : sortDir === "asc" ? <ChevronUp size={13} className="text-blue-500" /> : <ChevronDown size={13} className="text-blue-500" />;

  if (!loading && sorted.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
      <p className="text-lg font-medium text-slate-600 dark:text-slate-300">{hasActiveFilters ? "No zones match the current filters." : "No hosted zones found"}</p>
      {hasActiveFilters ? <button onClick={onClearFilters} className="mt-3 px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-[#2a2d3a] dark:hover:bg-[#33374a] dark:text-slate-300 transition-colors">Clear filters</button>
        : <p className="text-xs mt-1">No Route 53 zones cached yet — click Refresh to poll AWS</p>}
    </div>
  );

  const COLS: { key: ZoneSortKey; label: string }[] = [
    { key: "Name", label: "Zone Name" }, { key: "Profile", label: "Profile" },
    { key: "PrivateZone", label: "Type" }, { key: "RecordCount", label: "Records" },
  ];

  return (
    <div className="rounded-xl border border-slate-200 shadow-sm dark:border-[#2a2d3a] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-[#2a2d3a] dark:bg-[#161825]">
              {COLS.map((col) => (
                <th key={col.key} onClick={() => handleSort(col.key)} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-slate-600 select-none whitespace-nowrap dark:text-slate-500 dark:hover:text-slate-300">
                  <span className="inline-flex items-center gap-1">{col.label}<SortIcon col={col.key} /></span>
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 select-none whitespace-nowrap dark:text-slate-500">Comment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#2a2d3a]">
            {loading ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={5} />) : paginated.map((z) => (
              <tr key={`${z.Profile}:${z.ZoneId}`} onClick={() => onRowClick(z)} className="bg-white hover:bg-slate-50 transition-colors dark:bg-[#1c1f2e] dark:hover:bg-[#222538] cursor-pointer">
                <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-200 max-w-[280px]">
                  <div className="flex items-center min-w-0"><span className="truncate" title={z.Name}>{z.Name}</span><span className="shrink-0"><CopyButton text={z.Name} /></span></div>
                  <p className="text-slate-400 dark:text-slate-500 font-sans text-xs mt-0.5">{z.ZoneId}</p>
                </td>
                <td className="px-4 py-3 whitespace-nowrap"><ProfileBadge profile={z.Profile} color={z.ProfileColor} envTag={z.ProfileEnvTag} /></td>
                <td className="px-4 py-3 whitespace-nowrap"><ZoneTypeBadge isPrivate={z.PrivateZone} /></td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300 text-xs tabular-nums">{z.RecordCount.toLocaleString()}</td>
                <td className="px-4 py-3 text-slate-400 dark:text-slate-500 text-xs max-w-[200px] truncate">{z.Comment || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Records Table ──────────────────────────────────────────────────────────

type RecordSortKey = "RecordName" | "RecordType" | "Profile" | "TTL";

function RecordsTable({ records, loading, onClearFilters, hasActiveFilters, page, pageSize, onRowClick }: {
  records: Route53Record[]; loading: boolean; onClearFilters: () => void;
  hasActiveFilters: boolean; page: number; pageSize: PageSize; onRowClick: (r: Route53Record) => void;
}) {
  const [sortKey, setSortKey] = useState<RecordSortKey>("RecordName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const handleSort = (k: RecordSortKey) => { if (k === sortKey) setSortDir((d) => d === "asc" ? "desc" : "asc"); else { setSortKey(k); setSortDir("asc"); } };
  const sorted = [...records].sort((a, b) => {
    const av = a[sortKey] ?? ""; const bv = b[sortKey] ?? "";
    if (sortKey === "TTL") { const cmp = (Number(av) || 0) - (Number(bv) || 0); return sortDir === "asc" ? cmp : -cmp; }
    const cmp = String(av).localeCompare(String(bv)); return sortDir === "asc" ? cmp : -cmp;
  });
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);
  const SortIcon = ({ col }: { col: RecordSortKey }) => col !== sortKey ? <ChevronsUpDown size={13} className="text-slate-300 dark:text-slate-600" /> : sortDir === "asc" ? <ChevronUp size={13} className="text-blue-500" /> : <ChevronDown size={13} className="text-blue-500" />;

  if (!loading && sorted.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
      <p className="text-lg font-medium text-slate-600 dark:text-slate-300">{hasActiveFilters ? "No records match the current filters." : "No DNS records found"}</p>
      {hasActiveFilters && <button onClick={onClearFilters} className="mt-3 px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-[#2a2d3a] dark:hover:bg-[#33374a] dark:text-slate-300 transition-colors">Clear filters</button>}
    </div>
  );

  const COLS: { key: RecordSortKey; label: string }[] = [
    { key: "RecordName", label: "Name" }, { key: "RecordType", label: "Type" },
    { key: "Profile", label: "Profile" }, { key: "TTL", label: "TTL" },
  ];

  return (
    <div className="rounded-xl border border-slate-200 shadow-sm dark:border-[#2a2d3a] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-[#2a2d3a] dark:bg-[#161825]">
              {COLS.map((col) => (
                <th key={col.key} onClick={() => handleSort(col.key)} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-slate-600 select-none whitespace-nowrap dark:text-slate-500 dark:hover:text-slate-300">
                  <span className="inline-flex items-center gap-1">{col.label}<SortIcon col={col.key} /></span>
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 select-none whitespace-nowrap dark:text-slate-500">Value(s)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#2a2d3a]">
            {loading ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={5} />) : paginated.map((r, idx) => (
              <tr key={`${r.Profile}:${r.ZoneId}:${r.RecordName}:${r.RecordType}:${r.SetIdentifier}:${idx}`}
                onClick={() => onRowClick(r)} className="bg-white hover:bg-slate-50 transition-colors dark:bg-[#1c1f2e] dark:hover:bg-[#222538] cursor-pointer">
                <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-200 max-w-[240px]">
                  <div className="flex items-center min-w-0"><span className="truncate" title={r.RecordName}>{r.RecordName}</span><span className="shrink-0"><CopyButton text={r.RecordName} /></span></div>
                  {r.ZoneId && <p className="text-slate-400 dark:text-slate-500 font-sans text-xs mt-0.5">{r.ZoneId}</p>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap"><RecordTypeBadge type={r.RecordType} /></td>
                <td className="px-4 py-3 whitespace-nowrap"><ProfileBadge profile={r.Profile} color={r.ProfileColor} envTag={r.ProfileEnvTag} /></td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                  {r.AliasTarget ? <span className="italic text-slate-400">Alias</span> : r.TTL != null ? `${r.TTL}s` : "—"}
                </td>
                <td className="px-4 py-3 max-w-[280px]">
                  {r.AliasTarget ? (
                    <span className="font-mono text-xs text-slate-600 dark:text-slate-300 truncate block" title={r.AliasTarget}>{r.AliasTarget}</span>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {r.Values.slice(0, 2).map((v, i) => <span key={i} className="font-mono text-xs text-slate-600 dark:text-slate-300 truncate" title={v}>{v}</span>)}
                      {r.Values.length > 2 && <span className="text-xs text-slate-400">+{r.Values.length - 2} more</span>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Route53Dashboard ───────────────────────────────────────────────────────

type TabId = "zones" | "records";

export default function Route53Dashboard() {
  const [zones, setZones] = useState<Route53Zone[]>([]);
  const [records, setRecords] = useState<Route53Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("zones");

  // Zone filters
  const [zoneSearch, setZoneSearch] = useState("");
  const [selectedZoneProfiles, setSelectedZoneProfiles] = useState<string[]>([]);
  const [selectedZoneTypes, setSelectedZoneTypes] = useState<string[]>(["Public", "Private"]);

  // Record filters
  const [recordSearch, setRecordSearch] = useState("");
  const [selectedRecordProfiles, setSelectedRecordProfiles] = useState<string[]>([]);
  const [selectedRecordTypes, setSelectedRecordTypes] = useState<string[]>([]);

  // Pagination
  const [zonePage, setZonePage] = useState(1);
  const [zonePageSize, setZonePageSize] = useState<PageSize>(10);
  const [recordPage, setRecordPage] = useState(1);
  const [recordPageSize, setRecordPageSize] = useState<PageSize>(10);

  // Drawers
  const [selectedZone, setSelectedZone] = useState<Route53Zone | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<Route53Record | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
      try { await triggerSchedulerPoll(); await new Promise((r) => setTimeout(r, 2000)); } catch { /* best-effort */ }
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [z, r] = await Promise.all([fetchRoute53Zones(), fetchRoute53Records()]);
      setZones(z);
      setRecords(r);
      setLastUpdated(new Date());
      if (!isRefresh) {
        setSelectedZoneProfiles([...new Set(z.map((x) => x.Profile))]);
        setSelectedRecordProfiles([...new Set(r.map((x) => x.Profile))]);
        setSelectedRecordTypes([...new Set(r.map((x) => x.RecordType))]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derived
  const allZoneProfiles = [...new Set(zones.map((z) => z.Profile))].sort();
  const allRecordProfiles = [...new Set(records.map((r) => r.Profile))].sort();
  const allRecordTypes = [...new Set(records.map((r) => r.RecordType))].sort();
  const profileColorMap = Object.fromEntries([...zones, ...records].map((x) => [x.Profile, x.ProfileColor]));

  const totalZones = zones.length;
  const publicZones = zones.filter((z) => !z.PrivateZone).length;
  const privateZones = zones.filter((z) => z.PrivateZone).length;
  const totalRecords = records.length;

  // Zone filtering
  const filteredZones = zones.filter((z) => {
    const matchProfile = selectedZoneProfiles.length === 0 || selectedZoneProfiles.includes(z.Profile);
    const matchType = selectedZoneTypes.includes(z.PrivateZone ? "Private" : "Public");
    const matchSearch = !zoneSearch || z.Name.toLowerCase().includes(zoneSearch.toLowerCase()) || z.ZoneId.toLowerCase().includes(zoneSearch.toLowerCase());
    return matchProfile && matchType && matchSearch;
  });

  const hasActiveZoneFilters = zoneSearch.trim() !== "" ||
    (selectedZoneProfiles.length > 0 && selectedZoneProfiles.length < allZoneProfiles.length) ||
    selectedZoneTypes.length < 2;

  // Record filtering
  const filteredRecords = records.filter((r) => {
    const matchProfile = selectedRecordProfiles.length === 0 || selectedRecordProfiles.includes(r.Profile);
    const matchType = selectedRecordTypes.length === 0 || selectedRecordTypes.includes(r.RecordType);
    const matchSearch = !recordSearch || r.RecordName.toLowerCase().includes(recordSearch.toLowerCase()) ||
      r.Values.some((v) => v.toLowerCase().includes(recordSearch.toLowerCase()));
    return matchProfile && matchType && matchSearch;
  });

  const hasActiveRecordFilters = recordSearch.trim() !== "" ||
    (selectedRecordProfiles.length > 0 && selectedRecordProfiles.length < allRecordProfiles.length) ||
    (selectedRecordTypes.length > 0 && selectedRecordTypes.length < allRecordTypes.length);

  const clearZoneFilters = () => {
    setZoneSearch(""); setSelectedZoneProfiles([...new Set(zones.map((z) => z.Profile))]); setSelectedZoneTypes(["Public", "Private"]); setZonePage(1);
  };
  const clearRecordFilters = () => {
    setRecordSearch(""); setSelectedRecordProfiles([...new Set(records.map((r) => r.Profile))]); setSelectedRecordTypes([...new Set(records.map((r) => r.RecordType))]); setRecordPage(1);
  };

  return (
    <div className="p-6 overflow-auto bg-slate-100 dark:bg-[#0f1117] min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Route 53</h2>
          {lastUpdated && (
            <p className="text-xs text-slate-400 mt-0.5">Synced {lastUpdated.toLocaleTimeString()}</p>
          )}
        </div>
        <button onClick={() => load(true)} disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-300 dark:hover:bg-white/5">
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Polling AWS…" : "Refresh"}
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Hosted Zones" value={loading ? 0 : totalZones} total={totalZones} color="blue" icon={<Globe size={20} />} />
        <StatCard label="Public Zones" value={loading ? 0 : publicZones} total={totalZones} color="green" icon={<Unlock size={20} />} />
        <StatCard label="Private Zones" value={loading ? 0 : privateZones} total={totalZones} color="purple" icon={<Lock size={20} />} />
        <StatCard label="DNS Records" value={loading ? 0 : totalRecords} total={totalRecords} color="red" icon={<List size={20} />} />
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-slate-200 dark:border-[#2a2d3a]">
        {([["zones", "Hosted Zones"], ["records", "DNS Records"]] as [TabId, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === id ? "border-blue-500 text-slate-900 dark:text-white" : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Zones tab */}
      {activeTab === "zones" && (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
              <input type="text" placeholder="Search zones…" value={zoneSearch} onChange={(e) => { setZoneSearch(e.target.value); setZonePage(1); }}
                className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-400 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-200 dark:placeholder-slate-500" />
            </div>
            <DropdownChip label="Profile" allItems={allZoneProfiles} selectedItems={selectedZoneProfiles}
              onChange={(v) => { setSelectedZoneProfiles(v); setZonePage(1); }}
              renderItem={(name) => <span className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 truncate"><span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: profileColorMap[name] ?? "#6366f1" }} />{name}</span>} />
            <DropdownChip label="Type" allItems={["Public", "Private"]} selectedItems={selectedZoneTypes}
              onChange={(v) => { setSelectedZoneTypes(v); setZonePage(1); }} />
            {hasActiveZoneFilters && (
              <button type="button" onClick={clearZoneFilters} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
                <X size={12} />Clear filters
              </button>
            )}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
                {filteredZones.length} of {totalZones} zone{totalZones !== 1 ? "s" : ""}
              </span>
              {totalZones > 0 && (
                <Pagination total={filteredZones.length} page={zonePage} pageSize={zonePageSize}
                  onPageChange={setZonePage} onPageSizeChange={(s) => { setZonePageSize(s); setZonePage(1); }} />
              )}
            </div>
          </div>
          <ZonesTable zones={filteredZones} loading={loading} onClearFilters={clearZoneFilters}
            hasActiveFilters={hasActiveZoneFilters} page={zonePage} pageSize={zonePageSize} onRowClick={setSelectedZone} />
        </>
      )}

      {/* Records tab */}
      {activeTab === "records" && (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
              <input type="text" placeholder="Search records or values…" value={recordSearch} onChange={(e) => { setRecordSearch(e.target.value); setRecordPage(1); }}
                className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-400 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-200 dark:placeholder-slate-500" />
            </div>
            <DropdownChip label="Profile" allItems={allRecordProfiles} selectedItems={selectedRecordProfiles}
              onChange={(v) => { setSelectedRecordProfiles(v); setRecordPage(1); }}
              renderItem={(name) => <span className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 truncate"><span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: profileColorMap[name] ?? "#6366f1" }} />{name}</span>} />
            <DropdownChip label="Type" allItems={allRecordTypes} selectedItems={selectedRecordTypes}
              onChange={(v) => { setSelectedRecordTypes(v); setRecordPage(1); }}
              renderItem={(t) => <span className="flex items-center gap-2"><RecordTypeBadge type={t} /></span>} />
            {hasActiveRecordFilters && (
              <button type="button" onClick={clearRecordFilters} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
                <X size={12} />Clear filters
              </button>
            )}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
                {filteredRecords.length} of {totalRecords} record{totalRecords !== 1 ? "s" : ""}
              </span>
              {totalRecords > 0 && (
                <Pagination total={filteredRecords.length} page={recordPage} pageSize={recordPageSize}
                  onPageChange={setRecordPage} onPageSizeChange={(s) => { setRecordPageSize(s); setRecordPage(1); }} />
              )}
            </div>
          </div>
          <RecordsTable records={filteredRecords} loading={loading} onClearFilters={clearRecordFilters}
            hasActiveFilters={hasActiveRecordFilters} page={recordPage} pageSize={recordPageSize} onRowClick={setSelectedRecord} />
        </>
      )}

      {/* Drawers */}
      <ZoneDrawer zone={selectedZone} records={records} onClose={() => setSelectedZone(null)} />
      <RecordDrawer record={selectedRecord} onClose={() => setSelectedRecord(null)} />
    </div>
  );
}
