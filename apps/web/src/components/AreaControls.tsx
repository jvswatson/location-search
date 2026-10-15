import { MIN_POLYGON_POINTS, RADIUS_PRESETS_MI } from '@location-search/shared';
import { formatInt } from '../lib/format';
import { clampRadius } from '../lib/geo';
import { AREA_MODES, type AreaMode } from '../state/queryState';

interface Props {
  mode: AreaMode;
  onModeChange: (mode: AreaMode) => void;
  radiusMi: number;
  onRadiusChange: (radiusMi: number) => void;
  /** Whether a center, rectangle or polygon is set (enables Clear area). */
  hasArea: boolean;
  onClear: () => void;
  /** Polygon mode: points placed so far in the outline being drawn. */
  draftPoints?: number;
  onFinishPolygon?: () => void;
  onUndoPoint?: () => void;
  onCancelPolygon?: () => void;
}

const MODE_LABELS: Record<AreaMode, string> = {
  radius: 'Radius',
  rectangle: 'Rectangle',
  polygon: 'Polygon',
};

const BUTTON =
  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400';

const isPreset = (mi: number) => (RADIUS_PRESETS_MI as readonly number[]).includes(mi);

/** Map toolbar: how clicks define the search area, its size, and clearing it. */
export function AreaControls({
  mode,
  onModeChange,
  radiusMi,
  onRadiusChange,
  hasArea,
  onClear,
  draftPoints = 0,
  onFinishPolygon,
  onUndoPoint,
  onCancelPolygon,
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
      ) : mode === 'rectangle' ? (
        <p className="text-sm text-slate-600">Click one corner, then the opposite corner.</p>
      ) : (
        // Always the same controls (disabled until they apply), so the toolbar's height — and the
        // map below it — never moves while an outline is drawn. Instructions live on the map.
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Outline">
          <span className="text-sm text-slate-600" data-testid="draft-points">
            {draftPoints} {draftPoints === 1 ? 'point' : 'points'}
          </span>
          <button
            type="button"
            disabled={draftPoints < MIN_POLYGON_POINTS}
            onClick={onFinishPolygon}
            className={BUTTON}
          >
            Finish
          </button>
          <button
            type="button"
            disabled={draftPoints === 0}
            onClick={onUndoPoint}
            className={BUTTON}
          >
            Undo last point
          </button>
          <button
            type="button"
            disabled={draftPoints === 0}
            onClick={onCancelPolygon}
            className={BUTTON}
          >
            Cancel
          </button>
        </div>
      )}

      <button type="button" disabled={!hasArea} onClick={onClear} className={BUTTON}>
        Clear area
      </button>
    </div>
  );
}
