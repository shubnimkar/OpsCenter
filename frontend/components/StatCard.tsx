interface StatCardProps {
  label: string;
  value: number;
  color: "blue" | "green" | "red";
  icon: React.ReactNode;
}

const colorMap = {
  blue: {
    card:  "border-blue-200 bg-white dark:border-blue-500/30 dark:bg-blue-950/30",
    value: "text-blue-600 dark:text-blue-400",
    icon:  "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  },
  green: {
    card:  "border-emerald-200 bg-white dark:border-emerald-500/30 dark:bg-emerald-950/30",
    value: "text-emerald-600 dark:text-emerald-400",
    icon:  "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  red: {
    card:  "border-red-200 bg-white dark:border-red-500/30 dark:bg-red-950/30",
    value: "text-red-600 dark:text-red-400",
    icon:  "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  },
};

export default function StatCard({ label, value, color, icon }: StatCardProps) {
  const c = colorMap[color];
  return (
    <div className={`rounded-xl border ${c.card} p-5 flex items-center gap-4 shadow-sm`}>
      <div className={`rounded-lg p-3 ${c.icon}`}>{icon}</div>
      <div>
        <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">{label}</p>
        <p className={`text-3xl font-bold ${c.value}`}>{value}</p>
      </div>
    </div>
  );
}
