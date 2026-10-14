import { RADIUS_PRESETS_MI } from '@location-search/shared';
import { formatInt } from '../lib/format';
import { clampRadius } from '../lib/geo';

interface Props {
  radiusMi: number;
  hasCenter: boolean;
  onChange: (radiusMi: number) => void;
  onClear: () => void;
}

const isPreset = (mi: number) => (RADIUS_PRESETS_MI as readonly number[]).includes(mi);

export function RadiusControl({ radiusMi, hasCenter, onChange, onClear }: Props) {
  const value = clampRadius(radiusMi);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm">
        Radius
        <select
          value={value}
          onChange={(e) => onChange(clampRadius(Number(e.target.value)))}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm shadow-sm"
        >
          {RADIUS_PRESETS_MI.map((mi) => (
            <option key={mi} value={mi}>
              {formatInt(mi)} mi
            </option>
          ))}
          {!isPreset(value) && <option value={value}>Custom ({formatInt(value)} mi)</option>}
        </select>
      </label>
      <button
        type="button"
        disabled={!hasCenter}
        onClick={onClear}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
      >
        Clear location
      </button>
    </div>
  );
}
