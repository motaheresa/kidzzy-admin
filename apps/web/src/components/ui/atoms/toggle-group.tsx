import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * A row of options where one (type="single") or several are on, such as a list filter
 * (shadcn/ui radix-nova toggle-group, on our tokens). Radix gives it arrow-key navigation and
 * aria-pressed / aria-checked. Each item is 44 px high.
 */
function ToggleGroup({ className, ...props }: ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn('inline-flex w-fit items-center gap-1 rounded-lg bg-muted p-1', className)}
      {...props}
    />
  );
}

function ToggleGroupItem({
  className,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        'inline-flex h-11 min-w-11 items-center justify-center rounded-md px-4 text-sm font-medium',
        'text-muted-foreground transition-colors duration-fast ease-out hover:text-foreground',
        'data-[state=on]:bg-surface data-[state=on]:text-foreground data-[state=on]:shadow-sm',
        'disabled:pointer-events-none disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
