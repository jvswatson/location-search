import type { HealthResponse } from '@location-search/shared';
import { Controller, Get, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Response } from 'express';
import type { DataSource } from 'typeorm';
import { HealthResponseDoc } from '../airports/dto/responses.dto.js';

/** Fail fast so an orchestrator's probe never hangs on a wedged connection pool. */
export const HEALTH_QUERY_TIMEOUT_MS = 2000;

/** Liveness + readiness in one: 200 when the database answers, 503 otherwise. Never throttled. */
@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  @Get()
  @ApiOperation({ summary: 'Database connectivity and PostGIS version.' })
  @ApiOkResponse({ type: HealthResponseDoc })
  @ApiServiceUnavailableResponse({ type: HealthResponseDoc })
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    try {
      const [row] = await withTimeout(
        this.ds.query<{ version: string }[]>(`SELECT postgis_lib_version() AS version`),
        HEALTH_QUERY_TIMEOUT_MS,
      );
      return { status: 'ok', database: 'up', postgis: row?.version ?? null };
    } catch {
      res.status(503);
      return { status: 'error', database: 'down', postgis: null };
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
