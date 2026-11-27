import type { MaterialLink } from '@kidzzy/shared';
import type { MaterialLinkRow } from './material-link.repository';

export function toMaterialLink(row: MaterialLinkRow): MaterialLink {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    sortOrder: row.sortOrder,
  };
}
