"use client";

import { useRef, useEffect, useState } from "react";
import { Search, ChevronDown, X } from "lucide-react";

interface FilterToolbarProps {
  allProfiles: { name: string; color: string }[];
  allStates: string[];
  allTypes: string[];
  selectedProfiles: string[];
  selectedStates: string[];
  selectedTypes: string[];
  search: string;
  resultCount: number;
  totalCount: number;
  onSearchChange: (value: string) => void;
  onProfilesChange: (profiles: string[]) => void;
  onStatesChange: (states: string[]) => void;
  onTypesChange: (types: string[]) => void;
  onClearAll: () => void;
}

// ── Generic dropdown chip ──────────────────────────────────────────────────

interface DropdownChipProps {
  label: string;
  allItems: string[];
  selectedItems: string[];
  onChange: (items: string[]) => void;
  renderItem?: (item: string) => React.ReactNode;
}

function DropdownChip({
  label,
  allItems,
  selectedItems,
  onChange,
  renderItem,
}: DropdownChipProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const allSelected =
    selectedItems.length === 0 || selectedItems.length === allItems.length;

  // Count badge: show when a strict subset is selected (and not zero = "show all")
  const activeCount =
    selectedItems.length > 0 && selectedItems.length < allItems.length
      ? selectedItems.length
      : null;

  const toggle = (item: string) => {
    if (selectedItems.includes(item)) {
      onChange(selectedItems.filter((x) => x !== item));
    } else {
      onChange([...selectedItems, item]);
    }
  };

  const selectAll = () => onChange([]);
  const clearAll = () => onChange([]);

  // "Select all" resets to empty (= show all); "Clear" also resets to empty
  // per spec: zero selections = treat as "show all"
  const handleSelectAll = (e: React.MouseEvent) => {
    e.preventDefault();
    selectAll();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    clearAll();
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors
          ${
            activeCount !== null
              ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500/60 dark:bg-blue-600/15 dark:text-blue-300"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-300 dark:hover:bg-white/5"
          }`}
      >
        {label}
        {activeCount !== null && (
          <span className="rounded-full bg-blue-500 text-white text-xs w-4 h-4 flex items-center justify-center leading-none">
            {activeCount}
          </span>
        )}
        <ChevronDown
          size={14}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 min-w-[180px] rounded-xl border border-slate-200 bg-white shadow-lg dark:border-[#2a2d3a] dark:bg-[#161825]">
          {/* Select all / Clear links */}
          <div className="flex items-center gap-3 px-3 pt-2 pb-1.5 border-b border-slate-100 dark:border-[#2a2d3a]">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            >
              Clear
            </button>
          </div>

          {/* Checklist items */}
          <ul className="py-1 max-h-56 overflow-y-auto">
            {allItems.map((item) => {
              const checked =
                allSelected ? true : selectedItems.includes(item);
              return (
                <li key={item}>
                  <label className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(item)}
                      className="accent-blue-500 w-3.5 h-3.5 shrink-0"
                    />
                    {renderItem ? (
                      renderItem(item)
                    ) : (
                      <span className="text-sm text-slate-700 dark:text-slate-200 truncate">
                        {item}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── FilterToolbar ──────────────────────────────────────────────────────────

export default function FilterToolbar({
  allProfiles,
  allStates,
  allTypes,
  selectedProfiles,
  selectedStates,
  selectedTypes,
  search,
  resultCount,
  totalCount,
  onSearchChange,
  onProfilesChange,
  onStatesChange,
  onTypesChange,
  onClearAll,
}: FilterToolbarProps) {
  const allProfileNames = allProfiles.map((p) => p.name);
  const profileColorMap = Object.fromEntries(
    allProfiles.map((p) => [p.name, p.color])
  );

  const hasActiveFilters =
    search.trim() !== "" ||
    (selectedProfiles.length > 0 &&
      selectedProfiles.length < allProfileNames.length) ||
    (selectedStates.length > 0 && selectedStates.length < allStates.length) ||
    (selectedTypes.length > 0 && selectedTypes.length < allTypes.length);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Search input */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none"
        />
        <input
          type="text"
          placeholder="Search instances…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-400 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-200 dark:placeholder-slate-500"
        />
      </div>

      {/* Profile dropdown */}
      <DropdownChip
        label="Profile"
        allItems={allProfileNames}
        selectedItems={selectedProfiles}
        onChange={onProfilesChange}
        renderItem={(name) => {
          const color = profileColorMap[name] ?? "#6366f1";
          return (
            <span className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 truncate">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              {name}
            </span>
          );
        }}
      />

      {/* State dropdown */}
      <DropdownChip
        label="State"
        allItems={allStates}
        selectedItems={selectedStates}
        onChange={onStatesChange}
      />

      {/* Instance Type dropdown */}
      <DropdownChip
        label="Instance Type"
        allItems={allTypes}
        selectedItems={selectedTypes}
        onChange={onTypesChange}
      />

      {/* Clear filters button */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClearAll}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
        >
          <X size={12} />
          Clear filters
        </button>
      )}

      {/* Result count — push to the right */}
      <span className="ml-auto text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
        {resultCount} of {totalCount} instances
      </span>
    </div>
  );
}
