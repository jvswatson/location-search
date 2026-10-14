import type { CountryCount } from '@location-search/shared';
import type { QueryState } from '../state/queryState';
import type { StatePatch } from '../state/useQueryState';
import { CountryMultiSelect } from './CountryMultiSelect';

interface Props {
  state: QueryState;
  countries: CountryCount[];
  countriesLoading?: boolean;
  onChange: (patch: StatePatch) => void;
}

const parseAltitude = (raw: string): number | undefined => {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

const inputClass =
  'w-24 rounded-md border border-slate-300 bg-white px-2 py-2 text-sm shadow-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-200 focus:outline-none';

export function Filters({ state, countries, countriesLoading, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <CountryMultiSelect
        countries={countries}
        loading={countriesLoading}
        selected={state.countries}
        onChange={(selected) => onChange({ countries: selected })}
      />
      <label className="flex items-center gap-2 text-sm">
        Min altitude (ft)
        <input
          type="number"
          inputMode="numeric"
          className={inputClass}
          value={state.minAltitudeFt ?? ''}
          onChange={(e) => onChange({ minAltitudeFt: parseAltitude(e.target.value) })}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        Max altitude (ft)
        <input
          type="number"
          inputMode="numeric"
          className={inputClass}
          value={state.maxAltitudeFt ?? ''}
          onChange={(e) => onChange({ maxAltitudeFt: parseAltitude(e.target.value) })}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={state.hasIata}
          onChange={(e) => onChange({ hasIata: e.target.checked })}
        />
        Has IATA code
      </label>
    </div>
  );
}
