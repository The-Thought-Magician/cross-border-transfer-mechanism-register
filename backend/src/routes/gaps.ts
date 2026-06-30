import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  remediation_tasks,
  coverage_results,
  transfer_flows,
  countries,
  recipients,
  flow_data_categories,
  data_categories,
  flow_subject_categories,
  subject_categories,
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

const VOLUME_WEIGHT: Record<string, number> = { high: 3, medium: 2, low: 1 }
const GAP_STATES = new Set(['Gap', 'At-Risk', 'Expiring'])

// Map a coverage state + failed conditions to a remediation action type.
function deriveActionType(state: string, failed: string[]): string {
  const joined = failed.join(' ').toLowerCase()
  if (joined.includes('tia')) return 'complete_tia'
  if (joined.includes('re-paper') || joined.includes('repaper')) return 'repaper'
  if (joined.includes('adequacy')) return 'confirm_adequacy'
  if (joined.includes('mechanism') || joined.includes('scc') || joined.includes('safeguard'))
    return 'attach_scc'
  if (state === 'At-Risk') return 'review'
  return 'attach_scc'
}

function derivePriority(rankScore: number, state: string): string {
  if (state === 'At-Risk' || rankScore >= 70) return 'high'
  if (rankScore >= 35) return 'medium'
  return 'low'
}

// Compute a rank score for a flow's gap from sensitivity, subject risk, volume,
// and the engine's own risk score.
async function rankGap(
  flow: typeof transfer_flows.$inferSelect,
  coverageRisk: number,
): Promise<number> {
  const dcRows = await db
    .select({ w: data_categories.sensitivity_weight, special: data_categories.is_special })
    .from(flow_data_categories)
    .innerJoin(data_categories, eq(flow_data_categories.data_category_id, data_categories.id))
    .where(eq(flow_data_categories.flow_id, flow.id))
  const maxSensitivity = dcRows.reduce((acc, r) => Math.max(acc, r.w ?? 1), 0)
  const hasSpecial = dcRows.some((r) => r.special)

  const scRows = await db
    .select({ w: subject_categories.risk_weight })
    .from(flow_subject_categories)
    .innerJoin(
      subject_categories,
      eq(flow_subject_categories.subject_category_id, subject_categories.id),
    )
    .where(eq(flow_subject_categories.flow_id, flow.id))
  const maxSubjectRisk = scRows.reduce((acc, r) => Math.max(acc, r.w ?? 1), 0)

  const volume = VOLUME_WEIGHT[flow.volume_band] ?? 1

  // Weighted blend, normalized to ~0-100.
  const score =
    coverageRisk * 0.5 +
    maxSensitivity * 6 +
    maxSubjectRisk * 4 +
    volume * 5 +
    (hasSpecial ? 10 : 0)

  return Math.round(Math.min(100, score))
}

// ---------------------------------------------------------------------------
// GET / — public: open gaps ranked by sensitivity/volume
// ---------------------------------------------------------------------------

router.get('/', async (c) => {
  const workspaceId = c.req.query('workspace_id')

  const conds = []
  if (workspaceId) conds.push(eq(coverage_results.workspace_id, workspaceId))

  const results = await db
    .select()
    .from(coverage_results)
    .where(conds.length ? and(...conds) : undefined)

  const gapResults = results.filter((r) => GAP_STATES.has(r.state))

  const allCountries = await db.select().from(countries)
  const countryById = new Map(allCountries.map((c2) => [c2.id, c2]))
  const allRecipients = await db.select().from(recipients)
  const recipientById = new Map(allRecipients.map((r) => [r.id, r]))

  const gaps = []
  for (const r of gapResults) {
    const [flow] = await db.select().from(transfer_flows).where(eq(transfer_flows.id, r.flow_id))
    if (!flow || flow.archived) continue
    const rankScore = await rankGap(flow, r.risk_score ?? 0)
    gaps.push({
      flow_id: flow.id,
      flow_name: flow.name,
      workspace_id: flow.workspace_id,
      state: r.state,
      verdict: r.verdict,
      failed_conditions: r.failed_conditions ?? [],
      risk_score: r.risk_score ?? 0,
      rank_score: rankScore,
      volume_band: flow.volume_band,
      destination_country: flow.destination_country_id
        ? countryById.get(flow.destination_country_id)?.name ?? null
        : null,
      recipient: flow.recipient_id
        ? recipientById.get(flow.recipient_id)?.legal_name ?? null
        : null,
      suggested_action: deriveActionType(r.state, r.failed_conditions ?? []),
    })
  }

  gaps.sort((a, b) => b.rank_score - a.rank_score)
  return c.json(gaps)
})

// ---------------------------------------------------------------------------
// GET /tasks — public: remediation tasks (filter status, assignee, workspace_id)
// ---------------------------------------------------------------------------

router.get('/tasks', async (c) => {
  const status = c.req.query('status')
  const assignee = c.req.query('assignee')
  const workspaceId = c.req.query('workspace_id')

  const conds = []
  if (status) conds.push(eq(remediation_tasks.status, status))
  if (assignee) conds.push(eq(remediation_tasks.assignee_user_id, assignee))
  if (workspaceId) conds.push(eq(remediation_tasks.workspace_id, workspaceId))

  const rows = await db
    .select()
    .from(remediation_tasks)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(remediation_tasks.created_at))

  return c.json(rows)
})

// ---------------------------------------------------------------------------
// POST /tasks — auth: create remediation task
// ---------------------------------------------------------------------------

const taskSchema = z.object({
  workspace_id: z.string().min(1),
  flow_id: z.string().optional().nullable(),
  title: z.string().min(1),
  action_type: z
    .enum(['attach_scc', 'complete_tia', 'confirm_adequacy', 'repaper', 'review'])
    .optional()
    .nullable(),
  status: z.enum(['open', 'in-progress', 'done']).optional().default('open'),
  priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  assignee_user_id: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  resolution_note: z.string().optional().nullable(),
})

router.post('/tasks', authMiddleware, zValidator('json', taskSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  if (!(await isWorkspaceMember(body.workspace_id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  if (body.flow_id) {
    const [flow] = await db.select().from(transfer_flows).where(eq(transfer_flows.id, body.flow_id))
    if (!flow) return c.json({ error: 'Flow not found' }, 404)
    if (flow.workspace_id !== body.workspace_id) {
      return c.json({ error: 'Flow belongs to a different workspace' }, 400)
    }
  }

  const [created] = await db
    .insert(remediation_tasks)
    .values({
      workspace_id: body.workspace_id,
      flow_id: body.flow_id ?? null,
      title: body.title,
      action_type: body.action_type ?? null,
      status: body.status ?? 'open',
      priority: body.priority ?? 'medium',
      assignee_user_id: body.assignee_user_id ?? null,
      due_date: body.due_date ? new Date(body.due_date) : null,
      resolution_note: body.resolution_note ?? null,
      created_by: userId,
    })
    .returning()

  return c.json(created, 201)
})

// ---------------------------------------------------------------------------
// PUT /tasks/:id — auth(member): update status/resolution
// ---------------------------------------------------------------------------

const taskUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  action_type: z
    .enum(['attach_scc', 'complete_tia', 'confirm_adequacy', 'repaper', 'review'])
    .optional()
    .nullable(),
  status: z.enum(['open', 'in-progress', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  assignee_user_id: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  resolution_note: z.string().optional().nullable(),
})

router.put('/tasks/:id', authMiddleware, zValidator('json', taskUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [existing] = await db.select().from(remediation_tasks).where(eq(remediation_tasks.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await isWorkspaceMember(existing.workspace_id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const patch: Record<string, unknown> = { updated_at: new Date() }
  if (body.title !== undefined) patch.title = body.title
  if (body.action_type !== undefined) patch.action_type = body.action_type
  if (body.status !== undefined) patch.status = body.status
  if (body.priority !== undefined) patch.priority = body.priority
  if (body.assignee_user_id !== undefined) patch.assignee_user_id = body.assignee_user_id
  if (body.due_date !== undefined) patch.due_date = body.due_date ? new Date(body.due_date) : null
  if (body.resolution_note !== undefined) patch.resolution_note = body.resolution_note

  const [updated] = await db
    .update(remediation_tasks)
    .set(patch)
    .where(eq(remediation_tasks.id, id))
    .returning()

  return c.json(updated)
})

// ---------------------------------------------------------------------------
// POST /tasks/generate — auth: auto-generate tasks for current gaps
// ---------------------------------------------------------------------------

const generateSchema = z.object({
  workspace_id: z.string().min(1),
})

router.post('/tasks/generate', authMiddleware, zValidator('json', generateSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  if (!(await isWorkspaceMember(body.workspace_id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const results = await db
    .select()
    .from(coverage_results)
    .where(eq(coverage_results.workspace_id, body.workspace_id))

  const gapResults = results.filter((r) => GAP_STATES.has(r.state))

  // Existing open/in-progress tasks per flow to avoid duplicates.
  const existingTasks = await db
    .select()
    .from(remediation_tasks)
    .where(eq(remediation_tasks.workspace_id, body.workspace_id))
  const openFlowActions = new Set(
    existingTasks
      .filter((t) => t.status !== 'done' && t.flow_id)
      .map((t) => `${t.flow_id}:${t.action_type ?? ''}`),
  )

  const created: typeof remediation_tasks.$inferSelect[] = []
  for (const r of gapResults) {
    const [flow] = await db.select().from(transfer_flows).where(eq(transfer_flows.id, r.flow_id))
    if (!flow || flow.archived) continue

    const actionType = deriveActionType(r.state, r.failed_conditions ?? [])
    const dedupeKey = `${flow.id}:${actionType}`
    if (openFlowActions.has(dedupeKey)) continue

    const rankScore = await rankGap(flow, r.risk_score ?? 0)
    const priority = derivePriority(rankScore, r.state)
    const titleAction =
      actionType === 'complete_tia'
        ? 'Complete TIA'
        : actionType === 'repaper'
          ? 'Re-paper SCC'
          : actionType === 'confirm_adequacy'
            ? 'Confirm adequacy'
            : actionType === 'review'
              ? 'Review at-risk transfer'
              : 'Attach valid mechanism'

    const [task] = await db
      .insert(remediation_tasks)
      .values({
        workspace_id: body.workspace_id,
        flow_id: flow.id,
        title: `${titleAction} for "${flow.name}"`,
        action_type: actionType,
        status: 'open',
        priority,
        created_by: userId,
      })
      .returning()

    created.push(task)
    openFlowActions.add(dedupeKey)
  }

  return c.json(created, 201)
})

export default router
