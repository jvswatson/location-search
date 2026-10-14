import type { ReactNode } from 'react';
import { vi } from 'vitest';

/** Callbacks captured from the lightweight react-leaflet stand-ins, so tests can drive the map. */
export const mapHandlers: { click?: (e: { latlng: { lat: number; lng: number } }) => void } = {};
export const fitBounds = vi.fn();

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
    useMap: () => ({ fitBounds }),
    useMapEvents: (handlers: typeof mapHandlers) => {
      Object.assign(mapHandlers, handlers);
      return {};
    },
    CircleMarker: ({ center }: { center: [number, number] }) => (
      <span data-testid="pin" data-center={center.join(',')} />
    ),
    Circle: ({ center, radius }: { center: [number, number]; radius: number }) => (
      <span data-testid="circle" data-center={center.join(',')} data-radius-m={radius} />
    ),
    Marker: ({
      position,
      eventHandlers,
    }: {
      position: { lat: number; lng: number };
      eventHandlers: {
        drag: (e: { target: { getLatLng: () => { lat: number; lng: number } } }) => void;
        dragend: () => void;
      };
    }) => (
      <button
        type="button"
        data-testid="handle"
        data-position={`${position.lat},${position.lng}`}
        onClick={() => {
          // Simulate dragging the handle to a spot ~100 mi due east of the map center.
          const target = { getLatLng: () => ({ lat: dragTarget.lat, lng: dragTarget.lng }) };
          eventHandlers.drag({ target });
          eventHandlers.dragend();
        }}
      >
        handle
      </button>
    ),
  };
}

/** Where the mock handle reports itself when "dragged" in a test. */
export const dragTarget = { lat: 0, lng: 0 };
