interface Props {
  address: string;
  onChange: (value: string) => void;
}

export default function DeliveryForm({ address, onChange }: Props) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Delivery address</label>
      <input
        type="text"
        value={address}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter your full delivery address"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  );
}
