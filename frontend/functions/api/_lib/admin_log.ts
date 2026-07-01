import { uuid } from './crypto'

export async function logAdminAction(
  db: D1Database,
  adminId: string,
  action: string,
  targetType?: string,
  targetId?: string,
  details?: string,
): Promise<void> {
  const id = uuid()
  const now = new Date().toISOString()
  await db.prepare(
    `INSERT INTO admin_logs (id, admin_id, action, target_type, target_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, adminId, action, targetType || null, targetId || null, details || null, now).run()
}
