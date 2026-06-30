import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  scc_agreements,
  workspace_members,
  audit_logs,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  if (!workspaceId || !userId) return false
  const [m] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)))
  return !!m
}

async function logAudit(
  workspaceId: string,
  actorUserId: string,
  action: string,
  entityId: string,
  detail: Record<string, unknown> = {},
) {
  try {
    await db.insert(audit_logs).values({
      workspace_id: workspaceId,
      actor_user_id: actorUserId,
      action,
      entity_type: 'scc',
      entity_id: entityId,
      detail,
    })
  } catch {
    // audit logging is best-effort
  }
}

// Derives the effective lifecycle status of an SCC agreement, treating any
// past-expiry agreement as expired regardless of its stored signature_status.
function effectiveStatus(scc: typeof scc_agreements.$inferSelect): 'signed' | 'pending' | 'expired' {
  const now = Date.now()
  if (scc.expiry_date && new Date(scc.expiry_date).getTime() < now) return 'expired'
  if (scc.signature_status === 'expired') return 'expired'
  if (scc.signature_status === 'signed') return 'signed'
  return 'pending'
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const createSchema = z.object({
  workspace_id: z.string().min(1),
  recipient_id: z.string().min(1).optional().nullable(),
  clause_version: z.enum(['eu_2021', 'uk_idta', 'uk_addendum', 'legacy_2010']).optional(),
  module: z.number().int().min(1).max(4).optional().nullable(),
  parties: z.array(z.string()).optional(),
  docking_parties: z.array(z.string()).optional(),
  signature_status: z.enum(['signed', 'pending', 'expired']).optional(),
  signed_date: z.string().datetime().optional().nullable(),
  effective_date: z.string().datetime().optional().nullable(),
  expiry_date: z.string().datetime().optional().nullable(),
  needs_repaper: z.boolean().optional(),
  notes: z.string().optional().nullable(),
})

const updateSchema = z.object({
  recipient_id: z.string().min(1).optional().nullable(),
  clause_version: z.enum(['eu_2021', 'uk_idta', 'uk_addendum', 'legacy_2010']).optional(),
  module: z.number().int().min(1).max(4).optional().nullable(),
  parties: z.array(z.string()).optional(),
  docking_parties: z.array(z.string()).optional(),
  signature_status: z.enum(['signed', 'pending', 'expired']).optional(),
  signed_date: z.string().datetime().optional().nullable(),
  effective_date: z.string().datetime().optional().nullable(),
  expiry_date: z.string().datetime().optional().nullable(),
  needs_repaper: z.boolean().optional(),
  notes: z.string().optional().nullable(),
})

function toDate(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  return new Date(v)
}

// ---------------------------------------------------------------------------
// GET / — public list (filters: workspace_id, signature_status)
// ---------------------------------------------------------------------------

router.get('/', async (c) => {
  const workspaceId = c.req.query('workspace_id')
  const signatureStatus = c.req.query('signature_status')

  const conditions = []
  if (workspaceId) conditions.push(eq(scc_agreements.workspace_id, workspaceId))
  if (signatureStatus) conditions.push(eq(scc_agreements.signature_status, signatureStatus))

  const rows = conditions.length
    ? await db
        .select()
        .from(scc_agreements)
        .where(and(...conditions))
        .orderBy(desc(scc_agreements.created_at))
    : await db.select().from(scc_agreements).orderBy(desc(scc_agreements.created_at))

  return c.json(rows.map((r) => ({ ...r, effective_status: effectiveStatus(r) })))
})

// ---------------------------------------------------------------------------
// GET /tracker — public counts + repaper list (declared BEFORE /:id)
// ---------------------------------------------------------------------------

router.get('/tracker', async (c) => {
  const workspaceId = c.req.query('workspace_id')

  const rows = workspaceId
    ? await db.select().from(scc_agreements).where(eq(scc_agreements.workspace_id, workspaceId))
    : await db.select().from(scc_agreements)

  const now = Date.now()
  const soonMs = 60 * 24 * 60 * 60 * 1000 // 60 days

  let signed = 0
  let pending = 0
  let expired = 0
  const repaper: typeof rows = []
  const expiringSoon: typeof rows = []

  for (const r of rows) {
    const st = effectiveStatus(r)
    if (st === 'signed') signed++
    else if (st === 'pending') pending++
    else expired++

    if (r.needs_repaper || r.clause_version === 'legacy_2010') repaper.push(r)
    if (
      r.expiry_date &&
      st !== 'expired' &&
      new Date(r.expiry_date).getTime() - now <= soonMs &&
      new Date(r.expiry_date).getTime() >= now
    ) {
      expiringSoon.push(r)
    }
  }

  return c.json({
    total: rows.length,
    signed,
    pending,
    expired,
    repaper: repaper.map((r) => ({ ...r, effective_status: effectiveStatus(r) })),
    expiring_soon: expiringSoon.map((r) => ({ ...r, effective_status: effectiveStatus(r) })),
  })
})

// ---------------------------------------------------------------------------
// GET /:id — public single
// ---------------------------------------------------------------------------

router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [scc] = await db.select().from(scc_agreements).where(eq(scc_agreements.id, id))
  if (!scc) return c.json({ error: 'Not found' }, 404)
  return c.json({ ...scc, effective_status: effectiveStatus(scc) })
})

// ---------------------------------------------------------------------------
// POST / — auth, create agreement
// ---------------------------------------------------------------------------

router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  if (!(await isWorkspaceMember(body.workspace_id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const [scc] = await db
    .insert(scc_agreements)
    .values({
      workspace_id: body.workspace_id,
      recipient_id: body.recipient_id ?? null,
      clause_version: body.clause_version ?? 'eu_2021',
      module: body.module ?? null,
      parties: body.parties ?? [],
      docking_parties: body.docking_parties ?? [],
      signature_status: body.signature_status ?? 'pending',
      signed_date: toDate(body.signed_date) ?? null,
      effective_date: toDate(body.effective_date) ?? null,
      expiry_date: toDate(body.expiry_date) ?? null,
      needs_repaper: body.needs_repaper ?? false,
      notes: body.notes ?? null,
      created_by: userId,
    })
    .returning()

  await logAudit(scc.workspace_id, userId, 'create', scc.id, { clause_version: scc.clause_version })
  return c.json({ ...scc, effective_status: effectiveStatus(scc) }, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — auth(member), update (sign, expiry, repaper)
// ---------------------------------------------------------------------------

router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [existing] = await db.select().from(scc_agreements).where(eq(scc_agreements.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await isWorkspaceMember(existing.workspace_id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const patch: Partial<typeof scc_agreements.$inferInsert> = { updated_at: new Date() }
  if (body.recipient_id !== undefined) patch.recipient_id = body.recipient_id
  if (body.clause_version !== undefined) patch.clause_version = body.clause_version
  if (body.module !== undefined) patch.module = body.module
  if (body.parties !== undefined) patch.parties = body.parties
  if (body.docking_parties !== undefined) patch.docking_parties = body.docking_parties
  if (body.signature_status !== undefined) patch.signature_status = body.signature_status
  if (body.signed_date !== undefined) patch.signed_date = toDate(body.signed_date)
  if (body.effective_date !== undefined) patch.effective_date = toDate(body.effective_date)
  if (body.expiry_date !== undefined) patch.expiry_date = toDate(body.expiry_date)
  if (body.needs_repaper !== undefined) patch.needs_repaper = body.needs_repaper
  if (body.notes !== undefined) patch.notes = body.notes

  // If marked signed but no signed_date supplied, stamp it now.
  if (body.signature_status === 'signed' && body.signed_date === undefined && !existing.signed_date) {
    patch.signed_date = new Date()
  }

  const [updated] = await db
    .update(scc_agreements)
    .set(patch)
    .where(eq(scc_agreements.id, id))
    .returning()

  await logAudit(updated.workspace_id, userId, 'update', updated.id, {
    signature_status: updated.signature_status,
    needs_repaper: updated.needs_repaper,
  })
  return c.json({ ...updated, effective_status: effectiveStatus(updated) })
})

// ---------------------------------------------------------------------------
// DELETE /:id — auth(member)
// ---------------------------------------------------------------------------

router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')

  const [existing] = await db.select().from(scc_agreements).where(eq(scc_agreements.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await isWorkspaceMember(existing.workspace_id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  await db.delete(scc_agreements).where(eq(scc_agreements.id, id))
  await logAudit(existing.workspace_id, userId, 'delete', id, {})
  return c.json({ success: true })
})

export default router
