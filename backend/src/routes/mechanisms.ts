import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  transfer_mechanisms,
  transfer_flows,
  workspaces,
  workspace_members,
  legal_bases,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const mechanismCreateSchema = z.object({
  flow_id: z.string().min(1),
  legal_basis_id: z.string().nullish(),
  mechanism_type: z.enum(['adequacy', 'scc', 'bcr', 'derogation']),
  scc_agreement_id: z.string().nullish(),
  derogation_justification: z.string().nullish(),
  status: z.enum(['active', 'superseded', 'invalid']).optional().default('active'),
  effective_date: z.string().datetime().nullish(),
  expiry_date: z.string().datetime().nullish(),
})

const mechanismUpdateSchema = z.object({
  legal_basis_id: z.string().nullish(),
  mechanism_type: z.enum(['adequacy', 'scc', 'bcr', 'derogation']).optional(),
  scc_agreement_id: z.string().nullish(),
  derogation_justification: z.string().nullish(),
  status: z.enum(['active', 'superseded', 'invalid']).optional(),
  effective_date: z.string().datetime().nullish(),
  expiry_date: z.string().datetime().nullish(),
})

// Helper: caller belongs to (or created) the workspace.
async function canWriteWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId))
  if (!ws) return false
  if (ws.created_by === userId) return true
  const [m] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)))
  return !!m
}

async function canWriteMechanism(
  mech: typeof transfer_mechanisms.$inferSelect,
  userId: string,
): Promise<boolean> {
  if (mech.created_by === userId) return true
  return canWriteWorkspace(mech.workspace_id, userId)
}

// GET / — public list (filters: flow_id, workspace_id)
router.get('/', async (c) => {
  const conds = [] as any[]
  const flowId = c.req.query('flow_id')
  const workspaceId = c.req.query('workspace_id')
  if (flowId) conds.push(eq(transfer_mechanisms.flow_id, flowId))
  if (workspaceId) conds.push(eq(transfer_mechanisms.workspace_id, workspaceId))
  const rows = conds.length
    ? await db
        .select()
        .from(transfer_mechanisms)
        .where(and(...conds))
        .orderBy(desc(transfer_mechanisms.created_at))
    : await db.select().from(transfer_mechanisms).orderBy(desc(transfer_mechanisms.created_at))
  return c.json(rows)
})

// GET /:id — public single
router.get('/:id', async (c) => {
  const [m] = await db
    .select()
    .from(transfer_mechanisms)
    .where(eq(transfer_mechanisms.id, c.req.param('id')))
  if (!m) return c.json({ error: 'Not found' }, 404)
  return c.json(m)
})

// POST / — attach a mechanism to a flow
router.post('/', authMiddleware, zValidator('json', mechanismCreateSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  const [flow] = await db.select().from(transfer_flows).where(eq(transfer_flows.id, body.flow_id))
  if (!flow) return c.json({ error: 'Flow not found' }, 404)
  if (!(await canWriteWorkspace(flow.workspace_id, userId)))
    return c.json({ error: 'Forbidden' }, 403)

  if (body.legal_basis_id) {
    const [lb] = await db.select().from(legal_bases).where(eq(legal_bases.id, body.legal_basis_id))
    if (!lb) return c.json({ error: 'Legal basis not found' }, 400)
  }

  const [mech] = await db
    .insert(transfer_mechanisms)
    .values({
      workspace_id: flow.workspace_id,
      flow_id: body.flow_id,
      legal_basis_id: body.legal_basis_id ?? null,
      mechanism_type: body.mechanism_type,
      scc_agreement_id: body.scc_agreement_id ?? null,
      derogation_justification: body.derogation_justification ?? null,
      status: body.status,
      effective_date: body.effective_date ? new Date(body.effective_date) : null,
      expiry_date: body.expiry_date ? new Date(body.expiry_date) : null,
      created_by: userId,
    })
    .returning()
  return c.json(mech, 201)
})

// PUT /:id — owner/member update
router.put('/:id', authMiddleware, zValidator('json', mechanismUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db
    .select()
    .from(transfer_mechanisms)
    .where(eq(transfer_mechanisms.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await canWriteMechanism(existing, userId))) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')

  if (body.legal_basis_id) {
    const [lb] = await db.select().from(legal_bases).where(eq(legal_bases.id, body.legal_basis_id))
    if (!lb) return c.json({ error: 'Legal basis not found' }, 400)
  }

  const patch: Record<string, unknown> = { updated_at: new Date() }
  if (body.legal_basis_id !== undefined) patch.legal_basis_id = body.legal_basis_id
  if (body.mechanism_type !== undefined) patch.mechanism_type = body.mechanism_type
  if (body.scc_agreement_id !== undefined) patch.scc_agreement_id = body.scc_agreement_id
  if (body.derogation_justification !== undefined)
    patch.derogation_justification = body.derogation_justification
  if (body.status !== undefined) patch.status = body.status
  if (body.effective_date !== undefined)
    patch.effective_date = body.effective_date ? new Date(body.effective_date) : null
  if (body.expiry_date !== undefined)
    patch.expiry_date = body.expiry_date ? new Date(body.expiry_date) : null

  const [updated] = await db
    .update(transfer_mechanisms)
    .set(patch)
    .where(eq(transfer_mechanisms.id, id))
    .returning()
  return c.json(updated)
})

// DELETE /:id — remove mechanism
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db
    .select()
    .from(transfer_mechanisms)
    .where(eq(transfer_mechanisms.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await canWriteMechanism(existing, userId))) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(transfer_mechanisms).where(eq(transfer_mechanisms.id, id))
  return c.json({ success: true })
})

export default router
