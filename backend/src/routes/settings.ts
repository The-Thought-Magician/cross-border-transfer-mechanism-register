import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  workspaces,
  workspace_members,
  audit_logs,
  country_subscriptions,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Notification preferences.
//
// There is no dedicated user-prefs table in the schema, so notification
// preferences are persisted as the most-recent audit_log row with
// action='settings.notification_prefs' and entity_type='user_settings',
// scoped to the caller's workspace + user id. The prefs blob lives in
// audit_logs.detail. Reads take the latest such row; writes append a new one.
// ---------------------------------------------------------------------------

const NOTIFICATION_CATEGORIES = [
  'gap',
  'expiry',
  'tia_overdue',
  'adequacy_change',
  'task',
  'review',
] as const

type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]

function defaultNotificationPrefs(): Record<NotificationCategory, boolean> {
  return {
    gap: true,
    expiry: true,
    tia_overdue: true,
    adequacy_change: true,
    task: true,
    review: true,
  }
}

const PREFS_ACTION = 'settings.notification_prefs'
const PREFS_ENTITY = 'user_settings'

// Resolve the workspace the caller belongs to (most-recent membership first).
// Falls back to a workspace the user created if no membership row exists.
async function resolveCallerWorkspace(userId: string) {
  const memberships = await db
    .select()
    .from(workspace_members)
    .where(eq(workspace_members.user_id, userId))
    .orderBy(desc(workspace_members.created_at))

  if (memberships.length > 0) {
    const [ws] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, memberships[0].workspace_id))
    if (ws) return { workspace: ws, membership: memberships[0] }
  }

  const owned = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.created_by, userId))
    .orderBy(desc(workspaces.created_at))
  if (owned.length > 0) {
    return { workspace: owned[0], membership: null }
  }

  return { workspace: null, membership: null }
}

async function readNotificationPrefs(
  workspaceId: string,
  userId: string,
): Promise<Record<NotificationCategory, boolean>> {
  const rows = await db
    .select()
    .from(audit_logs)
    .where(
      and(
        eq(audit_logs.workspace_id, workspaceId),
        eq(audit_logs.actor_user_id, userId),
        eq(audit_logs.action, PREFS_ACTION),
        eq(audit_logs.entity_type, PREFS_ENTITY),
      ),
    )
    .orderBy(desc(audit_logs.created_at))
    .limit(1)

  const prefs = defaultNotificationPrefs()
  if (rows.length > 0 && rows[0].detail && typeof rows[0].detail === 'object') {
    const stored = rows[0].detail as Record<string, unknown>
    for (const cat of NOTIFICATION_CATEGORIES) {
      if (typeof stored[cat] === 'boolean') prefs[cat] = stored[cat] as boolean
    }
  }
  return prefs
}

// ---------------------------------------------------------------------------
// GET / — current user settings + workspace profile + notification prefs
// ---------------------------------------------------------------------------

router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)

  const { workspace, membership } = await resolveCallerWorkspace(userId)

  if (!workspace) {
    // No workspace yet: return defaults so the settings UI can render.
    return c.json({
      user: { id: userId, role: null },
      workspace: null,
      notificationPrefs: defaultNotificationPrefs(),
      watchedCountryIds: [],
    })
  }

  const notificationPrefs = await readNotificationPrefs(workspace.id, userId)

  const subs = await db
    .select()
    .from(country_subscriptions)
    .where(
      and(
        eq(country_subscriptions.workspace_id, workspace.id),
        eq(country_subscriptions.user_id, userId),
      ),
    )

  return c.json({
    user: { id: userId, role: membership?.role ?? 'owner' },
    workspace: {
      id: workspace.id,
      name: workspace.name,
      default_regime: workspace.default_regime,
      exporting_entities: workspace.exporting_entities ?? [],
      tia_review_months: workspace.tia_review_months,
      created_by: workspace.created_by,
      created_at: workspace.created_at,
      updated_at: workspace.updated_at,
    },
    notificationPrefs,
    watchedCountryIds: subs.map((s) => s.country_id),
  })
})

// ---------------------------------------------------------------------------
// PUT / — update workspace profile and/or notification prefs
// ---------------------------------------------------------------------------

const updateSchema = z.object({
  workspace_id: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  default_regime: z.enum(['EU', 'UK']).optional(),
  exporting_entities: z.array(z.string()).optional(),
  tia_review_months: z.number().int().min(1).max(120).optional(),
  notificationPrefs: z
    .object({
      gap: z.boolean().optional(),
      expiry: z.boolean().optional(),
      tia_overdue: z.boolean().optional(),
      adequacy_change: z.boolean().optional(),
      task: z.boolean().optional(),
      review: z.boolean().optional(),
    })
    .optional(),
})

router.put('/', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  // Determine the target workspace: explicit body.workspace_id (with
  // ownership/membership check) or the caller's resolved workspace.
  let workspaceRow
  if (body.workspace_id) {
    const [ws] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, body.workspace_id))
    if (!ws) return c.json({ error: 'Workspace not found' }, 404)
    const [member] = await db
      .select()
      .from(workspace_members)
      .where(
        and(
          eq(workspace_members.workspace_id, ws.id),
          eq(workspace_members.user_id, userId),
        ),
      )
    if (!member && ws.created_by !== userId) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    workspaceRow = ws
  } else {
    const { workspace } = await resolveCallerWorkspace(userId)
    if (!workspace) return c.json({ error: 'No workspace to update' }, 404)
    workspaceRow = workspace
  }

  // Apply profile updates if any profile field was supplied.
  const profilePatch: Record<string, unknown> = {}
  if (body.name !== undefined) profilePatch.name = body.name
  if (body.default_regime !== undefined) profilePatch.default_regime = body.default_regime
  if (body.exporting_entities !== undefined) profilePatch.exporting_entities = body.exporting_entities
  if (body.tia_review_months !== undefined) profilePatch.tia_review_months = body.tia_review_months

  if (Object.keys(profilePatch).length > 0) {
    profilePatch.updated_at = new Date()
    const [updated] = await db
      .update(workspaces)
      .set(profilePatch)
      .where(eq(workspaces.id, workspaceRow.id))
      .returning()
    workspaceRow = updated
    await db.insert(audit_logs).values({
      workspace_id: workspaceRow.id,
      actor_user_id: userId,
      action: 'update',
      entity_type: 'workspace',
      entity_id: workspaceRow.id,
      detail: profilePatch as Record<string, unknown>,
    })
  }

  // Apply notification-pref updates by appending a new prefs snapshot.
  let notificationPrefs = await readNotificationPrefs(workspaceRow.id, userId)
  if (body.notificationPrefs) {
    notificationPrefs = { ...notificationPrefs, ...body.notificationPrefs }
    await db.insert(audit_logs).values({
      workspace_id: workspaceRow.id,
      actor_user_id: userId,
      action: PREFS_ACTION,
      entity_type: PREFS_ENTITY,
      entity_id: userId,
      detail: notificationPrefs as Record<string, unknown>,
    })
  }

  const subs = await db
    .select()
    .from(country_subscriptions)
    .where(
      and(
        eq(country_subscriptions.workspace_id, workspaceRow.id),
        eq(country_subscriptions.user_id, userId),
      ),
    )

  return c.json({
    user: { id: userId, role: 'owner' },
    workspace: {
      id: workspaceRow.id,
      name: workspaceRow.name,
      default_regime: workspaceRow.default_regime,
      exporting_entities: workspaceRow.exporting_entities ?? [],
      tia_review_months: workspaceRow.tia_review_months,
      created_by: workspaceRow.created_by,
      created_at: workspaceRow.created_at,
      updated_at: workspaceRow.updated_at,
    },
    notificationPrefs,
    watchedCountryIds: subs.map((s) => s.country_id),
  })
})

export default router
