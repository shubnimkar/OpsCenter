"use client";

import { useRef, useEffect, useState } from "react";
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

// ── PreferencesPopover ────────────────────────────────────────────────────

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
    // slight delay so the gear-click that opened this doesn't immediately close it
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 z-50 w-52 rounded-xl border border-slate-200 bg-white shadow-xl dark:border-[#2a2d3a] dark:bg-[#161825]"
      role="dialog"
      aria-label="Pagination preferences"
    >
      <div className="px-4 pt-4 pb-2 border-b border-slate-100 dark:border-[#2a2d3a]">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Preferences</p>
      </div>
      <div className="px-4 py-3">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Page size</p>
        <ul className="space-y-1.5">
          {PAGE_SIZE_OPTIONS.map((s) => (
            <li key={s}>
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="radio"
                  name="pageSize"
                  value={s}
                  checked={pageSize === s}
                  onChange={() => { onPageSizeChange(s); onClose(); }}
                  className="w-4 h-4 accent-blue-600 cursor-pointer"
                />
                <span className="text-sm text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                  {s} rows
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────

export default function Pagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const [prefOpen, setPrefOpen] = useState(false);
  const gearRef = useRef<HTMLDivElement>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  // Build the page numbers to render (show max 5, with ellipsis)
  const pageNums = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => {
      if (totalPages <= 5) return true;
      if (p === 1 || p === totalPages) return true;
      return Math.abs(p - page) <= 1;
    }
  );

  const pagesWithEllipsis = pageNums.reduce<(number | "…")[]>((acc, p, idx) => {
    if (idx > 0 && p - (pageNums[idx - 1]) > 1) acc.push("…");
    acc.push(p);
    return acc;
  }, []);

  const btnBase =
    "h-7 min-w-[28px] px-1.5 flex items-center justify-center rounded text-xs font-medium transition-colors select-none";

  const navBtn =
    `${btnBase} text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/5`;

  return (
    <div className="flex items-center gap-0.5 relative" ref={gearRef}>
      {/* Prev */}
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={!canPrev}
        aria-label="Previous page"
        className={navBtn}
      >
        <ChevronLeft size={14} />
      </button>

      {/* Page numbers */}
      {pagesWithEllipsis.map((p, idx) =>
        p === "…" ? (
          <span
            key={`ell-${idx}`}
            className="h-7 px-0.5 flex items-center text-xs text-slate-400 dark:text-slate-600"
          >
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p as number)}
            aria-label={`Page ${p}`}
            aria-current={p === page ? "page" : undefined}
            className={`${btnBase} ${
              p === page
                ? "bg-blue-600 text-white"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
            }`}
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
        className={navBtn}
      >
        <ChevronRight size={14} />
      </button>

      {/* Divider */}
      <span className="mx-1.5 h-4 w-px bg-slate-300 dark:bg-slate-600 shrink-0" />

      {/* Gear */}
      <div className="relative">
        <button
          onClick={() => setPrefOpen((o) => !o)}
          aria-label="Pagination preferences"
          className={`${btnBase} w-7 text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/5 ${
            prefOpen ? "bg-slate-100 text-slate-700 dark:bg-white/5 dark:text-slate-200" : ""
          }`}
        >
          <Settings2 size={14} />
        </button>

        {prefOpen && (
          <PreferencesPopover
            pageSize={pageSize}
            onPageSizeChange={(s) => { onPageSizeChange(s); onPageChange(1); }}
            onClose={() => setPrefOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
