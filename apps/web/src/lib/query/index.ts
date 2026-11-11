// Query layer (ADR-0012): the only door to TanStack Query for features (ESLint enforces it).
import './register';

export { createQueryClient, DASHBOARD_QUERY_ROOT, shouldRetryQuery } from './client';
export { useApiMutation, useApiQuery } from './hooks';
export type { ApiMeta } from './register';
export { useQueryClient, type QueryClient } from '@tanstack/react-query';
