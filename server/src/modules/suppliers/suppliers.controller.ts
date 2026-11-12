import { Request, Response, NextFunction } from 'express';
import * as service from './suppliers.service';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.listSuppliers(req.query.all === 'true'));
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await service.createSupplier(req.body, req.user!.userId));
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.updateSupplier(req.params.id, req.body, req.user!.userId));
  } catch (err) { next(err); }
}

export async function setIngredients(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.setSupplierIngredients(req.params.id, req.body.ingredientIds, req.user!.userId));
  } catch (err) { next(err); }
}
