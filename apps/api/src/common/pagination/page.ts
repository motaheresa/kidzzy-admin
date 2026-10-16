import type { Page } from '@kidzzy/shared';

/** What a repository needs to read one page: how many rows to skip and to take. */
export interface PageWindow {
  skip: number;
  take: number;
}

export function pageWindow(query: { page: number; pageSize: number }): PageWindow {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

/** The list response `{ data, meta }` (openapi.yaml: PageMeta). */
export function toPage<T>(
  data: T[],
  query: { page: number; pageSize: number },
  total: number,
): Page<T> {
  return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
}
