interface StateBadgeProps {
  state: string;
}

const STATE_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string; pulse?: boolean }> = {
  running: {
    label: "Running",
    bg: "rgba(16,185,129,0.1)",
    text: "#10b981",
    dot: "#10b981",
    pulse: true,
  },
  stopped: {
    label: "Stopped",
    bg: "var(--bg-subtle)",
    text: "var(--text-secondary)",
    dot: "var(--text-tertiary)",
  },
  pending: {
    label: "Pending",
    bg: "rgba(245,158,11,0.1)",
    text: "#f59e0b",
    dot: "#f59e0b",
  },
  terminated: {
    label: "Terminated",
    bg: "rgba(239,68,68,0.1)",
    text: "#ef4444",
    dot: "#ef4444",
  },
  "shutting-down": {
    label: "Shutting Down",
    bg: "rgba(249,115,22,0.1)",
    text: "#f97316",
    dot: "#f97316",
  },
};

export default function StateBadge({ state }: StateBadgeProps) {
  const cfg = STATE_CONFIG[state] ?? {
    label: state,
    bg: "var(--bg-subtle)",
    text: "var(--text-secondary)",
    dot: "var(--text-tertiary)",
  };

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
      style={{ background: cfg.bg, color: cfg.text }}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.pulse ? "dot-pulse" : ""}`}
        style={{ background: cfg.dot }}
      />
      {cfg.label}
    </span>
  );
}
