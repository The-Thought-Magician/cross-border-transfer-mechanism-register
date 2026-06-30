import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { audit_logs, workspace_members } from '../db/schema.js'
import { eq, and, desc, type SQL } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const auditSchema = z.object({
  workspace_id: z.string().min(1),
  action: z.enum(['create', 'update', 'delete', 'state_change', 'export']),
  entity_type: z.string().min(1),
  entity_id: z.string().optional(),
  detail: z.record(z.unknown()).optional().default({}),
})

// Helper: is the user a member of the workspace?
async function isMember(workspaceId: string, userId: string): Promise<boolean> {
  const [m] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)))
  return !!m
}

// Public: append-only audit log with optional filters (entity_type, actor, action, workspace_id)
router.get('/', async (c) => {
  const workspaceId = c.req.query('workspace_id')
  const entityType = c.req.query('entity_type')
  const actor = c.req.query('actor')
  const action = c.req.query('action')

  const conditions: SQL[] = []
  if (workspaceId) conditions.push(eq(audit_logs.workspace_id, workspaceId))
  if (entityType) conditions.push(eq(audit_logs.entity_type, entityType))
  if (actor) conditions.push(eq(audit_logs.actor_user_id, actor))
  if (action) conditions.push(eq(audit_logs.action, action))

  const base = db.select().from(audit_logs)
  const rows =
    conditions.length > 0
      ? await base.where(and(...conditions)).orderBy(desc(audit_logs.created_at)).limit(500)
      : await base.orderBy(desc(audit_logs.created_at)).limit(500)

  return c.json(rows)
})

// Auth: append a log entry (append-only; no update/delete)
router.post('/', authMiddleware, zValidator('json', auditSchema), async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)
  const body = c.req.valid('json')

  // The actor must belong to the workspace they are logging against.
  if (!(await isMember(body.workspace_id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const [created] = await db
    .insert(audit_logs)
    .values({
      workspace_id: body.workspace_id,
      actor_user_id: userId,
      action: body.action,
      entity_type: body.entity_type,
      entity_id: body.entity_id,
      detail: body.detail,
    })
    .returning()
  return c.json(created, 201)
})

export default router
