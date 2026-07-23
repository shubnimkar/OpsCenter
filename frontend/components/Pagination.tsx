"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, Settings2 } from "lucide-react";

export const PAGE_SIZE_OPTIONS = [10, 30, 50] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

interface PaginationProps {
  total: number;
  page: number;
  pageSize: PageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
}

function PreferencesPopover({
  pageSize,
  onPageSizeChange,
  onClose,
}: {
  pageSize: PageSize;
  onPageSizeChange: (s: PageSize) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", handler); };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Pagination preferences"
      className="absolute right-0 top-full mt-2 z-50 w-48 rounded-xl overflow-hidden"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.14), 0 1px 4px rgba(0,0,0,0.06)",
      }}
    >
      <div className="px-4 pt-3.5 pb-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
        <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Preferences</p>
      </div>
      <div className="px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-tertiary)" }}>
          Page size
        </p>
        <ul className="space-y-1">
          {PAGE_SIZE_OPTIONS.map((s) => (
            <li key={s}>
              <label className="flex items-center gap-2.5 cursor-pointer py-0.5">
                <input
                  type="radio"
                  name="pageSize"
                  value={s}
                  checked={pageSize === s}
                  onChange={() => { onPageSizeChange(s); onClose(); }}
                  className="w-3.5 h-3.5 accent-blue-500 cursor-pointer"
                />
                <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{s} rows</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Pagination({ total, page, pageSize, onPageChange, onPageSizeChange }: PaginationProps) {
  const [prefOpen, setPrefOpen] = useState(false);
  const gearRef = useRef<HTMLDivElement>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const pageNums = Array.from({ length: totalPages }, (_, i) => i + 1).filter((p) => {
    if (totalPages <= 5) return true;
    if (p === 1 || p === totalPages) return true;
    return Math.abs(p - page) <= 1;
  });

  const pagesWithEllipsis = pageNums.reduce<(number | "…")[]>((acc, p, idx) => {
    if (idx > 0 && p - pageNums[idx - 1] > 1) acc.push("…");
    acc.push(p);
    return acc;
  }, []);

  const handlePageSizeChange = useCallback((s: PageSize) => {
    onPageSizeChange(s);
    onPageChange(1);
  }, [onPageSizeChange, onPageChange]);

  const navHover = {
    enter: (e: React.MouseEvent<HTMLButtonElement>) => {
      (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)";
      (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
    },
    leave: (e: React.MouseEvent<HTMLButtonElement>) => {
      (e.currentTarget as HTMLElement).style.background = "transparent";
      (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)";
    },
  };

  return (
    <div className="flex items-center gap-0.5 relative" ref={gearRef}>
      {/* Previous */}
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={!canPrev}
        aria-label="Previous page"
        className="h-7 w-7 flex items-center justify-center rounded-lg transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ background: "transparent", color: "var(--text-tertiary)" }}
        onMouseEnter={canPrev ? navHover.enter : undefined}
        onMouseLeave={canPrev ? navHover.leave : undefined}
      >
        <ChevronLeft size={14} />
      </button>

      {/* Page numbers */}
      {pagesWithEllipsis.map((p, idx) =>
        p === "…" ? (
          <span key={`ell-${idx}`} className="h-7 px-1 flex items-center text-[12px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p as number)}
            aria-label={`Page ${p}`}
            aria-current={p === page ? "page" : undefined}
            className="h-7 min-w-[28px] px-1.5 flex items-center justify-center rounded-lg text-[12px] font-medium tabular-nums transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            style={
              p === page
                ? { background: "var(--brand)", color: "#fff" }
                : { background: "transparent", color: "var(--text-secondary)" }
            }
            onMouseEnter={(e) => {
              if (p !== page) {
                (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)";
                (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
              }
            }}
            onMouseLeave={(e) => {
              if (p !== page) {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
              }
            }}
          >
            {p}
          </button>
        )
      )}

      {/* Next */}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={!canNext}
        aria-label="Next page"
        className="h-7 w-7 flex items-center justify-center rounded-lg transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ background: "transparent", color: "var(--text-tertiary)" }}
        onMouseEnter={canNext ? navHover.enter : undefined}
        onMouseLeave={canNext ? navHover.leave : undefined}
      >
        <ChevronRight size={14} />
      </button>

      {/* Divider */}
      <span className="mx-1.5 h-4 w-px shrink-0" style={{ background: "var(--border)" }} />

      {/* Gear */}
      <div className="relative">
        <button
          onClick={() => setPrefOpen((o) => !o)}
          aria-label="Pagination preferences"
          aria-expanded={prefOpen}
          className="h-7 w-7 flex items-center justify-center rounded-lg transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          style={{
            background: prefOpen ? "var(--bg-subtle)" : "transparent",
            color: prefOpen ? "var(--text-primary)" : "var(--text-tertiary)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)";
            (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            if (!prefOpen) {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)";
            }
          }}
        >
          <Settings2 size={14} />
        </button>
        {prefOpen && (
          <PreferencesPopover
            pageSize={pageSize}
            onPageSizeChange={handlePageSizeChange}
            onClose={() => setPrefOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
