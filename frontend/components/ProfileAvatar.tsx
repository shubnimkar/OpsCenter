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

const ENV_TAG_CONFIG: Record<EnvTag, { label: string; bgStyle: string; textStyle: string }> = {
  prod:    { label: "prod",    bgStyle: "rgba(239,68,68,0.12)",    textStyle: "#ef4444" },
  staging: { label: "staging", bgStyle: "rgba(245,158,11,0.12)",   textStyle: "#f59e0b" },
  dev:     { label: "dev",     bgStyle: "rgba(16,185,129,0.12)",   textStyle: "#10b981" },
  sandbox: { label: "sandbox", bgStyle: "rgba(139,92,246,0.12)",   textStyle: "#8b5cf6" },
  other:   { label: "other",   bgStyle: "var(--bg-subtle)",         textStyle: "var(--text-tertiary)" },
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
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
      style={{ background: cfg.bgStyle, color: cfg.textStyle }}
    >
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
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full pl-1 pr-2.5 py-0.5 border whitespace-nowrap"
      style={{
        backgroundColor: "var(--bg-subtle)",
        borderColor: "var(--border)",
      }}
    >
      <ProfileAvatar name={profile} color={color} size="sm" />
      <span
        className="text-xs font-medium"
        style={{ color: "var(--text-primary)" }}
      >
        {profile}
      </span>
      {envTag && envTag !== "other" && (
        <EnvTagBadge tag={envTag} />
      )}
    </span>
  );
}
