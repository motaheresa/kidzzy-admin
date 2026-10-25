import type { Page, Session, SessionStatus } from '@kidzzy/shared';

/** The API's session shape (openapi.yaml: Session). */
export type { Page, Session, SessionStatus };

/** One page of GET /sessions. `from` is inclusive and `to` exclusive, both UTC. */
export interface SessionListParams {
  page: number;
  pageSize?: number;
  from?: string;
  to?: string;
  groupId?: string;
  status?: SessionStatus;
  /** true: only the make-up and extra sessions added by hand. */
  isMakeup?: boolean;
}
