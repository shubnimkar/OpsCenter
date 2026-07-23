"use client";

import Link from "next/link";
import { Sun, Moon, Cloud } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { NotificationBell } from "./NotificationsDrawer";

export default function TopNavbar() {
  const { theme, toggle } = useTheme();

  return (
    <header
      className="h-[52px] flex items-center px-4 shrink-0 sticky top-0 z-30"
      style={{
        background: "var(--bg-card)",
        borderBottom: "1px solid var(--border)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      {/* Logo */}
      <Link
        href="/"
        className="flex items-center gap-2.5 shrink-0 group"
        aria-label="Opscentre home"
      >
        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
          <Cloud size={14} className="text-white" strokeWidth={2.5} />
        </div>
        <span
          className="text-[13px] font-semibold tracking-tight"
          style={{ color: "var(--text-primary)" }}
        >
          Opscentre
        </span>
      </Link>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side: notifications + theme toggle */}
      <div className="flex items-center gap-1 shrink-0">
        <NotificationBell />
        <button
          onClick={toggle}
          aria-label="Toggle color theme"
          className="p-1.5 rounded-lg transition-colors duration-150"
          style={{ color: "var(--text-tertiary)" }}
        >
          {theme === null ? null : theme === "dark" ? (
            <Sun size={15} strokeWidth={2} />
          ) : (
            <Moon size={15} strokeWidth={2} />
          )}
        </button>
      </div>
    </header>
  );
}
