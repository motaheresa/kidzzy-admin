import { BellRingIcon } from 'lucide-react';
import { Alert, Button } from '@/components/ui';
import { usePushNotifications } from '../push-context';

/**
 * The header's "turn on phone notifications" button. It shows only while they are off: once on,
 * or when this browser cannot turn them on, the control lives on the notifications page
 * (PushSettings), so the header never carries a second bell next to the notifications link.
 */
export function EnableNotifications() {
  const { state, busy, error, enable } = usePushNotifications();
  if (state !== 'off') return null;

  return (
    <div className="flex flex-col items-end gap-2">
      {error && <Alert variant="danger">{error.message}</Alert>}
      <Button
        variant="outline"
        size="icon"
        className="sm:w-auto sm:px-4"
        title="تفعيل الإشعارات"
        loading={busy}
        onClick={() => void enable()}
      >
        <BellRingIcon aria-hidden="true" className="in-aria-busy:hidden" />
        <span className="sr-only sm:not-sr-only">تفعيل الإشعارات</span>
      </Button>
    </div>
  );
}
