"use client";

import React from "react";
import type { FilterBadgeProps } from "./types";

/**
 * Small circular badge that shows the number of active selections in a filter.
 * Only rendered when count > 0.
 */
const FilterBadge = React.memo(function FilterBadge({ count }: FilterBadgeProps) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} selected`}
      className="rounded-full bg-blue-500 text-white text-xs w-4 h-4 flex items-center justify-center leading-none shrink-0"
    >
      {count}
    </span>
  );
});

export default FilterBadge;
