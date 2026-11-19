import { http } from '@/lib/http';
import type {
  AcademySettings,
  EvaluationRequest,
  StudentEvaluation,
  SubmitEvaluationInput,
} from '../types';

// The evaluation endpoints (openapi.yaml, tag Evaluations). Components never call them; the hooks do.

/** GET /me/evaluation-requests: the evaluations the signed-in instructor must write now. */
export function listMyEvaluationRequests(signal?: AbortSignal): Promise<EvaluationRequest[]> {
  return http.get<EvaluationRequest[]>('/me/evaluation-requests', { signal });
}

/** POST /evaluation-requests/{id}/submit */
export function submitEvaluation(
  id: string,
  body: SubmitEvaluationInput,
): Promise<StudentEvaluation> {
  return http.post<StudentEvaluation>(
    `/evaluation-requests/${encodeURIComponent(id)}/submit`,
    body,
  );
}

/** GET /evaluation-requests?status=pending: the academy's pending requests (the admin). */
export function listPendingEvaluationRequests(signal?: AbortSignal): Promise<EvaluationRequest[]> {
  return http.get<EvaluationRequest[]>('/evaluation-requests?status=pending', { signal });
}

/** POST /evaluation-requests/{id}/cancel */
export function cancelEvaluationRequest(id: string): Promise<EvaluationRequest> {
  return http.post<EvaluationRequest>(`/evaluation-requests/${encodeURIComponent(id)}/cancel`);
}

/** POST /students/{id}/evaluation-requests: ask the student's instructor now. */
export function requestStudentEvaluation(studentId: string): Promise<EvaluationRequest> {
  return http.post<EvaluationRequest>(
    `/students/${encodeURIComponent(studentId)}/evaluation-requests`,
  );
}

/** GET /students/{id}/evaluations: the student's written evaluations, newest first. */
export function listStudentEvaluations(
  studentId: string,
  signal?: AbortSignal,
): Promise<StudentEvaluation[]> {
  return http.get<StudentEvaluation[]>(`/students/${encodeURIComponent(studentId)}/evaluations`, {
    signal,
  });
}

/** GET /academy/settings */
export function getAcademySettings(signal?: AbortSignal): Promise<AcademySettings> {
  return http.get<AcademySettings>('/academy/settings', { signal });
}

/** PATCH /academy/settings */
export function updateAcademySettings(body: AcademySettings): Promise<AcademySettings> {
  return http.patch<AcademySettings>('/academy/settings', body);
}
