import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Button, FullScreenMessage } from '@/components/ui';
import { isAppError, KIND_MESSAGES } from '@/lib/errors';

/**
 * The route error boundary (errorElement): a screen threw while rendering, or a route failed.
 * It shows an Arabic message, never a stack trace or the raw error. An AppError (from the API
 * layers) keeps its own message; anything else is a bug in the app, so the generic "something
 * went wrong", not normalizeError's guess (a TypeError from a crash is not a network problem).
 */
export function RouteErrorPage() {
  const error = useRouteError();
  const message = isAppError(error)
    ? error.message
    : isRouteErrorResponse(error) && error.status === 404
      ? KIND_MESSAGES.notFound
      : KIND_MESSAGES.unknown;

  return (
    <FullScreenMessage title={message} description="لو المشكلة فضلت، بلغ الإدارة.">
      <Button onClick={() => window.location.reload()}>جرب تاني</Button>
    </FullScreenMessage>
  );
}
