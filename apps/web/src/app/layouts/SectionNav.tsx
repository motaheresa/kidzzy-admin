import type { LucideIcon } from 'lucide-react';
import type { PermissionAction, PermissionScope } from '@kidzzy/shared';
import { NavLink } from 'react-router';
import { usePermissions } from '@/features/auth';
import { cn } from '@/lib/utils';

export interface SectionNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** True for a path that is also the start of others, so it is current only on itself. */
  end?: boolean;
  /** Shown only to users who hold it (any scope). The API still checks every request. */
  permission?: PermissionAction;
  /** Shown only with this scope of the permission (the admin's screens use "any"). */
  scope?: PermissionScope;
  /** A query string kept on the link, for example the period of the reports ("?from=…&to=…"). */
  search?: string;
}

/**
 * The icon navigation under a header, shared by the app (AppNav) and the reports workspace
 * (ReportsLayout). On a phone each link is just its icon, spread across the width; from `sm` up
 * the label shows next to it. The label stays in the DOM for screen readers, and `title` shows it
 * on hover or long press. It scrolls sideways inside itself if it ever overflows (never the page),
 * and marks the current section (aria-current="page").
 *
 * Items with a `permission` are shown only to users who hold it; the web only shows or hides, the
 * API enforces. `maxWidth` is the width of the content below, so the row lines up with it.
 */
export function SectionNav({
  label,
  items,
  maxWidth,
}: {
  /** The accessible name of the navigation landmark. */
  label: string;
  items: readonly SectionNavItem[];
  maxWidth: 'max-w-5xl' | 'max-w-7xl';
}) {
  const { can, scopeFor } = usePermissions();
  const shown = items.filter((item) => {
    if (!item.permission) return true;
    return item.scope ? scopeFor(item.permission) === item.scope : can(item.permission);
  });

  return (
    <nav aria-label={label} className={`mx-auto w-full ${maxWidth} overflow-x-auto px-4`}>
      <ul className="flex justify-between gap-1 pb-2 sm:justify-start">
        {shown.map((item) => (
          <li key={item.to}>
            <NavLink
              to={{ pathname: item.to, search: item.search }}
              title={item.label}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap',
                  'transition-colors duration-fast ease-out',
                  isActive
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <item.icon aria-hidden="true" className="size-5 shrink-0" />
              <span className="sr-only sm:not-sr-only">{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
