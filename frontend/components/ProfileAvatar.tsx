import { EnvTag } from "@/lib/types";

interface ProfileAvatarProps {
  name: string;
  color: string;
  envTag?: EnvTag;
  size?: "sm" | "md" | "lg";
}

/** Converts a #rrggbb hex color to an rgb tuple. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Derive 1–2 letter monogram from profile name. */
function monogram(name: string): string {
  const words = name.trim().split(/[\s\-_/]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const ENV_TAG_CONFIG: Record<EnvTag, { label: string; bg: string; text: string }> = {
  prod:    { label: "prod",    bg: "bg-red-100 dark:bg-red-900/30",    text: "text-red-600 dark:text-red-400" },
  staging: { label: "staging", bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-600 dark:text-amber-400" },
  dev:     { label: "dev",     bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-600 dark:text-emerald-400" },
  sandbox: { label: "sandbox", bg: "bg-violet-100 dark:bg-violet-900/30", text: "text-violet-600 dark:text-violet-400" },
  other:   { label: "other",   bg: "bg-slate-100 dark:bg-slate-700/50",  text: "text-slate-500 dark:text-slate-400" },
};

const SIZE_CONFIG = {
  sm: { avatar: "w-7 h-7 text-xs",  font: "font-semibold" },
  md: { avatar: "w-9 h-9 text-sm",  font: "font-bold" },
  lg: { avatar: "w-11 h-11 text-base", font: "font-bold" },
};

/** Monogram avatar circle */
export function ProfileAvatar({ name, color, size = "md" }: ProfileAvatarProps) {
  const [r, g, b] = hexToRgb(color);
  const { avatar, font } = SIZE_CONFIG[size];
  return (
    <span
      className={`${avatar} ${font} inline-flex items-center justify-center rounded-full shrink-0 select-none`}
      style={{
        backgroundColor: `rgba(${r},${g},${b},0.15)`,
        color: color,
        border: `1.5px solid rgba(${r},${g},${b},0.35)`,
      }}
      aria-hidden="true"
    >
      {monogram(name)}
    </span>
  );
}

/** Small env tag pill */
export function EnvTagBadge({ tag }: { tag: EnvTag }) {
  const cfg = ENV_TAG_CONFIG[tag];
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

/** Full profile badge used in the instance table — avatar + name + env tag */
export default function ProfileBadgeFull({
  profile,
  color,
  envTag,
}: {
  profile: string;
  color: string;
  envTag?: EnvTag;
}) {
  const [r, g, b] = hexToRgb(color);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-0.5 border whitespace-nowrap"
      style={{
        backgroundColor: `rgba(${r},${g},${b},0.10)`,
        borderColor: `rgba(${r},${g},${b},0.30)`,
      }}
    >
      <ProfileAvatar name={profile} color={color} size="sm" />
      <span
        className="text-xs font-semibold"
        style={{ color }}
      >
        {profile}
      </span>
      {envTag && envTag !== "other" && (
        <EnvTagBadge tag={envTag} />
      )}
    </span>
  );
}
