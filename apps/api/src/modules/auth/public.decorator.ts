import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Every route needs a valid login by default (the global JwtAuthGuard).
 * @Public() opts a route out: login, refresh and the health check.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
