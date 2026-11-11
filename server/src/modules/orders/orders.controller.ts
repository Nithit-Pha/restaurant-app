import { Request, Response, NextFunction } from 'express';
import * as ordersService from './orders.service';
import { hasMinRole } from '../../middleware/requireRole';
import { audit } from '../../utils/auditLog';

// Cost and profit data is for Super Admins only. Removes order-level
// profit/totalCost and per-line unitCost for everyone else.
function stripProfit<T extends object>(order: T, isSuperAdmin: boolean): T {
  if (isSuperAdmin) return order;
  const { profit: _, totalCost: __, ...rest } = order as any;
  if (Array.isArray(rest.items)) {
    rest.items = rest.items.map(({ unitCost: _c, ...item }: any) => item);
  }
  return rest as T;
}

export async function quoteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const isSuperAdmin = hasMinRole(req.user?.role ?? '', 'SUPER_ADMIN');
    const result = await ordersService.quoteOrder(req.body);
    res.json(stripProfit(result, isSuperAdmin));
  } catch (err) { next(err); }
}

export async function placeOrderHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const isSuperAdmin = hasMinRole(req.user?.role ?? '', 'SUPER_ADMIN');
    const { order, created } = await ordersService.placeOrder(req.user!.userId, req.body);
    // 200 = a retry with the same idempotency key; the original order is returned.
    res.status(created ? 201 : 200).json(stripProfit(order, isSuperAdmin));
  } catch (err) { next(err); }
}

export async function myOrdersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const isSuperAdmin = hasMinRole(req.user?.role ?? '', 'SUPER_ADMIN');
    const orders = await ordersService.getUserOrders(req.user!.userId);
    res.json(orders.map((o) => stripProfit(o, isSuperAdmin)));
  } catch (err) { next(err); }
}

export async function getOrderHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const isStaff = hasMinRole(req.user?.role ?? '', 'STAFF');
    const isSuperAdmin = hasMinRole(req.user?.role ?? '', 'SUPER_ADMIN');
    const order = await ordersService.getOrderById(req.params.id, isStaff ? undefined : req.user?.userId, isStaff);
    if (!order) { res.status(404).json({ message: 'Order not found' }); return; }
    res.json(stripProfit(order, isSuperAdmin));
  } catch (err) { next(err); }
}

export async function adminOrdersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const isSuperAdmin = hasMinRole(req.user?.role ?? '', 'SUPER_ADMIN');
    const { status, date, limit } = req.query as Record<string, string | undefined>;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ message: 'date must be YYYY-MM-DD' });
      return;
    }
    const orders = await ordersService.getAllOrders({
      status: status || undefined,
      date: date || undefined,
      limit: limit ? Number(limit) || undefined : undefined,
    });
    res.json(orders.map((o) => stripProfit(o, isSuperAdmin)));
  } catch (err) { next(err); }
}

export async function updateStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, prepMinutes, cancelReason, cancelNote } = req.body;
    const { from, order } = await ordersService.changeOrderStatus(req.params.id, {
      to: status,
      actorId: req.user!.userId,
      prepMinutes,
      cancelReason,
      cancelNote,
    });
    audit({
      actorId: req.user!.userId,
      action: 'STATUS_CHANGE',
      entityType: 'ORDER',
      entityId: order.id,
      metadata: { from, to: status, ...(prepMinutes ? { prepMinutes } : {}), ...(cancelReason ? { cancelReason } : {}) },
    });
    res.json(stripProfit(order, hasMinRole(req.user?.role ?? '', 'SUPER_ADMIN')));
  } catch (err) { next(err); }
}

export async function cancelMyOrderHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { order } = await ordersService.cancelByCustomer(req.params.id, req.user!.userId, req.body?.note);
    audit({
      actorId: req.user!.userId,
      action: 'STATUS_CHANGE',
      entityType: 'ORDER',
      entityId: order.id,
      metadata: { from: 'PENDING', to: 'CANCELLED', cancelReason: 'CUSTOMER_REQUEST' },
    });
    res.json(stripProfit(order, hasMinRole(req.user?.role ?? '', 'SUPER_ADMIN')));
  } catch (err) { next(err); }
}

// ---- Payments ---------------------------------------------------------
export async function promptPayQrHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const isStaff = hasMinRole(req.user?.role ?? '', 'STAFF');
    res.json(await ordersService.getPromptPayQr(req.params.id, isStaff ? undefined : req.user!.userId));
  } catch (err) { next(err); }
}

/** Customer: "I've transferred" for their own PromptPay order. */
export async function paymentSentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to, order } = await ordersService.changePayment(req.params.id, 'CUSTOMER_SENT', {
      actorId: req.user!.userId,
      customerId: req.user!.userId,
    });
    audit({ actorId: req.user!.userId, action: 'PAYMENT', entityType: 'ORDER', entityId: order.id, metadata: { from, to } });
    res.json(stripProfit(order, hasMinRole(req.user?.role ?? '', 'SUPER_ADMIN')));
  } catch (err) { next(err); }
}

/** Staff: the money is in (cash collected, or the transfer seen in the bank app). */
export async function markPaidHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { providerRef, note } = req.body;
    const { from, to, order } = await ordersService.changePayment(req.params.id, 'MARK_PAID', {
      actorId: req.user!.userId,
      providerRef,
      note,
    });
    audit({ actorId: req.user!.userId, action: 'PAYMENT', entityType: 'ORDER', entityId: order.id, metadata: { from, to, ...(providerRef ? { providerRef } : {}) } });
    res.json(stripProfit(order, hasMinRole(req.user?.role ?? '', 'SUPER_ADMIN')));
  } catch (err) { next(err); }
}

/** Owner: the money was given back. */
export async function refundHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to, order } = await ordersService.changePayment(req.params.id, 'REFUND', {
      actorId: req.user!.userId,
      note: req.body?.note,
    });
    audit({ actorId: req.user!.userId, action: 'PAYMENT', entityType: 'ORDER', entityId: order.id, metadata: { from, to } });
    res.json(stripProfit(order, true));
  } catch (err) { next(err); }
}

export async function profitReportHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = req.query;
    const result = await ordersService.getProfitReport(
      from ? new Date(from as string) : undefined,
      to ? new Date(to as string) : undefined
    );
    res.json(result);
  } catch (err) { next(err); }
}
