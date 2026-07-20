"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Globe, Plus, Pencil, Trash2, RotateCcw,
  ChevronDown, ChevronUp, ChevronsUpDown,
  Search, X, History, BarChart2,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Brush,
  TooltipProps,
} from "recharts";
import {
  fetchWebsites, createWebsite, updateWebsite,
  deleteWebsite, refreshWebsite,
  fetchWebsiteHistory, fetchWebsiteStats,
} from "@/lib/api";
import {
  WebsiteMonitor, WebsiteCreate, WebsiteStats,
  WebsiteHistoryRecord, UptimeStatus, UptimeEnvironment,
} from "@/lib/types";
import StatCard from "./StatCard";
import SkeletonRow from "./SkeletonRow";
import Pagination, { PageSize } from "./Pagination";
import SlideOverDrawer from "./SlideOverDrawer";

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
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

function intervalLabel(seconds: number): string {
  const map: Record<number, string> = {
    60: "1 min", 300: "5 min", 600: "10 min",
    900: "15 min", 1800: "30 min", 3600: "1 hour",
  };
  return map[seconds] ?? `${seconds}s`;
}

const ENV_COLORS: Record<UptimeEnvironment, string> = {
  production:  "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  test:        "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
  development: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

// ── Status badge ──────────────────────────────────────────────────────────

const STATUS_META: Record<UptimeStatus, { label: string; cls: string; dot: string }> = {
  online:    { label: "Online",   cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400", dot: "bg-emerald-500" },
  offline:   { label: "Offline",  cls: "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400",               dot: "bg-red-500" },
  degraded:  { label: "Degraded", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",        dot: "bg-amber-500" },
  maintenance: { label: "Maintenance", cls: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400",           dot: "bg-sky-400" },
  content_validation_failed: {
    label: "Content Error",
    cls: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
    dot: "bg-orange-500",
  },
  unknown:   { label: "Unknown",  cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",           dot: "bg-slate-400" },
};

function StatusBadge({ status }: { status: UptimeStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.unknown;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${m.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot} ${status === "online" ? "animate-pulse" : ""}`} />
      {m.label}
    </span>
  );
}

// ── Website Form ──────────────────────────────────────────────────────────

const INTERVALS = [
  { value: 60,   label: "Every 1 minute" },
  { value: 300,  label: "Every 5 minutes (Recommended)" },
  { value: 600,  label: "Every 10 minutes" },
  { value: 900,  label: "Every 15 minutes" },
  { value: 1800, label: "Every 30 minutes" },
  { value: 3600, label: "Every 1 hour" },
];

const inputCls =
  "w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-800 " +
  "placeholder-slate-400 focus:outline-none focus:border-blue-400 transition-colors " +
  "dark:border-[#2a2d3a] dark:bg-[#1c1f2e] dark:text-slate-200 dark:placeholder-slate-500";

const labelCls = "block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1";

interface WebsiteFormProps {
  initial?: WebsiteMonitor | null;
  onSave: (data: WebsiteCreate) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}

function WebsiteForm({ initial, onSave, onCancel, saving, error }: WebsiteFormProps) {
  const [name, setName]             = useState(initial?.name ?? "");
  const [url, setUrl]               = useState(initial?.url ?? "");
  const [env, setEnv]               = useState<UptimeEnvironment>(initial?.environment ?? "production");
  const [interval, setInterval]     = useState(String(initial?.monitoring_interval ?? 300));
  const [timeout, setTimeout_]      = useState(String(initial?.timeout_seconds ?? 30));
  const [expStatus, setExpStatus]   = useState(String(initial?.expected_status ?? 200));
  const [maintenance, setMaint]     = useState(initial?.maintenance_mode ?? false);
  const [keyword, setKeyword]       = useState(initial?.keyword ?? "");
  const [notes, setNotes]           = useState(initial?.notes ?? "");

  useEffect(() => {
    setName(initial?.name ?? "");
    setUrl(initial?.url ?? "");
    setEnv(initial?.environment ?? "production");
    setInterval(String(initial?.monitoring_interval ?? 300));
    setTimeout_(String(initial?.timeout_seconds ?? 30));
    setExpStatus(String(initial?.expected_status ?? 200));
    setMaint(initial?.maintenance_mode ?? false);
    setKeyword(initial?.keyword ?? "");
    setNotes(initial?.notes ?? "");
  }, [initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      name: name.trim(),
      url: url.trim(),
      environment: env,
      monitoring_interval: parseInt(interval, 10),
      timeout_seconds: parseInt(timeout, 10),
      expected_status: parseInt(expStatus, 10),
      maintenance_mode: maintenance,
      keyword: keyword.trim(),
      notes: notes.trim(),
    });
  };

  const intervalHint: Record<UptimeEnvironment, string> = {
    production:  "Recommended: 1–5 minutes",
    test:        "Recommended: 10–15 minutes",
    development: "Recommended: 30–60 minutes",
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className={labelCls}>Website Name <span className="text-red-500">*</span></label>
        <input type="text" placeholder="My App" value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>URL <span className="text-red-500">*</span></label>
        <input type="url" placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} required className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Environment</label>
        <select value={env} onChange={(e) => setEnv(e.target.value as UptimeEnvironment)} className={inputCls}>
          <option value="production">Production</option>
          <option value="test">Test</option>
          <option value="development">Development</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Monitoring Interval</label>
        <select value={interval} onChange={(e) => setInterval(e.target.value)} className={inputCls}>
          {INTERVALS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
        </select>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{intervalHint[env]}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Timeout (seconds)</label>
          <input type="number" min={5} max={120} value={timeout} onChange={(e) => setTimeout_(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Expected HTTP Status</label>
          <input type="number" min={100} max={599} value={expStatus} onChange={(e) => setExpStatus(e.target.value)} className={inputCls} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Keyword Validation (Optional)</label>
        <input type="text" placeholder="e.g. Welcome" value={keyword} onChange={(e) => setKeyword(e.target.value)} className={inputCls} />
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">If set, the page body must contain this text.</p>
      </div>
      <div>
        <label className={labelCls}>Notes</label>
        <textarea rows={2} placeholder="Optional notes…" value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} resize-none`} />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={maintenance} onChange={(e) => setMaint(e.target.checked)}
          className="rounded border-slate-300 text-blue-600 dark:border-slate-600" />
        <span className="text-sm text-slate-600 dark:text-slate-300">Maintenance Mode</span>
      </label>
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving || !name.trim() || !url.trim()}
          className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 transition-colors">
          {saving ? "Saving…" : initial ? "Save Changes" : "Add Website"}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-300 dark:hover:bg-white/5">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Detail Drawer ─────────────────────────────────────────────────────────

type DrawerTab = "overview" | "chart" | "history";
type ChartRange = "24h" | "7d" | "30d";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 border-b border-slate-100 dark:border-[#2a2d3a] last:border-0">
      <span className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</span>
      <span className="text-sm text-slate-800 dark:text-slate-200 break-all">{value || "—"}</span>
    </div>
  );
}

function UptimeBar({ value, label }: { value: number | null; label: string }) {
  const pct = value ?? 0;
  const color = pct >= 99 ? "bg-emerald-500" : pct >= 95 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{label}</span>
        <span className="font-medium text-slate-700 dark:text-slate-300">
          {value !== null ? `${value.toFixed(2)}%` : "—"}
        </span>
      </div>
      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

// ── Custom tooltip for the response-time chart ────────────────────────────

function RtTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const ms = payload[0].value as number;
  const color =
    ms < 300 ? "#10b981" :
    ms < 800 ? "#f59e0b" :
               "#ef4444";
  return (
    <div className="rounded-lg border border-slate-200 dark:border-[#2a2d3a] bg-white dark:bg-[#1c1f2e] shadow-lg px-3 py-2 text-xs">
      <p className="text-slate-400 dark:text-slate-500 mb-1">{label}</p>
      <p className="font-semibold" style={{ color }}>{ms} ms</p>
      <p className="text-slate-400 dark:text-slate-500 mt-0.5">
        {ms < 300 ? "Fast" : ms < 800 ? "Acceptable" : "Slow"}
      </p>
    </div>
  );
}

function ResponseTimeChart({
  data,
  avgMs,
  range,
}: {
  data: { t: string; ms: number }[];
  avgMs?: number | null;
  range: ChartRange;
}) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-xs">
        No data available for this range
      </div>
    );
  }

  const formatTick = (iso: string) => {
    const d = new Date(iso);
    if (range === "24h") {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (range === "7d") {
      return d.toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const formatLabel = (iso: string) => {
    const d = new Date(iso);
    if (range === "24h") {
      return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  // Color gradient stops based on value — points > 800ms rendered as red dots
  const chartData = data.map((d) => ({
    ...d,
    label: formatLabel(d.t),
    tick: formatTick(d.t),
    dotColor: d.ms >= 800 ? "#ef4444" : d.ms >= 300 ? "#f59e0b" : undefined,
  }));

  const showBrush = data.length > 40;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData} margin={{ top: 8, right: 4, bottom: showBrush ? 24 : 0, left: 0 }}>
        <defs>
          <linearGradient id="rtGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.18} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-[#2a2d3a]" vertical={false} />
        <XAxis
          dataKey="tick"
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}ms`}
          width={52}
        />
        <Tooltip content={<RtTooltip />} />
        {/* Avg reference line */}
        {avgMs != null && (
          <ReferenceLine
            y={avgMs}
            stroke="#94a3b8"
            strokeDasharray="4 3"
            strokeWidth={1}
            label={{
              value: `avg ${avgMs}ms`,
              position: "insideTopRight",
              fontSize: 10,
              fill: "#94a3b8",
            }}
          />
        )}
        {/* 800ms warning threshold */}
        <ReferenceLine
          y={800}
          stroke="#f59e0b"
          strokeDasharray="4 3"
          strokeWidth={1}
          label={{
            value: "800ms",
            position: "insideTopRight",
            fontSize: 10,
            fill: "#f59e0b",
          }}
        />
        <Area
          type="monotone"
          dataKey="ms"
          stroke="#3b82f6"
          strokeWidth={1.5}
          fill="url(#rtGrad)"
          dot={(props) => {
            const { cx, cy, payload } = props;
            if (!payload.dotColor) return <g key={`dot-${cx}-${cy}`} />;
            return (
              <circle
                key={`dot-${cx}-${cy}`}
                cx={cx}
                cy={cy}
                r={3}
                fill={payload.dotColor}
                stroke="white"
                strokeWidth={1}
              />
            );
          }}
          activeDot={{ r: 4, stroke: "#3b82f6", strokeWidth: 2, fill: "white" }}
        />
        {showBrush && (
          <Brush
            dataKey="tick"
            height={18}
            stroke="#e2e8f0"
            fill="transparent"
            travellerWidth={6}
            startIndex={Math.max(0, chartData.length - 24)}
            tickFormatter={() => ""}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function WebsiteDetailDrawer({
  site,
  onClose,
}: {
  site: WebsiteMonitor | null;
  onClose: () => void;
}) {
  const [tab, setTab]               = useState<DrawerTab>("overview");
  const [chartRange, setChartRange] = useState<ChartRange>("24h");
  const [stats, setStats]           = useState<WebsiteStats | null>(null);
  const [history, setHistory]       = useState<WebsiteHistoryRecord[]>([]);
  const [loadingStats, setLS]       = useState(false);
  const [loadingHist, setLH]        = useState(false);

  useEffect(() => {
    if (!site) return;
    setTab("overview");
    setStats(null);
    setHistory([]);
  }, [site?.id]);

  useEffect(() => {
    if (!site || tab !== "chart") return;
    setLS(true);
    fetchWebsiteStats(site.id)
      .then(setStats)
      .catch(() => {})
      .finally(() => setLS(false));
  }, [site?.id, tab]);

  useEffect(() => {
    if (!site || tab !== "history") return;
    setLH(true);
    fetchWebsiteHistory(site.id, 100)
      .then(setHistory)
      .catch(() => {})
      .finally(() => setLH(false));
  }, [site?.id, tab]);

  const chartData = stats
    ? chartRange === "24h" ? stats.chart_24h
    : chartRange === "7d"  ? stats.chart_7d
    : stats.chart_30d
    : [];

  const tabCls = (t: DrawerTab) =>
    `px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
      tab === t
        ? "bg-blue-600 text-white"
        : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
    }`;

  return (
    <SlideOverDrawer isOpen={!!site} onClose={onClose} title={site?.name ?? ""}>
      {site && (
        <div>
          {/* Tabs */}
          <div className="flex gap-1 mb-4">
            <button onClick={() => setTab("overview")} className={tabCls("overview")}>
              <Globe size={12} className="inline mr-1" />Overview
            </button>
            <button onClick={() => setTab("chart")} className={tabCls("chart")}>
              <BarChart2 size={12} className="inline mr-1" />Chart
            </button>
            <button onClick={() => setTab("history")} className={tabCls("history")}>
              <History size={12} className="inline mr-1" />History
            </button>
          </div>

          {/* Overview tab */}
          {tab === "overview" && (
            <div>
              <div className="mb-4">
                <StatusBadge status={site.last_status} />
              </div>
              <DetailRow label="URL" value={<a href={site.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">{site.url}</a>} />
              <DetailRow label="Environment" value={<span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ENV_COLORS[site.environment]}`}>{site.environment}</span>} />
              <DetailRow label="Last Status" value={<StatusBadge status={site.last_status} />} />
              <DetailRow label="HTTP Status" value={site.last_http_status ?? "—"} />
              <DetailRow label="Response Time" value={site.last_response_time !== null ? `${site.last_response_time} ms` : "—"} />
              <DetailRow label="Last Checked" value={formatDateTime(site.last_checked_at)} />
              <DetailRow label="Next Check" value={formatNextCheck(site.next_check_at)} />
              <DetailRow label="Monitoring Interval" value={intervalLabel(site.monitoring_interval)} />
              <DetailRow label="Expected HTTP Status" value={site.expected_status} />
              <DetailRow label="Timeout" value={`${site.timeout_seconds}s`} />
              <DetailRow label="Keyword Validation" value={site.keyword || "—"} />
              <DetailRow label="Maintenance Mode" value={site.maintenance_mode ? "Enabled" : "Disabled"} />
              <DetailRow label="Notes" value={site.notes} />
            </div>
          )}

          {/* Chart tab */}
          {tab === "chart" && (
            <div>
              <div className="flex gap-1 mb-4">
                {(["24h", "7d", "30d"] as ChartRange[]).map((r) => (
                  <button key={r} onClick={() => setChartRange(r)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${chartRange === r ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"}`}>
                    {r}
                  </button>
                ))}
              </div>
              {loadingStats ? (
                <div className="flex items-center justify-center h-48 text-slate-400 text-xs">Loading…</div>
              ) : (
                <>
                  <ResponseTimeChart data={chartData} avgMs={stats?.avg_ms} range={chartRange} />
                  {stats && (
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      {[
                        { label: "Avg", val: stats.avg_ms !== null ? `${stats.avg_ms} ms` : "—" },
                        { label: "Min", val: stats.min_ms !== null ? `${stats.min_ms} ms` : "—" },
                        { label: "Max", val: stats.max_ms !== null ? `${stats.max_ms} ms` : "—" },
                      ].map(({ label, val }) => (
                        <div key={label} className="rounded-lg bg-slate-50 dark:bg-[#1c1f2e] border border-slate-100 dark:border-[#2a2d3a] p-3 text-center">
                          <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">{label}</p>
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{val}</p>
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

          {/* History tab */}
          {tab === "history" && (
            <div>
              {loadingHist ? (
                <div className="flex items-center justify-center h-32 text-slate-400 text-xs">Loading…</div>
              ) : history.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-slate-400 text-xs">No history yet</div>
              ) : (
                <div className="flex flex-col divide-y divide-slate-100 dark:divide-[#2a2d3a]">
                  {history.map((rec) => (
                    <div key={rec.id} className="py-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <StatusBadge status={rec.status} />
                        {rec.error_message && (
                          <span className="text-xs text-slate-400 dark:text-slate-500 truncate" title={rec.error_message}>
                            {rec.error_message}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-xs text-slate-400">
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

// ── Delete confirm modal ───────────────────────────────────────────────────

function DeleteModal({
  site, onConfirm, onCancel, deleting,
}: {
  site: WebsiteMonitor; onConfirm: () => void; onCancel: () => void; deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} aria-hidden="true" />
      <div role="dialog" aria-modal="true"
        className="relative z-10 w-full max-w-sm mx-4 rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-[#2a2d3a] dark:bg-[#161825] p-6">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Remove website?</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
          <span className="font-medium">{site.name}</span> will be removed from monitoring.
          All history will be deleted. This cannot be undone.
        </p>
        <div className="flex gap-2">
          <button onClick={onConfirm} disabled={deleting}
            className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50 transition-colors">
            {deleting ? "Removing…" : "Remove"}
          </button>
          <button onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-300 dark:hover:bg-white/5">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Table ────────────────────────────────────────────────────────────

type SortKey = "name" | "environment" | "last_status" | "last_response_time" | "last_checked_at" | "next_check_at";
type SortDir = "asc" | "desc";

function UptimeTable({
  sites, loading, hasFilters, onClearFilters,
  page, pageSize, refreshingId,
  onView, onEdit, onDelete, onRefresh,
}: {
  sites: WebsiteMonitor[]; loading: boolean; hasFilters: boolean;
  onClearFilters: () => void; page: number; pageSize: PageSize;
  refreshingId: number | null;
  onView: (s: WebsiteMonitor) => void;
  onEdit: (s: WebsiteMonitor) => void;
  onDelete: (s: WebsiteMonitor) => void;
  onRefresh: (s: WebsiteMonitor) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = [...sites].sort((a, b) => {
    const av = a[sortKey] ?? ""; const bv = b[sortKey] ?? "";
    const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
    return sortDir === "asc" ? cmp : -cmp;
  });

  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (col !== sortKey) return <ChevronsUpDown size={13} className="text-slate-300 dark:text-slate-600" />;
    return sortDir === "asc"
      ? <ChevronUp size={13} className="text-blue-500" />
      : <ChevronDown size={13} className="text-blue-500" />;
  };

  const COLS: { key: SortKey; label: string }[] = [
    { key: "name",               label: "Website" },
    { key: "environment",        label: "Environment" },
    { key: "last_status",        label: "Status" },
    { key: "last_response_time", label: "Response Time" },
    { key: "last_checked_at",    label: "Last Checked" },
    { key: "next_check_at",      label: "Next Check" },
  ];

  if (!loading && sites.length === 0) {
    if (hasFilters) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <p className="text-lg font-medium text-slate-600 dark:text-slate-300">No websites match the current filters.</p>
          <button onClick={onClearFilters}
            className="mt-3 px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-[#2a2d3a] dark:hover:bg-[#33374a] dark:text-slate-300 transition-colors">
            Clear filters
          </button>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Globe size={40} className="mb-3 opacity-30" />
        <p className="text-lg font-medium">No websites monitored yet</p>
        <p className="text-xs mt-1">Click "Add New" to start monitoring a website</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 shadow-sm dark:border-[#2a2d3a] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-[#2a2d3a] dark:bg-[#161825]">
              {COLS.map((col) => (
                <th key={col.key} onClick={() => handleSort(col.key)}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-slate-600 select-none whitespace-nowrap dark:text-slate-500 dark:hover:text-slate-300">
                  <span className="inline-flex items-center gap-1">{col.label}<SortIcon col={col.key} /></span>
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#2a2d3a]">
            {loading
              ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} columns={7} />)
              : paginated.map((site) => (
                <tr key={site.id} onClick={() => onView(site)}
                  className="group bg-white hover:bg-slate-50 transition-colors dark:bg-[#1c1f2e] dark:hover:bg-[#222538] cursor-pointer">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800 dark:text-slate-200 text-xs">{site.name}</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 font-mono truncate max-w-[200px]">{site.url}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ENV_COLORS[site.environment]}`}>{site.environment}</span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={site.last_status} /></td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {site.last_response_time !== null ? `${site.last_response_time} ms` : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {formatRelative(site.last_checked_at)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {formatNextCheck(site.next_check_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => onRefresh(site)} disabled={refreshingId === site.id}
                        title="Refresh now"
                        className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-950/30 transition-colors disabled:opacity-40">
                        <RotateCcw size={13} className={refreshingId === site.id ? "animate-spin" : ""} />
                      </button>
                      <button onClick={() => onEdit(site)} title="Edit"
                        className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-white/5 transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => onDelete(site)} title="Delete"
                        className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/30 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── UptimeDashboard (main export) ─────────────────────────────────────────

export default function UptimeDashboard() {
  const [sites, setSites]       = useState<WebsiteMonitor[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [lastUpdated, setUpdated] = useState<Date | null>(null);

  // Drawer / modal state
  const [viewSite, setViewSite]     = useState<WebsiteMonitor | null>(null);
  const [editSite, setEditSite]     = useState<WebsiteMonitor | null>(null);
  const [addOpen, setAddOpen]       = useState(false);
  const [addKey, setAddKey]         = useState(0);
  const [deleteSite, setDeleteSite] = useState<WebsiteMonitor | null>(null);
  const [formError, setFormError]   = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);

  // Filters
  const [search, setSearch]           = useState("");
  const [filterStatus, setFilterStatus] = useState<UptimeStatus | "all">("all");

  // Pagination
  const [page, setPage]       = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await fetchWebsites();
      setSites(data);
      setUpdated(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const id = setInterval(() => {
      fetchWebsites().then(setSites).catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Derived stats ────────────────────────────────────────────────────────
  const total         = sites.length;
  const onlineCount   = sites.filter((s) => s.last_status === "online").length;
  const offlineCount  = sites.filter((s) => s.last_status === "offline" || s.last_status === "content_validation_failed").length;
  const degradedCount = sites.filter((s) => s.last_status === "degraded").length;
  const responseTimes = sites.filter((s) => s.last_response_time !== null).map((s) => s.last_response_time as number);
  const avgResponse   = responseTimes.length ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : null;

  // ── Filters ────────────────────────────────────────────────────────────
  const filtered = sites.filter((s) => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.url.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || s.last_status === filterStatus;
    return matchSearch && matchStatus;
  });
  const hasFilters = search.trim() !== "" || filterStatus !== "all";

  // ── CRUD handlers ────────────────────────────────────────────────────────
  const handleAdd = async (data: WebsiteCreate) => {
    setSaving(true); setFormError(null);
    try {
      const created = await createWebsite(data);
      setSites((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setAddOpen(false);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to add website");
    } finally { setSaving(false); }
  };

  const handleEdit = async (data: WebsiteCreate) => {
    if (!editSite) return;
    setSaving(true); setFormError(null);
    try {
      const updated = await updateWebsite(editSite.id, data);
      setSites((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setEditSite(null);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to update website");
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteSite) return;
    setDeleting(true);
    try {
      await deleteWebsite(deleteSite.id);
      setSites((prev) => prev.filter((s) => s.id !== deleteSite.id));
      setDeleteSite(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete website");
    } finally { setDeleting(false); }
  };

  const handleRefresh = async (site: WebsiteMonitor) => {
    setRefreshingId(site.id);
    try {
      await refreshWebsite(site.id);
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const fresh = await fetchWebsites();
        setSites(fresh);
        const updated = fresh.find((s) => s.id === site.id);
        if (updated?.last_checked_at !== site.last_checked_at) break;
      }
    } catch { /* best-effort */ }
    finally { setRefreshingId(null); }
  };

  return (
    <div className="p-6 overflow-auto bg-slate-100 dark:bg-[#0f1117] min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Uptime Monitoring</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {lastUpdated ? `Updated at ${lastUpdated.toLocaleTimeString()} · auto-refreshes every 30s` : "Loading…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-300 dark:hover:bg-white/5">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button onClick={() => { setFormError(null); setAddKey((k) => k + 1); setAddOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors">
            <Plus size={14} />
            Add New
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        <StatCard label="Total" value={loading ? 0 : total} color="blue" icon={<Globe size={20} />}
          onClick={() => { setFilterStatus("all"); setPage(1); }} isActive={filterStatus === "all"} />
        <StatCard label="Online" value={loading ? 0 : onlineCount} color="green" icon={<Globe size={20} />}
          onClick={() => { setFilterStatus(filterStatus === "online" ? "all" : "online"); setPage(1); }} isActive={filterStatus === "online"} />
        <StatCard label="Offline" value={loading ? 0 : offlineCount} color="red" icon={<Globe size={20} />}
          onClick={() => { setFilterStatus(filterStatus === "offline" ? "all" : "offline"); setPage(1); }} isActive={filterStatus === "offline"} />
        <StatCard label="Degraded" value={loading ? 0 : degradedCount} color="purple" icon={<Globe size={20} />}
          onClick={() => { setFilterStatus(filterStatus === "degraded" ? "all" : "degraded"); setPage(1); }} isActive={filterStatus === "degraded"} />
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white dark:border-[#2a2d3a] dark:bg-[#1c1f2e] p-5 shadow-sm">
          <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Avg Response Time</p>
          <p className="text-2xl font-bold text-slate-700 dark:text-slate-200">
            {loading ? "—" : avgResponse !== null ? `${avgResponse} ms` : "—"}
          </p>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="text" placeholder="Search websites…" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-400 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-200 dark:placeholder-slate-500" />
        </div>
        {hasFilters && (
          <button onClick={() => { setSearch(""); setFilterStatus("all"); setPage(1); }}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
            <X size={12} />Clear filters
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
            {filtered.length} of {total} website{total !== 1 ? "s" : ""}
          </span>
          {total > 0 && (
            <Pagination
              total={filtered.length} page={page} pageSize={pageSize}
              onPageChange={setPage} onPageSizeChange={(ps) => { setPageSize(ps); setPage(1); }}
            />
          )}
        </div>
      </div>

      {/* Table */}
      <UptimeTable
        sites={filtered} loading={loading} hasFilters={hasFilters}
        onClearFilters={() => { setSearch(""); setFilterStatus("all"); setPage(1); }}
        page={page} pageSize={pageSize} refreshingId={refreshingId}
        onView={setViewSite} onEdit={(s) => { setFormError(null); setEditSite(s); }}
        onDelete={setDeleteSite} onRefresh={handleRefresh}
      />

      {/* Add drawer */}
      <SlideOverDrawer isOpen={addOpen} onClose={() => setAddOpen(false)} title="Add Website">
        <WebsiteForm key={addKey} onSave={handleAdd} onCancel={() => setAddOpen(false)} saving={saving} error={formError} />
      </SlideOverDrawer>

      {/* Edit drawer */}
      <SlideOverDrawer isOpen={!!editSite} onClose={() => setEditSite(null)} title="Edit Website">
        <WebsiteForm initial={editSite} onSave={handleEdit} onCancel={() => setEditSite(null)} saving={saving} error={formError} />
      </SlideOverDrawer>

      {/* Detail drawer */}
      <WebsiteDetailDrawer site={viewSite} onClose={() => setViewSite(null)} />

      {/* Delete modal */}
      {deleteSite && (
        <DeleteModal site={deleteSite} onConfirm={handleDelete} onCancel={() => setDeleteSite(null)} deleting={deleting} />
      )}
    </div>
  );
}
