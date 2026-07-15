interface StateBadgeProps {
  state: string;
}

export default function StateBadge({ state }: StateBadgeProps) {
  if (state === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-500/30">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
        running
      </span>
    );
  }
  if (state === "stopped") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-400 dark:border-red-500/30">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 dark:bg-red-400" />
        stopped
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600/30">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      {state}
    </span>
  );
}
