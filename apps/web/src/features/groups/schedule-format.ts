import type { ScheduleSlot } from './types';

/** 0 = Sunday … 6 = Saturday, as the API numbers them. */
export const WEEKDAYS = [
  'الأحد',
  'الاتنين',
  'التلات',
  'الأربع',
  'الخميس',
  'الجمعة',
  'السبت',
] as const;

/** "16:00" -> "4:00 م", "09:30" -> "9:30 ص", "00:15" -> "12:15 ص" (Western digits). */
export function formatTime12(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'ص' : 'م'}`;
}

/** 60 -> "ساعة", 90 -> "ساعة ونص", 120 -> "ساعتين", 45 -> "45 دقيقة". */
export function formatDuration(minutes: number): string {
  if (minutes === 60) return 'ساعة';
  if (minutes === 90) return 'ساعة ونص';
  if (minutes === 120) return 'ساعتين';
  return `${minutes} دقيقة`;
}

/** One slot: "السبت · 4:00 م". */
export function formatSlot(slot: ScheduleSlot): string {
  return `${WEEKDAYS[slot.weekday]} · ${formatTime12(slot.startTime)}`;
}

/**
 * The whole schedule for a table cell. Days that meet at the same time are joined, as in the
 * wireframe: "السبت والتلات · 4:00 م"; different times are separated by "، ". Slots are in the
 * API's order (weekday, then time).
 */
export function formatSchedule(schedule: readonly ScheduleSlot[]): string {
  const byTime = new Map<string, string[]>();
  for (const slot of schedule) {
    const days = byTime.get(slot.startTime) ?? [];
    days.push(WEEKDAYS[slot.weekday]);
    byTime.set(slot.startTime, days);
  }
  return [...byTime.entries()]
    .map(([time, days]) => `${days.join(' و')} · ${formatTime12(time)}`)
    .join('، ');
}
