import { useAppDispatch, useAppSelector } from '../../app/hooks';
import {
  selectCartItems, selectCartIsOpen, selectSubtotal, selectTaxAmount, selectTotal,
  closeCart, removeItem, updateQuantity,
} from './cartSlice';
import { Link } from 'react-router-dom';
import { formatCurrency } from '../../lib/format';

export default function CartDrawer() {
  const dispatch = useAppDispatch();
  const items = useAppSelector(selectCartItems);
  const isOpen = useAppSelector(selectCartIsOpen);
  const subtotal = useAppSelector(selectSubtotal);
  const taxAmount = useAppSelector(selectTaxAmount);
  const total = useAppSelector(selectTotal);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={() => dispatch(closeCart())} />
      <div className="fixed right-0 top-0 h-full w-full max-w-sm bg-white z-50 shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Your Cart</h2>
          <button onClick={() => dispatch(closeCart())} className="text-gray-500 hover:text-gray-900 text-2xl">&times;</button>
        </div>

        {items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">Your cart is empty</div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  {item.imageUrl && (
                    <img src={item.imageUrl} alt={item.name} className="w-12 h-12 object-cover rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-gray-500">{formatCurrency(item.sellingPrice)} each</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => dispatch(updateQuantity({ id: item.id, quantity: item.quantity - 1 }))}
                      className="w-6 h-6 rounded border text-sm font-bold hover:bg-gray-100"
                    >−</button>
                    <span className="w-6 text-center text-sm">{item.quantity}</span>
                    <button
                      onClick={() => dispatch(updateQuantity({ id: item.id, quantity: item.quantity + 1 }))}
                      className="w-6 h-6 rounded border text-sm font-bold hover:bg-gray-100"
                    >+</button>
                  </div>
                  <button
                    onClick={() => dispatch(removeItem(item.id))}
                    className="text-red-400 hover:text-red-600 text-xs ml-1"
                  >✕</button>
                </div>
              ))}
            </div>

            <div className="p-4 border-t space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Tax (7%)</span><span>{formatCurrency(taxAmount)}</span>
              </div>
              <div className="flex justify-between font-semibold text-gray-900">
                <span>Total</span><span>{formatCurrency(total)}</span>
              </div>
              <Link
                to="/checkout"
                onClick={() => dispatch(closeCart())}
                className="block w-full text-center bg-brand-500 hover:bg-brand-600 text-white font-semibold py-2 rounded-md mt-2"
              >
                Checkout
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  );
}
