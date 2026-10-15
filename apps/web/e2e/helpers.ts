import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import type { PointsResponse } from '@location-search/shared';

export const LONDON = { lat: 51.5072, lng: -0.1276 };

export const map = (page: Page) => page.getByTestId('airport-map');
export const rows = (page: Page) => page.getByTestId('airport-row');
export const total = (page: Page) => page.getByTestId('result-total');
export const radiusSelect = (page: Page) => page.getByLabel('Radius');
export const searchBox = (page: Page) => page.getByLabel('Search airports');

/** Opens the app and waits for the first page of results. */
export async function openApp(page: Page, search = ''): Promise<void> {
  await page.goto(`/${search}`);
  await expect(rows(page).first()).toBeVisible();
}

/**
 * The filters currently in the page URL, as /airports/points accepts them: no sort or paging, and
 * no `area` (the UI's drawing mode, not an API filter).
 */
export function filtersFromUrl(page: Page): string {
  const params = new URL(page.url()).searchParams;
  for (const key of ['sort', 'order', 'page', 'limit', 'area']) params.delete(key);
  return params.toString();
}

/** Asks the API directly how many airports match the page's current filters. */
export async function apiPointsTotal(page: Page, request: APIRequestContext): Promise<number> {
  const res = await request.get(`/api/v1/airports/points?${filtersFromUrl(page)}`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as PointsResponse).total;
}

/**
 * Waits until the UI has settled on the current URL's filters, then checks that the map shows one
 * pin per match and the table total agrees with the API.
 */
export async function expectPinsMatchApi(page: Page, request: APIRequestContext): Promise<number> {
  await expect(async () => {
    const expected = await apiPointsTotal(page, request);
    await expect(map(page)).toHaveAttribute('data-pin-count', String(expected), { timeout: 1000 });
    await expect(total(page)).toHaveAttribute('data-total', String(expected), { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  return Number(await total(page).getAttribute('data-total'));
}

/**
 * The element's box once it has stopped moving. Leaflet animates zoom/fit after a center is set,
 * so grabbing the radius handle mid-animation would press on the map (a pan) instead.
 */
export async function settledBox(locator: Locator) {
  let previous = await locator.boundingBox();
  await expect(async () => {
    await new Promise((r) => setTimeout(r, 150));
    const current = await locator.boundingBox();
    const same = JSON.stringify(current) === JSON.stringify(previous);
    previous = current;
    expect(same && current !== null).toBe(true);
  }).toPass({ timeout: 5000 });
  return previous!;
}

export async function visibleIcaos(page: Page): Promise<string[]> {
  return rows(page).evaluateAll((els) => els.map((el) => el.getAttribute('data-icao') ?? ''));
}
