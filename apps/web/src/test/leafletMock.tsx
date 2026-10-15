import type { ReactNode } from 'react';
import { vi } from 'vitest';

type LatLngEvent = { latlng: { lat: number; lng: number } };

/** Callbacks captured from the lightweight react-leaflet stand-ins, so tests can drive the map. */
export const mapHandlers: {
  click?: (e: LatLngEvent) => void;
  dblclick?: (e: LatLngEvent) => void;
  mousemove?: (e: LatLngEvent) => void;
} = {};
export const fitBounds = vi.fn();
export const doubleClickZoom = { disable: vi.fn(), enable: vi.fn() };

/** The mocked map's size; set to 0×0 to simulate a map laid out while hidden. */
export const mapSize = { x: 800, y: 600 };
/** Leaflet map events ('resize') registered through map.on, so tests can fire them. */
export const mapEventHandlers = new Map<string, Set<() => void>>();
export function fireMapEvent(name: string) {
  for (const handler of [...(mapEventHandlers.get(name) ?? [])]) handler();
}

const mockMap = {
  fitBounds,
  doubleClickZoom,
  getSize: () => ({ ...mapSize }),
  getContainer: () => document.createElement('div'),
  // A flat projection, 10 px per degree, so tests can reason about click distances in pixels.
  latLngToContainerPoint: (ll: [number, number] | { lat: number; lng: number }) => {
    const [lat, lng] = Array.isArray(ll) ? ll : [ll.lat, ll.lng];
    return { x: lng * 10, y: -lat * 10 };
  },
  invalidateSize: vi.fn(),
  on: (name: string, handler: () => void) => {
    if (!mapEventHandlers.has(name)) mapEventHandlers.set(name, new Set());
    mapEventHandlers.get(name)!.add(handler);
  },
  off: (name: string, handler: () => void) => {
    mapEventHandlers.get(name)?.delete(handler);
  },
};

type Bounds = [[number, number], [number, number]];

/**
 * Factory for `vi.mock('react-leaflet', ...)`. Renders plain elements and exposes the click and
 * drag callbacks as buttons.
 */
export function createReactLeafletMock() {
  return {
    MapContainer: ({ children }: { children?: ReactNode }) => (
      <div data-testid="leaflet-map">{children}</div>
    ),
    TileLayer: () => null,
    useMap: () => mockMap,
    useMapEvents: (handlers: typeof mapHandlers) => {
      // Replace (not merge): switching modes swaps the map's event handlers.
      delete mapHandlers.click;
      delete mapHandlers.dblclick;
      delete mapHandlers.mousemove;
      Object.assign(mapHandlers, handlers);
      return {};
    },
    CircleMarker: ({
      center,
      pathOptions,
    }: {
      center: [number, number];
      pathOptions?: { className?: string };
    }) => (
      <span
        data-testid={pathOptions?.className === 'outline-first-point' ? 'first-point' : 'pin'}
        data-center={center.join(',')}
      />
    ),
    Polygon: ({ positions }: { positions: [number, number][] }) => (
      <span data-testid="polygon" data-positions={positions.map((p) => p.join(',')).join(';')} />
    ),
    Polyline: ({
      positions,
      pathOptions,
    }: {
      positions: [number, number][];
      pathOptions?: { dashArray?: string };
    }) => (
      <span
        data-testid={pathOptions?.dashArray ? 'outline-cursor' : 'outline'}
        data-positions={positions.map((p) => p.join(',')).join(';')}
      />
    ),
    Circle: ({ center, radius }: { center: [number, number]; radius: number }) => (
      <span data-testid="circle" data-center={center.join(',')} data-radius-m={radius} />
    ),
    Rectangle: ({
      bounds,
      pathOptions,
    }: {
      bounds: Bounds;
      pathOptions?: { dashArray?: string };
    }) => (
      <span
        data-testid={pathOptions?.dashArray ? 'rectangle-preview' : 'rectangle'}
        data-bounds={bounds.flat().join(',')}
      />
    ),
    Marker: ({
      position,
      alt,
      eventHandlers,
    }: {
      position: { lat: number; lng: number } | [number, number];
      alt?: string;
      eventHandlers?: {
        drag: (e: { target: { getLatLng: () => { lat: number; lng: number } } }) => void;
        dragend: () => void;
      };
    }) => {
      const [lat, lng] = Array.isArray(position) ? position : [position.lat, position.lng];
      if (alt === 'Search center') {
        return <span data-testid="search-center" data-position={`${lat},${lng}`} />;
      }
      return (
        <button
          type="button"
          data-testid="handle"
          data-position={`${lat},${lng}`}
          onClick={() => {
            // Simulate dragging the handle to `dragTarget`.
            const target = { getLatLng: () => ({ lat: dragTarget.lat, lng: dragTarget.lng }) };
            eventHandlers?.drag({ target });
            eventHandlers?.dragend();
          }}
        >
          handle
        </button>
      );
    },
  };
}

/** Where the mock handle reports itself when "dragged" in a test. */
export const dragTarget = { lat: 0, lng: 0 };
