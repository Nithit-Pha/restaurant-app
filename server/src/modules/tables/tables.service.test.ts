import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    floorZone: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    diningTable: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  auditMock: vi.fn(),
}));

vi.mock('../../config/db', () => ({ prisma: prismaMock }));
vi.mock('../../utils/auditLog', () => ({ audit: auditMock }));

import { createZone, deleteZone, newQrToken, saveLayout, updateZone } from './tables.service';
import { MAX_ZONES, type TableInput } from './layout';

const T1_ID = '11111111-1111-4111-8111-111111111111';
const T2_ID = '22222222-2222-4222-8222-222222222222';
const table = (over: Partial<TableInput> = {}): TableInput => ({
  label: 'T1', shape: 'SQUARE', seats: 4, x: 1, y: 1, width: 2, height: 2, rotation: 0, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockResolvedValue([]);
  prismaMock.diningTable.findMany.mockResolvedValue([]);
  // The ops passed to $transaction are built by these calls; tag them so tests can read them back.
  prismaMock.diningTable.deleteMany.mockImplementation((a: unknown) => ({ op: 'deleteMany', a }));
  prismaMock.diningTable.update.mockImplementation((a: unknown) => ({ op: 'update', a }));
  prismaMock.diningTable.create.mockImplementation((a: unknown) => ({ op: 'create', a }));
  prismaMock.floorZone.update.mockImplementation((a: unknown) => ({ op: 'zoneUpdate', a }));
});

describe('zones', () => {
  it('adds a zone at the end of the list and writes the audit log', async () => {
    prismaMock.floorZone.count.mockResolvedValue(1);
    prismaMock.floorZone.findFirst.mockResolvedValue({ sortOrder: 0 });
    prismaMock.floorZone.create.mockImplementation(async ({ data }: any) => ({ id: 'z-2', ...data, tables: [] }));
    const zone = await createZone({ name: ' Terrace ', width: 16, height: 10 }, 'owner-1');
    expect(zone).toMatchObject({ name: 'Terrace', sortOrder: 1 });
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entityType: 'TABLE_LAYOUT', entityId: 'z-2' }));
  });

  it(`refuses more than ${MAX_ZONES} zones (409)`, async () => {
    prismaMock.floorZone.count.mockResolvedValue(MAX_ZONES);
    await expect(createZone({ name: 'Extra', width: 10, height: 10 }, 'owner-1')).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.floorZone.create).not.toHaveBeenCalled();
  });

  it('will not shrink a zone so that a table ends up outside (409)', async () => {
    prismaMock.floorZone.findUnique.mockResolvedValue({
      id: 'z-1', name: 'Indoor', width: 12, height: 10, decor: [], tables: [table({ x: 9 })],
    });
    await expect(updateZone('z-1', { width: 10 }, 'owner-1')).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.floorZone.update).not.toHaveBeenCalled();
  });

  it('renames a zone without checking the tables again', async () => {
    prismaMock.floorZone.findUnique
      .mockResolvedValueOnce({ id: 'z-1', name: 'Indoor', width: 12, height: 10, decor: [], tables: [table({ x: 9 })] })
      .mockResolvedValueOnce({ id: 'z-1', name: 'Main room', tables: [] });
    prismaMock.floorZone.update.mockResolvedValue({});
    await updateZone('z-1', { name: 'Main room' }, 'owner-1');
    expect(prismaMock.floorZone.update).toHaveBeenCalledWith({ where: { id: 'z-1' }, data: { name: 'Main room', width: 12, height: 10 } });
  });

  it('deletes a zone (404 when it does not exist)', async () => {
    prismaMock.floorZone.findUnique.mockResolvedValue(null);
    await expect(deleteZone('nope', 'owner-1')).rejects.toMatchObject({ statusCode: 404 });
    prismaMock.floorZone.findUnique.mockResolvedValue({ id: 'z-1', name: 'Indoor', _count: { tables: 3 } });
    await deleteZone('z-1', 'owner-1');
    expect(prismaMock.floorZone.delete).toHaveBeenCalledWith({ where: { id: 'z-1' } });
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE', metadata: { zone: 'Indoor', tables: 3 } }));
  });
});

describe('saving a layout', () => {
  const zoneRow = (tableIds: string[]) => ({ id: 'z-1', name: 'Indoor', width: 12, height: 10, tables: tableIds.map((id) => ({ id })) });

  it('updates kept tables, adds new ones with a QR secret, removes the rest, replaces decor', async () => {
    prismaMock.floorZone.findUnique
      .mockResolvedValueOnce(zoneRow([T1_ID, T2_ID]))
      .mockResolvedValueOnce({ id: 'z-1', tables: [] }); // reloaded result

    await saveLayout('z-1', {
      tables: [table({ id: T1_ID, label: ' T1 ' }), table({ label: 'T3', x: 5 })],
      decor: [{ type: 'BAR', x: 0, y: 9, width: 6, height: 1, rotation: 0 }],
    }, 'owner-1');

    const ops = prismaMock.$transaction.mock.calls[0][0] as { op: string; a: any }[];
    expect(ops.map((o) => o.op)).toEqual(['deleteMany', 'update', 'create', 'zoneUpdate']);
    expect(ops[0].a).toEqual({ where: { id: { in: [T2_ID] } } });
    expect(ops[1].a).toMatchObject({ where: { id: T1_ID }, data: { label: 'T1' } });
    expect(ops[2].a.data).toMatchObject({ label: 'T3', zoneId: 'z-1' });
    expect(ops[2].a.data.qrToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(ops[3].a).toEqual({ where: { id: 'z-1' }, data: { decor: [{ type: 'BAR', x: 0, y: 9, width: 6, height: 1, rotation: 0 }] } });
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'UPDATE', metadata: expect.objectContaining({ tables: 2, added: 1, removed: 1 }),
    }));
  });

  it('refuses a layout that breaks the rules, with the first problem as the message (400)', async () => {
    prismaMock.floorZone.findUnique.mockResolvedValue(zoneRow([]));
    await expect(saveLayout('z-1', { tables: [table({ x: 11 })], decor: [] }, 'owner-1'))
      .rejects.toMatchObject({ statusCode: 400, message: 'Table T1 is outside the zone.' });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a table id that belongs to another zone (400)', async () => {
    prismaMock.floorZone.findUnique.mockResolvedValue(zoneRow([T1_ID]));
    await expect(saveLayout('z-1', { tables: [table({ id: T2_ID })], decor: [] }, 'owner-1'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses a name already used in another zone, ignoring case (409)', async () => {
    prismaMock.floorZone.findUnique.mockResolvedValue(zoneRow([]));
    prismaMock.diningTable.findMany.mockResolvedValue([{ label: 'T1', zone: { name: 'Terrace' } }]);
    await expect(saveLayout('z-1', { tables: [table({ label: 't1' })], decor: [] }, 'owner-1'))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('Terrace') });
    expect(prismaMock.diningTable.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true, zoneId: { not: 'z-1' } } }));
  });

  it('makes a different QR secret every time', () => {
    const tokens = new Set(Array.from({ length: 50 }, newQrToken));
    expect(tokens.size).toBe(50);
  });
});
