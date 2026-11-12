import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { chartAnimation } from '@/lib/motion';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

/** One stacked series: the data key, its name in words, and its color (a design token). */
export interface ChartSeries {
  key: string;
  label: string;
  /** A CSS color from the tokens, e.g. "var(--color-chart-held)". */
  color: string;
}

/**
 * A stacked bar chart on the design tokens, the one place that imports Recharts (ESLint), so the
 * next report reuses it. The chart area is left-to-right (axes and numbers read that way) inside
 * a right-to-left page; the legend and the tooltip are plain HTML in Arabic. On a phone the chart
 * keeps `minBarWidth` per bar and scrolls sideways instead of squeezing. Its entrance goes
 * through `chartAnimation` (src/lib/motion) and does nothing under prefers-reduced-motion.
 * The picture is `role="img"` with `ariaLabel`; the numbers are also in the report's cards.
 */
export function StackedBarChart({
  data,
  xKey,
  series,
  ariaLabel,
  tickFormatter = String,
  tooltipTitle = String,
  minBarWidth = 28,
  height = 288,
  className,
}: {
  data: readonly object[];
  /** The key of the category of each bar (a date, a month…). */
  xKey: string;
  series: readonly ChartSeries[];
  ariaLabel: string;
  /** The label under each bar. */
  tickFormatter?: (value: string) => string;
  /** The title of the tooltip of a bar. */
  tooltipTitle?: (value: string) => string;
  minBarWidth?: number;
  height?: number;
  className?: string;
}) {
  const animation = chartAnimation();
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="مفتاح الألوان">
        {series.map((item) => (
          <li key={item.key} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-3 rounded-sm"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </li>
        ))}
      </ul>
      <div dir="ltr" className="overflow-x-auto">
        <div
          role="img"
          aria-label={ariaLabel}
          style={{ minWidth: data.length * minBarWidth, height }}
        >
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height }}>
            <BarChart data={data as object[]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis
                dataKey={xKey}
                tickFormatter={tickFormatter}
                tickLine={false}
                interval={0}
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
                stroke="var(--color-input)"
              />
              <YAxis
                allowDecimals={false}
                width={32}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: 'var(--color-muted)' }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div
                      dir="rtl"
                      className="rounded-md border border-border bg-surface p-3 text-sm shadow-md"
                    >
                      <p className="mb-1 font-semibold">{tooltipTitle(String(label))}</p>
                      <ul className="flex flex-col gap-0.5">
                        {series.map((item) => {
                          const entry = payload.find((p) => p.dataKey === item.key);
                          return (
                            <li key={item.key} className="flex items-center gap-1.5">
                              <span
                                aria-hidden="true"
                                className="size-2.5 rounded-sm"
                                style={{ backgroundColor: item.color }}
                              />
                              <span>{item.label}</span>
                              <span className="numeric ms-auto ps-3 font-medium">
                                {formatNumber(Number(entry?.value ?? 0))}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null
                }
              />
              {series.map((item) => (
                <Bar
                  key={item.key}
                  dataKey={item.key}
                  name={item.label}
                  stackId="sessions"
                  fill={item.color}
                  {...animation}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
