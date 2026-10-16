import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** A placeholder shaped like the content that is loading. It pulses only when motion is allowed. */
function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('rounded-md bg-muted motion-safe:animate-pulse', className)}
      {...props}
    />
  );
}

export { Skeleton };
