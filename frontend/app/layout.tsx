import type { Metadata } from "next";
import { ThemeProvider } from "@/lib/theme";
import TopNavbar from "@/components/TopNavbar";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Opscentre",
  description: "Monitor your AWS infrastructure across profiles",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen" style={{ fontFamily: "Inter, system-ui, -apple-system, sans-serif" }}>
        <ThemeProvider>
          {/* Top navbar spans full width */}
          <TopNavbar />
          {/* Below navbar: sidebar + page content side by side */}
          <div className="flex" style={{ height: "calc(100vh - 52px)" }}>
            <Sidebar />
            <main className="flex-1 min-w-0 overflow-auto">{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
