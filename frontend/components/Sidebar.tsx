"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  Menu,
} from "lucide-react";

const NAV_GROUPS = [
  {
    label: "Compute",
    items: [
      { href: "/",       label: "EC2",    icon: Server,  matchExact: true  },
      { href: "/lambda", label: "Lambda", icon: Zap,     matchExact: false },
    ],
  },
  {
    label: "Storage",
    items: [
      { href: "/s3", label: "S3", icon: Archive, matchExact: false },
    ],
  },
  {
    label: "Networking",
    items: [
      { href: "/route53", label: "Route 53", icon: Globe, matchExact: false },
      { href: "/ssl",     label: "SSL",      icon: Lock,  matchExact: false },
    ],
  },
  {
    label: "Security",
    items: [
      { href: "/iam", label: "IAM", icon: Shield, matchExact: false },
    ],
  },
  {
    label: "Messaging",
    items: [
      { href: "/ses", label: "SES", icon: Mail, matchExact: false },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { href: "/uptime", label: "Uptime", icon: Activity, matchExact: false },
    ],
  },
];

const BOTTOM_ITEMS = [
  { href: "/profiles", label: "Profiles", icon: Users,    matchExact: false },
  { href: "/settings", label: "Settings", icon: Settings, matchExact: false },
];

export default function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  if (!mounted) return <div style={{ width: 180 }} className="shrink-0" />;

  const w = collapsed ? 48 : 180;

  const NavLink = ({
    href,
    label,
    icon: Icon,
    matchExact,
  }: {
    href: string;
    label: string;
    icon: React.ElementType;
    matchExact: boolean;
  }) => {
    const active = isActive(href, matchExact);
    return (
      <Link
        href={href}
        title={collapsed ? label : undefined}
        aria-current={active ? "page" : undefined}
        className={[
          "relative flex items-center gap-2.5 text-[13px] transition-colors duration-150 focus-visible:outline-none",
          collapsed ? "justify-center px-0 py-2.5 mx-1 rounded" : "px-3 py-1.5 mx-0",
          active ? "text-white" : "text-white/50 hover:text-white/90",
        ].join(" ")}
        style={active ? { background: "rgba(255,255,255,0.07)" } : undefined}
      >
        {/* Left accent bar */}
        {active && (
          <span
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-sm bg-blue-400"
            style={{ height: "60%" }}
          />
        )}
        <Icon size={15} strokeWidth={active ? 2.5 : 1.8} className="shrink-0" />
        {!collapsed && (
          <span className="whitespace-nowrap overflow-hidden text-ellipsis font-normal">
            {label}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside
      style={{
        width: w,
        background: "#111c2d",
        borderRight: "1px solid #0d1520",
        transition: "width 200ms cubic-bezier(0.4,0,0.2,1)",
      }}
      className="flex flex-col h-full shrink-0 overflow-hidden"
      aria-label="Main navigation"
    >
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3">
        {/* Hamburger toggle — sits at top of sidebar below navbar */}
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          title={collapsed ? "Expand" : "Collapse"}
          className={[
            "flex items-center mb-3 px-3 py-1.5 transition-colors duration-150 hover:bg-white/5 w-full",
            collapsed ? "justify-center" : "gap-2.5",
          ].join(" ")}
          style={{ color: "rgba(255,255,255,0.5)" }}
        >
          <Menu size={16} strokeWidth={2} className="shrink-0" />
          {!collapsed && (
            <span className="text-[11px] tracking-widest uppercase font-semibold"
              style={{ color: "rgba(255,255,255,0.25)" }}>
              Menu
            </span>
          )}
        </button>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-1">
            {!collapsed && (
              <p
                className="px-3 mb-0.5 text-[10px] font-semibold tracking-widest uppercase"
                style={{ color: "rgba(255,255,255,0.25)" }}
              >
                {group.label}
              </p>
            )}
            {collapsed && <div className="h-2" />}
            {group.items.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </div>
        ))}

        {/* Divider */}
        <div
          className="mx-3 my-2"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
        />

        {BOTTOM_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
      </nav>
    </aside>
  );
}
