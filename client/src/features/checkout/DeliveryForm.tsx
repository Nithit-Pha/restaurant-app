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
    <div>
      <label htmlFor="delivery-address" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Delivery address
      </label>
      <input
        id="delivery-address"
        type="text"
        value={address}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter your full delivery address"
        autoComplete="street-address"
        className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onUseLocation}
          disabled={locating}
          className="text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          {locating ? 'Finding your location…' : located ? '📍 Location shared — update' : '📍 Use my current location'}
        </button>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Used to work out the delivery fee and check we deliver to you.
        </span>
      </div>
      {locationError && <p className="text-red-500 text-sm mt-2">{locationError}</p>}
    </div>
  );
}
