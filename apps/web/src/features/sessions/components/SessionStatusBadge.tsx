import { SessionStatus, type SessionStatus as SessionStatusValue } from '@kidzzy/shared';
import { Badge } from '@/components/ui';

const STATUS_LABEL: Record<
  SessionStatusValue,
  { label: string; variant: 'brand' | 'success' | 'danger' }
> = {
  [SessionStatus.Scheduled]: { label: 'مجدولة', variant: 'brand' },
  [SessionStatus.Held]: { label: 'اتعملت', variant: 'success' },
  [SessionStatus.Cancelled]: { label: 'اتلغت', variant: 'danger' },
};

/**
 * The session's status, and a second badge for a session added by hand (US-16): "تعويضية" when it
 * makes up for a cancelled session (`compensates`), "اضافية" when it is an extra one.
 */
export function SessionStatusBadge({
  status,
  isMakeup,
  compensates = false,
}: {
  status: SessionStatusValue;
  isMakeup?: boolean;
  compensates?: boolean;
}) {
  const item = STATUS_LABEL[status];
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge variant={item.variant}>{item.label}</Badge>
      {isMakeup && <Badge variant="accent">{compensates ? 'تعويضية' : 'اضافية'}</Badge>}
    </span>
  );
}
