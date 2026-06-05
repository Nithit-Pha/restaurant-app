import { prisma } from '../config/db';

interface AuditEntry {
  actorId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE' | 'LOGIN';
  entityType: 'USER' | 'MENU_ITEM' | 'ORDER' | 'EXPENSE' | 'SETTING';
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Write an audit log entry. Fire-and-forget — never throws so it never
 * blocks the primary operation if the DB write fails.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({ data: entry });
  } catch (err) {
    console.error('[audit] Failed to write audit log:', err);
  }
}
