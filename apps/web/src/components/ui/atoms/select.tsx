import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * A choice from a short list. It wraps the NATIVE <select> (not a custom popup): the phone's own
 * picker is the best control for staff on mobile, it is accessible by default, and it works
 * with the keyboard without extra code. Styled like Input: 44 px high, 16 px text (no iOS zoom).
 */
function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(
        'h-11 w-full min-w-0 rounded-md border border-input bg-surface px-3 text-base text-foreground',
        'transition-colors duration-fast ease-out focus-visible:border-ring',
        'disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export { Select };
