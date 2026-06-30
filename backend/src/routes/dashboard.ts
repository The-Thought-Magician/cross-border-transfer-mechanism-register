import { Hono } from 'hono'
import { db } from '../db/index.js'
import {
  transfer_flows,
  transfer_mechanisms,
  scc_agreements,
  tias,
  remediation_tasks,
  reviews,
} from '../db/schema.js'
import { eq } from 'drizzle-orm'

const router = new Hono()

// GET / — public — overview KPIs for a workspace.
// ?workspace_id scopes the figures; without it, aggregates across all rows.
router.get('/', async (c) => {
  const workspaceId = c.req.query('workspace_id')

  const flows = workspaceId
    ? await db.select().from(transfer_flows).where(eq(transfer_flows.workspace_id, workspaceId))
    : await db.select().from(transfer_flows)
  const activeFlows = flows.filter((f) => !f.archived)

  const mechanisms = workspaceId
    ? await db
        .select()
        .from(transfer_mechanisms)
        .where(eq(transfer_mechanisms.workspace_id, workspaceId))
    : await db.select().from(transfer_mechanisms)

  const sccs = workspaceId
    ? await db.select().from(scc_agreements).where(eq(scc_agreements.workspace_id, workspaceId))
    : await db.select().from(scc_agreements)

  const tiaRows = workspaceId
    ? await db.select().from(tias).where(eq(tias.workspace_id, workspaceId))
    : await db.select().from(tias)

  const tasks = workspaceId
    ? await db
        .select()
        .from(remediation_tasks)
        .where(eq(remediation_tasks.workspace_id, workspaceId))
    : await db.select().from(remediation_tasks)

  const reviewRows = workspaceId
    ? await db.select().from(reviews).where(eq(reviews.workspace_id, workspaceId))
    : await db.select().from(reviews)

  const now = Date.now()
  const soon = now + 90 * 86_400_000

  // Coverage-state breakdown over active flows.
  const stateCounts: Record<string, number> = {
    Covered: 0,
    Gap: 0,
    Expiring: 0,
    'At-Risk': 0,
    'Under-Review': 0,
  }
  for (const f of activeFlows) {
    stateCounts[f.coverage_state] = (stateCounts[f.coverage_state] ?? 0) + 1
  }

  const totalFlows = activeFlows.length
  const covered = stateCounts['Covered'] ?? 0
  const gaps = stateCounts['Gap'] ?? 0
  const atRisk = stateCounts['At-Risk'] ?? 0
  const percentCovered = totalFlows === 0 ? 0 : Math.round((covered / totalFlows) * 100)

  // Expiring instruments within the 90-day horizon.
  const expiringMechanisms = mechanisms.filter(
    (m) => m.expiry_date && m.expiry_date.getTime() <= soon && m.status === 'active',
  ).length
  const expiringSccs = sccs.filter(
    (s) => s.expiry_date && s.expiry_date.getTime() <= soon,
  ).length

  // TIA posture: overdue = review_due_date in the past and not approved/rejected.
  const overdueTias = tiaRows.filter(
    (t) =>
      t.review_due_date &&
      t.review_due_date.getTime() < now &&
      t.status !== 'approved' &&
      t.status !== 'rejected',
  ).length
  const tiasByStatus: Record<string, number> = {}
  for (const t of tiaRows) tiasByStatus[t.status] = (tiasByStatus[t.status] ?? 0) + 1

  const openTasks = tasks.filter((t) => t.status !== 'done').length
  const pendingReviews = reviewRows.filter(
    (r) => r.status === 'draft' || r.status === 'in-review',
  ).length

  return c.json({
    workspace_id: workspaceId ?? null,
    flows: totalFlows,
    percent_covered: percentCovered,
    covered,
    gaps,
    at_risk: atRisk,
    expiring: expiringMechanisms + expiringSccs,
    expiring_mechanisms: expiringMechanisms,
    expiring_sccs: expiringSccs,
    overdue_tias: overdueTias,
    open_tasks: openTasks,
    pending_reviews: pendingReviews,
    coverage_breakdown: stateCounts,
    tias_by_status: tiasByStatus,
    totals: {
      mechanisms: mechanisms.length,
      scc_agreements: sccs.length,
      tias: tiaRows.length,
    },
  })
})

export default router
