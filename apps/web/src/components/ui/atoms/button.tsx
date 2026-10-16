import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2Icon } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * Every size is at least 44 px high (touch target). Press feedback is a slight scale, only when
 * the user allows motion, timed by the motion tokens (duration-fast, ease-out).
 */
const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent',
    'font-medium whitespace-nowrap select-none',
    'transition-[color,background-color,border-color,transform] duration-fast ease-out',
    'motion-safe:active:scale-[0.98]',
    'disabled:pointer-events-none disabled:opacity-60 aria-busy:cursor-wait',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(' '),
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
        outline: 'border-input bg-surface text-foreground hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
        danger: 'bg-danger text-danger-foreground hover:bg-danger/90',
        accent: 'bg-accent text-accent-foreground hover:bg-accent/85',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        md: 'h-11 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'size-11',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (a link) with the button's look instead of a <button>. */
    asChild?: boolean;
    /** Shows a spinner, sets aria-busy and blocks clicks while an action runs. */
    loading?: boolean;
  };

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  type,
  children,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root
        data-slot="button"
        className={cn(buttonVariants({ variant, size }), className)}
        aria-disabled={disabled || undefined}
        {...props}
      >
        {children}
      </Slot.Root>
    );
  }

  return (
    <button
      data-slot="button"
      // A button outside a form never submits by accident.
      type={type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading && <Loader2Icon aria-hidden="true" className="motion-safe:animate-spin" />}
      {children}
    </button>
  );
}

export { Button, type ButtonProps };
