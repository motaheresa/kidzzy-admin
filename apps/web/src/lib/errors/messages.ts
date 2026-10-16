import type { ErrorCode } from '@kidzzy/shared';
import type { ErrorKind } from './app-error';

// The only place where error text lives. Messages are Egyptian Arabic, short, and say what to do.
// The server's English `detail` is never shown: it is written for developers, not staff.

/**
 * One message per API error code. Typed as Record<ErrorCode, string>, so adding a code to
 * packages/shared without a message here fails the typecheck.
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'راجع البيانات اللي كتبتها',
  UNAUTHENTICATED: 'انتهت الجلسة، سجل الدخول تاني',
  // One message for wrong password, unknown account and deactivated account (US-01).
  INVALID_CREDENTIALS: 'بيانات الدخول غير صحيحة',
  // Its own case on purpose: US-02 will send the user to the change-password screen.
  PASSWORD_CHANGE_REQUIRED: 'لازم تغير كلمة السر الأول',
  FORBIDDEN: 'مش مسموح لك تعمل ده',
  NOT_FOUND: 'الحاجة دي مش موجودة',
  SESSION_NOT_SCHEDULED: 'الحصة دي مش في حالة مجدولة',
  SESSION_NOT_HELD: 'الحصة دي لسه ما اتعملتش',
  STUDENT_ALREADY_ENROLLED: 'الطالب ده مسجل في جروب بالفعل',
  STUDENT_CODE_TAKEN: 'كود الطالب ده مستخدم قبل كده',
  STUDENT_ABSENT: 'مينفعش تقيّم طالب غايب',
  CYCLE_NOT_DUE: 'الدورة دي لسه ما استحقتش الدفع',
  CYCLE_ALREADY_PAID: 'الدورة دي اتدفعت بالفعل',
  STARTING_POINT_LOCKED: 'نقطة البداية مينفعش تتغير دلوقتي',
  STARTING_POINT_OUT_OF_RANGE: 'نقطة البداية برة المدى المسموح',
  AMOUNT_MISMATCH: 'المبلغ مش مطابق لمبلغ الخطة',
  RATE_LIMITED: 'محاولات كثيرة، جرب تاني بعد دقيقة',
  INTERNAL_ERROR: 'حصلت مشكلة في السيرفر، جرب تاني',
};

/** The fallback when there is no code (network, timeout, an unexpected body). */
export const KIND_MESSAGES: Record<ErrorKind, string> = {
  network: 'مفيش اتصال بالسيرفر، اتأكد من الانترنت وجرب تاني',
  timeout: 'السيرفر اتأخر في الرد، جرب تاني',
  unauthenticated: 'انتهت الجلسة، سجل الدخول تاني',
  forbidden: 'مش مسموح لك تعمل ده',
  validation: 'راجع البيانات اللي كتبتها',
  notFound: 'الحاجة دي مش موجودة',
  conflict: 'العملية دي مش متاحة في الحالة الحالية',
  rateLimited: 'محاولات كثيرة، جرب تاني بعد دقيقة',
  server: 'حصلت مشكلة في السيرفر، جرب تاني',
  unknown: 'حصلت مشكلة، جرب تاني',
};

/**
 * Per-field messages for VALIDATION_FAILED. The API sends English class-validator text and no
 * constraint code, so the message is chosen by field name. Add a field here when a form needs it.
 */
export const FIELD_MESSAGES: Record<string, string> = {
  login: 'اكتب الايميل او رقم الموبايل',
  password: 'كلمة السر لازم تكون 8 حروف على الاقل',
  currentPassword: 'اكتب كلمة السر الحالية',
  newPassword: 'كلمة السر الجديدة لازم تكون 8 حروف على الاقل',
  email: 'اكتب ايميل صحيح',
  phone: 'اكتب رقم موبايل صحيح',
  name: 'اكتب الاسم',
};

export const FIELD_FALLBACK = 'القيمة دي مش صحيحة';
