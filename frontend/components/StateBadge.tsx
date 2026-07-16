interface StateBadgeProps {
  state: string;
}

export default function StateBadge({ state }: StateBadgeProps) {
  if (state === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-500 text-white dark:bg-emerald-600">
        <span className="h-1.5 w-1.5 rounded-full bg-white/80 animate-pulse" />
        running
      </span>
    );
  }
  if (state === "stopped") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-slate-400 text-white dark:bg-slate-500">
        <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
        stopped
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-400 text-white dark:bg-amber-500">
      <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
      {state}
    </span>
  );
}
