import type { MaterialLink } from '../types';

/** The domain of a link, shown under its title; the whole text if it is not an address. */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** The ids of the list with the link at `index` swapped with its neighbour (-1 up, 1 down). */
export function movedIds(links: MaterialLink[], index: number, step: -1 | 1): string[] {
  const ids = links.map((link) => link.id);
  [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
  return ids;
}

/** The list as it will be after saving `ids`: the same links, in that order, numbered from 1. */
export function inOrder(links: MaterialLink[], ids: string[]): MaterialLink[] {
  const byId = new Map(links.map((link) => [link.id, link]));
  return ids.flatMap((id, index) => {
    const link = byId.get(id);
    return link ? [{ ...link, sortOrder: index + 1 }] : [];
  });
}
