import { expect, test } from '@playwright/test';
import {
  expectPinsMatchApi,
  LONDON,
  map,
  openApp,
  radiusSelect,
  rows,
  searchBox,
  settledBox,
  total,
  visibleIcaos,
} from './helpers';

const londonUrl = (radiusMi: number) => `?lat=${LONDON.lat}&lng=${LONDON.lng}&radiusMi=${radiusMi}`;

test('clicking the map sets a center and shows pins for every match', async ({ page, request }) => {
  await openApp(page);
  // Click a little north-east of the map's middle (the default view is centered on land-heavy
  // latitudes); whatever matches there must equal what the API reports for the same filters.
  const box = (await map(page).boundingBox())!;
  await map(page).click({ position: { x: box.width * 0.55, y: box.height * 0.4 } });

  await expect(map(page)).toHaveAttribute('data-center', /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);
  await expect(page.getByTestId('map-prompt')).toHaveCount(0);
  await expect(page).toHaveURL(/radiusMi=50/);

  await radiusSelect(page).selectOption('1000');
  await expect(page).toHaveURL(/radiusMi=1000/);
  await expectPinsMatchApi(page, request);
});

test('London within 30 miles: known airports, nearest first', async ({ page, request }) => {
  await openApp(page, londonUrl(30));

  // 30 is not a preset, so the select shows it as a custom value.
  await expect(radiusSelect(page).locator('option:checked')).toHaveText('Custom (30 mi)');
  await expect(total(page)).toHaveAttribute('data-total', '9');
  expect(await expectPinsMatchApi(page, request)).toBe(9);

  const icaos = await visibleIcaos(page);
  expect(icaos[0]).toBe('EGLC'); // London City, ~7.8 mi
  expect(icaos).toEqual(expect.arrayContaining(['EGLL', 'EGKK']));
  await expect(page.getByRole('columnheader', { name: /Distance/ })).toBeVisible();
  await expect(rows(page).filter({ hasText: 'Heathrow' })).toContainText('14.5');
});

test('dragging the radius handle resizes the search', async ({ page, request }) => {
  await openApp(page, londonUrl(250));
  const before = await expectPinsMatchApi(page, request);

  // The handle is the only Leaflet marker; drag it toward the center to shrink the circle.
  const hb = await settledBox(page.locator('.leaflet-marker-icon'));
  const cx = hb.x + hb.width / 2;
  const cy = hb.y + hb.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - hb.width * 3, cy, { steps: 8 });
  await page.mouse.up();

  await expect(radiusSelect(page)).toContainText(/Custom \(\d+ mi\)/);
  const radius = Number(new URL(page.url()).searchParams.get('radiusMi'));
  expect(radius).toBeGreaterThan(0);
  expect(radius).toBeLessThan(250);

  const after = await expectPinsMatchApi(page, request);
  expect(after).toBeLessThanOrEqual(before);
});

test('text, filters and radius combine', async ({ page, request }) => {
  await openApp(page, londonUrl(500));
  await searchBox(page).fill('international');
  await page.getByLabel('Min altitude (ft)').fill('100');
  await page.getByLabel('Has IATA code').check();

  await expect(page).toHaveURL(/q=international/);
  await expect(page).toHaveURL(/minAltitudeFt=100/);
  await expect(page).toHaveURL(/hasIata=true/);
  const matches = await expectPinsMatchApi(page, request);
  expect(matches).toBeGreaterThan(0);

  // Every row honours every filter.
  const altitudes = await rows(page).evaluateAll((els) =>
    els.map((el) => Number(el.querySelectorAll('td')[5]?.textContent?.replace(/,/g, ''))),
  );
  for (const ft of altitudes) expect(ft).toBeGreaterThanOrEqual(100);
  const iatas = await rows(page).evaluateAll((els) =>
    els.map((el) => el.querySelectorAll('td')[1]?.textContent?.trim()),
  );
  for (const iata of iatas) expect(iata).toMatch(/^[A-Z0-9]{3}$/);
});

test('clearing the location drops the circle and distance column', async ({ page }) => {
  await openApp(page, londonUrl(50));
  await expect(page.getByRole('columnheader', { name: /Distance/ })).toBeVisible();

  await page.getByRole('button', { name: 'Clear area' }).click();
  await expect(map(page)).not.toHaveAttribute('data-center', /.*/);
  await expect(page.getByRole('columnheader', { name: /Distance/ })).toHaveCount(0);
  await expect(page.getByTestId('map-prompt')).toBeVisible();
  await expect(total(page)).toHaveAttribute('data-total', '4187');
});
