import { createSlice, createSelector, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../../app/store';
import type { MenuItem } from '../../api/apiSlice';

export interface CartItem {
  id: string;
  name: string;
  sellingPrice: number;
  costPrice: number;
  imageUrl?: string;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  isOpen: boolean;
}

const initialState: CartState = { items: [], isOpen: false };

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    addItem(state, action: PayloadAction<MenuItem>) {
      const existing = state.items.find((i) => i.id === action.payload.id);
      if (existing) {
        existing.quantity += 1;
      } else {
        state.items.push({
          id: action.payload.id,
          name: action.payload.name,
          sellingPrice: action.payload.sellingPrice,
          costPrice: action.payload.costPrice,
          imageUrl: action.payload.imageUrl,
          quantity: 1,
        });
      }
    },
    removeItem(state, action: PayloadAction<string>) {
      state.items = state.items.filter((i) => i.id !== action.payload);
    },
    updateQuantity(state, action: PayloadAction<{ id: string; quantity: number }>) {
      const item = state.items.find((i) => i.id === action.payload.id);
      if (item) {
        if (action.payload.quantity <= 0) {
          state.items = state.items.filter((i) => i.id !== action.payload.id);
        } else {
          item.quantity = action.payload.quantity;
        }
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

export const { addItem, removeItem, updateQuantity, clearCart, openCart, closeCart, toggleCart } = cartSlice.actions;
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
