'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { authClient } from '@/lib/auth/client'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Stat } from '@/components/ui/Stat'
import { Badge, coverageTone } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader, Spinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Workspace {
  id: string
  name?: string
  default_regime?: string
  exporting_entities?: string[]
  tia_review_months?: number
  created_by?: string
  created_at?: string
  updated_at?: string
}

interface WorkspaceMember {
  id: string
  workspace_id?: string
  user_id?: string
  role?: string
  created_at?: string
}

interface Settings {
  user_id?: string
  workspace?: Workspace | null
  workspace_id?: string | null
  notification_prefs?: Record<string, boolean> | null
  notify_adequacy?: boolean
  notify_expiry?: boolean
  notify_reviews?: boolean
  notify_gaps?: boolean
  default_regime?: string
  tia_review_months?: number
  [k: string]: any
}

interface Plan {
  id?: string
  name?: string
  price_cents?: number
}

interface Subscription {
  id?: string
  plan_id?: string
  status?: string
  current_period_end?: string | null
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
}

interface BillingInfo {
  subscription?: Subscription | null
  plan?: Plan | null
  stripeEnabled?: boolean
}

const REGIMES = ['EU', 'UK', 'EU+UK']
const NOTIFY_KEYS: { key: string; label: string; hint: string }[] = [
  { key: 'notify_adequacy', label: 'Adequacy changes', hint: 'Country adequacy status changes affecting your flows' },
  { key: 'notify_expiry', label: 'SCC / mechanism expiry', hint: 'Agreements approaching expiry or needing repaper' },
  { key: 'notify_reviews', label: 'Review decisions', hint: 'Items entering or leaving the review queue' },
  { key: 'notify_gaps', label: 'New coverage gaps', hint: 'Flows newly flagged At-Risk or uncovered' },
]

function fmtDate(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtPrice(cents?: number) {
  if (cents == null) return '—'
  if (cents === 0) return 'Free'
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}/mo`
}

type Tab = 'profile' | 'workspaces' | 'members' | 'billing'

const TABS: { id: Tab; label: string }[] = [
  { id: 'profile', label: 'Profile & Notifications' },
  { id: 'workspaces', label: 'Workspaces' },
  { id: 'members', label: 'Members' },
  { id: 'billing', label: 'Billing' },
]

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('profile')

  const [settings, setSettings] = useState<Settings | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [billing, setBilling] = useState<BillingInfo | null>(null)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [sessionUser, setSessionUser] = useState<{ id?: string; email?: string; name?: string } | null>(null)

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

  // profile / notification form
  const [profileForm, setProfileForm] = useState({
    default_regime: 'EU',
    tia_review_months: 12,
    notify_adequacy: true,
    notify_expiry: true,
    notify_reviews: true,
    notify_gaps: true,
  })
  const [savingProfile, setSavingProfile] = useState(false)

  // workspace create/edit modal
  const [wsModalOpen, setWsModalOpen] = useState(false)
  const [editingWs, setEditingWs] = useState<Workspace | null>(null)
  const [wsForm, setWsForm] = useState({
    name: '',
    default_regime: 'EU',
    exporting_entities: '',
    tia_review_months: 12,
  })
  const [savingWs, setSavingWs] = useState(false)
  const [wsError, setWsError] = useState<string | null>(null)

  // invite modal
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteForm, setInviteForm] = useState({ user_id: '', role: 'member' })
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  const [membersLoading, setMembersLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [settingsRes, wsRes, billingRes] = await Promise.all([
        api.getSettings().catch(() => null),
        api.getMyWorkspaces().catch(() => []),
        api.getBillingPlan().catch(() => null),
      ])
      const s: Settings | null = settingsRes
      setSettings(s)
      const wsList: Workspace[] = Array.isArray(wsRes) ? wsRes : wsRes?.items ?? []
      setWorkspaces(wsList)
      setBilling(billingRes)

      const prefs = s?.notification_prefs || {}
      setProfileForm({
        default_regime: s?.default_regime || s?.workspace?.default_regime || 'EU',
        tia_review_months:
          s?.tia_review_months ?? s?.workspace?.tia_review_months ?? 12,
        notify_adequacy: prefs.notify_adequacy ?? s?.notify_adequacy ?? true,
        notify_expiry: prefs.notify_expiry ?? s?.notify_expiry ?? true,
        notify_reviews: prefs.notify_reviews ?? s?.notify_reviews ?? true,
        notify_gaps: prefs.notify_gaps ?? s?.notify_gaps ?? true,
      })

      const initialWs =
        s?.workspace?.id || s?.workspace_id || wsList[0]?.id || ''
      setActiveWorkspaceId((cur) => cur || initialWs)
    } catch (e: any) {
      setError(e?.message || 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    authClient
      .getSession()
      .then((s: any) => {
        if (s?.data?.user) {
          setSessionUser({
            id: s.data.user.id,
            email: s.data.user.email,
            name: s.data.user.name,
          })
        }
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadMembers(wsId: string) {
    if (!wsId) {
      setMembers([])
      return
    }
    setMembersLoading(true)
    try {
      const res = await api.getWorkspaceMembers(wsId)
      setMembers(Array.isArray(res) ? res : res?.items ?? [])
    } catch (e: any) {
      setMembers([])
      setError(e?.message || 'Failed to load members')
    } finally {
      setMembersLoading(false)
    }
  }

  useEffect(() => {
    if (activeWorkspaceId && (tab === 'members' || tab === 'workspaces')) {
      loadMembers(activeWorkspaceId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId, tab])

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) || null,
    [workspaces, activeWorkspaceId],
  )

  function flash(msg: string) {
    setBanner(msg)
    setTimeout(() => setBanner(null), 3500)
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSavingProfile(true)
    setError(null)
    try {
      await api.updateSettings({
        default_regime: profileForm.default_regime,
        tia_review_months: Number(profileForm.tia_review_months),
        notification_prefs: {
          notify_adequacy: profileForm.notify_adequacy,
          notify_expiry: profileForm.notify_expiry,
          notify_reviews: profileForm.notify_reviews,
          notify_gaps: profileForm.notify_gaps,
        },
      })
      flash('Settings saved')
      await load()
    } catch (err: any) {
      setError(err?.message || 'Failed to save settings')
    } finally {
      setSavingProfile(false)
    }
  }

  function openCreateWs() {
    setEditingWs(null)
    setWsForm({ name: '', default_regime: 'EU', exporting_entities: '', tia_review_months: 12 })
    setWsError(null)
    setWsModalOpen(true)
  }

  function openEditWs(w: Workspace) {
    setEditingWs(w)
    setWsForm({
      name: w.name || '',
      default_regime: w.default_regime || 'EU',
      exporting_entities: (w.exporting_entities || []).join(', '),
      tia_review_months: w.tia_review_months ?? 12,
    })
    setWsError(null)
    setWsModalOpen(true)
  }

  async function submitWs(e: React.FormEvent) {
    e.preventDefault()
    if (!wsForm.name.trim()) {
      setWsError('Workspace name is required')
      return
    }
    setSavingWs(true)
    setWsError(null)
    try {
      const payload = {
        name: wsForm.name.trim(),
        default_regime: wsForm.default_regime,
        exporting_entities: wsForm.exporting_entities
          ? wsForm.exporting_entities.split(',').map((x) => x.trim()).filter(Boolean)
          : [],
        tia_review_months: Number(wsForm.tia_review_months),
      }
      if (editingWs) {
        await api.updateWorkspace(editingWs.id, payload)
        flash('Workspace updated')
      } else {
        const created: Workspace = await api.createWorkspace(payload)
        flash('Workspace created')
        if (created?.id) setActiveWorkspaceId(created.id)
      }
      setWsModalOpen(false)
      await load()
    } catch (err: any) {
      setWsError(err?.message || 'Failed to save workspace')
    } finally {
      setSavingWs(false)
    }
  }

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!activeWorkspaceId) {
      setInviteError('Select a workspace first')
      return
    }
    if (!inviteForm.user_id.trim()) {
      setInviteError('User ID is required')
      return
    }
    setInviting(true)
    setInviteError(null)
    try {
      await api.inviteMember(activeWorkspaceId, {
        user_id: inviteForm.user_id.trim(),
        role: inviteForm.role,
      })
      setInviteOpen(false)
      setInviteForm({ user_id: '', role: 'member' })
      flash('Member invited')
      await loadMembers(activeWorkspaceId)
    } catch (err: any) {
      setInviteError(err?.message || 'Failed to invite member')
    } finally {
      setInviting(false)
    }
  }

  async function startCheckout() {
    setBusy(true)
    setError(null)
    try {
      const res = await api.startCheckout({})
      if (res?.url) {
        window.location.href = res.url
      } else {
        flash('Checkout session created')
      }
    } catch (err: any) {
      setError(err?.message || 'Checkout is not available')
    } finally {
      setBusy(false)
    }
  }

  async function openPortal() {
    setBusy(true)
    setError(null)
    try {
      const res = await api.openBillingPortal({})
      if (res?.url) {
        window.location.href = res.url
      } else {
        flash('Billing portal opened')
      }
    } catch (err: any) {
      setError(err?.message || 'Billing portal is not available')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <PageLoader label="Loading settings..." />

  const sub = billing?.subscription
  const plan = billing?.plan
  const isPro = (sub?.plan_id || plan?.id) === 'pro'
  const stripeEnabled = !!billing?.stripeEnabled

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Settings</h1>
          <p className="mt-1 text-sm text-slate-400">
            Workspace profile, members, notification preferences, and billing.
          </p>
        </div>
      </div>

      {banner && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {banner}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'border-yellow-400 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* PROFILE & NOTIFICATIONS */}
      {tab === 'profile' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <span className="text-sm font-semibold text-white">Account</span>
            </CardHeader>
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Signed in as
                </div>
                <div className="mt-1 text-sm text-slate-200">
                  {sessionUser?.name || sessionUser?.email || '—'}
                </div>
                {sessionUser?.email && sessionUser?.name && (
                  <div className="text-xs text-slate-500">{sessionUser.email}</div>
                )}
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  User ID
                </div>
                <div className="mt-1 break-all font-mono text-xs text-slate-400">
                  {sessionUser?.id || settings?.user_id || '—'}
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <span className="text-sm font-semibold text-white">
                Compliance defaults & notifications
              </span>
            </CardHeader>
            <CardBody>
              <form onSubmit={saveProfile} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-400">
                      Default regime
                    </label>
                    <select
                      value={profileForm.default_regime}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, default_regime: e.target.value })
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
                    >
                      {REGIMES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-400">
                      TIA review cadence (months)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={profileForm.tia_review_months}
                      onChange={(e) =>
                        setProfileForm({
                          ...profileForm,
                          tia_review_months: Number(e.target.value),
                        })
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Notification preferences
                  </div>
                  <div className="space-y-2">
                    {NOTIFY_KEYS.map((n) => (
                      <label
                        key={n.key}
                        className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5"
                      >
                        <input
                          type="checkbox"
                          checked={(profileForm as any)[n.key]}
                          onChange={(e) =>
                            setProfileForm({ ...profileForm, [n.key]: e.target.checked })
                          }
                          className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900"
                        />
                        <span>
                          <span className="block text-sm text-slate-200">{n.label}</span>
                          <span className="block text-xs text-slate-500">{n.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={savingProfile}>
                    {savingProfile ? <Spinner /> : 'Save settings'}
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        </div>
      )}

      {/* WORKSPACES */}
      {tab === 'workspaces' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Workspaces" value={workspaces.length} />
            <Stat label="Active regime" value={activeWorkspace?.default_regime || profileForm.default_regime} />
            <Stat
              label="Exporting entities"
              value={activeWorkspace?.exporting_entities?.length ?? 0}
            />
            <Stat
              label="TIA cadence"
              value={`${activeWorkspace?.tia_review_months ?? profileForm.tia_review_months} mo`}
            />
          </div>

          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-semibold text-white">Your workspaces</span>
              <Button size="sm" onClick={openCreateWs}>
                + New workspace
              </Button>
            </CardHeader>
            <CardBody className="p-0">
              {workspaces.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="No workspaces yet"
                    description="Create a workspace to start building your cross-border transfer register."
                    action={<Button onClick={openCreateWs}>+ New workspace</Button>}
                  />
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Name</TH>
                      <TH>Regime</TH>
                      <TH>Exporting entities</TH>
                      <TH>TIA cadence</TH>
                      <TH>Created</TH>
                      <TH className="text-right">Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {workspaces.map((w) => (
                      <TR key={w.id}>
                        <TD className="font-medium text-slate-100">
                          <div className="flex items-center gap-2">
                            {w.name || w.id}
                            {w.id === activeWorkspaceId && <Badge tone="info">Active</Badge>}
                          </div>
                        </TD>
                        <TD>
                          <Badge tone={coverageTone(w.default_regime)}>
                            {w.default_regime || '—'}
                          </Badge>
                        </TD>
                        <TD className="text-slate-400">
                          {(w.exporting_entities || []).length
                            ? (w.exporting_entities || []).join(', ')
                            : '—'}
                        </TD>
                        <TD className="text-slate-400">{w.tia_review_months ?? '—'} mo</TD>
                        <TD className="text-slate-400">{fmtDate(w.created_at)}</TD>
                        <TD>
                          <div className="flex justify-end gap-1.5">
                            {w.id !== activeWorkspaceId && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setActiveWorkspaceId(w.id)}
                              >
                                Set active
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => openEditWs(w)}>
                              Edit
                            </Button>
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* MEMBERS */}
      {tab === 'members' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold text-white">Members</span>
                <select
                  value={activeWorkspaceId}
                  onChange={(e) => setActiveWorkspaceId(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
                >
                  {workspaces.length === 0 && <option value="">No workspaces</option>}
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name || w.id}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                size="sm"
                disabled={!activeWorkspaceId}
                onClick={() => {
                  setInviteForm({ user_id: '', role: 'member' })
                  setInviteError(null)
                  setInviteOpen(true)
                }}
              >
                + Invite member
              </Button>
            </CardHeader>
            <CardBody className="p-0">
              {!activeWorkspaceId ? (
                <div className="p-6">
                  <EmptyState
                    title="No workspace selected"
                    description="Create or select a workspace to manage its members."
                  />
                </div>
              ) : membersLoading ? (
                <div className="p-10">
                  <Spinner label="Loading members..." />
                </div>
              ) : members.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="No members yet"
                    description="Invite teammates by their user ID to collaborate on this workspace."
                    action={
                      <Button onClick={() => setInviteOpen(true)}>+ Invite member</Button>
                    }
                  />
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>User ID</TH>
                      <TH>Role</TH>
                      <TH>Joined</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {members.map((m) => (
                      <TR key={m.id}>
                        <TD className="break-all font-mono text-xs text-slate-300">
                          {m.user_id}
                          {m.user_id && m.user_id === (sessionUser?.id || settings?.user_id) && (
                            <Badge tone="info" className="ml-2">
                              You
                            </Badge>
                          )}
                        </TD>
                        <TD>
                          <Badge tone={(m.role || '').toLowerCase() === 'owner' ? 'success' : 'neutral'}>
                            {m.role || 'member'}
                          </Badge>
                        </TD>
                        <TD className="text-slate-400">{fmtDate(m.created_at)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* BILLING */}
      {tab === 'billing' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat
              label="Current plan"
              value={plan?.name || (isPro ? 'Pro' : 'Free')}
              tone={isPro ? 'success' : 'default'}
            />
            <Stat label="Price" value={fmtPrice(plan?.price_cents)} />
            <Stat
              label="Status"
              value={sub?.status || 'active'}
              tone={(sub?.status || 'active') === 'active' ? 'success' : 'warning'}
            />
          </div>

          {sub?.current_period_end && (
            <Card>
              <CardBody className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-slate-400">Current period ends</span>
                <span className="text-sm font-medium text-slate-200">
                  {fmtDate(sub.current_period_end)}
                </span>
              </CardBody>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card className={!isPro ? 'border-slate-700' : ''}>
              <CardHeader className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">Free</span>
                {!isPro && <Badge tone="info">Current</Badge>}
              </CardHeader>
              <CardBody>
                <div className="text-2xl font-semibold text-white">$0</div>
                <ul className="mt-3 space-y-1.5 text-sm text-slate-400">
                  <li>Full transfer-flow register</li>
                  <li>Mechanism & SCC tracking</li>
                  <li>EDPB TIA workflow</li>
                  <li>Coverage scorecard & gaps</li>
                </ul>
              </CardBody>
            </Card>

            <Card className={isPro ? 'border-yellow-500/40' : 'border-slate-700'}>
              <CardHeader className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">Pro</span>
                {isPro ? <Badge tone="success">Current</Badge> : <Badge tone="info">Upgrade</Badge>}
              </CardHeader>
              <CardBody>
                <div className="text-2xl font-semibold text-white">
                  {fmtPrice(plan?.price_cents && isPro ? plan?.price_cents : undefined) !== '—' && isPro
                    ? fmtPrice(plan?.price_cents)
                    : 'Pro features'}
                </div>
                <ul className="mt-3 space-y-1.5 text-sm text-slate-400">
                  <li>Audit-pack exports</li>
                  <li>Saved report snapshots</li>
                  <li>Priority adequacy alerts</li>
                  <li>Extended retention</li>
                </ul>
                <div className="mt-4">
                  {isPro ? (
                    <Button variant="secondary" disabled={busy || !stripeEnabled} onClick={openPortal}>
                      {busy ? <Spinner /> : 'Manage subscription'}
                    </Button>
                  ) : (
                    <Button disabled={busy || !stripeEnabled} onClick={startCheckout}>
                      {busy ? <Spinner /> : 'Upgrade to Pro'}
                    </Button>
                  )}
                </div>
                {!stripeEnabled && (
                  <p className="mt-2 text-xs text-slate-500">
                    Billing is not configured on this deployment. All features are currently
                    available on the free plan.
                  </p>
                )}
              </CardBody>
            </Card>
          </div>

          {isPro && stripeEnabled && (
            <Card>
              <CardBody className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-slate-400">
                  Update payment method, view invoices, or cancel.
                </span>
                <Button variant="secondary" disabled={busy} onClick={openPortal}>
                  {busy ? <Spinner /> : 'Open billing portal'}
                </Button>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {/* Workspace create/edit modal */}
      <Modal
        open={wsModalOpen}
        onClose={() => setWsModalOpen(false)}
        title={editingWs ? 'Edit workspace' : 'New workspace'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setWsModalOpen(false)}>
              Cancel
            </Button>
            <Button form="ws-form" type="submit" disabled={savingWs}>
              {savingWs ? <Spinner /> : editingWs ? 'Save changes' : 'Create'}
            </Button>
          </div>
        }
      >
        <form id="ws-form" onSubmit={submitWs} className="space-y-4">
          {wsError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {wsError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Name</label>
            <input
              value={wsForm.name}
              onChange={(e) => setWsForm({ ...wsForm, name: e.target.value })}
              placeholder="Acme EU Compliance"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-yellow-400 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Default regime</label>
              <select
                value={wsForm.default_regime}
                onChange={(e) => setWsForm({ ...wsForm, default_regime: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
              >
                {REGIMES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                TIA cadence (months)
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={wsForm.tia_review_months}
                onChange={(e) =>
                  setWsForm({ ...wsForm, tia_review_months: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Exporting entities (comma-separated)
            </label>
            <input
              value={wsForm.exporting_entities}
              onChange={(e) => setWsForm({ ...wsForm, exporting_entities: e.target.value })}
              placeholder="Acme GmbH, Acme UK Ltd"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-yellow-400 focus:outline-none"
            />
          </div>
        </form>
      </Modal>

      {/* Invite member modal */}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite member"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button form="invite-form" type="submit" disabled={inviting}>
              {inviting ? <Spinner /> : 'Invite'}
            </Button>
          </div>
        }
      >
        <form id="invite-form" onSubmit={submitInvite} className="space-y-4">
          {inviteError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {inviteError}
            </div>
          )}
          <p className="text-sm text-slate-400">
            Adding member to{' '}
            <span className="font-medium text-slate-200">
              {activeWorkspace?.name || activeWorkspaceId || '—'}
            </span>
            .
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">User ID</label>
            <input
              value={inviteForm.user_id}
              onChange={(e) => setInviteForm({ ...inviteForm, user_id: e.target.value })}
              placeholder="usr_..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-yellow-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Role</label>
            <select
              value={inviteForm.role}
              onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
            >
              <option value="member">Member</option>
              <option value="reviewer">Reviewer</option>
              <option value="owner">Owner</option>
            </select>
          </div>
        </form>
      </Modal>
    </div>
  )
}
