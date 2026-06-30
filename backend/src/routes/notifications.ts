import { Hono } from 'hono'
import { db } from '../db/index.js'
import { notifications } from '../db/schema.js'
import { and, desc, eq } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// All notification endpoints are scoped to the authenticated user.
router.use('*', authMiddleware)

// GET / — current user's notifications, newest first.
// Optional ?workspace_id and ?unread=true filters.
router.get('/', async (c) => {
  const userId = getUserId(c)
  const workspaceId = c.req.query('workspace_id')
  const unreadOnly = c.req.query('unread') === 'true'

  const conditions = [eq(notifications.user_id, userId)]
  if (workspaceId) conditions.push(eq(notifications.workspace_id, workspaceId))
  if (unreadOnly) conditions.push(eq(notifications.read, false))

  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.created_at))

  return c.json(rows)
})

// PUT /:id/read — mark a single notification read (owner only).
router.put('/:id/read', async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')

  const [existing] = await db.select().from(notifications).where(eq(notifications.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [updated] = await db
    .update(notifications)
    .set({ read: true })
    .where(eq(notifications.id, id))
    .returning()

  return c.json(updated)
})

// PUT /read-all — mark every notification for the user read.
router.put('/read-all', async (c) => {
  const userId = getUserId(c)
  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.user_id, userId), eq(notifications.read, false)))

  return c.json({ success: true })
})

export default router
