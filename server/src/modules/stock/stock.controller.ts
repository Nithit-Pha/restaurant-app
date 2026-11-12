import { Request, Response, NextFunction } from 'express';
import * as service from './stock.service';

const actor = (req: Request) => ({ userId: req.user!.userId, role: req.user!.role });

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.listIngredients(req.query.all === 'true'));
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await service.createIngredient(req.body, req.user!.userId));
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.updateIngredient(req.params.id, req.body, req.user!.userId));
  } catch (err) { next(err); }
}

export async function stockIn(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await service.stockIn(req.params.id, req.body, actor(req)));
  } catch (err) { next(err); }
}

export async function count(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await service.countStock(req.params.id, req.body, actor(req)));
  } catch (err) { next(err); }
}

export async function waste(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await service.wasteStock(req.params.id, req.body, actor(req)));
  } catch (err) { next(err); }
}

export async function recipe(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.getRecipe(req.params.menuItemId));
  } catch (err) { next(err); }
}

export async function saveRecipe(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.setRecipe(req.params.menuItemId, req.body.items, req.user!.userId));
  } catch (err) { next(err); }
}

export async function movements(req: Request, res: Response, next: NextFunction) {
  try {
    const ingredientId = typeof req.query.ingredientId === 'string' ? req.query.ingredientId : undefined;
    const limit = req.query.limit ? Number(req.query.limit) || undefined : undefined;
    res.json(await service.listMovements({ ingredientId, limit }));
  } catch (err) { next(err); }
}
