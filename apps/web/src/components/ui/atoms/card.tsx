import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** A surface that groups related content: Card > CardHeader (Title, Description) > CardContent. */
function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex flex-col gap-4 rounded-lg border border-border bg-card py-5 text-card-foreground shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-header" className={cn('grid gap-1 px-5', className)} {...props} />;
}

function CardTitle({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('text-lg leading-snug font-semibold', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-5', className)} {...props} />;
}

function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center gap-2 border-t border-border px-5 pt-4', className)}
      {...props}
    />
  );
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
