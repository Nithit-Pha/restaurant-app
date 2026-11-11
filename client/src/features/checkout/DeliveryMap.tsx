'use client';

// Leaflet touches `window` when it loads, so this file is only ever loaded in
// the browser (next/dynamic with ssr: false, see DeliveryForm).
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';

export interface Pin { lat: number; lng: number }

// A drawn pin instead of Leaflet's default marker images, which bundlers break.
const pinIcon = L.divIcon({
  className: '',
  iconSize: [32, 40],
  iconAnchor: [16, 40],
  html:
    '<svg width="32" height="40" viewBox="0 0 32 40" aria-hidden="true">' +
    '<path d="M16 39s13-12.4 13-23A13 13 0 0 0 3 16c0 10.6 13 23 13 23z" fill="rgb(var(--accent))" stroke="white" stroke-width="2"/>' +
    '<circle cx="16" cy="16" r="5" fill="white"/></svg>',
});

/** Tapping the map moves the pin there. */
function PlaceOnClick({ onChange }: { onChange: (p: Pin) => void }) {
  useMapEvents({ click: (e) => onChange({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

/**
 * Leaflet measures its box once, when it starts. If the page layout settles
 * later, it believes the map is a few pixels wide and loads tiles only there.
 * Measure again whenever the box changes size.
 */
function KeepSize() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

/** Centre the map on the pin when it was set from outside (saved address, "my location"). */
function FollowPin({ pin, focusKey }: { pin: Pin | null; focusKey: number }) {
  const map = useMap();
  useEffect(() => {
    if (pin) map.setView([pin.lat, pin.lng], Math.max(map.getZoom(), 16));
    // Only on focusKey: dragging the pin must not move the map under the finger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);
  return null;
}

export default function DeliveryMap({ pin, center, focusKey, onChange }: {
  pin: Pin | null;
  /** Where the map starts when there is no pin yet (the restaurant). */
  center: Pin;
  focusKey: number;
  onChange: (p: Pin) => void;
}) {
  const start = pin ?? center;
  return (
    // isolate: Leaflet's own z-indexes (400–1000) stay inside the map, under drawers and the header.
    <div className="isolate h-64 overflow-hidden rounded-control border border-line sm:h-72" data-testid="delivery-map">
      <MapContainer center={[start.lat, start.lng]} zoom={pin ? 16 : 14} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <KeepSize />
        <PlaceOnClick onChange={onChange} />
        <FollowPin pin={pin} focusKey={focusKey} />
        {pin && (
          <Marker
            position={[pin.lat, pin.lng]}
            icon={pinIcon}
            draggable
            title="Your delivery pin. Drag it to your door."
            eventHandlers={{
              dragend: (e) => {
                const p = (e.target as L.Marker).getLatLng();
                onChange({ lat: p.lat, lng: p.lng });
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
