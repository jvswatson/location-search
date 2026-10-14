import Joi from 'joi';

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Validated environment. Every key the app reads is listed here with its default. */
export interface AppEnv {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  /** Wins over the discrete DB_* / POSTGRES_* variables when set. */
  DATABASE_URL?: string;
  DB_HOST: string;
  DB_PORT: number;
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
  POSTGRES_DB: string;
  DB_LOGGING: boolean;
  RATE_LIMIT_LIMIT: number;
  RATE_LIMIT_TTL_MS: number;
  LOG_LEVEL: LogLevel;
  /** Directory of the built web app; when set it is served with an SPA fallback. */
  WEB_DIST_PATH?: string;
  /**
   * Express `trust proxy` setting, so `req.ip` (the rate-limit key) is the client rather than the
   * proxy. The default trusts only private-network hops (Docker, a sidecar or an internal load
   * balancer), so a client cannot spoof X-Forwarded-For when the API is exposed directly.
   */
  TRUST_PROXY: string;
}

export const envSchema = Joi.object<AppEnv>({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('production'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string().uri({ scheme: ['postgres', 'postgresql'] }),
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().port().default(5432),
  POSTGRES_USER: Joi.string().default('airports'),
  // The local-dev default must never reach a real deployment: in production the password has to be
  // given explicitly (or carried by DATABASE_URL).
  POSTGRES_PASSWORD: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.when('DATABASE_URL', {
      is: Joi.exist(),
      then: Joi.string().allow(''),
      otherwise: Joi.string().required().messages({
        'any.required':
          '"POSTGRES_PASSWORD" is required when NODE_ENV is production (or set DATABASE_URL)',
        'string.empty': '"POSTGRES_PASSWORD" must not be empty when NODE_ENV is production',
      }),
    }),
    otherwise: Joi.string().allow('').default('airports'),
  }),
  POSTGRES_DB: Joi.string().default('airports'),
  DB_LOGGING: Joi.boolean().default(false),
  RATE_LIMIT_LIMIT: Joi.number().integer().min(1).default(100),
  RATE_LIMIT_TTL_MS: Joi.number().integer().min(1).default(1000),
  LOG_LEVEL: Joi.string()
    .valid(...LOG_LEVELS)
    .default('info'),
  WEB_DIST_PATH: Joi.string(),
  TRUST_PROXY: Joi.string().default('loopback, linklocal, uniquelocal'),
}).unknown(true);

/** Validates (and defaults) the environment, throwing one error that lists every problem. */
export function validateEnv(env: Record<string, unknown>): AppEnv {
  const { error, value } = envSchema.validate(env, { abortEarly: false, convert: true });
  if (error) throw new Error(`Invalid environment: ${error.message}`);
  return value;
}
