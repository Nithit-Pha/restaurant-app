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

// Selectors
const TAX_RATE = 0.07;

export const selectCartItems = (state: RootState) => state.cart.items;
export const selectCartIsOpen = (state: RootState) => state.cart.isOpen;
export const selectCartCount = createSelector(selectCartItems, (items) =>
  items.reduce((s, i) => s + i.quantity, 0)
);
export const selectSubtotal = createSelector(selectCartItems, (items) =>
  Math.round(items.reduce((s, i) => s + i.sellingPrice * i.quantity, 0) * 100) / 100
);
export const selectTaxAmount = createSelector(selectSubtotal, (sub) =>
  Math.round(sub * TAX_RATE * 100) / 100
);
export const selectTotal = createSelector(
  selectSubtotal, selectTaxAmount,
  (sub, tax) => Math.round((sub + tax) * 100) / 100
);
