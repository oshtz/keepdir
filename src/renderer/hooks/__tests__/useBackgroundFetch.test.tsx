import { renderHook, act, waitFor } from '@testing-library/react';
import useBackgroundFetch from '../useBackgroundFetch';

// Suppress act warnings for this test file since we're testing async behavior
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: An update to TestComponent inside a test was not wrapped in act')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

describe('useBackgroundFetch', () => {
  beforeEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers(); // Use real timers for async operations
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it('fetches data on mount when enabled', async () => {
    const mockFetch = jest.fn().mockResolvedValue('test data');
    
    const { result } = renderHook(() =>
      useBackgroundFetch(mockFetch, { enabled: true })
    );

    // Initially loading should be false, then become true, then false again
    expect(result.current.data).toBe(null);

    await waitFor(() => {
      expect(result.current.data).toBe('test data');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not fetch when disabled', () => {
    const mockFetch = jest.fn().mockResolvedValue('test data');
    
    const { result } = renderHook(() =>
      useBackgroundFetch(mockFetch, { enabled: false })
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe(null);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handles fetch errors', async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error('Fetch failed'));
    
    const { result } = renderHook(() =>
      useBackgroundFetch(mockFetch, { enabled: true, retryCount: 0 })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBe(null);
    expect(result.current.error).toBe('Fetch failed');
  });

  it('retries on failure', async () => {
    const mockFetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('First failure'))
      .mockResolvedValue('success');
    
    const { result } = renderHook(() =>
      useBackgroundFetch(mockFetch, {
        enabled: true,
        retryCount: 2,
        retryDelay: 100 // Use shorter delay for testing
      })
    );

    // Initial call fails
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Wait for retry to complete
    await waitFor(() => {
      expect(result.current.data).toBe('success');
    }, { timeout: 3000 });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('sets up interval for background fetching', async () => {
    const mockFetch = jest.fn().mockResolvedValue('test data');
    
    const { unmount } = renderHook(() =>
      useBackgroundFetch(mockFetch, {
        enabled: true,
        interval: 200 // Use shorter interval for testing
      })
    );

    // Initial fetch
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Wait for interval to trigger
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    }, { timeout: 1000 });

    unmount();
  });

  it('refetch function works', async () => {
    const mockFetch = jest.fn().mockResolvedValue('test data');
    
    const { result } = renderHook(() =>
      useBackgroundFetch(mockFetch, { enabled: true })
    );

    // Wait for initial fetch
    await waitFor(() => {
      expect(result.current.data).toBe('test data');
    });

    // Call refetch
    await act(async () => {
      await result.current.refetch();
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('clearCache function works', async () => {
    const mockFetch = jest.fn().mockResolvedValue('test data');
    
    const { result } = renderHook(() =>
      useBackgroundFetch(mockFetch, { enabled: true })
    );

    // Wait for initial fetch
    await waitFor(() => {
      expect(result.current.data).toBe('test data');
    });

    // Clear cache
    act(() => {
      result.current.clearCache();
    });

    expect(result.current.data).toBe(null);
    expect(result.current.error).toBe(null);
    expect(result.current.lastFetched).toBe(null);
  });

  it('updates lastFetched timestamp', async () => {
    const mockFetch = jest.fn().mockResolvedValue('test data');
    
    const { result } = renderHook(() =>
      useBackgroundFetch(mockFetch, { enabled: true })
    );

    await waitFor(() => {
      expect(result.current.data).toBe('test data');
    });

    expect(result.current.lastFetched).toBeInstanceOf(Date);
  });

  it('cleans up intervals on unmount', () => {
    const mockFetch = jest.fn().mockResolvedValue('test data');
    
    const { unmount } = renderHook(() =>
      useBackgroundFetch(mockFetch, { 
        enabled: true, 
        interval: 5000 
      })
    );

    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    
    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});