import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  initialState,
  normalizeState,
  parseState,
  serializeState,
  type QueryState,
} from './queryState';
import { useDebouncedValue } from './useDebouncedValue';

export const DEBOUNCE_MS = 250;

export type StatePatch = Partial<QueryState>;

/**
 * Single source of truth for search + filters + map. `state` is immediate (drives inputs and the
 * circle); `queryState` lags q, altitude bounds and radius by DEBOUNCE_MS and drives requests.
 * Mirrored to the URL with replaceState.
 */
export function useQueryState() {
  const [state, setState] = useState<QueryState>(() =>
    typeof window === 'undefined' ? initialState : parseState(window.location.search),
  );

  /** Applies a patch; any change resets to page 1 unless the patch sets `page` itself. */
  const update = useCallback((patch: StatePatch) => {
    setState((prev) =>
      normalizeState({ ...prev, ...patch, page: 'page' in patch ? (patch.page ?? 1) : 1 }),
    );
  }, []);

  useEffect(() => {
    const qs = serializeState(state);
    const url = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', url);
  }, [state]);

  const lagging = useMemo(
    () => ({
      q: state.q,
      radiusMi: state.radiusMi,
      minAltitudeFt: state.minAltitudeFt,
      maxAltitudeFt: state.maxAltitudeFt,
    }),
    [state.q, state.radiusMi, state.minAltitudeFt, state.maxAltitudeFt],
  );
  const debounced = useDebouncedValue(lagging, DEBOUNCE_MS);

  const queryState = useMemo(() => {
    const { minAltitudeFt: _a, maxAltitudeFt: _b, ...rest } = state;
    const next: QueryState = { ...rest, q: debounced.q, radiusMi: debounced.radiusMi };
    if (debounced.minAltitudeFt !== undefined) next.minAltitudeFt = debounced.minAltitudeFt;
    if (debounced.maxAltitudeFt !== undefined) next.maxAltitudeFt = debounced.maxAltitudeFt;
    return normalizeState(next);
  }, [state, debounced]);

  return { state, update, queryState };
}
