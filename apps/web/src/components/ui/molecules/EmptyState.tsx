import { InboxIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * What a list or screen shows when there is nothing yet: an icon in the brand's soft circle with
 * a yellow spark (a little of the posters' personality), a title, a line of text, and an action.
 */
export function EmptyState({
  title,
  description,
  icon = <InboxIcon aria-hidden="true" />,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn('flex flex-col items-center gap-3 px-6 py-10 text-center', className)}
    >
      <div className="relative grid size-16 place-items-center rounded-full bg-secondary text-primary [&>svg]:size-7">
        {icon}
        <span
          aria-hidden="true"
          className="absolute -end-0.5 -top-0.5 size-3 rounded-full bg-accent"
        />
      </div>
      <h2 className="font-display text-xl font-semibold text-foreground">{title}</h2>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
