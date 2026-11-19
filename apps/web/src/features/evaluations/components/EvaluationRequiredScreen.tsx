import { useState } from 'react';
import { ClipboardCheckIcon } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { Alert, Button, EmptyState, Skeleton } from '@/components/ui';
import { safeReturnTo } from '@/lib/routing';
import { useLeaveEvaluationGate, useMyEvaluationRequests } from '../hooks/useEvaluations';
import { EvaluationCard } from './EvaluationCard';

/**
 * The only screen while an evaluation must be written (US-42): one card per pending request.
 * After the last one is sent, the session is refreshed (so the API opens again at once) and the
 * user goes back to where they were (?returnTo=, kept safe by safeReturnTo).
 */
export function EvaluationRequiredScreen() {
  const requests = useMyEvaluationRequests();
  const leave = useLeaveEvaluationGate();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [leaving, setLeaving] = useState(false);

  const goBack = async () => {
    setLeaving(true);
    await leave();
    await navigate(safeReturnTo(params.get('returnTo')), { replace: true });
  };

  if (requests.isPending || leaving) {
    return <Skeleton className="h-64 w-full" aria-label="جاري التحميل" />;
  }
  if (requests.isError) {
    return (
      <Alert variant="danger">
        <p>{requests.error.message}</p>
        <Button variant="outline" onClick={() => void requests.refetch()}>
          جرب تاني
        </Button>
      </Alert>
    );
  }
  if (requests.data.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardCheckIcon aria-hidden="true" />}
        title="مفيش تقييمات مطلوبة منك دلوقتي"
        action={<Button onClick={() => void goBack()}>كمّل</Button>}
      />
    );
  }

  const remaining = requests.data.length;
  return (
    <div className="flex flex-col gap-4">
      <Alert variant="info">
        لازم تكتب {remaining === 1 ? 'تقييم الطالب ده' : `تقييم ${remaining} طلاب`} قبل ما تكمل شغلك
        على التطبيق.
      </Alert>
      {requests.data.map((request) => (
        <EvaluationCard
          key={request.id}
          request={request}
          onSubmitted={() => {
            if (remaining === 1) void goBack();
            else void requests.refetch();
          }}
        />
      ))}
    </div>
  );
}
