"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseInitialFetchResult<T> {
  data: T | null;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  lastUpdated: Date | null;
  reload: (opts?: { showLoading?: boolean }) => Promise<void>;
}

/**
 * Fetch data on mount without synchronous setState inside useEffect
 * (satisfies react-hooks/set-state-in-effect).
 */
export function useInitialFetch<T>(fetcher: () => Promise<T>): UseInitialFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const reload = useCallback(async (opts?: { showLoading?: boolean }) => {
    if (opts?.showLoading) setLoading(true);
    try {
      const result = await fetcher();
      setData(result);
      setLastUpdated(new Date());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      if (opts?.showLoading) setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    let cancelled = false;
    fetcher()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLastUpdated(new Date());
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Unknown error");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fetcher]);

  return { data, setData, loading, setLoading, error, setError, lastUpdated, reload };
}

interface UseResourceLoadOptions<T> {
  fetcher: () => Promise<T>;
  onData: (data: T) => void;
  beforeRefresh?: () => Promise<void>;
}

/** Standard dashboard load + refresh pattern (mount fetch + manual reload). */
export function useResourceLoad<T>({ fetcher, onData, beforeRefresh }: UseResourceLoadOptions<T>) {
  const onDataRef = useRef(onData);

  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
      try {
        if (beforeRefresh) await beforeRefresh();
      } catch {
        // best-effort scheduler trigger
      }
    } else {
      setLoading(true);
    }
    try {
      const data = await fetcher();
      onDataRef.current(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetcher, beforeRefresh]);

  useEffect(() => {
    let cancelled = false;
    fetcher()
      .then((data) => {
        if (!cancelled) {
          onDataRef.current(data);
          setLastUpdated(new Date());
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Unknown error");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fetcher]);

  return { loading, error, lastUpdated, refreshing, load, setError };
}
