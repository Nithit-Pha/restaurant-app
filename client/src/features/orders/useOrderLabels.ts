'use client';

import { useTranslations } from 'next-intl';
import type { CancelReason, Order, OrderStatus, PaymentMethod, PaymentStatus } from '../../api/apiSlice';

/** The words for order and payment states, in the page's language (messages: "order"). */
export function useOrderLabels() {
  const t = useTranslations('order');

  /** Status words as customers and staff see them. DELIVERED reads "Completed" for pickup. */
  const status = (s: OrderStatus, type?: Order['type']): string => {
    switch (s) {
      case 'PENDING': return t('status.pending');
      case 'PREPARING': return t('status.preparing');
      case 'READY': return type === 'DELIVERY' ? t('status.readyDelivery') : t('status.readyPickup');
      case 'OUT_FOR_DELIVERY': return t('status.outForDelivery');
      case 'DELIVERED': return type === 'PICKUP' ? t('status.completed') : t('status.delivered');
      case 'CANCELLED': return t('status.cancelled');
      default: return s;
    }
  };

  /** Short labels for the staff screens. */
  const shortStatus = (s: OrderStatus, type?: Order['type']): string => {
    if (s === 'PENDING') return t('status.newShort');
    if (s === 'READY') return t('status.readyShort');
    return status(s, type);
  };

  const cancelReason = (r: CancelReason): string => t(`cancelReason.${r}`);

  /** The button for the next step staff can take ("Accept", "Mark ready", ...). */
  const forwardAction = (order: Pick<Order, 'status' | 'type'>): string => {
    switch (order.status) {
      case 'PENDING': return t('action.accept');
      case 'PREPARING': return t('action.markReady');
      case 'READY': return order.type === 'DELIVERY' ? t('action.outForDelivery') : t('action.pickedUp');
      case 'OUT_FOR_DELIVERY': return t('action.delivered');
      default: return '';
    }
  };

  const paymentMethod = (m: PaymentMethod): string => t(`payment.method.${m}`);
  const paymentStatus = (s: PaymentStatus): string => t(`payment.status.${s}`);

  /** "Cash on delivery" / "Cash at pickup" / "PromptPay QR" for the customer. */
  const paymentMethodText = (order: Pick<Order, 'paymentMethod' | 'type'>): string => {
    if (order.paymentMethod === 'PROMPTPAY') return t('payment.promptPayQr');
    return order.type === 'DELIVERY' ? t('payment.cashOnDelivery') : t('payment.cashAtPickup');
  };

  return { status, shortStatus, cancelReason, forwardAction, paymentMethod, paymentStatus, paymentMethodText };
}

export const CANCEL_REASONS: CancelReason[] = ['SOLD_OUT', 'CLOSING_SOON', 'TOO_BUSY', 'OUT_OF_AREA', 'CUSTOMER_REQUEST', 'OTHER'];
