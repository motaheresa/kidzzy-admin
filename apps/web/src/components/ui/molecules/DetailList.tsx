import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A record's fields as label and value pairs (a <dl>), two columns from small screens up.
 * An empty value shows a dash, so a missing field never looks like a layout gap.
 */
export function DetailList({
  items,
  className,
}: {
  items: { label: string; value: ReactNode; dir?: 'ltr' | 'rtl' }[];
  className?: string;
}) {
  return (
    <dl data-slot="detail-list" className={cn('grid gap-4 sm:grid-cols-2', className)}>
      {items.map(({ label, value, dir }) => (
        <div key={label} className="grid gap-1">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-foreground" dir={dir}>
            {value === null || value === undefined || value === '' ? '—' : value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
