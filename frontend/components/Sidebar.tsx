"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  Server,
  Archive,
  Zap,
  Shield,
  Mail,
  Globe,
  Lock,
  Activity,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/",         label: "EC2",      icon: Server,   matchExact: true  },
  { href: "/s3",       label: "S3",       icon: Archive,  matchExact: false },
  { href: "/lambda",   label: "Lambda",   icon: Zap,      matchExact: false },
  { href: "/iam",      label: "IAM",      icon: Shield,   matchExact: false },
  { href: "/ses",      label: "SES",      icon: Mail,     matchExact: false },
  { href: "/route53",  label: "Route 53", icon: Globe,    matchExact: false },
  { href: "/ssl",      label: "SSL",      icon: Lock,     matchExact: false },
  { href: "/uptime",   label: "Uptime",   icon: Activity, matchExact: false },
  { href: "/profiles", label: "Profiles", icon: Users,    matchExact: false },
  { href: "/settings", label: "Settings", icon: Settings, matchExact: false },
];

const STORAGE_KEY = "sidebar-collapsed";

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) setCollapsed(stored === "true");
    setMounted(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  // Avoid layout shift before mount
  if (!mounted) return <div style={{ width: 220 }} className="shrink-0" />;

  const w = collapsed ? 56 : 220;

  return (
    <aside
      style={{
        width: w,
        background: "var(--bg-card)",
        borderRight: "1px solid var(--border)",
        transition: "width 220ms cubic-bezier(0.4,0,0.2,1)",
      }}
      className="flex flex-col h-full shrink-0 overflow-hidden"
      aria-label="Main navigation"
    >
      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon, matchExact }) => {
          const active = isActive(href, matchExact);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              aria-current={active ? "page" : undefined}
              className={[
                "relative flex items-center gap-3 mx-2 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                active
                  ? "bg-blue-600/10 text-blue-600 dark:text-blue-400"
                  : "text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-800 dark:hover:text-slate-200",
              ].join(" ")}
            >
              {/* Left accent bar when collapsed + active */}
              {active && collapsed && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-blue-600 dark:bg-blue-400" />
              )}
              <Icon size={16} strokeWidth={active ? 2.5 : 2} className="shrink-0" />
              {!collapsed && (
                <span className="whitespace-nowrap overflow-hidden text-ellipsis">
                  {label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div
        className="shrink-0 px-2 py-2"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <button
          onClick={toggleCollapsed}
          className={[
            "flex items-center w-full px-2.5 py-2 rounded-lg transition-colors duration-150",
            "hover:bg-slate-100 dark:hover:bg-white/5",
            collapsed ? "justify-center" : "gap-3",
          ].join(" ")}
          style={{ color: "var(--text-tertiary)" }}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight size={15} strokeWidth={2} />
          ) : (
            <>
              <ChevronLeft size={15} strokeWidth={2} />
              <span className="text-[12px] whitespace-nowrap">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
