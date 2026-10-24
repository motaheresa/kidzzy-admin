import { useEffect, useState } from 'react';

const MINUTE_MS = 60_000;

/** The current minute as an ISO 8601 instant (seconds and milliseconds dropped). */
function currentMinute(): string {
  return new Date(Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS).toISOString();
}

/**
 * "Now", to the minute, renewed every minute. A list of what has already started asks the API
 * with it: a value that changed on every render would be a new request every render, and one
 * that never changed would leave a session that has just started out of the list.
 */
export function useCurrentMinute(): string {
  const [minute, setMinute] = useState(currentMinute);
  useEffect(() => {
    const id = setInterval(() => setMinute(currentMinute()), MINUTE_MS);
    return () => clearInterval(id);
  }, []);
  return minute;
}
