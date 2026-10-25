import type { PermissionAction, PermissionScope } from '@kidzzy/shared';
import { NavLink } from 'react-router';
import { usePermissions } from '@/features/auth';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  /** Shown only to users who hold it (any scope). The API still checks every request. */
  permission?: PermissionAction;
  /** Shown only with this scope of the permission (the admin's screens use "any"). */
  scope?: PermissionScope;
}

/** The main sections, in the wireframe's order. A new screen adds its link here. */
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'الرئيسية' },
  { to: '/groups', label: 'الجروبات', permission: 'groups.read' },
  { to: '/students', label: 'الطلاب', permission: 'students.read' },
  { to: '/instructors', label: 'المدرسين', permission: 'instructors.read' },
  { to: '/payments', label: 'المدفوعات', permission: 'payments.read', scope: 'any' },
  { to: '/audit-log', label: 'سجل التغييرات', permission: 'audit.read', scope: 'any' },
];

/**
 * The app's main navigation, under the header. It scrolls sideways on a phone instead of
 * wrapping, and marks the current section (aria-current="page").
 */
export function AppNav() {
  const { can, scopeFor } = usePermissions();
  const items = NAV_ITEMS.filter((item) => {
    if (!item.permission) return true;
    return item.scope ? scopeFor(item.permission) === item.scope : can(item.permission);
  });

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
