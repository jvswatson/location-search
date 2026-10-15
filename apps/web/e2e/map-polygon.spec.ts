import { expect, test, type Page } from '@playwright/test';
import { expectPinsMatchApi, map, openApp, rows } from './helpers';

const polygonMode = (page: Page) => page.getByRole('radio', { name: 'Polygon' });

/** Clicks the map at fractions of its size (0..1). */
async function clickMapAt(page: Page, fx: number, fy: number, clickCount = 1) {
  const box = (await map(page).boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy, { clickCount });
}

/** Clicks the first three points of a triangle around the map's center. */
async function outlineTriangle(page: Page) {
  await clickMapAt(page, 0.4, 0.4);
  await clickMapAt(page, 0.62, 0.42);
}

test('outlines a polygon with clicks and a double-click, and pins every match', async ({
  page,
  request,
}) => {
  await openApp(page);
  await polygonMode(page).click();
  await expect(page.getByTestId('map-prompt')).toHaveText(
    'Click points on the map to outline an area, or search to start filtering',
  );

  await outlineTriangle(page);
  await expect(page.getByTestId('draft-points')).toHaveText('2 points');
  await expect(page.getByTestId('draw-hint')).toBeVisible();
  // A real double-click: the browser sends click, click, dblclick on the same spot.
  await clickMapAt(page, 0.5, 0.6, 2);

  await expect(map(page)).toHaveAttribute(
    'data-polygon',
    /^(-?[\d.]+,-?[\d.]+;){2}-?[\d.]+,-?[\d.]+$/,
  );
  await expect(page).toHaveURL(/area=polygon&polygon=/);
  await expect(page.getByTestId('draft-points')).toHaveText('0 points');
  expect(await expectPinsMatchApi(page, request)).toBeGreaterThan(0);

  await expect(page.getByRole('columnheader', { name: /Distance/ })).toBeVisible();
});

test('the map does not move when drawing starts (clicks stay where they were aimed)', async ({
  page,
}) => {
  await openApp(page);
  await polygonMode(page).click();
  const before = await map(page).boundingBox();
  await clickMapAt(page, 0.4, 0.4);
  await expect(page.getByTestId('draft-points')).toHaveText('1 point');
  expect(await map(page).boundingBox()).toEqual(before);
});

test('clicking the first point closes the outline', async ({ page }) => {
  await openApp(page);
  await polygonMode(page).click();
  await outlineTriangle(page);
  await clickMapAt(page, 0.5, 0.6);
  await expect(page.getByTestId('draft-points')).toHaveText('3 points');

  await clickMapAt(page, 0.4, 0.4); // exactly on the first point
  await expect(map(page)).toHaveAttribute('data-polygon', /^[^;]+;[^;]+;[^;]+$/);
  await expect(page.getByTestId('draft-points')).toHaveText('0 points');
});

test('a reload restores the polygon and its results', async ({ page, request }) => {
  // A concave L around London; the seeded data has airports inside it.
  await openApp(page, '?polygon=-1,51;1,51;1,51.4;-0.2,51.4;-0.2,52;-1,52');
  await expect(polygonMode(page)).toHaveAttribute('aria-checked', 'true');
  const inside = await expectPinsMatchApi(page, request);
  expect(inside).toBeGreaterThan(0);
  const first = await rows(page).first().getAttribute('data-icao');

  await page.reload();
  await expect(map(page)).toHaveAttribute(
    'data-polygon',
    '-1,51;1,51;1,51.4;-0.2,51.4;-0.2,52;-1,52',
  );
  expect(await expectPinsMatchApi(page, request)).toBe(inside);
  await expect(rows(page).first()).toHaveAttribute('data-icao', first!);
});

test('blocks a self-intersecting outline and recovers with Undo', async ({ page }) => {
  await openApp(page);
  await polygonMode(page).click();
  // A bow-tie: top-left, bottom-right, top-right, bottom-left.
  await clickMapAt(page, 0.35, 0.35);
  await clickMapAt(page, 0.65, 0.65);
  await clickMapAt(page, 0.65, 0.35);
  await clickMapAt(page, 0.35, 0.65);
  await page.getByRole('button', { name: 'Finish' }).click();

  await expect(page.getByTestId('draw-error')).toContainText("can't cross or touch itself");
  await expect(map(page)).not.toHaveAttribute('data-polygon', /.*/);
  await expect(page).not.toHaveURL(/polygon=/);

  await page.getByRole('button', { name: 'Undo last point' }).click();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(map(page)).toHaveAttribute('data-polygon', /;/);
  await expect(page.getByTestId('draw-error')).toHaveCount(0);
});

test('Enter finishes and Escape cancels', async ({ page }) => {
  await openApp(page);
  await polygonMode(page).click();
  await outlineTriangle(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('draft-points')).toHaveText('0 points');

  await outlineTriangle(page);
  await clickMapAt(page, 0.5, 0.6);
  await page.keyboard.press('Enter');
  await expect(map(page)).toHaveAttribute('data-polygon', /;/);
});

test('the API rejects what the UI blocks, independently', async ({ request }) => {
  const bowtie = await request.get('/api/v1/airports?polygon=0,0;10,10;10,0;0,10');
  expect(bowtie.status()).toBe(400);
  const antimeridian = await request.get('/api/v1/airports?polygon=170,0;-170,0;-170,10;170,10');
  expect(antimeridian.status()).toBe(400);
  expect((await request.post('/api/v1/airports/within', { data: {} })).status()).toBe(404);
});
