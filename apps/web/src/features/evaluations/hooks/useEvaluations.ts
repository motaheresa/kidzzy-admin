import { toast } from 'sonner';
import { authKeys } from '@/features/auth';
import { refreshSession } from '@/lib/http';
import { useApiMutation, useApiQuery, useQueryClient } from '@/lib/query';
import {
  cancelEvaluationRequest,
  getAcademySettings,
  listMyEvaluationRequests,
  listPendingEvaluationRequests,
  listStudentEvaluations,
  requestStudentEvaluation,
  submitEvaluation,
  updateAcademySettings,
} from '../api/evaluations.api';
import { evaluationKeys } from '../api/evaluations.keys';
import type { AcademySettings, SubmitEvaluationInput } from '../types';

/** The evaluations the signed-in instructor must write now. The screen shows its own error. */
export function useMyEvaluationRequests() {
  return useApiQuery({
    queryKey: evaluationKeys.mine(),
    queryFn: ({ signal }) => listMyEvaluationRequests(signal),
    meta: { errorHandling: 'local' },
  });
}

/** Writes one pending evaluation. The form shows the error under its fields. */
export function useSubmitEvaluation(id: string) {
  return useApiMutation({
    mutationFn: (body: SubmitEvaluationInput) => submitEvaluation(id, body),
    meta: { errorHandling: 'local' },
  });
}

/**
 * After the last evaluation: refresh the session so the new access token drops the gate, then
 * refetch the user, whose pendingEvaluations is now 0. The caller then goes back where it was.
 */
export function useLeaveEvaluationGate() {
  const queryClient = useQueryClient();
  return async () => {
    await refreshSession();
    await queryClient.invalidateQueries({ queryKey: authKeys.me() });
    await queryClient.invalidateQueries({ queryKey: evaluationKeys.all });
  };
}

/** The academy's pending requests (the admin's settings screen). */
export function usePendingEvaluationRequests(enabled = true) {
  return useApiQuery({
    queryKey: evaluationKeys.pending(),
    queryFn: ({ signal }) => listPendingEvaluationRequests(signal),
    enabled,
    meta: { errorHandling: 'local' },
  });
}

/** Cancels a pending request. The dialog shows the error. */
export function useCancelEvaluationRequest() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => cancelEvaluationRequest(id),
    meta: { errorHandling: 'local' },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: evaluationKeys.pending() });
      toast.success('اتلغى طلب التقييم');
    },
  });
}

/** Asks the student's instructor for an evaluation now. The dialog shows the error. */
export function useRequestStudentEvaluation(studentId: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: () => requestStudentEvaluation(studentId),
    meta: { errorHandling: 'local' },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: evaluationKeys.pending() });
      toast.success('اتبعت طلب التقييم للمدرس');
    },
  });
}

/** The student's written evaluations. `enabled` skips the request without the permission. */
export function useStudentEvaluations(studentId: string, enabled = true) {
  return useApiQuery({
    queryKey: evaluationKeys.student(studentId),
    queryFn: ({ signal }) => listStudentEvaluations(studentId, signal),
    enabled,
    meta: { errorHandling: 'local' },
  });
}

export function useAcademySettings() {
  return useApiQuery({
    queryKey: evaluationKeys.settings(),
    queryFn: ({ signal }) => getAcademySettings(signal),
    meta: { errorHandling: 'local' },
  });
}

/** Turns the rule on or off. An error goes to the global toast; the switch reads the server back. */
export function useUpdateAcademySettings() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (body: AcademySettings) => updateAcademySettings(body),
    onSuccess: (settings) => {
      queryClient.setQueryData(evaluationKeys.settings(), settings);
      toast.success(
        settings.evaluationsRequired ? 'التقييم الإجباري اشتغل' : 'التقييم الإجباري وقف',
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: evaluationKeys.settings() }),
  });
}
