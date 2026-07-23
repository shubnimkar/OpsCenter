"use client";

import React from "react";
import { Search, X } from "lucide-react";
import type { SearchFilterProps } from "./types";

const SearchFilter = React.memo(function SearchFilter({
  value,
  onChange,
  placeholder = "Search…",
  className = "",
}: SearchFilterProps) {
  return (
    <div className={`relative ${className}`}>
      <Search
        size={13}
        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: "var(--text-tertiary)" }}
        aria-hidden="true"
      />
      <input
        type="search"
        role="searchbox"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-8 pr-8 py-1.5 rounded-lg text-[13px] transition-colors duration-150 focus:outline-none"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
          width: "200px",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors"
          style={{ color: "var(--text-tertiary)" }}
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
});

export default SearchFilter;
