import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

/**
 * A modal question that needs an answer before going on (shadcn/ui radix-nova, on our tokens):
 * Radix traps the focus inside, closes on Escape, and returns the focus to the trigger.
 * AlertDialog > AlertDialogTrigger + AlertDialogContent > Header (Title, Description) + Footer.
 */
function AlertDialog(props: ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger(props: ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

function AlertDialogContent({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay
        data-slot="alert-dialog-overlay"
        className="fixed inset-0 z-50 bg-foreground/40"
      />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          // Centered without a horizontal translate, so it is the same in RTL and LTR.
          'fixed inset-x-4 top-1/2 z-50 mx-auto grid max-w-md -translate-y-1/2 gap-4',
          'rounded-lg border border-border bg-card p-5 text-card-foreground shadow-lg',
          className,
        )}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  );
}

function AlertDialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn('grid gap-1.5 text-start', className)}
      {...props}
    />
  );
}

function AlertDialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn('font-display text-lg font-semibold', className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

/** Closes the dialog when clicked; for an answer that needs no waiting. */
function AlertDialogAction({
  variant = 'primary',
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Action> &
  Pick<ComponentProps<typeof Button>, 'variant'>) {
  return (
    <Button variant={variant} asChild>
      <AlertDialogPrimitive.Action data-slot="alert-dialog-action" {...props} />
    </Button>
  );
}

function AlertDialogCancel({
  variant = 'outline',
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Cancel> &
  Pick<ComponentProps<typeof Button>, 'variant'>) {
  return (
    <Button variant={variant} asChild>
      <AlertDialogPrimitive.Cancel data-slot="alert-dialog-cancel" {...props} />
    </Button>
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
};
