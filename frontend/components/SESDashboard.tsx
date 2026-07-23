"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  RefreshCw, Mail, Globe, Search, ChevronDown, ChevronUp, ChevronsUpDown,
  Copy, Check, X, ShieldCheck, ShieldOff, Gauge, AlertTriangle,
} from "lucide-react";
import { fetchSESIdentities, fetchSESSendingQuotas, fetchSESAccountStats, triggerSchedulerPoll } from "@/lib/api";
import { useResourceLoad } from "@/lib/useInitialFetch";
import { SESIdentity, SESSendingQuota, SESAccountStats } from "@/lib/types";
import StatCard from "./StatCard";
import SkeletonRow from "./SkeletonRow";
import ProfileBadge from "./ProfileBadge";
import Pagination, { PageSize } from "./Pagination";
import SlideOverDrawer from "./SlideOverDrawer";

// ── Helpers ────────────────────────────────────────────────────────────────

const VER_META: Record<string, { bg: string; text: string }> = {
  Success:          { bg: "rgba(16,185,129,0.1)",  text: "#10b981" },
  Pending:          { bg: "rgba(245,158,11,0.1)",  text: "#f59e0b" },
  Failed:           { bg: "rgba(239,68,68,0.1)",   text: "#ef4444" },
  TemporaryFailure: { bg: "rgba(249,115,22,0.1)",  text: "#f97316" },
  NotStarted:       { bg: "var(--bg-subtle)",       text: "var(--text-tertiary)" },
};

function VerificationBadge({ status }: { status: string }) {
  const c = VER_META[status] ?? VER_META.NotStarted;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: c.bg, color: c.text }}>{status || "—"}</span>;
}

function UsageBar({ sent, max }: { sent: number; max: number }) {
  if (max <= 0) return <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>—</span>;
  const pct = Math.min(100, (sent / max) * 100);
  const barColor = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#10b981";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-muted)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <span className="text-[12px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{pct.toFixed(1)}%</span>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="ml-1.5 p-0.5 rounded opacity-0 group-hover/row:opacity-100 transition-opacity duration-150" style={{ color: "var(--text-tertiary)" }}>
      {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
    </button>
  );
}

// ── Local DropdownChip ─────────────────────────────────────────────────────

function DropdownChip({ label, allItems, selectedItems, onChange, renderItem }: {
  label: string; allItems: string[]; selectedItems: string[];
  onChange: (items: string[]) => void; renderItem?: (item: string) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  const allSel = selectedItems.length === 0 || selectedItems.length === allItems.length;
  const active = selectedItems.length > 0 && selectedItems.length < allItems.length ? selectedItems.length : null;
  const toggle = (item: string) => onChange(selectedItems.includes(item) ? selectedItems.filter((x) => x !== item) : [...selectedItems, item]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150"
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

// ── Drawers & Tables ───────────────────────────────────────────────────────

function DrawerRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <dt className="text-[13px] shrink-0" style={{ color: "var(--text-tertiary)" }}>{label}</dt>
      <dd className="text-[13px] text-right break-all" style={{ color: "var(--text-primary)" }}>{value ?? "—"}</dd>
    </div>
  );
}

function SESDrawer({ identity, onClose }: { identity: SESIdentity | null; onClose: () => void }) {
  return (
    <SlideOverDrawer isOpen={!!identity} onClose={onClose} title={identity ? identity.Identity : ""}>
      {identity && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>Identity</p>
          <DrawerRow label="Identity" value={<span className="font-mono text-[12px] flex items-center gap-1">{identity.Identity}<button onClick={() => navigator.clipboard.writeText(identity.Identity)} style={{ color: "var(--text-tertiary)" }}><Copy size={10} /></button></span>} />
          <DrawerRow label="Type" value={<span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: identity.IdentityType === "Domain" ? "rgba(139,92,246,0.1)" : "rgba(37,99,235,0.1)", color: identity.IdentityType === "Domain" ? "#8b5cf6" : "var(--brand)" }}>{identity.IdentityType}</span>} />
          <DrawerRow label="Verification" value={<VerificationBadge status={identity.VerificationStatus} />} />

          <p className="text-[11px] font-semibold uppercase tracking-wider mb-3 mt-5" style={{ color: "var(--text-tertiary)" }}>Deployment</p>
          <DrawerRow label="Profile" value={<ProfileBadge profile={identity.Profile} color={identity.ProfileColor} envTag={identity.ProfileEnvTag} />} />
          <DrawerRow label="Region" value={<span className="font-mono text-[12px]">{identity.Region}</span>} />

          <p className="text-[11px] font-semibold uppercase tracking-wider mb-3 mt-5" style={{ color: "var(--text-tertiary)" }}>DKIM</p>
          <DrawerRow label="DKIM Signing" value={identity.DkimEnabled ? <span style={{ color: "#10b981", fontWeight: 600 }}>Enabled</span> : <span style={{ color: "var(--text-tertiary)" }}>Disabled</span>} />
          {identity.DkimEnabled && <DrawerRow label="DKIM Status" value={<VerificationBadge status={identity.DkimVerificationStatus} />} />}

          <p className="text-[11px] font-semibold uppercase tracking-wider mb-3 mt-5" style={{ color: "var(--text-tertiary)" }}>Notifications</p>
          <DrawerRow label="Bounce SNS Topic" value={<span className="font-mono text-[11px] break-all">{identity.BounceTopicArn ?? "—"}</span>} />
          <DrawerRow label="Complaint SNS Topic" value={<span className="font-mono text-[11px] break-all">{identity.ComplaintTopicArn ?? "—"}</span>} />
          <DrawerRow label="Delivery SNS Topic" value={<span className="font-mono text-[11px] break-all">{identity.DeliveryTopicArn ?? "—"}</span>} />
          <DrawerRow label="Email Forwarding" value={identity.ForwardingEnabled ? <span style={{ color: "#10b981" }}>Enabled</span> : <span style={{ color: "var(--text-tertiary)" }}>Disabled</span>} />
        </div>
      )}
    </SlideOverDrawer>
  );
}

// ── Table helpers ──────────────────────────────────────────────────────────

type SortDir = "asc" | "desc";

function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden border" style={{ background: "var(--bg-card)", borderColor: "var(--border)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <div className="overflow-x-auto"><table className="w-full">{children}</table></div>
    </div>
  );
}
function SI({ col, sortKey, sortDir }: { col: string; sortKey: string; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown size={12} style={{ color: "var(--text-tertiary)" }} />;
  return sortDir === "asc" ? <ChevronUp size={12} style={{ color: "var(--brand)" }} /> : <ChevronDown size={12} style={{ color: "var(--brand)" }} />;
}

// ── Identities Table ───────────────────────────────────────────────────────

type IdSortKey = "Identity" | "IdentityType" | "Profile" | "Region" | "VerificationStatus" | "DkimVerificationStatus";

function IdentitiesTable({ identities, loading, onClearFilters, hasActiveFilters, page, pageSize, onRowClick }: {
  identities: SESIdentity[]; loading: boolean; onClearFilters: () => void;
  hasActiveFilters: boolean; page: number; pageSize: PageSize; onRowClick: (id: SESIdentity) => void;
}) {
  const [sortKey, setSortKey] = useState<IdSortKey>("Identity");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const hs = (k: IdSortKey) => { if (k === sortKey) setSortDir((d) => d === "asc" ? "desc" : "asc"); else { setSortKey(k); setSortDir("asc"); } };
  const sorted = [...identities].sort((a, b) => { const cmp = String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? "")); return sortDir === "asc" ? cmp : -cmp; });
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);
  const COLS: { key: IdSortKey; label: string }[] = [
    { key: "Identity", label: "Identity" }, { key: "IdentityType", label: "Type" },
    { key: "Profile", label: "Profile" }, { key: "Region", label: "Region" },
    { key: "VerificationStatus", label: "Verification" }, { key: "DkimVerificationStatus", label: "DKIM Status" },
  ];
  if (!loading && sorted.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 rounded-xl border gap-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <p className="text-[14px] font-medium" style={{ color: "var(--text-secondary)" }}>{hasActiveFilters ? "No identities match." : "No SES identities found"}</p>
      {hasActiveFilters && <button onClick={onClearFilters} className="px-4 py-1.5 rounded-lg text-[13px]" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>Clear filters</button>}
    </div>
  );
  return (
    <TableWrap>
      <thead>
        <tr className="border-b" style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}>
          {COLS.map((col) => (
            <th key={col.key} onClick={() => hs(col.key)} className="px-4 py-3 text-left select-none cursor-pointer whitespace-nowrap">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: sortKey === col.key ? "var(--brand)" : "var(--text-tertiary)" }}>
                {col.label}<SI col={col.key} sortKey={sortKey} sortDir={sortDir} />
              </span>
            </th>
          ))}
          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-left whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>DKIM Signing</th>
        </tr>
      </thead>
      <tbody>
        {loading ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={7} />) : paginated.map((id) => (
          <tr key={`${id.Profile}:${id.Region}:${id.Identity}`} onClick={() => onRowClick(id)}
            className="group/row border-b table-row-hover cursor-pointer"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-card)")}>
            <td className="px-4 py-3 max-w-[220px]">
              <div className="flex items-center min-w-0">
                <span className="font-mono text-[13px] font-medium truncate" title={id.Identity} style={{ color: "var(--text-primary)" }}>{id.Identity}</span>
                <CopyButton text={id.Identity} />
              </div>
            </td>
            <td className="px-4 py-3 whitespace-nowrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: id.IdentityType === "Domain" ? "rgba(139,92,246,0.1)" : "rgba(37,99,235,0.1)", color: id.IdentityType === "Domain" ? "#8b5cf6" : "var(--brand)" }}>
                {id.IdentityType === "Domain" ? <Globe size={10} /> : <Mail size={10} />}{id.IdentityType}
              </span>
            </td>
            <td className="px-4 py-3 whitespace-nowrap"><ProfileBadge profile={id.Profile} color={id.ProfileColor} envTag={id.ProfileEnvTag} /></td>
            <td className="px-4 py-3 whitespace-nowrap text-[13px]" style={{ color: "var(--text-secondary)" }}>{id.Region}</td>
            <td className="px-4 py-3 whitespace-nowrap"><VerificationBadge status={id.VerificationStatus} /></td>
            <td className="px-4 py-3 whitespace-nowrap">{id.DkimEnabled ? <VerificationBadge status={id.DkimVerificationStatus} /> : <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>—</span>}</td>
            <td className="px-4 py-3 whitespace-nowrap">
              {id.DkimEnabled ? <span title="DKIM signing enabled"><ShieldCheck size={15} className="text-emerald-500" /></span> : <span title="DKIM signing disabled"><ShieldOff size={15} className="text-red-400" /></span>}
            </td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

// ── Sending Limits Table ───────────────────────────────────────────────────

type QuotaSortKey = "Profile" | "Region" | "Max24HourSend" | "MaxSendRate" | "SentLast24Hours";
function SendingLimitsTable({ quotas, loading }: { quotas: SESSendingQuota[]; loading: boolean }) {
  const [sortKey, setSortKey] = useState<QuotaSortKey>("Profile");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const hs = (k: QuotaSortKey) => { if (k === sortKey) setSortDir((d) => d === "asc" ? "desc" : "asc"); else { setSortKey(k); setSortDir("asc"); } };
  const sorted = [...quotas].sort((a, b) => {
    const av = a[sortKey] ?? 0; const bv = b[sortKey] ?? 0;
    if (typeof av === "number") { return sortDir === "asc" ? (av - (bv as number)) : ((bv as number) - av); }
    return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });
  const COLS: { key: QuotaSortKey; label: string }[] = [
    { key: "Profile", label: "Profile" }, { key: "Region", label: "Region" },
    { key: "Max24HourSend", label: "Daily Limit" }, { key: "MaxSendRate", label: "Max Rate (msg/s)" }, { key: "SentLast24Hours", label: "Sent (24h)" },
  ];
  if (!loading && sorted.length === 0) return <div className="flex flex-col items-center justify-center py-20 rounded-xl border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}><p className="text-[14px] font-medium" style={{ color: "var(--text-secondary)" }}>No sending quota data found</p></div>;
  return (
    <TableWrap>
      <thead>
        <tr className="border-b" style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}>
          {COLS.map((col) => (
            <th key={col.key} onClick={() => hs(col.key)} className="px-4 py-3 text-left select-none cursor-pointer whitespace-nowrap">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: sortKey === col.key ? "var(--brand)" : "var(--text-tertiary)" }}>
                {col.label}<SI col={col.key} sortKey={sortKey} sortDir={sortDir} />
              </span>
            </th>
          ))}
          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-left" style={{ color: "var(--text-tertiary)" }}>Usage</th>
        </tr>
      </thead>
      <tbody>
        {loading ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={6} />) : sorted.map((q) => {
          const pct = q.Max24HourSend > 0 ? (q.SentLast24Hours / q.Max24HourSend) * 100 : 0;
          const usageColor = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "var(--text-secondary)";
          return (
            <tr key={`${q.Profile}:${q.Region}`} className="border-b" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
              <td className="px-4 py-3 whitespace-nowrap"><ProfileBadge profile={q.Profile} color={q.ProfileColor} envTag={q.ProfileEnvTag} /></td>
              <td className="px-4 py-3 whitespace-nowrap font-mono text-[12px]" style={{ color: "var(--text-secondary)" }}>{q.Region}</td>
              <td className="px-4 py-3 whitespace-nowrap text-[13px] tabular-nums" style={{ color: "var(--text-secondary)" }}>{q.Max24HourSend.toLocaleString()}</td>
              <td className="px-4 py-3 whitespace-nowrap text-[13px] tabular-nums" style={{ color: "var(--text-secondary)" }}>{q.MaxSendRate.toLocaleString()}</td>
              <td className="px-4 py-3 whitespace-nowrap text-[13px] font-medium tabular-nums" style={{ color: usageColor }}>{q.SentLast24Hours.toLocaleString()}</td>
              <td className="px-4 py-3 min-w-[160px]"><UsageBar sent={q.SentLast24Hours} max={q.Max24HourSend} /></td>
            </tr>
          );
        })}
      </tbody>
    </TableWrap>
  );
}

// ── Account Stats Table ────────────────────────────────────────────────────

type StatsSortKey = "Profile" | "Region" | "TotalDeliveryAttempts" | "TotalBounces" | "TotalComplaints" | "TotalRejects";

function RateBar({ value, total }: { value: number; total: number }) {
  if (total <= 0) return <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>—</span>;
  const pct = Math.min(100, (value / total) * 100);
  const barColor = pct >= 5 ? "#ef4444" : pct >= 2 ? "#f59e0b" : "#10b981";
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-muted)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <span className="text-[12px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{pct.toFixed(2)}%</span>
    </div>
  );
}

function AccountStatsTable({ stats, loading }: { stats: SESAccountStats[]; loading: boolean }) {
  const [sortKey, setSortKey] = useState<StatsSortKey>("Profile");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const hs = (k: StatsSortKey) => { if (k === sortKey) setSortDir((d) => d === "asc" ? "desc" : "asc"); else { setSortKey(k); setSortDir("asc"); } };
  const sorted = [...stats].sort((a, b) => {
    const av = a[sortKey] ?? 0; const bv = b[sortKey] ?? 0;
    if (typeof av === "number") { return sortDir === "asc" ? (av - (bv as number)) : ((bv as number) - av); }
    return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });
  const COLS: { key: StatsSortKey; label: string }[] = [
    { key: "Profile", label: "Profile" }, { key: "Region", label: "Region" },
    { key: "TotalDeliveryAttempts", label: "Delivered (14d)" }, { key: "TotalBounces", label: "Bounces (14d)" },
    { key: "TotalComplaints", label: "Complaints (14d)" }, { key: "TotalRejects", label: "Rejects (14d)" },
  ];
  if (!loading && sorted.length === 0) return <div className="flex flex-col items-center justify-center py-20 rounded-xl border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}><p className="text-[14px] font-medium" style={{ color: "var(--text-secondary)" }}>No account stats found</p></div>;
  return (
    <TableWrap>
      <thead>
        <tr className="border-b" style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}>
          {COLS.map((col) => (
            <th key={col.key} onClick={() => hs(col.key)} className="px-4 py-3 text-left select-none cursor-pointer whitespace-nowrap">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: sortKey === col.key ? "var(--brand)" : "var(--text-tertiary)" }}>
                {col.label}<SI col={col.key} sortKey={sortKey} sortDir={sortDir} />
              </span>
            </th>
          ))}
          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-left" style={{ color: "var(--text-tertiary)" }}>Status</th>
          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-left" style={{ color: "var(--text-tertiary)" }}>Bounce Rate</th>
          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-left" style={{ color: "var(--text-tertiary)" }}>Complaint Rate</th>
        </tr>
      </thead>
      <tbody>
        {loading ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={9} />) : sorted.map((s) => {
          const d = s.TotalDeliveryAttempts;
          const br = d > 0 ? (s.TotalBounces / d) * 100 : 0;
          const cr = d > 0 ? (s.TotalComplaints / d) * 100 : 0;
          const bColor = br >= 5 ? "#ef4444" : br >= 2 ? "#f59e0b" : "var(--text-secondary)";
          const cColor = cr >= 0.1 ? "#ef4444" : cr >= 0.05 ? "#f59e0b" : "var(--text-secondary)";
          return (
            <tr key={`${s.Profile}:${s.Region}`} className="border-b" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
              <td className="px-4 py-3 whitespace-nowrap"><ProfileBadge profile={s.Profile} color={s.ProfileColor} envTag={s.ProfileEnvTag} /></td>
              <td className="px-4 py-3 whitespace-nowrap font-mono text-[12px]" style={{ color: "var(--text-secondary)" }}>{s.Region}</td>
              <td className="px-4 py-3 whitespace-nowrap text-[13px] tabular-nums" style={{ color: "var(--text-secondary)" }}>{s.TotalDeliveryAttempts.toLocaleString()}</td>
              <td className="px-4 py-3 whitespace-nowrap text-[13px] font-medium tabular-nums" style={{ color: bColor }}>{s.TotalBounces.toLocaleString()}</td>
              <td className="px-4 py-3 whitespace-nowrap text-[13px] font-medium tabular-nums" style={{ color: cColor }}>{s.TotalComplaints.toLocaleString()}</td>
              <td className="px-4 py-3 whitespace-nowrap text-[13px] tabular-nums" style={{ color: "var(--text-secondary)" }}>{s.TotalRejects.toLocaleString()}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: s.InSandbox ? "rgba(245,158,11,0.1)" : "rgba(16,185,129,0.1)", color: s.InSandbox ? "#f59e0b" : "#10b981" }}>
                  {s.InSandbox ? "Sandbox" : "Production"}
                </span>
                {!s.SendingEnabled && <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>Disabled</span>}
              </td>
              <td className="px-4 py-3 min-w-[120px]"><RateBar value={s.TotalBounces} total={d} /></td>
              <td className="px-4 py-3 min-w-[120px]"><RateBar value={s.TotalComplaints} total={d} /></td>
            </tr>
          );
        })}
      </tbody>
    </TableWrap>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

type ActiveTab = "identities" | "sending-limits" | "account-stats";

export default function SESDashboard() {
  const [identities, setIdentities] = useState<SESIdentity[]>([]);
  const [quotas, setQuotas] = useState<SESSendingQuota[]>([]);
  const [accountStats, setAccountStats] = useState<SESAccountStats[]>([]);
  const [selectedIdentity, setSelectedIdentity] = useState<SESIdentity | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("identities");

  const beforeRefresh = useCallback(async () => { await triggerSchedulerPoll(); await new Promise((r) => setTimeout(r, 2000)); }, []);
  const fetchAll = useCallback(() => Promise.all([fetchSESIdentities(), fetchSESSendingQuotas(), fetchSESAccountStats()]), []);
  const onData = useCallback(([i, q, s]: [SESIdentity[], SESSendingQuota[], SESAccountStats[]]) => { setIdentities(i); setQuotas(q); setAccountStats(s); }, []);
  const { loading, error, lastUpdated, refreshing, load } = useResourceLoad({ fetcher: fetchAll, onData, beforeRefresh });

  const [search, setSearch] = useState(""); const [selProfiles, setSelProfiles] = useState<string[]>([]); const [selRegions, setSelRegions] = useState<string[]>([]); const [selTypes, setSelTypes] = useState<string[]>([]); const [selStatuses, setSelStatuses] = useState<string[]>([]);
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState<PageSize>(10);

  const allProfiles = [...new Set(identities.map((d) => d.Profile))].sort();
  const allRegions  = [...new Set(identities.map((d) => d.Region))].sort();
  const allTypes    = [...new Set(identities.map((d) => d.IdentityType))].sort();
  const allStatuses = [...new Set(identities.map((d) => d.VerificationStatus))].sort();
  const profileColorMap = Object.fromEntries(identities.map((d) => [d.Profile, d.ProfileColor]));

  const totalMax24h  = quotas.reduce((s, q) => s + q.Max24HourSend, 0);
  const totalSent24h = quotas.reduce((s, q) => s + q.SentLast24Hours, 0);
  const productionCount = accountStats.filter((s) => !s.InSandbox).length;
  const sandboxCount    = accountStats.filter((s) => s.InSandbox).length;
  const totalBounces    = accountStats.reduce((s, r) => s + r.TotalBounces, 0);
  const totalDelivered  = accountStats.reduce((s, r) => s + r.TotalDeliveryAttempts, 0);

  const filtered = identities.filter((d) =>
    (selProfiles.length === 0 || selProfiles.includes(d.Profile)) &&
    (selRegions.length === 0  || selRegions.includes(d.Region)) &&
    (selTypes.length === 0    || selTypes.includes(d.IdentityType)) &&
    (selStatuses.length === 0 || selStatuses.includes(d.VerificationStatus)) &&
    (!search || d.Identity.toLowerCase().includes(search.toLowerCase()))
  );

  const hasActiveFilters = search.trim() !== "" || (selProfiles.length > 0 && selProfiles.length < allProfiles.length) || (selRegions.length > 0 && selRegions.length < allRegions.length) || (selTypes.length > 0 && selTypes.length < allTypes.length) || (selStatuses.length > 0 && selStatuses.length < allStatuses.length);
  const handleClearAll = () => { setSearch(""); setSelProfiles([]); setSelRegions([]); setSelTypes([]); setSelStatuses([]); setPage(1); };
  const tabCls = (t: ActiveTab) => `px-4 py-2.5 text-[13px] font-medium transition-colors duration-150 border-b-2 ${activeTab === t ? "border-blue-500" : "border-transparent"}`;

  return (
    <div className="p-6 min-h-full" style={{ background: "var(--bg-page)" }}>
      <SESDrawer identity={selectedIdentity} onClose={() => setSelectedIdentity(null)} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>SES</h1>
          {lastUpdated && <p className="text-[13px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>Synced {lastUpdated.toLocaleTimeString()}</p>}
        </div>
        <button onClick={() => load(true)} disabled={refreshing} className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors duration-150 disabled:opacity-50" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />{refreshing ? "Polling AWS…" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-5 gap-4 mb-6">
        <StatCard label="Total Identities" value={loading ? 0 : identities.length}  color="blue"  icon={<Mail size={18} />} />
        <StatCard label="Verified"          value={loading ? 0 : identities.filter((d) => d.VerificationStatus === "Success").length} color="green" icon={<ShieldCheck size={18} />} />
        <StatCard label="Production"        value={loading ? 0 : productionCount}   color="green" icon={<ShieldCheck size={18} />} ratio={`${sandboxCount} sandbox`} />
        <StatCard label="Bounces (14d)"     value={loading ? 0 : totalBounces}      color="red"   icon={<AlertTriangle size={18} />} ratio={totalDelivered > 0 ? `${((totalBounces / totalDelivered) * 100).toFixed(2)}% rate` : undefined} />
        <StatCard label="Sent (24h)"        value={loading ? 0 : Math.round(totalSent24h)} color="blue" icon={<Gauge size={18} />} ratio={totalMax24h > 0 ? `of ${totalMax24h.toLocaleString()} limit` : undefined} />
      </div>

      {error && (
        <div className="rounded-xl border p-5 mb-4" style={{ background: "rgba(239,68,68,0.05)", borderColor: "rgba(239,68,68,0.2)" }}>
          <p className="text-[14px] font-semibold mb-1" style={{ color: "#ef4444" }}>Failed to load SES data</p>
          <p className="text-[12px] font-mono mb-2 opacity-80" style={{ color: "#ef4444" }}>{error}</p>
          <button onClick={() => load()} className="text-[13px] underline" style={{ color: "var(--text-secondary)" }}>Try again</button>
        </div>
      )}

      <div className="mb-4 border-b" style={{ borderColor: "var(--border)" }}>
        <nav className="flex items-center -mb-px">
          {(["identities", "sending-limits", "account-stats"] as ActiveTab[]).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={tabCls(tab)} style={{ color: activeTab === tab ? "var(--brand)" : "var(--text-secondary)" }}>
              {tab === "identities" ? "Identities" : tab === "sending-limits" ? "Sending Limits" : "Account Stats"}
              {!loading && <span className="ml-1.5 text-[11px]" style={{ color: "var(--text-tertiary)" }}>({tab === "identities" ? identities.length : tab === "sending-limits" ? quotas.length : accountStats.length})</span>}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "identities" && !error && (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-tertiary)" }} />
              <input type="text" placeholder="Search identities…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-8 pr-3 py-1.5 rounded-lg text-[13px] focus:outline-none" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", width: 200 }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")} />
            </div>
            <DropdownChip label="Profile" allItems={allProfiles} selectedItems={selProfiles} onChange={(v) => { setSelProfiles(v); setPage(1); }}
              renderItem={(name) => <span className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--text-primary)" }}><span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: profileColorMap[name] ?? "#6366f1" }} />{name}</span>} />
            <DropdownChip label="Region" allItems={allRegions} selectedItems={selRegions} onChange={(v) => { setSelRegions(v); setPage(1); }} />
            <DropdownChip label="Type" allItems={allTypes} selectedItems={selTypes} onChange={(v) => { setSelTypes(v); setPage(1); }} />
            <DropdownChip label="Verification" allItems={allStatuses} selectedItems={selStatuses} onChange={(v) => { setSelStatuses(v); setPage(1); }} />
            {hasActiveFilters && <button onClick={handleClearAll} className="flex items-center gap-1 text-[12px]" style={{ color: "var(--text-tertiary)" }}><X size={12} />Clear</button>}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>{filtered.length} of {identities.length} identities</span>
              {identities.length > 0 && <Pagination total={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />}
            </div>
          </div>
          <IdentitiesTable identities={filtered} loading={loading} onClearFilters={handleClearAll} hasActiveFilters={hasActiveFilters} page={page} pageSize={pageSize} onRowClick={setSelectedIdentity} />
        </>
      )}

      {activeTab === "sending-limits" && !error && <SendingLimitsTable quotas={quotas} loading={loading} />}

      {activeTab === "account-stats" && !error && (
        <div className="space-y-3">
          <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>Bounce and complaint counts cover the last ~14 days. Sandbox accounts are limited to 200 emails/day.</p>
          <AccountStatsTable stats={accountStats} loading={loading} />
        </div>
      )}
    </div>
  );
}
