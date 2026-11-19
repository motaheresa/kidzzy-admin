import type { EvaluationRequest, StudentEvaluation } from '@kidzzy/shared';
import type { EvaluationRow } from './evaluation.repository';

/** A request as the API shows it: who it is about and why, never any text. */
export function toEvaluationRequest(row: EvaluationRow): EvaluationRequest {
  return {
    id: row.id,
    source: row.source,
    status: row.status,
    student: { id: row.student.id, name: row.student.name },
    group: { id: row.group.id, name: row.group.name },
    instructor: { id: row.instructor.id, name: row.instructor.name },
    cycleNumber: row.cycle?.cycleNumber ?? null,
    requestedAt: row.requestedAt.toISOString(),
  };
}

/** A written evaluation. Only a submitted row is passed here, so its rating, summary and time are set (CHECK). */
export function toStudentEvaluation(row: EvaluationRow): StudentEvaluation {
  if (row.overallRating === null || row.summary === null || row.submittedAt === null) {
    throw new Error(`Evaluation ${row.id} is not submitted`);
  }
  return {
    id: row.id,
    source: row.source,
    student: { id: row.student.id, name: row.student.name },
    group: { id: row.group.id, name: row.group.name },
    instructor: { id: row.instructor.id, name: row.instructor.name },
    cycleNumber: row.cycle?.cycleNumber ?? null,
    overallRating: row.overallRating,
    summary: row.summary,
    strengths: row.strengths,
    toImprove: row.toImprove,
    submittedAt: row.submittedAt.toISOString(),
  };
}
