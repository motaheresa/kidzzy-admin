import { useState, type FormEvent } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  TextareaField,
} from '@/components/ui';
import { StarRating } from '@/features/attendance';
import { formatNumber } from '@/lib/format';
import { useSubmitEvaluation } from '../hooks/useEvaluations';
import type { EvaluationRequest } from '../types';

/** The API's rules (openapi.yaml: SubmitEvaluationRequest), checked here first. */
export const SUMMARY_MIN = 20;
export const TEXT_MAX = 2000;

/**
 * One pending evaluation: the stars (required), "ملخص الشهر" (required, at least 20 characters,
 * with a live counter), and the two optional texts. The checks run here before sending; the API's
 * 400 is shown under the same fields.
 */
export function EvaluationCard({
  request,
  onSubmitted,
}: {
  request: EvaluationRequest;
  onSubmitted: () => void;
}) {
  const submit = useSubmitEvaluation(request.id);
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [summary, setSummary] = useState('');
  const [strengths, setStrengths] = useState('');
  const [toImprove, setToImprove] = useState('');
  const [checked, setChecked] = useState(false);

  const length = summary.trim().length;
  const local = {
    overallRating: rating === undefined ? 'اختار تقييم من 1 لـ 5' : undefined,
    summary:
      length < SUMMARY_MIN
        ? `اكتب ${formatNumber(SUMMARY_MIN)} حرف على الأقل`
        : length > TEXT_MAX
          ? `الملخص ${formatNumber(TEXT_MAX)} حرف على الأكتر`
          : undefined,
  };
  const server = submit.error?.fieldErrors ?? {};
  const errorOf = (field: 'overallRating' | 'summary' | 'strengths' | 'toImprove') =>
    (checked && field in local ? local[field as keyof typeof local] : undefined) ?? server[field];

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setChecked(true);
    if (local.overallRating || local.summary || rating === undefined) return;
    submit.mutate(
      {
        overallRating: rating,
        summary: summary.trim(),
        strengths: strengths.trim() || null,
        toImprove: toImprove.trim() || null,
      },
      { onSuccess: onSubmitted },
    );
  };

  const cycle =
    request.cycleNumber === null
      ? 'طلب من الإدارة'
      : `الدورة رقم ${formatNumber(request.cycleNumber)}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{request.student.name}</CardTitle>
        <p className="text-sm text-muted-foreground">
          جروب {request.group.name} · {cycle}
        </p>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={onSubmit}
          className="flex flex-col gap-4"
          aria-label={`تقييم ${request.student.name}`}
        >
          <div className="flex flex-col gap-1.5">
            <StarRating
              label="التقييم العام"
              value={rating}
              onChange={(value) => setRating(value ?? undefined)}
            />
            {errorOf('overallRating') && (
              <p className="text-sm text-danger" role="alert">
                {errorOf('overallRating')}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <TextareaField
              label="ملخص الشهر"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              maxLength={TEXT_MAX}
              required
              rows={4}
              hint="إيه اللي اتعلمه وإزاي كان مستواه في الدورة دي"
              error={errorOf('summary')}
            />
            <p className="numeric text-xs text-muted-foreground" aria-live="polite">
              {formatNumber(length)} / {formatNumber(TEXT_MAX)}
              {length < SUMMARY_MIN && ` (فاضل ${formatNumber(SUMMARY_MIN - length)} حرف)`}
            </p>
          </div>
          <TextareaField
            label="نقاط القوة"
            value={strengths}
            onChange={(event) => setStrengths(event.target.value)}
            maxLength={TEXT_MAX}
            rows={2}
            hint="اختياري"
            error={errorOf('strengths')}
          />
          <TextareaField
            label="محتاج يتحسن في"
            value={toImprove}
            onChange={(event) => setToImprove(event.target.value)}
            maxLength={TEXT_MAX}
            rows={2}
            hint="اختياري"
            error={errorOf('toImprove')}
          />
          {submit.error && Object.keys(server).length === 0 && (
            <Alert variant="danger">{submit.error.message}</Alert>
          )}
          <Button type="submit" className="self-start" loading={submit.isPending}>
            ابعت التقييم
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
