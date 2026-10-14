import { useEffect, useRef, useState } from 'react';

const never = () => false;

/**
 * Returns `value` after it has stopped changing for `delayMs`. When `isImmediate(prev, next)`
 * says a change doesn't need debouncing, it is applied on the next tick instead of waiting
 * (and supersedes any pending update, since `next` is the latest value). Pass a stable
 * (module-level) `isImmediate`.
 */
export function useDebouncedValue<T>(
  value: T,
  delayMs: number,
  isImmediate: (prev: T, next: T) => boolean = never,
): T {
  const [debounced, setDebounced] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const prev = previous.current;
    previous.current = value;
    const delay = prev !== value && isImmediate(prev, value) ? 0 : delayMs;
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delayMs, isImmediate]);

  return debounced;
}
