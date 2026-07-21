"use client";

import { RefreshCw } from "lucide-react";

interface LastSyncedProps {
  lastUpdated: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
  label?: string;
}

/**
 * Compact "last synced" timestamp + refresh button used in each service page header.
 * The heavy scheduler controls have moved to Settings.
 */
export default function LastSynced({
  lastUpdated,
  refreshing,
  onRefresh,
  label = "Refresh",
}: LastSyncedProps) {
  return (
    <div className="flex items-center gap-3">
      {lastUpdated && (
        <span className="text-xs text-slate-400 dark:text-slate-500">
          Synced {lastUpdated.toLocaleTimeString()}
        </span>
      )}
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-300 dark:hover:bg-white/5"
      >
        <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
        {refreshing ? "Polling AWS…" : label}
      </button>
    </div>
  );
}
