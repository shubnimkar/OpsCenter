"use client";

import React from "react";
import SearchFilter from "./SearchFilter";
import DropdownFilter from "./DropdownFilter";
import ClearFiltersButton from "./ClearFiltersButton";
import type { FilterToolbarProps } from "./types";

/**
 * Unified filter toolbar used by every dashboard.
 *
 * Renders, in order:
 *   SearchFilter (if onSearchChange provided)
 *   → one DropdownFilter per entry in `filters` (in the order given)
 *   → ClearFiltersButton (when hasActiveFilters is true)
 *   → result count + paginationSlot (pushed to the trailing edge)
 *
 * Recommended filter key ordering (omit unused ones):
 *   search | environment | region | status | type | profile
 */
const FilterToolbar = React.memo(function FilterToolbar({
  filters,
  filterState,
  onFilterChange,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  hasActiveFilters,
  onClearAll,
  resultCount,
  totalCount,
  resultLabel = "results",
  paginationSlot,
}: FilterToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Filter and search"
      className="flex items-center gap-2 flex-wrap"
    >
      {/* Search input */}
      {onSearchChange && (
        <SearchFilter
          value={searchValue ?? ""}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
        />
      )}

      {/* Dynamic dropdown filters */}
      {filters.map((config) => (
        <DropdownFilter
          key={config.key}
          label={config.label}
          options={config.options}
          selectedValues={filterState[config.key] ?? []}
          onChange={(values) => onFilterChange(config.key, values)}
        />
      ))}

      {/* Clear all */}
      <ClearFiltersButton visible={hasActiveFilters} onClear={onClearAll} />

      {/* Spacer + result count + pagination */}
      <div className="ml-auto flex items-center gap-3">
        {resultCount !== undefined && totalCount !== undefined && (
          <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
            {resultCount} of {totalCount} {resultLabel}
          </span>
        )}
        {paginationSlot}
      </div>
    </div>
  );
});

export default FilterToolbar;
