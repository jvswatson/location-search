import { RADIUS_PRESETS_MI } from '@location-search/shared';
import { formatInt } from '../lib/format';
import { clampRadius } from '../lib/geo';
import { AREA_MODES, type AreaMode } from '../state/queryState';

interface Props {
  mode: AreaMode;
  onModeChange: (mode: AreaMode) => void;
  radiusMi: number;
  onRadiusChange: (radiusMi: number) => void;
  /** Whether a center or rectangle is set (enables Clear area). */
  hasArea: boolean;
  onClear: () => void;
}

const MODE_LABELS: Record<AreaMode, string> = { radius: 'Radius', rectangle: 'Rectangle' };

const isPreset = (mi: number) => (RADIUS_PRESETS_MI as readonly number[]).includes(mi);

/** Map toolbar: how clicks define the search area, its size, and clearing it. */
export function AreaControls({
  mode,
  onModeChange,
  radiusMi,
  onRadiusChange,
  hasArea,
  onClear,
}: Props) {
  const value = clampRadius(radiusMi);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div
        role="radiogroup"
        aria-label="Search area"
        className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 shadow-sm"
      >
        {AREA_MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => mode !== m && onModeChange(m)}
            className={`rounded px-3 py-1 text-sm ${
              mode === m ? 'bg-sky-600 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {mode === 'radius' ? (
        <label className="flex items-center gap-2 text-sm">
          Radius
          <select
            value={value}
            onChange={(e) => onRadiusChange(clampRadius(Number(e.target.value)))}
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
      ) : (
        <p className="text-sm text-slate-600">Click one corner, then the opposite corner.</p>
      )}

      <button
        type="button"
        disabled={!hasArea}
        onClick={onClear}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
      >
        Clear area
      </button>
    </div>
  );
}
