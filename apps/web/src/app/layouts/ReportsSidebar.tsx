import type { LucideIcon } from 'lucide-react';
import { ArrowRightIcon, BanknoteIcon, CalendarCheckIcon, LayoutDashboardIcon } from 'lucide-react';
import { NavLink } from 'react-router';
import { useListParams } from '@/lib/hooks';
import { cn } from '@/lib/utils';

interface SidebarItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** True for a path that is also the start of the others, so it is current only on itself. */
  end?: boolean;
}

/** The report pages that exist. A new report page adds its link here. */
const ITEMS: SidebarItem[] = [
  { to: '/reports', label: 'نظرة عامة', icon: LayoutDashboardIcon, end: true },
  { to: '/reports/finance', label: 'الفلوس', icon: BanknoteIcon },
  { to: '/reports/sessions', label: 'الحصص', icon: CalendarCheckIcon },
];

/**
 * The reports sidebar (start side): the report pages and a way back to the app. Every report link
 * keeps the period in the URL (?from=…&to=…), so moving between pages does not reset the filter.
 * `onNavigate` lets the phone menu close after a tap.
 */
export function ReportsSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { from, to } = useListParams();
  const period = new URLSearchParams();
  if (from) period.set('from', from);
  if (to) period.set('to', to);
  const search = period.size > 0 ? `?${period.toString()}` : '';

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors duration-fast ease-out hover:bg-muted',
      isActive && 'bg-muted text-primary',
    );

  return (
    <nav aria-label="التقارير" className="flex flex-col gap-1">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={{ pathname: item.to, search }}
          end={item.end}
          className={linkClass}
          onClick={onNavigate}
        >
          <item.icon className="size-4 shrink-0" aria-hidden="true" />
          {item.label}
        </NavLink>
      ))}
      <hr className="my-2 border-border" />
      <NavLink to="/" className={linkClass} onClick={onNavigate}>
        <ArrowRightIcon className="size-4 shrink-0 rtl:rotate-0" aria-hidden="true" />
        رجوع للتطبيق
      </NavLink>
    </nav>
  );
}
