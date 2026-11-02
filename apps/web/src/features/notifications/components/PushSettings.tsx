import { Alert, Button } from '@/components/ui';
import { usePushNotifications } from '../push-context';

/**
 * A small line on the notifications page about phone notifications on this device: whether they
 * are on, how to turn them off (or on), and why they cannot be turned on here (iPhone not
 * installed, browser blocking).
 */
export function PushSettings() {
  const { state, busy, error, enable, disable } = usePushNotifications();
  if (state === 'loading') return null;

  return (
    <div className="flex flex-col gap-2 text-xs text-muted-foreground">
      {error && <Alert variant="danger">{error.message}</Alert>}
      {state === 'ios' && <p>الإشعارات على الآيفون بتشتغل بعد ما تضيف التطبيق لشاشة البداية.</p>}
      {state === 'blocked' && <p>المتصفح مانع الإشعارات.</p>}
      {state === 'on' && (
        <p className="flex flex-wrap items-center gap-x-2">
          إشعارات الموبايل شغالة على الجهاز ده.
          <Button
            variant="link"
            className="h-auto min-h-11 px-0 text-xs"
            loading={busy}
            onClick={() => void disable()}
          >
            إيقاف إشعارات الموبايل
          </Button>
        </p>
      )}
      {state === 'off' && (
        <p className="flex flex-wrap items-center gap-x-2">
          إشعارات الموبايل مقفولة على الجهاز ده.
          <Button
            variant="link"
            className="h-auto min-h-11 px-0 text-xs"
            loading={busy}
            onClick={() => void enable()}
          >
            تفعيل إشعارات الموبايل
          </Button>
        </p>
      )}
    </div>
  );
}
