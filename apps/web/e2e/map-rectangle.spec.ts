import { expect, test, type Page } from '@playwright/test';
import { expectPinsMatchApi, map, openApp, rows } from './helpers';

const rectangleMode = (page: Page) => page.getByRole('radio', { name: 'Rectangle' });

/** Clicks the map at fractions of its size (0..1), e.g. 0.4, 0.3 = left of center, upper half. */
async function clickMapAt(page: Page, fx: number, fy: number) {
  const box = (await map(page).boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

test('draws a rectangle with two clicks and pins every match', async ({ page, request }) => {
  await openApp(page);
  await rectangleMode(page).click();
  await expect(rectangleMode(page)).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('map-prompt')).toHaveText(
    'Click two corners on the map or search to start filtering',
  );

  await clickMapAt(page, 0.42, 0.3);
  await expect(page.getByTestId('draw-hint')).toBeVisible();
  await clickMapAt(page, 0.62, 0.55);

  await expect(map(page)).toHaveAttribute('data-bbox', /^-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+$/);
  await expect(page.getByTestId('draw-hint')).toHaveCount(0);
  await expect(page).toHaveURL(/area=rectangle&bbox=/);
  expect(await expectPinsMatchApi(page, request)).toBeGreaterThan(0);

  // Distances are measured from the box center, so the distance column appears, nearest first.
  await expect(page.getByRole('columnheader', { name: /Distance/ })).toBeVisible();
  const distances = await rows(page).evaluateAll((els) =>
    els.map((el) => Number(el.querySelectorAll('td')[6]?.textContent?.replace(/,/g, ''))),
  );
  expect(distances.length).toBeGreaterThan(0);
  expect(distances).toEqual([...distances].sort((a, b) => a - b));
});

test('a reload restores the rectangle and its results', async ({ page, request }) => {
  await openApp(page, '?bbox=-1,51,1,52');
  await expect(rectangleMode(page)).toHaveAttribute('aria-checked', 'true');
  await expect(map(page)).toHaveAttribute('data-bbox', '-1,51,1,52');
  // The 15 airports in this London box, per the seeded data (see the API integration tests).
  expect(await expectPinsMatchApi(page, request)).toBe(15);
  await expect(rows(page).first()).toHaveAttribute('data-icao', 'EGLC');

  await page.reload();
  await expect(map(page)).toHaveAttribute('data-bbox', '-1,51,1,52');
  expect(await expectPinsMatchApi(page, request)).toBe(15);
});

test('Escape cancels a half-drawn rectangle', async ({ page }) => {
  await openApp(page);
  await rectangleMode(page).click();
  await clickMapAt(page, 0.4, 0.4);
  await expect(page.getByTestId('draw-hint')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('draw-hint')).toHaveCount(0);
  await expect(map(page)).not.toHaveAttribute('data-bbox', /.*/);
});

test('switching modes and Clear area remove the rectangle', async ({ page }) => {
  await openApp(page, '?bbox=-1,51,1,52');
  await page.getByRole('button', { name: 'Clear area' }).click();
  await expect(map(page)).not.toHaveAttribute('data-bbox', /.*/);
  await expect(page.getByTestId('map-prompt')).toBeVisible();

  await page.goto('/?bbox=-1,51,1,52');
  await page.getByRole('radio', { name: 'Radius' }).click();
  await expect(map(page)).not.toHaveAttribute('data-bbox', /.*/);
  await expect(page).not.toHaveURL(/bbox=/);
  await expect(page.getByTestId('map-prompt')).toHaveText(
    'Click the map or search to start filtering',
  );
});
