import { createContext, useContext } from 'react';

export type PushState = 'loading' | 'ios' | 'blocked' | 'on' | 'off';

export interface PushControl {
  state: PushState;
  /** True while a subscribe or unsubscribe request runs. */
  busy: boolean;
  /** The failed request's error, shown where the control is. */
  error: Error | null;
  enable(): Promise<void>;
  disable(): Promise<void>;
}

export const PushContext = createContext<PushControl | null>(null);

/** The web-push state of this browser, shared by the header button and the notifications page. */
export function usePushNotifications(): PushControl {
  const control = useContext(PushContext);
  if (!control) throw new Error('usePushNotifications needs PushProvider');
  return control;
}
