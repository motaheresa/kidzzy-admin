import type { AuditLog } from '../types';

/** An Arabic label per action the API writes. An action not listed shows as it is. */
const ACTION_LABELS: Record<string, string> = {
  'session.held': 'تسجيل حصة (اتعملت)',
  'session.cancelled': 'الغاء حصة',
  'session.rescheduled': 'تغيير ميعاد حصة',
  'session.created': 'اضافة حصة تعويضية او اضافية',
  'session.held_undone': 'ارجاع حصة لمجدولة',
  'payment.recorded': 'تسجيل دفعة',
  'payment_cycle.starting_point_set': 'تعديل نقطة بداية الدورة',
  'payment_plan.set': 'تحديد خطة دفع',
  'payment_plan.changed': 'تغيير خطة دفع',
  'enrollment.transferred': 'نقل طالب لجروب تاني',
  'enrollment.ended': 'انهاء تسجيل طالب في جروب',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** The kinds of record the filter offers, with what the person calls them. */
export const ENTITY_TYPES: { value: string; label: string }[] = [
  { value: 'sessions', label: 'حصة' },
  { value: 'students', label: 'طالب' },
  { value: 'payment_cycles', label: 'دورة دفع' },
  { value: 'payment_plans', label: 'خطة دفع' },
];

export function entityTypeLabel(entityType: string): string {
  return ENTITY_TYPES.find((item) => item.value === entityType)?.label ?? entityType;
}

/**
 * Where the record has a screen: a session, a student, and the student or instructor a plan is
 * for (from the values it holds). A payment cycle has no screen of its own, so it has no link.
 */
export function entityHref(entry: AuditLog): string | null {
  if (entry.entityType === 'sessions') return '/sessions/' + entry.entityId;
  if (entry.entityType === 'students') return '/students/' + entry.entityId;
  if (entry.entityType === 'payment_plans') {
    const values = entry.after ?? entry.before;
    if (typeof values?.studentId === 'string') return '/students/' + values.studentId;
    if (typeof values?.instructorId === 'string') return '/instructors/' + values.instructorId;
  }
  return null;
}

/** The Arabic name of a field kept in before and after. A field not listed shows as it is. */
const FIELD_LABELS: Record<string, string> = {
  status: 'الحالة',
  sessionNumber: 'رقم الحصة',
  cancelReason: 'سبب الالغاء',
  scheduledAt: 'الميعاد',
  durationMin: 'المدة (دقيقة)',
  compensatesSessionId: 'بتعوّض عن حصة',
  laterSessionsRenumbered: 'حصص اتعاد ترقيمها',
  cycles: 'الدورات',
  cycleId: 'الدورة',
  sessionsCounted: 'السيشنات المحسوبة',
  cycleStatus: 'حالة الدورة',
  paymentId: 'الدفعة',
  amount: 'المبلغ',
  paidOn: 'تاريخ الدفع',
  method: 'الطريقة',
  openingCount: 'نقطة البداية',
  payeeType: 'نوع المدفوع له',
  studentId: 'الطالب',
  instructorId: 'المدرس',
  groupId: 'الجروب',
  version: 'رقم النسخة',
  sessionsPerCycle: 'سيشنات الدورة',
  effectiveFromCycle: 'من الدورة',
  startDate: 'تاريخ البداية',
  endDate: 'تاريخ النهاية',
  previousGroupEndDate: 'اخر يوم في الجروب القديم',
};

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

const VALUE_LABELS: Record<string, string> = {
  scheduled: 'مجدولة',
  held: 'اتعملت',
  cancelled: 'اتلغت',
  in_progress: 'شغالة',
  due: 'مستحقة',
  paid: 'مدفوعة',
  cash: 'كاش',
  transfer: 'تحويل',
  wallet: 'محفظة',
  student: 'طالب',
  instructor: 'مدرس',
};

export function valueLabel(value: string): string {
  return VALUE_LABELS[value] ?? value;
}
