import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { supplementary_measures, workspace_members } from '../db/schema.js'
import { eq, and, asc, isNull, or } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const measureSchema = z.object({
  workspace_id: z.string().min(1).optional(),
  name: z.string().min(1),
  measure_type: z.enum(['technical', 'contractual', 'organizational']),
  effectiveness: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  description: z.string().optional(),
})

// Helper: is the user a member of the workspace?
async function isMember(workspaceId: string, userId: string): Promise<boolean> {
  const [m] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)))
  return !!m
}

// Public: supplementary-measures catalog (global + optional workspace filter)
router.get('/', async (c) => {
  const workspaceId = c.req.query('workspace_id')
  let rows
  if (workspaceId) {
    // Global (null workspace_id) plus the requested workspace's measures.
    rows = await db
      .select()
      .from(supplementary_measures)
      .where(or(isNull(supplementary_measures.workspace_id), eq(supplementary_measures.workspace_id, workspaceId)))
      .orderBy(asc(supplementary_measures.measure_type), asc(supplementary_measures.name))
  } else {
    rows = await db
      .select()
      .from(supplementary_measures)
      .orderBy(asc(supplementary_measures.measure_type), asc(supplementary_measures.name))
  }
  return c.json(rows)
})

// Auth: create a supplementary measure
router.post('/', authMiddleware, zValidator('json', measureSchema), async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)
  const body = c.req.valid('json')

  // If scoped to a workspace, the caller must belong to it.
  if (body.workspace_id) {
    if (!(await isMember(body.workspace_id, userId))) {
      return c.json({ error: 'Forbidden' }, 403)
    }
  }

  const [created] = await db
    .insert(supplementary_measures)
    .values({
      workspace_id: body.workspace_id ?? null,
      name: body.name,
      measure_type: body.measure_type,
      effectiveness: body.effectiveness,
      description: body.description,
    })
    .returning()
  return c.json(created, 201)
})

// Auth(owner/workspace member): update a measure
router.put('/:id', authMiddleware, zValidator('json', measureSchema.partial()), async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)
  const id = c.req.param('id')

  const [existing] = await db.select().from(supplementary_measures).where(eq(supplementary_measures.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)

  // Global (null workspace) measures are protected from edits; workspace measures
  // require membership of that workspace.
  if (!existing.workspace_id) {
    return c.json({ error: 'Global catalog entries cannot be modified' }, 403)
  }
  if (!(await isMember(existing.workspace_id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const body = c.req.valid('json')
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.measure_type !== undefined) updates.measure_type = body.measure_type
  if (body.effectiveness !== undefined) updates.effectiveness = body.effectiveness
  if (body.description !== undefined) updates.description = body.description

  if (Object.keys(updates).length === 0) return c.json(existing)

  const [updated] = await db
    .update(supplementary_measures)
    .set(updates)
    .where(eq(supplementary_measures.id, id))
    .returning()
  return c.json(updated)
})

// Auth(owner/workspace member): delete a measure
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)
  const id = c.req.param('id')

  const [existing] = await db.select().from(supplementary_measures).where(eq(supplementary_measures.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)

  if (!existing.workspace_id) {
    return c.json({ error: 'Global catalog entries cannot be deleted' }, 403)
  }
  if (!(await isMember(existing.workspace_id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  await db.delete(supplementary_measures).where(eq(supplementary_measures.id, id))
  return c.json({ success: true })
})

export default router
