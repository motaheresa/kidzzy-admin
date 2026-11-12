import { useState } from 'react';
import { MenuIcon, XIcon } from 'lucide-react';
import { Outlet } from 'react-router';
import { Button } from '@/components/ui';
import { useSession } from '@/features/auth';
import { PeriodFilter } from '@/features/reports';
import { cn } from '@/lib/utils';
import { ReportsSidebar } from './ReportsSidebar';

/**
 * The reports workspace (US-38): a frame of its own, not the app shell, for large screens. A top
 * bar with the academy and the date filter, the sidebar on the start side, and the report page.
 * On a phone the sidebar collapses behind a menu button. It only draws the frame: the router puts
 * SessionGateLayout (who is signed in) and RequirePermission reports.read (any) above it.
 */
export function ReportsLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const me = useSession();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
        <div className="flex h-16 w-full items-center gap-3 px-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-expanded={menuOpen}
            aria-controls="reports-sidebar"
            aria-label={menuOpen ? 'اقفل القايمة' : 'افتح القايمة'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <XIcon aria-hidden="true" /> : <MenuIcon aria-hidden="true" />}
          </Button>
          <img src="/pwa-64x64.png" alt="" width={40} height={40} className="size-10 shrink-0" />
          <div className="grid min-w-0 leading-tight">
            <span className="truncate font-display text-lg font-bold text-primary">التقارير</span>
            <span className="truncate text-xs text-muted-foreground">{me.data?.academy.name}</span>
          </div>
        </div>
        <div className="px-4 pb-3">
          <PeriodFilter />
        </div>
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <aside
          id="reports-sidebar"
          className={cn(
            'shrink-0 border-b border-border bg-surface p-3 md:block md:w-60 md:border-e md:border-b-0',
            menuOpen ? 'block' : 'hidden',
          )}
        >
          <ReportsSidebar onNavigate={() => setMenuOpen(false)} />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
