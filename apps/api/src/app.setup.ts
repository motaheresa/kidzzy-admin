import { INestApplication, ValidationPipe } from '@nestjs/common';
import { API_PREFIX } from '@kidzzy/shared';

/**
 * Global setup shared by main.ts and the e2e tests, so tests run the app
 * exactly as production does.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties that have no decorator in the DTO
      forbidNonWhitelisted: true, // reject unknown properties with 400
      transform: true, // turn plain JSON into DTO class instances
    }),
  );
  app.enableShutdownHooks();
}
