import { expect, test } from '@playwright/test';
import { expectPinsMatchApi, map, openApp, radiusSelect, rows, searchBox } from './helpers';

test('typo-tolerant text search finds Heathrow and pins every match', async ({ page, request }) => {
  await openApp(page);
  await searchBox(page).fill('heathrw');

  await expect(rows(page).first()).toHaveAttribute('data-icao', 'EGLL');
  await expect(page.getByTestId('map-prompt')).toHaveCount(0);
  await expectPinsMatchApi(page, request);

  await searchBox(page).fill('');
  await expect(page.getByTestId('map-prompt')).toBeVisible();
  await expect(map(page)).toHaveAttribute('data-pin-count', '0');
});

test('an exact IATA code ranks its airport first', async ({ page }) => {
  await openApp(page);
  await searchBox(page).fill('CDG');
  await expect(rows(page).first()).toHaveAttribute('data-icao', 'LFPG');
});

test('reloading restores search, filters and map state from the URL', async ({ page }) => {
  await openApp(page, '?q=london&lat=51.5072&lng=-0.1276&radiusMi=100&hasIata=true');
  const icaos = await rows(page).evaluateAll((els) => els.map((el) => el.dataset.icao));

  await page.reload();
  await expect(searchBox(page)).toHaveValue('london');
  await expect(radiusSelect(page)).toHaveValue('100');
  await expect(page.getByLabel('Has IATA code')).toBeChecked();
  await expect(map(page)).toHaveAttribute('data-center', '51.5072,-0.1276');
  await expect
    .poll(() => rows(page).evaluateAll((els) => els.map((el) => el.dataset.icao)))
    .toEqual(icaos);
});

test('sorting by a column header is server-side and toggles direction', async ({ page }) => {
  await openApp(page);
  const header = page.getByRole('columnheader', { name: /Altitude/ });
  await header.getByRole('button').click();
  await expect(page).toHaveURL(/sort=altitude/);
  await expect(header).toHaveAttribute('aria-sort', 'ascending');
  // Lowest airport in the dataset is below sea level.
  await expect(rows(page).first().locator('td').nth(5)).toContainText('-');

  await header.getByRole('button').click();
  await expect(header).toHaveAttribute('aria-sort', 'descending');
  await expect(page).toHaveURL(/order=desc/);
});
