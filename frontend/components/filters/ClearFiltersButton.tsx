"use client";

import React from "react";
import { X } from "lucide-react";
import type { ClearFiltersButtonProps } from "./types";

/**
 * "Clear filters" button, only visible when at least one filter is active.
 */
const ClearFiltersButton = React.memo(function ClearFiltersButton({
  visible,
  onClear,
  className = "",
}: ClearFiltersButtonProps) {
  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={onClear}
      className={`flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors ${className}`}
    >
      <X size={12} />
      Clear filters
    </button>
  );
});

export default ClearFiltersButton;
