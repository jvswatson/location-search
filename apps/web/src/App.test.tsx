import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { milesToMeters } from '@location-search/shared';
import { App } from './App';
import { destinationPoint } from './lib/geo';
import { dragTarget, mapHandlers } from './test/leafletMock';
import { errorResponse, makeAirport, mockApi, paginated } from './test/server';

vi.mock('react-leaflet', async () => (await import('./test/leafletMock')).createReactLeafletMock());

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

const last = <T,>(xs: T[]): T => xs[xs.length - 1]!;
const params = (url: URL) => Object.fromEntries(url.searchParams);

const clickMap = (lat: number, lng: number) =>
  act(() => mapHandlers.click?.({ latlng: { lat, lng } }));

afterEach(() => {
  vi.useRealTimers();
});

describe('initial state', () => {
  it('lists all airports, shows the prompt and requests no pins', async () => {
    const rec = mockApi({ airports: () => paginated([makeAirport(1), makeAirport(2)], 4187) });
    renderApp();
    expect(await screen.findAllByTestId('airport-row')).toHaveLength(2);
    expect(screen.getByTestId('result-total')).toHaveTextContent('Showing 1–25 of 4,187');
    expect(screen.getByTestId('map-prompt')).toHaveTextContent(
      'Click the map or search to start filtering',
    );
    expect(screen.getByTestId('airport-map')).toHaveAttribute('data-pin-count', '0');
    expect(params(rec.airports[0]!)).toEqual({ page: '1', limit: '25' });
    expect(rec.points).toHaveLength(0);
  });
});

describe('search and filters', () => {
  it('hides the prompt and fetches pins once a filter is active; pins equal points total', async () => {
    const points = [1, 2, 3].map((i) => ({ icaoCode: `P${i}`, lat: i, lng: i }));
    const rec = mockApi({ points: () => ({ data: points, total: 3 }) });
    renderApp();
    await screen.findAllByTestId('airport-row');
    await userEvent.type(screen.getByLabelText('Search airports'), 'jfk');
    await waitFor(() =>
      expect(screen.getByTestId('airport-map')).toHaveAttribute('data-pin-count', '3'),
    );
    expect(screen.queryByTestId('map-prompt')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('pin')).toHaveLength(3);
    expect(params(last(rec.points))).toEqual({ q: 'jfk' });
    expect(params(last(rec.airports))).toMatchObject({ q: 'jfk', page: '1' });
  });

  it('debounces typing into a single request', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const rec = mockApi();
    renderApp();
    await screen.findAllByTestId('airport-row');
    await user.type(screen.getByLabelText('Search airports'), 'abc');
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(rec.airports.filter((u) => u.searchParams.has('q'))).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    await waitFor(() =>
      expect(rec.airports.filter((u) => u.searchParams.get('q') === 'abc')).toHaveLength(1),
    );
    expect(rec.airports.filter((u) => u.searchParams.has('q'))).toHaveLength(1);
  });

  it('holds the page reset back with the debounced query (no stale-q request)', async () => {
    const rec = mockApi({
      airports: (url) =>
        paginated([makeAirport(1)], 100, Number(url.searchParams.get('page') ?? 1)),
    });
    renderApp();
    await screen.findAllByTestId('airport-row');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(params(last(rec.airports)).page).toBe('2'));
    const before = rec.airports.length;

    await userEvent.type(screen.getByLabelText('Search airports'), 'abc');
    await waitFor(() => expect(params(last(rec.airports))).toMatchObject({ q: 'abc', page: '1' }));

    // Exactly one request after typing: the new q together with the page reset.
    expect(rec.airports.slice(before).map(params)).toEqual([{ q: 'abc', page: '1', limit: '25' }]);
  });

  it('composes countries, altitude and hasIata and resets to page 1', async () => {
    const rec = mockApi({
      airports: (url) =>
        paginated([makeAirport(1)], 100, Number(url.searchParams.get('page') ?? 1)),
    });
    renderApp();
    await screen.findAllByTestId('airport-row');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(params(last(rec.airports)).page).toBe('2'));

    await userEvent.click(screen.getByRole('button', { name: /Countries/ }));
    const group = screen.getByRole('group', { name: 'Countries' });
    await userEvent.click(within(group).getByRole('checkbox', { name: /France/ }));
    await userEvent.click(within(group).getByRole('checkbox', { name: /Spain/ }));
    await userEvent.type(screen.getByLabelText('Min altitude (ft)'), '500');
    await userEvent.type(screen.getByLabelText('Max altitude (ft)'), '9000');
    await userEvent.click(screen.getByLabelText('Has IATA code'));

    await waitFor(() => {
      const url = last(rec.airports);
      expect(url.searchParams.getAll('country')).toEqual(['France', 'Spain']);
      expect(params(url)).toMatchObject({
        minAltitudeFt: '500',
        maxAltitudeFt: '9000',
        hasIata: 'true',
        page: '1',
      });
    });
    expect(last(rec.points).searchParams.getAll('country')).toEqual(['France', 'Spain']);
    expect(last(rec.points).searchParams.has('page')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: /Countries/ }));
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Countries' })).getByRole('button', {
        name: 'Clear',
      }),
    );
    await waitFor(() => expect(last(rec.airports).searchParams.has('country')).toBe(false));
  });
});

describe('table', () => {
  it('toggles server-side sorting and aria-sort', async () => {
    const rec = mockApi();
    renderApp();
    await screen.findAllByTestId('airport-row');
    const nameHeader = screen.getByRole('columnheader', { name: /Name/ });
    expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');

    await userEvent.click(within(nameHeader).getByRole('button'));
    await waitFor(() =>
      expect(params(last(rec.airports))).toMatchObject({ sort: 'name', order: 'desc' }),
    );
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );

    await userEvent.click(screen.getByRole('button', { name: /ICAO/ }));
    await waitFor(() =>
      expect(params(last(rec.airports))).toMatchObject({ sort: 'icao', order: 'asc' }),
    );
    expect(screen.getByRole('columnheader', { name: /ICAO/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('offers Relevance only with a query', async () => {
    const rec = mockApi();
    renderApp();
    await screen.findAllByTestId('airport-row');
    expect(screen.queryByRole('button', { name: 'Relevance' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search airports'), 'x');
    await userEvent.click(screen.getByRole('button', { name: /ICAO/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Relevance' }));
    await waitFor(() =>
      expect(params(last(rec.airports))).toMatchObject({ sort: 'relevance', q: 'x' }),
    );
    await userEvent.clear(screen.getByLabelText('Search airports'));
    await waitFor(() => expect(last(rec.airports).searchParams.has('sort')).toBe(false));
  });

  it('pages through results', async () => {
    const rec = mockApi({
      airports: (url) => paginated([makeAirport(1)], 60, Number(url.searchParams.get('page') ?? 1)),
    });
    renderApp();
    await screen.findAllByTestId('airport-row');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(screen.getByTestId('result-total')).toHaveTextContent('Showing 26–50 of 60'),
    );
    expect(params(last(rec.airports)).page).toBe('2');
  });

  it('shows the empty state', async () => {
    mockApi({ airports: () => paginated([], 0) });
    renderApp();
    expect(await screen.findByText('No airports match your filters.')).toBeInTheDocument();
  });

  it('shows the API error message', async () => {
    mockApi({ airports: () => errorResponse(500, 'Database exploded', 'Internal Server Error') });
    renderApp();
    expect(await screen.findByRole('alert')).toHaveTextContent('Database exploded');
  });

  it('shows friendly text for 429', async () => {
    mockApi({ airports: () => errorResponse(429, 'ThrottlerException: Too Many Requests') });
    renderApp();
    expect(await screen.findByRole('alert')).toHaveTextContent(/too many requests.*try again/i);
  });
});

describe('map interaction', () => {
  it('sets, resizes and clears the center, composing with the table', async () => {
    const rec = mockApi({
      airports: () => paginated([makeAirport(1, { distanceMi: 12.34 })]),
      points: () => ({ data: [{ icaoCode: 'P1', lat: 1, lng: 1 }], total: 1 }),
    });
    renderApp();
    await screen.findAllByTestId('airport-row');
    expect(screen.queryByText('Distance (mi)')).not.toBeInTheDocument();

    await clickMap(40, -100);
    const map = screen.getByTestId('airport-map');
    expect(map).toHaveAttribute('data-center', '40,-100');
    expect(screen.queryByTestId('map-prompt')).not.toBeInTheDocument();
    expect(screen.getByTestId('circle')).toHaveAttribute(
      'data-radius-m',
      String(milesToMeters(50)),
    );
    await waitFor(() =>
      expect(params(last(rec.airports))).toMatchObject({ lat: '40', lng: '-100', radiusMi: '50' }),
    );
    expect(await screen.findByText('12.3')).toBeInTheDocument();
    await waitFor(() => expect(map).toHaveAttribute('data-pin-count', '1'));
    expect(params(last(rec.points))).toEqual({ lat: '40', lng: '-100', radiusMi: '50' });

    await userEvent.selectOptions(screen.getByLabelText('Radius'), '250');
    await waitFor(() => expect(params(last(rec.airports)).radiusMi).toBe('250'));

    await userEvent.click(screen.getByRole('button', { name: 'Clear location' }));
    expect(map).not.toHaveAttribute('data-center');
    expect(screen.getByTestId('map-prompt')).toBeInTheDocument();
    await waitFor(() => expect(map).toHaveAttribute('data-pin-count', '0'));
    expect(last(rec.airports).searchParams.has('lat')).toBe(false);
  });

  it('syncs the radius dropdown with the dragged handle, rounding and clamping', async () => {
    const rec = mockApi();
    renderApp();
    await screen.findAllByTestId('airport-row');
    await clickMap(40, -100);

    dragTarget.lat = destinationPoint({ lat: 40, lng: -100 }, 90, 137.4).lat;
    dragTarget.lng = destinationPoint({ lat: 40, lng: -100 }, 90, 137.4).lng;
    await userEvent.click(screen.getByTestId('handle'));
    expect(screen.getByLabelText('Radius')).toHaveValue('137');
    expect(screen.getByRole('option', { name: 'Custom (137 mi)' })).toBeInTheDocument();
    await waitFor(() => expect(params(last(rec.airports)).radiusMi).toBe('137'));

    const far = destinationPoint({ lat: 40, lng: -100 }, 90, 9000);
    dragTarget.lat = far.lat;
    dragTarget.lng = far.lng;
    await userEvent.click(screen.getByTestId('handle'));
    expect(screen.getByLabelText('Radius')).toHaveValue('3000');
  });
});

describe('URL state', () => {
  it('restores the view from search params and mirrors changes back', async () => {
    window.history.replaceState(
      null,
      '',
      '/?q=heath&country=France&lat=10&lng=20&radiusMi=75&page=2',
    );
    const rec = mockApi();
    renderApp();
    await screen.findAllByTestId('airport-row');
    expect(screen.getByLabelText('Search airports')).toHaveValue('heath');
    expect(screen.getByTestId('airport-map')).toHaveAttribute('data-center', '10,20');
    expect(params(rec.airports[0]!)).toMatchObject({
      q: 'heath',
      lat: '10',
      lng: '20',
      radiusMi: '75',
      page: '2',
    });
    await userEvent.click(screen.getByLabelText('Has IATA code'));
    await waitFor(() => expect(window.location.search).toContain('hasIata=true'));
    expect(window.location.search).not.toContain('page=');
  });
});
