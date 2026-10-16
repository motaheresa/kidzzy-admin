import type { ChangePasswordRequest, Me } from '@kidzzy/shared';

/** POST /auth/change-password body (openapi.yaml: ChangePasswordRequest). */
export type { ChangePasswordRequest };

/** POST /auth/login body (openapi.yaml: LoginRequest). */
export interface LoginInput {
  /** Email or phone */
  login: string;
  password: string;
}

/** The signed-in user, as the API returns it (openapi.yaml: Me). */
export type { Me };
