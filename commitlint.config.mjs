// Conventional Commits: <type>(<scope>): <subject> (SCRUM-123)
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      1,
      'always',
      [
        'api',
        'web',
        'shared',
        'auth',
        'access',
        'instructors',
        'students',
        'groups',
        'sessions',
        'attendance',
        'payments',
        'notifications',
        'announcements',
        'materials',
        'dashboard',
        'audit',
        'db',
        'ci',
        'docs',
        'deps',
        'release',
      ],
    ],
    'subject-case': [0],
  },
};
