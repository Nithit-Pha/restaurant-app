'use client';

import Link from 'next/link';
import { Minus, Plus, ShoppingBag, Trash2, UtensilsCrossed } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import {
  selectCartItems, selectCartIsOpen, selectSubtotal, selectTaxAmount, selectTotal,
  closeCart, removeItem, updateQuantity,
} from './cartSlice';
import { formatCurrency } from '../../lib/format';
import { Drawer, EmptyState, IconButton, buttonClasses } from '../../components/ui';

export default function CartDrawer() {
  const dispatch = useAppDispatch();
  const items = useAppSelector(selectCartItems);
  const isOpen = useAppSelector(selectCartIsOpen);
  const subtotal = useAppSelector(selectSubtotal);
  const taxAmount = useAppSelector(selectTaxAmount);
  const total = useAppSelector(selectTotal);
  const close = () => dispatch(closeCart());

  const footer =
    items.length > 0 ? (
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between text-fg-muted">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatCurrency(subtotal)}</span>
        </div>
        <div className="flex justify-between text-fg-muted">
          <span>Tax (7%, included)</span>
          <span className="tabular-nums">{formatCurrency(taxAmount)}</span>
        </div>
        <div className="flex justify-between pt-1 text-base font-semibold text-fg">
          <span>Total</span>
          <span className="tabular-nums">{formatCurrency(total)}</span>
        </div>
        <Link href="/checkout" onClick={close} className={buttonClasses('primary', 'lg', 'mt-3 w-full')}>
          Checkout
        </Link>
      </div>
    ) : undefined;

  return (
    <Drawer open={isOpen} onClose={close} title="Your cart" footer={footer}>
      {items.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          description="Add something from the menu to start an order."
          action={
            <Link href="/menu" onClick={close} className={buttonClasses('secondary')}>
              Browse the menu
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <li key={item.id} className="flex gap-3 px-4 py-3.5">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-control bg-surface-muted">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-fg-subtle">
                    <UtensilsCrossed size={18} strokeWidth={1.5} aria-hidden />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-medium text-fg">{item.name}</p>
                  <p className="shrink-0 text-sm font-medium tabular-nums text-fg">
                    {formatCurrency(item.sellingPrice * item.quantity)}
                  </p>
                </div>
                <p className="text-xs tabular-nums text-fg-muted">{formatCurrency(item.sellingPrice)} each</p>
                <div className="mt-2 flex items-center justify-between">
                  <div className="inline-flex items-center rounded-control border border-line">
                    <IconButton
                      icon={Minus}
                      size="sm"
                      label={`One less ${item.name}`}
                      onClick={() => dispatch(updateQuantity({ id: item.id, quantity: item.quantity - 1 }))}
                    />
                    <span className="w-8 text-center text-sm font-medium tabular-nums text-fg" aria-live="polite">
                      {item.quantity}
                    </span>
                    <IconButton
                      icon={Plus}
                      size="sm"
                      label={`One more ${item.name}`}
                      onClick={() => dispatch(updateQuantity({ id: item.id, quantity: item.quantity + 1 }))}
                    />
                  </div>
                  <IconButton
                    icon={Trash2}
                    size="sm"
                    label={`Remove ${item.name}`}
                    onClick={() => dispatch(removeItem(item.id))}
                    className="hover:!bg-danger-soft hover:!text-danger"
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
