import { useState } from 'react';
import { useGetMenuItemsQuery, useGetCategoriesQuery } from '../../api/apiSlice';
import MenuItemCard from './MenuItemCard';
import CategoryTabs from './CategoryTabs';

export default function MenuPage() {
  const [activeCategory, setActiveCategory] = useState<string | undefined>(undefined);
  const { data: categories = [] } = useGetCategoriesQuery();
  const { data: items = [], isLoading } = useGetMenuItemsQuery({ category: activeCategory });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Our Menu</h1>
      <CategoryTabs
        categories={categories}
        active={activeCategory}
        onChange={setActiveCategory}
      />
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-64 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-gray-500 mt-8 text-center">No items in this category.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {items.map((item) => (
            <MenuItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
