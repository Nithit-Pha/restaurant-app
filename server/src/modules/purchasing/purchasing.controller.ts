import { Request, Response, NextFunction } from 'express';
import type { PurchaseOrderStatus } from '@prisma/client';
import * as service from './purchasing.service';
import * as receiving from './receiving.service';

const STATUSES: PurchaseOrderStatus[] = ['DRAFT', 'SENT', 'PARTLY_RECEIVED', 'RECEIVED', 'CANCELLED'];

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const wanted = typeof req.query.status === 'string' ? req.query.status.split(',') : [];
    res.json(await service.listPurchaseOrders(wanted.filter((s): s is PurchaseOrderStatus => (STATUSES as string[]).includes(s))));
  } catch (err) { next(err); }
}

export async function get(req: Request, res: Response, next: NextFunction) {
  try { res.json(await service.getPurchaseOrder(req.params.id)); } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await service.createPurchaseOrder(req.body, req.user!.userId)); } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try { res.json(await service.updatePurchaseOrder(req.params.id, req.body, req.user!.userId)); } catch (err) { next(err); }
}

export async function send(req: Request, res: Response, next: NextFunction) {
  try { res.json(await service.sendPurchaseOrder(req.params.id, req.user!.userId)); } catch (err) { next(err); }
}

export async function cancel(req: Request, res: Response, next: NextFunction) {
  try { res.json(await service.cancelPurchaseOrder(req.params.id, req.user!.userId)); } catch (err) { next(err); }
}

// ---- Step 3d: deliveries

export async function receive(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await receiving.receiveDelivery(req.params.id, req.body, { userId: req.user!.userId, role: req.user!.role })); } catch (err) { next(err); }
}

export async function prices(req: Request, res: Response, next: NextFunction) {
  try { res.json(await receiving.setDeliveryPrices(req.params.id, req.params.deliveryId, req.body, req.user!.userId)); } catch (err) { next(err); }
}

export async function complete(req: Request, res: Response, next: NextFunction) {
  try { res.json(await receiving.completeOrder(req.params.id, req.user!.userId)); } catch (err) { next(err); }
}
