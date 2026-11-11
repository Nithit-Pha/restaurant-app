import { createSlice, createSelector, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../../app/store';
import type { MenuItem } from '../../api/apiSlice';

export interface CartOption {
  id: string;
  name: string;
  priceDelta: number;
}

export interface CartItem {
  lineId: string; // the same dish with other options or another note is another line
  id: string; // menu item id
  name: string;
  nameTh?: string | null;
  sellingPrice: number; // per unit, including the options (display estimate; the server prices it)
  costPrice: number;
  imageUrl?: string;
  quantity: number;
  options: CartOption[];
  note: string;
}

interface CartState {
  items: CartItem[];
  isOpen: boolean;
}

const initialState: CartState = { items: [], isOpen: false };

const lineKey = (id: string, options: CartOption[], note: string) =>
  `${id}|${options.map((o) => o.id).sort().join(',')}|${note.trim()}`;

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    addItem(state, action: PayloadAction<{ item: MenuItem; options?: CartOption[]; note?: string }>) {
      const { item, options = [], note = '' } = action.payload;
      const key = lineKey(item.id, options, note);
      const existing = state.items.find((i) => i.lineId === key);
      if (existing) {
        existing.quantity += 1;
      } else {
        state.items.push({
          lineId: key,
          id: item.id,
          name: item.name,
          nameTh: item.nameTh,
          // API prices are Decimal strings ("89.00"); convert before adding.
          sellingPrice: Number(item.sellingPrice) + options.reduce((s, o) => s + o.priceDelta, 0),
          costPrice: item.costPrice,
          imageUrl: item.imageUrl,
          quantity: 1,
          options,
          note: note.trim(),
        });
      }
    },
    removeItem(state, action: PayloadAction<string>) {
      state.items = state.items.filter((i) => i.lineId !== action.payload);
    },
    updateQuantity(state, action: PayloadAction<{ lineId: string; quantity: number }>) {
      const item = state.items.find((i) => i.lineId === action.payload.lineId);
      if (item) {
        if (action.payload.quantity <= 0) {
          state.items = state.items.filter((i) => i.lineId !== action.payload.lineId);
        } else {
          item.quantity = action.payload.quantity;
        }
      }
    },
    /** A note for the kitchen on one line; joins an identical line if there is one. */
    setNote(state, action: PayloadAction<{ lineId: string; note: string }>) {
      const item = state.items.find((i) => i.lineId === action.payload.lineId);
      if (!item) return;
      const note = action.payload.note.trim();
      const key = lineKey(item.id, item.options, note);
      const twin = state.items.find((i) => i.lineId === key && i !== item);
      if (twin) {
        twin.quantity += item.quantity;
        state.items = state.items.filter((i) => i !== item);
      } else {
        item.note = note;
        item.lineId = key;
      }
    },
    clearCart(state) {
      state.items = [];
    },
    openCart(state) { state.isOpen = true; },
    closeCart(state) { state.isOpen = false; },
    toggleCart(state) { state.isOpen = !state.isOpen; },
  },
});

export const { addItem, removeItem, updateQuantity, setNote, clearCart, openCart, closeCart, toggleCart } = cartSlice.actions;
export default cartSlice.reducer;

// Selectors — menu prices are TAX-INCLUSIVE.
// Example: 10 + 10 = 20 with 7% tax -> subtotal 18.69 + tax 1.31 = total 20.00.
// (Display estimate only; checkout shows the server's quote.)
const TAX_RATE = 0.07;
const round2 = (n: number) => Math.round(n * 100) / 100;

export const selectCartItems = (state: RootState) => state.cart.items;
export const selectCartIsOpen = (state: RootState) => state.cart.isOpen;
export const selectCartCount = createSelector(selectCartItems, (items) =>
  items.reduce((s, i) => s + i.quantity, 0)
);

// Gross = the tax-inclusive sum the customer actually pays.
export const selectGross = createSelector(selectCartItems, (items) =>
  round2(items.reduce((s, i) => s + i.sellingPrice * i.quantity, 0))
);
// Tax portion contained inside the price: gross × rate / (1 + rate).
export const selectTaxAmount = createSelector(selectGross, (gross) => round2((gross * TAX_RATE) / (1 + TAX_RATE)));
// Subtotal shown to the customer is net of tax (gross - tax).
export const selectSubtotal = createSelector(
  selectGross, selectTaxAmount,
  (gross, tax) => round2(gross - tax)
);
// Cart total equals the gross (tax already included); delivery is added at checkout.
export const selectTotal = selectGross;
