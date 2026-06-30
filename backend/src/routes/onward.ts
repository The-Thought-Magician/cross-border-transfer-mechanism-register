import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  onward_transfers,
  transfer_flows,
  subprocessors,
  recipients,
  countries,
  workspace_members,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  if (!workspaceId || !userId) return false
  const [m] = await db
    .select()
    .from(workspace_members)
    .where(
      and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)),
    )
  return !!m
}

// A leg is "broken" when it has no real safeguard: no mechanism, an explicit
// 'none' mechanism, or it lands in a non-adequate third country with only an
// adequacy claim. We derive a coverage verdict deterministically.
function legVerdict(
  mechanismType: string | null,
  destAdequacy: string | undefined,
): { broken: boolean; reason: string | null } {
  if (!mechanismType || mechanismType === 'none') {
    return { broken: true, reason: 'No transfer mechanism declared for onward leg' }
  }
  if (mechanismType === 'adequacy') {
    if (destAdequacy === 'Adequate') return { broken: false, reason: null }
    return {
      broken: true,
      reason: `Adequacy claimed but destination adequacy status is "${destAdequacy ?? 'None'}"`,
    }
  }
  // scc | bcr | derogation are treated as appropriate safeguards for the leg.
  return { broken: false, reason: null }
}

const onwardSchema = z.object({
  workspace_id: z.string().min(1),
  parent_flow_id: z.string().min(1),
  subprocessor_id: z.string().optional().nullable(),
  destination_country_id: z.string().optional().nullable(),
  mechanism_type: z.enum(['adequacy', 'scc', 'bcr', 'derogation', 'none']).optional().nullable(),
  coverage_state: z
    .enum(['Covered', 'Gap', 'Expiring', 'At-Risk', 'Under-Review'])
    .optional()
    .default('Under-Review'),
  notes: z.string().optional().nullable(),
})

// ---------------------------------------------------------------------------
// GET / — public: onward transfer legs (filter parent_flow_id, workspace_id)
// ---------------------------------------------------------------------------

router.get('/', async (c) => {
  const parentFlowId = c.req.query('parent_flow_id')
  const workspaceId = c.req.query('workspace_id')

  const conds = []
  if (parentFlowId) conds.push(eq(onward_transfers.parent_flow_id, parentFlowId))
  if (workspaceId) conds.push(eq(onward_transfers.workspace_id, workspaceId))

  const rows = await db
    .select()
    .from(onward_transfers)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(onward_transfers.created_at))

  return c.json(rows)
})

// ---------------------------------------------------------------------------
// GET /chains — public: exporter -> importer -> subprocessor chains with
// broken-leg flags
// ---------------------------------------------------------------------------

router.get('/chains', async (c) => {
  const workspaceId = c.req.query('workspace_id')

  const legConds = []
  if (workspaceId) legConds.push(eq(onward_transfers.workspace_id, workspaceId))

  const legs = await db
    .select()
    .from(onward_transfers)
    .where(legConds.length ? and(...legConds) : undefined)
    .orderBy(desc(onward_transfers.created_at))

  // Reference data for resolving names/adequacy.
  const allCountries = await db.select().from(countries)
  const countryById = new Map(allCountries.map((c2) => [c2.id, c2]))
  const allSubprocessors = await db.select().from(subprocessors)
  const subById = new Map(allSubprocessors.map((s) => [s.id, s]))
  const allRecipients = await db.select().from(recipients)
  const recipientById = new Map(allRecipients.map((r) => [r.id, r]))

  // Group legs by parent flow.
  const flowIds = [...new Set(legs.map((l) => l.parent_flow_id))]
  const flowById = new Map<string, typeof transfer_flows.$inferSelect>()
  for (const fid of flowIds) {
    const [f] = await db.select().from(transfer_flows).where(eq(transfer_flows.id, fid))
    if (f) flowById.set(fid, f)
  }

  const byFlow = new Map<string, typeof onward_transfers.$inferSelect[]>()
  for (const leg of legs) {
    const arr = byFlow.get(leg.parent_flow_id) ?? []
    arr.push(leg)
    byFlow.set(leg.parent_flow_id, arr)
  }

  const chains = [...byFlow.entries()].map(([flowId, flowLegs]) => {
    const flow = flowById.get(flowId)
    const importer = flow?.recipient_id ? recipientById.get(flow.recipient_id) : undefined
    const importerCountry = flow?.destination_country_id
      ? countryById.get(flow.destination_country_id)
      : undefined

    const resolvedLegs = flowLegs.map((leg) => {
      const sub = leg.subprocessor_id ? subById.get(leg.subprocessor_id) : undefined
      const destCountry = leg.destination_country_id
        ? countryById.get(leg.destination_country_id)
        : sub?.country_id
          ? countryById.get(sub.country_id)
          : undefined
      const regime = flow?.source_region === 'UK' ? 'uk' : 'eu'
      const destAdequacy =
        regime === 'uk' ? destCountry?.uk_adequacy_status : destCountry?.eu_adequacy_status
      const v = legVerdict(leg.mechanism_type ?? null, destAdequacy)
      return {
        id: leg.id,
        subprocessor_id: leg.subprocessor_id,
        subprocessor_name: sub?.name ?? null,
        destination_country_id: destCountry?.id ?? null,
        destination_country: destCountry?.name ?? null,
        destination_adequacy: destAdequacy ?? null,
        mechanism_type: leg.mechanism_type,
        coverage_state: leg.coverage_state,
        broken: v.broken,
        broken_reason: v.reason,
      }
    })

    const brokenCount = resolvedLegs.filter((l) => l.broken).length

    return {
      parent_flow_id: flowId,
      flow_name: flow?.name ?? null,
      exporting_entity: flow?.exporting_entity ?? null,
      source_region: flow?.source_region ?? null,
      importer_name: importer?.legal_name ?? null,
      importer_country: importerCountry?.name ?? null,
      total_legs: resolvedLegs.length,
      broken_legs: brokenCount,
      chain_broken: brokenCount > 0,
      legs: resolvedLegs,
    }
  })

  // Surface broken chains first.
  chains.sort((a, b) => b.broken_legs - a.broken_legs)
  return c.json(chains)
})

// ---------------------------------------------------------------------------
// POST / — auth: create onward leg
// ---------------------------------------------------------------------------

router.post('/', authMiddleware, zValidator('json', onwardSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  if (!(await isWorkspaceMember(body.workspace_id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  // Validate the parent flow belongs to the same workspace.
  const [flow] = await db
    .select()
    .from(transfer_flows)
    .where(eq(transfer_flows.id, body.parent_flow_id))
  if (!flow) return c.json({ error: 'Parent flow not found' }, 404)
  if (flow.workspace_id !== body.workspace_id) {
    return c.json({ error: 'Parent flow belongs to a different workspace' }, 400)
  }

  // Auto-derive coverage_state from the leg verdict when not explicitly Covered.
  let coverageState = body.coverage_state ?? 'Under-Review'
  if (body.destination_country_id) {
    const [dest] = await db
      .select()
      .from(countries)
      .where(eq(countries.id, body.destination_country_id))
    const regime = flow.source_region === 'UK' ? 'uk' : 'eu'
    const destAdequacy = regime === 'uk' ? dest?.uk_adequacy_status : dest?.eu_adequacy_status
    const v = legVerdict(body.mechanism_type ?? null, destAdequacy)
    if (coverageState === 'Under-Review') coverageState = v.broken ? 'Gap' : 'Covered'
  }

  const [created] = await db
    .insert(onward_transfers)
    .values({
      workspace_id: body.workspace_id,
      parent_flow_id: body.parent_flow_id,
      subprocessor_id: body.subprocessor_id ?? null,
      destination_country_id: body.destination_country_id ?? null,
      mechanism_type: body.mechanism_type ?? null,
      coverage_state: coverageState,
      notes: body.notes ?? null,
      created_by: userId,
    })
    .returning()

  return c.json(created, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — auth(member): update
// ---------------------------------------------------------------------------

router.put('/:id', authMiddleware, zValidator('json', onwardSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [existing] = await db.select().from(onward_transfers).where(eq(onward_transfers.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await isWorkspaceMember(existing.workspace_id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const patch: Record<string, unknown> = {}
  if (body.subprocessor_id !== undefined) patch.subprocessor_id = body.subprocessor_id
  if (body.destination_country_id !== undefined)
    patch.destination_country_id = body.destination_country_id
  if (body.mechanism_type !== undefined) patch.mechanism_type = body.mechanism_type
  if (body.coverage_state !== undefined) patch.coverage_state = body.coverage_state
  if (body.notes !== undefined) patch.notes = body.notes

  if (Object.keys(patch).length === 0) return c.json(existing)

  const [updated] = await db
    .update(onward_transfers)
    .set(patch)
    .where(eq(onward_transfers.id, id))
    .returning()

  return c.json(updated)
})

// ---------------------------------------------------------------------------
// DELETE /:id — auth(member): delete
// ---------------------------------------------------------------------------

router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')

  const [existing] = await db.select().from(onward_transfers).where(eq(onward_transfers.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await isWorkspaceMember(existing.workspace_id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  await db.delete(onward_transfers).where(eq(onward_transfers.id, id))
  return c.json({ success: true })
})

export default router
