import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { legal_bases } from '../db/schema.js'
import { eq, asc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const legalBasisSchema = z.object({
  code: z.string().min(1),
  article: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(['adequacy', 'appropriate_safeguard', 'derogation']),
  requires_tia: z.boolean().optional().default(false),
  is_systematic: z.boolean().optional().default(true),
  description: z.string().optional(),
})

// Public: Chapter V legal-basis & derogation reference library
router.get('/', async (c) => {
  const all = await db.select().from(legal_bases).orderBy(asc(legal_bases.article), asc(legal_bases.code))
  return c.json(all)
})

// Public: one legal basis
router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [lb] = await db.select().from(legal_bases).where(eq(legal_bases.id, id))
  if (!lb) return c.json({ error: 'Not found' }, 404)
  return c.json(lb)
})

// Auth: add a custom legal basis
router.post('/', authMiddleware, zValidator('json', legalBasisSchema), async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)
  const body = c.req.valid('json')

  // Enforce unique code (schema has a unique constraint; surface a clean error)
  const [existing] = await db.select().from(legal_bases).where(eq(legal_bases.code, body.code))
  if (existing) return c.json({ error: 'A legal basis with this code already exists' }, 409)

  const [created] = await db
    .insert(legal_bases)
    .values({
      code: body.code,
      article: body.article,
      name: body.name,
      category: body.category,
      requires_tia: body.requires_tia,
      is_systematic: body.is_systematic,
      description: body.description,
    })
    .returning()
  return c.json(created, 201)
})

export default router
