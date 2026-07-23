"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Bell, BellOff, CheckCheck, ShieldAlert, ShieldOff,
  Globe, AlertTriangle, CheckCircle2, X,
} from "lucide-react";
import SlideOverDrawer from "./SlideOverDrawer";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/api";
import type { AlertEvent } from "@/lib/types";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Severity metadata ──────────────────────────────────────────────────────

const SEVERITY_META = {
  critical: {
    barColor: "#ef4444",
    iconEl: <ShieldOff size={14} aria-hidden="true" style={{ color: "#ef4444", flexShrink: 0, marginTop: 1 }} />,
  },
  warning: {
    barColor: "#f59e0b",
    iconEl: <ShieldAlert size={14} aria-hidden="true" style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />,
  },
  info: {
    barColor: "#10b981",
    iconEl: <CheckCircle2 size={14} aria-hidden="true" style={{ color: "#10b981", flexShrink: 0, marginTop: 1 }} />,
  },
} as const;

const ALERT_TYPE_ICON: Record<string, React.ReactNode> = {
  uptime_down:           <Globe size={11} style={{ color: "#ef4444" }} />,
  uptime_recovered:      <Globe size={11} style={{ color: "#10b981" }} />,
  ssl_expiring_warning:  <ShieldAlert size={11} style={{ color: "#f59e0b" }} />,
  ssl_expiring_critical: <ShieldOff size={11} style={{ color: "#ef4444" }} />,
  ssl_expired:           <ShieldOff size={11} style={{ color: "#ef4444" }} />,
  ssl_recovered:         <CheckCircle2 size={11} style={{ color: "#10b981" }} />,
};

// ── Skeleton notification ──────────────────────────────────────────────────

function SkeletonNotification() {
  return (
    <div className="relative flex gap-3 px-4 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="absolute left-0 top-0 bottom-0 skeleton" style={{ width: 3, borderRadius: "0 2px 2px 0" }} />
      <div className="skeleton w-3.5 h-3.5 rounded-full mt-0.5 shrink-0" />
      <div className="flex-1 space-y-2 min-w-0">
        <div className="flex justify-between gap-4">
          <div className="skeleton h-3 rounded w-2/3" />
          <div className="skeleton h-3 rounded w-10 shrink-0" />
        </div>
        <div className="skeleton h-2.5 rounded w-1/3" />
      </div>
    </div>
  );
}

// ── Single notification item ──────────────────────────────────────────────

function NotificationItem({ event, onRead }: { event: AlertEvent; onRead: (id: number) => void }) {
  const meta = SEVERITY_META[event.severity as keyof typeof SEVERITY_META] ?? SEVERITY_META.info;
  const typeIcon = ALERT_TYPE_ICON[event.alert_type] ?? <AlertTriangle size={11} style={{ color: "var(--text-tertiary)" }} />;
  const unreadBg = "rgba(37,99,235,0.05)";

  return (
    <div
      className="relative flex gap-3 px-4 py-3.5 transition-colors duration-150"
      style={{ borderBottom: "1px solid var(--border)", background: !event.is_read ? unreadBg : "transparent" }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = !event.is_read ? unreadBg : "transparent")}
    >
      {/* Severity bar */}
      <div
        className="absolute left-0 top-0 bottom-0"
        style={{ width: 3, background: meta.barColor, borderRadius: "0 2px 2px 0" }}
        aria-hidden="true"
      />

      {meta.iconEl}

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <p
            className="text-[13px] leading-snug"
            style={{ color: "var(--text-primary)", fontWeight: !event.is_read ? 600 : 500 }}
          >
            {event.title}
          </p>
          <span className="shrink-0 text-[11px] tabular-nums whitespace-nowrap mt-0.5" style={{ color: "var(--text-tertiary)" }}>
            {formatRelative(event.first_fired)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          {typeIcon}
          <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            {event.resolved_at ? "Resolved" : "Active"}
          </span>
          {!event.is_read && (
            <span
              className="ml-auto w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: "var(--brand)" }}
              aria-label="Unread"
            />
          )}
        </div>
      </div>

      {!event.is_read && (
        <button
          onClick={() => onRead(event.id)}
          title="Mark as read"
          aria-label="Mark as read"
          className="shrink-0 p-1 rounded transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          style={{ color: "var(--text-tertiary)" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-primary)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)")}
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

// ── Bell + drawer ──────────────────────────────────────────────────────────

export function NotificationBell() {
  const [open, setOpen]             = useState(false);
  const [unread, setUnread]         = useState(0);
  const [events, setEvents]         = useState<AlertEvent[]>([]);
  const [loading, setLoading]       = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchNotifications({ limit: 50 });
      setUnread(data.unread_count);
      setEvents(data.events);
    } catch {
      // non-critical
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
    const id = setInterval(() => load(true), 30_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleRead = async (id: number) => {
    try {
      await markNotificationRead(id);
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, is_read: true } : e)));
      setUnread((n) => Math.max(0, n - 1));
    } catch { /* best-effort */ }
  };

  const handleReadAll = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setEvents((prev) => prev.map((e) => ({ ...e, is_read: true })));
      setUnread(0);
    } catch { /* best-effort */ }
    finally { setMarkingAll(false); }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        className="relative p-1.5 rounded-lg transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        style={{ color: "var(--text-tertiary)" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)";
          (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)";
        }}
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-0.5 leading-none tabular-nums" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      <SlideOverDrawer isOpen={open} onClose={() => setOpen(false)} title="Notifications">
        <div className="flex flex-col h-full -mx-5">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
              {unread > 0 ? (
                <>
                  <span className="tabular-nums font-medium" style={{ color: "var(--text-secondary)" }}>{unread}</span>
                  {" unread"}
                </>
              ) : "All caught up"}
            </span>
            {unread > 0 && (
              <button
                onClick={handleReadAll}
                disabled={markingAll}
                className="flex items-center gap-1 text-[12px] font-medium text-blue-500 hover:text-blue-400 transition-colors duration-150 disabled:opacity-50 focus:outline-none focus:underline"
              >
                <CheckCheck size={12} />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonNotification key={i} />)
            ) : events.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-56 gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "var(--bg-subtle)" }}>
                  <BellOff size={22} style={{ color: "var(--text-tertiary)" }} />
                </div>
                <div className="text-center">
                  <p className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>No notifications yet</p>
                  <p className="text-[12px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>SSL and uptime alerts will appear here</p>
                </div>
              </div>
            ) : (
              events.map((e) => <NotificationItem key={e.id} event={e} onRead={handleRead} />)
            )}
          </div>
        </div>
      </SlideOverDrawer>
    </>
  );
}
