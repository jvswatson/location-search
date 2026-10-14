import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { AppEnv } from './config/env.validation.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(), {
    bufferLogs: true,
  });
  configureApp(app);
  // Close the DataSource and HTTP server cleanly on SIGTERM (docker stop).
  app.enableShutdownHooks();
  await app.listen(
    app.get<ConfigService<AppEnv, true>>(ConfigService).get('PORT', { infer: true }),
  );
}

void bootstrap();
