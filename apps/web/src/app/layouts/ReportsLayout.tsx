import {
  ArrowRightIcon,
  BanknoteIcon,
  CalendarCheckIcon,
  LayoutDashboardIcon,
  PresentationIcon,
} from 'lucide-react';
import { Outlet } from 'react-router';
import { useSession } from '@/features/auth';
import { PeriodFilter } from '@/features/reports';
import { useListParams } from '@/lib/hooks';
import { BrandHeader } from './BrandHeader';
import { SectionNav, type SectionNavItem } from './SectionNav';

/** The report pages, in order. A new report page adds one line here. */
const REPORT_PAGES: Omit<SectionNavItem, 'search'>[] = [
  { to: '/reports', label: 'نظرة عامة', icon: LayoutDashboardIcon, end: true },
  { to: '/reports/finance', label: 'الفلوس', icon: BanknoteIcon },
  { to: '/reports/sessions', label: 'الحصص', icon: CalendarCheckIcon },
  { to: '/reports/instructors', label: 'المدرسين', icon: PresentationIcon },
];

/**
 * The reports workspace frame (US-38, SCRUM-85): the same header as the app shell (logo, the
 * title "التقارير", the academy), then the same icon navigation (SectionNav) with a way back to the
 * app first and the report pages after it, then the date filter. Every report link keeps the
 * period in the URL (?from=…&to=…), so moving between pages does not reset the filter; the back
 * item does not, because the app has no period. The content is wider than the app's (max-w-7xl)
 * for the tables. The session check and the reports.read permission sit above this layout in the
 * router, so it only draws the frame.
 */
export function ReportsLayout() {
  const me = useSession();
  const { from, to } = useListParams();
  const period = new URLSearchParams();
  if (from) period.set('from', from);
  if (to) period.set('to', to);
  const search = period.size > 0 ? `?${period.toString()}` : undefined;

  const items: SectionNavItem[] = [
    { to: '/', label: 'التطبيق', icon: ArrowRightIcon, end: true },
    ...REPORT_PAGES.map((page) => ({ ...page, search })),
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4">
          <BrandHeader title="التقارير" subtitle={me.data?.academy.name} />
        </div>
        <SectionNav label="التقارير" items={items} maxWidth="max-w-7xl" />
        <div className="mx-auto w-full max-w-7xl px-4 pb-3">
          <PeriodFilter />
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 py-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
