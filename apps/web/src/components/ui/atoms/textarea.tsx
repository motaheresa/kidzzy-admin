import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** A multi-line text field, styled like Input: it grows with its text, 16 px text (no iOS zoom). */
function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'field-sizing-content min-h-24 w-full rounded-md border border-input bg-surface px-3 py-2',
        'text-base text-foreground transition-colors duration-fast ease-out',
        'placeholder:text-muted-foreground focus-visible:border-ring',
        'disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
