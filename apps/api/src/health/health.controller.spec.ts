import type { Response } from 'express';
import type { DataSource } from 'typeorm';
import { HEALTH_QUERY_TIMEOUT_MS, HealthController } from './health.controller.js';

function setup(query: () => Promise<unknown>) {
  const res = { status: vi.fn().mockReturnThis() } as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
  };
  const controller = new HealthController({ query } as unknown as DataSource);
  return { res, controller };
}

describe('HealthController', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports ok with the PostGIS version', async () => {
    const { res, controller } = setup(async () => [{ version: '3.6.4' }]);
    expect(await controller.check(res)).toEqual({ status: 'ok', database: 'up', postgis: '3.6.4' });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('reports 503 when the database query fails', async () => {
    const { res, controller } = setup(async () => {
      throw new Error('ECONNREFUSED');
    });
    expect(await controller.check(res)).toEqual({
      status: 'error',
      database: 'down',
      postgis: null,
    });
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('reports 503 when the database does not answer in time', async () => {
    vi.useFakeTimers();
    const { res, controller } = setup(() => new Promise(() => undefined));
    const pending = controller.check(res);
    await vi.advanceTimersByTimeAsync(HEALTH_QUERY_TIMEOUT_MS + 1);
    expect(await pending).toMatchObject({ status: 'error', database: 'down' });
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
