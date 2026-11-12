'use client';

import { Plus, UtensilsCrossed } from 'lucide-react';
import type { MenuItem } from '../../api/apiSlice';
import { useAppDispatch } from '../../app/hooks';
import { addItem, openCart } from '../cart/cartSlice';
import { CURRENCY, formatCurrency } from '../../lib/format';
import { Button } from '../../components/ui';

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
      className="group flex flex-row-reverse overflow-hidden rounded-card border border-line bg-surface transition-shadow duration-150 hover:shadow-soft sm:flex-col"
      itemScope
      itemType="https://schema.org/MenuItem"
    >
      {/* Phones: small square on the right, like a printed menu. Larger screens: photo on top. */}
      <div className="m-3 h-24 w-24 shrink-0 overflow-hidden rounded-control bg-surface-muted sm:m-0 sm:aspect-[3/2] sm:h-auto sm:w-auto sm:rounded-none">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} itemProp="image" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-fg-subtle">
            <UtensilsCrossed size={28} strokeWidth={1.5} aria-hidden />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col py-3 pl-4 sm:p-4">
        <h2 itemProp="name" className="text-base font-medium leading-snug text-fg">{item.name}</h2>
        {item.description && (
          <p itemProp="description" className="mt-1 line-clamp-2 text-sm sm:line-clamp-3 text-fg-muted">{item.description}</p>
        )}
        <div className="mt-auto flex items-center justify-between gap-3 pt-3 sm:pt-4">
          <span itemProp="offers" itemScope itemType="https://schema.org/Offer" className="text-base font-semibold tabular-nums text-fg">
            <span itemProp="priceCurrency" content={CURRENCY} />
            <span itemProp="price" content={String(item.sellingPrice)}>{formatCurrency(item.sellingPrice)}</span>
          </span>
          <Button size="sm" variant="secondary" icon={Plus} onClick={handleAdd} aria-label={`Add ${item.name}`}>
            Add
          </Button>
        </div>
      </div>
    </article>
  );
}
