import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { API_PREFIX } from '@kidzzy/shared';
import cookieParser from 'cookie-parser';
import { ProblemDetailsFilter } from './common/errors/problem-details.filter';
import { validationExceptionFactory } from './common/errors/validation';

/**
 * Global setup shared by main.ts and the e2e tests, so tests run the app
 * exactly as production does.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);

  // The web server on the same machine proxies /api to us, so the client IP (used by the
  // login rate limit) comes from X-Forwarded-For, trusted only when the proxy is local.
  (app as NestExpressApplication).set('trust proxy', 'loopback');

  // Reads the httpOnly auth cookies into request.cookies.
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties that have no decorator in the DTO
      forbidNonWhitelisted: true, // reject unknown properties with 400
      transform: true, // turn plain JSON into DTO class instances
      exceptionFactory: validationExceptionFactory, // 400 VALIDATION_FAILED with field errors
    }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();
}
