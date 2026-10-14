import { useCallback, useMemo, useState } from 'react';
import type { SortField } from '@location-search/shared';
import { useAirportPoints, useAirports, useCountries } from './api/hooks';
import { describeError } from './api/errors';
import { AirportMap, type FitTarget } from './components/AirportMap';
import { AirportTable } from './components/AirportTable';
import { Filters } from './components/Filters';
import { MapPrompt } from './components/MapPrompt';
import { Pagination } from './components/Pagination';
import { RadiusControl } from './components/RadiusControl';
import { SearchBar } from './components/SearchBar';
import { circleBounds, pointsBounds, type LatLng } from './lib/geo';
import {
  effectiveOrder,
  effectiveSort,
  isFilterActive,
  toAirportParams,
  toFilterParams,
} from './state/queryState';
import { useQueryState } from './state/useQueryState';

export function App() {
  const { state, update, queryState } = useQueryState();
  const filterActive = isFilterActive(state);
  const queryActive = isFilterActive(queryState);

  const airports = useAirports(toAirportParams(queryState));
  const points = useAirportPoints(toFilterParams(queryState), queryActive);
  const countries = useCountries();

  const pins = useMemo(
    () => (queryActive && points.data ? points.data.data : []),
    [queryActive, points.data],
  );

  // Bumped when the circle should be re-framed without the center changing (preset radius picks).
  const [fitNonce, setFitNonce] = useState(0);
  const center = state.center;
  const fit = useMemo<FitTarget>(() => {
    if (center) {
      return {
        key: `circle:${center.lat},${center.lng}:${fitNonce}`,
        bounds: circleBounds(center, state.radiusMi),
      };
    }
    return { key: `pins:${points.dataUpdatedAt}:${queryActive}`, bounds: pointsBounds(pins) };
    // The circle bounds use the radius at the moment the key changes; radius alone must not refit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, fitNonce, points.dataUpdatedAt, queryActive, pins]);

  const onCenterChange = useCallback(
    (c: LatLng) => {
      update({ center: c });
    },
    [update],
  );
  const onRadiusDrag = useCallback((radiusMi: number) => update({ radiusMi }), [update]);

  const onSort = (field: SortField) => {
    const current = effectiveSort(state);
    if (field === 'relevance') {
      update({ sort: 'relevance', order: undefined });
    } else if (current === field) {
      update({ sort: field, order: effectiveOrder(state) === 'asc' ? 'desc' : 'asc' });
    } else {
      update({ sort: field, order: 'asc' });
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <h1 className="text-xl font-semibold whitespace-nowrap">Airport Search</h1>
            <div className="md:max-w-xl md:flex-1">
              <SearchBar value={state.q} onChange={(q) => update({ q })} />
            </div>
          </div>
          <Filters
            state={state}
            countries={countries.data ?? []}
            countriesLoading={countries.isPending}
            onChange={update}
          />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-screen-2xl flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-2 lg:items-start">
        <section aria-label="Map" className="flex flex-col gap-2 lg:sticky lg:top-4">
          <RadiusControl
            radiusMi={state.radiusMi}
            hasCenter={center !== null}
            onChange={(radiusMi) => {
              update({ radiusMi });
              setFitNonce((n) => n + 1);
            }}
            onClear={() => update({ center: null })}
          />
          <div className="h-[55vh] lg:h-[calc(100vh-13rem)]">
            <AirportMap
              center={center}
              radiusMi={state.radiusMi}
              pins={pins}
              fit={fit}
              onCenterChange={onCenterChange}
              onRadiusDrag={onRadiusDrag}
            >
              {!filterActive && <MapPrompt />}
            </AirportMap>
          </div>
          {points.error != null && (
            <p role="alert" className="text-sm text-red-700">
              Could not load map pins: {describeError(points.error)}
            </p>
          )}
        </section>

        <section aria-label="Results" className="flex min-w-0 flex-col gap-3">
          <AirportTable
            airports={airports.data?.data}
            loading={airports.isPending}
            fetching={airports.isFetching}
            error={airports.error}
            sort={effectiveSort(state)}
            order={effectiveOrder(state)}
            hasQuery={state.q.trim() !== ''}
            showDistance={center !== null}
            onSort={onSort}
          />
          {airports.data && (
            <Pagination meta={airports.data.meta} onPage={(page) => update({ page })} />
          )}
        </section>
      </main>
    </div>
  );
}
