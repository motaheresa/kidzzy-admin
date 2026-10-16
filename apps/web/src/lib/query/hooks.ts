import {
  useMutation,
  useQuery,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { AppError } from '@/lib/errors';

/**
 * Reads data from the API: TanStack Query's useQuery with the app's types (errors are AppError,
 * meta is ApiMeta). Feature hooks use this, never useQuery directly (ESLint enforces it).
 */
export function useApiQuery<
  TQueryFnData,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UseQueryOptions<TQueryFnData, AppError, TData, TQueryKey>,
): UseQueryResult<TData, AppError> {
  return useQuery(options);
}

/** Changes data through the API: TanStack Query's useMutation with the app's types. */
export function useApiMutation<TData = unknown, TVariables = void, TContext = unknown>(
  options: UseMutationOptions<TData, AppError, TVariables, TContext>,
): UseMutationResult<TData, AppError, TVariables, TContext> {
  return useMutation(options);
}
