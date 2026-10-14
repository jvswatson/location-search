import type { PageMeta } from '@location-search/shared';
import { formatInt } from '../lib/format';

interface Props {
  meta: PageMeta;
  onPage: (page: number) => void;
}

const btn =
  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-white';

export function Pagination({ meta, onPage }: Props) {
  const { total, page, limit, pageCount } = meta;
  const first = total === 0 ? 0 : (page - 1) * limit + 1;
  const last = Math.min(total, page * limit);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <p data-testid="result-total" data-total={total} aria-live="polite">
        {total === 0
          ? 'No results'
          : `Showing ${formatInt(first)}–${formatInt(last)} of ${formatInt(total)}`}
      </p>
      <nav aria-label="Pagination" className="flex items-center gap-2">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(1)}>
          First
        </button>
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <span>
          Page {formatInt(page)} of {formatInt(Math.max(1, pageCount))}
        </span>
        <button
          type="button"
          className={btn}
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </nav>
    </div>
  );
}
