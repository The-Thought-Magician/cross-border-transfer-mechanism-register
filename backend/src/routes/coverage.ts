import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  coverage_results,
  transfer_flows,
  transfer_mechanisms,
  countries,
  recipients,
  scc_agreements,
  tias,
  flow_data_categories,
  data_categories,
  flow_subject_categories,
  subject_categories,
  legal_bases,
  workspace_members,
} from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
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

type CoverageState = 'Covered' | 'Gap' | 'Expiring' | 'At-Risk' | 'Under-Review'

interface EngineOutput {
  state: CoverageState
  verdict: string
  failed_conditions: string[]
  risk_score: number
}

const EXPIRY_WINDOW_DAYS = 60

// ---------------------------------------------------------------------------
// The mechanism-validity engine. Deterministic. Evaluates a single flow against
// its mechanism(s), destination adequacy, SCC signature lifecycle, and TIA
// outcome, producing a coverage state + failed conditions + a numeric risk.
// ---------------------------------------------------------------------------

async function evaluateFlow(flow: typeof transfer_flows.$inferSelect): Promise<EngineOutput> {
  const failed: string[] = []
  let risk = 0
  let expiring = false
  let atRisk = false

  const regime = flow.source_region === 'UK' ? 'uk' : 'eu'

  // Destination country + adequacy posture.
  let destAdequacy: string | undefined
  let surveillance: string | undefined
  if (flow.destination_country_id) {
    const [dest] = await db
      .select()
      .from(countries)
      .where(eq(countries.id, flow.destination_country_id))
    if (dest) {
      destAdequacy = regime === 'uk' ? dest.uk_adequacy_status : dest.eu_adequacy_status
      surveillance = dest.surveillance_risk
      if (destAdequacy === 'Invalidated') {
        atRisk = true
        failed.push('Destination adequacy decision invalidated')
        risk += 40
      } else if (destAdequacy === 'Partial') {
        risk += 10
      }
      if (surveillance === 'high') risk += 15
      else if (surveillance === 'medium') risk += 5
    }
  } else {
    failed.push('No destination country recorded')
    risk += 20
  }

  // Active mechanism(s) attached to the flow.
  const mechs = await db
    .select()
    .from(transfer_mechanisms)
    .where(eq(transfer_mechanisms.flow_id, flow.id))
  const activeMechs = mechs.filter((m) => m.status === 'active')

  if (activeMechs.length === 0) {
    failed.push('No active transfer mechanism attached')
    risk += 50
    const state: CoverageState = destAdequacy === 'Adequate' ? 'At-Risk' : 'Gap'
    return {
      state,
      verdict:
        destAdequacy === 'Adequate'
          ? 'No mechanism recorded; relying on adequacy alone — confirm and document.'
          : 'Uncovered transfer: no appropriate safeguard or adequacy in place.',
      failed_conditions: failed,
      risk_score: Math.min(100, risk),
    }
  }

  const now = Date.now()

  for (const mech of activeMechs) {
    // Expiry checks.
    if (mech.expiry_date) {
      const exp = new Date(mech.expiry_date).getTime()
      if (exp <= now) {
        failed.push(`Mechanism (${mech.mechanism_type}) expired`)
        risk += 35
        atRisk = true
      } else if (exp - now <= EXPIRY_WINDOW_DAYS * 86_400_000) {
        failed.push(`Mechanism (${mech.mechanism_type}) expires within ${EXPIRY_WINDOW_DAYS} days`)
        risk += 10
        expiring = true
      }
    }

    if (mech.mechanism_type === 'adequacy') {
      if (destAdequacy !== 'Adequate') {
        failed.push(`Adequacy mechanism but destination status is "${destAdequacy ?? 'None'}"`)
        risk += 30
        atRisk = true
      }
    } else if (mech.mechanism_type === 'scc') {
      // SCC must point to a signed, non-expired agreement.
      if (mech.scc_agreement_id) {
        const [scc] = await db
          .select()
          .from(scc_agreements)
          .where(eq(scc_agreements.id, mech.scc_agreement_id))
        if (!scc) {
          failed.push('SCC mechanism references a missing agreement')
          risk += 25
        } else {
          if (scc.signature_status !== 'signed') {
            failed.push(`SCC agreement not signed (status: ${scc.signature_status})`)
            risk += 25
          }
          if (scc.needs_repaper) {
            failed.push('SCC agreement flagged for re-papering')
            risk += 15
            expiring = true
          }
          if (scc.expiry_date && new Date(scc.expiry_date).getTime() <= now) {
            failed.push('SCC agreement expired')
            risk += 30
            atRisk = true
          }
        }
      } else {
        failed.push('SCC mechanism has no linked agreement')
        risk += 20
      }
    } else if (mech.mechanism_type === 'derogation') {
      if (!mech.derogation_justification || !mech.derogation_justification.trim()) {
        failed.push('Art.49 derogation lacks documented justification')
        risk += 20
      }
      // Derogations are exceptional; always carry residual risk.
      risk += 10
    }

    // TIA requirement: does the legal basis require a TIA?
    if (mech.legal_basis_id) {
      const [lb] = await db
        .select()
        .from(legal_bases)
        .where(eq(legal_bases.id, mech.legal_basis_id))
      if (lb?.requires_tia) {
        const flowTias = await db.select().from(tias).where(eq(tias.flow_id, flow.id))
        const approved = flowTias.find((t) => t.status === 'approved')
        if (!approved) {
          failed.push('Mechanism requires a TIA but none is approved')
          risk += 20
        } else if (approved.outcome === 'inadequate') {
          failed.push('Approved TIA concluded the transfer is inadequate')
          risk += 35
          atRisk = true
        } else if (approved.outcome === 'adequate_with_measures') {
          risk += 5
        }
      }
    }
  }

  // Sensitivity weighting from attached data/subject categories scales risk.
  const dcRows = await db
    .select({ w: data_categories.sensitivity_weight, special: data_categories.is_special })
    .from(flow_data_categories)
    .innerJoin(data_categories, eq(flow_data_categories.data_category_id, data_categories.id))
    .where(eq(flow_data_categories.flow_id, flow.id))
  const maxSensitivity = dcRows.reduce((acc, r) => Math.max(acc, r.w ?? 1), 0)
  if (dcRows.some((r) => r.special)) risk += 10
  if (maxSensitivity >= 4) risk += 8

  const scRows = await db
    .select({ w: subject_categories.risk_weight })
    .from(flow_subject_categories)
    .innerJoin(
      subject_categories,
      eq(flow_subject_categories.subject_category_id, subject_categories.id),
    )
    .where(eq(flow_subject_categories.flow_id, flow.id))
  const maxSubjectRisk = scRows.reduce((acc, r) => Math.max(acc, r.w ?? 1), 0)
  if (maxSubjectRisk >= 4) risk += 6

  // DPF posture of the recipient: a withdrawn DPF undercuts adequacy reliance.
  if (flow.recipient_id) {
    const [rec] = await db.select().from(recipients).where(eq(recipients.id, flow.recipient_id))
    if (rec?.dpf_status === 'withdrawn') {
      failed.push('Recipient DPF certification withdrawn')
      risk += 20
      atRisk = true
    }
  }

  risk = Math.min(100, risk)

  let state: CoverageState
  let verdict: string
  if (atRisk) {
    state = 'At-Risk'
    verdict = 'Mechanism present but materially compromised; remediation required.'
  } else if (failed.length > 0 && !expiring) {
    state = 'Gap'
    verdict = 'Mechanism present but one or more validity conditions are unmet.'
  } else if (expiring) {
    state = 'Expiring'
    verdict = 'Covered for now, but a safeguard is expiring or needs re-papering soon.'
  } else {
    state = 'Covered'
    verdict = 'All validity conditions satisfied for the recorded mechanism.'
  }

  return { state, verdict, failed_conditions: failed, risk_score: risk }
}

async function persistResult(
  flow: typeof transfer_flows.$inferSelect,
  out: EngineOutput,
): Promise<typeof coverage_results.$inferSelect> {
  const [row] = await db
    .insert(coverage_results)
    .values({
      workspace_id: flow.workspace_id,
      flow_id: flow.id,
      state: out.state,
      verdict: out.verdict,
      failed_conditions: out.failed_conditions,
      risk_score: out.risk_score,
      computed_at: new Date(),
    })
    .onConflictDoUpdate({
      target: coverage_results.flow_id,
      set: {
        state: out.state,
        verdict: out.verdict,
        failed_conditions: out.failed_conditions,
        risk_score: out.risk_score,
        computed_at: new Date(),
      },
    })
    .returning()

  // Keep the flow's denormalized coverage_state in sync.
  await db
    .update(transfer_flows)
    .set({ coverage_state: out.state, updated_at: new Date() })
    .where(eq(transfer_flows.id, flow.id))

  return row
}

// ---------------------------------------------------------------------------
// GET / — public: coverage results per flow (filter workspace_id, state)
// ---------------------------------------------------------------------------

router.get('/', async (c) => {
  const workspaceId = c.req.query('workspace_id')
  const state = c.req.query('state')

  const conds = []
  if (workspaceId) conds.push(eq(coverage_results.workspace_id, workspaceId))
  if (state) conds.push(eq(coverage_results.state, state))

  const rows = await db
    .select()
    .from(coverage_results)
    .where(conds.length ? and(...conds) : undefined)

  return c.json(rows)
})

// ---------------------------------------------------------------------------
// POST /recompute — auth: run validity engine for a flow or whole workspace
// ---------------------------------------------------------------------------

const recomputeSchema = z
  .object({
    flow_id: z.string().optional(),
    workspace_id: z.string().optional(),
  })
  .refine((v) => v.flow_id || v.workspace_id, {
    message: 'flow_id or workspace_id is required',
  })

router.post('/recompute', authMiddleware, zValidator('json', recomputeSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  let flows: typeof transfer_flows.$inferSelect[]

  if (body.flow_id) {
    const [flow] = await db
      .select()
      .from(transfer_flows)
      .where(eq(transfer_flows.id, body.flow_id))
    if (!flow) return c.json({ error: 'Flow not found' }, 404)
    if (!(await isWorkspaceMember(flow.workspace_id, userId))) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    flows = [flow]
  } else {
    if (!(await isWorkspaceMember(body.workspace_id!, userId))) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    flows = await db
      .select()
      .from(transfer_flows)
      .where(
        and(
          eq(transfer_flows.workspace_id, body.workspace_id!),
          eq(transfer_flows.archived, false),
        ),
      )
  }

  const results: typeof coverage_results.$inferSelect[] = []
  for (const flow of flows) {
    const out = await evaluateFlow(flow)
    results.push(await persistResult(flow, out))
  }

  return c.json(results)
})

// ---------------------------------------------------------------------------
// GET /scorecard — public: org coverage KPIs + breakdowns
// ---------------------------------------------------------------------------

router.get('/scorecard', async (c) => {
  const workspaceId = c.req.query('workspace_id')

  const conds = []
  if (workspaceId) conds.push(eq(coverage_results.workspace_id, workspaceId))

  const rows = await db
    .select()
    .from(coverage_results)
    .where(conds.length ? and(...conds) : undefined)

  const total = rows.length
  const byState: Record<string, number> = {
    Covered: 0,
    Gap: 0,
    Expiring: 0,
    'At-Risk': 0,
    'Under-Review': 0,
  }
  let riskSum = 0
  for (const r of rows) {
    byState[r.state] = (byState[r.state] ?? 0) + 1
    riskSum += r.risk_score ?? 0
  }

  const covered = byState['Covered'] ?? 0
  const coveredPct = total > 0 ? Math.round((covered / total) * 100) : 0
  const avgRisk = total > 0 ? Math.round((riskSum / total) * 10) / 10 : 0

  // Most common failed conditions across the workspace.
  const failCounts = new Map<string, number>()
  for (const r of rows) {
    for (const f of r.failed_conditions ?? []) {
      failCounts.set(f, (failCounts.get(f) ?? 0) + 1)
    }
  }
  const topFailures = [...failCounts.entries()]
    .map(([condition, count]) => ({ condition, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // Highest-risk flows.
  const topRisk = [...rows]
    .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))
    .slice(0, 10)
    .map((r) => ({
      flow_id: r.flow_id,
      state: r.state,
      risk_score: r.risk_score,
      verdict: r.verdict,
    }))

  return c.json({
    total_flows: total,
    covered,
    covered_pct: coveredPct,
    avg_risk_score: avgRisk,
    by_state: byState,
    top_failed_conditions: topFailures,
    top_risk_flows: topRisk,
  })
})

export default router
