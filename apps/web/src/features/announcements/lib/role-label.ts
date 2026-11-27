/** The system roles in the words the academy uses; a role added as data shows its own name. */
const ROLE_LABELS: Record<string, string> = {
  Admin: 'ادمن',
  Instructor: 'مدرس',
};

export function roleLabel(name: string): string {
  return ROLE_LABELS[name] ?? name;
}
