"use client";

import React from "react";
import SearchFilter from "./SearchFilter";
import DropdownFilter from "./DropdownFilter";
import ClearFiltersButton from "./ClearFiltersButton";
import type { FilterToolbarProps } from "./types";

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
    <div role="toolbar" aria-label="Filter and search" className="flex items-center gap-2 flex-wrap">
      {onSearchChange && (
        <SearchFilter value={searchValue ?? ""} onChange={onSearchChange} placeholder={searchPlaceholder} />
      )}
      {filters.map((config) => (
        <DropdownFilter
          key={config.key}
          label={config.label}
          options={config.options}
          selectedValues={filterState[config.key] ?? []}
          onChange={(values) => onFilterChange(config.key, values)}
        />
      ))}
      <ClearFiltersButton visible={hasActiveFilters} onClear={onClearAll} />
      <div className="ml-auto flex items-center gap-3">
        {resultCount !== undefined && totalCount !== undefined && (
          <span className="text-[12px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>
            {resultCount.toLocaleString()} of {totalCount.toLocaleString()} {resultLabel}
          </span>
        )}
        {paginationSlot}
      </div>
    </div>
  );
});

export default FilterToolbar;
