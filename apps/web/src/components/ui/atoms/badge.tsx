import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** A short status label. Soft background with its paired foreground (both checked for AA). */
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:size-3',
  {
    variants: {
      variant: {
        neutral: 'bg-muted text-muted-foreground',
        brand: 'bg-secondary text-secondary-foreground',
        accent: 'bg-accent text-accent-foreground',
        success: 'bg-success-soft text-success-soft-foreground',
        warning: 'bg-warning-soft text-warning-soft-foreground',
        danger: 'bg-danger-soft text-danger-soft-foreground',
        info: 'bg-info-soft text-info-soft-foreground',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

function Badge({
  className,
  variant,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge };
