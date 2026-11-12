import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StackedBarChart, type ChartSeries } from './StackedBarChart';

const SERIES: ChartSeries[] = [
  { key: 'a', label: 'الأول', color: 'var(--color-chart-held)' },
  { key: 'b', label: 'التاني', color: 'var(--color-chart-cancelled)' },
];
const DATA = [
  { day: 'x1', a: 2, b: 1 },
  { day: 'x2', a: 0, b: 3 },
];

describe('StackedBarChart', () => {
  it('names the picture, lists the series in words and draws a label per bar', async () => {
    render(
      <StackedBarChart
        data={DATA}
        xKey="day"
        series={SERIES}
        ariaLabel="رسم تجريبي"
        tickFormatter={(value) => value.toUpperCase()}
      />,
    );
    const chart = screen.getByRole('img', { name: 'رسم تجريبي' });
    const legend = screen.getByRole('list', { name: 'مفتاح الألوان' });
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['الأول', 'التاني']);
    await waitFor(() => {
      const ticks = Array.from(
        chart.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick'),
      );
      expect(ticks.map((tick) => tick.textContent)).toEqual(['X1', 'X2']);
    });
  });

  it('draws LTR inside a sideways scroller and keeps a minimum width per bar', () => {
    render(
      <StackedBarChart data={DATA} xKey="day" series={SERIES} ariaLabel="رسم" minBarWidth={50} />,
    );
    const chart = screen.getByRole('img', { name: 'رسم' });
    expect(chart.parentElement).toHaveAttribute('dir', 'ltr');
    expect(chart.parentElement?.className).toContain('overflow-x-auto');
    expect(chart.style.minWidth).toBe('100px');
  });
});
