import { useEffect, useId, useRef, useState } from 'react';
import { type CountryCount, MAX_COUNTRIES } from '@location-search/shared';
import { formatInt } from '../lib/format';

interface Props {
  countries: CountryCount[];
  selected: string[];
  onChange: (selected: string[]) => void;
  loading?: boolean;
}

export function CountryMultiSelect({ countries, selected, onChange, loading }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (country: string) =>
    onChange(
      selected.includes(country) ? selected.filter((c) => c !== country) : [...selected, country],
    );

  // The API accepts at most MAX_COUNTRIES; past that, only unchecking is possible.
  const atLimit = selected.length >= MAX_COUNTRIES;
  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? countries.filter((c) => c.country.toLowerCase().includes(needle))
    : countries;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm shadow-sm hover:bg-slate-50 sm:w-auto"
      >
        Countries{selected.length > 0 ? ` (${selected.length})` : ''}
        <span aria-hidden="true"> ▾</span>
      </button>
      {open && (
        <div
          id={panelId}
          role="group"
          aria-label="Countries"
          className="absolute left-0 z-[1000] mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-slate-200 bg-white p-2 shadow-lg"
        >
          <div className="mb-2 flex items-center gap-2">
            <input
              type="search"
              aria-label="Filter countries"
              placeholder="Filter countries"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
            />
            <button
              type="button"
              disabled={selected.length === 0}
              onClick={() => onChange([])}
              className="rounded px-2 py-1 text-sm text-sky-700 hover:bg-sky-50 disabled:text-slate-400 disabled:hover:bg-transparent"
            >
              Clear
            </button>
          </div>
          {atLimit && (
            <p role="status" className="px-1 pb-2 text-xs text-amber-700">
              Up to {MAX_COUNTRIES} countries can be selected. Clear some to choose others.
            </p>
          )}
          {loading && <p className="px-1 py-2 text-sm text-slate-500">Loading countries…</p>}
          {!loading && visible.length === 0 && (
            <p className="px-1 py-2 text-sm text-slate-500">No countries found.</p>
          )}
          <ul className="max-h-64 overflow-y-auto">
            {visible.map((c) => (
              <li key={c.country}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selected.includes(c.country)}
                    disabled={atLimit && !selected.includes(c.country)}
                    onChange={() => toggle(c.country)}
                  />
                  <span className="flex-1">{c.country}</span>
                  <span className="text-xs text-slate-500">{formatInt(c.count)}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
