import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  saved_reports,
  workspace_members,
  transfer_flows,
  transfer_mechanisms,
  tias,
  remediation_tasks,
  coverage_results,
  countries,
  recipients,
  scc_agreements,
  audit_logs,
} from '../db/schema.js'
import { and, desc, eq } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const REPORT_TYPES = [
  'gaps_by_country',
  'expiring',
  'tia_completion',
  'adequacy_exposure',
  'audit_pack',
] as const

const reportSchema = z.object({
  workspace_id: z.string().min(1),
  name: z.string().min(1),
  report_type: z.enum(REPORT_TYPES),
  config: z.record(z.string(), z.unknown()).optional().default({}),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function isMember(workspaceId: string, userId: string): Promise<boolean> {
  const [m] = await db
    .select()
    .from(workspace_members)
    .where(
      and(
        eq(workspace_members.workspace_id, workspaceId),
        eq(workspace_members.user_id, userId),
      ),
    )
  return !!m
}

// Builds the full cross-border register export for a workspace: the flow
// register joined with its mechanism, coverage verdict, destination country,
// recipient, plus SCC agreements, TIAs and open remediation gaps.
async function buildAuditPack(workspaceId: string) {
  const flows = await db
    .select()
    .from(transfer_flows)
    .where(eq(transfer_flows.workspace_id, workspaceId))
    .orderBy(desc(transfer_flows.created_at))

  const mechanisms = await db
    .select()
    .from(transfer_mechanisms)
    .where(eq(transfer_mechanisms.workspace_id, workspaceId))

  const coverage = await db
    .select()
    .from(coverage_results)
    .where(eq(coverage_results.workspace_id, workspaceId))

  const tiaRows = await db
    .select()
    .from(tias)
    .where(eq(tias.workspace_id, workspaceId))

  const sccs = await db
    .select()
    .from(scc_agreements)
    .where(eq(scc_agreements.workspace_id, workspaceId))

  const tasks = await db
    .select()
    .from(remediation_tasks)
    .where(eq(remediation_tasks.workspace_id, workspaceId))

  const countryRows = await db.select().from(countries)
  const recipientRows = await db
    .select()
    .from(recipients)
    .where(eq(recipients.workspace_id, workspaceId))

  const countryById = new Map(countryRows.map((x) => [x.id, x]))
  const recipientById = new Map(recipientRows.map((x) => [x.id, x]))
  const mechByFlow = new Map<string, typeof mechanisms>()
  for (const m of mechanisms) {
    const list = mechByFlow.get(m.flow_id) ?? []
    list.push(m)
    mechByFlow.set(m.flow_id, list)
  }
  const coverageByFlow = new Map(coverage.map((x) => [x.flow_id, x]))

  const flowEntries = flows.map((f) => {
    const dest = f.destination_country_id ? countryById.get(f.destination_country_id) ?? null : null
    const rec = f.recipient_id ? recipientById.get(f.recipient_id) ?? null : null
    return {
      flow: f,
      destination_country: dest,
      recipient: rec,
      mechanisms: mechByFlow.get(f.id) ?? [],
      coverage: coverageByFlow.get(f.id) ?? null,
    }
  })

  const openGaps = tasks.filter((t) => t.status !== 'done')

  return {
    generated_at: new Date().toISOString(),
    workspace_id: workspaceId,
    counts: {
      flows: flows.length,
      mechanisms: mechanisms.length,
      tias: tiaRows.length,
      scc_agreements: sccs.length,
      open_gaps: openGaps.length,
    },
    flows: flowEntries,
    scc_agreements: sccs,
    tias: tiaRows,
    gaps: openGaps,
  }
}

// Produces the snapshot payload for a saved report based on its type.
async function buildSnapshot(reportType: string, workspaceId: string): Promise<Record<string, unknown>> {
  if (reportType === 'audit_pack') {
    return (await buildAuditPack(workspaceId)) as unknown as Record<string, unknown>
  }

  if (reportType === 'gaps_by_country') {
    const flows = await db
      .select()
      .from(transfer_flows)
      .where(eq(transfer_flows.workspace_id, workspaceId))
    const countryRows = await db.select().from(countries)
    const countryById = new Map(countryRows.map((x) => [x.id, x]))
    const byCountry = new Map<string, { country: string; iso: string; total: number; gaps: number }>()
    for (const f of flows) {
      const ctry = f.destination_country_id ? countryById.get(f.destination_country_id) : null
      const key = ctry?.id ?? 'unknown'
      const bucket =
        byCountry.get(key) ??
        { country: ctry?.name ?? 'Unknown', iso: ctry?.iso_code ?? '??', total: 0, gaps: 0 }
      bucket.total += 1
      if (f.coverage_state === 'Gap' || f.coverage_state === 'At-Risk') bucket.gaps += 1
      byCountry.set(key, bucket)
    }
    return {
      generated_at: new Date().toISOString(),
      rows: [...byCountry.values()].sort((a, b) => b.gaps - a.gaps),
    }
  }

  if (reportType === 'expiring') {
    const mechanisms = await db
      .select()
      .from(transfer_mechanisms)
      .where(eq(transfer_mechanisms.workspace_id, workspaceId))
    const sccs = await db
      .select()
      .from(scc_agreements)
      .where(eq(scc_agreements.workspace_id, workspaceId))
    const now = Date.now()
    const soon = now + 90 * 86_400_000
    const expiringMechanisms = mechanisms.filter(
      (m) => m.expiry_date && m.expiry_date.getTime() <= soon,
    )
    const expiringSccs = sccs.filter((s) => s.expiry_date && s.expiry_date.getTime() <= soon)
    return {
      generated_at: new Date().toISOString(),
      horizon_days: 90,
      mechanisms: expiringMechanisms,
      scc_agreements: expiringSccs,
    }
  }

  if (reportType === 'tia_completion') {
    const tiaRows = await db.select().from(tias).where(eq(tias.workspace_id, workspaceId))
    const byStatus: Record<string, number> = {}
    for (const t of tiaRows) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1
    const total = tiaRows.length
    const approved = byStatus['approved'] ?? 0
    return {
      generated_at: new Date().toISOString(),
      total,
      approved,
      completion_pct: total === 0 ? 0 : Math.round((approved / total) * 100),
      by_status: byStatus,
    }
  }

  if (reportType === 'adequacy_exposure') {
    const flows = await db
      .select()
      .from(transfer_flows)
      .where(eq(transfer_flows.workspace_id, workspaceId))
    const countryRows = await db.select().from(countries)
    const countryById = new Map(countryRows.map((x) => [x.id, x]))
    const byStatus: Record<string, number> = {}
    for (const f of flows) {
      const ctry = f.destination_country_id ? countryById.get(f.destination_country_id) : null
      const status = ctry?.eu_adequacy_status ?? 'None'
      byStatus[status] = (byStatus[status] ?? 0) + 1
    }
    return { generated_at: new Date().toISOString(), by_eu_adequacy_status: byStatus }
  }

  return { generated_at: new Date().toISOString() }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET / — public — saved reports (filter workspace_id).
router.get('/', async (c) => {
  const workspaceId = c.req.query('workspace_id')
  const rows = workspaceId
    ? await db
        .select()
        .from(saved_reports)
        .where(eq(saved_reports.workspace_id, workspaceId))
        .orderBy(desc(saved_reports.created_at))
    : await db.select().from(saved_reports).orderBy(desc(saved_reports.created_at))
  return c.json(rows)
})

// GET /export — public — full audit-pack export bundle for a workspace.
// Declared before /:id so the literal segment is not captured as an id.
router.get('/export', async (c) => {
  const workspaceId = c.req.query('workspace_id')
  if (!workspaceId) return c.json({ error: 'workspace_id is required' }, 400)
  const pack = await buildAuditPack(workspaceId)
  return c.json(pack)
})

// GET /:id — public — one saved report with its snapshot.
router.get('/:id', async (c) => {
  const [r] = await db.select().from(saved_reports).where(eq(saved_reports.id, c.req.param('id')))
  if (!r) return c.json({ error: 'Not found' }, 404)
  return c.json(r)
})

// POST / — auth — generate + persist a report snapshot for the workspace.
router.post('/', authMiddleware, zValidator('json', reportSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  if (!(await isMember(body.workspace_id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const snapshot = await buildSnapshot(body.report_type, body.workspace_id)

  const [created] = await db
    .insert(saved_reports)
    .values({
      workspace_id: body.workspace_id,
      name: body.name,
      report_type: body.report_type,
      config: body.config,
      snapshot,
      created_by: userId,
    })
    .returning()

  await db.insert(audit_logs).values({
    workspace_id: body.workspace_id,
    actor_user_id: userId,
    action: 'export',
    entity_type: 'saved_report',
    entity_id: created.id,
    detail: { report_type: body.report_type, name: body.name },
  })

  return c.json(created, 201)
})

export default router
