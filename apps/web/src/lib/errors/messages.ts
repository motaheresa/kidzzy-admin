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
  // The app also sends the user to the change-password screen (AppProviders, US-02).
  PASSWORD_CHANGE_REQUIRED: 'لازم تغير كلمة السر الأول',
  CURRENT_PASSWORD_INCORRECT: 'كلمة السر الحالية مش صحيحة',
  PASSWORD_UNCHANGED: 'اختار كلمة سر جديدة غير الحالية',
  FORBIDDEN: 'مش مسموح لك تعمل ده',
  NOT_FOUND: 'الحاجة دي مش موجودة',
  SCHEDULE_OVERLAP: 'فيه ميعادين متداخلين في نفس اليوم، او ميعاد بيخلص بعد نص الليل',
  INSTRUCTOR_NOT_ASSIGNABLE: 'المدرس ده مش شغال، اختار مدرس تاني',
  EMAIL_TAKEN: 'الايميل ده مستخدم لحساب تاني',
  PHONE_TAKEN: 'رقم الموبايل ده مستخدم لحساب تاني',
  SESSION_NOT_SCHEDULED: 'الحصة دي مش في حالة مجدولة',
  SESSION_NOT_STARTED: 'ميعاد الحصة لسه مجاش',
  SESSION_OUT_OF_ORDER:
    'فيه حصة أقدم لسه مجدولة، أو الحصة دي قبل حصة اتسجلت بالفعل. افتح الجروب وفلتر «مجدولة». لو الحصة مش بتاعتك، الأدمن هو اللي يسجّلها.',
  SESSION_NOT_HELD: 'الحصة دي لسه ما اتعملتش',
  STUDENT_ALREADY_ENROLLED: 'الطالب ده مسجل في جروب بالفعل',
  STUDENT_CODE_TAKEN: 'كود الطالب ده مستخدم قبل كده',
  STUDENT_ABSENT: 'مينفعش تقيّم طالب غايب',
  STUDENT_NOT_IN_SESSION: 'الطالب ده مش من طلاب الحصة دي',
  INSTRUCTOR_NOT_IN_GROUP: 'المدرس ده مش مدرس الجروب ده دلوقتي، فمينفعش نحدد له اول خطة للجروب',
  STUDENT_NOT_ENROLLABLE: 'الطالب ده مش نشط، اختار طالب تاني',
  GROUP_INACTIVE: 'الجروب ده متوقف، اختار جروب شغال',
  STUDENT_HAS_NO_PLAN: 'الطالب ده مالوش خطة لسه، سجله في جروب الاول',
  PLAN_UNCHANGED: 'دي نفس الخطة الحالية، غير العدد او المبلغ',
  NO_ACTIVE_ENROLLMENT: 'الطالب ده مش في جروب دلوقتي',
  SAME_GROUP: 'الطالب ده في الجروب ده بالفعل، اختار جروب تاني',
  ENROLLMENT_DATE_INVALID: 'تاريخ البداية لازم يكون بعد آخر يوم للطالب في جروبه اللي فات',
  CYCLE_NOT_DUE: 'الدورة دي لسه ما استحقتش الدفع',
  CYCLE_ALREADY_PAID: 'الدورة دي اتدفعت بالفعل',
  STARTING_POINT_LOCKED: 'نقطة البداية لاول دورة بس، وعنده دورة بالفعل',
  STARTING_POINT_OUT_OF_RANGE: 'نقطة البداية لازم تكون اقل من عدد سيشنات الدورة',
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
  temporaryPassword: 'كلمة السر المؤقتة لازم تكون 8 حروف على الاقل',
  code: 'الكود حروف وارقام بس (ومسموح . _ / -)، 20 على الاكتر',
  age: 'السن من 3 لـ 25 سنة',
  parentName: 'اكتب اسم ولي الامر',
  parentPhone: 'اكتب رقم موبايل صحيح لولي الامر',
  notes: 'الملاحظات 1000 حرف على الاكتر',
  reason: 'اكتب سبب الالغاء، 500 حرف على الاكتر',
  groupId: 'اختار الجروب',
  level: 'اكتب المستوى او الكورس',
  instructorId: 'اختار المدرس',
  startDate: 'اختار تاريخ البداية',
  schedule: 'ضيف ميعاد واحد على الاقل، ومواعيد صح',
  weekday: 'اختار اليوم',
  startTime: 'اكتب وقت صح، مثلا 16:00',
  durationMin: 'المدة من 15 لـ 240 دقيقة',
  studentId: 'اختار الطالب',
  toGroupId: 'اختار الجروب الجديد',
  effectiveDate: 'اختار تاريخ صح للنقل',
  plan: 'اكتب الخطة: عدد السيشنات والمبلغ',
  sessionsPerCycle: 'عدد سيشنات الدورة من 1 لـ 100',
  amount: 'اكتب المبلغ بالجنيه، اكبر من صفر، زي 1500',
  openingCount: 'نقطة البداية رقم من 0 لحد اقل من عدد سيشنات الدورة',
};

export const FIELD_FALLBACK = 'القيمة دي مش صحيحة';

/**
 * Codes that are about one field of the form (a 409 "already used", a 422 "wrong current
 * password"): the error layer also puts
 * the code's message under that field, so the form shows it where the user has to fix it.
 */
export const CODE_FIELDS: Partial<Record<ErrorCode, string>> = {
  EMAIL_TAKEN: 'email',
  PHONE_TAKEN: 'phone',
  STUDENT_CODE_TAKEN: 'code',
  SCHEDULE_OVERLAP: 'schedule',
  INSTRUCTOR_NOT_ASSIGNABLE: 'instructorId',
  STUDENT_NOT_ENROLLABLE: 'studentId',
  STUDENT_ALREADY_ENROLLED: 'studentId',
  ENROLLMENT_DATE_INVALID: 'startDate',
  SAME_GROUP: 'toGroupId',
  GROUP_INACTIVE: 'toGroupId',
  STARTING_POINT_OUT_OF_RANGE: 'openingCount',
  STARTING_POINT_LOCKED: 'openingCount',
  CURRENT_PASSWORD_INCORRECT: 'currentPassword',
  PASSWORD_UNCHANGED: 'newPassword',
};
