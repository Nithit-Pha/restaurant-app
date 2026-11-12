import { Prisma } from '@prisma/client';
import { prisma } from '../config/db';

interface AuditEntry {
  actorId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE' | 'PAYMENT' | 'LOGIN' | 'DEACTIVATE' | 'REACTIVATE';
  entityType: 'USER' | 'MENU_ITEM' | 'ORDER' | 'EXPENSE' | 'SETTING' | 'TABLE_LAYOUT' | 'INGREDIENT' | 'SUPPLIER';
  entityId?: string;
  // Accepts any JSON-serializable snapshot (Decimals, etc.); cast at the
  // Prisma boundary below since it's stored as an opaque JSON column.
  metadata?: Record<string, unknown>;
}

/**
 * Write an audit log entry. Fire-and-forget — never throws so it never
 * blocks the primary operation if the DB write fails.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        // Prisma's nullable Json column wants JsonNull (not JS undefined) when empty.
        metadata: (entry.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });
  } catch (err) {
    console.error('[audit] Failed to write audit log:', err);
  }
}
