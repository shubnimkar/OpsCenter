"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw, Mail, Globe, Search, ChevronDown, ChevronUp, ChevronsUpDown,
  Copy, Check, X, Clock, AlertTriangle, ShieldCheck, ShieldOff, Gauge,
} from "lucide-react";
import {
  fetchSESIdentities, fetchSESSendingQuotas, fetchSESAccountStats,
  fetchSchedulerStatus, triggerSchedulerPoll, updateSchedulerInterval,
  SchedulerStatus,
} from "@/lib/api";
import { SESIdentity, SESSendingQuota, SESAccountStats } from "@/lib/types";
import StatCard from "./StatCard";
import SkeletonRow from "./SkeletonRow";
import ProfileBadge from "./ProfileBadge";
import Pagination, { PageSize } from "./Pagination";
import SlideOverDrawer from "./SlideOverDrawer";

// ── Helpers ────────────────────────────────────────────────────────────────

const VERIFICATION_COLORS: Record<string, string> = {
  Success:          "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  Pending:          "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  Failed:           "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400",
  TemporaryFailure: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  NotStarted:       "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

function VerificationBadge({ status }: { status: string }) {
  const cls = VERIFICATION_COLORS[status] ?? VERIFICATION_COLORS.NotStarted;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status || "—"}
    </span>
  );
}

function UsageBar({ sent, max }: { sent: number; max: number }) {
  if (max <= 0) return <span className="text-xs text-slate-400">—</span>;
  const pct = Math.min(100, (sent / max) * 100);
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

// ── CopyButton ─────────────────────────────────────────────────────────────

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

// ── SchedulerBadge ─────────────────────────────────────────────────────────

const INTERVAL_PRESETS = [
  { label: "1 min", seconds: 60 }, { label: "2 min", seconds: 120 },
  { label: "5 min", seconds: 300 }, { label: "15 min", seconds: 900 },
  { label: "30 min", seconds: 1800 },
];

function SchedulerBadge({ status, onIntervalChange }: { status: SchedulerStatus | null; onIntervalChange: (s: number) => Promise<void> }) {
  const [updating, setUpdating] = useState(false);
  if (!status) return null;
  const nextRun = status.next_run_at ? new Date(status.next_run_at) : null;
  const secondsUntil = nextRun ? Math.max(0, Math.round((nextRun.getTime() - Date.now()) / 1000)) : null;
  const statusColor = status.last_status === "partial" ? "text-amber-600 dark:text-amber-400"
    : status.last_status === "error" ? "text-red-500 dark:text-red-400" : "";
  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = parseInt(e.target.value, 10); if (!val) return;
    setUpdating(true); try { await onIntervalChange(val); } finally { setUpdating(false); }
  };
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
      <Clock size={12} /><span>Auto-refresh every</span>
      <select value={status.poll_interval_seconds} onChange={handleChange} disabled={updating}
        className="text-xs rounded-md border border-slate-200 bg-white text-slate-600 px-1.5 py-0.5 disabled:opacity-50 dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-300 cursor-pointer hover:border-indigo-400 transition-colors" aria-label="Poll interval">
        {!INTERVAL_PRESETS.some((p) => p.seconds === status.poll_interval_seconds) && <option value={status.poll_interval_seconds}>{status.poll_interval_seconds}s</option>}
        {INTERVAL_PRESETS.map((p) => <option key={p.seconds} value={p.seconds}>{p.label}</option>)}
      </select>
      {secondsUntil !== null && <><span className="text-slate-300 dark:text-slate-600">·</span><span>next in {secondsUntil}s</span></>}
      {(status.last_status === "partial" || status.last_status === "error") && (
        <span title={status.last_error ?? undefined} className={`flex items-center gap-0.5 ${statusColor}`}>
          <AlertTriangle size={12} />
          {status.last_status === "partial" ? "some profiles failed" : "poll error"}
        </span>
      )}
    </div>
  );
}

// ── SES Identity Drawer ────────────────────────────────────────────────────

function SESDrawer({ identity, onClose }: { identity: SESIdentity | null; onClose: () => void }) {
  return (
    <SlideOverDrawer isOpen={!!identity} onClose={onClose} title={identity ? identity.Identity : ""}>
      {identity && (
        <div className="space-y-6 text-sm">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Identity</p>
            <dl className="space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Identity</dt>
                <dd className="font-mono text-xs text-slate-700 dark:text-slate-200 text-right break-all flex items-center gap-1">{identity.Identity}<CopyButton text={identity.Identity} /></dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Type</dt>
                <dd><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${identity.IdentityType === "Domain" ? "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" : "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"}`}>{identity.IdentityType}</span></dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Verification</dt>
                <dd><VerificationBadge status={identity.VerificationStatus} /></dd>
              </div>
            </dl>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Deployment</p>
            <dl className="space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Profile</dt>
                <dd><ProfileBadge profile={identity.Profile} color={identity.ProfileColor} envTag={identity.ProfileEnvTag} /></dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Region</dt>
                <dd className="text-slate-600 dark:text-slate-300 text-xs font-mono">{identity.Region}</dd>
              </div>
            </dl>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">DKIM</p>
            <dl className="space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">DKIM Signing</dt>
                <dd>{identity.DkimEnabled ? <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Enabled</span> : <span className="text-xs font-medium text-slate-400">Disabled</span>}</dd>
              </div>
              {identity.DkimEnabled && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400 shrink-0">DKIM Status</dt>
                  <dd><VerificationBadge status={identity.DkimVerificationStatus} /></dd>
                </div>
              )}
            </dl>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Notifications</p>
            <dl className="space-y-2">
              <div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400 shrink-0">Bounce SNS Topic</dt><dd className="font-mono text-xs text-slate-600 dark:text-slate-300 text-right break-all">{identity.BounceTopicArn ?? "—"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400 shrink-0">Complaint SNS Topic</dt><dd className="font-mono text-xs text-slate-600 dark:text-slate-300 text-right break-all">{identity.ComplaintTopicArn ?? "—"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400 shrink-0">Delivery SNS Topic</dt><dd className="font-mono text-xs text-slate-600 dark:text-slate-300 text-right break-all">{identity.DeliveryTopicArn ?? "—"}</dd></div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Email Forwarding</dt>
                <dd>{identity.ForwardingEnabled ? <span className="text-xs text-emerald-600 dark:text-emerald-400">Enabled</span> : <span className="text-xs text-slate-400">Disabled</span>}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </SlideOverDrawer>
  );
}

// ── Identities Table ───────────────────────────────────────────────────────

type IdSortKey = "Identity" | "IdentityType" | "Profile" | "Region" | "VerificationStatus" | "DkimVerificationStatus";
type SortDir = "asc" | "desc";

const ID_COLUMNS: { key: IdSortKey; label: string }[] = [
  { key: "Identity",               label: "Identity" },
  { key: "IdentityType",           label: "Type" },
  { key: "Profile",                label: "Profile" },
  { key: "Region",                 label: "Region" },
  { key: "VerificationStatus",     label: "Verification" },
  { key: "DkimVerificationStatus", label: "DKIM Status" },
];

function IdentitiesTable({ identities, loading, onClearFilters, hasActiveFilters, page, pageSize, onRowClick }: {
  identities: SESIdentity[]; loading: boolean; onClearFilters: () => void;
  hasActiveFilters: boolean; page: number; pageSize: PageSize; onRowClick: (id: SESIdentity) => void;
}) {
  const [sortKey, setSortKey] = useState<IdSortKey>("Identity");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const handleSort = (key: IdSortKey) => { if (key === sortKey) setSortDir((d) => d === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDir("asc"); } };
  const sorted = [...identities].sort((a, b) => { const cmp = String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? "")); return sortDir === "asc" ? cmp : -cmp; });
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);
  const SortIcon = ({ col }: { col: IdSortKey }) => col !== sortKey ? <ChevronsUpDown size={13} className="text-slate-300 dark:text-slate-600" /> : sortDir === "asc" ? <ChevronUp size={13} className="text-blue-500" /> : <ChevronDown size={13} className="text-blue-500" />;

  if (!loading && sorted.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
      <p className="text-lg font-medium text-slate-600 dark:text-slate-300">{hasActiveFilters ? "No identities match the current filters." : "No SES identities found"}</p>
      {hasActiveFilters ? <button onClick={onClearFilters} className="mt-3 px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-[#2a2d3a] dark:hover:bg-[#33374a] dark:text-slate-300 transition-colors">Clear filters</button>
        : <p className="text-xs mt-1">No SES identities cached yet — click Refresh to poll AWS</p>}
    </div>
  );

  return (
    <div className="rounded-xl border border-slate-200 shadow-sm dark:border-[#2a2d3a] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-[#2a2d3a] dark:bg-[#161825]">
              {ID_COLUMNS.map((col) => (
                <th key={col.key} onClick={() => handleSort(col.key)} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-slate-600 select-none whitespace-nowrap dark:text-slate-500 dark:hover:text-slate-300">
                  <span className="inline-flex items-center gap-1">{col.label}<SortIcon col={col.key} /></span>
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 select-none whitespace-nowrap dark:text-slate-500">DKIM Signing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#2a2d3a]">
            {loading ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={7} />) : paginated.map((id) => (
              <tr key={`${id.Profile}:${id.Region}:${id.Identity}`} onClick={() => onRowClick(id)} className="group bg-white hover:bg-slate-50 transition-colors dark:bg-[#1c1f2e] dark:hover:bg-[#222538] cursor-pointer">
                <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-200 max-w-[220px] w-[220px]">
                  <div className="flex items-center min-w-0"><span className="truncate" title={id.Identity}>{id.Identity}</span><span className="shrink-0"><CopyButton text={id.Identity} /></span></div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${id.IdentityType === "Domain" ? "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" : "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"}`}>
                    {id.IdentityType === "Domain" ? <Globe size={11} className="mr-1" /> : <Mail size={11} className="mr-1" />}{id.IdentityType}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap"><ProfileBadge profile={id.Profile} color={id.ProfileColor} envTag={id.ProfileEnvTag} /></td>
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap dark:text-slate-300 text-xs">{id.Region}</td>
                <td className="px-4 py-3 whitespace-nowrap"><VerificationBadge status={id.VerificationStatus} /></td>
                <td className="px-4 py-3 whitespace-nowrap">{id.DkimEnabled ? <VerificationBadge status={id.DkimVerificationStatus} /> : <span className="text-xs text-slate-400">—</span>}</td>
                <td className="px-4 py-3 whitespace-nowrap">{id.DkimEnabled ? <span title="DKIM signing enabled" className="text-emerald-500"><ShieldCheck size={15} /></span> : <span title="DKIM signing disabled" className="text-red-400"><ShieldOff size={15} /></span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Sending Limits Table ───────────────────────────────────────────────────

type QuotaSortKey = "Profile" | "Region" | "Max24HourSend" | "MaxSendRate" | "SentLast24Hours";

const QUOTA_COLUMNS: { key: QuotaSortKey; label: string }[] = [
  { key: "Profile",          label: "Profile" },
  { key: "Region",           label: "Region" },
  { key: "Max24HourSend",    label: "Daily Limit" },
  { key: "MaxSendRate",      label: "Max Rate (msg/s)" },
  { key: "SentLast24Hours",  label: "Sent (24h)" },
];

function SendingLimitsTable({ quotas, loading }: { quotas: SESSendingQuota[]; loading: boolean }) {
  const [sortKey, setSortKey] = useState<QuotaSortKey>("Profile");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (key: QuotaSortKey) => { if (key === sortKey) setSortDir((d) => d === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDir("asc"); } };

  const sorted = [...quotas].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    if (typeof av === "number") { const cmp = (av as number) - (bv as number); return sortDir === "asc" ? cmp : -cmp; }
    const cmp = String(av).localeCompare(String(bv)); return sortDir === "asc" ? cmp : -cmp;
  });

  const SortIcon = ({ col }: { col: QuotaSortKey }) => col !== sortKey ? <ChevronsUpDown size={13} className="text-slate-300 dark:text-slate-600" /> : sortDir === "asc" ? <ChevronUp size={13} className="text-blue-500" /> : <ChevronDown size={13} className="text-blue-500" />;

  if (!loading && sorted.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
      <p className="text-lg font-medium">No sending quota data found</p>
      <p className="text-xs mt-1">Click Refresh to poll AWS</p>
    </div>
  );

  return (
    <div className="rounded-xl border border-slate-200 shadow-sm dark:border-[#2a2d3a] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-[#2a2d3a] dark:bg-[#161825]">
              {QUOTA_COLUMNS.map((col) => (
                <th key={col.key} onClick={() => handleSort(col.key)} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-slate-600 select-none whitespace-nowrap dark:text-slate-500 dark:hover:text-slate-300">
                  <span className="inline-flex items-center gap-1">{col.label}<SortIcon col={col.key} /></span>
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 select-none whitespace-nowrap dark:text-slate-500">Usage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#2a2d3a]">
            {loading ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={6} />) : sorted.map((q) => {
              const usagePct = q.Max24HourSend > 0 ? (q.SentLast24Hours / q.Max24HourSend) * 100 : 0;
              const usageColor = usagePct >= 90 ? "text-red-600 dark:text-red-400" : usagePct >= 70 ? "text-amber-600 dark:text-amber-400" : "text-slate-600 dark:text-slate-300";
              return (
                <tr key={`${q.Profile}:${q.Region}`} className="bg-white hover:bg-slate-50 transition-colors dark:bg-[#1c1f2e] dark:hover:bg-[#222538]">
                  <td className="px-4 py-3 whitespace-nowrap"><ProfileBadge profile={q.Profile} color={q.ProfileColor} envTag={q.ProfileEnvTag} /></td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap dark:text-slate-300 text-xs font-mono">{q.Region}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300 tabular-nums">{q.Max24HourSend.toLocaleString()}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300 tabular-nums">{q.MaxSendRate.toLocaleString()}</td>
                  <td className={`px-4 py-3 whitespace-nowrap text-xs font-medium tabular-nums ${usageColor}`}>{q.SentLast24Hours.toLocaleString()}</td>
                  <td className="px-4 py-3 min-w-[160px]"><UsageBar sent={q.SentLast24Hours} max={q.Max24HourSend} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Account Stats Table ────────────────────────────────────────────────────

type StatsSortKey = "Profile" | "Region" | "TotalDeliveryAttempts" | "TotalBounces" | "TotalComplaints" | "TotalRejects";

const STATS_COLUMNS: { key: StatsSortKey; label: string }[] = [
  { key: "Profile",                label: "Profile" },
  { key: "Region",                 label: "Region" },
  { key: "TotalDeliveryAttempts",  label: "Delivered (14d)" },
  { key: "TotalBounces",           label: "Bounces (14d)" },
  { key: "TotalComplaints",        label: "Complaints (14d)" },
  { key: "TotalRejects",           label: "Rejects (14d)" },
];

function BounceRateBar({ value, total, color }: { value: number; total: number; color: string }) {
  if (total <= 0) return <span className="text-xs text-slate-400">—</span>;
  const pct = Math.min(100, (value / total) * 100);
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
        {pct.toFixed(2)}%
      </span>
    </div>
  );
}

function AccountStatsTable({ stats, loading }: { stats: SESAccountStats[]; loading: boolean }) {
  const [sortKey, setSortKey]   = useState<StatsSortKey>("Profile");
  const [sortDir, setSortDir]   = useState<SortDir>("asc");

  const handleSort = (key: StatsSortKey) => {
    if (key === sortKey) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = [...stats].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    if (typeof av === "number") { const cmp = (av as number) - (bv as number); return sortDir === "asc" ? cmp : -cmp; }
    const cmp = String(av).localeCompare(String(bv)); return sortDir === "asc" ? cmp : -cmp;
  });

  const SortIcon = ({ col }: { col: StatsSortKey }) =>
    col !== sortKey ? <ChevronsUpDown size={13} className="text-slate-300 dark:text-slate-600" />
    : sortDir === "asc" ? <ChevronUp size={13} className="text-blue-500" />
    : <ChevronDown size={13} className="text-blue-500" />;

  if (!loading && sorted.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
      <p className="text-lg font-medium">No account stats data found</p>
      <p className="text-xs mt-1">Click Refresh to poll AWS</p>
    </div>
  );

  return (
    <div className="rounded-xl border border-slate-200 shadow-sm dark:border-[#2a2d3a] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-[#2a2d3a] dark:bg-[#161825]">
              {STATS_COLUMNS.map((col) => (
                <th key={col.key} onClick={() => handleSort(col.key)}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-slate-600 select-none whitespace-nowrap dark:text-slate-500 dark:hover:text-slate-300">
                  <span className="inline-flex items-center gap-1">{col.label}<SortIcon col={col.key} /></span>
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 select-none whitespace-nowrap dark:text-slate-500">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 select-none whitespace-nowrap dark:text-slate-500">Bounce Rate</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 select-none whitespace-nowrap dark:text-slate-500">Complaint Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#2a2d3a]">
            {loading ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={9} />) : sorted.map((s) => {
              const delivered = s.TotalDeliveryAttempts;
              const bounceRate    = delivered > 0 ? (s.TotalBounces    / delivered) * 100 : 0;
              const complaintRate = delivered > 0 ? (s.TotalComplaints / delivered) * 100 : 0;
              const bounceColor    = bounceRate    >= 5   ? "text-red-600 dark:text-red-400"    : bounceRate    >= 2   ? "text-amber-600 dark:text-amber-400" : "text-slate-600 dark:text-slate-300";
              const complaintColor = complaintRate >= 0.1 ? "text-red-600 dark:text-red-400"    : complaintRate >= 0.05 ? "text-amber-600 dark:text-amber-400" : "text-slate-600 dark:text-slate-300";
              return (
                <tr key={`${s.Profile}:${s.Region}`} className="bg-white hover:bg-slate-50 transition-colors dark:bg-[#1c1f2e] dark:hover:bg-[#222538]">
                  <td className="px-4 py-3 whitespace-nowrap"><ProfileBadge profile={s.Profile} color={s.ProfileColor} envTag={s.ProfileEnvTag} /></td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap dark:text-slate-300 text-xs font-mono">{s.Region}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300 tabular-nums">{s.TotalDeliveryAttempts.toLocaleString()}</td>
                  <td className={`px-4 py-3 whitespace-nowrap text-xs font-medium tabular-nums ${bounceColor}`}>{s.TotalBounces.toLocaleString()}</td>
                  <td className={`px-4 py-3 whitespace-nowrap text-xs font-medium tabular-nums ${complaintColor}`}>{s.TotalComplaints.toLocaleString()}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300 tabular-nums">{s.TotalRejects.toLocaleString()}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium w-fit
                        ${s.InSandbox
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"}`}>
                        {s.InSandbox ? "Sandbox" : "Production"}
                      </span>
                      {!s.SendingEnabled && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400 w-fit">
                          Sending disabled
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 min-w-[140px]">
                    <BounceRateBar value={s.TotalBounces} total={delivered}
                      color={bounceRate >= 5 ? "bg-red-500" : bounceRate >= 2 ? "bg-amber-400" : "bg-emerald-500"} />
                  </td>
                  <td className="px-4 py-3 min-w-[140px]">
                    <BounceRateBar value={s.TotalComplaints} total={delivered}
                      color={complaintRate >= 0.1 ? "bg-red-500" : complaintRate >= 0.05 ? "bg-amber-400" : "bg-emerald-500"} />
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

// ── SESDashboard ───────────────────────────────────────────────────────────

type ActiveTab = "identities" | "sending-limits" | "account-stats";

export default function SESDashboard() {
  const [identities, setIdentities] = useState<SESIdentity[]>([]);
  const [quotas, setQuotas] = useState<SESSendingQuota[]>([]);
  const [accountStats, setAccountStats] = useState<SESAccountStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [selectedIdentity, setSelectedIdentity] = useState<SESIdentity | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("identities");

  // Identity filters
  const [search, setSearch] = useState("");
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);

  const loadStatus = useCallback(async () => {
    try { setSchedulerStatus(await fetchSchedulerStatus()); } catch { /* non-critical */ }
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
      try { await triggerSchedulerPoll(); await new Promise((r) => setTimeout(r, 2000)); } catch { /* best-effort */ }
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [idData, quotaData, statsData] = await Promise.all([fetchSESIdentities(), fetchSESSendingQuotas(), fetchSESAccountStats()]);
      setIdentities(idData);
      setQuotas(quotaData);
      setAccountStats(statsData);
      setLastUpdated(new Date());
      if (!isRefresh) {
        setSelectedProfiles([...new Set(idData.map((d) => d.Profile))]);
        setSelectedRegions([...new Set(idData.map((d) => d.Region))]);
        setSelectedTypes([...new Set(idData.map((d) => d.IdentityType))]);
        setSelectedStatuses([...new Set(idData.map((d) => d.VerificationStatus))]);
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
  useEffect(() => { const id = setInterval(loadStatus, 10_000); return () => clearInterval(id); }, [loadStatus]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const allProfiles = [...new Set(identities.map((d) => d.Profile))].sort();
  const allRegions  = [...new Set(identities.map((d) => d.Region))].sort();
  const allTypes    = [...new Set(identities.map((d) => d.IdentityType))].sort();
  const allStatuses = [...new Set(identities.map((d) => d.VerificationStatus))].sort();
  const profileColorMap = Object.fromEntries(identities.map((d) => [d.Profile, d.ProfileColor]));

  const total         = identities.length;
  const verifiedCount = identities.filter((d) => d.VerificationStatus === "Success").length;
  const domainCount   = identities.filter((d) => d.IdentityType === "Domain").length;
  const emailCount    = identities.filter((d) => d.IdentityType === "EmailAddress").length;

  // Aggregate quota stats across all regions/profiles
  const totalMax24h  = quotas.reduce((s, q) => s + q.Max24HourSend, 0);
  const totalSent24h = quotas.reduce((s, q) => s + q.SentLast24Hours, 0);

  // Aggregate account stats
  const productionCount = accountStats.filter((s) => !s.InSandbox).length;
  const sandboxCount    = accountStats.filter((s) => s.InSandbox).length;
  const totalBounces    = accountStats.reduce((s, r) => s + r.TotalBounces, 0);
  const totalComplaints = accountStats.reduce((s, r) => s + r.TotalComplaints, 0);
  const totalDelivered  = accountStats.reduce((s, r) => s + r.TotalDeliveryAttempts, 0);

  const filtered = identities.filter((d) => {
    const matchProfile = selectedProfiles.length === 0 || selectedProfiles.includes(d.Profile);
    const matchRegion  = selectedRegions.length === 0  || selectedRegions.includes(d.Region);
    const matchType    = selectedTypes.length === 0    || selectedTypes.includes(d.IdentityType);
    const matchStatus  = selectedStatuses.length === 0 || selectedStatuses.includes(d.VerificationStatus);
    const matchSearch  = !search || d.Identity.toLowerCase().includes(search.toLowerCase());
    return matchProfile && matchRegion && matchType && matchStatus && matchSearch;
  });

  const hasActiveFilters =
    search.trim() !== "" ||
    (selectedProfiles.length > 0 && selectedProfiles.length < allProfiles.length) ||
    (selectedRegions.length > 0 && selectedRegions.length < allRegions.length) ||
    (selectedTypes.length > 0 && selectedTypes.length < allTypes.length) ||
    (selectedStatuses.length > 0 && selectedStatuses.length < allStatuses.length);

  const handleClearAll = () => {
    setSearch("");
    setSelectedProfiles([...new Set(identities.map((d) => d.Profile))]);
    setSelectedRegions([...new Set(identities.map((d) => d.Region))]);
    setSelectedTypes([...new Set(identities.map((d) => d.IdentityType))]);
    setSelectedStatuses([...new Set(identities.map((d) => d.VerificationStatus))]);
    setPage(1);
  };

  const handleIntervalChange = async (seconds: number) => {
    try { setSchedulerStatus(await updateSchedulerInterval(seconds)); } catch { /* non-critical */ }
  };

  const tabCls = (t: ActiveTab) =>
    t === activeTab
      ? "px-4 py-2 text-sm font-medium border-b-2 border-blue-500 text-slate-900 dark:text-white transition-colors"
      : "px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border-b-2 border-transparent transition-colors";

  return (
    <div className="p-6 overflow-auto bg-slate-100 dark:bg-[#0f1117] min-h-full">
      <SESDrawer identity={selectedIdentity} onClose={() => setSelectedIdentity(null)} />

      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">SES</h2>
          <p className="text-xs text-slate-400 mt-0.5">{lastUpdated && `Cache read at ${lastUpdated.toLocaleTimeString()}`}</p>
          <div className="mt-1"><SchedulerBadge status={schedulerStatus} onIntervalChange={handleIntervalChange} /></div>
        </div>
        <button onClick={() => load(true)} disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-300 dark:hover:bg-white/5">
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Polling AWS…" : "Refresh"}
        </button>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <StatCard label="Total Identities" value={loading ? 0 : total}             total={total}    color="blue"   icon={<Mail size={20} />} />
        <StatCard label="Verified"         value={loading ? 0 : verifiedCount}     total={total}    color="green"  icon={<ShieldCheck size={20} />} />
        <StatCard label="Production"       value={loading ? 0 : productionCount}   total={accountStats.length} color="green"  icon={<ShieldCheck size={20} />}
          ratio={accountStats.length > 0 ? `${sandboxCount} sandbox` : undefined} />
        <StatCard label="Bounces (14d)"    value={loading ? 0 : totalBounces}      total={totalDelivered} color="red"
          icon={<AlertTriangle size={20} />}
          ratio={totalDelivered > 0 ? `${((totalBounces / totalDelivered) * 100).toFixed(2)}% rate` : undefined} />
        <StatCard label="Sent (24h)"       value={loading ? 0 : Math.round(totalSent24h)} total={Math.round(totalMax24h)} color="green" icon={<Gauge size={20} />}
          ratio={totalMax24h > 0 ? `of ${totalMax24h.toLocaleString()} limit` : undefined} />
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-950/20 p-6 text-red-600 dark:text-red-400 mb-4">
          <p className="font-semibold mb-1">Failed to load SES data</p>
          <p className="text-sm font-mono opacity-80 mb-3">{error}</p>
          <button onClick={() => load()} className="text-sm underline hover:no-underline">Try again</button>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="border-b border-slate-200 dark:border-[#2a2d3a] mb-4">
        <nav className="flex items-center gap-1 -mb-px">
          <button onClick={() => setActiveTab("identities")} className={tabCls("identities")}>
            Identities {!loading && <span className="ml-1 text-xs text-slate-400">({identities.length})</span>}
          </button>
          <button onClick={() => setActiveTab("sending-limits")} className={tabCls("sending-limits")}>
            Sending Limits {!loading && <span className="ml-1 text-xs text-slate-400">({quotas.length})</span>}
          </button>
          <button onClick={() => setActiveTab("account-stats")} className={tabCls("account-stats")}>
            Account Stats {!loading && <span className="ml-1 text-xs text-slate-400">({accountStats.length})</span>}
          </button>
        </nav>
      </div>

      {/* ── Identities tab ── */}
      {activeTab === "identities" && !error && (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
              <input type="text" placeholder="Search identities…" value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-400 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-200 dark:placeholder-slate-500" />
            </div>
            <DropdownChip label="Profile" allItems={allProfiles} selectedItems={selectedProfiles}
              onChange={(v) => { setSelectedProfiles(v); setPage(1); }}
              renderItem={(name) => (
                <span className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 truncate">
                  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: profileColorMap[name] ?? "#6366f1" }} />{name}
                </span>
              )} />
            <DropdownChip label="Region"       allItems={allRegions}  selectedItems={selectedRegions}  onChange={(v) => { setSelectedRegions(v);  setPage(1); }} />
            <DropdownChip label="Type"         allItems={allTypes}    selectedItems={selectedTypes}    onChange={(v) => { setSelectedTypes(v);    setPage(1); }} />
            <DropdownChip label="Verification" allItems={allStatuses} selectedItems={selectedStatuses} onChange={(v) => { setSelectedStatuses(v); setPage(1); }} />
            {hasActiveFilters && (
              <button type="button" onClick={handleClearAll} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
                <X size={12} />Clear filters
              </button>
            )}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">{filtered.length} of {total} identities</span>
              {total > 0 && <Pagination total={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />}
            </div>
          </div>
          <IdentitiesTable identities={filtered} loading={loading} onClearFilters={handleClearAll} hasActiveFilters={hasActiveFilters} page={page} pageSize={pageSize} onRowClick={setSelectedIdentity} />
        </>
      )}

      {/* ── Sending Limits tab ── */}
      {activeTab === "sending-limits" && !error && (
        <SendingLimitsTable quotas={quotas} loading={loading} />
      )}

      {/* ── Account Stats tab ── */}
      {activeTab === "account-stats" && !error && (
        <div className="space-y-3">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Bounce and complaint counts cover the last ~14 days (AWS GetSendStatistics). Sandbox accounts are limited to 200 emails/day.
          </p>
          <AccountStatsTable stats={accountStats} loading={loading} />
        </div>
      )}
    </div>
  );
}