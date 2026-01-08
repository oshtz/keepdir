import { useState, useEffect, useRef, useCallback } from 'react';

interface BackgroundFetchOptions {
  interval?: number;
  enabled?: boolean;
  retryCount?: number;
  retryDelay?: number;
}

interface BackgroundFetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastFetched: Date | null;
}

function useBackgroundFetch<T>(
  fetchFunction: () => Promise<T>,
  options: BackgroundFetchOptions = {}
): BackgroundFetchState<T> & {
  refetch: () => Promise<void>;
  clearCache: () => void;
} {
  const {
    interval = 30000, // 30 seconds default
    enabled = true,
    retryCount = 3,
    retryDelay = 1000
  } = options;

  const [state, setState] = useState<BackgroundFetchState<T>>({
    data: null,
    loading: false,
    error: null,
    lastFetched: null
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentRetryCount = useRef(0);

  const fetchData = useCallback(async (isRetry = false) => {
    if (!enabled) return;

    if (!isRetry) {
      setState(prev => ({ ...prev, loading: true, error: null }));
    }

    try {
      const result = await fetchFunction();
      setState({
        data: result,
        loading: false,
        error: null,
        lastFetched: new Date()
      });
      currentRetryCount.current = 0;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (currentRetryCount.current < retryCount) {
        currentRetryCount.current++;
        // Set loading to false when scheduling a retry
        setState(prev => ({
          ...prev,
          loading: false,
          error: errorMessage
        }));
        retryTimeoutRef.current = setTimeout(() => {
          fetchData(true);
        }, retryDelay * currentRetryCount.current);
      } else {
        setState(prev => ({
          ...prev,
          loading: false,
          error: errorMessage
        }));
        currentRetryCount.current = 0;
      }
    }
  }, [fetchFunction, enabled, retryCount, retryDelay]);

  const refetch = useCallback(async () => {
    currentRetryCount.current = 0;
    await fetchData();
  }, [fetchData]);

  const clearCache = useCallback(() => {
    setState({
      data: null,
      loading: false,
      error: null,
      lastFetched: null
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Initial fetch
    fetchData();

    // Set up interval for background fetching
    if (interval > 0) {
      intervalRef.current = setInterval(() => {
        fetchData();
      }, interval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [fetchData, interval, enabled]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  return {
    ...state,
    refetch,
    clearCache
  };
}

export default useBackgroundFetch;