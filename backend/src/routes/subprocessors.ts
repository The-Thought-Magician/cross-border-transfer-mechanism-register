import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { subprocessors, recipients, workspace_members } from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const datePre = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : new Date(v as string)),
  z.date().optional(),
)

const subprocessorSchema = z.object({
  recipient_id: z.string().min(1),
  name: z.string().min(1),
  country_id: z.string().optional(),
  service: z.string().optional(),
  declared_at: datePre,
})

// recipient_id is fixed at creation; only the descriptive fields are editable.
const subprocessorUpdateSchema = subprocessorSchema.omit({ recipient_id: true }).partial()

async function isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  if (!workspaceId || !userId) return false
  const [m] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)))
  return !!m
}

// ---------------------------------------------------------------------------
// GET / — public — subprocessors (filter recipient_id, workspace_id)
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const recipientId = c.req.query('recipient_id')
  const workspaceId = c.req.query('workspace_id')

  const filters = []
  if (recipientId) filters.push(eq(subprocessors.recipient_id, recipientId))
  if (workspaceId) filters.push(eq(subprocessors.workspace_id, workspaceId))

  const rows = filters.length
    ? await db
        .select()
        .from(subprocessors)
        .where(filters.length === 1 ? filters[0] : and(...filters))
        .orderBy(desc(subprocessors.created_at))
    : await db.select().from(subprocessors).orderBy(desc(subprocessors.created_at))

  return c.json(rows)
})

// ---------------------------------------------------------------------------
// POST / — auth — declare subprocessor
// ---------------------------------------------------------------------------
router.post('/', authMiddleware, zValidator('json', subprocessorSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  // Derive workspace from the parent recipient and enforce membership.
  const [recipient] = await db.select().from(recipients).where(eq(recipients.id, body.recipient_id))
  if (!recipient) return c.json({ error: 'Recipient not found' }, 404)
  if (!(await isWorkspaceMember(recipient.workspace_id, userId)))
    return c.json({ error: 'Forbidden' }, 403)

  const [created] = await db
    .insert(subprocessors)
    .values({
      workspace_id: recipient.workspace_id,
      recipient_id: body.recipient_id,
      name: body.name,
      country_id: body.country_id ?? null,
      service: body.service ?? null,
      declared_at: body.declared_at ?? new Date(),
    })
    .returning()
  return c.json(created, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — auth(owner/member) — update
// ---------------------------------------------------------------------------
router.put('/:id', authMiddleware, zValidator('json', subprocessorUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(subprocessors).where(eq(subprocessors.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await isWorkspaceMember(existing.workspace_id, userId)))
    return c.json({ error: 'Forbidden' }, 403)

  const body = c.req.valid('json')
  const [updated] = await db
    .update(subprocessors)
    .set(body)
    .where(eq(subprocessors.id, id))
    .returning()
  return c.json(updated)
})

// ---------------------------------------------------------------------------
// DELETE /:id — auth(owner/member) — delete
// ---------------------------------------------------------------------------
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(subprocessors).where(eq(subprocessors.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await isWorkspaceMember(existing.workspace_id, userId)))
    return c.json({ error: 'Forbidden' }, 403)
  await db.delete(subprocessors).where(eq(subprocessors.id, id))
  return c.json({ success: true })
})

export default router
