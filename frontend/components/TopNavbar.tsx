"use client";

import Link from "next/link";
import { Sun, Moon, Cloud } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { NotificationBell } from "./NotificationsDrawer";

export default function TopNavbar() {
  const { theme, toggle } = useTheme();

  return (
    <header
      className="h-[60px] flex items-center px-6 shrink-0 sticky top-0 z-30 gap-4"
      style={{
        background: "#1a2332",
        borderBottom: "1px solid #0d1520",
      }}
    >
      {/* Logo + app name */}
      <Link
        href="/"
        className="flex items-center gap-2 shrink-0 group"
        aria-label="Opscentre home"
      >
        <div className="w-8 h-8 rounded-md bg-blue-500 flex items-center justify-center">
          <Cloud size={16} className="text-white" strokeWidth={2.5} />
        </div>
        <span className="text-[14px] font-semibold tracking-tight text-white/90">
          Opscentre
        </span>
      </Link>

      {/* Divider */}
      <div className="w-px h-4 bg-white/10 shrink-0" />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right: notifications + theme */}
      <div className="flex items-center gap-3 shrink-0">
        <NotificationBell />
        <button
          onClick={toggle}
          aria-label="Toggle color theme"
          className="p-2 rounded transition-colors duration-150 hover:bg-white/10"
          style={{ color: "rgba(255,255,255,0.85)" }}
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
