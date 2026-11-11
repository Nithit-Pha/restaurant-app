'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Plus, UtensilsCrossed } from 'lucide-react';
import { itemDescription, itemName } from '../../lib/localized';
import type { MenuItem } from '../../api/apiSlice';
import { useAppDispatch } from '../../app/hooks';
import { addItem, openCart, type CartOption } from '../cart/cartSlice';
import { CURRENCY, formatCurrency } from '../../lib/format';
import { Button } from '../../components/ui';
import ItemOptionsDialog from './ItemOptionsDialog';

interface Props {
  item: MenuItem;
}

// Marked 'use client' for the add-to-cart interaction, but Next.js still
// renders it to HTML on the server — crawlers see the real name/description/
// price, not an empty shell.
export default function MenuItemCard({ item }: Props) {
  const t = useTranslations('menu');
  const locale = useLocale();
  const name = itemName(item, locale);
  const description = itemDescription(item, locale);
  const dispatch = useAppDispatch();
  const [choosing, setChoosing] = useState(false);

  const add = (options: CartOption[] = [], note = '') => {
    dispatch(addItem({ item, options, note }));
    dispatch(openCart());
  };
  // Items with options open the options dialog first.
  const handleAdd = () => (item.modifierGroups?.length ? setChoosing(true) : add());

  return (
    <article
      className="group flex flex-row-reverse overflow-hidden rounded-card border border-line bg-surface transition-shadow duration-150 hover:shadow-soft sm:flex-col"
      itemScope
      itemType="https://schema.org/MenuItem"
    >
      {/* Phones: small square on the right, like a printed menu. Larger screens: photo on top. */}
      <div className="m-3 h-24 w-24 shrink-0 overflow-hidden rounded-control bg-surface-muted sm:m-0 sm:aspect-[3/2] sm:h-auto sm:w-auto sm:rounded-none">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={name} itemProp="image" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-fg-subtle">
            <UtensilsCrossed size={28} strokeWidth={1.5} aria-hidden />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col py-3 pl-4 sm:p-4">
        <h3 itemProp="name" className="font-medium leading-snug text-fg">{name}</h3>
        {description && (
          <p itemProp="description" className="mt-1 line-clamp-2 text-sm sm:line-clamp-3 text-fg-muted">{description}</p>
        )}
        <div className="mt-auto flex items-center justify-between gap-3 pt-3 sm:pt-4">
          <span itemProp="offers" itemScope itemType="https://schema.org/Offer" className="text-base font-semibold tabular-nums text-fg">
            <span itemProp="priceCurrency" content={CURRENCY} />
            <span itemProp="price" content={String(item.sellingPrice)}>{formatCurrency(item.sellingPrice)}</span>
          </span>
          <Button size="sm" variant="secondary" icon={Plus} onClick={handleAdd} aria-label={t('addLabel', { name })}>
            {t('add')}
          </Button>
        </div>
      </div>
      {choosing && (
        <ItemOptionsDialog
          item={{ ...item, name, description }}
          onClose={() => setChoosing(false)}
          onAdd={(options, note) => {
            setChoosing(false);
            add(options, note);
          }}
        />
      )}
    </article>
  );
}
