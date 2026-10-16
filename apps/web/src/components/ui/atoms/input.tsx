import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * A text input, 44 px high. Its edge uses the input token (3:1 against the page), and
 * aria-invalid turns it danger. 16 px text keeps iOS from zooming in on focus.
 */
function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-11 w-full min-w-0 rounded-md border border-input bg-surface px-3 text-base text-foreground',
        'transition-colors duration-fast ease-out placeholder:text-muted-foreground',
        'focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-60',
        'aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
