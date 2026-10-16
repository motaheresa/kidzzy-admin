import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp } from './helpers';

// API Design V1: at most 5 login attempts per minute per IP, then 429 RATE_LIMITED.
// Its own file, so it gets a fresh app (and a fresh in-memory counter). The limit is set here,
// not read from the developer's .env; the default of 5 is covered by env.validation.spec.ts.

describe('Login rate limit (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 5 });
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows 5 attempts a minute, then answers 429', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ login: 'nobody@test.local', password: 'wrong-password' });

    for (let i = 0; i < 5; i++) await attempt().expect(401);
    const blocked = await attempt().expect(429);
    expect(blocked.body).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
  });
});
