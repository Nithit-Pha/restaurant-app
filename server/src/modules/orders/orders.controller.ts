import { Request, Response, NextFunction } from 'express';
import * as ordersService from './orders.service';
import { hasMinRole } from '../../middleware/requireRole';

function stripProfit<T extends object>(order: T, isSuperAdmin: boolean): T {
  if (isSuperAdmin) return order;
  const { profit: _, totalCost: __, ...rest } = order as any;
  return rest as T;
}

export async function quoteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await ordersService.quoteOrder(req.body);
    res.json(result);
  } catch (err) { next(err); }
}

export async function placeOrderHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await ordersService.placeOrder(req.user!.userId, req.body);
    res.status(201).json(order);
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
    const order = await ordersService.getOrderById(req.params.id, isStaff ? undefined : req.user?.userId);
    if (!order) { res.status(404).json({ message: 'Order not found' }); return; }
    res.json(stripProfit(order, isSuperAdmin));
  } catch (err) { next(err); }
}

export async function adminOrdersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const isSuperAdmin = hasMinRole(req.user?.role ?? '', 'SUPER_ADMIN');
    const { status } = req.query;
    const orders = await ordersService.getAllOrders(status as string | undefined);
    res.json(orders.map((o) => stripProfit(o, isSuperAdmin)));
  } catch (err) { next(err); }
}

export async function updateStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await ordersService.updateOrderStatus(req.params.id, req.body.status);
    res.json(order);
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
