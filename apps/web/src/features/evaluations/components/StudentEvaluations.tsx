import { useState } from 'react';
import { ClipboardCheckIcon } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  Skeleton,
} from '@/components/ui';
import { usePermissions } from '@/features/auth';
import { formatDate, formatNumber } from '@/lib/format';
import { useRequestStudentEvaluation, useStudentEvaluations } from '../hooks/useEvaluations';

/**
 * «طلب تقييم دلوقتي» on the student page (US-42): the admin asks the instructor of the student's
 * group for an evaluation now. Shown only with evaluations.manage; the API enforces it.
 */
export function RequestEvaluationButton({ studentId }: { studentId: string }) {
  const { can } = usePermissions();
  const [open, setOpen] = useState(false);
  const request = useRequestStudentEvaluation(studentId);
  if (!can('evaluations.manage')) return null;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) request.reset();
      }}
      trigger={<Button variant="outline">طلب تقييم دلوقتي</Button>}
      title="طلب تقييم للطالب دلوقتي؟"
      description="مدرس الجروب اللي الطالب فيه هيبقى لازم يكتب تقييم ليه قبل ما يكمل شغله على التطبيق."
      confirmLabel="ابعت الطلب"
      busy={request.isPending}
      onConfirm={() => request.mutate(undefined, { onSuccess: () => setOpen(false) })}
    >
      {request.error && <Alert variant="danger">{request.error.message}</Alert>}
    </ConfirmDialog>
  );
}

/** «التقييمات» on the student page: the written evaluations, newest first (evaluations.read). */
export function StudentEvaluationsList({ studentId }: { studentId: string }) {
  const { can } = usePermissions();
  const allowed = can('evaluations.read');
  const evaluations = useStudentEvaluations(studentId, allowed);
  if (!allowed) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>التقييمات</CardTitle>
        <RequestEvaluationButton studentId={studentId} />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {evaluations.isPending ? (
          <Skeleton className="h-32 w-full" aria-label="جاري التحميل" />
        ) : evaluations.isError ? (
          evaluations.error.kind === 'notFound' ? null : (
            <Alert variant="danger">{evaluations.error.message}</Alert>
          )
        ) : evaluations.data.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheckIcon aria-hidden="true" />}
            title="مفيش تقييمات لسه"
            className="py-6"
          />
        ) : (
          <ul className="grid gap-3">
            {evaluations.data.map((evaluation) => (
              <li key={evaluation.id} className="rounded-md border border-border p-4">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span className="numeric font-semibold text-foreground">
                    {formatNumber(evaluation.overallRating)} من 5
                  </span>
                  <span>{evaluation.instructor.name}</span>
                  <span>جروب {evaluation.group.name}</span>
                  {evaluation.cycleNumber !== null && (
                    <span>الدورة رقم {formatNumber(evaluation.cycleNumber)}</span>
                  )}
                  <span className="numeric">{formatDate(evaluation.submittedAt)}</span>
                </p>
                <p className="mt-2 whitespace-pre-line">{evaluation.summary}</p>
                {evaluation.strengths && (
                  <p className="mt-2 text-sm whitespace-pre-line">
                    <span className="font-semibold">نقاط القوة: </span>
                    {evaluation.strengths}
                  </p>
                )}
                {evaluation.toImprove && (
                  <p className="mt-1 text-sm whitespace-pre-line">
                    <span className="font-semibold">محتاج يتحسن في: </span>
                    {evaluation.toImprove}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
