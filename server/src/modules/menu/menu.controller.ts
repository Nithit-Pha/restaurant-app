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
    const isStaff = hasMinRole(req.user?.role ?? '', 'STAFF');
    const isSuperAdmin = hasMinRole(req.user?.role ?? '', 'SUPER_ADMIN');
    // Only staff+ may include hidden (unavailable) items; the public always
    // gets available items only.
    const availableOnly = !isStaff || available !== 'false';
    const items = await menuService.getMenuItems(category as string | undefined, availableOnly);
    res.json(items.map((i) => stripCost(i, isSuperAdmin)));
  } catch (err) { next(err); }
}

export async function getItem(req: Request, res: Response, next: NextFunction) {
  try {
    const isStaff = hasMinRole(req.user?.role ?? '', 'STAFF');
    const isSuperAdmin = hasMinRole(req.user?.role ?? '', 'SUPER_ADMIN');
    const item = await menuService.getMenuItem(req.params.id, !isStaff);
    // Hidden items are invisible to the public, same as in the list.
    if (!item || (!item.isAvailable && !isStaff)) { res.status(404).json({ message: 'Item not found' }); return; }
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
    const isSuperAdmin = hasMinRole(req.user?.role ?? '', 'SUPER_ADMIN');
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
    // Only the owner sets cost; staff-created items start at 0 ("cost missing").
    const costPrice = isSuperAdmin ? req.body.costPrice ?? 0 : 0;
    const item = await menuService.createMenuItem({ ...req.body, costPrice, imageUrl });
    audit({ actorId: req.user!.userId, action: 'CREATE', entityType: 'MENU_ITEM', entityId: item.id, metadata: { name: item.name } });
    res.status(201).json(stripCost(item, isSuperAdmin));
  } catch (err) { next(err); }
}

export async function updateItem(req: Request, res: Response, next: NextFunction) {
  try {
    const isSuperAdmin = hasMinRole(req.user?.role ?? '', 'SUPER_ADMIN');
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
    const data = imageUrl ? { ...req.body, imageUrl } : { ...req.body };
    if (!isSuperAdmin) delete data.costPrice; // staff can never change cost
    const item = await menuService.updateMenuItem(req.params.id, data);
    audit({ actorId: req.user!.userId, action: 'UPDATE', entityType: 'MENU_ITEM', entityId: item.id, metadata: { name: item.name } });
    res.json(stripCost(item, isSuperAdmin));
  } catch (err) { next(err); }
}

export async function putOptions(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await menuService.setItemOptions(req.params.id, req.body.groups);
    audit({
      actorId: req.user!.userId,
      action: 'UPDATE',
      entityType: 'MENU_ITEM',
      entityId: req.params.id,
      metadata: { options: req.body.groups.map((g: { name: string; modifiers: unknown[] }) => `${g.name} (${g.modifiers.length})`) },
    });
    res.json(stripCost(item!, hasMinRole(req.user?.role ?? '', 'SUPER_ADMIN')));
  } catch (err) { next(err); }
}

export async function patchAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await menuService.toggleAvailability(req.params.id, req.body.isAvailable);
    audit({ actorId: req.user!.userId, action: 'UPDATE', entityType: 'MENU_ITEM', entityId: item.id, metadata: { isAvailable: item.isAvailable } });
    res.json(stripCost(item, hasMinRole(req.user?.role ?? '', 'SUPER_ADMIN')));
  } catch (err) { next(err); }
}

export async function deleteItem(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await menuService.deleteMenuItem(req.params.id);
    audit({ actorId: req.user!.userId, action: 'DELETE', entityType: 'MENU_ITEM', entityId: req.params.id, metadata: { hidden: result.hidden } });
    // hidden: true -> item has past orders, so it was hidden instead of deleted.
    res.json(result);
  } catch (err) { next(err); }
}
