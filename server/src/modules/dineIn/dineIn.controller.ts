import { Request, Response, NextFunction } from 'express';
import * as service from './dineIn.service';

// Dine-in guests send their visit key in this header (no account, no cookie).
const visitKey = (req: Request) => req.header('x-visit-key') ?? undefined;

export async function table(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.getTableForGuest(req.params.qrToken));
  } catch (err) { next(err); }
}

export async function join(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.joinVisit(req.params.qrToken));
  } catch (err) { next(err); }
}

export async function order(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.placeTableOrder(req.params.qrToken, visitKey(req), req.body);
    res.status(result.created ? 201 : 200).json(result);
  } catch (err) { next(err); }
}

export async function visit(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(service.visitSummary(await service.getVisitByKey(visitKey(req))));
  } catch (err) { next(err); }
}

export async function callStaff(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.guestRequest(visitKey(req), 'CALL_STAFF'));
  } catch (err) { next(err); }
}

export async function requestBill(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.guestRequest(visitKey(req), 'REQUEST_BILL'));
  } catch (err) { next(err); }
}

export async function confirm(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.confirmVisit(req.params.id, req.user!.userId, req.body.guests));
  } catch (err) { next(err); }
}
