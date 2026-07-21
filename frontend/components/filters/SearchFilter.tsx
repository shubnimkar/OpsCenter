"use client";

import React from "react";
import { Search } from "lucide-react";
import type { SearchFilterProps } from "./types";

/**
 * Controlled search input with leading magnifier icon.
 * Debouncing is handled upstream via useFilterState / useDebounce.
 */
const SearchFilter = React.memo(function SearchFilter({
  value,
  onChange,
  placeholder = "Search…",
  className = "",
}: SearchFilterProps) {
  return (
    <div className={`relative ${className}`}>
      <Search
        size={14}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none"
        aria-hidden="true"
      />
      <input
        type="search"
        role="searchbox"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-400 transition-colors dark:border-[#2a2d3a] dark:bg-[#161825] dark:text-slate-200 dark:placeholder-slate-500"
      />
    </div>
  );
});

export default SearchFilter;
