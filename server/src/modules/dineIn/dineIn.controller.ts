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

export async function floor(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.getFloorView());
  } catch (err) { next(err); }
}

export async function staffVisit(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.getVisitForStaff(req.params.id));
  } catch (err) { next(err); }
}

export async function seat(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await service.seatGuests(req.params.id, req.body.guests, req.user!.userId));
  } catch (err) { next(err); }
}

export async function move(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.moveVisit(req.params.id, req.body.tableId));
  } catch (err) { next(err); }
}

export async function merge(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.mergeVisits(req.params.id, req.body.intoVisitId));
  } catch (err) { next(err); }
}

export async function cleaned(req: Request, res: Response, next: NextFunction) {
  try {
    await service.markCleaned(req.params.id);
    res.status(204).end();
  } catch (err) { next(err); }
}

export async function confirm(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.confirmVisit(req.params.id, req.user!.userId, req.body.guests));
  } catch (err) { next(err); }
}
