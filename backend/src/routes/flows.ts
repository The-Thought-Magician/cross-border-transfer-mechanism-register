import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  transfer_flows,
  workspaces,
  workspace_members,
  flow_data_categories,
  flow_subject_categories,
  data_categories,
  subject_categories,
  transfer_mechanisms,
  coverage_results,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const flowCreateSchema = z.object({
  workspace_id: z.string().min(1),
  name: z.string().min(1),
  source_region: z.enum(['EEA', 'UK']).optional().default('EEA'),
  destination_country_id: z.string().nullish(),
  exporting_entity: z.string().nullish(),
  recipient_id: z.string().nullish(),
  recipient_role: z.string().optional().default('processor'),
  purpose: z.string().nullish(),
  volume_band: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  frequency: z.enum(['occasional', 'periodic', 'continuous']).optional().default('continuous'),
  owner_user_id: z.string().nullish(),
  tags: z.array(z.string()).optional().default([]),
  notes: z.string().nullish(),
})

const flowUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  source_region: z.enum(['EEA', 'UK']).optional(),
  destination_country_id: z.string().nullish(),
  exporting_entity: z.string().nullish(),
  recipient_id: z.string().nullish(),
  recipient_role: z.string().optional(),
  purpose: z.string().nullish(),
  volume_band: z.enum(['low', 'medium', 'high']).optional(),
  frequency: z.enum(['occasional', 'periodic', 'continuous']).optional(),
  coverage_state: z.enum(['Covered', 'Gap', 'Expiring', 'At-Risk', 'Under-Review']).optional(),
  owner_user_id: z.string().nullish(),
  tags: z.array(z.string()).optional(),
  notes: z.string().nullish(),
  archived: z.boolean().optional(),
})

const categoriesSchema = z.object({
  data_category_ids: z.array(z.string()).optional().default([]),
  subject_category_ids: z.array(z.string()).optional().default([]),
})

const importSchema = z.object({
  workspace_id: z.string().min(1),
  flows: z
    .array(
      z.object({
        name: z.string().min(1),
        source_region: z.enum(['EEA', 'UK']).optional().default('EEA'),
        destination_country_id: z.string().nullish(),
        exporting_entity: z.string().nullish(),
        recipient_id: z.string().nullish(),
        recipient_role: z.string().optional().default('processor'),
        purpose: z.string().nullish(),
        volume_band: z.enum(['low', 'medium', 'high']).optional().default('medium'),
        frequency: z.enum(['occasional', 'periodic', 'continuous']).optional().default('continuous'),
        tags: z.array(z.string()).optional().default([]),
        notes: z.string().nullish(),
      }),
    )
    .min(1),
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

// Helper: caller may mutate a specific flow (creator, owner, or workspace member).
async function canWriteFlow(flow: typeof transfer_flows.$inferSelect, userId: string): Promise<boolean> {
  if (flow.created_by === userId) return true
  return canWriteWorkspace(flow.workspace_id, userId)
}

// GET / — public list with filters
router.get('/', async (c) => {
  const conds = [] as any[]
  const workspaceId = c.req.query('workspace_id')
  const coverageState = c.req.query('coverage_state')
  const country = c.req.query('country') ?? c.req.query('destination_country_id')
  const recipient = c.req.query('recipient') ?? c.req.query('recipient_id')
  if (workspaceId) conds.push(eq(transfer_flows.workspace_id, workspaceId))
  if (coverageState) conds.push(eq(transfer_flows.coverage_state, coverageState))
  if (country) conds.push(eq(transfer_flows.destination_country_id, country))
  if (recipient) conds.push(eq(transfer_flows.recipient_id, recipient))
  const rows = conds.length
    ? await db.select().from(transfer_flows).where(and(...conds)).orderBy(desc(transfer_flows.created_at))
    : await db.select().from(transfer_flows).orderBy(desc(transfer_flows.created_at))
  return c.json(rows)
})

// GET /:id — public detail: flow + categories + mechanism + coverage
router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [flow] = await db.select().from(transfer_flows).where(eq(transfer_flows.id, id))
  if (!flow) return c.json({ error: 'Not found' }, 404)

  const dcLinks = await db
    .select()
    .from(flow_data_categories)
    .where(eq(flow_data_categories.flow_id, id))
  const scLinks = await db
    .select()
    .from(flow_subject_categories)
    .where(eq(flow_subject_categories.flow_id, id))

  const dcIds = dcLinks.map((l) => l.data_category_id)
  const scIds = scLinks.map((l) => l.subject_category_id)
  const dataCats = dcIds.length
    ? await db.select().from(data_categories).where(inArray(data_categories.id, dcIds))
    : []
  const subjectCats = scIds.length
    ? await db.select().from(subject_categories).where(inArray(subject_categories.id, scIds))
    : []

  const mechanisms = await db
    .select()
    .from(transfer_mechanisms)
    .where(eq(transfer_mechanisms.flow_id, id))
    .orderBy(desc(transfer_mechanisms.created_at))
  const [coverage] = await db
    .select()
    .from(coverage_results)
    .where(eq(coverage_results.flow_id, id))

  return c.json({
    ...flow,
    data_categories: dataCats,
    subject_categories: subjectCats,
    mechanisms,
    mechanism: mechanisms.find((m) => m.status === 'active') ?? mechanisms[0] ?? null,
    coverage: coverage ?? null,
  })
})

// POST / — create flow (caller must belong to the workspace)
router.post('/', authMiddleware, zValidator('json', flowCreateSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  if (!(await canWriteWorkspace(body.workspace_id, userId)))
    return c.json({ error: 'Forbidden' }, 403)
  const [flow] = await db
    .insert(transfer_flows)
    .values({
      workspace_id: body.workspace_id,
      name: body.name,
      source_region: body.source_region,
      destination_country_id: body.destination_country_id ?? null,
      exporting_entity: body.exporting_entity ?? null,
      recipient_id: body.recipient_id ?? null,
      recipient_role: body.recipient_role,
      purpose: body.purpose ?? null,
      volume_band: body.volume_band,
      frequency: body.frequency,
      owner_user_id: body.owner_user_id ?? userId,
      tags: body.tags,
      notes: body.notes ?? null,
      created_by: userId,
    })
    .returning()
  return c.json(flow, 201)
})

// PUT /:id — owner/member update
router.put('/:id', authMiddleware, zValidator('json', flowUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(transfer_flows).where(eq(transfer_flows.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await canWriteFlow(existing, userId))) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(transfer_flows)
    .set({ ...body, updated_at: new Date() })
    .where(eq(transfer_flows.id, id))
    .returning()
  return c.json(updated)
})

// DELETE /:id — archive by default; hard delete with ?hard=true
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(transfer_flows).where(eq(transfer_flows.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await canWriteFlow(existing, userId))) return c.json({ error: 'Forbidden' }, 403)

  if (c.req.query('hard') === 'true') {
    await db.delete(flow_data_categories).where(eq(flow_data_categories.flow_id, id))
    await db.delete(flow_subject_categories).where(eq(flow_subject_categories.flow_id, id))
    await db.delete(coverage_results).where(eq(coverage_results.flow_id, id))
    await db.delete(transfer_mechanisms).where(eq(transfer_mechanisms.flow_id, id))
    await db.delete(transfer_flows).where(eq(transfer_flows.id, id))
    return c.json({ success: true, deleted: true })
  }

  await db
    .update(transfer_flows)
    .set({ archived: true, updated_at: new Date() })
    .where(eq(transfer_flows.id, id))
  return c.json({ success: true, archived: true })
})

// POST /:id/categories — set data + subject categories (full replace)
router.post('/:id/categories', authMiddleware, zValidator('json', categoriesSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [flow] = await db.select().from(transfer_flows).where(eq(transfer_flows.id, id))
  if (!flow) return c.json({ error: 'Not found' }, 404)
  if (!(await canWriteFlow(flow, userId))) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')

  // Replace data-category links.
  await db.delete(flow_data_categories).where(eq(flow_data_categories.flow_id, id))
  for (const dcId of [...new Set(body.data_category_ids)]) {
    await db
      .insert(flow_data_categories)
      .values({ flow_id: id, data_category_id: dcId })
      .onConflictDoNothing()
  }
  // Replace subject-category links.
  await db.delete(flow_subject_categories).where(eq(flow_subject_categories.flow_id, id))
  for (const scId of [...new Set(body.subject_category_ids)]) {
    await db
      .insert(flow_subject_categories)
      .values({ flow_id: id, subject_category_id: scId })
      .onConflictDoNothing()
  }
  await db.update(transfer_flows).set({ updated_at: new Date() }).where(eq(transfer_flows.id, id))

  // Return the full detail shape.
  const dataCats = body.data_category_ids.length
    ? await db.select().from(data_categories).where(inArray(data_categories.id, body.data_category_ids))
    : []
  const subjectCats = body.subject_category_ids.length
    ? await db
        .select()
        .from(subject_categories)
        .where(inArray(subject_categories.id, body.subject_category_ids))
    : []
  const mechanisms = await db
    .select()
    .from(transfer_mechanisms)
    .where(eq(transfer_mechanisms.flow_id, id))
    .orderBy(desc(transfer_mechanisms.created_at))
  const [coverage] = await db
    .select()
    .from(coverage_results)
    .where(eq(coverage_results.flow_id, id))

  return c.json({
    ...flow,
    data_categories: dataCats,
    subject_categories: subjectCats,
    mechanisms,
    mechanism: mechanisms.find((m) => m.status === 'active') ?? mechanisms[0] ?? null,
    coverage: coverage ?? null,
  })
})

// POST /import — bulk JSON/CSV-derived import
router.post('/import', authMiddleware, zValidator('json', importSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  if (!(await canWriteWorkspace(body.workspace_id, userId)))
    return c.json({ error: 'Forbidden' }, 403)

  let imported = 0
  for (const f of body.flows) {
    await db.insert(transfer_flows).values({
      workspace_id: body.workspace_id,
      name: f.name,
      source_region: f.source_region,
      destination_country_id: f.destination_country_id ?? null,
      exporting_entity: f.exporting_entity ?? null,
      recipient_id: f.recipient_id ?? null,
      recipient_role: f.recipient_role,
      purpose: f.purpose ?? null,
      volume_band: f.volume_band,
      frequency: f.frequency,
      owner_user_id: userId,
      tags: f.tags,
      notes: f.notes ?? null,
      created_by: userId,
    })
    imported++
  }
  return c.json({ imported }, 201)
})

export default router
