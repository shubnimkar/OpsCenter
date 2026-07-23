"use client";

import { useState, useCallback, useMemo } from "react";
import { RefreshCw, Shield, ShieldAlert, ShieldOff, ShieldCheck, ChevronUp, ChevronDown, ChevronsUpDown, Copy, Check, Plus, Pencil, Trash2, RotateCcw } from "lucide-react";
import { fetchSSLCertificates, createSSLCertificate, updateSSLCertificate, deleteSSLCertificate, refreshSSLCertificate } from "@/lib/api";
import { useResourceLoad } from "@/lib/useInitialFetch";
import { FilterToolbar, useFilterState, applyFilters } from "./filters";
import type { FilterConfig } from "./filters";
import { SSLCertificate, SSLStatus } from "@/lib/types";
import StatCard from "./StatCard";
import SkeletonRow from "./SkeletonRow";
import Pagination, { PageSize } from "./Pagination";
import SlideOverDrawer from "./SlideOverDrawer";

function formatDate(iso: string | null): string { if (!iso) return "—"; return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
function formatDateTime(iso: string | null): string { if (!iso) return "—"; return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }

const STATUS_META: Record<SSLStatus, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  valid:         { label: "Valid",         bg: "rgba(16,185,129,0.1)",  text: "#10b981", icon: <ShieldCheck size={11} /> },
  expiring_soon: { label: "Expiring Soon", bg: "rgba(245,158,11,0.1)", text: "#f59e0b", icon: <ShieldAlert size={11} /> },
  expired:       { label: "Expired",       bg: "rgba(239,68,68,0.1)",  text: "#ef4444", icon: <ShieldOff size={11} /> },
  error:         { label: "Error",         bg: "var(--bg-subtle)",      text: "var(--text-tertiary)", icon: <ShieldOff size={11} /> },
  unknown:       { label: "Unknown",       bg: "var(--bg-subtle)",      text: "var(--text-tertiary)", icon: <Shield size={11} /> },
};

function StatusBadge({ status }: { status: SSLStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.unknown;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: m.bg, color: m.text }}>{m.icon}{m.label}</span>;
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

const inputCls = "w-full px-3 py-2 text-[13px] rounded-lg focus:outline-none transition-colors duration-150";
const labelCls = "block text-[12px] font-medium mb-1.5";

interface DomainFormProps { initial?: SSLCertificate | null; onSave: (data: Partial<SSLCertificate>) => Promise<void>; onCancel: () => void; saving: boolean; error: string | null; }
function DomainForm({ initial, onSave, onCancel, saving, error }: DomainFormProps) {
  const [domainName, setDomainName] = useState(initial?.domain_name ?? "");
  const [port, setPort] = useState(String(initial?.port ?? 443));
  const [environment, setEnv] = useState(initial?.environment ?? "production");
  const [owner, setOwner] = useState(initial?.owner ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); await onSave({ domain_name: domainName.trim(), port: parseInt(port, 10) || 443, environment: environment as SSLCertificate["environment"], owner: owner.trim(), notes: notes.trim() }); };
  const fieldStyle = { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" };
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Domain Name <span className="text-red-500">*</span></label>
        <input type="text" placeholder="example.com" value={domainName} onChange={(e) => setDomainName(e.target.value)} required className={inputCls} style={fieldStyle} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")} />
      </div>
      <div>
        <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Port</label>
        <input type="number" min={1} max={65535} value={port} onChange={(e) => setPort(e.target.value)} className={inputCls} style={fieldStyle} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")} />
      </div>
      <div>
        <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Environment</label>
        <select value={environment} onChange={(e) => setEnv(e.target.value as "production" | "uat" | "development")} className={inputCls} style={{ ...fieldStyle, cursor: "pointer" }}>
          <option value="production">Production</option><option value="uat">UAT</option><option value="development">Development</option>
        </select>
      </div>
      <div>
        <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Owner / Team</label>
        <input type="text" placeholder="e.g. Platform team" value={owner} onChange={(e) => setOwner(e.target.value)} className={inputCls} style={fieldStyle} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")} />
      </div>
      <div>
        <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Notes</label>
        <textarea rows={3} placeholder="Optional notes…" value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} resize-none`} style={fieldStyle} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")} />
      </div>
      {error && <p className="text-[12px] text-red-500">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving || !domainName.trim()} className="flex-1 py-2 rounded-lg text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors">{saving ? "Saving…" : initial ? "Save Changes" : "Add Domain"}</button>
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-[13px] font-medium transition-colors" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Cancel</button>
      </div>
    </form>
  );
}

// ── Detail Drawer ──────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <span className="text-[13px] break-all" style={{ color: "var(--text-primary)" }}>{value || "—"}</span>
    </div>
  );
}

function SSLDetailDrawer({ cert, onClose }: { cert: SSLCertificate | null; onClose: () => void }) {
  if (!cert) return <SlideOverDrawer isOpen={false} onClose={onClose} title="">{null}</SlideOverDrawer>;
  const daysLeft = cert.days_remaining;
  const daysColor = daysLeft === null ? "var(--text-tertiary)" : daysLeft < 0 ? "#ef4444" : daysLeft <= 14 ? "#ef4444" : daysLeft <= 30 ? "#f97316" : daysLeft <= 60 ? "#f59e0b" : "#10b981";
  return (
    <SlideOverDrawer isOpen={true} onClose={onClose} title={cert.domain_name}>
      <div className="mb-4"><StatusBadge status={cert.status} /></div>

      {/* Days remaining — visual focal point */}
      {daysLeft !== null && (
        <div className="rounded-xl p-4 mb-4 text-center" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>Days Remaining</p>
          <p className="text-[40px] font-bold tabular-nums leading-none" style={{ color: daysColor }}>{daysLeft}</p>
          <p className="text-[12px] mt-1" style={{ color: "var(--text-tertiary)" }}>
            {daysLeft < 0 ? "Expired" : daysLeft <= 14 ? "Critical — renew immediately" : daysLeft <= 30 ? "Expiring soon" : daysLeft <= 60 ? "Plan renewal" : "Valid"}
          </p>
        </div>
      )}

      <DetailRow label="Domain" value={cert.domain_name} />
      <DetailRow label="Port" value={cert.port} />
      <DetailRow label="Environment" value={cert.environment} />
      <DetailRow label="Owner / Team" value={cert.owner} />
      <DetailRow label="Issuer" value={cert.issuer} />
      <DetailRow label="Valid From" value={formatDateTime(cert.valid_from)} />
      <DetailRow label="Expires" value={formatDateTime(cert.expiry_date)} />
      <DetailRow label="Key Algorithm" value={cert.key_algorithm ? <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>{cert.key_algorithm}</span> : "—"} />
      <DetailRow label={`SANs${cert.san_list?.length ? ` (${cert.san_list.length})` : ""}`} value={cert.san_list?.length ? (
        <div className="flex flex-wrap gap-1 mt-1">
          {cert.san_list.map((san) => <span key={san} className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono" style={{ background: "rgba(37,99,235,0.08)", color: "var(--brand)" }}>{san}</span>)}
        </div>
      ) : "—"} />
      <DetailRow label="Last Checked" value={formatDateTime(cert.last_checked)} />
      <DetailRow label="Notes" value={cert.notes} />
      <DetailRow label="Added" value={formatDateTime(cert.created_at)} />
    </SlideOverDrawer>
  );
}

// ── Delete Modal ───────────────────────────────────────────────────────────

function DeleteModal({ cert, onConfirm, onCancel, deleting }: { cert: SSLCertificate; onConfirm: () => void; onCancel: () => void; deleting: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/45" onClick={onCancel} aria-hidden="true" />
      <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-sm mx-4 rounded-2xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
        <h3 className="text-[14px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Remove domain?</h3>
        <p className="text-[13px] mb-5" style={{ color: "var(--text-secondary)" }}><span className="font-mono">{cert.domain_name}</span> will be removed. This cannot be undone.</p>
        <div className="flex gap-2">
          <button onClick={onConfirm} disabled={deleting} className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[13px] font-medium disabled:opacity-50 transition-colors">{deleting ? "Removing…" : "Remove"}</button>
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-[13px] font-medium transition-colors" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── SSL Table ──────────────────────────────────────────────────────────────

type SortKey = "domain_name" | "status" | "expiry_date" | "days_remaining" | "environment" | "last_checked";
type SortDir = "asc" | "desc";
const ENV_COLORS: Record<string, { bg: string; text: string }> = {
  production:  { bg: "rgba(37,99,235,0.1)",   text: "var(--brand)" },
  uat:         { bg: "rgba(139,92,246,0.1)",  text: "#8b5cf6" },
  development: { bg: "var(--bg-subtle)",       text: "var(--text-tertiary)" },
};

function SSLTable({ certs, loading, hasActiveFilters, onClearFilters, page, pageSize, refreshingId, onView, onEdit, onDelete, onRefresh }: {
  certs: SSLCertificate[]; loading: boolean; hasActiveFilters: boolean; onClearFilters: () => void;
  page: number; pageSize: PageSize; refreshingId: number | null;
  onView: (c: SSLCertificate) => void; onEdit: (c: SSLCertificate) => void; onDelete: (c: SSLCertificate) => void; onRefresh: (c: SSLCertificate) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("domain_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const hs = (k: SortKey) => { if (k === sortKey) setSortDir((d) => d === "asc" ? "desc" : "asc"); else { setSortKey(k); setSortDir("asc"); } };
  const sorted = [...certs].sort((a, b) => { const cmp = String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? "")); return sortDir === "asc" ? cmp : -cmp; });
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);
  const SI = ({ col }: { col: SortKey }) => col !== sortKey ? <ChevronsUpDown size={12} style={{ color: "var(--text-tertiary)" }} /> : sortDir === "asc" ? <ChevronUp size={12} style={{ color: "var(--brand)" }} /> : <ChevronDown size={12} style={{ color: "var(--brand)" }} />;
  const COLS: { key: SortKey; label: string }[] = [
    { key: "domain_name", label: "Domain" }, { key: "status", label: "Status" },
    { key: "expiry_date", label: "Expires" }, { key: "days_remaining", label: "Days Left" },
    { key: "environment", label: "Env" }, { key: "last_checked", label: "Last Checked" },
  ];

  if (!loading && certs.length === 0) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 rounded-xl border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "var(--bg-subtle)" }}>
        <Shield size={22} style={{ color: "var(--text-tertiary)" }} />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{hasActiveFilters ? "No domains match" : "No domains tracked yet"}</p>
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{hasActiveFilters ? "Try adjusting your filters." : 'Click "Add New" to start monitoring an SSL certificate.'}</p>
      </div>
      {hasActiveFilters && <button onClick={onClearFilters} className="px-4 py-1.5 rounded-lg text-[13px]" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>Clear filters</button>}
    </div>
  );

  return (
    <div className="rounded-xl overflow-hidden border" style={{ background: "var(--bg-card)", borderColor: "var(--border)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b" style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}>
              {COLS.map((col) => (
                <th key={col.key} onClick={() => hs(col.key)} className="px-4 py-3 text-left select-none cursor-pointer whitespace-nowrap">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: sortKey === col.key ? "var(--brand)" : "var(--text-tertiary)" }}>
                    {col.label}<SI col={col.key} />
                  </span>
                </th>
              ))}
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-left" style={{ color: "var(--text-tertiary)" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={7} />) : paginated.map((cert) => {
              const daysLeft = cert.days_remaining;
              const daysColor = daysLeft === null ? "var(--text-tertiary)" : daysLeft < 0 ? "#ef4444" : daysLeft <= 14 ? "#ef4444" : daysLeft <= 30 ? "#f97316" : daysLeft <= 60 ? "#f59e0b" : "#10b981";
              const envC = ENV_COLORS[cert.environment] ?? ENV_COLORS.development;
              return (
                <tr key={cert.id} onClick={() => onView(cert)} className="group/row border-b table-row-hover cursor-pointer"
                  style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-card)")}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center font-mono text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                      {cert.domain_name}{cert.port !== 443 && <span style={{ color: "var(--text-tertiary)" }}>:{cert.port}</span>}
                      <CopyButton text={cert.domain_name} />
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={cert.status} /></td>
                  <td className="px-4 py-3 whitespace-nowrap text-[13px]" style={{ color: "var(--text-secondary)" }}>{formatDate(cert.expiry_date)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-[14px] font-bold tabular-nums" style={{ color: daysColor }}>{daysLeft !== null ? `${daysLeft}d` : "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: envC.bg, color: envC.text }}>{cert.environment}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[13px]" style={{ color: "var(--text-tertiary)" }}>{formatDate(cert.last_checked)}</td>
                  <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => onRefresh(cert)} disabled={refreshingId === cert.id} title="Refresh" className="p-1.5 rounded-md transition-all duration-150 disabled:opacity-40" style={{ color: "var(--text-tertiary)" }} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--brand)"; (e.currentTarget as HTMLElement).style.background = "rgba(37,99,235,0.08)"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                        <RotateCcw size={13} className={refreshingId === cert.id ? "animate-spin" : ""} />
                      </button>
                      <button onClick={() => onEdit(cert)} title="Edit" className="p-1.5 rounded-md transition-all duration-150" style={{ color: "var(--text-tertiary)" }} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => onDelete(cert)} title="Delete" className="p-1.5 rounded-md transition-all duration-150" style={{ color: "var(--text-tertiary)" }} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#ef4444"; (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.08)"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
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

// ── Main ────────────────────────────────────────────────────────────────────

export default function SSLDashboard() {
  const [certs, setCerts] = useState<SSLCertificate[]>([]);
  const { loading, error, lastUpdated, load } = useResourceLoad({ fetcher: fetchSSLCertificates, onData: setCerts });

  const [viewCert, setViewCert]         = useState<SSLCertificate | null>(null);
  const [editCert, setEditCert]         = useState<SSLCertificate | null>(null);
  const [addOpen, setAddOpen]           = useState(false);
  const [addKey, setAddKey]             = useState(0);
  const [deleteCert, setDeleteCert]     = useState<SSLCertificate | null>(null);
  const [formError, setFormError]       = useState<string | null>(null);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);

  const { filterState, setFilter, clearFilters, search, setSearch, debouncedSearch, hasActiveFilters } =
    useFilterState({ onFilterChange: () => setPage(1) });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);

  const STATUS_OPTIONS = useMemo(() => ["valid", "expiring_soon", "expired", "error", "unknown"] as SSLStatus[], []);
  const filterStatus: SSLStatus | "all" = filterState.status?.length === 1 ? (filterState.status[0] as SSLStatus) : "all";

  const total        = certs.length;
  const validCount   = certs.filter((c) => c.status === "valid").length;
  const expiringSoon = certs.filter((c) => c.status === "expiring_soon").length;
  const expiredCount = certs.filter((c) => c.status === "expired").length;

  const allOptionsByKey = useMemo(() => ({ status: STATUS_OPTIONS as string[] }), [STATUS_OPTIONS]);
  const filterConfigs: FilterConfig[] = useMemo(() => [{
    key: "status", label: "Status", type: "multi-select" as const,
    options: STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_META[s].label })),
  }], [STATUS_OPTIONS]);

  const filtered = useMemo(() => applyFilters(
    certs, filterState, debouncedSearch,
    (c, key) => (key === "status" ? c.status : ""),
    (c) => [c.domain_name, c.owner, c.environment, c.notes],
  ), [certs, filterState, debouncedSearch]);

  const hasFilters = hasActiveFilters(allOptionsByKey);
  const handleClearAll = () => { clearFilters(); setPage(1); };
  const toggleStatus = (status: SSLStatus) => { setFilter("status", filterStatus === status ? [] : [status]); setPage(1); };

  const handleAdd = async (data: Partial<SSLCertificate>) => {
    setSaving(true); setFormError(null);
    try {
      const created = await createSSLCertificate({ domain_name: data.domain_name!, port: data.port, environment: data.environment, owner: data.owner, notes: data.notes });
      setCerts((prev) => [...prev, created].sort((a, b) => a.domain_name.localeCompare(b.domain_name)));
      setAddOpen(false);
    } catch (e: unknown) { setFormError(e instanceof Error ? e.message : "Failed to add domain"); }
    finally { setSaving(false); }
  };

  const handleEdit = async (data: Partial<SSLCertificate>) => {
    if (!editCert) return;
    setSaving(true); setFormError(null);
    try {
      const updated = await updateSSLCertificate(editCert.id, { domain_name: data.domain_name, port: data.port, environment: data.environment, owner: data.owner, notes: data.notes });
      setCerts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEditCert(null);
    } catch (e: unknown) { setFormError(e instanceof Error ? e.message : "Failed to update domain"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteCert) return;
    setDeleting(true);
    try { await deleteSSLCertificate(deleteCert.id); setCerts((prev) => prev.filter((c) => c.id !== deleteCert.id)); setDeleteCert(null); }
    catch (e: unknown) { setFormError(e instanceof Error ? e.message : "Failed to delete"); }
    finally { setDeleting(false); }
  };

  const handleRefresh = async (cert: SSLCertificate) => {
    setRefreshingId(cert.id);
    try {
      await refreshSSLCertificate(cert.id);
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const fresh = await fetchSSLCertificates(); setCerts(fresh);
        if (fresh.find((c) => c.id === cert.id)?.last_checked !== cert.last_checked) break;
      }
    } catch { /* best-effort */ }
    finally { setRefreshingId(null); }
  };

  return (
    <div className="p-6 min-h-full" style={{ background: "var(--bg-page)" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>SSL Certificates</h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{lastUpdated ? `Updated at ${lastUpdated.toLocaleTimeString()}` : "Loading…"}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load()} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors disabled:opacity-50" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />Refresh
          </button>
          <button onClick={() => { setFormError(null); setAddKey((k) => k + 1); setAddOpen(true); }} className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors">
            <Plus size={14} />Add New
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Domains" value={loading ? 0 : total}        color="blue"   icon={<Shield size={18} />} onClick={() => { clearFilters(); setPage(1); }} isActive={filterStatus === "all"} />
        <StatCard label="Valid"         value={loading ? 0 : validCount}   color="green"  icon={<ShieldCheck size={18} />} onClick={() => toggleStatus("valid")} isActive={filterStatus === "valid"} />
        <StatCard label="Expiring Soon" value={loading ? 0 : expiringSoon} color="amber"  icon={<ShieldAlert size={18} />} onClick={() => toggleStatus("expiring_soon")} isActive={filterStatus === "expiring_soon"} />
        <StatCard label="Expired"       value={loading ? 0 : expiredCount} color="red"    icon={<ShieldOff size={18} />} onClick={() => toggleStatus("expired")} isActive={filterStatus === "expired"} />
      </div>

      <div className="mb-4">
        <FilterToolbar filters={filterConfigs} filterState={filterState} onFilterChange={(key, values) => { setFilter(key, values); setPage(1); }}
          searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search domains…"
          hasActiveFilters={hasFilters} onClearAll={handleClearAll}
          resultCount={filtered.length} totalCount={total} resultLabel="domains"
          paginationSlot={total > 0 ? <Pagination total={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} /> : undefined} />
      </div>

      {error ? (
        <div className="rounded-xl border p-6" style={{ background: "rgba(239,68,68,0.05)", borderColor: "rgba(239,68,68,0.2)" }}>
          <p className="text-[14px] font-semibold mb-1" style={{ color: "#ef4444" }}>Failed to load SSL certificates</p>
          <p className="text-[13px] font-mono mb-3 opacity-80" style={{ color: "#ef4444" }}>{error}</p>
          <button onClick={() => load()} className="text-[13px] underline" style={{ color: "var(--text-secondary)" }}>Try again</button>
        </div>
      ) : (
        <SSLTable certs={filtered} loading={loading} hasActiveFilters={hasFilters} onClearFilters={handleClearAll}
          page={page} pageSize={pageSize} refreshingId={refreshingId}
          onView={setViewCert} onEdit={(c) => { setFormError(null); setEditCert(c); }} onDelete={setDeleteCert} onRefresh={handleRefresh} />
      )}

      <SlideOverDrawer isOpen={addOpen} onClose={() => setAddOpen(false)} title="Add Domain">
        <DomainForm key={addKey} onSave={handleAdd} onCancel={() => setAddOpen(false)} saving={saving} error={formError} />
      </SlideOverDrawer>
      <SlideOverDrawer isOpen={!!editCert} onClose={() => setEditCert(null)} title={editCert ? `Edit — ${editCert.domain_name}` : "Edit Domain"}>
        <DomainForm key={editCert?.id ?? "edit"} initial={editCert} onSave={handleEdit} onCancel={() => setEditCert(null)} saving={saving} error={formError} />
      </SlideOverDrawer>
      {viewCert && <SSLDetailDrawer cert={viewCert} onClose={() => setViewCert(null)} />}
      {deleteCert && <DeleteModal cert={deleteCert} onConfirm={handleDelete} onCancel={() => setDeleteCert(null)} deleting={deleting} />}
    </div>
  );
}
