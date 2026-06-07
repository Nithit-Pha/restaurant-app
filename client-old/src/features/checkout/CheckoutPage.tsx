import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { selectCartItems, selectSubtotal, selectTaxAmount, clearCart } from '../cart/cartSlice';
import { usePlaceOrderMutation } from '../../api/apiSlice';
import DeliveryForm from './DeliveryForm';
import { formatCurrency } from '../../lib/format';

export default function CheckoutPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const items = useAppSelector(selectCartItems);
  const subtotal = useAppSelector(selectSubtotal);
  const taxAmount = useAppSelector(selectTaxAmount);
  const [orderType, setOrderType] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [placeOrder, { isLoading, error }] = usePlaceOrderMutation();

  if (items.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-gray-500 dark:text-gray-400">Your cart is empty.</p>
      </div>
    );
  }

  const deliveryFee = orderType === 'DELIVERY' ? 3.99 : 0;
  const total = Math.round((subtotal + taxAmount + deliveryFee) * 100) / 100;

  const handleSubmit = async () => {
    try {
      const order = await placeOrder({
        items: items.map((i) => ({ menuItemId: i.id, quantity: i.quantity })),
        type: orderType,
        deliveryAddress: orderType === 'DELIVERY' ? deliveryAddress : undefined,
      }).unwrap();
      dispatch(clearCart());
      navigate(`/orders/${order.id}`);
    } catch (_) {}
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Checkout</h1>

      {/* Order type */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 mb-4">
        <p className="font-medium text-gray-700 dark:text-gray-300 mb-3">Order type</p>
        <div className="flex gap-4">
          {(['PICKUP', 'DELIVERY'] as const).map((type) => (
            <label key={type} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value={type}
                checked={orderType === type}
                onChange={() => setOrderType(type)}
                className="accent-brand-500"
              />
              <span className="text-sm font-medium dark:text-gray-300">{type === 'PICKUP' ? 'Pickup' : 'Delivery'}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Delivery address */}
      {orderType === 'DELIVERY' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 mb-4">
          <DeliveryForm address={deliveryAddress} onChange={setDeliveryAddress} />
        </div>
      )}

      {/* Order summary */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 mb-6">
        <p className="font-medium text-gray-700 dark:text-gray-300 mb-3">Order summary</p>
        {items.map((item) => (
          <div key={item.id} className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
            <span>{item.name} × {item.quantity}</span>
            <span>{formatCurrency(item.sellingPrice * item.quantity)}</span>
          </div>
        ))}
        <div className="border-t dark:border-gray-700 mt-3 pt-3 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
          <div className="flex justify-between"><span>Tax (7%)</span><span>{formatCurrency(taxAmount)}</span></div>
          {orderType === 'DELIVERY' && (
            <div className="flex justify-between"><span>Delivery fee</span><span>{formatCurrency(deliveryFee)}</span></div>
          )}
          <div className="flex justify-between font-semibold text-gray-900 dark:text-white text-base pt-1 border-t dark:border-gray-700">
            <span>Total</span><span>{formatCurrency(total)}</span>
          </div>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mb-3">Failed to place order. Please try again.</p>}

      <button
        onClick={handleSubmit}
        disabled={isLoading || (orderType === 'DELIVERY' && !deliveryAddress.trim())}
        className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3 rounded-lg disabled:opacity-50"
      >
        {isLoading ? 'Placing order…' : `Place order · ${formatCurrency(total)}`}
      </button>
    </div>
  );
}
