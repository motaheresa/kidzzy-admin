import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui';

/** One number of a report: a label, the value (a formatted amount or count) and an optional hint. */
export function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-6">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="numeric text-2xl font-bold break-words">{value}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </CardContent>
    </Card>
  );
}

/** A titled row of KpiCards. */
export function KpiSection({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
    </section>
  );
}
