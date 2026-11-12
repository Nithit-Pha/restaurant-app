import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db';
import { audit } from '../../utils/auditLog';
import { publish } from '../../utils/events';
import {
  checkLayout, labelKey, MAX_ZONES, type DecorInput, type TableInput,
} from './layout';

const httpError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

/** Random, URL-safe secret for a table's QR link (128 bits). */
export const newQrToken = () => randomBytes(16).toString('base64url');

// What the floor plan returns. The QR secret is never part of it: printing QR
// codes gets its own Super Admin endpoint (Step 1b).
const tableSelect = {
  id: true, zoneId: true, label: true, shape: true, seats: true,
  x: true, y: true, width: true, height: true, rotation: true, status: true,
} satisfies Prisma.DiningTableSelect;

const zoneInclude = {
  tables: { where: { isActive: true }, select: tableSelect, orderBy: { label: 'asc' } },
} satisfies Prisma.FloorZoneInclude;

/** Every active table with its QR secret, for printing the QR codes (Super Admin). */
export async function listQrCodes() {
  const zones = await prisma.floorZone.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true, name: true,
      tables: { where: { isActive: true }, orderBy: { label: 'asc' }, select: { id: true, label: true, seats: true, qrToken: true } },
    },
  });
  return zones.filter((z) => z.tables.length > 0);
}

/** A new QR secret for a table: the old sticker stops working (lost, damaged or copied). */
export async function regenerateQr(tableId: string, actorId: string) {
  const table = await prisma.diningTable.findUnique({ where: { id: tableId }, select: { label: true, zoneId: true } });
  if (!table) throw httpError(404, 'Table not found');
  const updated = await prisma.diningTable.update({
    where: { id: tableId },
    data: { qrToken: newQrToken() },
    select: { id: true, label: true, seats: true, qrToken: true },
  });
  await audit({ actorId, action: 'UPDATE', entityType: 'TABLE_LAYOUT', entityId: table.zoneId, metadata: { table: table.label, qrCode: 'renewed' } });
  return updated;
}

export interface ZoneInput {
  name: string;
  width: number;
  height: number;
}

export interface LayoutInput {
  tables: TableInput[];
  decor: DecorInput[];
}

/** All zones with their active tables, in the owner's order. */
export function getFloor() {
  return prisma.floorZone.findMany({ include: zoneInclude, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
}

async function getZone(id: string) {
  const zone = await prisma.floorZone.findUnique({ where: { id }, include: zoneInclude });
  if (!zone) throw httpError(404, 'Zone not found');
  return zone;
}

export async function createZone(input: ZoneInput, actorId: string) {
  const count = await prisma.floorZone.count();
  if (count >= MAX_ZONES) throw httpError(409, `You can have up to ${MAX_ZONES} zones.`);
  const last = await prisma.floorZone.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  const zone = await prisma.floorZone.create({
    data: { name: input.name.trim(), width: input.width, height: input.height, sortOrder: (last?.sortOrder ?? -1) + 1 },
    include: zoneInclude,
  });
  await audit({ actorId, action: 'CREATE', entityType: 'TABLE_LAYOUT', entityId: zone.id, metadata: { zone: zone.name, width: zone.width, height: zone.height } });
  return zone;
}

/** Rename or resize a zone. A smaller zone must still hold every table and decor item. */
export async function updateZone(id: string, input: Partial<ZoneInput>, actorId: string) {
  const zone = await prisma.floorZone.findUnique({ where: { id }, include: { tables: { where: { isActive: true } } } });
  if (!zone) throw httpError(404, 'Zone not found');
  const width = input.width ?? zone.width;
  const height = input.height ?? zone.height;
  if (width !== zone.width || height !== zone.height) {
    const outside = checkLayout({ width, height }, zone.tables as TableInput[], (zone.decor ?? []) as unknown as DecorInput[])
      .filter((p) => p.code === 'OUTSIDE');
    if (outside.length) {
      throw httpError(409, `The zone is too small for its tables: ${outside[0].message} Move them first.`);
    }
  }
  const data = { ...(input.name !== undefined ? { name: input.name.trim() } : {}), width, height };
  await prisma.floorZone.update({ where: { id }, data });
  await audit({ actorId, action: 'UPDATE', entityType: 'TABLE_LAYOUT', entityId: id, metadata: { zone: data.name ?? zone.name, width, height } });
  return getZone(id);
}

/** Labels of these tables that have guests right now (an open visit). */
async function tablesWithGuests(tableIds: string[]) {
  if (!tableIds.length) return [];
  const open = await prisma.tableSession.findMany({
    where: { tableId: { in: tableIds }, closedAt: null },
    select: { tableLabel: true },
  });
  return open.map((v) => v.tableLabel);
}

/**
 * Removes the zone and its tables. Past visits keep the table and zone names
 * (copied when the visit started), so history stays readable.
 */
export async function deleteZone(id: string, actorId: string) {
  const zone = await prisma.floorZone.findUnique({ where: { id }, include: { tables: { select: { id: true } } } });
  if (!zone) throw httpError(404, 'Zone not found');
  const busy = await tablesWithGuests(zone.tables.map((t) => t.id));
  if (busy.length) throw httpError(409, `${busy.join(', ')} still ${busy.length === 1 ? 'has' : 'have'} guests. Close their bill first.`);
  await prisma.floorZone.delete({ where: { id } });
  await audit({ actorId, action: 'DELETE', entityType: 'TABLE_LAYOUT', entityId: id, metadata: { zone: zone.name, tables: zone.tables.length } });
}

const tableData = (t: TableInput) => ({
  label: t.label.trim().replace(/\s+/g, ' '),
  shape: t.shape,
  seats: t.seats,
  x: t.x,
  y: t.y,
  width: t.width,
  height: t.height,
  rotation: t.rotation,
});

const decorData = (d: DecorInput) => ({ type: d.type, x: d.x, y: d.y, width: d.width, height: d.height, rotation: d.rotation });

/**
 * Save a zone's whole layout at once, as drawn in the editor:
 * tables with an id are updated, tables without one are added (with a new QR
 * secret), and tables no longer in the list are removed. Decor is replaced.
 */
export async function saveLayout(zoneId: string, input: LayoutInput, actorId: string) {
  const zone = await prisma.floorZone.findUnique({ where: { id: zoneId }, include: { tables: { where: { isActive: true }, select: { id: true } } } });
  if (!zone) throw httpError(404, 'Zone not found');

  const problems = checkLayout(zone, input.tables, input.decor);
  if (problems.length) throw httpError(400, problems[0].message);

  const existing = new Set(zone.tables.map((t) => t.id));
  const unknown = input.tables.find((t) => t.id && !existing.has(t.id));
  if (unknown) throw httpError(400, `Table ${unknown.label} is not in this zone. Reload the page and try again.`);

  // Labels are unique across the whole restaurant (they are printed on the QR codes).
  const others = await prisma.diningTable.findMany({
    where: { isActive: true, zoneId: { not: zoneId } },
    select: { label: true, zone: { select: { name: true } } },
  });
  const taken = new Map(others.map((o) => [labelKey(o.label), o.zone.name]));
  const clash = input.tables.find((t) => taken.has(labelKey(t.label)));
  if (clash) throw httpError(409, `${clash.label.trim()} is already used in ${taken.get(labelKey(clash.label))}. Give the table another name.`);

  const kept = new Set(input.tables.filter((t) => t.id).map((t) => t.id as string));
  const removed = zone.tables.filter((t) => !kept.has(t.id)).map((t) => t.id);
  const added = input.tables.filter((t) => !t.id);

  const busy = await tablesWithGuests(removed);
  if (busy.length) throw httpError(409, `${busy.join(', ')} still ${busy.length === 1 ? 'has' : 'have'} guests. Close their bill before removing it.`);

  // Past visits of removed tables keep their copied names (TableSession.tableLabel).
  await prisma.$transaction([
    prisma.diningTable.deleteMany({ where: { id: { in: removed } } }),
    ...input.tables
      .filter((t) => t.id)
      .map((t) => prisma.diningTable.update({ where: { id: t.id }, data: tableData(t) })),
    ...added.map((t) => prisma.diningTable.create({ data: { ...tableData(t), zoneId, qrToken: newQrToken() } })),
    prisma.floorZone.update({ where: { id: zoneId }, data: { decor: input.decor.map(decorData) } }),
  ]);

  await audit({
    actorId, action: 'UPDATE', entityType: 'TABLE_LAYOUT', entityId: zoneId,
    metadata: { zone: zone.name, tables: input.tables.length, added: added.length, removed: removed.length, decor: input.decor.length },
  });
  publish({ type: 'floor' });
  return getZone(zoneId);
}
