import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MAX_RADIUS_MI, RADIUS_PRESETS_MI } from '@location-search/shared';
import type { AreaMode } from '../state/queryState';
import { AreaControls } from './AreaControls';

const setup = ({
  mode = 'radius' as AreaMode,
  radiusMi = 50,
  hasArea = true,
}: { mode?: AreaMode; radiusMi?: number; hasArea?: boolean } = {}) => {
  const onModeChange = vi.fn();
  const onRadiusChange = vi.fn();
  const onClear = vi.fn();
  render(
    <AreaControls
      mode={mode}
      onModeChange={onModeChange}
      radiusMi={radiusMi}
      onRadiusChange={onRadiusChange}
      hasArea={hasArea}
      onClear={onClear}
    />,
  );
  return { onModeChange, onRadiusChange, onClear };
};

describe('AreaControls (polygon mode)', () => {
  const draw = (draftPoints: number) => {
    const handlers = { onFinishPolygon: vi.fn(), onUndoPoint: vi.fn(), onCancelPolygon: vi.fn() };
    render(
      <AreaControls
        mode="polygon"
        onModeChange={vi.fn()}
        radiusMi={50}
        onRadiusChange={vi.fn()}
        hasArea={false}
        onClear={vi.fn()}
        draftPoints={draftPoints}
        {...handlers}
      />,
    );
    return handlers;
  };

  it('shows the same controls before the first point, all disabled', () => {
    // Constant layout: the toolbar must not change height when drawing starts (the map would move).
    draw(0);
    expect(screen.getByTestId('draft-points')).toHaveTextContent('0 points');
    for (const name of ['Finish', 'Undo last point', 'Cancel']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });

  it('offers Finish only from 3 points, plus Undo and Cancel', async () => {
    draw(2);
    expect(screen.getByTestId('draft-points')).toHaveTextContent('2 points');
    expect(screen.getByRole('button', { name: 'Finish' })).toBeDisabled();
  });

  it('reports Finish, Undo last point and Cancel', async () => {
    const h = draw(3);
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }));
    await userEvent.click(screen.getByRole('button', { name: 'Undo last point' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.onFinishPolygon).toHaveBeenCalledOnce();
    expect(h.onUndoPoint).toHaveBeenCalledOnce();
    expect(h.onCancelPolygon).toHaveBeenCalledOnce();
  });
});

describe('AreaControls', () => {
  describe('mode switch', () => {
    it('shows the current mode as the checked radio', () => {
      setup({ mode: 'rectangle' });
      const group = screen.getByRole('radiogroup', { name: 'Search area' });
      expect(group).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Rectangle' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
      expect(screen.getByRole('radio', { name: 'Radius' })).toHaveAttribute(
        'aria-checked',
        'false',
      );
    });

    it('reports a new mode but ignores clicking the current one', async () => {
      const { onModeChange } = setup({ mode: 'radius' });
      await userEvent.click(screen.getByRole('radio', { name: 'Radius' }));
      expect(onModeChange).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole('radio', { name: 'Rectangle' }));
      expect(onModeChange).toHaveBeenCalledWith('rectangle');
    });

    it('swaps the radius select for drawing instructions in rectangle mode', () => {
      setup({ mode: 'rectangle' });
      expect(screen.queryByLabelText('Radius')).not.toBeInTheDocument();
      expect(screen.getByText('Click one corner, then the opposite corner.')).toBeInTheDocument();
    });
  });

  describe('radius select', () => {
    it('offers every preset and selects the current one', () => {
      setup({ radiusMi: 100 });
      expect(screen.getByLabelText('Radius')).toHaveValue('100');
      expect(screen.getAllByRole('option')).toHaveLength(RADIUS_PRESETS_MI.length);
    });

    it('shows a non-preset radius as a selected Custom option', () => {
      setup({ radiusMi: 137 });
      expect(screen.getByLabelText('Radius')).toHaveValue('137');
      expect(screen.getByRole('option', { name: 'Custom (137 mi)' })).toBeInTheDocument();
    });

    it('clamps an out-of-range radius for display', () => {
      setup({ radiusMi: 99999 });
      expect(screen.getByRole('option', { name: `Custom (${MAX_RADIUS_MI.toLocaleString()} mi)` }));
    });

    it('reports the chosen preset', async () => {
      const { onRadiusChange } = setup();
      await userEvent.selectOptions(screen.getByLabelText('Radius'), '250');
      expect(onRadiusChange).toHaveBeenCalledWith(250);
    });
  });

  describe('Clear area', () => {
    it.each<AreaMode>(['radius', 'rectangle'])('clears the %s area', async (mode) => {
      const { onClear } = setup({ mode });
      await userEvent.click(screen.getByRole('button', { name: 'Clear area' }));
      expect(onClear).toHaveBeenCalled();
    });

    it('is disabled with no area', () => {
      setup({ hasArea: false });
      expect(screen.getByRole('button', { name: 'Clear area' })).toBeDisabled();
    });
  });
});
