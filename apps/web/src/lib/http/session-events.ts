// "The session has expired" signal, from the network layer to whoever cares (the app layer).
// Plain subscribe/emit with no React, so lib/http depends on nothing above it.

type Listener = () => void;

const listeners = new Set<Listener>();

/** Calls `listener` every time the session expires; returns the function that unsubscribes. */
export function onSessionExpired(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tells every subscriber that the refresh token was refused: the user must sign in again. */
export function emitSessionExpired(): void {
  for (const listener of [...listeners]) listener();
}
