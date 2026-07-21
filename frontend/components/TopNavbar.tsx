"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme";

export default function TopNavbar() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  const activeCls =
    "px-3 py-3 text-sm font-medium border-b-2 border-blue-500 text-slate-900 dark:text-white transition-colors";
  const inactiveCls =
    "px-3 py-3 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border-b-2 border-transparent transition-colors";

  return (
    <header className="h-12 flex items-center px-6 border-b bg-white dark:bg-[#161825] border-slate-200 dark:border-[#2a2d3a] shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-8">
        <span className="text-xl">☁️</span>
        <span className="text-sm font-bold text-slate-900 dark:text-white">AWS Dashboard</span>
      </div>

      {/* Nav tabs */}
      <nav className="flex items-center gap-1 flex-1 h-full">
        <Link
          href="/"
          className={pathname === "/" ? activeCls : inactiveCls}
        >
          EC2
        </Link>
        <Link
          href="/s3"
          className={pathname === "/s3" ? activeCls : inactiveCls}
        >
          S3
        </Link>
        <Link
          href="/lambda"
          className={pathname === "/lambda" ? activeCls : inactiveCls}
        >
          Lambda
        </Link>
        <Link
          href="/iam"
          className={pathname.startsWith("/iam") ? activeCls : inactiveCls}
        >
          IAM
        </Link>
        <Link
          href="/ses"
          className={pathname === "/ses" ? activeCls : inactiveCls}
        >
          SES
        </Link>
        <Link
          href="/route53"
          className={pathname === "/route53" ? activeCls : inactiveCls}
        >
          Route 53
        </Link>
                <Link
          href="/ssl"
          className={pathname === "/ssl" ? activeCls : inactiveCls}
        >
          SSL
        </Link>
        <Link
          href="/uptime"
          className={pathname === "/uptime" ? activeCls : inactiveCls}
        >
          Uptime
        </Link>
        <Link
          href="/profiles"
          className={pathname === "/profiles" ? activeCls : inactiveCls}
        >
          Profiles
        </Link>
        <Link
          href="/settings"
          className={pathname === "/settings" ? activeCls : inactiveCls}
        >
          Settings
        </Link>
      </nav>

      {/* Theme toggle */}
      <button
        onClick={toggle}
        aria-label="Toggle theme"
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-300 dark:hover:bg-white/5 transition-colors"
      >
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </header>
  );
}
