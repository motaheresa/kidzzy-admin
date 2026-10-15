// Permission catalog and system roles (API Design V1, "Permission keys").
//
// A key is resource.action:scope.
// - any: every record in the academy.
// - own: only records of groups the user teaches, or the user's own payments. The guard
//   checks the key; the service then checks ownership and answers 403 FORBIDDEN otherwise.

export const PERMISSIONS = {
  'instructors.read:any': 'View instructor accounts',
  'instructors.manage:any': 'Create, edit and deactivate instructor accounts',
  'students.read:any': 'View every student',
  'students.read:own': 'View students in groups the user teaches',
  'students.manage:any': 'Create and edit student records',
  'groups.read:any': 'View every group',
  'groups.read:own': 'View groups the user teaches',
  'groups.create:any': 'Create groups',
  'groups.update:any': 'Edit any group and its schedule',
  'groups.update:own': 'Edit groups the user teaches and their schedule',
  'enrollments.manage:any': 'Enroll and transfer students',
  'sessions.read:any': 'View every session',
  'sessions.read:own': 'View sessions of groups the user teaches',
  'sessions.update:any': 'Mark any session held, cancel, reschedule or add a make-up',
  'sessions.update:own':
    'Mark held, cancel, reschedule or add a make-up in groups the user teaches',
  'sessions.undo_held:any': 'Undo a session marked held by mistake',
  'attendance.read:any': 'View attendance and ratings of every session',
  'attendance.read:own': 'View attendance and ratings in groups the user teaches',
  'attendance.record:any': 'Record attendance and ratings for any session',
  'attendance.record:own': 'Record attendance and ratings in groups the user teaches',
  'payments.read:any': 'View every payment cycle and payment',
  'payments.read:own': "View the user's own payment cycles and payments",
  'payments.manage:any': 'Set plans and starting points, and record payments',
  'reminders.manage:any': 'Configure reminder rules',
  'announcements.send:any': 'Send announcements',
  'materials.read:any': 'View material links',
  'materials.manage:any': 'Add, edit and order material links',
  'dashboard.read:any': 'View the admin dashboard',
  'audit.read:any': 'View the audit log',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

/** Roles seeded in every academy; they cannot be deleted (roles.is_system). */
export const SystemRole = {
  Admin: 'Admin',
  Instructor: 'Instructor',
} as const;
export type SystemRole = (typeof SystemRole)[keyof typeof SystemRole];

export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRole, readonly PermissionKey[]> = {
  // The admin holds every permission with scope any.
  Admin: PERMISSION_KEYS.filter((key) => key.endsWith(':any')),
  Instructor: [
    'students.read:own',
    'groups.read:own',
    'groups.update:own',
    'sessions.read:own',
    'sessions.update:own',
    'attendance.read:own',
    'attendance.record:own',
    'payments.read:own',
    'materials.read:any',
  ],
};
