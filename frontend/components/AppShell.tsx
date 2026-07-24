"use client";

import { useState, useEffect } from "react";
import TopNavbar from "./TopNavbar";
import Sidebar from "./Sidebar";
import Footer from "./Footer";

const STORAGE_KEY = "sidebar-collapsed";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) setCollapsed(stored === "true");
    setMounted(true);
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top navbar — full width */}
      <TopNavbar />

      {/* Middle: sidebar + page content — fills remaining height */}
      <div className="flex flex-1 min-h-0">
        <Sidebar collapsed={mounted ? collapsed : false} onToggle={toggle} />
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <main className="flex-1 overflow-auto">{children}</main>
          <Footer />
        </div>
      </div>
    </div>
  );
}
