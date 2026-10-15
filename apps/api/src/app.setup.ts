import { MAX_REQUEST_URL_LENGTH } from '@location-search/shared';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { API_PREFIX } from './app.module.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { rejectLongUrls } from './common/url-length.middleware.js';
import { createValidationPipe } from './common/validation.js';
import type { AppEnv } from './config/env.validation.js';

export const SWAGGER_PATH = 'api/docs';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Location Search API')
    .setDescription(
      'Read-only airport search. Distances and radii are in miles, altitudes in feet. ' +
        'Every non-2xx response has the shape { statusCode, error, message }.',
    )
    .setVersion('1')
    .build();
  return SwaggerModule.createDocument(app, config);
}

/**
 * Everything about the HTTP surface that is not a module: prefix, validation, error shape,
 * proxy trust, CORS and Swagger. main.ts and the e2e tests both call this, so tests exercise the
 * production wiring.
 */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  const config = app.get<ConfigService<AppEnv, true>>(ConfigService);

  app.useLogger(app.get(Logger));
  // First, so an oversize URL is refused before any other work (see url-length.middleware.ts).
  app.use(rejectLongUrls(MAX_REQUEST_URL_LENGTH));
  app.set('trust proxy', parseTrustProxy(config.get('TRUST_PROXY', { infer: true })));
  app.disable('x-powered-by');
  if (config.get('NODE_ENV', { infer: true }) === 'development') app.enableCors();

  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());

  SwaggerModule.setup(SWAGGER_PATH, app, () => buildOpenApiDocument(app));
  return app;
}

/** Express accepts a hop count, a boolean, or a comma-separated list of addresses/subnet names. */
export function parseTrustProxy(value: string): boolean | number | string {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}
