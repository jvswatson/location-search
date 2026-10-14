import type { AirportDto, SortField, SortOrder } from '@location-search/shared';
import { describeError } from '../api/errors';
import { formatInt, formatMiles } from '../lib/format';

interface Props {
  airports: AirportDto[] | undefined;
  loading: boolean;
  fetching: boolean;
  error: unknown;
  sort: SortField;
  order: SortOrder;
  hasQuery: boolean;
  showDistance: boolean;
  onSort: (field: SortField) => void;
}

const sortable: Partial<Record<string, SortField>> = {
  ICAO: 'icao',
  Name: 'name',
  'Altitude (ft)': 'altitude',
  'Distance (mi)': 'distance',
};

const numeric = new Set(['Altitude (ft)', 'Distance (mi)']);

export function AirportTable({
  airports,
  loading,
  fetching,
  error,
  sort,
  order,
  hasQuery,
  showDistance,
  onSort,
}: Props) {
  const columns = ['ICAO', 'IATA', 'Name', 'City', 'Country', 'Altitude (ft)'];
  if (showDistance) columns.push('Distance (mi)');

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex min-h-8 items-center justify-between gap-2">
        {hasQuery ? (
          <button
            type="button"
            aria-pressed={sort === 'relevance'}
            onClick={() => onSort('relevance')}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm hover:bg-slate-50 aria-pressed:border-sky-600 aria-pressed:bg-sky-50"
          >
            Relevance
          </button>
        ) : (
          <span />
        )}
        {fetching && !loading && (
          <span role="status" className="text-xs text-slate-500">
            Updating…
          </span>
        )}
      </div>
      {error != null && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {describeError(error)}
        </div>
      )}
      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs tracking-wide text-slate-600 uppercase">
            <tr>
              {columns.map((label) => {
                const field = sortable[label];
                const active = field !== undefined && field === sort;
                const ariaSort = active
                  ? order === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : field
                    ? 'none'
                    : undefined;
                return (
                  <th
                    key={label}
                    scope="col"
                    aria-sort={ariaSort}
                    className={`px-3 py-2 font-semibold whitespace-nowrap ${numeric.has(label) ? 'text-right' : ''}`}
                  >
                    {field ? (
                      <button type="button" onClick={() => onSort(field)} className="uppercase">
                        {label}
                        <span aria-hidden="true">
                          {active ? (order === 'asc' ? ' ▲' : ' ▼') : ''}
                        </span>
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className={fetching ? 'opacity-60' : ''}>
            {airports?.map((a) => (
              <tr
                key={a.icaoCode}
                data-testid="airport-row"
                data-icao={a.icaoCode}
                className="border-t border-slate-100 hover:bg-slate-50"
              >
                <td className="px-3 py-1.5 font-mono">{a.icaoCode}</td>
                <td className="px-3 py-1.5 font-mono">{a.iataCode ?? '—'}</td>
                <td className="px-3 py-1.5">{a.name}</td>
                <td className="px-3 py-1.5">{a.city}</td>
                <td className="px-3 py-1.5">{a.country}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatInt(a.altitudeFt)}</td>
                {showDistance && (
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {a.distanceMi === undefined ? '—' : formatMiles(a.distanceMi)}
                  </td>
                )}
              </tr>
            ))}
            {loading && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-slate-500">
                  Loading airports…
                </td>
              </tr>
            )}
            {!loading && airports?.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-slate-500">
                  No airports match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
