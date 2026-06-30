import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  tias,
  tia_steps,
  tia_measures,
  supplementary_measures,
  workspace_members,
  workspaces,
  audit_logs,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// EDPB six-step methodology (Recommendations 01/2020). Each TIA is seeded with
// these six steps; answers carry risk_points that roll up into the TIA score.
// ---------------------------------------------------------------------------

const EDPB_STEPS: { step_number: number; step_key: string; question: string }[] = [
  {
    step_number: 1,
    step_key: 'map_transfer',
    question: 'Step 1 — Know your transfer: map the data flow, parties, categories and destination.',
  },
  {
    step_number: 2,
    step_key: 'identify_tool',
    question: 'Step 2 — Identify the Chapter V transfer tool relied upon (adequacy, SCC, BCR, derogation).',
  },
  {
    step_number: 3,
    step_key: 'assess_law',
    question:
      'Step 3 — Assess whether the third-country law or practice may impinge on the effectiveness of the tool.',
  },
  {
    step_number: 4,
    step_key: 'supplementary_measures',
    question: 'Step 4 — Identify and adopt supplementary measures (technical, contractual, organizational).',
  },
  {
    step_number: 5,
    step_key: 'procedural_steps',
    question: 'Step 5 — Take any formal procedural steps the adoption of measures may require.',
  },
  {
    step_number: 6,
    step_key: 'reevaluate',
    question: 'Step 6 — Re-evaluate at appropriate intervals the level of protection afforded.',
  },
]

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
      entity_type: 'tia',
      entity_id: entityId,
      detail,
    })
  } catch {
    // best-effort
  }
}

// Derives risk_score from the sum of step risk_points and maps it to an
// EDPB-style outcome. Higher points => higher risk.
//   < 4   => adequate
//   4..8  => adequate_with_measures
//   > 8   => inadequate
function scoreTia(steps: { risk_points: number | null }[]): {
  risk_score: number
  outcome: 'adequate' | 'adequate_with_measures' | 'inadequate'
} {
  const risk_score = steps.reduce((acc, s) => acc + (s.risk_points ?? 0), 0)
  let outcome: 'adequate' | 'adequate_with_measures' | 'inadequate'
  if (risk_score < 4) outcome = 'adequate'
  else if (risk_score <= 8) outcome = 'adequate_with_measures'
  else outcome = 'inadequate'
  return { risk_score, outcome }
}

async function loadDetail(tiaId: string) {
  const [tia] = await db.select().from(tias).where(eq(tias.id, tiaId))
  if (!tia) return null
  const steps = await db
    .select()
    .from(tia_steps)
    .where(eq(tia_steps.tia_id, tiaId))
    .orderBy(tia_steps.step_number)
  const links = await db.select().from(tia_measures).where(eq(tia_measures.tia_id, tiaId))
  let measures: (typeof supplementary_measures.$inferSelect)[] = []
  if (links.length) {
    measures = await db
      .select()
      .from(supplementary_measures)
      .where(
        inArray(
          supplementary_measures.id,
          links.map((l) => l.measure_id),
        ),
      )
  }
  return { ...tia, steps, measures }
}

function toDate(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  return new Date(v)
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const createSchema = z.object({
  workspace_id: z.string().min(1),
  flow_id: z.string().min(1).optional().nullable(),
  recipient_id: z.string().min(1).optional().nullable(),
  country_id: z.string().min(1).optional().nullable(),
  title: z.string().min(1),
  summary: z.string().optional().nullable(),
  review_due_date: z.string().datetime().optional().nullable(),
})

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(['draft', 'in-review', 'approved', 'rejected']).optional(),
  flow_id: z.string().min(1).optional().nullable(),
  recipient_id: z.string().min(1).optional().nullable(),
  country_id: z.string().min(1).optional().nullable(),
  reviewer_user_id: z.string().optional().nullable(),
  review_due_date: z.string().datetime().optional().nullable(),
  summary: z.string().optional().nullable(),
})

const stepsSchema = z.object({
  steps: z
    .array(
      z.object({
        step_number: z.number().int().min(1).max(6),
        answer: z.string().optional().nullable(),
        risk_points: z.number().min(0).max(10).optional(),
      }),
    )
    .min(1),
})

const measuresSchema = z.object({
  measure_ids: z.array(z.string().min(1)),
})

const approveSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  comment: z.string().optional().nullable(),
})

// ---------------------------------------------------------------------------
// GET / — public list (filters: workspace_id, status, flow_id)
// ---------------------------------------------------------------------------

router.get('/', async (c) => {
  const workspaceId = c.req.query('workspace_id')
  const status = c.req.query('status')
  const flowId = c.req.query('flow_id')

  const conditions = []
  if (workspaceId) conditions.push(eq(tias.workspace_id, workspaceId))
  if (status) conditions.push(eq(tias.status, status))
  if (flowId) conditions.push(eq(tias.flow_id, flowId))

  const rows = conditions.length
    ? await db
        .select()
        .from(tias)
        .where(and(...conditions))
        .orderBy(desc(tias.created_at))
    : await db.select().from(tias).orderBy(desc(tias.created_at))

  return c.json(rows)
})

// ---------------------------------------------------------------------------
// GET /:id — public, TIA with steps + measures
// ---------------------------------------------------------------------------

router.get('/:id', async (c) => {
  const detail = await loadDetail(c.req.param('id'))
  if (!detail) return c.json({ error: 'Not found' }, 404)
  return c.json(detail)
})

// ---------------------------------------------------------------------------
// POST / — auth, create TIA (seeds 6 EDPB steps)
// ---------------------------------------------------------------------------

router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  if (!(await isWorkspaceMember(body.workspace_id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  // Default review_due_date from the workspace's tia_review_months if absent.
  let reviewDue = toDate(body.review_due_date) ?? null
  if (!reviewDue) {
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, body.workspace_id))
    const months = ws?.tia_review_months ?? 12
    const d = new Date()
    d.setMonth(d.getMonth() + months)
    reviewDue = d
  }

  const [tia] = await db
    .insert(tias)
    .values({
      workspace_id: body.workspace_id,
      flow_id: body.flow_id ?? null,
      recipient_id: body.recipient_id ?? null,
      country_id: body.country_id ?? null,
      title: body.title,
      status: 'draft',
      summary: body.summary ?? null,
      review_due_date: reviewDue,
      created_by: userId,
    })
    .returning()

  // Seed the six EDPB steps with zero risk points.
  await db.insert(tia_steps).values(
    EDPB_STEPS.map((s) => ({
      tia_id: tia.id,
      step_number: s.step_number,
      step_key: s.step_key,
      question: s.question,
      answer: null,
      risk_points: 0,
    })),
  )

  await logAudit(tia.workspace_id, userId, 'create', tia.id, { title: tia.title })
  const detail = await loadDetail(tia.id)
  return c.json(detail, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — auth(member), update header/status
// ---------------------------------------------------------------------------

router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [existing] = await db.select().from(tias).where(eq(tias.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await isWorkspaceMember(existing.workspace_id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const patch: Partial<typeof tias.$inferInsert> = { updated_at: new Date() }
  if (body.title !== undefined) patch.title = body.title
  if (body.status !== undefined) patch.status = body.status
  if (body.flow_id !== undefined) patch.flow_id = body.flow_id
  if (body.recipient_id !== undefined) patch.recipient_id = body.recipient_id
  if (body.country_id !== undefined) patch.country_id = body.country_id
  if (body.reviewer_user_id !== undefined) patch.reviewer_user_id = body.reviewer_user_id
  if (body.review_due_date !== undefined) patch.review_due_date = toDate(body.review_due_date)
  if (body.summary !== undefined) patch.summary = body.summary

  const [updated] = await db.update(tias).set(patch).where(eq(tias.id, id)).returning()
  await logAudit(updated.workspace_id, userId, 'update', updated.id, { status: updated.status })
  return c.json(updated)
})

// ---------------------------------------------------------------------------
// PUT /:id/steps — auth(member), upsert step answers, recompute risk + outcome
// ---------------------------------------------------------------------------

router.put('/:id/steps', authMiddleware, zValidator('json', stepsSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [existing] = await db.select().from(tias).where(eq(tias.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await isWorkspaceMember(existing.workspace_id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  // Upsert each provided step. Steps are seeded at creation, so update by
  // (tia_id, step_number); fall back to insert if a step is somehow missing.
  for (const s of body.steps) {
    const [row] = await db
      .select()
      .from(tia_steps)
      .where(and(eq(tia_steps.tia_id, id), eq(tia_steps.step_number, s.step_number)))
    const set: Partial<typeof tia_steps.$inferInsert> = {}
    if (s.answer !== undefined) set.answer = s.answer
    if (s.risk_points !== undefined) set.risk_points = s.risk_points
    if (row) {
      await db
        .update(tia_steps)
        .set(set)
        .where(and(eq(tia_steps.tia_id, id), eq(tia_steps.step_number, s.step_number)))
    } else {
      const def = EDPB_STEPS.find((e) => e.step_number === s.step_number)
      await db.insert(tia_steps).values({
        tia_id: id,
        step_number: s.step_number,
        step_key: def?.step_key ?? `step_${s.step_number}`,
        question: def?.question ?? null,
        answer: s.answer ?? null,
        risk_points: s.risk_points ?? 0,
      })
    }
  }

  // Recompute risk_score + outcome from the full set of steps.
  const allSteps = await db.select().from(tia_steps).where(eq(tia_steps.tia_id, id))
  const { risk_score, outcome } = scoreTia(allSteps)
  await db
    .update(tias)
    .set({ risk_score, outcome, updated_at: new Date() })
    .where(eq(tias.id, id))

  await logAudit(existing.workspace_id, userId, 'state_change', id, { risk_score, outcome })
  const detail = await loadDetail(id)
  return c.json(detail)
})

// ---------------------------------------------------------------------------
// POST /:id/measures — auth(member), set supplementary measures
// ---------------------------------------------------------------------------

router.post('/:id/measures', authMiddleware, zValidator('json', measuresSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [existing] = await db.select().from(tias).where(eq(tias.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await isWorkspaceMember(existing.workspace_id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  // Validate the supplied measure ids exist before linking.
  let validIds: string[] = []
  if (body.measure_ids.length) {
    const found = await db
      .select()
      .from(supplementary_measures)
      .where(inArray(supplementary_measures.id, body.measure_ids))
    validIds = found.map((m) => m.id)
  }

  // Replace the measure set (delete all then insert the new selection).
  await db.delete(tia_measures).where(eq(tia_measures.tia_id, id))
  if (validIds.length) {
    await db.insert(tia_measures).values(validIds.map((measure_id) => ({ tia_id: id, measure_id })))
  }

  await logAudit(existing.workspace_id, userId, 'update', id, { measure_ids: validIds })
  const detail = await loadDetail(id)
  return c.json(detail)
})

// ---------------------------------------------------------------------------
// POST /:id/approve — auth(member), approve/reject sign-off
// ---------------------------------------------------------------------------

router.post('/:id/approve', authMiddleware, zValidator('json', approveSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [existing] = await db.select().from(tias).where(eq(tias.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await isWorkspaceMember(existing.workspace_id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const approved = body.decision === 'approve'
  const [updated] = await db
    .update(tias)
    .set({
      status: approved ? 'approved' : 'rejected',
      approved_by: userId,
      approved_at: new Date(),
      summary: body.comment ?? existing.summary,
      updated_at: new Date(),
    })
    .where(eq(tias.id, id))
    .returning()

  await logAudit(updated.workspace_id, userId, 'state_change', id, {
    decision: body.decision,
    status: updated.status,
  })
  return c.json(updated)
})

// ---------------------------------------------------------------------------
// DELETE /:id — auth(member)
// ---------------------------------------------------------------------------

router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')

  const [existing] = await db.select().from(tias).where(eq(tias.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await isWorkspaceMember(existing.workspace_id, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  // Remove children first (no cascade declared in schema).
  await db.delete(tia_measures).where(eq(tia_measures.tia_id, id))
  await db.delete(tia_steps).where(eq(tia_steps.tia_id, id))
  await db.delete(tias).where(eq(tias.id, id))

  await logAudit(existing.workspace_id, userId, 'delete', id, {})
  return c.json({ success: true })
})

export default router
