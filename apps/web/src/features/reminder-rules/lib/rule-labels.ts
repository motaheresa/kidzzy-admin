import {
  REMINDER_LEAD_MINUTES_MAX,
  REMINDER_LEAD_MINUTES_MIN,
  REMINDER_SESSIONS_BEFORE_END_MAX,
  REMINDER_SESSIONS_BEFORE_END_MIN,
  ReminderRuleType,
} from '@kidzzy/shared';
import { formatNumber } from '@/lib/format';
import type { ReminderRule } from '../types';

export type LeadUnit = 'minutes' | 'hours' | 'days';

const UNIT_MINUTES: Record<LeadUnit, number> = { minutes: 1, hours: 60, days: 1440 };

export const LEAD_UNITS: { value: LeadUnit; label: string }[] = [
  { value: 'minutes', label: 'دقيقة' },
  { value: 'hours', label: 'ساعة' },
  { value: 'days', label: 'يوم' },
];

/** The unit a number of minutes is shown in: days when it is whole days, then hours, then minutes. */
export function leadParts(minutes: number): { amount: number; unit: LeadUnit } {
  if (minutes % UNIT_MINUTES.days === 0)
    return { amount: minutes / UNIT_MINUTES.days, unit: 'days' };
  if (minutes % UNIT_MINUTES.hours === 0) {
    return { amount: minutes / UNIT_MINUTES.hours, unit: 'hours' };
  }
  return { amount: minutes, unit: 'minutes' };
}

export function toLeadMinutes(amount: number, unit: LeadUnit): number {
  return amount * UNIT_MINUTES[unit];
}

/**
 * A number with its noun: the singular and the dual are words of their own ("بيوم", "بيومين"), 3 to
 * 10 take the plural and 11 and up the singular again. `prefix` goes before a written number.
 */
function counted(
  amount: number,
  one: string,
  two: string,
  few: string,
  many: string,
  prefix = '',
): string {
  if (amount === 1) return one;
  if (amount === 2) return two;
  return `${prefix}${formatNumber(amount)} ${amount <= 10 ? few : many}`;
}

/** "قبل الحصة بيوم", "قبل الحصة بساعة", "قبل الحصة بـ 3 ساعات", "قبل الحصة بـ 45 دقيقة". */
export function sessionLeadLabel(minutes: number): string {
  const { amount, unit } = leadParts(minutes);
  const when =
    unit === 'days'
      ? counted(amount, 'بيوم', 'بيومين', 'ايام', 'يوم', 'بـ ')
      : unit === 'hours'
        ? counted(amount, 'بساعة', 'بساعتين', 'ساعات', 'ساعة', 'بـ ')
        : counted(amount, 'بدقيقة', 'بدقيقتين', 'دقايق', 'دقيقة', 'بـ ');
  return `قبل الحصة ${when}`;
}

/** "لما يفضل حصة", "لما يفضل حصتين", "لما يفضل 3 حصص". */
export function paymentThresholdLabel(sessionsLeft: number): string {
  return `لما يفضل ${counted(sessionsLeft, 'حصة', 'حصتين', 'حصص', 'حصة')}`;
}

/** What a rule says in plain Arabic. */
export function ruleLabel(rule: ReminderRule): string {
  return rule.type === ReminderRuleType.SessionReminder
    ? sessionLeadLabel(rule.leadMinutes ?? 0)
    : paymentThresholdLabel(rule.sessionsBeforeEnd ?? 0);
}

export const SECTIONS: {
  type: ReminderRuleType;
  title: string;
  description: string;
  /** What "no active rule" means for the section, shown as a warning. */
  warning: string;
}[] = [
  {
    type: ReminderRuleType.SessionReminder,
    title: 'تذكير الحصص',
    description: 'المدرس بيوصله تذكير قبل حصته بالمواعيد دي.',
    warning: 'مفيش قاعدة شغالة: المدرسين مش هيوصلهم تذكير قبل الحصص.',
  },
  {
    type: ReminderRuleType.StudentPayment,
    title: 'دفعات الطلاب',
    description: 'الأدمن بيوصله تنبيه لما دورة طالب تقرب تخلص. تنبيه الاستحقاق بيوصل دايما.',
    warning: 'مفيش قاعدة شغالة: هيوصلكم تنبيه الاستحقاق بس، من غير تنبيه قبله.',
  },
  {
    type: ReminderRuleType.InstructorPayment,
    title: 'دفعات المدرسين',
    description: 'الأدمن بيوصله تنبيه لما دورة مدرس تقرب تخلص. تنبيه الاستحقاق بيوصل دايما.',
    warning: 'مفيش قاعدة شغالة: هيوصلكم تنبيه الاستحقاق بس، من غير تنبيه قبله.',
  },
];

/** The hint under the number field of the add/edit dialog. */
export function valueHint(type: ReminderRuleType, unit: LeadUnit): string {
  if (type !== ReminderRuleType.SessionReminder) {
    return `من ${formatNumber(REMINDER_SESSIONS_BEFORE_END_MIN)} لحد ${formatNumber(REMINDER_SESSIONS_BEFORE_END_MAX)} حصة`;
  }
  const min = Math.ceil(REMINDER_LEAD_MINUTES_MIN / UNIT_MINUTES[unit]);
  const max = Math.floor(REMINDER_LEAD_MINUTES_MAX / UNIT_MINUTES[unit]);
  return `من ${formatNumber(min)} لحد ${formatNumber(max)} (اقل حاجة 30 دقيقة واكتر حاجة 7 ايام)`;
}

/** The value the dialog would send, or null while the number is not valid for the type and unit. */
export function parseValue(type: ReminderRuleType, text: string, unit: LeadUnit): number | null {
  const amount = Number(text);
  if (text.trim() === '' || !Number.isInteger(amount)) return null;
  if (type === ReminderRuleType.SessionReminder) {
    const minutes = toLeadMinutes(amount, unit);
    return minutes >= REMINDER_LEAD_MINUTES_MIN && minutes <= REMINDER_LEAD_MINUTES_MAX
      ? minutes
      : null;
  }
  return amount >= REMINDER_SESSIONS_BEFORE_END_MIN && amount <= REMINDER_SESSIONS_BEFORE_END_MAX
    ? amount
    : null;
}
