import { Request, Response, NextFunction } from 'express';
import * as menuService from './menu.service';
import { hasMinRole } from '../../middleware/requireRole';
import { audit } from '../../utils/auditLog';

function stripCost<T extends { costPrice?: unknown }>(item: T, isSuperAdmin: boolean): T {
  if (isSuperAdmin) return item;
  const { costPrice: _, ...rest } = item as any;
  return rest as T;
}

export async function listItems(req: Request, res: Response, next: NextFunction) {
  try {
    const { category, available } = req.query;
    const availableOnly = available !== 'false';
    const isSuperAdmin = hasMinRole(req.user?.role ?? '', 'SUPER_ADMIN');
    const items = await menuService.getMenuItems(category as string | undefined, availableOnly);
    res.json(items.map((i) => stripCost(i, isSuperAdmin)));
  } catch (err) { next(err); }
}

export async function getItem(req: Request, res: Response, next: NextFunction) {
  try {
    const isSuperAdmin = hasMinRole(req.user?.role ?? '', 'SUPER_ADMIN');
    const item = await menuService.getMenuItem(req.params.id);
    if (!item) { res.status(404).json({ message: 'Item not found' }); return; }
    res.json(stripCost(item, isSuperAdmin));
  } catch (err) { next(err); }
}

export async function listCategories(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await menuService.getCategories());
  } catch (err) { next(err); }
}

export async function createItem(req: Request, res: Response, next: NextFunction) {
  try {
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
    const item = await menuService.createMenuItem({ ...req.body, imageUrl });
    audit({ actorId: req.user!.userId, action: 'CREATE', entityType: 'MENU_ITEM', entityId: item.id, metadata: { name: item.name } });
    res.status(201).json(item);
  } catch (err) { next(err); }
}

export async function updateItem(req: Request, res: Response, next: NextFunction) {
  try {
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
    const data = imageUrl ? { ...req.body, imageUrl } : req.body;
    const item = await menuService.updateMenuItem(req.params.id, data);
    audit({ actorId: req.user!.userId, action: 'UPDATE', entityType: 'MENU_ITEM', entityId: item.id, metadata: { name: item.name } });
    res.json(item);
  } catch (err) { next(err); }
}

export async function patchAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await menuService.toggleAvailability(req.params.id, req.body.isAvailable);
    audit({ actorId: req.user!.userId, action: 'UPDATE', entityType: 'MENU_ITEM', entityId: item.id, metadata: { isAvailable: item.isAvailable } });
    res.json(item);
  } catch (err) { next(err); }
}

export async function deleteItem(req: Request, res: Response, next: NextFunction) {
  try {
    await menuService.deleteMenuItem(req.params.id);
    audit({ actorId: req.user!.userId, action: 'DELETE', entityType: 'MENU_ITEM', entityId: req.params.id });
    res.status(204).send();
  } catch (err) { next(err); }
}
