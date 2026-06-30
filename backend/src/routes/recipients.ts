import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  recipients,
  subprocessors,
  transfer_flows,
  coverage_results,
  scc_agreements,
  workspace_members,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const datePre = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : new Date(v as string)),
  z.date().optional(),
)

const recipientSchema = z.object({
  workspace_id: z.string().min(1),
  legal_name: z.string().min(1),
  role: z.enum(['controller', 'processor', 'sub-processor']).optional(),
  country_id: z.string().optional(),
  group_affiliation: z.string().optional(),
  contact_email: z.string().email().optional(),
  dpf_certified: z.boolean().optional(),
  dpf_status: z.enum(['active', 'withdrawn', 'none']).optional(),
  dpf_renewal_date: datePre,
  notes: z.string().optional(),
})

// workspace_id is fixed at creation time; not editable on update.
const recipientUpdateSchema = recipientSchema.omit({ workspace_id: true }).partial()

async function isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  if (!workspaceId || !userId) return false
  const [m] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)))
  return !!m
}

// ---------------------------------------------------------------------------
// GET / — public — recipients (filter workspace_id)
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const workspaceId = c.req.query('workspace_id')
  const rows = workspaceId
    ? await db
        .select()
        .from(recipients)
        .where(eq(recipients.workspace_id, workspaceId))
        .orderBy(desc(recipients.created_at))
    : await db.select().from(recipients).orderBy(desc(recipients.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// GET /:id — public — recipient + subprocessors + coverage summary
// ---------------------------------------------------------------------------
router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [recipient] = await db.select().from(recipients).where(eq(recipients.id, id))
  if (!recipient) return c.json({ error: 'Not found' }, 404)

  const subs = await db
    .select()
    .from(subprocessors)
    .where(eq(subprocessors.recipient_id, id))
    .orderBy(desc(subprocessors.created_at))

  // Flows that route to this recipient, with their coverage result.
  const flows = await db
    .select()
    .from(transfer_flows)
    .where(eq(transfer_flows.recipient_id, id))
    .orderBy(desc(transfer_flows.created_at))

  const coverageRows = await db
    .select()
    .from(coverage_results)
    .where(eq(coverage_results.workspace_id, recipient.workspace_id))

  const coverageByFlow = new Map(coverageRows.map((r) => [r.flow_id, r]))

  const flowSummaries = flows.map((f) => ({
    id: f.id,
    name: f.name,
    coverage_state: coverageByFlow.get(f.id)?.state ?? f.coverage_state,
  }))

  const coverageSummary = {
    total_flows: flows.length,
    covered: flowSummaries.filter((f) => f.coverage_state === 'Covered').length,
    gap: flowSummaries.filter((f) => f.coverage_state === 'Gap').length,
    expiring: flowSummaries.filter((f) => f.coverage_state === 'Expiring').length,
    at_risk: flowSummaries.filter((f) => f.coverage_state === 'At-Risk').length,
    under_review: flowSummaries.filter((f) => f.coverage_state === 'Under-Review').length,
  }

  // Related SCC agreements for this recipient.
  const sccs = await db
    .select()
    .from(scc_agreements)
    .where(eq(scc_agreements.recipient_id, id))
    .orderBy(desc(scc_agreements.created_at))

  return c.json({
    ...recipient,
    subprocessors: subs,
    flows: flowSummaries,
    coverage_summary: coverageSummary,
    scc_agreements: sccs,
  })
})

// ---------------------------------------------------------------------------
// POST / — auth — create recipient
// ---------------------------------------------------------------------------
router.post('/', authMiddleware, zValidator('json', recipientSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  if (!(await isWorkspaceMember(body.workspace_id, userId)))
    return c.json({ error: 'Forbidden' }, 403)
  const [created] = await db
    .insert(recipients)
    .values({ ...body, created_by: userId })
    .returning()
  return c.json(created, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — auth(owner/member) — update (incl. DPF status)
// ---------------------------------------------------------------------------
router.put('/:id', authMiddleware, zValidator('json', recipientUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(recipients).where(eq(recipients.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await isWorkspaceMember(existing.workspace_id, userId)))
    return c.json({ error: 'Forbidden' }, 403)

  const body = c.req.valid('json')
  const [updated] = await db
    .update(recipients)
    .set({ ...body, updated_at: new Date() })
    .where(eq(recipients.id, id))
    .returning()
  return c.json(updated)
})

// ---------------------------------------------------------------------------
// DELETE /:id — auth(owner/member) — delete
// ---------------------------------------------------------------------------
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(recipients).where(eq(recipients.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await isWorkspaceMember(existing.workspace_id, userId)))
    return c.json({ error: 'Forbidden' }, 403)

  // Remove dependent sub-processors first to satisfy FK constraints.
  await db.delete(subprocessors).where(eq(subprocessors.recipient_id, id))
  await db.delete(recipients).where(eq(recipients.id, id))
  return c.json({ success: true })
})

export default router
