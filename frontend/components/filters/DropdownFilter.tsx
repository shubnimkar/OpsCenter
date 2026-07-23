"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import FilterBadge from "./FilterBadge";
import type { DropdownFilterProps, FilterOption } from "./types";

interface OptionRowProps {
  option: FilterOption;
  checked: boolean;
  onToggle: (value: string) => void;
}

const OptionRow = React.memo(function OptionRow({ option, checked, onToggle }: OptionRowProps) {
  return (
    <li role="none">
      <label
        className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer select-none transition-colors duration-100"
        style={{ background: "transparent" }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
      >
        <input
          type="checkbox"
          role="menuitemcheckbox"
          aria-checked={checked}
          checked={checked}
          onChange={() => onToggle(option.value)}
          className="accent-blue-500 w-3.5 h-3.5 shrink-0 rounded"
        />
        {option.color ? (
          <span className="flex items-center gap-1.5 text-[13px] truncate" style={{ color: "var(--text-primary)" }}>
            <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: option.color }} aria-hidden="true" />
            {option.label ?? option.value}
          </span>
        ) : (
          <span className="text-[13px] truncate" style={{ color: "var(--text-primary)" }}>
            {option.label ?? option.value}
          </span>
        )}
      </label>
    </li>
  );
});

const DropdownFilter = React.memo(function DropdownFilter({
  label,
  options,
  selectedValues,
  onChange,
  className = "",
}: DropdownFilterProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
  }, []);

  const totalOptions = options.length;
  const activeCount = selectedValues.length > 0 && selectedValues.length < totalOptions ? selectedValues.length : null;
  const allChecked = selectedValues.length === 0 || selectedValues.length === totalOptions;

  const toggle = useCallback((value: string) => {
    if (selectedValues.includes(value)) onChange(selectedValues.filter((v) => v !== value));
    else onChange([...selectedValues, value]);
  }, [selectedValues, onChange]);

  const handleReset = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onChange([]);
  }, [onChange]);

  const isActive = activeCount !== null;

  return (
    <div ref={wrapperRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Filter by ${label}${activeCount !== null ? `, ${activeCount} selected` : ""}`}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
        style={{
          background: isActive ? "rgba(37,99,235,0.08)" : "var(--bg-card)",
          border: `1px solid ${isActive ? "rgba(59,130,246,0.45)" : "var(--border)"}`,
          color: isActive ? "var(--brand)" : "var(--text-secondary)",
        }}
      >
        <span>{label}</span>
        <FilterBadge count={activeCount ?? 0} />
        <ChevronDown size={13} aria-hidden="true" className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={`${label} filter options`}
          className="absolute top-full left-0 mt-1.5 z-50 min-w-[180px] rounded-xl overflow-hidden"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.14), 0 1px 4px rgba(0,0,0,0.06)",
          }}
        >
          <div className="flex items-center gap-3 px-3 pt-2.5 pb-2" style={{ borderBottom: "1px solid var(--border)" }}>
            {isActive ? (
              <>
                <button type="button" onClick={handleReset} className="text-[11px] font-medium text-blue-500 hover:text-blue-400 transition-colors duration-150 focus:outline-none focus:underline">
                  Show All
                </button>
                <span className="text-[11px]" style={{ color: "var(--border)" }}>·</span>
                <button type="button" onClick={handleReset} className="text-[11px] transition-colors duration-150 focus:outline-none focus:underline" style={{ color: "var(--text-tertiary)" }}>
                  Reset
                </button>
              </>
            ) : (
              <span className="text-[11px] italic" style={{ color: "var(--text-tertiary)" }}>Showing all</span>
            )}
          </div>
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
