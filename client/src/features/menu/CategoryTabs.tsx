interface Props {
  categories: string[];
  active?: string;
  onChange: (category: string | undefined) => void;
}

export default function CategoryTabs({ categories, active, onChange }: Props) {
  return (
    <div className="flex gap-2 flex-wrap">
      <button
        onClick={() => onChange(undefined)}
        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
          !active ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onChange(cat)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            active === cat ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
