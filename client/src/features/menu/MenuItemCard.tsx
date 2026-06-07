'use client';

import type { MenuItem } from '../../api/apiSlice';
import { useAppDispatch } from '../../app/hooks';
import { addItem, openCart } from '../cart/cartSlice';
import { formatCurrency } from '../../lib/format';

interface Props {
  item: MenuItem;
}

// Marked 'use client' for the add-to-cart interaction, but Next.js still
// renders it to HTML on the server — crawlers see the real name/description/
// price, not an empty shell.
export default function MenuItemCard({ item }: Props) {
  const dispatch = useAppDispatch();

  const handleAdd = () => {
    dispatch(addItem(item));
    dispatch(openCart());
  };

  return (
    <article
      className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col"
      itemScope
      itemType="https://schema.org/MenuItem"
    >
      {item.imageUrl ? (
        <img src={item.imageUrl} alt={item.name} itemProp="image" className="w-full h-48 object-cover" />
      ) : (
        <div className="w-full h-48 bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-300 text-5xl">🍽️</div>
      )}
      <div className="p-4 flex flex-col flex-1">
        <h3 itemProp="name" className="font-semibold text-gray-900 dark:text-white">{item.name}</h3>
        {item.description && (
          <p itemProp="description" className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex-1">{item.description}</p>
        )}
        <div className="flex items-center justify-between mt-4">
          <span
            itemProp="offers"
            itemScope
            itemType="https://schema.org/Offer"
            className="text-lg font-bold text-brand-600"
          >
            <span itemProp="priceCurrency" content="USD" />
            <span itemProp="price" content={String(item.sellingPrice)}>{formatCurrency(item.sellingPrice)}</span>
          </span>
          <button
            onClick={handleAdd}
            className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-4 py-1.5 rounded-full"
          >
            Add
          </button>
        </div>
      </div>
    </article>
  );
}
