import type { LucideIcon } from 'lucide-react';
import {
  GraduationCapIcon,
  HistoryIcon,
  HouseIcon,
  PresentationIcon,
  UsersRoundIcon,
  WalletIcon,
} from 'lucide-react';
import type { PermissionAction, PermissionScope } from '@kidzzy/shared';
import { NavLink } from 'react-router';
import { usePermissions } from '@/features/auth';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shown only to users who hold it (any scope). The API still checks every request. */
  permission?: PermissionAction;
  /** Shown only with this scope of the permission (the admin's screens use "any"). */
  scope?: PermissionScope;
}

/** The main sections, in the wireframe's order. A new screen adds its link here. */
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'الرئيسية', icon: HouseIcon },
  { to: '/groups', label: 'الجروبات', icon: UsersRoundIcon, permission: 'groups.read' },
  { to: '/students', label: 'الطلاب', icon: GraduationCapIcon, permission: 'students.read' },
  { to: '/instructors', label: 'المدرسين', icon: PresentationIcon, permission: 'instructors.read' },
  {
    to: '/payments',
    label: 'المدفوعات',
    icon: WalletIcon,
    permission: 'payments.read',
    scope: 'any',
  },
  {
    to: '/audit-log',
    label: 'سجل التغييرات',
    icon: HistoryIcon,
    permission: 'audit.read',
    scope: 'any',
  },
];

/**
 * The app's main navigation, under the header. On a phone each link is just its icon, spread
 * across the width; from `sm` up the label shows next to it. The label stays in the DOM for
 * screen readers, and `title` shows it on hover or long press. It scrolls sideways if it ever
 * overflows, and marks the current section (aria-current="page").
 */
export function AppNav() {
  const { can, scopeFor } = usePermissions();
  const items = NAV_ITEMS.filter((item) => {
    if (!item.permission) return true;
    return item.scope ? scopeFor(item.permission) === item.scope : can(item.permission);
  });

  return (
    <nav aria-label="الأقسام" className="mx-auto w-full max-w-5xl overflow-x-auto px-4">
      <ul className="flex justify-between gap-1 pb-2 sm:justify-start">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              title={item.label}
              end={item.to === '/'}
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
