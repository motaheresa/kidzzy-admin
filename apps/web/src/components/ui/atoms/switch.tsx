import { Switch as SwitchPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * An on/off setting that applies at once, such as turning a rule on or off (shadcn/ui radix-nova
 * switch, on our tokens). Radix gives it role="switch", aria-checked and Space/Enter. The hit
 * area is 44 px high; the track is smaller inside it. In right-to-left the thumb moves the right
 * way through the logical `rtl:` variant. Give it an aria-label or a <Label htmlFor>.
 */
function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'group inline-flex h-11 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          'flex h-6 w-11 items-center rounded-full bg-input p-0.5 transition-colors duration-fast ease-out',
          'group-data-[state=checked]:bg-primary',
        )}
      >
        <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          className={cn(
            'block size-5 rounded-full bg-surface shadow-sm transition-transform duration-fast ease-out',
            'data-[state=checked]:translate-x-5 rtl:data-[state=checked]:-translate-x-5',
          )}
        />
      </span>
    </SwitchPrimitive.Root>
  );
}

export { Switch };
