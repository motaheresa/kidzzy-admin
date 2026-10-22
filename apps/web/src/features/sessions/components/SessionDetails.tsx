import { CalendarOffIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Alert, Button, DetailList, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { usePermissions, useSession } from '@/features/auth';
import { formatDateTime, formatNumber } from '@/lib/format';
import { useSessionDetail } from '../hooks/useSessions';
import { CancelSessionButton } from './CancelSessionButton';
import { MarkHeldButton } from './MarkHeldButton';
import { SessionStatusBadge } from './SessionStatusBadge';

/**
 * One session (US-12). Times are shown in the academy's timezone.
 * Marking Held and cancelling are offered when this caller may change this session (US-13, US-14).
 */
export function SessionDetails({ id }: { id: string }) {
  const session = useSessionDetail(id);
  const me = useSession();
  const { can } = usePermissions();
  const timeZone = me.data?.academy.timezone ?? 'Africa/Cairo';

  if (session.isPending) {
    return (
      <div className="grid gap-4" aria-label="جاري التحميل">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (session.isError) {
    const error = session.error;
    return error.kind === 'notFound' || error.kind === 'forbidden' ? (
      <EmptyState
        icon={<CalendarOffIcon aria-hidden="true" />}
        title={error.kind === 'notFound' ? 'الحصة دي مش موجودة' : 'الحصة دي مش بتاعتك'}
        description={
          error.kind === 'forbidden' ? 'تقدر تشوف حصص الجروبات اللي بتدرسها بس.' : undefined
        }
        action={
          <Button asChild variant="outline">
            <Link to="/">ارجع للرئيسية</Link>
          </Button>
        }
      />
    ) : (
      <Alert variant="danger">{error.message}</Alert>
    );
  }

  const data = session.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={data.group.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{formatDateTime(data.scheduledAt, timeZone)}</span>
            <SessionStatusBadge status={data.status} isMakeup={data.isMakeup} />
          </span>
        }
        actions={
          <>
            <MarkHeldButton session={data} />
            <CancelSessionButton session={data} />
            {can('groups.read') && (
              <Button asChild variant="outline">
                <Link to={`/groups/${data.group.id}`}>ارجع للجروب</Link>
              </Button>
            )}
          </>
        }
      />
      <DetailList
        items={[
          {
            label: 'رقم الحصة',
            value: data.sessionNumber === null ? '—' : formatNumber(data.sessionNumber),
          },
          { label: 'المدة', value: `${formatNumber(data.durationMin)} دقيقة` },
          { label: 'سبب الالغاء', value: data.cancelReason },
        ]}
      />
    </div>
  );
}
