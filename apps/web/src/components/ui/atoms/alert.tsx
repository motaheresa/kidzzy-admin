import { cva, type VariantProps } from 'class-variance-authority';
import { CircleAlertIcon, CircleCheckIcon, InfoIcon, TriangleAlertIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  [
    'grid w-full gap-0.5 rounded-md border px-4 py-3 text-start text-sm',
    'has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-3',
    '*:[svg]:row-span-2 *:[svg]:mt-0.5 *:[svg]:size-4 *:[svg]:text-current',
  ].join(' '),
  {
    variants: {
      variant: {
        info: 'border-info-soft-foreground/20 bg-info-soft text-info-soft-foreground',
        success: 'border-success-soft-foreground/20 bg-success-soft text-success-soft-foreground',
        warning: 'border-warning-soft-foreground/20 bg-warning-soft text-warning-soft-foreground',
        danger: 'border-danger-soft-foreground/20 bg-danger-soft text-danger-soft-foreground',
      },
    },
    defaultVariants: { variant: 'info' },
  },
);

const ICONS = {
  info: InfoIcon,
  success: CircleCheckIcon,
  warning: TriangleAlertIcon,
  danger: CircleAlertIcon,
};

/**
 * A message in the page. danger and warning interrupt screen readers (role="alert"); info and
 * success are announced politely (role="status"). The icon is decorative.
 */
function Alert({
  className,
  variant,
  icon,
  children,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof alertVariants> & { icon?: ReactNode | null }) {
  const kind = variant ?? 'info';
  const Icon = ICONS[kind];
  return (
    <div
      data-slot="alert"
      role={kind === 'danger' || kind === 'warning' ? 'alert' : 'status'}
      className={cn(alertVariants({ variant: kind }), className)}
      {...props}
    >
      {/* The icon spans both rows; title and description flow into the second column. */}
      {icon === undefined ? <Icon aria-hidden="true" /> : icon}
      {children}
    </div>
  );
}

function AlertTitle({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="alert-title" className={cn('font-medium', className)} {...props} />;
}

function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div data-slot="alert-description" className={cn('text-sm opacity-90', className)} {...props} />
  );
}

export { Alert, AlertDescription, AlertTitle };
