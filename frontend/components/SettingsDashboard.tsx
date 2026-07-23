"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Clock, AlertTriangle, CheckCircle2, XCircle, Play, Settings, Activity, Bell, Mail, Trash2, Plus, Send, ToggleLeft, ToggleRight } from "lucide-react";
import { fetchSchedulerStatus, triggerSchedulerPoll, updateSchedulerInterval, SchedulerStatus, fetchNotificationSettings, updateNotificationSettings, fetchNotificationRecipients, addNotificationRecipient, deleteNotificationRecipient, sendTestEmail } from "@/lib/api";
import type { NotificationSettings, NotificationRecipient } from "@/lib/types";

function formatRelative(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 5) return "Just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function secondsToLabel(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${s / 60} min`;
  return `${s / 3600}h`;
}

const INTERVAL_PRESETS = [
  { label: "1 min", seconds: 60 }, { label: "2 min", seconds: 120 }, { label: "5 min", seconds: 300 },
  { label: "15 min", seconds: 900 }, { label: "30 min", seconds: 1800 }, { label: "1 hour", seconds: 3600 },
];

const AWS_SERVICES = [
  { id: "ec2",     label: "EC2 Instances",              icon: "🖥️" },
  { id: "s3",      label: "S3 Buckets",                 icon: "🪣" },
  { id: "lambda",  label: "Lambda Functions",           icon: "λ" },
  { id: "iam",     label: "IAM Users / Roles / Groups", icon: "🔐" },
  { id: "ses",     label: "SES Identities & Stats",     icon: "✉️" },
  { id: "route53", label: "Route 53 Zones & Records",   icon: "🌐" },
];

function StatusPill({ status }: { status: SchedulerStatus["last_status"] }) {
  if (status === "ok") return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}><CheckCircle2 size={11} />Healthy</span>;
  if (status === "partial") return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}><AlertTriangle size={11} />Partial</span>;
  if (status === "error") return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}><XCircle size={11} />Error</span>;
  return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: "var(--bg-subtle)", color: "var(--text-tertiary)" }}>Never run</span>;
}

function MetaRow({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <div className="text-right">
        <div className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>{value}</div>
        {sub && <div className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{sub}</div>}
      </div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl overflow-hidden border ${className}`} style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>{children}</div>;
}
function CardHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="px-6 py-4 flex items-center justify-between gap-4" style={{ borderBottom: "1px solid var(--border)" }}>
      <div>
        <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h3>
        {subtitle && <p className="text-[12px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export default function SettingsDashboard() {
  const [status, setStatus]     = useState<SchedulerStatus | null>(null);
  const [loading, setLoading]   = useState(true);
  const [triggering, setTriggering]     = useState(false);
  const [updatingInterval, setUpdatingInterval] = useState(false);
  const [triggerMsg, setTriggerMsg]     = useState<{ text: string; ok: boolean } | null>(null);
  const [customSeconds, setCustomSeconds] = useState("");
  const [customError, setCustomError]   = useState<string | null>(null);

  const [notifSettings, setNotifSettings] = useState<NotificationSettings>({ sender_email: null, enabled: false });
  const [recipients, setRecipients]       = useState<NotificationRecipient[]>([]);
  const [notifLoading, setNotifLoading]   = useState(true);
  const [newEmail, setNewEmail]           = useState("");
  const [addingEmail, setAddingEmail]     = useState(false);
  const [emailError, setEmailError]       = useState<string | null>(null);
  const [senderInput, setSenderInput]     = useState("");
  const [savingSender, setSavingSender]   = useState(false);
  const [senderMsg, setSenderMsg]         = useState<{ text: string; ok: boolean } | null>(null);
  const [testingEmail, setTestingEmail]   = useState(false);
  const [testMsg, setTestMsg]             = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    try { const s = await fetchSchedulerStatus(); setStatus(s); } catch { /* non-critical */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 10_000); return () => clearInterval(id); }, [load]);

  const handleIntervalPreset = async (seconds: number) => {
    setUpdatingInterval(true); setCustomError(null);
    try { const u = await updateSchedulerInterval(seconds); setStatus(u); setCustomSeconds(""); }
    catch { /* ignore */ }
    finally { setUpdatingInterval(false); }
  };
  const handleCustomInterval = async () => {
    const s = parseInt(customSeconds, 10);
    if (isNaN(s)) { setCustomError("Enter a valid number"); return; }
    if (!status) return;
    if (s < status.min_interval_seconds || s > status.max_interval_seconds) { setCustomError(`Range: ${secondsToLabel(status.min_interval_seconds)} – ${secondsToLabel(status.max_interval_seconds)}`); return; }
    setCustomError(null); await handleIntervalPreset(s);
  };
  const handleTrigger = async () => {
    setTriggering(true); setTriggerMsg(null);
    try { const res = await triggerSchedulerPoll(); setTriggerMsg({ text: res.message ?? "Poll triggered", ok: true }); await new Promise((r) => setTimeout(r, 2000)); await load(); }
    catch { setTriggerMsg({ text: "Trigger failed — check backend logs", ok: false }); }
    finally { setTriggering(false); setTimeout(() => setTriggerMsg(null), 6000); }
  };

  const loadNotifSettings = useCallback(async () => {
    setNotifLoading(true);
    try { const [s, r] = await Promise.all([fetchNotificationSettings(), fetchNotificationRecipients()]); setNotifSettings(s); setSenderInput(s.sender_email ?? ""); setRecipients(r); }
    catch { /* non-critical */ }
    finally { setNotifLoading(false); }
  }, []);
  useEffect(() => { loadNotifSettings(); }, [loadNotifSettings]);

  const handleToggleNotifications = async (enabled: boolean) => {
    try { const u = await updateNotificationSettings({ enabled }); setNotifSettings(u); } catch { /* ignore */ }
  };
  const handleSaveSender = async () => {
    setSavingSender(true); setSenderMsg(null);
    try { const u = await updateNotificationSettings({ sender_email: senderInput.trim() || null }); setNotifSettings(u); setSenderMsg({ text: "Sender saved", ok: true }); }
    catch (e: unknown) { setSenderMsg({ text: e instanceof Error ? e.message : "Save failed", ok: false }); }
    finally { setSavingSender(false); setTimeout(() => setSenderMsg(null), 4000); }
  };
  const handleAddEmail = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) { setEmailError("Enter a valid email"); return; }
    setAddingEmail(true); setEmailError(null);
    try { const r = await addNotificationRecipient(email); setRecipients((p) => [...p, r]); setNewEmail(""); }
    catch (e: unknown) { setEmailError(e instanceof Error ? e.message : "Failed to add"); }
    finally { setAddingEmail(false); }
  };
  const handleRemoveEmail = async (id: number) => {
    try { await deleteNotificationRecipient(id); setRecipients((p) => p.filter((r) => r.id !== id)); } catch { /* ignore */ }
  };
  const handleTestEmail = async () => {
    setTestingEmail(true); setTestMsg(null);
    try { const res = await sendTestEmail(); setTestMsg({ text: `Test email sent to ${res.recipients.length} recipient(s)`, ok: true }); }
    catch (e: unknown) { setTestMsg({ text: e instanceof Error ? e.message : "Test failed", ok: false }); }
    finally { setTestingEmail(false); setTimeout(() => setTestMsg(null), 6000); }
  };

  const currentInterval = status?.poll_interval_seconds ?? 300;
  const ic = "w-full px-3 py-2 text-[13px] rounded-lg focus:outline-none transition-colors";
  const fs = { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" };
  const fo = (e: React.FocusEvent<HTMLInputElement>) => (e.currentTarget.style.borderColor = "var(--brand)");
  const fb = (e: React.FocusEvent<HTMLInputElement>) => (e.currentTarget.style.borderColor = "var(--border)");

  return (
    <div className="p-6 min-h-full" style={{ background: "var(--bg-page)" }}>
      <div className="flex items-center gap-2 mb-6">
        <Settings size={18} style={{ color: "var(--text-tertiary)" }} />
        <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Settings</h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left/main 2-col */}
        <div className="xl:col-span-2 space-y-5">
          {/* Scheduler Config */}
          <Card>
            <CardHeader title="AWS Scheduler" subtitle="All AWS services share one background poll interval." right={!loading && status && <StatusPill status={status.last_status} />} />
            <div className="px-6 py-5 space-y-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>Poll interval</p>
                  <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>Current: <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>{secondsToLabel(currentInterval)}</span></span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {INTERVAL_PRESETS.map((p) => (
                    <button key={p.seconds} onClick={() => handleIntervalPreset(p.seconds)} disabled={updatingInterval}
                      className="px-4 py-2 rounded-lg text-[13px] font-medium border transition-all duration-150 disabled:opacity-50"
                      style={{ background: currentInterval === p.seconds ? "rgba(37,99,235,0.08)" : "var(--bg-card)", borderColor: currentInterval === p.seconds ? "rgba(59,130,246,0.45)" : "var(--border)", color: currentInterval === p.seconds ? "var(--brand)" : "var(--text-secondary)" }}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <input type="number" placeholder="Custom seconds…" value={customSeconds} onChange={(e) => { setCustomSeconds(e.target.value); setCustomError(null); }} onKeyDown={(e) => e.key === "Enter" && handleCustomInterval()}
                    className="w-44 px-3 py-2 text-[13px] rounded-lg focus:outline-none" style={fs} onFocus={fo} onBlur={fb}
                    min={status?.min_interval_seconds} max={status?.max_interval_seconds} />
                  <button onClick={handleCustomInterval} disabled={updatingInterval || !customSeconds} className="px-4 py-2 rounded-lg text-[13px] font-medium transition-colors disabled:opacity-40" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Apply</button>
                  {customError ? <span className="text-[12px] text-red-500">{customError}</span> : status && <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>{secondsToLabel(status.min_interval_seconds)} – {secondsToLabel(status.max_interval_seconds)}</span>}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pt-5" style={{ borderTop: "1px solid var(--border)" }}>
                <div>
                  <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>Manual poll</p>
                  <p className="text-[12px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>Triggers an immediate poll of all AWS services right now</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <button onClick={handleTrigger} disabled={triggering} className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors whitespace-nowrap">
                    {triggering ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                    {triggering ? "Polling…" : "Poll Now"}
                  </button>
                  {triggerMsg && <span className="text-[12px]" style={{ color: triggerMsg.ok ? "#10b981" : "#ef4444" }}>{triggerMsg.text}</span>}
                </div>
              </div>

              {status?.last_error && (
                <div className="p-3 rounded-lg text-[12px] font-mono whitespace-pre-wrap break-words" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444" }}>
                  {status.last_error}
                </div>
              )}
            </div>
          </Card>

          {/* Services table */}
          <Card>
            <CardHeader title="Services covered by scheduler" subtitle="All services below share the same poll interval configured above" />
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {AWS_SERVICES.map((svc) => (
                <div key={svc.id} className="flex items-center gap-3 px-6 py-3">
                  <span className="text-base w-6 text-center shrink-0">{svc.icon}</span>
                  <span className="text-[13px] flex-1" style={{ color: "var(--text-primary)" }}>{svc.label}</span>
                  <span className="flex items-center gap-1.5 text-[12px] shrink-0" style={{ color: "var(--text-tertiary)" }}><Clock size={11} />{loading ? "—" : secondsToLabel(currentInterval)}</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}><Activity size={9} />Active</span>
                </div>
              ))}
              {[{ icon: "🔒", label: "SSL Certificates", note: "Per-domain refresh" }, { icon: "📡", label: "Website Uptime", note: "Per-site interval" }].map((svc) => (
                <div key={svc.label} className="flex items-center gap-3 px-6 py-3">
                  <span className="text-base w-6 text-center shrink-0">{svc.icon}</span>
                  <span className="text-[13px] flex-1" style={{ color: "var(--text-primary)" }}>{svc.label}</span>
                  <span className="text-[12px] shrink-0" style={{ color: "var(--text-tertiary)" }}>{svc.note}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0" style={{ background: "var(--bg-subtle)", color: "var(--text-tertiary)" }}>Independent</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Scheduler Status */}
          <Card>
            <CardHeader title="Scheduler Status" />
            <div className="px-5 py-1">
              <MetaRow label="Status" value={loading ? <span style={{ color: "var(--text-tertiary)" }}>Loading…</span> : <StatusPill status={status?.last_status ?? "never"} />} />
              <MetaRow label="Last run" value={loading ? "—" : formatRelative(status?.last_run_at ?? null)} sub={status?.last_run_at ? formatDateTime(status.last_run_at) : undefined} />
              <MetaRow label="Next run" value={loading ? "—" : formatRelative(status?.next_run_at ?? null)} sub={status?.next_run_at ? formatDateTime(status.next_run_at) : undefined} />
              <MetaRow label="Interval" value={loading ? "—" : secondsToLabel(currentInterval)} />
            </div>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader title="Notifications" subtitle="Email alerts for SSL expiry and uptime incidents"
              right={
                <button onClick={() => handleToggleNotifications(!notifSettings.enabled)} aria-label={notifSettings.enabled ? "Disable notifications" : "Enable notifications"} className="shrink-0">
                  {notifSettings.enabled ? <ToggleRight size={28} style={{ color: "var(--brand)" }} /> : <ToggleLeft size={28} style={{ color: "var(--text-tertiary)" }} />}
                </button>
              } />
            <div className="px-6 py-5 space-y-6">
              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  Sender email <span style={{ color: "var(--text-tertiary)" }}>(must be a verified SES identity)</span>
                </label>
                <div className="flex gap-2">
                  <input type="email" placeholder="alerts@yourdomain.com" value={senderInput} onChange={(e) => setSenderInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSaveSender()} className={ic} style={fs} onFocus={fo} onBlur={fb} />
                  <button onClick={handleSaveSender} disabled={savingSender} className="px-4 py-2 rounded-lg text-[13px] font-medium transition-colors disabled:opacity-40 whitespace-nowrap" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                    {savingSender ? "Saving…" : "Save"}
                  </button>
                </div>
                {senderMsg && <p className="text-[12px] mt-1.5" style={{ color: senderMsg.ok ? "#10b981" : "#ef4444" }}>{senderMsg.text}</p>}
              </div>

              <div>
                <p className="text-[12px] font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Recipients</p>
                {notifLoading ? (
                  <div className="space-y-2 mb-3">{[1, 2].map((i) => <div key={i} className="h-9 rounded-lg skeleton" />)}</div>
                ) : recipients.length > 0 ? (
                  <div className="space-y-1.5 mb-3">
                    {recipients.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border" style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <Mail size={13} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                          <span className="text-[13px] truncate" style={{ color: "var(--text-primary)" }}>{r.email}</span>
                        </div>
                        <button onClick={() => handleRemoveEmail(r.id)} className="p-1 rounded shrink-0 transition-colors" style={{ color: "var(--text-tertiary)" }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#ef4444")}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)")}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-[12px] mb-3" style={{ color: "var(--text-tertiary)" }}>No recipients yet — add one below.</p>}
                <div className="flex gap-2">
                  <input type="email" placeholder="person@example.com" value={newEmail} onChange={(e) => { setNewEmail(e.target.value); setEmailError(null); }} onKeyDown={(e) => e.key === "Enter" && handleAddEmail()} className={ic} style={fs} onFocus={fo} onBlur={fb} />
                  <button onClick={handleAddEmail} disabled={addingEmail || !newEmail.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 transition-colors whitespace-nowrap">
                    <Plus size={13} />{addingEmail ? "Adding…" : "Add"}
                  </button>
                </div>
                {emailError && <p className="text-[12px] mt-1.5 text-red-500">{emailError}</p>}
              </div>

              <div className="flex items-center justify-between gap-4 pt-5" style={{ borderTop: "1px solid var(--border)" }}>
                <div>
                  <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>Test email</p>
                  <p className="text-[12px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>Sends a test notification to all recipients</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <button onClick={handleTestEmail} disabled={testingEmail || !notifSettings.enabled || !notifSettings.sender_email || recipients.length === 0}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-colors disabled:opacity-40 whitespace-nowrap"
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                    {testingEmail ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
                    {testingEmail ? "Sending…" : "Send Test"}
                  </button>
                  {testMsg && <span className="text-[12px]" style={{ color: testMsg.ok ? "#10b981" : "#ef4444" }}>{testMsg.text}</span>}
                </div>
              </div>
            </div>
          </Card>

          {/* About */}
          <Card>
            <CardHeader title="About" />
            <div className="px-5 py-1">
              <MetaRow label="App" value="Opscentre" />
              <MetaRow label="Backend" value={<span className="font-mono text-[12px]" style={{ color: "var(--text-secondary)" }}>{process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}</span>} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
