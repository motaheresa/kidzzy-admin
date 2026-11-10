import { NotificationType, PayeeType, type CycleChange } from '@kidzzy/shared';
import type {
  PaymentReminderSessionsLeft,
  PaymentReminderThresholds,
} from './payment-reminder.constants';

/** One cycle this Held session moved onto a reminder threshold. */
export interface ReminderCandidate {
  cycleId: string;
  sessionsLeft: PaymentReminderSessionsLeft;
  payeeType: PayeeType;
  studentId: string | null;
}

/** The text of one summary. Pure: the same candidates and names always produce it. */
export interface PaymentReminderSummary {
  type: NotificationType;
  title: string;
  body: string;
  url: string;
}

/** The heading of one line: "فاضلهم حصتين", "فاضلهم 3 حصص", "استحقت". */
function lineLabel(sessionsLeft: PaymentReminderSessionsLeft): string {
  if (sessionsLeft === 0) return 'استحقت';
  if (sessionsLeft === 1) return 'فاضلهم حصة';
  if (sessionsLeft === 2) return 'فاضلهم حصتين';
  // Arabic counts 3 to 10 with the plural and 11 and up with the singular.
  return sessionsLeft <= 10 ? `فاضلهم ${sessionsLeft} حصص` : `فاضلهم ${sessionsLeft} حصة`;
}

const NAME_CAP = 5;

/**
 * The cycles whose counter just reached one of the academy's thresholds, or became Due. A
 * student's cycle uses the student rules and an instructor's cycle the instructor rules. Counting
 * adds one session, so a cycle crosses one of these at a time.
 */
export function reminderCandidates(
  changes: CycleChange[],
  thresholds: PaymentReminderThresholds,
): ReminderCandidate[] {
  const candidates: ReminderCandidate[] = [];
  for (const change of changes) {
    const sessionsLeft = threshold(
      change,
      change.payeeType === PayeeType.Instructor ? thresholds.instructor : thresholds.student,
    );
    if (sessionsLeft === undefined) continue;
    candidates.push({
      cycleId: change.cycleId,
      sessionsLeft,
      payeeType: change.payeeType,
      studentId: change.studentId,
    });
  }
  return candidates;
}

/**
 * Title, body and url for these candidates. No database access. Throws when a student has no
 * name or the instructor's name is empty, so a formatting bug can be caught before a threshold
 * is claimed. Students are sorted by name; the instructor is last on the line.
 */
export function formatSummary(
  input: { groupName: string; instructorName: string },
  candidates: readonly ReminderCandidate[],
  studentNames: ReadonlyMap<string, string>,
): PaymentReminderSummary {
  if (!input.instructorName) throw new Error('The instructor has no name');
  const lines: string[] = [];
  const levels = [...new Set(candidates.map((candidate) => candidate.sessionsLeft))].sort(
    (a, b) => b - a,
  );
  for (const sessionsLeft of levels) {
    const names = namesFor(sessionsLeft, candidates, studentNames, input.instructorName);
    if (names.length > 0) lines.push(`${lineLabel(sessionsLeft)}: ${joinNames(names)}`);
  }
  if (lines.length === 0) throw new Error('The summary has no one to name');
  const onlyDue = candidates.every((candidate) => candidate.sessionsLeft === 0);
  const onlyInstructor = candidates.every(
    (candidate) => candidate.payeeType === PayeeType.Instructor,
  );
  const status = onlyDue ? 'due' : 'approaching';
  return {
    type: onlyInstructor ? NotificationType.InstructorPayment : NotificationType.StudentPayment,
    title: `دفعات قربت: جروب ${input.groupName}`,
    body: lines.join('\n'),
    url: `/payments?status=${status}${onlyInstructor ? '&tab=instructors' : ''}`,
  };
}

function threshold(
  change: CycleChange,
  active: readonly number[],
): PaymentReminderSessionsLeft | undefined {
  const left = change.sessionsPerCycle - change.sessionsCounted;
  if (change.status === 'due' || left === 0) return 0;
  return active.includes(left) ? left : undefined;
}

function namesFor(
  sessionsLeft: PaymentReminderSessionsLeft,
  candidates: readonly ReminderCandidate[],
  studentNames: ReadonlyMap<string, string>,
  instructorName: string,
): string[] {
  const onLine = candidates.filter((candidate) => candidate.sessionsLeft === sessionsLeft);
  const students = onLine
    .filter((candidate) => candidate.payeeType === PayeeType.Student)
    .map((candidate) => {
      const name = candidate.studentId ? studentNames.get(candidate.studentId) : undefined;
      if (!name) throw new Error('A student has no name');
      return name;
    })
    .sort((a, b) => a.localeCompare(b, 'ar'));
  const instructor = onLine.some((candidate) => candidate.payeeType === PayeeType.Instructor);
  return instructor ? [...students, `المدرس ${instructorName}`] : students;
}

/** At most five names, then how many did not fit: "أ، ب، ت، ث، ج و1 كمان". */
function joinNames(names: readonly string[]): string {
  if (names.length <= NAME_CAP) return names.join('، ');
  return `${names.slice(0, NAME_CAP).join('، ')} و${names.length - NAME_CAP} كمان`;
}
