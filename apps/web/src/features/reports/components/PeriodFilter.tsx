import { useState } from 'react';
import { FormField, ToggleGroup, ToggleGroupItem } from '@/components/ui';
import { presetOf, type PeriodPreset } from '../lib/period';
import { useReportPeriod } from '../hooks/useReports';

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: 'today', label: 'النهارده' },
  { value: 'month', label: 'الشهر ده' },
  { value: 'lastMonth', label: 'الشهر اللي فات' },
  { value: 'custom', label: 'من / إلى' },
];

/**
 * The date filter at the top of every report page: today, this month, last month, or a from/to
 * range. It lives in the URL (?from=…&to=…), so a reload, the back button and the sidebar links
 * keep it. Dates are academy-local and both ends are included. A range that ends before it
 * starts is said on the field, and the report is not asked for.
 */
export function PeriodFilter() {
  const { period, today, backwards, choose, setPeriod } = useReportPeriod();
  const preset = presetOf(period, today);
  // "From / to" stays open while the admin types dates, even if they happen to match a preset.
  const [customOpen, setCustomOpen] = useState(preset === 'custom');
  const shown: PeriodPreset = customOpen ? 'custom' : preset;

  return (
    <div className="flex flex-wrap items-end gap-3" role="group" aria-label="الفترة">
      <ToggleGroup
        type="single"
        value={shown}
        onValueChange={(value) => {
          if (!value) return;
          if (value === 'custom') {
            setCustomOpen(true);
            return;
          }
          setCustomOpen(false);
          choose(value as Exclude<PeriodPreset, 'custom'>);
        }}
        aria-label="اختار الفترة"
        className="flex-wrap"
      >
        {PRESETS.map((item) => (
          <ToggleGroupItem key={item.value} value={item.value} className="px-3">
            {item.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {shown === 'custom' && (
        <>
          <FormField
            type="date"
            label="من"
            value={period.from}
            onChange={(event) =>
              event.target.value && setPeriod({ ...period, from: event.target.value })
            }
            error={backwards ? 'تاريخ البداية بعد تاريخ النهاية' : undefined}
          />
          <FormField
            type="date"
            label="إلى"
            value={period.to}
            onChange={(event) =>
              event.target.value && setPeriod({ ...period, to: event.target.value })
            }
          />
        </>
      )}
    </div>
  );
}
