import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp, type TestApp } from '../helpers/app.js';

describe('health, docs and static web (e2e)', () => {
  let t: TestApp;
  let http: App;
  let webDist: string;

  beforeAll(async () => {
    // A stand-in for the built web app, served via WEB_DIST_PATH like the Docker image does.
    webDist = await mkdtemp(path.join(tmpdir(), 'web-dist-'));
    await mkdir(path.join(webDist, 'assets'));
    await writeFile(path.join(webDist, 'index.html'), '<!doctype html><title>spa</title>');
    await writeFile(path.join(webDist, 'assets', 'app.js'), 'console.log(1)');

    t = await createTestApp({ WEB_DIST_PATH: webDist });
    http = t.app.getHttpServer();
  });

  afterAll(async () => {
    await t?.close();
    if (webDist) await rm(webDist, { recursive: true, force: true });
  });

  it('GET /api/v1/health reports the database and PostGIS version', async () => {
    const res = await request(http).get('/api/v1/health').expect(200);
    expect(res.body).toEqual({
      status: 'ok',
      database: 'up',
      postgis: expect.stringMatching(/^\d+\.\d+/),
    });
  });

  it('serves the OpenAPI document and Swagger UI', async () => {
    const json = await request(http).get('/api/docs-json').expect(200);
    expect(json.body.openapi).toMatch(/^3\./);
    const paths = Object.keys(json.body.paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/v1/airports',
        '/api/v1/airports/points',
        '/api/v1/airports/distance',
        '/api/v1/airports/{icao}',
        '/api/v1/airports/{icao}/nearest',
        '/api/v1/countries',
        '/api/v1/health',
      ]),
    );
    expect(paths).not.toContain('/api/v1/airports/within');
    const params = json.body.paths['/api/v1/airports'].get.parameters.map(
      (p: { name: string }) => p.name,
    );
    expect(params).toEqual(
      expect.arrayContaining([
        'q',
        'country',
        'bbox',
        'polygon',
        'radiusMi',
        'sort',
        'page',
        'limit',
        'format',
      ]),
    );
    expect(json.body.components.schemas).toHaveProperty('AirportDoc');

    const ui = await request(http).get('/api/docs').expect(200);
    expect(ui.text).toMatch(/swagger/i);
  });

  it('serves the web app with an SPA fallback', async () => {
    const asset = await request(http).get('/assets/app.js').expect(200);
    expect(asset.text).toBe('console.log(1)');
    const deepLink = await request(http).get('/airports/EGLL').expect(200);
    expect(deepLink.headers['content-type']).toMatch(/text\/html/);
    expect(deepLink.text).toContain('<title>spa</title>');
  });

  it('never answers API paths with the SPA', async () => {
    const res = await request(http).get('/api/v1/does-not-exist').expect(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toMatchObject({ statusCode: 404, error: 'Not Found' });
  });

  it('does not enable CORS outside development', async () => {
    const res = await request(http)
      .get('/api/v1/countries')
      .set('Origin', 'https://elsewhere.example')
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
