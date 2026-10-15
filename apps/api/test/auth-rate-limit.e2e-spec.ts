import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp } from './helpers';

// API Design V1: at most 5 login attempts per minute per IP, then 429 RATE_LIMITED.
// Its own file, so it gets a fresh app (and a fresh in-memory counter) with the default limit.

describe('Login rate limit (e2e)', () => {
  let app: INestApplication<App>;
  const previousLimit = process.env.LOGIN_RATE_LIMIT;

  beforeAll(async () => {
    delete process.env.LOGIN_RATE_LIMIT;
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    process.env.LOGIN_RATE_LIMIT = previousLimit;
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
