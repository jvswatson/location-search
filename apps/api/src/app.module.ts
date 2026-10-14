import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { AirportsModule } from './airports/airports.module.js';
import { type AppEnv, validateEnv } from './config/env.validation.js';
import { dataSourceOptions } from './database/database.config.js';
import { HealthModule } from './health/health.module.js';

export const API_PREFIX = 'api/v1';

type Config = ConfigService<AppEnv, true>;

export interface AppModuleOptions {
  /** Values layered over process.env before validation (tests point DATABASE_URL here). */
  env?: Record<string, string>;
}

@Module({})
export class AppModule {
  static forRoot({ env = {} }: AppModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          cache: true,
          validate: (config) => validateEnv({ ...config, ...env }),
        }),

        LoggerModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (config: Config) => ({
            pinoHttp: {
              level: config.get('LOG_LEVEL', { infer: true }),
              // pino-pretty is a dev dependency: never load it outside development.
              transport:
                config.get('NODE_ENV', { infer: true }) === 'development'
                  ? { target: 'pino-pretty', options: { singleLine: true } }
                  : undefined,
              redact: ['req.headers.authorization', 'req.headers.cookie'],
              // Container health probes would otherwise dominate the request log.
              autoLogging: {
                ignore: (req) => req.url?.startsWith(`/${API_PREFIX}/health`) ?? false,
              },
            },
          }),
        }),

        TypeOrmModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (config: Config) => ({
            ...dataSourceOptions({
              DATABASE_URL: config.get('DATABASE_URL', { infer: true }),
              DB_HOST: config.get('DB_HOST', { infer: true }),
              DB_PORT: String(config.get('DB_PORT', { infer: true })),
              POSTGRES_USER: config.get('POSTGRES_USER', { infer: true }),
              POSTGRES_PASSWORD: config.get('POSTGRES_PASSWORD', { infer: true }),
              POSTGRES_DB: config.get('POSTGRES_DB', { infer: true }),
              DB_LOGGING: String(config.get('DB_LOGGING', { infer: true })),
            }),
            retryAttempts: 5,
            retryDelay: 2000,
            // Bound waits for a pooled connection so /health reports 503 rather than hanging.
            extra: { connectionTimeoutMillis: 5000 },
          }),
        }),

        ThrottlerModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (config: Config) => ({
            throttlers: [
              {
                limit: config.get('RATE_LIMIT_LIMIT', { infer: true }),
                ttl: config.get('RATE_LIMIT_TTL_MS', { infer: true }),
              },
            ],
            errorMessage: 'Too many requests, please retry later',
            // One budget per client IP across all routes (the default keys per route handler).
            generateKey: (_context, tracker, throttlerName) => `${throttlerName}:${tracker}`,
          }),
        }),

        ServeStaticModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (config: Config) => {
            const rootPath = config.get('WEB_DIST_PATH', { infer: true });
            // The SPA fallback serves index.html for any non-API GET; API 404s stay JSON.
            return rootPath ? [{ rootPath, exclude: ['/api/{*path}'] }] : [];
          },
        }),

        AirportsModule,
        HealthModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    };
  }
}
