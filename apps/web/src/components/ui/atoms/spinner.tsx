import { Loader2Icon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * A loading indicator. Screen readers announce its label (role="status"). It spins only when
 * the user allows motion (motion-safe), and stays visible without spinning otherwise.
 */
function Spinner({
  className,
  label = 'جاري التحميل',
  ...props
}: ComponentProps<'svg'> & { label?: string }) {
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label={label}
      className={cn('size-5 text-primary motion-safe:animate-spin', className)}
      {...props}
    />
  );
}

export { Spinner };
