'use client';

import dynamic from 'next/dynamic';
import { Home, LocateFixed, MapPin, Trash2 } from 'lucide-react';
import { useDeleteAddressMutation, useGetAddressesQuery, useGetRestaurantQuery, type SavedAddress } from '../../api/apiSlice';
import { Button, Field, IconButton, Input, Skeleton, checkboxClasses, cn, useToast } from '../../components/ui';
import { DEFAULT_RESTAURANT } from '../../lib/site';
import type { Pin } from './DeliveryMap';

// Leaflet needs the browser; render a placeholder on the server.
const DeliveryMap = dynamic(() => import('./DeliveryMap'), {
  ssr: false,
  loading: () => <Skeleton className="h-64 sm:h-72" />,
});

/** Same limit as the server (addresses.service.ts). */
const MAX_ADDRESSES = 10;

/** Everything the customer enters for a delivery. */
export interface DeliveryDraft {
  savedId: string | null; // the saved address it started from, if any
  text: string;
  note: string; // for the driver
  pin: Pin | null;
  save: boolean; // save it for next time (new addresses only)
  label: string;
}

export const emptyDelivery: DeliveryDraft = { savedId: null, text: '', note: '', pin: null, save: true, label: 'Home' };

/** The address the order and the driver see: the text, plus the note if there is one. */
export function deliveryAddressText(d: DeliveryDraft): string {
  return d.note.trim() ? `${d.text.trim()} · Note: ${d.note.trim()}` : d.text.trim();
}

interface Props {
  value: DeliveryDraft;
  /** `recenter`: the pin was set from outside the map, so centre the map on it. */
  onChange: (next: DeliveryDraft, recenter?: boolean) => void;
  focusKey: number;
  /** Ask the browser for the customer's location and put the pin there. */
  onUseLocation: () => void;
  locating: boolean;
  locationError?: string;
}

export default function DeliveryForm({ value, onChange, focusKey, onUseLocation, locating, locationError }: Props) {
  const { data: saved = [] } = useGetAddressesQuery();
  const { data: restaurant } = useGetRestaurantQuery();
  const [deleteAddress] = useDeleteAddressMutation();
  const toast = useToast();
  const set = (patch: Partial<DeliveryDraft>, recenter = false) => onChange({ ...value, ...patch }, recenter);
  const geo = restaurant?.geo ?? DEFAULT_RESTAURANT.geo;
  const center = { lat: Number(geo.latitude), lng: Number(geo.longitude) };

  const choose = (a: SavedAddress) =>
    onChange({ savedId: a.id, text: a.text, note: a.note ?? '', pin: { lat: a.lat, lng: a.lng }, save: false, label: a.label }, true);

  const remove = async (a: SavedAddress) => {
    try {
      await deleteAddress(a.id).unwrap();
      toast({ title: `${a.label} was removed from your addresses` });
      if (value.savedId === a.id) onChange({ ...value, savedId: null, save: false });
    } catch {
      toast({ tone: 'error', title: `Could not remove ${a.label}`, description: 'Please try again.' });
    }
  };

  return (
    <div className="space-y-5">
      {saved.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-fg">Your addresses</legend>
          <div className="space-y-2">
            {saved.map((a) => (
              <div
                key={a.id}
                className={cn(
                  'flex items-center gap-3 rounded-control border px-3 py-2',
                  value.savedId === a.id ? 'border-accent bg-accent/5' : 'border-line',
                )}
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input
                    type="radio"
                    name="saved-address"
                    checked={value.savedId === a.id}
                    onChange={() => choose(a)}
                    className={checkboxClasses}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-fg">{a.label}</span>
                    <span className="block truncate text-xs text-fg-muted">{a.text}</span>
                  </span>
                </label>
                <IconButton
                  icon={Trash2}
                  size="sm"
                  label={`Remove ${a.label}`}
                  onClick={() => remove(a)}
                  className="hover:!bg-danger-soft hover:!text-danger"
                />
              </div>
            ))}
            <label className={cn(
              'flex cursor-pointer items-center gap-3 rounded-control border px-3 py-2 text-sm',
              value.savedId === null ? 'border-accent bg-accent/5' : 'border-line',
            )}>
              <input
                type="radio"
                name="saved-address"
                checked={value.savedId === null}
                onChange={() => onChange({ ...emptyDelivery, save: saved.length < MAX_ADDRESSES, label: '' })}
                className={checkboxClasses}
              />
              <span className="font-medium text-fg">A new address</span>
            </label>
          </div>
        </fieldset>
      )}

      <Field label="Delivery address" htmlFor="delivery-address" required>
        <Input
          id="delivery-address"
          type="text"
          value={value.text}
          maxLength={300}
          onChange={(e) => set({ text: e.target.value })}
          placeholder="House number, street, area"
          autoComplete="street-address"
        />
      </Field>

      <div className="space-y-2">
        <p className="text-sm font-medium text-fg">
          Pin on the map<span className="ml-0.5 text-danger" aria-hidden>*</span>
        </p>
        <DeliveryMap pin={value.pin} center={center} focusKey={focusKey} onChange={(pin) => set({ pin })} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button variant="secondary" size="sm" icon={LocateFixed} onClick={onUseLocation} loading={locating}>
            {locating ? 'Finding your location…' : 'Use my current location'}
          </Button>
          <span className={cn('inline-flex items-center gap-1.5 text-xs', value.pin ? 'text-fg-muted' : 'text-warning')}>
            <MapPin size={14} strokeWidth={1.75} aria-hidden />
            {value.pin ? 'Pin placed. Drag it if it is not on your door.' : 'Tap the map where we should deliver.'}
          </span>
        </div>
        <p className="text-xs text-fg-muted">The delivery fee is worked out from the pin.</p>
        {locationError && <p className="text-sm text-danger" role="alert">{locationError}</p>}
      </div>

      <Field label="Note for the driver" htmlFor="delivery-note" hint="Optional, e.g. blue gate, call when you arrive">
        <Input id="delivery-note" value={value.note} maxLength={200} onChange={(e) => set({ note: e.target.value })} />
      </Field>

      {value.savedId === null && saved.length < MAX_ADDRESSES && (
        <div className="space-y-3">
          <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-fg">
            <input type="checkbox" checked={value.save} onChange={(e) => set({ save: e.target.checked })} className={checkboxClasses} />
            Save this address for next time
          </label>
          {value.save && (
            <Field label="Name for this address" htmlFor="address-label" className="sm:max-w-xs">
              <div className="relative">
                <Home size={16} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
                <Input id="address-label" value={value.label} maxLength={40} placeholder="e.g. Home, Office" onChange={(e) => set({ label: e.target.value })} className="pl-9" />
              </div>
            </Field>
          )}
        </div>
      )}
    </div>
  );
}
