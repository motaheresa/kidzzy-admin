import type { Me } from '@kidzzy/shared';

/** POST /auth/login body (openapi.yaml: LoginRequest). */
export interface LoginInput {
  /** Email or phone */
  login: string;
  password: string;
}

/** The signed-in user, as the API returns it (openapi.yaml: Me). */
export type { Me };
