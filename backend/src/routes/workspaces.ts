import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { workspaces, workspace_members } from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const workspaceCreateSchema = z.object({
  name: z.string().min(1),
  default_regime: z.enum(['EU', 'UK']).optional().default('EU'),
  exporting_entities: z.array(z.string()).optional().default([]),
  tia_review_months: z.number().int().positive().optional().default(12),
})

const workspaceUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  default_regime: z.enum(['EU', 'UK']).optional(),
  exporting_entities: z.array(z.string()).optional(),
  tia_review_months: z.number().int().positive().optional(),
})

const inviteSchema = z.object({
  user_id: z.string().min(1),
  role: z.enum(['owner', 'member']).optional().default('member'),
})

// Helper: is the user the workspace owner (creator OR owner-role member)?
async function isOwner(workspaceId: string, userId: string): Promise<boolean> {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId))
  if (!ws) return false
  if (ws.created_by === userId) return true
  const [m] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)))
  return !!m && m.role === 'owner'
}

// GET /mine — workspaces the authed user belongs to (member or creator)
router.get('/mine', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const memberships = await db
    .select()
    .from(workspace_members)
    .where(eq(workspace_members.user_id, userId))
  const ids = memberships.map((m) => m.workspace_id)
  // Also include workspaces created by the user even if no membership row.
  const created = await db.select().from(workspaces).where(eq(workspaces.created_by, userId))
  const createdIds = new Set(created.map((w) => w.id))
  const extraIds = ids.filter((id) => !createdIds.has(id))
  let memberWorkspaces: typeof created = []
  if (extraIds.length > 0) {
    memberWorkspaces = await db.select().from(workspaces).where(inArray(workspaces.id, extraIds))
  }
  const all = [...created, ...memberWorkspaces].sort(
    (a, b) => b.created_at.getTime() - a.created_at.getTime(),
  )
  return c.json(all)
})

// GET /:id — public single workspace
router.get('/:id', async (c) => {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, c.req.param('id')))
  if (!ws) return c.json({ error: 'Not found' }, 404)
  return c.json(ws)
})

// POST / — create workspace + owner membership for the creator
router.post('/', authMiddleware, zValidator('json', workspaceCreateSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [ws] = await db
    .insert(workspaces)
    .values({
      name: body.name,
      default_regime: body.default_regime,
      exporting_entities: body.exporting_entities,
      tia_review_months: body.tia_review_months,
      created_by: userId,
    })
    .returning()
  await db
    .insert(workspace_members)
    .values({ workspace_id: ws.id, user_id: userId, role: 'owner' })
    .onConflictDoNothing()
  return c.json(ws, 201)
})

// PUT /:id — owner-only profile update
router.put('/:id', authMiddleware, zValidator('json', workspaceUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(workspaces).where(eq(workspaces.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await isOwner(id, userId))) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(workspaces)
    .set({ ...body, updated_at: new Date() })
    .where(eq(workspaces.id, id))
    .returning()
  return c.json(updated)
})

// POST /:id/invite — owner-only add member by user_id
router.post('/:id/invite', authMiddleware, zValidator('json', inviteSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(workspaces).where(eq(workspaces.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await isOwner(id, userId))) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [member] = await db
    .insert(workspace_members)
    .values({ workspace_id: id, user_id: body.user_id, role: body.role })
    .onConflictDoUpdate({
      target: [workspace_members.workspace_id, workspace_members.user_id],
      set: { role: body.role },
    })
    .returning()
  return c.json(member, 201)
})

// GET /:id/members — authed members list (caller must belong to the workspace)
router.get('/:id/members', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(workspaces).where(eq(workspaces.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const [membership] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, id), eq(workspace_members.user_id, userId)))
  if (!membership && existing.created_by !== userId) return c.json({ error: 'Forbidden' }, 403)
  const members = await db
    .select()
    .from(workspace_members)
    .where(eq(workspace_members.workspace_id, id))
    .orderBy(desc(workspace_members.created_at))
  return c.json(members)
})

export default router
