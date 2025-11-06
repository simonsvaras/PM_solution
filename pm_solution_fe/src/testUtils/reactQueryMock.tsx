import { createContext, useContext, useState, type ReactNode } from 'react';

type QueryKey = unknown;

type QueryClientLike = {
  getQueryData: (key: QueryKey) => unknown;
  setQueryData: (key: QueryKey, value: unknown) => void;
  cancelQueries: (options: { queryKey: QueryKey }) => Promise<void>;
  invalidateQueries: (options: { queryKey: QueryKey }) => Promise<void>;
  clear: () => void;
};

function serialiseKey(key: QueryKey): string {
  try {
    return JSON.stringify(key);
  } catch {
    return String(key);
  }
}

function createStore(): QueryClientLike {
  const store = new Map<string, unknown>();
  return {
    getQueryData(key: QueryKey) {
      return store.get(serialiseKey(key));
    },
    setQueryData(key: QueryKey, value: unknown) {
      store.set(serialiseKey(key), value);
    },
    async cancelQueries() {
      /* no-op in mock */
    },
    async invalidateQueries() {
      /* no-op in mock */
    },
    clear() {
      store.clear();
    },
  };
}

const QueryClientContext = createContext<QueryClientLike>(createStore());

export function QueryClientProvider({ client, children }: { client?: QueryClientLike; children: ReactNode }) {
  const [value] = useState<QueryClientLike>(() => client ?? createStore());
  return <QueryClientContext.Provider value={value}>{children}</QueryClientContext.Provider>;
}

export function useQueryClient(): QueryClientLike {
  return useContext(QueryClientContext);
}

type MutationOptions<TData, TError, TVariables, TContext> = {
  mutationFn: (variables: TVariables) => Promise<TData>;
  onMutate?: (variables: TVariables) => Promise<TContext> | TContext;
  onError?: (error: TError, variables: TVariables, context: TContext | undefined) => void;
  onSuccess?: (data: TData, variables: TVariables, context: TContext | undefined) => void;
  onSettled?: (
    data: TData | undefined,
    error: TError | null,
    variables: TVariables,
    context: TContext | undefined,
  ) => void;
};

export function useMutation<TData = unknown, TError = unknown, TVariables = unknown, TContext = unknown>(
  options: MutationOptions<TData, TError, TVariables, TContext>,
): { mutateAsync: (variables: TVariables) => Promise<TData>; isPending: boolean } {
  const [isPending, setIsPending] = useState(false);

  const mutateAsync = async (variables: TVariables) => {
    setIsPending(true);
    let context: TContext | undefined;
    try {
      if (options.onMutate) {
        context = await options.onMutate(variables);
      }
    } catch (error) {
      setIsPending(false);
      throw error;
    }
    try {
      const result = await options.mutationFn(variables);
      options.onSuccess?.(result, variables, context);
      return result;
    } catch (error) {
      options.onError?.(error as TError, variables, context);
      throw error;
    } finally {
      setIsPending(false);
      options.onSettled?.(undefined, null, variables, context);
    }
  };

  return { mutateAsync, isPending };
}

export function useQuery() {
  return { data: undefined, error: null, isPending: false, isFetching: false, refetch: async () => {} } as const;
}

export class QueryClient {
  clear(): void {}
}
