import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { divIcon, type LeafletMouseEvent, type Marker as LeafletMarker } from 'leaflet';
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Rectangle,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { milesToMeters, type AirportPointDto, type GeoPoint } from '@location-search/shared';
import {
  bboxBounds,
  handlePosition,
  radiusFromHandle,
  rectangleFromCorners,
  roundCoord,
  wrapLng,
  type BBox,
  type Bounds,
  type LatLng,
} from '../lib/geo';
import type { AreaMode } from '../state/queryState';

export interface FitTarget {
  /** The map refits only when this key changes, so user panning/zooming is not fought. */
  key: string;
  bounds: Bounds | null;
}

interface Props {
  mode: AreaMode;
  center: LatLng | null;
  radiusMi: number;
  bbox: BBox | null;
  /** Where the API measures distances from (meta.center); marked with a crosshair for rectangles. */
  referenceCenter?: GeoPoint;
  pins: AirportPointDto[];
  fit: FitTarget;
  onCenterChange: (center: LatLng) => void;
  /** Fires continuously while the handle is dragged (already rounded and clamped). */
  onRadiusDrag: (radiusMi: number) => void;
  onBboxChange: (bbox: BBox) => void;
  /** A drawing problem to show (null clears it), e.g. a rectangle across the antimeridian. */
  onDrawError: (message: string | null) => void;
  children?: ReactNode;
}

const AREA_STYLE = { color: '#0284c7', weight: 2, fillOpacity: 0.08 };

const handleIcon = divIcon({
  className: '',
  html: '<div class="h-4 w-4 rounded-full border-2 border-white bg-sky-600 shadow ring-2 ring-sky-600"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function ClickToSetCenter({ onCenterChange }: { onCenterChange: (c: LatLng) => void }) {
  useMapEvents({
    click: (e: LeafletMouseEvent) =>
      onCenterChange({ lat: roundCoord(e.latlng.lat), lng: roundCoord(wrapLng(e.latlng.lng)) }),
  });
  return null;
}

const crosshairIcon = divIcon({
  className: '',
  html: '<div class="relative h-5 w-5"><div class="absolute top-1/2 left-0 h-0.5 w-5 -translate-y-1/2 bg-sky-700"></div><div class="absolute top-0 left-1/2 h-5 w-0.5 -translate-x-1/2 bg-sky-700"></div></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

/**
 * Rectangle mode: the first click sets a corner and a dashed preview follows the cursor; the second
 * click completes the box (or reports why it can't). Escape cancels a half-drawn box. Double-click
 * zoom is off meanwhile, so two quick corner clicks don't zoom the map.
 */
function RectangleDrawer({
  onComplete,
  onError,
  onDraftingChange,
}: {
  onComplete: (bbox: BBox) => void;
  onError: (message: string | null) => void;
  onDraftingChange: (drafting: boolean) => void;
}) {
  const map = useMap();
  const [first, setFirst] = useState<LatLng | null>(null);
  const [cursor, setCursor] = useState<LatLng | null>(null);

  useEffect(() => {
    map.doubleClickZoom.disable();
    return () => {
      map.doubleClickZoom.enable();
    };
  }, [map]);

  useEffect(() => {
    onDraftingChange(first !== null);
  }, [first, onDraftingChange]);

  useEffect(() => {
    if (!first) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFirst(null);
        setCursor(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [first]);

  useMapEvents({
    click: (e: LeafletMouseEvent) => {
      const point = { lat: e.latlng.lat, lng: e.latlng.lng };
      if (!first) {
        onError(null);
        setFirst(point);
        setCursor(point);
        return;
      }
      setFirst(null);
      setCursor(null);
      const result = rectangleFromCorners(first, point);
      if (result.ok) onComplete(result.bbox);
      else onError(result.error);
    },
    mousemove: (e: LeafletMouseEvent) => {
      if (first) setCursor({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });

  if (!first || !cursor) return null;
  return (
    <Rectangle
      bounds={[
        [first.lat, first.lng],
        [cursor.lat, cursor.lng],
      ]}
      interactive={false}
      pathOptions={{ ...AREA_STYLE, dashArray: '6 4' }}
    />
  );
}

function FitController({ fit }: { fit: FitTarget }) {
  const map = useMap();
  const latest = useRef(fit.bounds);
  useEffect(() => {
    latest.current = fit.bounds;
  });
  useEffect(() => {
    const bounds = latest.current;
    if (!bounds) return;
    const hasSize = () => {
      const size = map.getSize();
      return size.x > 0 && size.y > 0;
    };
    const apply = () => map.fitBounds(bounds, { padding: [24, 24], maxZoom: 12 });
    if (hasSize()) {
      apply();
      return;
    }
    // Laid out at zero size (a hidden or still-opening container): fitting now would compute the
    // maximum zoom. Fit once the map has a size; ContainerSizeWatcher reports it via 'resize'.
    const onResize = () => {
      if (!hasSize()) return;
      map.off('resize', onResize);
      apply();
    };
    map.on('resize', onResize);
    return () => {
      map.off('resize', onResize);
    };
  }, [map, fit.key]);
  return null;
}

/**
 * Leaflet only re-measures on window resize. Its container also changes size with the layout
 * (breakpoints, a panel opening), so tell Leaflet whenever the container itself resizes.
 */
function ContainerSizeWatcher() {
  const map = useMap();
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function RadiusHandle({
  center,
  radiusMi,
  onRadiusDrag,
}: {
  center: LatLng;
  radiusMi: number;
  onRadiusDrag: (radiusMi: number) => void;
}) {
  // While dragging, the marker owns its position; afterwards it snaps back onto the circle edge.
  const [dragPos, setDragPos] = useState<LatLng | null>(null);
  const position = dragPos ?? handlePosition(center, radiusMi);
  const handlers = useMemo(
    () => ({
      drag: (e: { target: LeafletMarker }) => {
        const { lat, lng } = e.target.getLatLng();
        setDragPos({ lat, lng });
        onRadiusDrag(radiusFromHandle(center, { lat, lng }));
      },
      dragend: () => setDragPos(null),
    }),
    [center, onRadiusDrag],
  );
  return (
    <Marker
      position={position}
      draggable
      icon={handleIcon}
      keyboard={false}
      alt="Radius handle"
      eventHandlers={handlers}
    />
  );
}

export function AirportMap({
  mode,
  center,
  radiusMi,
  bbox,
  referenceCenter,
  pins,
  fit,
  onCenterChange,
  onRadiusDrag,
  onBboxChange,
  onDrawError,
  children,
}: Props) {
  const [drafting, setDrafting] = useState(false);
  return (
    <div
      data-testid="airport-map"
      data-pin-count={pins.length}
      data-mode={mode}
      data-center={center ? `${center.lat},${center.lng}` : undefined}
      data-bbox={bbox ? bbox.join(',') : undefined}
      data-drafting={drafting || undefined}
      className="relative h-full min-h-72 w-full overflow-hidden rounded-md border border-slate-200"
    >
      <MapContainer
        center={[25, 0]}
        zoom={2}
        minZoom={2}
        worldCopyJump
        preferCanvas
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {mode === 'radius' ? (
          <ClickToSetCenter onCenterChange={onCenterChange} />
        ) : (
          <RectangleDrawer
            onComplete={onBboxChange}
            onError={onDrawError}
            onDraftingChange={setDrafting}
          />
        )}
        <ContainerSizeWatcher />
        <FitController fit={fit} />
        {pins.map((p) => (
          <CircleMarker
            key={p.icaoCode}
            center={[p.lat, p.lng]}
            radius={3}
            interactive={false}
            pathOptions={{ color: '#0369a1', weight: 1, fillColor: '#0ea5e9', fillOpacity: 0.8 }}
          />
        ))}
        {center && (
          <>
            <Circle
              center={[center.lat, center.lng]}
              radius={milesToMeters(radiusMi)}
              interactive={false}
              pathOptions={AREA_STYLE}
            />
            <RadiusHandle center={center} radiusMi={radiusMi} onRadiusDrag={onRadiusDrag} />
          </>
        )}
        {bbox && (
          <Rectangle bounds={bboxBounds(bbox)} interactive={false} pathOptions={AREA_STYLE} />
        )}
        {mode === 'rectangle' && bbox && referenceCenter && (
          <Marker
            position={[referenceCenter.lat, referenceCenter.lng]}
            icon={crosshairIcon}
            interactive={false}
            keyboard={false}
            alt="Search center"
          />
        )}
      </MapContainer>
      {drafting && (
        <p
          data-testid="draw-hint"
          className="pointer-events-none absolute top-2 left-1/2 z-[500] -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-700 shadow"
        >
          Click the opposite corner · Esc to cancel
        </p>
      )}
      {/* Overlays such as the start prompt would compete with the drawing hint. */}
      {!drafting && children}
    </div>
  );
}
