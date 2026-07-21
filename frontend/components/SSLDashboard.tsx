"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import {
  RefreshCw, Shield, ShieldAlert, ShieldOff, ShieldCheck,
  Search, ChevronDown, ChevronUp, ChevronsUpDown,
  Copy, Check, X, Plus, Pencil, Trash2, RotateCcw,
} from "lucide-react";
import {
  fetchSSLCertificates,
  createSSLCertificate,
  updateSSLCertificate,
  deleteSSLCertificate,
  refreshSSLCertificate,
} from "@/lib/api";
import { useResourceLoad } from "@/lib/useInitialFetch";
import { FilterToolbar, useFilterState, applyFilters } from "./filters";
import type { FilterConfig } from "./filters";
import { SSLCertificate, SSLStatus } from "@/lib/types";
import StatCard from "./StatCard";
import SkeletonRow from "./SkeletonRow";
import Pagination, { PageSize } from "./Pagination";
import SlideOverDrawer from "./SlideOverDrawer";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Status badge ───────────────────────────────────────────────────────────

const STATUS_META: Record<SSLStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  valid: {
    label: "Valid",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
    icon: <ShieldCheck size={12} />,
  },
  expiring_soon: {
    label: "Expiring Soon",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
    icon: <ShieldAlert size={12} />,
  },
  expired: {
    label: "Expired",
    cls: "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400",
    icon: <ShieldOff size={12} />,
  },
  error: {
    label: "Error",
    cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
    icon: <ShieldOff size={12} />,
  },
  unknown: {
    label: "Unknown",
    cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
    icon: <Shield size={12} />,
  },
};

function StatusBadge({ status }: { status: SSLStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.unknown;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${m.cls}`}>
      {m.icon}
      {m.label}
    </span>
  );
}

// ── CopyButton ─────────────────────────────────────────────────────────────

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

// ── Add / Edit Domain Form ─────────────────────────────────────────────────

interface DomainFormProps {
  initial?: SSLCertificate | null;
  onSave: (data: Partial<SSLCertificate>) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}

function DomainForm({ initial, onSave, onCancel, saving, error }: DomainFormProps) {
  const [domainName, setDomainName] = useState(initial?.domain_name ?? "");
  const [port, setPort]             = useState(String(initial?.port ?? 443));
  const [environment, setEnv]       = useState(initial?.environment ?? "production");
  const [owner, setOwner]           = useState(initial?.owner ?? "");
  const [notes, setNotes]           = useState(initial?.notes ?? "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      domain_name:  domainName.trim(),
      port:         parseInt(port, 10) || 443,
      environment:  environment as SSLCertificate["environment"],
      owner:        owner.trim(),
      notes:        notes.trim(),
    });
  };

  const inputCls =
    "w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-400 transition-colors dark:border-[#2a2d3a] dark:bg-[#1c1f2e] dark:text-slate-200 dark:placeholder-slate-500";
  const labelCls = "block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className={labelCls}>Domain Name <span className="text-red-500">*</span></label>
        <input
          type="text"
          placeholder="example.com"
          value={domainName}
          onChange={(e) => setDomainName(e.target.value)}
          required
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Port</label>
        <input
          type="number"
          min={1}
          max={65535}
          value={port}
          onChange={(e) => setPort(e.target.value)}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Environment</label>
        <select
          value={environment}
          onChange={(e) => setEnv(e.target.value as "production" | "uat" | "development")}
          className={inputCls}
        >
          <option value="production">Production</option>
          <option value="uat">UAT</option>
          <option value="development">Development</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Owner / Team</label>
        <input
          type="text"
          placeholder="e.g. Platform team"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Notes</label>
        <textarea
          rows={3}
          placeholder="Optional notes…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={`${inputCls} resize-none`}
        />
      </div>

      {error && (
        <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving || !domainName.trim()}
          className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : initial ? "Save Changes" : "Add Domain"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-300 dark:hover:bg-white/5"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── SSL Detail Drawer ──────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 border-b border-slate-100 dark:border-[#2a2d3a] last:border-0">
      <span className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</span>
      <span className="text-sm text-slate-800 dark:text-slate-200 break-all">{value || "—"}</span>
    </div>
  );
}

function SSLDetailDrawer({
  cert,
  onClose,
}: {
  cert: SSLCertificate | null;
  onClose: () => void;
}) {
  return (
    <SlideOverDrawer
      isOpen={!!cert}
      onClose={onClose}
      title={cert?.domain_name ?? ""}
    >
      {cert && (
        <div className="flex flex-col gap-0">
          <div className="mb-4">
            <StatusBadge status={cert.status} />
          </div>
          <DetailRow label="Domain" value={cert.domain_name} />
          <DetailRow label="Port" value={cert.port} />
          <DetailRow label="Environment" value={cert.environment} />
          <DetailRow label="Owner / Team" value={cert.owner} />
          <DetailRow label="Status" value={<StatusBadge status={cert.status} />} />
          <DetailRow
            label="Days Remaining"
            value={
              cert.days_remaining !== null
                ? `${cert.days_remaining} day${cert.days_remaining !== 1 ? "s" : ""}`
                : "—"
            }
          />
          <DetailRow label="Issuer" value={cert.issuer} />
          <DetailRow label="Valid From" value={formatDateTime(cert.valid_from)} />
          <DetailRow label="Expires" value={formatDateTime(cert.expiry_date)} />
          <DetailRow
            label="Key Algorithm"
            value={
              cert.key_algorithm ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {cert.key_algorithm}
                </span>
              ) : "—"
            }
          />
          <DetailRow
            label={`Subject Alternative Names${cert.san_list?.length ? ` (${cert.san_list.length})` : ""}`}
            value={
              cert.san_list?.length ? (
                <div className="flex flex-wrap gap-1 mt-1">
                  {cert.san_list.map((san) => (
                    <span
                      key={san}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
                    >
                      {san}
                    </span>
                  ))}
                </div>
              ) : "—"
            }
          />
          <DetailRow label="Last Checked" value={formatDateTime(cert.last_checked)} />
          <DetailRow label="Notes" value={cert.notes} />
          <DetailRow label="Added" value={formatDateTime(cert.created_at)} />
        </div>
      )}
    </SlideOverDrawer>
  );
}

// ── SSL Table ──────────────────────────────────────────────────────────────

type SortKey = "domain_name" | "status" | "expiry_date" | "days_remaining" | "environment" | "last_checked";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "domain_name",   label: "Domain" },
  { key: "status",        label: "Status" },
  { key: "expiry_date",   label: "Expires" },
  { key: "days_remaining",label: "Days Left" },
  { key: "environment",   label: "Env" },
  { key: "last_checked",  label: "Last Checked" },
];

function SSLTable({
  certs,
  loading,
  hasActiveFilters,
  onClearFilters,
  page,
  pageSize,
  refreshingId,
  onView,
  onEdit,
  onDelete,
  onRefresh,
}: {
  certs: SSLCertificate[];
  loading: boolean;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  page: number;
  pageSize: PageSize;
  refreshingId: number | null;
  onView: (cert: SSLCertificate) => void;
  onEdit: (cert: SSLCertificate) => void;
  onDelete: (cert: SSLCertificate) => void;
  onRefresh: (cert: SSLCertificate) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("domain_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = [...certs].sort((a, b) => {
    const av = a[sortKey] ?? "";
    const bv = b[sortKey] ?? "";
    const cmp = String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (col !== sortKey) return <ChevronsUpDown size={13} className="text-slate-300 dark:text-slate-600" />;
    return sortDir === "asc"
      ? <ChevronUp size={13} className="text-blue-500" />
      : <ChevronDown size={13} className="text-blue-500" />;
  };

  if (!loading && certs.length === 0) {
    if (hasActiveFilters) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <p className="text-lg font-medium text-slate-600 dark:text-slate-300">No domains match the current filters.</p>
          <button
            onClick={onClearFilters}
            className="mt-3 px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-[#2a2d3a] dark:hover:bg-[#33374a] dark:text-slate-300 transition-colors"
          >
            Clear filters
          </button>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Shield size={40} className="mb-3 opacity-30" />
        <p className="text-lg font-medium">No domains tracked yet</p>
        <p className="text-xs mt-1">Click "Add New" to start monitoring an SSL certificate</p>
      </div>
    );
  }

  const ENV_COLORS: Record<string, string> = {
    production: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
    uat:        "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
    development:"bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  };

  return (
    <div className="rounded-xl border border-slate-200 shadow-sm dark:border-[#2a2d3a] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-[#2a2d3a] dark:bg-[#161825]">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-slate-600 select-none whitespace-nowrap dark:text-slate-500 dark:hover:text-slate-300"
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <SortIcon col={col.key} />
                  </span>
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#2a2d3a]">
            {loading
              ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={7} />)
              : paginated.map((cert) => {
                  const isRefreshing = refreshingId === cert.id;
                  const daysLeft = cert.days_remaining;
                  const daysColor =
                    daysLeft === null ? "text-slate-400"
                    : daysLeft < 0    ? "text-red-500 dark:text-red-400 font-semibold"
                    : daysLeft <= 30  ? "text-amber-600 dark:text-amber-400 font-semibold"
                    : "text-emerald-600 dark:text-emerald-400";

                  return (
                    <tr
                      key={cert.id}
                      onClick={() => onView(cert)}
                      className="group bg-white hover:bg-slate-50 transition-colors dark:bg-[#1c1f2e] dark:hover:bg-[#222538] cursor-pointer"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap dark:text-slate-200">
                        <span className="inline-flex items-center">
                          {cert.domain_name}
                          {cert.port !== 443 && (
                            <span className="ml-1 text-slate-400">:{cert.port}</span>
                          )}
                          <CopyButton text={cert.domain_name} />
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={cert.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDate(cert.expiry_date)}
                      </td>
                      <td className={`px-4 py-3 text-xs whitespace-nowrap ${daysColor}`}>
                        {daysLeft !== null ? `${daysLeft}d` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ENV_COLORS[cert.environment] ?? ""}`}>
                          {cert.environment}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDate(cert.last_checked)}
                      </td>
                      <td className="px-4 py-3">
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => onRefresh(cert)}
                            disabled={isRefreshing}
                            title="Refresh"
                            className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-950/30 transition-colors disabled:opacity-40"
                          >
                            <RotateCcw size={13} className={isRefreshing ? "animate-spin" : ""} />
                          </button>
                          <button
                            onClick={() => onEdit(cert)}
                            title="Edit"
                            className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-white/5 transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => onDelete(cert)}
                            title="Delete"
                            className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/30 transition-colors"
                          >
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

// ── Delete Confirm Modal ───────────────────────────────────────────────────

function DeleteModal({
  cert,
  onConfirm,
  onCancel,
  deleting,
}: {
  cert: SSLCertificate;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-sm mx-4 rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-[#2a2d3a] dark:bg-[#161825] p-6"
      >
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
          Remove domain?
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
          <span className="font-mono">{cert.domain_name}</span> will be removed from monitoring. This cannot be undone.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {deleting ? "Removing…" : "Remove"}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-300 dark:hover:bg-white/5"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SSLDashboard ───────────────────────────────────────────────────────────

export default function SSLDashboard() {
  const [certs, setCerts] = useState<SSLCertificate[]>([]);

  const { loading, error, lastUpdated, load } = useResourceLoad({
    fetcher: fetchSSLCertificates,
    onData: setCerts,
  });

  // Drawer / modal state
  const [viewCert, setViewCert]         = useState<SSLCertificate | null>(null);
  const [editCert, setEditCert]         = useState<SSLCertificate | null>(null);
  const [addOpen, setAddOpen]           = useState(false);
  const [addKey, setAddKey]             = useState(0);
  const [deleteCert, setDeleteCert]     = useState<SSLCertificate | null>(null);
  const [formError, setFormError]       = useState<string | null>(null);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);

  const {
    filterState,
    setFilter,
    clearFilters,
    search,
    setSearch,
    debouncedSearch,
    hasActiveFilters,
  } = useFilterState({ onFilterChange: () => setPage(1) });

  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);

  const STATUS_OPTIONS = useMemo(
    () => ["valid", "expiring_soon", "expired", "error", "unknown"] as SSLStatus[],
    [],
  );

  const filterStatus: SSLStatus | "all" =
    filterState.status?.length === 1 ? (filterState.status[0] as SSLStatus) : "all";

  // ── Derived stats ────────────────────────────────────────────────────────

  const total        = certs.length;
  const validCount   = certs.filter((c) => c.status === "valid").length;
  const expiringSoon = certs.filter((c) => c.status === "expiring_soon").length;
  const expiredCount = certs.filter((c) => c.status === "expired").length;

  const allOptionsByKey = useMemo(() => ({ status: STATUS_OPTIONS as string[] }), [STATUS_OPTIONS]);

  const filterConfigs: FilterConfig[] = useMemo(
    () => [{
      key: "status",
      label: "Status",
      type: "multi-select",
      options: STATUS_OPTIONS.map((s) => ({
        value: s,
        label: STATUS_META[s].label,
      })),
    }],
    [STATUS_OPTIONS],
  );

  const filtered = useMemo(
    () =>
      applyFilters(
        certs,
        filterState,
        debouncedSearch,
        (c, key) => (key === "status" ? c.status : ""),
        (c) => [c.domain_name, c.owner, c.environment, c.notes],
      ),
    [certs, filterState, debouncedSearch],
  );

  const hasFilters = hasActiveFilters(allOptionsByKey);

  const handleClearAll = () => {
    clearFilters();
    setPage(1);
  };

  const toggleStatusFilter = (status: SSLStatus) => {
    const next = filterStatus === status ? "all" : status;
    setFilter("status", next === "all" ? [] : [next]);
    setPage(1);
  };

  // ── CRUD handlers ─────────────────────────────────────────────────────────

  const handleAdd = async (data: Partial<SSLCertificate>) => {
    setSaving(true);
    setFormError(null);
    try {
      const created = await createSSLCertificate({
        domain_name:  data.domain_name!,
        port:         data.port,
        environment:  data.environment,
        owner:        data.owner,
        notes:        data.notes,
      });
      setCerts((prev) => [...prev, created].sort((a, b) => a.domain_name.localeCompare(b.domain_name)));
      setAddOpen(false);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to add domain");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (data: Partial<SSLCertificate>) => {
    if (!editCert) return;
    setSaving(true);
    setFormError(null);
    try {
      const updated = await updateSSLCertificate(editCert.id, {
        domain_name:  data.domain_name,
        port:         data.port,
        environment:  data.environment,
        owner:        data.owner,
        notes:        data.notes,
      });
      setCerts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEditCert(null);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to update domain");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteCert) return;
    setDeleting(true);
    try {
      await deleteSSLCertificate(deleteCert.id);
      setCerts((prev) => prev.filter((c) => c.id !== deleteCert.id));
      setDeleteCert(null);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to delete domain");
    } finally {
      setDeleting(false);
    }
  };

  const handleRefresh = async (cert: SSLCertificate) => {
    setRefreshingId(cert.id);
    try {
      await refreshSSLCertificate(cert.id);
      // Poll until status is updated (up to 15 s)
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const fresh = await fetchSSLCertificates();
        setCerts(fresh);
        const updated = fresh.find((c) => c.id === cert.id);
        if (updated?.last_checked !== cert.last_checked) break;
      }
    } catch {
      // best-effort
    } finally {
      setRefreshingId(null);
    }
  };

  return (
    <div className="p-6 overflow-auto bg-slate-100 dark:bg-[#0f1117] min-h-full">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">SSL Certificates</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {lastUpdated && `Updated at ${lastUpdated.toLocaleTimeString()}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-300 dark:hover:bg-white/5"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            onClick={() => { setFormError(null); setAddKey((k) => k + 1); setAddOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            <Plus size={14} />
            Add New
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Domains"
          value={loading ? 0 : total}
          color="blue"
          icon={<Shield size={20} />}
          onClick={() => { clearFilters(); setPage(1); }}
          isActive={filterStatus === "all"}
        />
        <StatCard
          label="Valid"
          value={loading ? 0 : validCount}
          color="green"
          icon={<ShieldCheck size={20} />}
          onClick={() => toggleStatusFilter("valid")}
          isActive={filterStatus === "valid"}
        />
        <StatCard
          label="Expiring Soon"
          value={loading ? 0 : expiringSoon}
          color="purple"
          icon={<ShieldAlert size={20} />}
          onClick={() => toggleStatusFilter("expiring_soon")}
          isActive={filterStatus === "expiring_soon"}
        />
        <StatCard
          label="Expired"
          value={loading ? 0 : expiredCount}
          color="red"
          icon={<ShieldOff size={20} />}
          onClick={() => toggleStatusFilter("expired")}
          isActive={filterStatus === "expired"}
        />
      </div>

      {/* ── Filter toolbar ── */}
      <div className="mb-4">
        <FilterToolbar
          filters={filterConfigs}
          filterState={filterState}
          onFilterChange={(key, values) => { setFilter(key, values); setPage(1); }}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search domains…"
          hasActiveFilters={hasFilters}
          onClearAll={handleClearAll}
          resultCount={filtered.length}
          totalCount={total}
          resultLabel="domains"
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
          <p className="font-semibold mb-1">Failed to load SSL certificates</p>
          <p className="text-sm font-mono opacity-80 mb-3">{error}</p>
          <button onClick={() => load()} className="text-sm underline hover:no-underline">
            Try again
          </button>
        </div>
      ) : (
        <SSLTable
          certs={filtered}
          loading={loading}
          hasActiveFilters={hasFilters}
          onClearFilters={handleClearAll}
          page={page}
          pageSize={pageSize}
          refreshingId={refreshingId}
          onView={setViewCert}
          onEdit={(cert) => { setFormError(null); setEditCert(cert); }}
          onDelete={setDeleteCert}
          onRefresh={handleRefresh}
        />
      )}

      {/* ── Add domain drawer ── */}
      <SlideOverDrawer
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Domain"
      >
        <DomainForm
          key={addKey}
          onSave={handleAdd}
          onCancel={() => setAddOpen(false)}
          saving={saving}
          error={formError}
        />
      </SlideOverDrawer>

      {/* ── Edit domain drawer ── */}
      <SlideOverDrawer
        isOpen={!!editCert}
        onClose={() => setEditCert(null)}
        title={editCert ? `Edit — ${editCert.domain_name}` : "Edit Domain"}
      >
        <DomainForm
          key={editCert?.id ?? "edit"}
          initial={editCert}
          onSave={handleEdit}
          onCancel={() => setEditCert(null)}
          saving={saving}
          error={formError}
        />
      </SlideOverDrawer>

      {/* ── Detail view drawer ── */}
      <SSLDetailDrawer cert={viewCert} onClose={() => setViewCert(null)} />

      {/* ── Delete confirmation ── */}
      {deleteCert && (
        <DeleteModal
          cert={deleteCert}
          onConfirm={handleDelete}
          onCancel={() => setDeleteCert(null)}
          deleting={deleting}
        />
      )}
    </div>
  );
}
