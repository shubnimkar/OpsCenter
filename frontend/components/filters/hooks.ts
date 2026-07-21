"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { FilterState } from "./types";

// ── useDebounce ────────────────────────────────────────────────────────────

/**
 * Debounces a value by the given delay (ms).
 * Use this for search input to avoid firing on every keystroke.
 */
export function useDebounce<T>(value: T, delay = 300, onDebounced?: (value: T) => void): T {
  const [debounced, setDebounced] = useState<T>(value);
  const onDebouncedRef = useRef(onDebounced);

  useEffect(() => {
    onDebouncedRef.current = onDebounced;
  }, [onDebounced]);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(value);
      onDebouncedRef.current?.(value);
    }, delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}

// ── useOutsideClick ────────────────────────────────────────────────────────

/**
 * Attaches a mousedown listener to the document and calls `onClose` whenever
 * a click is detected outside the referenced element.
 */
export function useOutsideClick<T extends HTMLElement>(
  onClose: () => void
): React.RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return ref;
}

// ── useFilterState ─────────────────────────────────────────────────────────

interface UseFilterStateOptions {
  /** Called whenever any filter or search changes so callers can reset page. */
  onFilterChange?: () => void;
}

interface UseFilterStateReturn {
  filterState: FilterState;
  setFilter: (key: string, values: string[]) => void;
  clearFilters: (defaults?: FilterState) => void;
  search: string;
  setSearch: (value: string) => void;
  debouncedSearch: string;
  /** True when any filter has values selected, or search is non-empty. */
  hasActiveFilters: (options: Record<string, string[]>) => boolean;
}

/**
 * Central filter state manager for a dashboard.
 *
 * Convention: selectedValues = [] means "show all" (no filter applied).
 *
 * Usage:
 *   const { filterState, setFilter, clearFilters, search, setSearch, debouncedSearch } =
 *     useFilterState({ onFilterChange: () => setPage(1) });
 */
export function useFilterState(
  options?: UseFilterStateOptions
): UseFilterStateReturn {
  const { onFilterChange } = options ?? {};

  const [filterState, setFilterState] = useState<FilterState>({});
  const [search, setSearchRaw] = useState("");
  const debouncedSearch = useDebounce(search, 300, () => onFilterChange?.());

  const setFilter = useCallback(
    (key: string, values: string[]) => {
      setFilterState((prev) => ({ ...prev, [key]: values }));
      onFilterChange?.();
    },
    [onFilterChange]
  );

  const setSearch = useCallback(
    (value: string) => {
      setSearchRaw(value);
      // Pagination reset is triggered via the debouncedSearch effect in the dashboard
    },
    []
  );

  const clearFilters = useCallback(
    (defaults?: FilterState) => {
      setFilterState(defaults ?? {});
      setSearchRaw("");
      onFilterChange?.();
    },
    [onFilterChange]
  );

  /**
   * A filter key is "active" when:
   *   selected.length > 0 && selected.length < options[key].length
   */
  const hasActiveFilters = useCallback(
    (allOptions: Record<string, string[]>): boolean => {
      if (debouncedSearch.trim() !== "") return true;
      return Object.entries(filterState).some(([key, selected]) => {
        const total = allOptions[key]?.length ?? 0;
        return selected.length > 0 && selected.length < total;
      });
    },
    [filterState, debouncedSearch]
  );

  return {
    filterState,
    setFilter,
    clearFilters,
    search,
    setSearch,
    debouncedSearch,
    hasActiveFilters,
  };
}

// ── applyFilters ───────────────────────────────────────────────────────────

/**
 * Generic filter function.
 *
 * For each entry in `filterState`, checks that `getField(item, key)` is either:
 *   - included in the selected values, or
 *   - the selected list is empty (= show all).
 *
 * Also applies a text search via `searchFields`.
 */
export function applyFilters<T>(
  items: T[],
  filterState: FilterState,
  debouncedSearch: string,
  getField: (item: T, key: string) => string,
  searchFields: (item: T) => string[]
): T[] {
  return items.filter((item) => {
    // Filter keys
    for (const [key, selected] of Object.entries(filterState)) {
      if (selected.length === 0) continue; // empty = show all
      if (!selected.includes(getField(item, key))) return false;
    }
    // Search
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      const fields = searchFields(item);
      if (!fields.some((f) => f.toLowerCase().includes(q))) return false;
    }
    return true;
  });
}
