"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  RefreshCw, Globe, Search, ChevronDown, ChevronUp, ChevronsUpDown,
  Copy, Check, X, Lock, Unlock, List,
} from "lucide-react";
import { fetchRoute53Zones, fetchRoute53Records, triggerSchedulerPoll } from "@/lib/api";
import { useResourceLoad } from "@/lib/useInitialFetch";
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
    <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="ml-1.5 p-0.5 rounded opacity-0 group-hover/row:opacity-100 transition-opacity duration-150" style={{ color: "var(--text-tertiary)" }}>
      {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
    </button>
  );
}

const RECORD_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  A:     { bg: "rgba(37,99,235,0.1)",   text: "#3b82f6" },
  AAAA:  { bg: "rgba(99,102,241,0.1)",  text: "#6366f1" },
  CNAME: { bg: "rgba(139,92,246,0.1)",  text: "#8b5cf6" },
  MX:    { bg: "rgba(245,158,11,0.1)",  text: "#f59e0b" },
  TXT:   { bg: "rgba(16,185,129,0.1)",  text: "#10b981" },
  NS:    { bg: "var(--bg-subtle)",       text: "var(--text-secondary)" },
  SOA:   { bg: "var(--bg-subtle)",       text: "var(--text-tertiary)" },
  SRV:   { bg: "rgba(236,72,153,0.1)",  text: "#ec4899" },
  CAA:   { bg: "rgba(249,115,22,0.1)",  text: "#f97316" },
  PTR:   { bg: "rgba(20,184,166,0.1)",  text: "#14b8a6" },
};

function RecordTypeBadge({ type }: { type: string }) {
  const c = RECORD_TYPE_COLORS[type] ?? { bg: "var(--bg-subtle)", text: "var(--text-secondary)" };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold font-mono" style={{ background: c.bg, color: c.text }}>
      {type}
    </span>
  );
}

function ZoneTypeBadge({ isPrivate }: { isPrivate: boolean }) {
  return isPrivate ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>
      <Lock size={9} />Private
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>
      <Unlock size={9} />Public
    </span>
  );
}

// ── Local DropdownChip (same as IAM) ───────────────────────────────────────

function DropdownChip({ label, allItems, selectedItems, onChange, renderItem }: {
  label: string; allItems: string[]; selectedItems: string[];
  onChange: (items: string[]) => void; renderItem?: (item: string) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const allSel = selectedItems.length === 0 || selectedItems.length === allItems.length;
  const active = selectedItems.length > 0 && selectedItems.length < allItems.length ? selectedItems.length : null;
  const toggle = (item: string) => onChange(selectedItems.includes(item) ? selectedItems.filter((x) => x !== item) : [...selectedItems, item]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150"
        style={{ background: active !== null ? "rgba(37,99,235,0.08)" : "var(--bg-card)", border: `1px solid ${active !== null ? "rgba(59,130,246,0.45)" : "var(--border)"}`, color: active !== null ? "var(--brand)" : "var(--text-secondary)" }}>
        {label}
        {active !== null && <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold text-white bg-blue-600">{active}</span>}
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 min-w-[180px] rounded-xl overflow-hidden"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", boxShadow: "0 8px 32px rgba(0,0,0,0.14)" }}>
          <div className="flex items-center gap-3 px-3 pt-2.5 pb-2" style={{ borderBottom: "1px solid var(--border)" }}>
            <button type="button" onClick={() => onChange([])} className="text-[11px] font-medium text-blue-500">Select all</button>
            <button type="button" onClick={() => onChange([])} className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>Clear</button>
          </div>
          <ul className="py-1 max-h-56 overflow-y-auto">
            {allItems.map((item) => (
              <li key={item}>
                <label className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer select-none"
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}>
                  <input type="checkbox" checked={allSel ? true : selectedItems.includes(item)} onChange={() => toggle(item)} className="accent-blue-500 w-3.5 h-3.5 shrink-0" />
                  {renderItem ? renderItem(item) : <span className="text-[13px]" style={{ color: "var(--text-primary)" }}>{item}</span>}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Drawers ────────────────────────────────────────────────────────────────

function DrawerRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <dt className="text-[13px] shrink-0" style={{ color: "var(--text-tertiary)" }}>{label}</dt>
      <dd className="text-[13px] text-right break-all" style={{ color: "var(--text-primary)" }}>{value ?? "—"}</dd>
    </div>
  );
}

function ZoneDrawer({ zone, records, onClose }: { zone: Route53Zone | null; records: Route53Record[]; onClose: () => void }) {
  const zoneRecords = zone ? records.filter((r) => r.ZoneId === zone.ZoneId) : [];
  const recordTypes = [...new Set(zoneRecords.map((r) => r.RecordType))].sort();
  return (
    <SlideOverDrawer isOpen={!!zone} onClose={onClose} title={zone ? zone.Name : ""}>
      {zone && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>Hosted Zone</p>
          <DrawerRow label="Name" value={<span className="font-mono text-[12px] flex items-center gap-1">{zone.Name}<button onClick={() => navigator.clipboard.writeText(zone.Name)} style={{ color: "var(--text-tertiary)" }}><Copy size={10} /></button></span>} />
          <DrawerRow label="Zone ID" value={<span className="font-mono text-[12px] flex items-center gap-1">{zone.ZoneId}<button onClick={() => navigator.clipboard.writeText(zone.ZoneId)} style={{ color: "var(--text-tertiary)" }}><Copy size={10} /></button></span>} />
          <DrawerRow label="Type" value={<ZoneTypeBadge isPrivate={zone.PrivateZone} />} />
          <DrawerRow label="Records" value={zone.RecordCount.toLocaleString()} />
          {zone.Comment && <DrawerRow label="Comment" value={zone.Comment} />}

          <p className="text-[11px] font-semibold uppercase tracking-wider mb-3 mt-5" style={{ color: "var(--text-tertiary)" }}>Profile</p>
          <DrawerRow label="Account" value={<ProfileBadge profile={zone.Profile} color={zone.ProfileColor} envTag={zone.ProfileEnvTag} />} />

          {Object.keys(zone.Tags).length > 0 && (
            <div className="mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(zone.Tags).map(([k, v]) => (
                  <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px]" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                    <span className="font-medium">{k}:</span>{v}
                  </span>
                ))}
              </div>
            </div>
          )}

          {recordTypes.length > 0 && (
            <div className="mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>Record Types</p>
              <div className="flex flex-wrap gap-1.5">{recordTypes.map((t) => <RecordTypeBadge key={t} type={t} />)}</div>
            </div>
          )}
        </div>
      )}
    </SlideOverDrawer>
  );
}

function RecordDrawer({ record, onClose }: { record: Route53Record | null; onClose: () => void }) {
  return (
    <SlideOverDrawer isOpen={!!record} onClose={onClose} title={record ? `${record.RecordName} — ${record.RecordType}` : ""}>
      {record && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>Record</p>
          <DrawerRow label="Name" value={<span className="font-mono text-[12px]">{record.RecordName}</span>} />
          <DrawerRow label="Type" value={<RecordTypeBadge type={record.RecordType} />} />
          <DrawerRow label="TTL" value={record.AliasTarget ? "Alias (no TTL)" : record.TTL != null ? `${record.TTL}s` : "—"} />

          <p className="text-[11px] font-semibold uppercase tracking-wider mb-3 mt-5" style={{ color: "var(--text-tertiary)" }}>Values</p>
          {record.AliasTarget ? (
            <div className="rounded-xl px-3 py-2.5" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
              <p className="text-[11px] mb-1" style={{ color: "var(--text-tertiary)" }}>Alias target</p>
              <p className="font-mono text-[12px] break-all" style={{ color: "var(--text-primary)" }}>{record.AliasTarget}</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {record.Values.map((v, i) => (
                <li key={i} className="flex items-start justify-between gap-2 rounded-xl px-3 py-2" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
                  <span className="font-mono text-[12px] break-all" style={{ color: "var(--text-primary)" }}>{v}</span>
                  <button onClick={() => navigator.clipboard.writeText(v)} className="shrink-0 p-0.5 rounded" style={{ color: "var(--text-tertiary)" }}><Copy size={10} /></button>
                </li>
              ))}
            </ul>
          )}

          {(record.SetIdentifier || record.Weight != null || record.Region || record.Failover) && (
            <div className="mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>Routing Policy</p>
              {record.SetIdentifier && <DrawerRow label="Identifier" value={record.SetIdentifier} />}
              {record.Weight != null && <DrawerRow label="Weight" value={record.Weight} />}
              {record.Region && <DrawerRow label="Region" value={<span className="font-mono text-[12px]">{record.Region}</span>} />}
              {record.Failover && <DrawerRow label="Failover" value={record.Failover} />}
            </div>
          )}

          <p className="text-[11px] font-semibold uppercase tracking-wider mb-3 mt-5" style={{ color: "var(--text-tertiary)" }}>Deployment</p>
          <DrawerRow label="Profile" value={<ProfileBadge profile={record.Profile} color={record.ProfileColor} envTag={record.ProfileEnvTag} />} />
          <DrawerRow label="Zone ID" value={<span className="font-mono text-[12px]">{record.ZoneId}</span>} />
        </div>
      )}
    </SlideOverDrawer>
  );
}

// ── Tables ─────────────────────────────────────────────────────────────────

type SortDir = "asc" | "desc";
type ZoneSortKey = "Name" | "Profile" | "RecordCount" | "PrivateZone";
type RecordSortKey = "RecordName" | "RecordType" | "Profile" | "TTL";

function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden border" style={{ background: "var(--bg-card)", borderColor: "var(--border)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <div className="overflow-x-auto"><table className="w-full">{children}</table></div>
    </div>
  );
}

function ZonesTable({ zones, loading, onClearFilters, hasActiveFilters, page, pageSize, onRowClick }: {
  zones: Route53Zone[]; loading: boolean; onClearFilters: () => void;
  hasActiveFilters: boolean; page: number; pageSize: PageSize; onRowClick: (z: Route53Zone) => void;
}) {
  const [sortKey, setSortKey] = useState<ZoneSortKey>("Name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const hs = (k: ZoneSortKey) => { if (k === sortKey) setSortDir((d) => d === "asc" ? "desc" : "asc"); else { setSortKey(k); setSortDir("asc"); } };
  const sorted = [...zones].sort((a, b) => {
    const av = a[sortKey] ?? ""; const bv = b[sortKey] ?? "";
    if (typeof av === "number") { return sortDir === "asc" ? (av - (bv as number)) : ((bv as number) - av); }
    if (typeof av === "boolean") { return sortDir === "asc" ? Number(av) - Number(bv as boolean) : Number(bv as boolean) - Number(av); }
    return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);
  const SI = ({ col }: { col: ZoneSortKey }) => col !== sortKey ? <ChevronsUpDown size={12} style={{ color: "var(--text-tertiary)" }} /> : sortDir === "asc" ? <ChevronUp size={12} style={{ color: "var(--brand)" }} /> : <ChevronDown size={12} style={{ color: "var(--brand)" }} />;

  if (!loading && sorted.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 rounded-xl border gap-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <p className="text-[14px] font-medium" style={{ color: "var(--text-secondary)" }}>{hasActiveFilters ? "No zones match." : "No hosted zones found"}</p>
      {hasActiveFilters && <button onClick={onClearFilters} className="px-4 py-1.5 rounded-lg text-[13px]" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>Clear filters</button>}
    </div>
  );

  const COLS: { key: ZoneSortKey; label: string }[] = [
    { key: "Name", label: "Zone Name" }, { key: "Profile", label: "Profile" },
    { key: "PrivateZone", label: "Type" }, { key: "RecordCount", label: "Records" },
  ];

  return (
    <TableWrap>
      <thead>
        <tr className="border-b" style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}>
          {COLS.map((col) => (
            <th key={col.key} onClick={() => hs(col.key)} className="px-4 py-3 text-left select-none cursor-pointer whitespace-nowrap">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: sortKey === col.key ? "var(--brand)" : "var(--text-tertiary)" }}>
                {col.label}<SI col={col.key} />
              </span>
            </th>
          ))}
          <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Comment</th>
        </tr>
      </thead>
      <tbody>
        {loading ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={5} />) : paginated.map((z) => (
          <tr key={`${z.Profile}:${z.ZoneId}`} onClick={() => onRowClick(z)}
            className="group/row border-b table-row-hover cursor-pointer"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-card)")}>
            <td className="px-4 py-3 max-w-[280px]">
              <div className="flex items-center min-w-0">
                <span className="truncate font-mono text-[13px] font-medium" title={z.Name} style={{ color: "var(--text-primary)" }}>{z.Name}</span>
                <CopyButton text={z.Name} />
              </div>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{z.ZoneId}</p>
            </td>
            <td className="px-4 py-3 whitespace-nowrap"><ProfileBadge profile={z.Profile} color={z.ProfileColor} envTag={z.ProfileEnvTag} /></td>
            <td className="px-4 py-3 whitespace-nowrap"><ZoneTypeBadge isPrivate={z.PrivateZone} /></td>
            <td className="px-4 py-3 whitespace-nowrap text-[13px] tabular-nums" style={{ color: "var(--text-secondary)" }}>{z.RecordCount.toLocaleString()}</td>
            <td className="px-4 py-3 max-w-[200px] truncate text-[13px]" style={{ color: "var(--text-tertiary)" }}>{z.Comment || "—"}</td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

function RecordsTable({ records, loading, onClearFilters, hasActiveFilters, page, pageSize, onRowClick }: {
  records: Route53Record[]; loading: boolean; onClearFilters: () => void;
  hasActiveFilters: boolean; page: number; pageSize: PageSize; onRowClick: (r: Route53Record) => void;
}) {
  const [sortKey, setSortKey] = useState<RecordSortKey>("RecordName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const hs = (k: RecordSortKey) => { if (k === sortKey) setSortDir((d) => d === "asc" ? "desc" : "asc"); else { setSortKey(k); setSortDir("asc"); } };
  const sorted = [...records].sort((a, b) => {
    const av = a[sortKey] ?? ""; const bv = b[sortKey] ?? "";
    if (sortKey === "TTL") { return sortDir === "asc" ? (Number(av) || 0) - (Number(bv) || 0) : (Number(bv) || 0) - (Number(av) || 0); }
    return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);
  const SI = ({ col }: { col: RecordSortKey }) => col !== sortKey ? <ChevronsUpDown size={12} style={{ color: "var(--text-tertiary)" }} /> : sortDir === "asc" ? <ChevronUp size={12} style={{ color: "var(--brand)" }} /> : <ChevronDown size={12} style={{ color: "var(--brand)" }} />;

  if (!loading && sorted.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 rounded-xl border gap-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <p className="text-[14px] font-medium" style={{ color: "var(--text-secondary)" }}>{hasActiveFilters ? "No records match." : "No DNS records found"}</p>
      {hasActiveFilters && <button onClick={onClearFilters} className="px-4 py-1.5 rounded-lg text-[13px]" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>Clear filters</button>}
    </div>
  );

  const COLS: { key: RecordSortKey; label: string }[] = [
    { key: "RecordName", label: "Name" }, { key: "RecordType", label: "Type" },
    { key: "Profile", label: "Profile" }, { key: "TTL", label: "TTL" },
  ];

  return (
    <TableWrap>
      <thead>
        <tr className="border-b" style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}>
          {COLS.map((col) => (
            <th key={col.key} onClick={() => hs(col.key)} className="px-4 py-3 text-left select-none cursor-pointer whitespace-nowrap">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: sortKey === col.key ? "var(--brand)" : "var(--text-tertiary)" }}>
                {col.label}<SI col={col.key} />
              </span>
            </th>
          ))}
          <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Value(s)</th>
        </tr>
      </thead>
      <tbody>
        {loading ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={5} />) : paginated.map((r, idx) => (
          <tr key={`${r.Profile}:${r.ZoneId}:${r.RecordName}:${r.RecordType}:${idx}`} onClick={() => onRowClick(r)}
            className="group/row border-b table-row-hover cursor-pointer"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-card)")}>
            <td className="px-4 py-3 max-w-[240px]">
              <div className="flex items-center min-w-0">
                <span className="truncate font-mono text-[13px] font-medium" title={r.RecordName} style={{ color: "var(--text-primary)" }}>{r.RecordName}</span>
                <CopyButton text={r.RecordName} />
              </div>
              {r.ZoneId && <p className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{r.ZoneId}</p>}
            </td>
            <td className="px-4 py-3 whitespace-nowrap"><RecordTypeBadge type={r.RecordType} /></td>
            <td className="px-4 py-3 whitespace-nowrap"><ProfileBadge profile={r.Profile} color={r.ProfileColor} envTag={r.ProfileEnvTag} /></td>
            <td className="px-4 py-3 whitespace-nowrap text-[13px]" style={{ color: "var(--text-secondary)" }}>
              {r.AliasTarget ? <span className="italic text-[12px]" style={{ color: "var(--text-tertiary)" }}>Alias</span> : r.TTL != null ? `${r.TTL}s` : "—"}
            </td>
            <td className="px-4 py-3 max-w-[280px]">
              {r.AliasTarget ? (
                <span className="font-mono text-[12px] truncate block" title={r.AliasTarget} style={{ color: "var(--text-secondary)" }}>{r.AliasTarget}</span>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {r.Values.slice(0, 2).map((v, i) => <span key={i} className="font-mono text-[12px] truncate" title={v} style={{ color: "var(--text-secondary)" }}>{v}</span>)}
                  {r.Values.length > 2 && <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>+{r.Values.length - 2} more</span>}
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

type TabId = "zones" | "records";

export default function Route53Dashboard() {
  const [zones, setZones] = useState<Route53Zone[]>([]);
  const [records, setRecords] = useState<Route53Record[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>("zones");

  const beforeRefresh = useCallback(async () => { await triggerSchedulerPoll(); await new Promise((r) => setTimeout(r, 2000)); }, []);
  const fetchAll = useCallback(() => Promise.all([fetchRoute53Zones(), fetchRoute53Records()]), []);
  const onData = useCallback(([z, r]: [Route53Zone[], Route53Record[]]) => { setZones(z); setRecords(r); }, []);
  const { loading, error, lastUpdated, refreshing, load } = useResourceLoad({ fetcher: fetchAll, onData, beforeRefresh });

  const [zoneSearch, setZoneSearch] = useState(""); const [selZoneProfiles, setSelZoneProfiles] = useState<string[]>([]); const [selZoneTypes, setSelZoneTypes] = useState<string[]>(["Public", "Private"]);
  const [recordSearch, setRecordSearch] = useState(""); const [selRecordProfiles, setSelRecordProfiles] = useState<string[]>([]); const [selRecordTypes, setSelRecordTypes] = useState<string[]>([]);
  const [zonePage, setZonePage] = useState(1); const [zonePageSize, setZonePageSize] = useState<PageSize>(10);
  const [recordPage, setRecordPage] = useState(1); const [recordPageSize, setRecordPageSize] = useState<PageSize>(10);
  const [selZone, setSelZone] = useState<Route53Zone | null>(null);
  const [selRecord, setSelRecord] = useState<Route53Record | null>(null);

  const allZoneProfiles   = [...new Set(zones.map((z) => z.Profile))].sort();
  const allRecordProfiles = [...new Set(records.map((r) => r.Profile))].sort();
  const allRecordTypes    = [...new Set(records.map((r) => r.RecordType))].sort();
  const profileColorMap   = Object.fromEntries([...zones, ...records].map((x) => [x.Profile, x.ProfileColor]));

  const filteredZones = zones.filter((z) => {
    const mp = selZoneProfiles.length === 0 || selZoneProfiles.includes(z.Profile);
    const mt = selZoneTypes.includes(z.PrivateZone ? "Private" : "Public");
    const ms = !zoneSearch || z.Name.toLowerCase().includes(zoneSearch.toLowerCase()) || z.ZoneId.toLowerCase().includes(zoneSearch.toLowerCase());
    return mp && mt && ms;
  });
  const filteredRecords = records.filter((r) => {
    const mp = selRecordProfiles.length === 0 || selRecordProfiles.includes(r.Profile);
    const mt = selRecordTypes.length === 0 || selRecordTypes.includes(r.RecordType);
    const ms = !recordSearch || r.RecordName.toLowerCase().includes(recordSearch.toLowerCase()) || r.Values.some((v) => v.toLowerCase().includes(recordSearch.toLowerCase()));
    return mp && mt && ms;
  });

  const hasActiveZoneFilters   = zoneSearch.trim() !== "" || (selZoneProfiles.length > 0 && selZoneProfiles.length < allZoneProfiles.length) || selZoneTypes.length < 2;
  const hasActiveRecordFilters = recordSearch.trim() !== "" || (selRecordProfiles.length > 0 && selRecordProfiles.length < allRecordProfiles.length) || (selRecordTypes.length > 0 && selRecordTypes.length < allRecordTypes.length);

  const clearZoneFilters   = () => { setZoneSearch(""); setSelZoneProfiles([]); setSelZoneTypes(["Public", "Private"]); setZonePage(1); };
  const clearRecordFilters = () => { setRecordSearch(""); setSelRecordProfiles([]); setSelRecordTypes([]); setRecordPage(1); };

  const ProfileChip = ({ allP, selP, onChange }: { allP: string[]; selP: string[]; onChange: (v: string[]) => void }) => (
    <DropdownChip label="Profile" allItems={allP} selectedItems={selP} onChange={onChange}
      renderItem={(name) => (
        <span className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--text-primary)" }}>
          <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: profileColorMap[name] ?? "#6366f1" }} />{name}
        </span>
      )} />
  );

  return (
    <div className="p-6 min-h-full" style={{ background: "var(--bg-page)" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Route 53</h1>
          {lastUpdated && <p className="text-[13px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>Synced {lastUpdated.toLocaleTimeString()}</p>}
        </div>
        <button onClick={() => load(true)} disabled={refreshing} className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors duration-150 disabled:opacity-50" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />{refreshing ? "Polling AWS…" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Hosted Zones"  value={loading ? 0 : zones.length}                         color="blue"   icon={<Globe size={18} />} />
        <StatCard label="Public Zones"  value={loading ? 0 : zones.filter((z) => !z.PrivateZone).length} color="green" icon={<Unlock size={18} />} />
        <StatCard label="Private Zones" value={loading ? 0 : zones.filter((z) => z.PrivateZone).length}  color="purple" icon={<Lock size={18} />} />
        <StatCard label="DNS Records"   value={loading ? 0 : records.length}                        color="amber"  icon={<List size={18} />} />
      </div>

      {error && (
        <div className="rounded-xl border p-4 mb-4" style={{ background: "rgba(239,68,68,0.05)", borderColor: "rgba(239,68,68,0.2)" }}>
          <p className="text-[13px]" style={{ color: "#ef4444" }}>{error}</p>
        </div>
      )}

      <div className="mb-4 border-b" style={{ borderColor: "var(--border)" }}>
        <nav className="flex items-center -mb-px">
          {(["zones", "records"] as TabId[]).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-[13px] font-medium transition-colors duration-150 border-b-2 ${activeTab === tab ? "border-blue-500" : "border-transparent"}`}
              style={{ color: activeTab === tab ? "var(--brand)" : "var(--text-secondary)" }}>
              {tab === "zones" ? "Hosted Zones" : "DNS Records"}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "zones" && (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-tertiary)" }} />
              <input type="text" placeholder="Search zones…" value={zoneSearch} onChange={(e) => { setZoneSearch(e.target.value); setZonePage(1); }}
                className="pl-8 pr-3 py-1.5 rounded-lg text-[13px] focus:outline-none" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", width: 200 }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")} />
            </div>
            <ProfileChip allP={allZoneProfiles} selP={selZoneProfiles} onChange={(v) => { setSelZoneProfiles(v); setZonePage(1); }} />
            <DropdownChip label="Type" allItems={["Public", "Private"]} selectedItems={selZoneTypes} onChange={(v) => { setSelZoneTypes(v); setZonePage(1); }} />
            {hasActiveZoneFilters && <button onClick={clearZoneFilters} className="flex items-center gap-1 text-[12px]" style={{ color: "var(--text-tertiary)" }}><X size={12} />Clear</button>}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>{filteredZones.length} of {zones.length} zones</span>
              {zones.length > 0 && <Pagination total={filteredZones.length} page={zonePage} pageSize={zonePageSize} onPageChange={setZonePage} onPageSizeChange={(s) => { setZonePageSize(s); setZonePage(1); }} />}
            </div>
          </div>
          <ZonesTable zones={filteredZones} loading={loading} onClearFilters={clearZoneFilters} hasActiveFilters={hasActiveZoneFilters} page={zonePage} pageSize={zonePageSize} onRowClick={setSelZone} />
        </>
      )}

      {activeTab === "records" && (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-tertiary)" }} />
              <input type="text" placeholder="Search records or values…" value={recordSearch} onChange={(e) => { setRecordSearch(e.target.value); setRecordPage(1); }}
                className="pl-8 pr-3 py-1.5 rounded-lg text-[13px] focus:outline-none" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", width: 220 }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")} />
            </div>
            <ProfileChip allP={allRecordProfiles} selP={selRecordProfiles} onChange={(v) => { setSelRecordProfiles(v); setRecordPage(1); }} />
            <DropdownChip label="Type" allItems={allRecordTypes} selectedItems={selRecordTypes} onChange={(v) => { setSelRecordTypes(v); setRecordPage(1); }}
              renderItem={(t) => <span className="flex items-center gap-2"><RecordTypeBadge type={t} /></span>} />
            {hasActiveRecordFilters && <button onClick={clearRecordFilters} className="flex items-center gap-1 text-[12px]" style={{ color: "var(--text-tertiary)" }}><X size={12} />Clear</button>}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>{filteredRecords.length} of {records.length} records</span>
              {records.length > 0 && <Pagination total={filteredRecords.length} page={recordPage} pageSize={recordPageSize} onPageChange={setRecordPage} onPageSizeChange={(s) => { setRecordPageSize(s); setRecordPage(1); }} />}
            </div>
          </div>
          <RecordsTable records={filteredRecords} loading={loading} onClearFilters={clearRecordFilters} hasActiveFilters={hasActiveRecordFilters} page={recordPage} pageSize={recordPageSize} onRowClick={setSelRecord} />
        </>
      )}

      <ZoneDrawer zone={selZone} records={records} onClose={() => setSelZone(null)} />
      <RecordDrawer record={selRecord} onClose={() => setSelRecord(null)} />
    </div>
  );
}
