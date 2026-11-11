import { Request, Response, NextFunction } from 'express';
import * as service from './addresses.service';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.listAddresses(req.user!.userId));
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await service.createAddress(req.user!.userId, req.body));
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.updateAddress(req.user!.userId, req.params.id, req.body));
  } catch (err) { next(err); }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteAddress(req.user!.userId, req.params.id);
    res.status(204).end();
  } catch (err) { next(err); }
}
