export function MapPrompt() {
  return (
    <div
      data-testid="map-prompt"
      className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center p-4"
    >
      <p className="rounded-full bg-white/90 px-4 py-2 text-center text-sm font-medium text-slate-700 shadow">
        Click the map or search to start filtering
      </p>
    </div>
  );
}
