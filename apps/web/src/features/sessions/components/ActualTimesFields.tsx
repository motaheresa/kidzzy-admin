import { FormField } from '@/components/ui';
import { formatDuration } from '@/lib/format';
import { previewMinutes } from '../lib/actual-times';

/**
 * The two time inputs of a Held session, "بدأت" and "خلصت", with the length they make shown live
 * underneath (SCRUM-80). The preview reads the times the way the server does, so an end typed
 * before the start shows as a long session across midnight and the mistake is visible before
 * saving. Used by the Held dialog and by the correction dialog.
 */
export function ActualTimesFields({
  scheduledAt,
  timeZone,
  startedAt,
  endedAt,
  onStartedAt,
  onEndedAt,
  startedAtError,
  endedAtError,
}: {
  scheduledAt: string;
  timeZone: string;
  startedAt: string;
  endedAt: string;
  onStartedAt: (value: string) => void;
  onEndedAt: (value: string) => void;
  startedAtError?: string;
  endedAtError?: string;
}) {
  const minutes = previewMinutes(scheduledAt, startedAt, endedAt, timeZone);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3">
        <FormField
          label="بدأت"
          type="time"
          value={startedAt}
          onChange={(event) => onStartedAt(event.target.value)}
          error={startedAtError}
          required
        />
        <FormField
          label="خلصت"
          type="time"
          value={endedAt}
          onChange={(event) => onEndedAt(event.target.value)}
          error={endedAtError}
          required
        />
      </div>
      {minutes !== null && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          المدة: {formatDuration(minutes)}
        </p>
      )}
    </div>
  );
}
