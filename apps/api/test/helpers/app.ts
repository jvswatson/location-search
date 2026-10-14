import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { disposeTestDataSource } from './data-source.js';
import { connectSeededDataSource, databaseUrlOf } from './seeded.js';

export interface TestApp {
  app: NestExpressApplication;
  ds: DataSource;
  close: () => Promise<void>;
}

/**
 * Boots the real AppModule + configureApp exactly as main.ts does (NestFactory, not
 * Test.createTestingModule, so modules that need the HTTP adapter at compile time, like
 * serve-static, behave as in production) against this suite's own seeded database.
 * `env` overrides any variable (e.g. RATE_LIMIT_LIMIT).
 */
export async function createTestApp(env: Record<string, string> = {}): Promise<TestApp> {
  const ds = await connectSeededDataSource();
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot({
      env: {
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
        DATABASE_URL: databaseUrlOf(ds),
        // Keep the shared limit out of the way unless a suite is testing it.
        RATE_LIMIT_LIMIT: '100000',
        ...env,
      },
    }),
    { bufferLogs: true, abortOnError: false },
  );
  configureApp(app);
  await app.init();

  return {
    app,
    ds,
    close: async () => {
      await app.close();
      await disposeTestDataSource(ds);
    },
  };
}
