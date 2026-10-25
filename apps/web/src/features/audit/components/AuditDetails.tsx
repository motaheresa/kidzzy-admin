import { DetailList } from '@/components/ui';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { fieldLabel, valueLabel } from '../lib/audit-labels';
import type { AuditLog } from '../types';

const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^\d+\.\d{2}$/;

function formatValue(key: string, value: unknown, timeZone: string): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        item !== null && typeof item === 'object'
          ? Object.entries(item as Record<string, unknown>)
              .map(([k, v]) => fieldLabel(k) + ': ' + formatValue(k, v, timeZone))
              .join('، ')
          : formatValue(key, item, timeZone),
      )
      .join(' | ');
  }
  if (typeof value === 'string') {
    if (DATE_TIME.test(value)) return formatDateTime(value, timeZone);
    if (DATE.test(value)) return formatDate(value);
    if (key === 'amount' && MONEY.test(value)) return formatMoney(value);
    return valueLabel(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function Side({
  title,
  values,
  timeZone,
}: {
  title: string;
  values: Record<string, unknown> | null;
  timeZone: string;
}) {
  const entries = values ? Object.entries(values) : [];
  return (
    <section aria-label={title} className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <h3 className="text-sm font-medium">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">مفيش</p>
      ) : (
        <DetailList
          className="sm:grid-cols-1"
          items={entries.map(([key, value]) => ({
            label: fieldLabel(key),
            value: formatValue(key, value, timeZone),
          }))}
        />
      )}
    </section>
  );
}

/** The values before and after a change, side by side from small screens up. */
export function AuditDetails({ entry, timeZone }: { entry: AuditLog; timeZone: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Side title="قبل" values={entry.before} timeZone={timeZone} />
      <Side title="بعد" values={entry.after} timeZone={timeZone} />
    </div>
  );
}
