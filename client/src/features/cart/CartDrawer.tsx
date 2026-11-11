'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Minus, Plus, ShoppingBag, Trash2, UtensilsCrossed } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import {
  selectCartItems, selectCartIsOpen, selectSubtotal, selectTaxAmount, selectTotal,
  closeCart, removeItem, updateQuantity, setNote, type CartItem,
} from './cartSlice';
import { formatCurrency } from '../../lib/format';
import { Button, Drawer, EmptyState, IconButton, Input, buttonClasses } from '../../components/ui';
import LineDetails from '../orders/LineDetails';

/** "Add a note" link under a cart line; opens a small input, saved on Enter or when leaving it. */
function NoteEditor({ item }: { item: CartItem }) {
  const dispatch = useAppDispatch();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.note);
  const save = () => {
    setEditing(false);
    if (text.trim() !== item.note) dispatch(setNote({ lineId: item.lineId, note: text }));
  };
  if (!editing) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 h-7 px-2 text-xs"
        onClick={() => { setText(item.note); setEditing(true); }}
      >
        {item.note ? 'Edit note' : 'Add a note'}
      </Button>
    );
  }
  return (
    <Input
      autoFocus
      value={text}
      maxLength={200}
      placeholder="e.g. no peanuts"
      aria-label={`Note for ${item.name}`}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); }
      }}
      className="mt-1 h-8 text-xs"
    />
  );
}

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
            <li key={item.lineId} className="flex gap-3 px-4 py-3.5">
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
                <LineDetails options={item.options} note={item.note} className="mt-0.5" />
                <NoteEditor key={item.lineId} item={item} />
                <div className="mt-1 flex items-center justify-between">
                  <div className="inline-flex items-center rounded-control border border-line">
                    <IconButton
                      icon={Minus}
                      size="sm"
                      label={`One less ${item.name}`}
                      onClick={() => dispatch(updateQuantity({ lineId: item.lineId, quantity: item.quantity - 1 }))}
                    />
                    <span className="w-8 text-center text-sm font-medium tabular-nums text-fg" aria-live="polite">
                      {item.quantity}
                    </span>
                    <IconButton
                      icon={Plus}
                      size="sm"
                      label={`One more ${item.name}`}
                      onClick={() => dispatch(updateQuantity({ lineId: item.lineId, quantity: item.quantity + 1 }))}
                    />
                  </div>
                  <IconButton
                    icon={Trash2}
                    size="sm"
                    label={`Remove ${item.name}`}
                    onClick={() => dispatch(removeItem(item.lineId))}
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
