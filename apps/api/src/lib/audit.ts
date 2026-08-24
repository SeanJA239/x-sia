import type { Database } from '../db/client'
import { auditLog } from '../db/schema'
import { newId } from './id'

export type AuditEntry = {
  orgId: string
  actorId: string
  action: string
  targetType: string
  targetId: string
  meta?: Record<string, unknown>
}

/** 所有 admin 动作与下架等敏感操作都要落一条 audit_log。 */
export function auditLogInsert(db: Database, entry: AuditEntry) {
  return db.insert(auditLog).values({
    id: newId(),
    orgId: entry.orgId,
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    meta: entry.meta ? JSON.stringify(entry.meta) : null,
    createdAt: new Date().toISOString(),
  })
}
