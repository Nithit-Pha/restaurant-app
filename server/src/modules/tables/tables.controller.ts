import { Request, Response, NextFunction } from 'express';
import * as service from './tables.service';

export async function floor(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.getFloor());
  } catch (err) { next(err); }
}

export async function createZone(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await service.createZone(req.body, req.user!.userId));
  } catch (err) { next(err); }
}

export async function updateZone(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.updateZone(req.params.id, req.body, req.user!.userId));
  } catch (err) { next(err); }
}

export async function deleteZone(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteZone(req.params.id, req.user!.userId);
    res.status(204).end();
  } catch (err) { next(err); }
}

export async function saveLayout(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.saveLayout(req.params.id, req.body, req.user!.userId));
  } catch (err) { next(err); }
}
