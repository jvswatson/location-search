import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { divIcon, type LeafletMouseEvent, type Marker as LeafletMarker } from 'leaflet';
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { milesToMeters, type AirportPointDto } from '@location-search/shared';
import {
  handlePosition,
  radiusFromHandle,
  roundCoord,
  wrapLng,
  type Bounds,
  type LatLng,
} from '../lib/geo';

export interface FitTarget {
  /** The map refits only when this key changes, so user panning/zooming is not fought. */
  key: string;
  bounds: Bounds | null;
}

interface Props {
  center: LatLng | null;
  radiusMi: number;
  pins: AirportPointDto[];
  fit: FitTarget;
  onCenterChange: (center: LatLng) => void;
  /** Fires continuously while the handle is dragged (already rounded and clamped). */
  onRadiusDrag: (radiusMi: number) => void;
  children?: ReactNode;
}

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

function FitController({ fit }: { fit: FitTarget }) {
  const map = useMap();
  const latest = useRef(fit.bounds);
  useEffect(() => {
    latest.current = fit.bounds;
  });
  useEffect(() => {
    if (latest.current) map.fitBounds(latest.current, { padding: [24, 24], maxZoom: 12 });
  }, [map, fit.key]);
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
  center,
  radiusMi,
  pins,
  fit,
  onCenterChange,
  onRadiusDrag,
  children,
}: Props) {
  return (
    <div
      data-testid="airport-map"
      data-pin-count={pins.length}
      data-center={center ? `${center.lat},${center.lng}` : undefined}
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
        <ClickToSetCenter onCenterChange={onCenterChange} />
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
              pathOptions={{ color: '#0284c7', weight: 2, fillOpacity: 0.08 }}
            />
            <RadiusHandle center={center} radiusMi={radiusMi} onRadiusDrag={onRadiusDrag} />
          </>
        )}
      </MapContainer>
      {children}
    </div>
  );
}
