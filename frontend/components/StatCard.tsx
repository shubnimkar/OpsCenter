interface StatCardProps {
  label: string;
  value: number;
  total?: number;
  color: "blue" | "green" | "red" | "purple" | "amber" | "cyan";
  icon: React.ReactNode;
  onClick?: () => void;
  isActive?: boolean;
  ratio?: string;
}

const colorMap = {
  blue: {
    iconBg: "bg-blue-50 dark:bg-blue-500/10",
    iconColor: "text-blue-600 dark:text-blue-400",
    value: "text-blue-600 dark:text-blue-400",
    ring: "ring-2 ring-blue-500/40 ring-offset-2 ring-offset-[var(--bg-page)]",
    activeBg: "bg-blue-50/50 dark:bg-blue-500/5",
  },
  green: {
    iconBg: "bg-emerald-50 dark:bg-emerald-500/10",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    value: "text-emerald-600 dark:text-emerald-400",
    ring: "ring-2 ring-emerald-500/40 ring-offset-2 ring-offset-[var(--bg-page)]",
    activeBg: "bg-emerald-50/50 dark:bg-emerald-500/5",
  },
  red: {
    iconBg: "bg-red-50 dark:bg-red-500/10",
    iconColor: "text-red-600 dark:text-red-400",
    value: "text-red-600 dark:text-red-400",
    ring: "ring-2 ring-red-500/40 ring-offset-2 ring-offset-[var(--bg-page)]",
    activeBg: "bg-red-50/50 dark:bg-red-500/5",
  },
  purple: {
    iconBg: "bg-violet-50 dark:bg-violet-500/10",
    iconColor: "text-violet-600 dark:text-violet-400",
    value: "text-violet-600 dark:text-violet-400",
    ring: "ring-2 ring-violet-500/40 ring-offset-2 ring-offset-[var(--bg-page)]",
    activeBg: "bg-violet-50/50 dark:bg-violet-500/5",
  },
  amber: {
    iconBg: "bg-amber-50 dark:bg-amber-500/10",
    iconColor: "text-amber-600 dark:text-amber-400",
    value: "text-amber-600 dark:text-amber-400",
    ring: "ring-2 ring-amber-500/40 ring-offset-2 ring-offset-[var(--bg-page)]",
    activeBg: "bg-amber-50/50 dark:bg-amber-500/5",
  },
  cyan: {
    iconBg: "bg-cyan-50 dark:bg-cyan-500/10",
    iconColor: "text-cyan-600 dark:text-cyan-400",
    value: "text-cyan-600 dark:text-cyan-400",
    ring: "ring-2 ring-cyan-500/40 ring-offset-2 ring-offset-[var(--bg-page)]",
    activeBg: "bg-cyan-50/50 dark:bg-cyan-500/5",
  },
};

export default function StatCard({
  label,
  value,
  color,
  icon,
  onClick,
  isActive,
  ratio,
}: StatCardProps) {
  const c = colorMap[color] ?? colorMap.blue;

  const classes = [
    "rounded-xl p-5 flex items-start gap-4",
    "border transition-all duration-150",
    "border-[var(--border)] bg-[var(--bg-card)]",
    isActive ? c.ring : "",
    isActive ? c.activeBg : "",
    onClick ? "cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      <div className={`rounded-lg p-2.5 shrink-0 ${c.iconBg} ${c.iconColor}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="text-[11px] font-semibold uppercase tracking-widest mb-1.5 truncate"
          style={{ color: "var(--text-tertiary)" }}
        >
          {label}
        </p>
        <p
          className={`text-[28px] font-bold leading-none tabular-nums ${c.value}`}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {value.toLocaleString()}
        </p>
        {ratio && (
          <p
            className="text-xs mt-1.5 truncate"
            style={{ color: "var(--text-tertiary)" }}
          >
            {ratio}
          </p>
        )}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`${classes} w-full text-left`}
        aria-pressed={isActive}
      >
        {content}
      </button>
    );
  }

  return <div className={classes}>{content}</div>;
}
