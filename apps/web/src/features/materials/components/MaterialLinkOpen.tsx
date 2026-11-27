import { ExternalLinkIcon } from 'lucide-react';
import { linkHost } from '../lib/links';
import type { MaterialLink } from '../types';

/**
 * One link to open (US-33): its title and domain, all of it the thing to press. It opens in a
 * new tab, so the app stays where it is, and the new page gets no handle on the app (noopener)
 * and no address of it (noreferrer). The design system has no link-out component.
 */
export function MaterialLinkOpen({ link }: { link: MaterialLink }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      // relative: keeps the hidden hint (sr-only is absolutely positioned) inside the link.
      className="relative flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1 transition-colors duration-fast ease-out hover:bg-muted"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium wrap-anywhere">{link.title}</span>
        <span dir="ltr" className="self-start text-xs wrap-anywhere text-muted-foreground">
          {linkHost(link.url)}
        </span>
      </span>
      <ExternalLinkIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="sr-only">(بيفتح في صفحة جديدة)</span>
    </a>
  );
}
