interface StatCardProps {
  label: string;
  value: number;
  total?: number;
  color: "blue" | "green" | "red";
  icon: React.ReactNode;
  onClick?: () => void;
  isActive?: boolean;
  ratio?: string;
}

const colorMap = {
  blue: {
    card:  "border-blue-200 bg-white dark:border-blue-500/30 dark:bg-blue-950/30",
    value: "text-blue-600 dark:text-blue-400",
    icon:  "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
    ring:  "ring-blue-500",
  },
  green: {
    card:  "border-emerald-200 bg-white dark:border-emerald-500/30 dark:bg-emerald-950/30",
    value: "text-emerald-600 dark:text-emerald-400",
    icon:  "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    ring:  "ring-emerald-500",
  },
  red: {
    card:  "border-red-200 bg-white dark:border-red-500/30 dark:bg-red-950/30",
    value: "text-red-600 dark:text-red-400",
    icon:  "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
    ring:  "ring-red-500",
  },
};

export default function StatCard({ label, value, total, color, icon, onClick, isActive, ratio }: StatCardProps) {
  const c = colorMap[color];
  const activeRing = isActive ? `ring-2 ring-offset-2 ${c.ring}` : "";
  const baseClass = `rounded-xl border ${c.card} p-5 flex items-center gap-4 shadow-sm ${activeRing}`;

  const content = (
    <>
      <div className={`rounded-lg p-3 ${c.icon}`}>{icon}</div>
      <div>
        <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">{label}</p>
        <p className={`text-2xl font-bold ${c.value}`}>{value}</p>
        {ratio && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{ratio}</p>
        )}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`${baseClass} w-full text-left cursor-pointer transition-shadow hover:shadow-md`}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={baseClass}>
      {content}
    </div>
  );
}
