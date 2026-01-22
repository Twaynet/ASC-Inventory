'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

interface UsePageDataOptions<T> {
  /** Function to fetch data, receives token */
  fetchFn: (token: string) => Promise<T>;
  /** Dependencies that trigger refetch (besides token) */
  deps?: unknown[];
  /** Required role(s) to access page - if not met, returns accessDenied: true */
  requiredRoles?: string[];
  /** Skip initial fetch (useful for conditional loading) */
  skipInitialFetch?: boolean;
}

interface UsePageDataResult<T> {
  /** The fetched data */
  data: T | null;
  /** Loading state for initial auth check */
  isLoading: boolean;
  /** Loading state for data fetching */
  isLoadingData: boolean;
  /** Error message if fetch failed */
  error: string;
  /** Success message (auto-clears after 3s if autoCloseSuccess is true) */
  successMessage: string;
  /** Set error message */
  setError: (msg: string) => void;
  /** Set success message */
  setSuccessMessage: (msg: string) => void;
  /** Clear error */
  clearError: () => void;
  /** Clear success message */
  clearSuccess: () => void;
  /** Manually refetch data */
  refetch: () => Promise<void>;
  /** Current user */
  user: ReturnType<typeof useAuth>['user'];
  /** Auth token */
  token: string | null;
  /** True if user lacks required role */
  accessDenied: boolean;
}

/**
 * Hook for common page data loading pattern.
 * Handles auth redirect, role checking, loading states, and error handling.
 *
 * @example
 * ```tsx
 * const { data, isLoadingData, error, setError, refetch } = usePageData({
 *   fetchFn: (token) => getUsers(token),
 *   requiredRoles: ['ADMIN'],
 * });
 * ```
 */
export function usePageData<T>(options: UsePageDataOptions<T>): UsePageDataResult<T> {
  const { fetchFn, deps = [], requiredRoles, skipInitialFetch = false } = options;
  const { user, token, isLoading } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<T | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(!skipInitialFetch);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Stabilize fetchFn to prevent infinite loops
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  // Check role access
  const userRoles = user?.roles || (user?.role ? [user.role] : []);
  const accessDenied = requiredRoles
    ? !requiredRoles.some(role => userRoles.includes(role))
    : false;

  // Serialize deps for stable comparison
  const depsKey = JSON.stringify(deps);

  const loadData = useCallback(async () => {
    if (!token) return;
    if (accessDenied) return;

    setIsLoadingData(true);
    try {
      const result = await fetchFnRef.current(token);
      setData(result);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoadingData(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, accessDenied, depsKey]);

  // Initial fetch
  useEffect(() => {
    if (token && user && !accessDenied && !skipInitialFetch) {
      loadData();
    }
  }, [token, user, loadData, accessDenied, skipInitialFetch]);

  const clearError = useCallback(() => setError(''), []);
  const clearSuccess = useCallback(() => setSuccessMessage(''), []);

  return {
    data,
    isLoading,
    isLoadingData,
    error,
    successMessage,
    setError,
    setSuccessMessage,
    clearError,
    clearSuccess,
    refetch: loadData,
    user,
    token,
    accessDenied,
  };
}

/**
 * Wrapper for async operations with error handling.
 * Use this for create/update/delete operations.
 *
 * @example
 * ```tsx
 * const handleCreate = async () => {
 *   await withErrorHandling(
 *     () => createUser(token, data),
 *     setError,
 *     () => {
 *       setSuccessMessage('User created');
 *       refetch();
 *     }
 *   );
 * };
 * ```
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  setError: (msg: string) => void,
  onSuccess?: (result: T) => void,
  errorPrefix?: string
): Promise<T | null> {
  try {
    const result = await operation();
    onSuccess?.(result);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Operation failed';
    setError(errorPrefix ? `${errorPrefix}: ${message}` : message);
    return null;
  }
}
