import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  adequacy_events,
  countries,
  transfer_flows,
  coverage_results,
  country_subscriptions,
  notifications,
  audit_logs,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// A new adequacy status that no longer guarantees protection re-flags any flow
// depending on that country as At-Risk.
const RISKY_STATUSES = new Set(['None', 'Invalidated', 'Partial'])

async function logAudit(
  workspaceId: string,
  actorUserId: string | null,
  action: string,
  entityId: string,
  detail: Record<string, unknown> = {},
) {
  try {
    await db.insert(audit_logs).values({
      workspace_id: workspaceId,
      actor_user_id: actorUserId,
      action,
      entity_type: 'adequacy_event',
      entity_id: entityId,
      detail,
    })
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const createEventSchema = z.object({
  country_id: z.string().min(1),
  regime: z.enum(['EU', 'UK']).optional(),
  new_status: z.enum(['Adequate', 'Partial', 'None', 'Invalidated']),
  old_status: z.string().optional().nullable(),
  decision_ref: z.string().optional().nullable(),
  effective_date: z.string().datetime().optional().nullable(),
  description: z.string().optional().nullable(),
})

// ---------------------------------------------------------------------------
// GET /events — public, adequacy change events (filter country_id)
// ---------------------------------------------------------------------------

router.get('/events', async (c) => {
  const countryId = c.req.query('country_id')
  const rows = countryId
    ? await db
        .select()
        .from(adequacy_events)
        .where(eq(adequacy_events.country_id, countryId))
        .orderBy(desc(adequacy_events.created_at))
    : await db.select().from(adequacy_events).orderBy(desc(adequacy_events.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// POST /events — auth, record adequacy change; re-flag dependent flows
// At-Risk + notify subscribers, and update the country's stored status.
// ---------------------------------------------------------------------------

router.post('/events', authMiddleware, zValidator('json', createEventSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const regime = body.regime ?? 'EU'

  const [country] = await db.select().from(countries).where(eq(countries.id, body.country_id))
  if (!country) return c.json({ error: 'Country not found' }, 404)

  const oldStatus =
    body.old_status ??
    (regime === 'UK' ? country.uk_adequacy_status : country.eu_adequacy_status)
  const effectiveDate = body.effective_date ? new Date(body.effective_date) : null

  // 1. Record the adequacy event.
  const [event] = await db
    .insert(adequacy_events)
    .values({
      country_id: body.country_id,
      regime,
      old_status: oldStatus ?? null,
      new_status: body.new_status,
      decision_ref: body.decision_ref ?? null,
      effective_date: effectiveDate,
      description: body.description ?? null,
      created_by: userId,
    })
    .returning()

  // 2. Update the country's stored adequacy status for the affected regime.
  const countryPatch: Partial<typeof countries.$inferInsert> = { updated_at: new Date() }
  if (regime === 'UK') {
    countryPatch.uk_adequacy_status = body.new_status
    if (body.decision_ref !== undefined) countryPatch.uk_decision_ref = body.decision_ref ?? null
  } else {
    countryPatch.eu_adequacy_status = body.new_status
    if (body.decision_ref !== undefined) countryPatch.eu_decision_ref = body.decision_ref ?? null
  }
  if (effectiveDate) countryPatch.effective_date = effectiveDate
  await db.update(countries).set(countryPatch).where(eq(countries.id, body.country_id))

  // 3. If the new status is risky, re-flag dependent (non-archived) flows As At-Risk.
  const flaggedFlows: string[] = []
  const affectedWorkspaces = new Set<string>()
  const becameRisky = RISKY_STATUSES.has(body.new_status)
  if (becameRisky) {
    const dependentFlows = await db
      .select()
      .from(transfer_flows)
      .where(eq(transfer_flows.destination_country_id, body.country_id))

    for (const flow of dependentFlows) {
      if (flow.archived) continue
      affectedWorkspaces.add(flow.workspace_id)
      await db
        .update(transfer_flows)
        .set({ coverage_state: 'At-Risk', updated_at: new Date() })
        .where(eq(transfer_flows.id, flow.id))

      // Mirror onto coverage_results (unique per flow) via upsert.
      await db
        .insert(coverage_results)
        .values({
          workspace_id: flow.workspace_id,
          flow_id: flow.id,
          state: 'At-Risk',
          verdict: `Destination ${country.name} adequacy changed to ${body.new_status} (${regime})`,
          failed_conditions: ['adequacy_revoked'],
          risk_score: 8,
          computed_at: new Date(),
        })
        .onConflictDoUpdate({
          target: coverage_results.flow_id,
          set: {
            state: 'At-Risk',
            verdict: `Destination ${country.name} adequacy changed to ${body.new_status} (${regime})`,
            failed_conditions: ['adequacy_revoked'],
            risk_score: 8,
            computed_at: new Date(),
          },
        })

      flaggedFlows.push(flow.id)
    }
  }

  // 4. Notify country subscribers.
  const subs = await db
    .select()
    .from(country_subscriptions)
    .where(eq(country_subscriptions.country_id, body.country_id))
  if (subs.length) {
    await db.insert(notifications).values(
      subs.map((s) => ({
        workspace_id: s.workspace_id,
        user_id: s.user_id,
        category: 'adequacy_change',
        title: `${country.name}: ${regime} adequacy now ${body.new_status}`,
        body: body.description ?? `Status changed from ${oldStatus ?? 'unknown'} to ${body.new_status}.`,
        entity_type: 'adequacy_event',
        entity_id: event.id,
        read: false,
      })),
    )
    for (const s of subs) affectedWorkspaces.add(s.workspace_id)
  }

  // 5. Audit-log the change once per affected workspace (audit_logs is
  // workspace-scoped; adequacy events affect every workspace with a dependent
  // flow or a subscriber).
  for (const ws of affectedWorkspaces) {
    await logAudit(ws, userId, 'state_change', event.id, {
      new_status: body.new_status,
      regime,
      flagged_flows: flaggedFlows.length,
    })
  }

  return c.json(
    {
      event,
      flagged_flows: flaggedFlows,
      flagged_count: flaggedFlows.length,
      notified: subs.length,
    },
    201,
  )
})

// ---------------------------------------------------------------------------
// GET /exposure — public, flows-by-adequacy-status exposure summary
// ---------------------------------------------------------------------------

router.get('/exposure', async (c) => {
  const workspaceId = c.req.query('workspace_id')
  const regime = c.req.query('regime') === 'UK' ? 'UK' : 'EU'

  const flows = workspaceId
    ? await db
        .select()
        .from(transfer_flows)
        .where(and(eq(transfer_flows.workspace_id, workspaceId), eq(transfer_flows.archived, false)))
    : await db.select().from(transfer_flows).where(eq(transfer_flows.archived, false))

  // Load referenced countries in one shot.
  const countryIds = [
    ...new Set(flows.map((f) => f.destination_country_id).filter((x): x is string => !!x)),
  ]
  const countryRows = countryIds.length
    ? await db.select().from(countries).where(inArray(countries.id, countryIds))
    : []
  const countryById = new Map(countryRows.map((r) => [r.id, r]))

  // Bucket flows by the destination country's adequacy status for the regime.
  const byStatus: Record<string, number> = {
    Adequate: 0,
    Partial: 0,
    None: 0,
    Invalidated: 0,
    Unknown: 0,
  }
  const byCountry: Record<
    string,
    { country_id: string; name: string; iso_code: string; status: string; flow_count: number }
  > = {}

  let atRiskFlows = 0
  for (const f of flows) {
    const country = f.destination_country_id ? countryById.get(f.destination_country_id) : undefined
    const status = country
      ? regime === 'UK'
        ? country.uk_adequacy_status
        : country.eu_adequacy_status
      : 'Unknown'
    byStatus[status] = (byStatus[status] ?? 0) + 1
    if (RISKY_STATUSES.has(status) || status === 'Unknown') atRiskFlows++

    if (country) {
      const key = country.id
      if (!byCountry[key]) {
        byCountry[key] = {
          country_id: country.id,
          name: country.name,
          iso_code: country.iso_code,
          status,
          flow_count: 0,
        }
      }
      byCountry[key].flow_count++
    }
  }

  return c.json({
    regime,
    total_flows: flows.length,
    by_status: byStatus,
    at_risk_flows: atRiskFlows,
    adequate_flows: byStatus.Adequate ?? 0,
    by_country: Object.values(byCountry).sort((a, b) => b.flow_count - a.flow_count),
  })
})

export default router
