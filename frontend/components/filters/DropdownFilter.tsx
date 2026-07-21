"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import FilterBadge from "./FilterBadge";
import type { DropdownFilterProps, FilterOption } from "./types";

// ── Option row ─────────────────────────────────────────────────────────────

interface OptionRowProps {
  option: FilterOption;
  checked: boolean;
  onToggle: (value: string) => void;
}

const OptionRow = React.memo(function OptionRow({
  option,
  checked,
  onToggle,
}: OptionRowProps) {
  return (
    <li role="none">
      <label className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 select-none">
        <input
          type="checkbox"
          role="menuitemcheckbox"
          aria-checked={checked}
          checked={checked}
          onChange={() => onToggle(option.value)}
          className="accent-blue-500 w-3.5 h-3.5 shrink-0"
        />
        {option.color ? (
          <span className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 truncate">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: option.color }}
              aria-hidden="true"
            />
            {option.label ?? option.value}
          </span>
        ) : (
          <span className="text-sm text-slate-700 dark:text-slate-200 truncate">
            {option.label ?? option.value}
          </span>
        )}
      </label>
    </li>
  );
});

// ── DropdownFilter ─────────────────────────────────────────────────────────

/**
 * Reusable multi-select dropdown filter chip.
 *
 * Selection convention:
 *   selectedValues = []   → "show all" (no filter active)
 *   selectedValues = [x]  → filter to items matching x
 *
 * A filter is "active" (highlighted blue) only when a strict subset is selected.
 * Selecting all = same as selecting none = inactive state.
 *
 * "Show All" button resets to [] (show everything).
 * "Reset" button also resets to [] (same effect, clearer label for the active state).
 *
 * Accessibility:
 *   - Escape closes the dropdown
 *   - Focus is managed via tabIndex
 *   - ARIA roles: button, menu, menuitemcheckbox
 */
const DropdownFilter = React.memo(function DropdownFilter({
  label,
  options,
  selectedValues,
  onChange,
  className = "",
}: DropdownFilterProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
  }, []);

  const totalOptions = options.length;

  /**
   * A filter is "active" when a strict non-empty subset is selected.
   * Zero selected OR all selected = inactive (= show all).
   */
  const activeCount =
    selectedValues.length > 0 && selectedValues.length < totalOptions
      ? selectedValues.length
      : null;

  /**
   * All checkboxes appear checked when: nothing is selected (show all), or
   * all items are explicitly selected.
   */
  const allChecked =
    selectedValues.length === 0 || selectedValues.length === totalOptions;

  const toggle = useCallback(
    (value: string) => {
      if (selectedValues.includes(value)) {
        onChange(selectedValues.filter((v) => v !== value));
      } else {
        onChange([...selectedValues, value]);
      }
    },
    [selectedValues, onChange]
  );

  // "Show All" / "Reset" → clear to [] = show everything
  const handleReset = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onChange([]);
    },
    [onChange]
  );

  const isActive = activeCount !== null;

  return (
    <div ref={wrapperRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>
      {/* Trigger button */}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Filter by ${label}${activeCount !== null ? `, ${activeCount} selected` : ""}`}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 dark:focus:ring-offset-[#0f1117]
          ${
            isActive
              ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500/60 dark:bg-blue-600/15 dark:text-blue-300"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-300 dark:hover:bg-white/5"
          }`}
      >
        <span>{label}</span>
        <FilterBadge count={activeCount ?? 0} />
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="menu"
          aria-label={`${label} filter options`}
          className="absolute top-full left-0 mt-1.5 z-50 min-w-[180px] rounded-xl border border-slate-200 bg-white shadow-lg dark:border-[#2a2d3a] dark:bg-[#161825]"
        >
          {/* Header: Show All / Reset */}
          <div className="flex items-center gap-3 px-3 pt-2 pb-1.5 border-b border-slate-100 dark:border-[#2a2d3a]">
            {isActive ? (
              <>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 focus:outline-none focus:underline"
                >
                  Show All
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 focus:outline-none focus:underline"
                >
                  Reset
                </button>
              </>
            ) : (
              <span className="text-xs text-slate-400 dark:text-slate-500 italic">
                Showing all
              </span>
            )}
          </div>

          {/* Option list */}
          <ul role="group" className="py-1 max-h-56 overflow-y-auto">
            {options.map((option) => (
              <OptionRow
                key={option.value}
                option={option}
                checked={allChecked ? true : selectedValues.includes(option.value)}
                onToggle={toggle}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});

export default DropdownFilter;
