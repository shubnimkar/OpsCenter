"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Play,
  Settings,
  Activity,
} from "lucide-react";
import {
  fetchSchedulerStatus,
  triggerSchedulerPoll,
  updateSchedulerInterval,
  SchedulerStatus,
} from "@/lib/api";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatRelative(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 5) return "Just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function secondsToLabel(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${s / 60} min`;
  return `${s / 3600}h`;
}

const INTERVAL_PRESETS = [
  { label: "1 min",  seconds: 60 },
  { label: "2 min",  seconds: 120 },
  { label: "5 min",  seconds: 300 },
  { label: "15 min", seconds: 900 },
  { label: "30 min", seconds: 1800 },
  { label: "1 hour", seconds: 3600 },
];

const AWS_SERVICES = [
  { id: "ec2",     label: "EC2 Instances",             icon: "🖥️" },
  { id: "s3",      label: "S3 Buckets",                icon: "🪣" },
  { id: "lambda",  label: "Lambda Functions",          icon: "λ" },
  { id: "iam",     label: "IAM Users / Roles / Groups",icon: "🔐" },
  { id: "ses",     label: "SES Identities & Stats",    icon: "✉️" },
  { id: "route53", label: "Route 53 Zones & Records",  icon: "🌐" },
];

// ── Sub-components ─────────────────────────────────────────────────────────

function StatusPill({ status }: { status: SchedulerStatus["last_status"] }) {
  if (status === "ok")
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
        <CheckCircle2 size={12} /> Healthy
      </span>
    );
  if (status === "partial")
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
        <AlertTriangle size={12} /> Partial
      </span>
    );
  if (status === "error")
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">
        <XCircle size={12} /> Error
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
      Never run
    </span>
  );
}

function MetaRow({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-100 dark:border-[#2a2d3a] last:border-0">
      <span className="text-sm text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
      <div className="text-right">
        <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{value}</div>
        {sub && <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function SettingsDashboard() {
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [updatingInterval, setUpdatingInterval] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [intervalInput, setIntervalInput] = useState<number | null>(null);
  const [customSeconds, setCustomSeconds] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await fetchSchedulerStatus();
      setStatus(s);
      if (intervalInput === null) setIntervalInput(s.poll_interval_seconds);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, [intervalInput]);

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [load]);

  const handleIntervalPreset = async (seconds: number) => {
    setUpdatingInterval(true);
    setCustomError(null);
    try {
      const updated = await updateSchedulerInterval(seconds);
      setStatus(updated);
      setIntervalInput(seconds);
      setCustomSeconds("");
    } catch {
      // ignore
    } finally {
      setUpdatingInterval(false);
    }
  };

  const handleCustomInterval = async () => {
    const s = parseInt(customSeconds, 10);
    if (isNaN(s)) { setCustomError("Enter a valid number"); return; }
    if (!status) return;
    if (s < status.min_interval_seconds || s > status.max_interval_seconds) {
      setCustomError(`Range: ${secondsToLabel(status.min_interval_seconds)} – ${secondsToLabel(status.max_interval_seconds)}`);
      return;
    }
    setCustomError(null);
    await handleIntervalPreset(s);
  };

  const handleTrigger = async () => {
    setTriggering(true);
    setTriggerMsg(null);
    try {
      const res = await triggerSchedulerPoll();
      setTriggerMsg({ text: res.message ?? "Poll triggered successfully", ok: true });
      await new Promise((r) => setTimeout(r, 2000));
      await load();
    } catch {
      setTriggerMsg({ text: "Trigger failed — check backend logs", ok: false });
    } finally {
      setTriggering(false);
      setTimeout(() => setTriggerMsg(null), 6000);
    }
  };

  const currentInterval = status?.poll_interval_seconds ?? intervalInput ?? 300;

  return (
    <div className="p-6 overflow-auto bg-slate-100 dark:bg-[#0f1117] min-h-full">

      {/* ── Page header ── */}
      <div className="flex items-center gap-2 mb-6">
        <Settings size={18} className="text-slate-400" />
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Settings</h2>
      </div>

      {/* ── Main two-column grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── LEFT / MAIN column (2/3 width) ── */}
        <div className="xl:col-span-2 space-y-5">

          {/* ── Scheduler Config card ── */}
          <div className="rounded-xl border border-slate-200 dark:border-[#2a2d3a] bg-white dark:bg-[#1c1f2e] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-[#2a2d3a] flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">AWS Scheduler</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  All AWS services share one background poll interval. Change it here without restarting.
                </p>
              </div>
              {!loading && status && <StatusPill status={status.last_status} />}
            </div>

            <div className="px-6 py-5 space-y-6">

              {/* Poll interval */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Poll interval</p>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    Current: <span className="font-semibold text-slate-600 dark:text-slate-300">{secondsToLabel(currentInterval)}</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {INTERVAL_PRESETS.map((p) => (
                    <button
                      key={p.seconds}
                      onClick={() => handleIntervalPreset(p.seconds)}
                      disabled={updatingInterval}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50
                        ${currentInterval === p.seconds
                          ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500/60 dark:bg-blue-600/15 dark:text-blue-300"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-300 dark:hover:bg-white/5"
                        }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Custom input */}
                <div className="flex items-center gap-2 mt-3">
                  <input
                    type="number"
                    placeholder="Custom seconds…"
                    value={customSeconds}
                    onChange={(e) => { setCustomSeconds(e.target.value); setCustomError(null); }}
                    onKeyDown={(e) => e.key === "Enter" && handleCustomInterval()}
                    className="w-44 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-400 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-200 dark:placeholder-slate-500"
                    min={status?.min_interval_seconds}
                    max={status?.max_interval_seconds}
                  />
                  <button
                    onClick={handleCustomInterval}
                    disabled={updatingInterval || !customSeconds}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-300 dark:hover:bg-white/5"
                  >
                    Apply
                  </button>
                  {customError
                    ? <span className="text-xs text-red-500 dark:text-red-400">{customError}</span>
                    : status && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {secondsToLabel(status.min_interval_seconds)} – {secondsToLabel(status.max_interval_seconds)}
                      </span>
                    )
                  }
                </div>
              </div>

              {/* Manual poll */}
              <div className="flex items-center justify-between gap-4 pt-5 border-t border-slate-100 dark:border-[#2a2d3a]">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Manual poll</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    Triggers an immediate poll of all AWS services right now
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <button
                    onClick={handleTrigger}
                    disabled={triggering}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {triggering
                      ? <RefreshCw size={14} className="animate-spin" />
                      : <Play size={14} />
                    }
                    {triggering ? "Polling…" : "Poll Now"}
                  </button>
                  {triggerMsg && (
                    <span className={`text-xs ${triggerMsg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                      {triggerMsg.text}
                    </span>
                  )}
                </div>
              </div>

              {/* Error display */}
              {status?.last_error && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-500/30 text-xs text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap break-words">
                  {status.last_error}
                </div>
              )}
            </div>
          </div>

          {/* ── Services table card ── */}
          <div className="rounded-xl border border-slate-200 dark:border-[#2a2d3a] bg-white dark:bg-[#1c1f2e] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-[#2a2d3a]">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Services covered by scheduler</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                All services below share the same poll interval configured above
              </p>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-[#2a2d3a]">
              {AWS_SERVICES.map((svc) => (
                <div key={svc.id} className="flex items-center gap-3 px-6 py-3">
                  <span className="text-base w-6 text-center shrink-0">{svc.icon}</span>
                  <span className="text-sm text-slate-700 dark:text-slate-200 flex-1">{svc.label}</span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 shrink-0">
                    <Clock size={11} />
                    {loading ? "—" : secondsToLabel(currentInterval)}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 shrink-0">
                    <Activity size={10} />
                    Active
                  </span>
                </div>
              ))}
              {/* Independent services */}
              <div className="flex items-center gap-3 px-6 py-3">
                <span className="text-base w-6 text-center shrink-0">🔒</span>
                <span className="text-sm text-slate-700 dark:text-slate-200 flex-1">SSL Certificates</span>
                <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">Per-domain refresh</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 shrink-0">
                  Independent
                </span>
              </div>
              <div className="flex items-center gap-3 px-6 py-3">
                <span className="text-base w-6 text-center shrink-0">📡</span>
                <span className="text-sm text-slate-700 dark:text-slate-200 flex-1">Website Uptime</span>
                <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">Per-site interval</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 shrink-0">
                  Independent
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* ── RIGHT column (1/3 width) ── */}
        <div className="space-y-5">

          {/* Scheduler status card */}
          <div className="rounded-xl border border-slate-200 dark:border-[#2a2d3a] bg-white dark:bg-[#1c1f2e] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-[#2a2d3a]">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Scheduler Status</h3>
            </div>
            <div className="px-5 py-1">
              <MetaRow
                label="Status"
                value={loading ? <span className="text-slate-400 text-xs">Loading…</span> : <StatusPill status={status?.last_status ?? "unknown"} />}
              />
              <MetaRow
                label="Last run"
                value={loading ? "—" : formatRelative(status?.last_run_at ?? null)}
                sub={status?.last_run_at ? formatDateTime(status.last_run_at) : undefined}
              />
              <MetaRow
                label="Next run"
                value={loading ? "—" : formatRelative(status?.next_run_at ?? null)}
                sub={status?.next_run_at ? formatDateTime(status.next_run_at) : undefined}
              />
              <MetaRow
                label="Interval"
                value={loading ? "—" : secondsToLabel(currentInterval)}
              />
            </div>
          </div>

          {/* About card */}
          <div className="rounded-xl border border-slate-200 dark:border-[#2a2d3a] bg-white dark:bg-[#1c1f2e] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-[#2a2d3a]">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">About</h3>
            </div>
            <div className="px-5 py-1">
              <MetaRow label="App" value="AWS Dashboard" />
              <MetaRow
                label="Backend"
                value={
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}
                  </span>
                }
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
