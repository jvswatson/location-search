import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp, type TestApp } from '../helpers/app.js';

describe('rate limiting (e2e)', () => {
  let t: TestApp;
  let http: App;

  beforeAll(async () => {
    // A long window so the test cannot straddle a reset and flake.
    t = await createTestApp({ RATE_LIMIT_LIMIT: '3', RATE_LIMIT_TTL_MS: '60000' });
    http = t.app.getHttpServer();
  });

  afterAll(async () => {
    await t?.close();
  });

  it('429s the 4th request in the window with Retry-After, but never throttles /health', async () => {
    for (let i = 0; i < 3; i++) {
      const ok = await request(http).get('/api/v1/countries').expect(200);
      expect(ok.headers['x-ratelimit-limit']).toBe('3');
    }

    const limited = await request(http).get('/api/v1/airports/EGLL').expect(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.body).toEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      message: expect.any(String),
    });

    for (let i = 0; i < 5; i++) {
      await request(http).get('/api/v1/health').expect(200);
    }
  });
});
