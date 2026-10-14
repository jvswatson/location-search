import { expect, test } from '@playwright/test';
import { map, openApp, rows, total } from './helpers';

test('lists every airport, prompts for a filter and shows no pins', async ({ page }) => {
  await openApp(page);

  await expect(page).toHaveTitle('Airport Search');
  await expect(page.getByTestId('map-prompt')).toHaveText(
    'Click the map or search to start filtering',
  );
  await expect(map(page)).toHaveAttribute('data-pin-count', '0');
  await expect(map(page)).not.toHaveAttribute('data-center', /.*/);

  // The whole cleaned dataset, sorted by name, 25 per page.
  await expect(total(page)).toHaveAttribute('data-total', '4187');
  await expect(total(page)).toContainText('Showing 1–25 of 4,187');
  await expect(rows(page)).toHaveCount(25);
  await expect(page.getByRole('columnheader', { name: /Distance/ })).toHaveCount(0);
});

test('pages through results', async ({ page }) => {
  await openApp(page);
  const firstPage = await rows(page).first().getAttribute('data-icao');

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(total(page)).toContainText('Showing 26–50 of 4,187');
  await expect(rows(page).first()).not.toHaveAttribute('data-icao', firstPage!);
});

test('has no horizontal page scroll', async ({ page }) => {
  await openApp(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
