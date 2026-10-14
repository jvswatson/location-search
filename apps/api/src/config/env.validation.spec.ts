import { validateEnv } from './env.validation.js';

describe('validateEnv', () => {
  it('applies defaults', () => {
    expect(validateEnv({})).toEqual({
      NODE_ENV: 'production',
      PORT: 3000,
      DB_HOST: 'localhost',
      DB_PORT: 5432,
      POSTGRES_USER: 'airports',
      POSTGRES_PASSWORD: 'airports',
      POSTGRES_DB: 'airports',
      DB_LOGGING: false,
      RATE_LIMIT_LIMIT: 100,
      RATE_LIMIT_TTL_MS: 1000,
      LOG_LEVEL: 'info',
      TRUST_PROXY: 'loopback, linklocal, uniquelocal',
    });
  });

  it('converts strings from the environment and keeps unrelated variables', () => {
    const env = validateEnv({
      PORT: '3200',
      RATE_LIMIT_LIMIT: '3',
      DB_LOGGING: 'true',
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgres://u:p@db:5432/x',
      WEB_DIST_PATH: '/app/apps/web/dist',
      HOME: '/root',
    });
    expect(env).toMatchObject({
      PORT: 3200,
      RATE_LIMIT_LIMIT: 3,
      DB_LOGGING: true,
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgres://u:p@db:5432/x',
      WEB_DIST_PATH: '/app/apps/web/dist',
    });
  });

  it('lists every problem in one error', () => {
    const bad = {
      PORT: 'eighty',
      NODE_ENV: 'staging',
      DATABASE_URL: 'http://x',
      RATE_LIMIT_LIMIT: '0',
    };
    expect(() => validateEnv(bad)).toThrow(/^Invalid environment/);
    try {
      validateEnv(bad);
    } catch (err) {
      for (const key of Object.keys(bad)) expect((err as Error).message).toContain(`"${key}"`);
    }
  });
});
