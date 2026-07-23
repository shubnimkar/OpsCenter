"use client";

import { RefreshCw } from "lucide-react";

interface LastSyncedProps {
  lastUpdated: Date | null;
  loading?: boolean;
  onRefresh: () => void;
}

export default function LastSynced({ lastUpdated, loading, onRefresh }: LastSyncedProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
        {lastUpdated ? `Synced ${lastUpdated.toLocaleTimeString()}` : "Loading…"}
      </span>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors duration-150 disabled:opacity-50"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
      >
        <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        Refresh
      </button>
    </div>
  );
}
