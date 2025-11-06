import { useCallback, useEffect, useState, type DependencyList } from 'react';

type UseQueryOptions<T> = {
  enabled?: boolean;
  initialData?: T | null;
};

export type UseQueryResult<T> = {
  data: T | null;
  error: unknown;
  isLoading: boolean;
  refetch: () => void;
};

export function useQuery<T>(queryFn: () => Promise<T>, deps: DependencyList = [], options?: UseQueryOptions<T>): UseQueryResult<T> {
  const enabled = options?.enabled ?? true;
  const [data, setData] = useState<T | null>(options?.initialData ?? null);
  const [error, setError] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const refetch = useCallback(() => {
    setReloadKey(prev => prev + 1);
    setError(null);
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    queryFn()
      .then(result => {
        if (!cancelled) {
          setData(result);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [...deps, reloadKey, enabled]);

  return { data, error, isLoading, refetch };
}

export default useQuery;
