import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { makeAirport, paginated } from '../test/server';
import { AirportTable } from './AirportTable';
import { Pagination } from './Pagination';

const base = {
  airports: [makeAirport(1, { altitudeFt: 12345, distanceMi: 1234.56 }), makeAirport(2)],
  loading: false,
  fetching: false,
  error: null,
  sort: 'name' as const,
  order: 'asc' as const,
  hasQuery: false,
  showDistance: false,
  onSort: vi.fn(),
};

describe('AirportTable', () => {
  it('renders rows with formatted altitude and a dash for missing IATA', () => {
    render(<AirportTable {...base} />);
    const rows = screen.getAllByTestId('airport-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('data-icao', 'K001');
    expect(within(rows[0]!).getByText('12,345')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('—')).toBeInTheDocument();
  });

  it('shows the distance column only with a center, formatted to 0.1 mi', () => {
    const { rerender } = render(<AirportTable {...base} />);
    expect(screen.queryByText('Distance (mi)')).not.toBeInTheDocument();
    rerender(<AirportTable {...base} showDistance sort="distance" />);
    expect(screen.getByRole('columnheader', { name: /Distance/ })).toBeInTheDocument();
    expect(screen.getByText('1,234.6')).toBeInTheDocument();
  });

  it('marks the active sort column with aria-sort and reports clicks', async () => {
    const onSort = vi.fn();
    render(<AirportTable {...base} sort="altitude" order="desc" onSort={onSort} />);
    expect(screen.getByRole('columnheader', { name: /Altitude/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'none');
    expect(screen.getByRole('columnheader', { name: 'City' })).not.toHaveAttribute('aria-sort');
    await userEvent.click(screen.getByRole('button', { name: /ICAO/ }));
    expect(onSort).toHaveBeenCalledWith('icao');
  });

  it('offers Relevance only when there is a query', async () => {
    const onSort = vi.fn();
    const { rerender } = render(<AirportTable {...base} />);
    expect(screen.queryByRole('button', { name: 'Relevance' })).not.toBeInTheDocument();
    rerender(<AirportTable {...base} hasQuery sort="relevance" onSort={onSort} />);
    const btn = screen.getByRole('button', { name: 'Relevance' });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(btn);
    expect(onSort).toHaveBeenCalledWith('relevance');
  });

  it('renders loading, empty and error states', () => {
    const { rerender } = render(<AirportTable {...base} airports={undefined} loading />);
    expect(screen.getByText('Loading airports…')).toBeInTheDocument();
    rerender(<AirportTable {...base} airports={[]} />);
    expect(screen.getByText('No airports match your filters.')).toBeInTheDocument();
    rerender(<AirportTable {...base} airports={undefined} error={new ApiError(500, 'Boom')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Boom');
    rerender(<AirportTable {...base} airports={undefined} error={new ApiError(429, 'x')} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/too many requests/i);
  });
});

describe('Pagination', () => {
  it('summarizes the visible range and total', () => {
    render(<Pagination meta={paginated([], 4187, 1).meta} onPage={vi.fn()} />);
    expect(screen.getByTestId('result-total')).toHaveTextContent('Showing 1–25 of 4,187');
    expect(screen.getByText('Page 1 of 168')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });

  it('shows a partial last page and navigates', async () => {
    const onPage = vi.fn();
    render(<Pagination meta={paginated([], 4187, 168).meta} onPage={onPage} />);
    expect(screen.getByTestId('result-total')).toHaveTextContent('Showing 4,176–4,187 of 4,187');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPage).toHaveBeenCalledWith(167);
  });

  it('handles zero results', () => {
    render(<Pagination meta={paginated([], 0).meta} onPage={vi.fn()} />);
    expect(screen.getByTestId('result-total')).toHaveTextContent('No results');
  });
});
