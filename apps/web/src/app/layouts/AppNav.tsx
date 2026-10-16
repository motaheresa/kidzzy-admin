import type { PermissionAction } from '@kidzzy/shared';
import { NavLink } from 'react-router';
import { usePermissions } from '@/features/auth';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  /** Shown only to users who hold it (any scope). The API still checks every request. */
  permission?: PermissionAction;
}

/** The main sections, in the wireframe's order. A new screen adds its link here. */
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'الرئيسية' },
  { to: '/instructors', label: 'المدرسين', permission: 'instructors.read' },
];

/**
 * The app's main navigation, under the header. It scrolls sideways on a phone instead of
 * wrapping, and marks the current section (aria-current="page").
 */
export function AppNav() {
  const { can } = usePermissions();
  const items = NAV_ITEMS.filter((item) => !item.permission || can(item.permission));

  return (
    <nav aria-label="الأقسام" className="mx-auto w-full max-w-5xl overflow-x-auto px-4">
      <ul className="flex gap-1 pb-2">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'inline-flex h-11 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap',
                  'transition-colors duration-fast ease-out',
                  isActive
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
