import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  countries,
  adequacy_events,
  transfer_flows,
  country_subscriptions,
  workspace_members,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const datePre = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : new Date(v as string)),
  z.date().optional(),
)

const countrySchema = z.object({
  iso_code: z.string().min(2).max(8),
  name: z.string().min(1),
  region: z.string().optional(),
  eu_adequacy_status: z.enum(['Adequate', 'Partial', 'None', 'Invalidated']).optional(),
  uk_adequacy_status: z.enum(['Adequate', 'Partial', 'None', 'Invalidated']).optional(),
  eu_decision_ref: z.string().optional(),
  uk_decision_ref: z.string().optional(),
  effective_date: datePre,
  review_date: datePre,
  surveillance_risk: z.enum(['low', 'medium', 'high', 'unknown']).optional(),
  notes: z.string().optional(),
})

const countryUpdateSchema = countrySchema.partial().extend({
  // optional workspace context so PUT can record an adequacy_event + workspace scoping
  workspace_id: z.string().optional(),
})

const subscribeSchema = z.object({
  workspace_id: z.string().min(1),
})

// Helper: is the user a member of the workspace?
async function isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  if (!workspaceId || !userId) return false
  const [m] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)))
  return !!m
}

// ---------------------------------------------------------------------------
// GET / — public — country reference list
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const all = await db.select().from(countries).orderBy(countries.name)
  return c.json(all)
})

// ---------------------------------------------------------------------------
// GET /:id — public — country + adequacy events + dependent flows
// ---------------------------------------------------------------------------
router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [country] = await db.select().from(countries).where(eq(countries.id, id))
  if (!country) return c.json({ error: 'Not found' }, 404)

  const events = await db
    .select()
    .from(adequacy_events)
    .where(eq(adequacy_events.country_id, id))
    .orderBy(desc(adequacy_events.created_at))

  const dependentFlows = await db
    .select()
    .from(transfer_flows)
    .where(eq(transfer_flows.destination_country_id, id))
    .orderBy(desc(transfer_flows.created_at))

  return c.json({ ...country, adequacy_events: events, dependent_flows: dependentFlows })
})

// ---------------------------------------------------------------------------
// POST / — auth — add country
// ---------------------------------------------------------------------------
router.post('/', authMiddleware, zValidator('json', countrySchema), async (c) => {
  const body = c.req.valid('json')
  const existing = await db.select().from(countries).where(eq(countries.iso_code, body.iso_code))
  if (existing.length > 0) return c.json({ error: 'Country with this iso_code already exists' }, 409)
  const [created] = await db.insert(countries).values(body).returning()
  return c.json(created, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — auth — update adequacy status (emits adequacy_event when status changes)
// ---------------------------------------------------------------------------
router.put('/:id', authMiddleware, zValidator('json', countryUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(countries).where(eq(countries.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const body = c.req.valid('json')
  const { workspace_id, ...patch } = body

  const update: Record<string, unknown> = { ...patch, updated_at: new Date() }
  const [updated] = await db.update(countries).set(update).where(eq(countries.id, id)).returning()

  // Emit adequacy_event(s) for any regime whose status changed.
  if (patch.eu_adequacy_status && patch.eu_adequacy_status !== existing.eu_adequacy_status) {
    await db.insert(adequacy_events).values({
      country_id: id,
      regime: 'EU',
      old_status: existing.eu_adequacy_status,
      new_status: patch.eu_adequacy_status,
      decision_ref: patch.eu_decision_ref ?? null,
      effective_date: patch.effective_date ?? null,
      description: `EU adequacy status changed from ${existing.eu_adequacy_status} to ${patch.eu_adequacy_status}`,
      created_by: userId,
    })
  }
  if (patch.uk_adequacy_status && patch.uk_adequacy_status !== existing.uk_adequacy_status) {
    await db.insert(adequacy_events).values({
      country_id: id,
      regime: 'UK',
      old_status: existing.uk_adequacy_status,
      new_status: patch.uk_adequacy_status,
      decision_ref: patch.uk_decision_ref ?? null,
      effective_date: patch.effective_date ?? null,
      description: `UK adequacy status changed from ${existing.uk_adequacy_status} to ${patch.uk_adequacy_status}`,
      created_by: userId,
    })
  }

  return c.json(updated)
})

// ---------------------------------------------------------------------------
// POST /:id/subscribe — auth — watch country for changes
// ---------------------------------------------------------------------------
router.post('/:id/subscribe', authMiddleware, zValidator('json', subscribeSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const { workspace_id } = c.req.valid('json')

  const [country] = await db.select().from(countries).where(eq(countries.id, id))
  if (!country) return c.json({ error: 'Not found' }, 404)
  if (!(await isWorkspaceMember(workspace_id, userId)))
    return c.json({ error: 'Forbidden' }, 403)

  // Idempotent: return the existing subscription if one already exists.
  const [existing] = await db
    .select()
    .from(country_subscriptions)
    .where(and(eq(country_subscriptions.country_id, id), eq(country_subscriptions.user_id, userId)))
  if (existing) return c.json(existing)

  const [created] = await db
    .insert(country_subscriptions)
    .values({ workspace_id, country_id: id, user_id: userId })
    .returning()
  return c.json(created, 201)
})

// ---------------------------------------------------------------------------
// DELETE /:id/subscribe — auth — unwatch
// ---------------------------------------------------------------------------
router.delete('/:id/subscribe', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  await db
    .delete(country_subscriptions)
    .where(and(eq(country_subscriptions.country_id, id), eq(country_subscriptions.user_id, userId)))
  return c.json({ success: true })
})

export default router
