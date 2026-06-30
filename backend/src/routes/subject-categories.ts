import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { subject_categories, workspaces, workspace_members, audit_logs } from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  if (!workspaceId || !userId) return false
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId))
  if (!ws) return false
  if (ws.created_by === userId) return true
  const [member] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)))
  return !!member
}

async function log(workspaceId: string | null, userId: string, action: string, entityId: string, detail: Record<string, unknown>) {
  if (!workspaceId) return
  try {
    await db.insert(audit_logs).values({
      workspace_id: workspaceId,
      actor_user_id: userId,
      action,
      entity_type: 'subject_category',
      entity_id: entityId,
      detail,
    })
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const createSchema = z.object({
  workspace_id: z.string().optional(), // null/absent = global/seeded catalog row
  name: z.string().min(1),
  risk_weight: z.number().int().min(1).max(5).optional(),
  description: z.string().optional(),
})

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  risk_weight: z.number().int().min(1).max(5).optional(),
  description: z.string().optional(),
})

// ---------------------------------------------------------------------------
// GET / — public — catalog (global + workspace)
// ---------------------------------------------------------------------------

router.get('/', async (c) => {
  const workspaceId = c.req.query('workspace_id')
  const globalOnly = c.req.query('global') === 'true'

  let rows
  if (globalOnly) {
    rows = await db
      .select()
      .from(subject_categories)
      .where(isNull(subject_categories.workspace_id))
      .orderBy(desc(subject_categories.risk_weight))
  } else if (workspaceId) {
    const all = await db.select().from(subject_categories).orderBy(desc(subject_categories.risk_weight))
    rows = all.filter((r) => r.workspace_id === null || r.workspace_id === workspaceId)
  } else {
    rows = await db.select().from(subject_categories).orderBy(desc(subject_categories.risk_weight))
  }

  return c.json(rows)
})

// ---------------------------------------------------------------------------
// POST / — auth — create
// ---------------------------------------------------------------------------

router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  if (body.workspace_id && !(await isWorkspaceMember(body.workspace_id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const [created] = await db
    .insert(subject_categories)
    .values({
      workspace_id: body.workspace_id ?? null,
      name: body.name,
      risk_weight: body.risk_weight ?? 1,
      description: body.description ?? null,
    })
    .returning()

  await log(created.workspace_id, userId, 'create', created.id, { name: created.name })

  return c.json(created, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — auth(owner) — update
// ---------------------------------------------------------------------------

router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')

  const [existing] = await db.select().from(subject_categories).where(eq(subject_categories.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)

  if (!existing.workspace_id) return c.json({ error: 'Cannot modify global catalog entry' }, 403)
  if (!(await isWorkspaceMember(existing.workspace_id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const body = c.req.valid('json')
  const [updated] = await db
    .update(subject_categories)
    .set({
      name: body.name ?? existing.name,
      risk_weight: body.risk_weight ?? existing.risk_weight,
      description: body.description ?? existing.description,
    })
    .where(eq(subject_categories.id, id))
    .returning()

  await log(existing.workspace_id, userId, 'update', id, { name: updated.name })

  return c.json(updated)
})

// ---------------------------------------------------------------------------
// DELETE /:id — auth(owner) — delete
// ---------------------------------------------------------------------------

router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')

  const [existing] = await db.select().from(subject_categories).where(eq(subject_categories.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)

  if (!existing.workspace_id) return c.json({ error: 'Cannot delete global catalog entry' }, 403)
  if (!(await isWorkspaceMember(existing.workspace_id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  await db.delete(subject_categories).where(eq(subject_categories.id, id))
  await log(existing.workspace_id, userId, 'delete', id, { name: existing.name })

  return c.json({ success: true })
})

export default router
