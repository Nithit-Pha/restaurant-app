import { LocateFixed, MapPin } from 'lucide-react';
import { Button, Field, Input } from '../../components/ui';

interface Props {
  address: string;
  onChange: (value: string) => void;
  /** Ask the browser for the customer's location (used for fee + range check). */
  onUseLocation: () => void;
  locating: boolean;
  located: boolean;
  locationError?: string;
}

export default function DeliveryForm({ address, onChange, onUseLocation, locating, located, locationError }: Props) {
  return (
    <div className="space-y-4">
      <Field label="Delivery address" htmlFor="delivery-address" required>
        <Input
          id="delivery-address"
          type="text"
          value={address}
          onChange={(e) => onChange(e.target.value)}
          placeholder="House number, street, area"
          autoComplete="street-address"
        />
      </Field>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button variant="secondary" icon={located ? MapPin : LocateFixed} onClick={onUseLocation} loading={locating}>
          {locating ? 'Finding your location…' : located ? 'Location shared — update' : 'Use my current location'}
        </Button>
        <span className="text-xs text-fg-muted">Used to work out the delivery fee and check we deliver to you.</span>
      </div>
      {locationError && <p className="text-sm text-danger" role="alert">{locationError}</p>}
    </div>
  );
}
