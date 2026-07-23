"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Globe, Plus, Pencil, Trash2, RotateCcw, ChevronDown, ChevronUp, ChevronsUpDown, Search, X, History, BarChart2 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Brush, TooltipProps } from "recharts";
import { fetchWebsites, createWebsite, updateWebsite, deleteWebsite, refreshWebsite, fetchWebsiteHistory, fetchWebsiteStats } from "@/lib/api";
import { WebsiteMonitor, WebsiteCreate, WebsiteStats, WebsiteHistoryRecord, UptimeStatus, UptimeEnvironment } from "@/lib/types";
import StatCard from "./StatCard";
import SkeletonRow from "./SkeletonRow";
import Pagination, { PageSize } from "./Pagination";
import SlideOverDrawer from "./SlideOverDrawer";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function formatNextCheck(iso: string | null): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)} min`;
}
function intervalLabel(s: number): string {
  const map: Record<number, string> = { 60: "1 min", 300: "5 min", 600: "10 min", 900: "15 min", 1800: "30 min", 3600: "1 hour" };
  return map[s] ?? `${s}s`;
}

const ENV_META: Record<UptimeEnvironment, { bg: string; text: string }> = {
  production:  { bg: "rgba(37,99,235,0.1)",   text: "var(--brand)" },
  test:        { bg: "rgba(139,92,246,0.1)",  text: "#8b5cf6" },
  development: { bg: "var(--bg-subtle)",       text: "var(--text-secondary)" },
};

const STATUS_META: Record<UptimeStatus, { label: string; bg: string; text: string; dot: string; pulse?: boolean }> = {
  online:                   { label: "Online",          bg: "rgba(16,185,129,0.1)",  text: "#10b981", dot: "#10b981", pulse: true },
  offline:                  { label: "Offline",         bg: "rgba(239,68,68,0.1)",   text: "#ef4444", dot: "#ef4444" },
  degraded:                 { label: "Degraded",        bg: "rgba(245,158,11,0.1)",  text: "#f59e0b", dot: "#f59e0b" },
  maintenance:              { label: "Maintenance",     bg: "rgba(6,182,212,0.1)",   text: "#06b6d4", dot: "#06b6d4" },
  content_validation_failed:{ label: "Content Error",  bg: "rgba(249,115,22,0.1)", text: "#f97316", dot: "#f97316" },
  unknown:                  { label: "Unknown",         bg: "var(--bg-subtle)",       text: "var(--text-tertiary)", dot: "var(--text-tertiary)" },
};

function StatusBadge({ status }: { status: UptimeStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.unknown;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: m.bg, color: m.text }}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.pulse ? "dot-pulse" : ""}`} style={{ background: m.dot }} />
      {m.label}
    </span>
  );
}

// ── Website Form ───────────────────────────────────────────────────────────

const INTERVALS = [
  { value: 60, label: "Every 1 minute" }, { value: 300, label: "Every 5 minutes (Recommended)" },
  { value: 600, label: "Every 10 minutes" }, { value: 900, label: "Every 15 minutes" },
  { value: 1800, label: "Every 30 minutes" }, { value: 3600, label: "Every 1 hour" },
];

function WebsiteForm({ initial, onSave, onCancel, saving, error }: {
  initial?: WebsiteMonitor | null; onSave: (data: WebsiteCreate) => Promise<void>;
  onCancel: () => void; saving: boolean; error: string | null;
}) {
  const [name, setName]         = useState(initial?.name ?? "");
  const [url, setUrl]           = useState(initial?.url ?? "");
  const [env, setEnv]           = useState<UptimeEnvironment>(initial?.environment ?? "production");
  const [interval, setInterval] = useState(String(initial?.monitoring_interval ?? 300));
  const [timeout, setTimeout_]  = useState(String(initial?.timeout_seconds ?? 30));
  const [expStatus, setExpSt]   = useState(String(initial?.expected_status ?? 200));
  const [maint, setMaint]       = useState(initial?.maintenance_mode ?? false);
  const [keyword, setKeyword]   = useState(initial?.keyword ?? "");
  const [notes, setNotes]       = useState(initial?.notes ?? "");

  useEffect(() => {
    setName(initial?.name ?? ""); setUrl(initial?.url ?? ""); setEnv(initial?.environment ?? "production");
    setInterval(String(initial?.monitoring_interval ?? 300)); setTimeout_(String(initial?.timeout_seconds ?? 30));
    setExpSt(String(initial?.expected_status ?? 200)); setMaint(initial?.maintenance_mode ?? false);
    setKeyword(initial?.keyword ?? ""); setNotes(initial?.notes ?? "");
  }, [initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({ name: name.trim(), url: url.trim(), environment: env, monitoring_interval: parseInt(interval, 10), timeout_seconds: parseInt(timeout, 10), expected_status: parseInt(expStatus, 10), maintenance_mode: maint, keyword: keyword.trim(), notes: notes.trim() });
  };

  const fs = { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" };
  const ic = "w-full px-3 py-2 text-[13px] rounded-lg focus:outline-none transition-colors";
  const lc = "block text-[12px] font-medium mb-1.5" ;
  const fo = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => (e.currentTarget.style.borderColor = "var(--brand)");
  const fb = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => (e.currentTarget.style.borderColor = "var(--border)");

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div><label className={lc} style={{ color: "var(--text-secondary)" }}>Website Name <span className="text-red-500">*</span></label>
        <input type="text" placeholder="My App" value={name} onChange={(e) => setName(e.target.value)} required className={ic} style={fs} onFocus={fo} onBlur={fb} /></div>
      <div><label className={lc} style={{ color: "var(--text-secondary)" }}>URL <span className="text-red-500">*</span></label>
        <input type="url" placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} required className={ic} style={fs} onFocus={fo} onBlur={fb} /></div>
      <div><label className={lc} style={{ color: "var(--text-secondary)" }}>Environment</label>
        <select value={env} onChange={(e) => setEnv(e.target.value as UptimeEnvironment)} className={ic} style={{ ...fs, cursor: "pointer" }} onFocus={fo} onBlur={fb}>
          <option value="production">Production</option><option value="test">Test</option><option value="development">Development</option>
        </select></div>
      <div><label className={lc} style={{ color: "var(--text-secondary)" }}>Monitoring Interval</label>
        <select value={interval} onChange={(e) => setInterval(e.target.value)} className={ic} style={{ ...fs, cursor: "pointer" }} onFocus={fo} onBlur={fb}>
          {INTERVALS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
        </select></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lc} style={{ color: "var(--text-secondary)" }}>Timeout (s)</label>
          <input type="number" min={5} max={120} value={timeout} onChange={(e) => setTimeout_(e.target.value)} className={ic} style={fs} onFocus={fo} onBlur={fb} /></div>
        <div><label className={lc} style={{ color: "var(--text-secondary)" }}>Expected Status</label>
          <input type="number" min={100} max={599} value={expStatus} onChange={(e) => setExpSt(e.target.value)} className={ic} style={fs} onFocus={fo} onBlur={fb} /></div>
      </div>
      <div><label className={lc} style={{ color: "var(--text-secondary)" }}>Keyword Validation</label>
        <input type="text" placeholder="e.g. Welcome" value={keyword} onChange={(e) => setKeyword(e.target.value)} className={ic} style={fs} onFocus={fo} onBlur={fb} />
        <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>Page body must contain this text.</p></div>
      <div><label className={lc} style={{ color: "var(--text-secondary)" }}>Notes</label>
        <textarea rows={2} placeholder="Optional notes…" value={notes} onChange={(e) => setNotes(e.target.value)} className={`${ic} resize-none`} style={fs} onFocus={fo} onBlur={fb} /></div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={maint} onChange={(e) => setMaint(e.target.checked)} className="rounded accent-blue-600" />
        <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>Maintenance Mode</span>
      </label>
      {error && <p className="text-[12px] text-red-500">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving || !name.trim() || !url.trim()} className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium disabled:opacity-50 transition-colors">
          {saving ? "Saving…" : initial ? "Save Changes" : "Add Website"}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-[13px] font-medium transition-colors" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Cancel</button>
      </div>
    </form>
  );
}

// ── Chart ──────────────────────────────────────────────────────────────────

type ChartRange = "24h" | "7d" | "30d";

function RtTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const ms = payload[0].value as number;
  const color = ms < 300 ? "#10b981" : ms < 800 ? "#f59e0b" : "#ef4444";
  return (
    <div className="rounded-xl px-3 py-2 text-[12px]" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}>
      <p className="mb-1" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <p className="font-semibold" style={{ color }}>{ms} ms</p>
    </div>
  );
}

function ResponseTimeChart({ data, avgMs, range }: { data: { t: string; ms: number }[]; avgMs?: number | null; range: ChartRange }) {
  if (!data.length) return <div className="flex items-center justify-center h-48 text-[13px]" style={{ color: "var(--text-tertiary)" }}>No data available</div>;
  const formatTick = (iso: string) => {
    const d = new Date(iso);
    if (range === "24h") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (range === "7d") return d.toLocaleDateString([], { weekday: "short" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };
  const chartData = data.map((d) => ({ ...d, tick: formatTick(d.t), label: new Date(d.t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }), dotColor: d.ms >= 800 ? "#ef4444" : d.ms >= 300 ? "#f59e0b" : undefined }));
  const showBrush = data.length > 40;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData} margin={{ top: 8, right: 4, bottom: showBrush ? 24 : 0, left: 0 }}>
        <defs>
          <linearGradient id="rtGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.18} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="tick" tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}ms`} width={52} />
        <Tooltip content={<RtTooltip />} />
        {avgMs != null && <ReferenceLine y={avgMs} stroke="var(--text-tertiary)" strokeDasharray="4 3" strokeWidth={1} label={{ value: `avg ${avgMs}ms`, position: "insideTopRight", fontSize: 10, fill: "var(--text-tertiary)" }} />}
        <ReferenceLine y={800} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1} label={{ value: "800ms", position: "insideTopRight", fontSize: 10, fill: "#f59e0b" }} />
        <Area type="monotone" dataKey="ms" stroke="#3b82f6" strokeWidth={1.5} fill="url(#rtGrad)"
          dot={(props) => { const { cx, cy, payload } = props; if (!payload.dotColor) return <g key={`d-${cx}-${cy}`} />; return <circle key={`d-${cx}-${cy}`} cx={cx} cy={cy} r={3} fill={payload.dotColor} stroke="white" strokeWidth={1} />; }}
          activeDot={{ r: 4, stroke: "#3b82f6", strokeWidth: 2, fill: "white" }} />
        {showBrush && <Brush dataKey="tick" height={18} stroke="var(--border)" fill="transparent" travellerWidth={6} startIndex={Math.max(0, chartData.length - 24)} tickFormatter={() => ""} />}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function UptimeBar({ value, label }: { value: number | null; label: string }) {
  const pct = value ?? 0;
  const barColor = pct >= 99 ? "#10b981" : pct >= 95 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[12px]">
        <span style={{ color: "var(--text-tertiary)" }}>{label}</span>
        <span className="font-medium" style={{ color: "var(--text-secondary)" }}>{value !== null ? `${value.toFixed(2)}%` : "—"}</span>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-muted)" }}>
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
      </div>
    </div>
  );
}

// ── Detail Drawer ──────────────────────────────────────────────────────────

type DrawerTab = "overview" | "chart" | "history";

function WebsiteDetailDrawer({ site, onClose }: { site: WebsiteMonitor | null; onClose: () => void }) {
  const [tab, setTab] = useState<DrawerTab>("overview");
  const [chartRange, setChartRange] = useState<ChartRange>("24h");
  const [stats, setStats] = useState<WebsiteStats | null>(null);
  const [history, setHistory] = useState<WebsiteHistoryRecord[]>([]);
  const [loadingStats, setLS] = useState(false);
  const [loadingHist, setLH] = useState(false);

  useEffect(() => { if (!site) return; setTab("overview"); setStats(null); setHistory([]); }, [site?.id]);
  useEffect(() => { if (!site || tab !== "chart") return; setLS(true); fetchWebsiteStats(site.id).then(setStats).catch(() => {}).finally(() => setLS(false)); }, [site?.id, tab]);
  useEffect(() => { if (!site || tab !== "history") return; setLH(true); fetchWebsiteHistory(site.id, 100).then(setHistory).catch(() => {}).finally(() => setLH(false)); }, [site?.id, tab]);

  const chartData = stats ? (chartRange === "24h" ? stats.chart_24h : chartRange === "7d" ? stats.chart_7d : stats.chart_30d) : [];
  const tabCls = (t: DrawerTab) => `px-3 py-1.5 text-[12px] font-medium rounded-lg transition-colors duration-150 ${tab === t ? "bg-blue-600 text-white" : ""}`;

  function DRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
      <div className="flex flex-col gap-0.5 py-2.5 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>{label}</span>
        <span className="text-[13px] break-all" style={{ color: "var(--text-primary)" }}>{value || "—"}</span>
      </div>
    );
  }

  return (
    <SlideOverDrawer isOpen={!!site} onClose={onClose} title={site?.name ?? ""}>
      {site && (
        <div>
          <div className="flex gap-1 mb-4">
            {(["overview", "chart", "history"] as DrawerTab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={tabCls(t)} style={tab !== t ? { color: "var(--text-secondary)" } : {}}>
                {t === "overview" ? <><Globe size={11} className="inline mr-1" />Overview</> : t === "chart" ? <><BarChart2 size={11} className="inline mr-1" />Chart</> : <><History size={11} className="inline mr-1" />History</>}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div>
              <div className="mb-4"><StatusBadge status={site.last_status} /></div>
              <DRow label="URL" value={<a href={site.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{site.url}</a>} />
              <DRow label="Environment" value={<span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: ENV_META[site.environment].bg, color: ENV_META[site.environment].text }}>{site.environment}</span>} />
              <DRow label="Status" value={<StatusBadge status={site.last_status} />} />
              <DRow label="HTTP Status" value={site.last_http_status ?? "—"} />
              <DRow label="Response Time" value={site.last_response_time !== null ? `${site.last_response_time} ms` : "—"} />
              <DRow label="Last Checked" value={formatDateTime(site.last_checked_at)} />
              <DRow label="Next Check" value={formatNextCheck(site.next_check_at)} />
              <DRow label="Monitoring Interval" value={intervalLabel(site.monitoring_interval)} />
              <DRow label="Expected Status" value={site.expected_status} />
              <DRow label="Timeout" value={`${site.timeout_seconds}s`} />
              <DRow label="Keyword Validation" value={site.keyword || "—"} />
              <DRow label="Maintenance Mode" value={site.maintenance_mode ? "Enabled" : "Disabled"} />
              <DRow label="Notes" value={site.notes} />
            </div>
          )}

          {tab === "chart" && (
            <div>
              <div className="flex gap-1 mb-4">
                {(["24h", "7d", "30d"] as ChartRange[]).map((r) => (
                  <button key={r} onClick={() => setChartRange(r)} className="px-2.5 py-1 text-[12px] font-medium rounded-md transition-colors"
                    style={chartRange === r ? { background: "var(--text-primary)", color: "var(--bg-card)" } : { color: "var(--text-secondary)" }}>
                    {r}
                  </button>
                ))}
              </div>
              {loadingStats ? (
                <div className="flex items-center justify-center h-48 text-[13px]" style={{ color: "var(--text-tertiary)" }}>Loading…</div>
              ) : (
                <>
                  <ResponseTimeChart data={chartData} avgMs={stats?.avg_ms} range={chartRange} />
                  {stats && (
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      {[{ label: "Avg", val: stats.avg_ms !== null ? `${stats.avg_ms} ms` : "—" }, { label: "Min", val: stats.min_ms !== null ? `${stats.min_ms} ms` : "—" }, { label: "Max", val: stats.max_ms !== null ? `${stats.max_ms} ms` : "—" }].map(({ label, val }) => (
                        <div key={label} className="rounded-xl p-3 text-center border" style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}>
                          <p className="text-[11px] mb-1" style={{ color: "var(--text-tertiary)" }}>{label}</p>
                          <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{val}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {stats && (
                    <div className="mt-5 flex flex-col gap-3">
                      <UptimeBar value={stats.uptime_24h} label="Uptime 24h" />
                      <UptimeBar value={stats.uptime_7d} label="Uptime 7 days" />
                      <UptimeBar value={stats.uptime_30d} label="Uptime 30 days" />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === "history" && (
            <div>
              {loadingHist ? (
                <div className="flex items-center justify-center h-32 text-[13px]" style={{ color: "var(--text-tertiary)" }}>Loading…</div>
              ) : history.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-[13px]" style={{ color: "var(--text-tertiary)" }}>No history yet</div>
              ) : (
                <div className="flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
                  {history.map((rec) => (
                    <div key={rec.id} className="py-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <StatusBadge status={rec.status} />
                        {rec.error_message && <span className="text-[11px] truncate" style={{ color: "var(--text-tertiary)" }} title={rec.error_message}>{rec.error_message}</span>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                        {rec.response_time_ms !== null && <span>{rec.response_time_ms} ms</span>}
                        <span>{formatDateTime(rec.checked_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </SlideOverDrawer>
  );
}

// ── Delete Modal ───────────────────────────────────────────────────────────

function DeleteModal({ site, onConfirm, onCancel, deleting }: { site: WebsiteMonitor; onConfirm: () => void; onCancel: () => void; deleting: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/45" onClick={onCancel} aria-hidden="true" />
      <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-sm mx-4 rounded-2xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
        <h3 className="text-[14px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Remove website?</h3>
        <p className="text-[13px] mb-5" style={{ color: "var(--text-secondary)" }}><span className="font-medium">{site.name}</span> will be removed and all history deleted. This cannot be undone.</p>
        <div className="flex gap-2">
          <button onClick={onConfirm} disabled={deleting} className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[13px] font-medium disabled:opacity-50 transition-colors">{deleting ? "Removing…" : "Remove"}</button>
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-[13px] font-medium transition-colors" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Table ──────────────────────────────────────────────────────────────────

type SortKey = "name" | "environment" | "last_status" | "last_response_time" | "last_checked_at" | "next_check_at";
type SortDir = "asc" | "desc";

function UptimeTable({ sites, loading, hasFilters, onClearFilters, page, pageSize, refreshingId, onView, onEdit, onDelete, onRefresh }: {
  sites: WebsiteMonitor[]; loading: boolean; hasFilters: boolean; onClearFilters: () => void;
  page: number; pageSize: PageSize; refreshingId: number | null;
  onView: (s: WebsiteMonitor) => void; onEdit: (s: WebsiteMonitor) => void; onDelete: (s: WebsiteMonitor) => void; onRefresh: (s: WebsiteMonitor) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const hs = (k: SortKey) => { if (k === sortKey) setSortDir((d) => d === "asc" ? "desc" : "asc"); else { setSortKey(k); setSortDir("asc"); } };
  const sorted = [...sites].sort((a, b) => { const cmp = String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""), undefined, { numeric: true }); return sortDir === "asc" ? cmp : -cmp; });
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);
  const SI = ({ col }: { col: SortKey }) => col !== sortKey ? <ChevronsUpDown size={12} style={{ color: "var(--text-tertiary)" }} /> : sortDir === "asc" ? <ChevronUp size={12} style={{ color: "var(--brand)" }} /> : <ChevronDown size={12} style={{ color: "var(--brand)" }} />;

  const COLS: { key: SortKey; label: string }[] = [
    { key: "name", label: "Website" }, { key: "environment", label: "Environment" },
    { key: "last_status", label: "Status" }, { key: "last_response_time", label: "Response Time" },
    { key: "last_checked_at", label: "Last Checked" }, { key: "next_check_at", label: "Next Check" },
  ];

  if (!loading && sites.length === 0) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 rounded-xl border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "var(--bg-subtle)" }}>
        <Globe size={22} style={{ color: "var(--text-tertiary)" }} />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{hasFilters ? "No websites match" : "No websites monitored yet"}</p>
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{hasFilters ? "Try clearing filters." : 'Click "Add New" to start monitoring a website.'}</p>
      </div>
      {hasFilters && <button onClick={onClearFilters} className="px-4 py-1.5 rounded-lg text-[13px]" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>Clear filters</button>}
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
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={7} />) : paginated.map((site) => {
              const envM = ENV_META[site.environment];
              return (
                <tr key={site.id} onClick={() => onView(site)} className="border-b table-row-hover cursor-pointer"
                  style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-card)")}>
                  <td className="px-4 py-3">
                    <div className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>{site.name}</div>
                    <div className="text-[11px] font-mono truncate max-w-[200px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{site.url}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: envM.bg, color: envM.text }}>{site.environment}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={site.last_status} /></td>
                  <td className="px-4 py-3 whitespace-nowrap text-[13px] tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    {site.last_response_time !== null ? `${site.last_response_time} ms` : "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[13px]" style={{ color: "var(--text-secondary)" }}>{formatRelative(site.last_checked_at)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-[13px]" style={{ color: "var(--text-secondary)" }}>{formatNextCheck(site.next_check_at)}</td>
                  <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-0.5">
                      {[
                        { icon: <RotateCcw size={13} className={refreshingId === site.id ? "animate-spin" : ""} />, title: "Refresh", action: () => onRefresh(site), disabled: refreshingId === site.id, hover: "rgba(37,99,235,0.08)", hoverText: "var(--brand)" },
                        { icon: <Pencil size={13} />, title: "Edit", action: () => onEdit(site), disabled: false, hover: "var(--bg-muted)", hoverText: "var(--text-primary)" },
                        { icon: <Trash2 size={13} />, title: "Delete", action: () => onDelete(site), disabled: false, hover: "rgba(239,68,68,0.08)", hoverText: "#ef4444" },
                      ].map((btn, i) => (
                        <button key={i} onClick={btn.action} disabled={btn.disabled} title={btn.title}
                          className="p-1.5 rounded-md transition-all duration-150 disabled:opacity-40"
                          style={{ color: "var(--text-tertiary)" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = btn.hoverText; (e.currentTarget as HTMLElement).style.background = btn.hover; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                          {btn.icon}
                        </button>
                      ))}
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

export default function UptimeDashboard() {
  const [sites, setSites]         = useState<WebsiteMonitor[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [lastUpdated, setUpdated] = useState<Date | null>(null);

  const [viewSite, setViewSite]     = useState<WebsiteMonitor | null>(null);
  const [editSite, setEditSite]     = useState<WebsiteMonitor | null>(null);
  const [addOpen, setAddOpen]       = useState(false);
  const [addKey, setAddKey]         = useState(0);
  const [deleteSite, setDeleteSite] = useState<WebsiteMonitor | null>(null);
  const [formError, setFormError]   = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);

  const [search, setSearch]               = useState("");
  const [filterStatus, setFilterStatus]   = useState<UptimeStatus | "all">("all");
  const [page, setPage]                   = useState(1);
  const [pageSize, setPageSize]           = useState<PageSize>(10);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const data = await fetchWebsites(); setSites(data); setUpdated(new Date()); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const id = setInterval(() => { fetchWebsites().then(setSites).catch(() => {}); }, 30_000); return () => clearInterval(id); }, []);

  const total         = sites.length;
  const onlineCount   = sites.filter((s) => s.last_status === "online").length;
  const offlineCount  = sites.filter((s) => s.last_status === "offline" || s.last_status === "content_validation_failed").length;
  const degradedCount = sites.filter((s) => s.last_status === "degraded").length;
  const responseTimes = sites.filter((s) => s.last_response_time !== null).map((s) => s.last_response_time as number);
  const avgResponse   = responseTimes.length ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : null;

  const filtered = sites.filter((s) => {
    const ms = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.url.toLowerCase().includes(search.toLowerCase());
    const mst = filterStatus === "all" || s.last_status === filterStatus;
    return ms && mst;
  });
  const hasFilters = search.trim() !== "" || filterStatus !== "all";

  const handleAdd = async (data: WebsiteCreate) => {
    setSaving(true); setFormError(null);
    try { const c = await createWebsite(data); setSites((p) => [...p, c].sort((a, b) => a.name.localeCompare(b.name))); setAddOpen(false); }
    catch (e: unknown) { setFormError(e instanceof Error ? e.message : "Failed to add"); }
    finally { setSaving(false); }
  };
  const handleEdit = async (data: WebsiteCreate) => {
    if (!editSite) return; setSaving(true); setFormError(null);
    try { const u = await updateWebsite(editSite.id, data); setSites((p) => p.map((s) => (s.id === u.id ? u : s))); setEditSite(null); }
    catch (e: unknown) { setFormError(e instanceof Error ? e.message : "Failed to update"); }
    finally { setSaving(false); }
  };
  const handleDelete = async () => {
    if (!deleteSite) return; setDeleting(true);
    try { await deleteWebsite(deleteSite.id); setSites((p) => p.filter((s) => s.id !== deleteSite.id)); setDeleteSite(null); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed to delete"); }
    finally { setDeleting(false); }
  };
  const handleRefresh = async (site: WebsiteMonitor) => {
    setRefreshingId(site.id);
    try {
      await refreshWebsite(site.id);
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const fresh = await fetchWebsites(); setSites(fresh);
        if (fresh.find((s) => s.id === site.id)?.last_checked_at !== site.last_checked_at) break;
      }
    } catch { /* best-effort */ }
    finally { setRefreshingId(null); }
  };

  return (
    <div className="p-6 min-h-full" style={{ background: "var(--bg-page)" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Uptime Monitoring</h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
            {lastUpdated ? `Updated at ${lastUpdated.toLocaleTimeString()} · auto-refreshes every 30s` : "Loading…"}
          </p>
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

      {error && <div className="mb-4 rounded-xl border p-3 text-[13px]" style={{ background: "rgba(239,68,68,0.05)", borderColor: "rgba(239,68,68,0.2)", color: "#ef4444" }}>{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        <StatCard label="Total"    value={loading ? 0 : total}         color="blue"   icon={<Globe size={18} />} onClick={() => { setFilterStatus("all"); setPage(1); }} isActive={filterStatus === "all"} />
        <StatCard label="Online"   value={loading ? 0 : onlineCount}   color="green"  icon={<Globe size={18} />} onClick={() => { setFilterStatus(filterStatus === "online" ? "all" : "online"); setPage(1); }} isActive={filterStatus === "online"} />
        <StatCard label="Offline"  value={loading ? 0 : offlineCount}  color="red"    icon={<Globe size={18} />} onClick={() => { setFilterStatus(filterStatus === "offline" ? "all" : "offline"); setPage(1); }} isActive={filterStatus === "offline"} />
        <StatCard label="Degraded" value={loading ? 0 : degradedCount} color="amber"  icon={<Globe size={18} />} onClick={() => { setFilterStatus(filterStatus === "degraded" ? "all" : "degraded"); setPage(1); }} isActive={filterStatus === "degraded"} />
        <div className="lg:col-span-2 rounded-xl border p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)" }}>Avg Response Time</p>
          <p className="text-[28px] font-bold leading-none tabular-nums" style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
            {loading ? "—" : avgResponse !== null ? `${avgResponse} ms` : "—"}
          </p>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-tertiary)" }} />
          <input type="text" placeholder="Search websites…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-8 pr-3 py-1.5 rounded-lg text-[13px] focus:outline-none" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", width: 200 }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")} />
        </div>
        {hasFilters && <button onClick={() => { setSearch(""); setFilterStatus("all"); setPage(1); }} className="flex items-center gap-1 text-[12px]" style={{ color: "var(--text-tertiary)" }}><X size={12} />Clear</button>}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[12px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>{filtered.length} of {total} website{total !== 1 ? "s" : ""}</span>
          {total > 0 && <Pagination total={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(ps) => { setPageSize(ps); setPage(1); }} />}
        </div>
      </div>

      <UptimeTable sites={filtered} loading={loading} hasFilters={hasFilters} onClearFilters={() => { setSearch(""); setFilterStatus("all"); setPage(1); }}
        page={page} pageSize={pageSize} refreshingId={refreshingId} onView={setViewSite}
        onEdit={(s) => { setFormError(null); setEditSite(s); }} onDelete={setDeleteSite} onRefresh={handleRefresh} />

      <SlideOverDrawer isOpen={addOpen} onClose={() => setAddOpen(false)} title="Add Website">
        <WebsiteForm key={addKey} onSave={handleAdd} onCancel={() => setAddOpen(false)} saving={saving} error={formError} />
      </SlideOverDrawer>
      <SlideOverDrawer isOpen={!!editSite} onClose={() => setEditSite(null)} title="Edit Website">
        <WebsiteForm initial={editSite} onSave={handleEdit} onCancel={() => setEditSite(null)} saving={saving} error={formError} />
      </SlideOverDrawer>
      <WebsiteDetailDrawer site={viewSite} onClose={() => setViewSite(null)} />
      {deleteSite && <DeleteModal site={deleteSite} onConfirm={handleDelete} onCancel={() => setDeleteSite(null)} deleting={deleting} />}
    </div>
  );
}
