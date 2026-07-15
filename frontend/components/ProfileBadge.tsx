interface ProfileBadgeProps {
  profile: string;
}

const palette: Record<string, string> = {
  main: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-500/30",
  poc:  "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-500/30",
  kdms: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-500/30",
};

export default function ProfileBadge({ profile }: ProfileBadgeProps) {
  const cls = palette[profile] ?? "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600/30";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold border ${cls}`}>
      {profile}
    </span>
  );
}
