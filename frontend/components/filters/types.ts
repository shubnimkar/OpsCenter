// ── Shared filter types ────────────────────────────────────────────────────

export interface FilterOption {
  value: string;
  label?: string;
  /** Optional color dot rendered beside the label (used for profiles) */
  color?: string;
}

/**
 * A single declarative filter configuration.
 * The FilterToolbar renders one DropdownFilter per config entry.
 */
export interface FilterConfig {
  key: string;
  label: string;
  type: "multi-select";
  options: FilterOption[];
}

/**
 * Generic filter state: a map from filter key → selected values.
 * An empty array means "show all" (no filter applied).
 */
export type FilterState = Record<string, string[]>;

// ── Component props ────────────────────────────────────────────────────────

export interface DropdownFilterProps {
  label: string;
  options: FilterOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  className?: string;
}

export interface SearchFilterProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export interface ClearFiltersButtonProps {
  visible: boolean;
  onClear: () => void;
  className?: string;
}

export interface FilterBadgeProps {
  count: number;
}

export interface FilterToolbarProps {
  /** Ordered list of filter configs to render */
  filters: FilterConfig[];
  filterState: FilterState;
  onFilterChange: (key: string, values: string[]) => void;
  /** Search input */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Whether any filter or search is currently active */
  hasActiveFilters: boolean;
  onClearAll: () => void;
  /** Result count display */
  resultCount?: number;
  totalCount?: number;
  resultLabel?: string;
  /** Optional pagination controls rendered on the trailing edge */
  paginationSlot?: React.ReactNode;
}
