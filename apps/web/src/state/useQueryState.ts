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

  // The whole state settles together: while a debounced field (q, radius, altitude) is changing,
  // requests keep using the previous settled state. Debouncing those fields alone would let the
  // immediate page reset escape early, sending a request with the old q at page 1.
  const settled = useDebouncedValue(state, DEBOUNCE_MS, laggingUnchanged);
  const queryState = useMemo(() => normalizeState(settled), [settled]);

  return { state, update, queryState };
}

/** Fields whose edits arrive keystroke-by-keystroke or drag-by-drag. */
const laggingKey = (s: QueryState): string =>
  JSON.stringify([s.q, s.radiusMi, s.minAltitudeFt ?? null, s.maxAltitudeFt ?? null]);

/** Changes that leave every lagging field alone (country, page, sort, center) apply at once. */
const laggingUnchanged = (prev: QueryState, next: QueryState): boolean =>
  laggingKey(prev) === laggingKey(next);
