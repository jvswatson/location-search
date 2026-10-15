import type { AreaMode } from '../state/queryState';

const TEXT: Record<AreaMode, string> = {
  radius: 'Click the map or search to start filtering',
  rectangle: 'Click two corners on the map or search to start filtering',
  polygon: 'Click points on the map to outline an area, or search to start filtering',
};

export function MapPrompt({ mode = 'radius' }: { mode?: AreaMode }) {
  return (
    <div
      data-testid="map-prompt"
      className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center p-4"
    >
      <p className="rounded-full bg-white/90 px-4 py-2 text-center text-sm font-medium text-slate-700 shadow">
        {TEXT[mode]}
      </p>
    </div>
  );
}
