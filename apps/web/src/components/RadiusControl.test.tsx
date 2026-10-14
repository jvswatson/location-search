import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MAX_RADIUS_MI, RADIUS_PRESETS_MI } from '@location-search/shared';
import { RadiusControl } from './RadiusControl';

const setup = (radiusMi: number, hasCenter = true) => {
  const onChange = vi.fn();
  const onClear = vi.fn();
  render(
    <RadiusControl
      radiusMi={radiusMi}
      hasCenter={hasCenter}
      onChange={onChange}
      onClear={onClear}
    />,
  );
  return { onChange, onClear };
};

describe('RadiusControl', () => {
  it('offers every preset and selects the current one', () => {
    setup(100);
    const select = screen.getByLabelText('Radius');
    expect(select).toHaveValue('100');
    expect(screen.getAllByRole('option')).toHaveLength(RADIUS_PRESETS_MI.length);
  });

  it('shows a non-preset radius as a selected Custom option', () => {
    setup(137);
    expect(screen.getByLabelText('Radius')).toHaveValue('137');
    expect(screen.getByRole('option', { name: 'Custom (137 mi)' })).toBeInTheDocument();
  });

  it('clamps an out-of-range radius for display', () => {
    setup(99999);
    expect(screen.getByRole('option', { name: `Custom (${MAX_RADIUS_MI.toLocaleString()} mi)` }));
  });

  it('reports the chosen preset', async () => {
    const { onChange } = setup(50);
    await userEvent.selectOptions(screen.getByLabelText('Radius'), '250');
    expect(onChange).toHaveBeenCalledWith(250);
  });

  it('disables Clear location without a center and calls onClear otherwise', async () => {
    const { onClear } = setup(50, true);
    await userEvent.click(screen.getByRole('button', { name: 'Clear location' }));
    expect(onClear).toHaveBeenCalled();
  });

  it('keeps Clear location disabled with no center', () => {
    setup(50, false);
    expect(screen.getByRole('button', { name: 'Clear location' })).toBeDisabled();
  });
});
