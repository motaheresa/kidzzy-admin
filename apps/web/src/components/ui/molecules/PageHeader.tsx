import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** The top of a screen: its title (display font), a short description and the screen's actions. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      data-slot="page-header"
      className={cn('flex flex-wrap items-end justify-between gap-4', className)}
    >
      <div className="grid gap-1">
        <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
