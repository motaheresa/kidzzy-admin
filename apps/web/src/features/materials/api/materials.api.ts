import { http } from '@/lib/http';
import type { MaterialLink, MaterialLinkCreate, MaterialLinkUpdate } from '../types';

// The material link endpoints (openapi.yaml, tag Materials). Components never call them; the
// hooks do.

/** GET /material-links: every link of the academy, in the admin's order. */
export async function listMaterialLinks(signal?: AbortSignal): Promise<MaterialLink[]> {
  const result = await http.get<{ data: MaterialLink[] }>('/material-links', { signal });
  return result.data;
}

/** POST /material-links: the new link goes to the end. */
export function createMaterialLink(body: MaterialLinkCreate): Promise<MaterialLink> {
  return http.post<MaterialLink>('/material-links', body);
}

/** PATCH /material-links/{id} */
export function updateMaterialLink(id: string, body: MaterialLinkUpdate): Promise<MaterialLink> {
  return http.patch<MaterialLink>(`/material-links/${id}`, body);
}

/** DELETE /material-links/{id} */
export function deleteMaterialLink(id: string): Promise<void> {
  return http.delete<void>(`/material-links/${id}`);
}

/** PUT /material-links/order: every id exactly once, in the new order. */
export async function reorderMaterialLinks(ids: string[]): Promise<MaterialLink[]> {
  const result = await http.put<{ data: MaterialLink[] }>('/material-links/order', { ids });
  return result.data;
}
