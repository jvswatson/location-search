import { validateEnv } from './env.validation.js';

describe('validateEnv', () => {
  it('applies defaults outside production', () => {
    expect(validateEnv({ NODE_ENV: 'development' })).toEqual({
      NODE_ENV: 'development',
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

  it('defaults the local password for tests too', () => {
    expect(validateEnv({ NODE_ENV: 'test' }).POSTGRES_PASSWORD).toBe('airports');
  });

  describe('in production (the default NODE_ENV)', () => {
    it('requires POSTGRES_PASSWORD, with a message that says how to fix it', () => {
      expect(() => validateEnv({})).toThrow(
        /"POSTGRES_PASSWORD" is required when NODE_ENV is production \(or set DATABASE_URL\)/,
      );
      expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(/POSTGRES_PASSWORD/);
    });

    it('rejects an empty password', () => {
      expect(() => validateEnv({ POSTGRES_PASSWORD: '' })).toThrow(/must not be empty/);
    });

    it('accepts an explicit password and keeps the other defaults', () => {
      expect(validateEnv({ POSTGRES_PASSWORD: 's3cret' })).toMatchObject({
        NODE_ENV: 'production',
        POSTGRES_PASSWORD: 's3cret',
        POSTGRES_USER: 'airports',
      });
    });

    it('accepts DATABASE_URL in place of POSTGRES_PASSWORD', () => {
      const env = validateEnv({ DATABASE_URL: 'postgres://u:p@db:5432/x' });
      expect(env.DATABASE_URL).toBe('postgres://u:p@db:5432/x');
      expect(env.POSTGRES_PASSWORD).toBeUndefined();
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
