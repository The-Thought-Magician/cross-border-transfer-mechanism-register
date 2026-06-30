import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { reviews, workspaces, workspace_members, audit_logs } from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// True if the user is the workspace creator or a member.
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

async function log(workspaceId: string, userId: string, action: string, entityId: string, detail: Record<string, unknown>) {
  try {
    await db.insert(audit_logs).values({
      workspace_id: workspaceId,
      actor_user_id: userId,
      action,
      entity_type: 'review',
      entity_id: entityId,
      detail,
    })
  } catch {
    // audit logging is best-effort; never block the request
  }
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const createSchema = z.object({
  workspace_id: z.string().min(1),
  entity_type: z.enum(['tia', 'scc', 'flow']),
  entity_id: z.string().min(1),
  reviewer_user_id: z.string().optional(),
  comment: z.string().optional(),
  status: z.enum(['draft', 'in-review', 'approved', 'rejected']).optional(),
})

const decideSchema = z.object({
  status: z.enum(['draft', 'in-review', 'approved', 'rejected']),
  comment: z.string().optional(),
  reviewer_user_id: z.string().optional(),
})

// ---------------------------------------------------------------------------
// GET / — public — review queue (filters: workspace_id, entity_type, status)
// ---------------------------------------------------------------------------

router.get('/', async (c) => {
  const workspaceId = c.req.query('workspace_id')
  const entityType = c.req.query('entity_type')
  const status = c.req.query('status')

  const conditions = []
  if (workspaceId) conditions.push(eq(reviews.workspace_id, workspaceId))
  if (entityType) conditions.push(eq(reviews.entity_type, entityType))
  if (status) conditions.push(eq(reviews.status, status))

  const rows = conditions.length
    ? await db.select().from(reviews).where(and(...conditions)).orderBy(desc(reviews.created_at))
    : await db.select().from(reviews).orderBy(desc(reviews.created_at))

  return c.json(rows)
})

// ---------------------------------------------------------------------------
// GET /:id — public — one review
// ---------------------------------------------------------------------------

router.get('/:id', async (c) => {
  const [row] = await db.select().from(reviews).where(eq(reviews.id, c.req.param('id')))
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(row)
})

// ---------------------------------------------------------------------------
// POST / — auth — open a review
// ---------------------------------------------------------------------------

router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  if (!(await isWorkspaceMember(body.workspace_id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const [created] = await db
    .insert(reviews)
    .values({
      workspace_id: body.workspace_id,
      entity_type: body.entity_type,
      entity_id: body.entity_id,
      status: body.status ?? 'in-review',
      reviewer_user_id: body.reviewer_user_id ?? null,
      comment: body.comment ?? null,
      created_by: userId,
    })
    .returning()

  await log(body.workspace_id, userId, 'create', created.id, {
    entity_type: body.entity_type,
    entity_id: body.entity_id,
    status: created.status,
  })

  return c.json(created, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — auth(owner/member) — decide approve/reject
// ---------------------------------------------------------------------------

router.put('/:id', authMiddleware, zValidator('json', decideSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [existing] = await db.select().from(reviews).where(eq(reviews.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await isWorkspaceMember(existing.workspace_id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const decided = body.status === 'approved' || body.status === 'rejected'

  const [updated] = await db
    .update(reviews)
    .set({
      status: body.status,
      comment: body.comment ?? existing.comment,
      reviewer_user_id: body.reviewer_user_id ?? existing.reviewer_user_id,
      decided_by: decided ? userId : existing.decided_by,
      decided_at: decided ? new Date() : existing.decided_at,
    })
    .where(eq(reviews.id, id))
    .returning()

  await log(existing.workspace_id, userId, 'state_change', id, {
    from: existing.status,
    to: body.status,
  })

  return c.json(updated)
})

export default router
