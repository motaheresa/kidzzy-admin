import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Button, FullScreenMessage } from '@/components/ui';
import { KIND_MESSAGES, normalizeError } from '@/lib/errors';

/**
 * The route error boundary (errorElement): a screen threw while rendering, or a route failed.
 * It shows the normalized Arabic message, never a stack trace or the raw error.
 */
export function RouteErrorPage() {
  const error = useRouteError();
  const message =
    isRouteErrorResponse(error) && error.status === 404
      ? KIND_MESSAGES.notFound
      : normalizeError(error).message;

  return (
    <FullScreenMessage title={message}>
      <Button onClick={() => window.location.reload()}>جرب تاني</Button>
    </FullScreenMessage>
  );
}
