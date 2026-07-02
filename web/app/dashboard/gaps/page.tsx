'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, coverageTone } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader, Spinner } from '@/components/ui/Spinner'

type Gap = {
  id?: string
  flow_id?: string
  flow_name?: string
  name?: string
  state?: string
  verdict?: string
  risk_score?: number
  failed_conditions?: string[]
  sensitivity?: number
  volume_band?: string
  destination?: string
  recommended_action?: string
  [k: string]: any
}

type Task = {
  id: string
  workspace_id?: string
  flow_id?: string | null
  flow_name?: string
  title: string
  action_type?: string | null
  status: string
  priority: string
  assignee_user_id?: string | null
  due_date?: string | null
  resolution_note?: string | null
  created_at?: string
  [k: string]: any
}

const TASK_STATUSES = ['open', 'in-progress', 'done']
const PRIORITIES = ['low', 'medium', 'high', 'critical']
const ACTION_TYPES = ['attach_scc', 'complete_tia', 'confirm_adequacy', 'repaper', 'review']

function fmtDate(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function priorityTone(p?: string) {
  switch ((p ?? '').toLowerCase()) {
    case 'critical':
    case 'high':
      return 'danger'
    case 'medium':
      return 'warning'
    default:
      return 'neutral'
  }
}

function riskBand(score?: number) {
  const s = score ?? 0
  if (s >= 70) return { label: 'High', tone: 'danger' as const }
  if (s >= 40) return { label: 'Medium', tone: 'warning' as const }
  return { label: 'Low', tone: 'success' as const }
}

export default function GapsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [gaps, setGaps] = useState<Gap[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // filters
  const [taskStatusFilter, setTaskStatusFilter] = useState('all')
  const [taskPriorityFilter, setTaskPriorityFilter] = useState('all')
  const [search, setSearch] = useState('')

  // create / edit task modal
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [form, setForm] = useState({
    title: '',
    flow_id: '',
    action_type: '',
    priority: 'medium',
    status: 'open',
    due_date: '',
    assignee_user_id: '',
    resolution_note: '',
  })

  async function loadAll(wsId?: string | null) {
    setError(null)
    try {
      const ws = wsId ?? workspaceId
      const params = ws ? { workspace_id: ws } : undefined
      const [g, t] = await Promise.all([
        api.getGaps(params).catch(() => []),
        api.getTasks(params).catch(() => []),
      ])
      setGaps(Array.isArray(g) ? g : (g?.gaps ?? []))
      setTasks(Array.isArray(t) ? t : (t?.tasks ?? []))
    } catch (e: any) {
      setError(e?.message || 'Failed to load gaps & tasks')
    }
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      try {
        const ws: any[] = await api.getMyWorkspaces().catch(() => [])
        const wsId = Array.isArray(ws) && ws.length ? ws[0].id : null
        if (!mounted) return
        setWorkspaceId(wsId)
        await loadAll(wsId)
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to load')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tasks.filter((t) => {
      if (taskStatusFilter !== 'all' && t.status !== taskStatusFilter) return false
      if (taskPriorityFilter !== 'all' && t.priority !== taskPriorityFilter) return false
      if (q && !`${t.title} ${t.flow_name ?? ''} ${t.action_type ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [tasks, taskStatusFilter, taskPriorityFilter, search])

  const stats = useMemo(() => {
    const open = tasks.filter((t) => t.status === 'open').length
    const inProgress = tasks.filter((t) => t.status === 'in-progress').length
    const done = tasks.filter((t) => t.status === 'done').length
    const highRiskGaps = gaps.filter((g) => (g.risk_score ?? 0) >= 70).length
    return { openGaps: gaps.length, highRiskGaps, open, inProgress, done }
  }, [gaps, tasks])

  function openCreate(prefill?: Partial<typeof form>) {
    setEditingTask(null)
    setFormError(null)
    setForm({
      title: prefill?.title ?? '',
      flow_id: prefill?.flow_id ?? '',
      action_type: prefill?.action_type ?? '',
      priority: prefill?.priority ?? 'medium',
      status: 'open',
      due_date: '',
      assignee_user_id: '',
      resolution_note: '',
    })
    setTaskModalOpen(true)
  }

  function openEdit(t: Task) {
    setEditingTask(t)
    setFormError(null)
    setForm({
      title: t.title ?? '',
      flow_id: t.flow_id ?? '',
      action_type: t.action_type ?? '',
      priority: t.priority ?? 'medium',
      status: t.status ?? 'open',
      due_date: t.due_date ? t.due_date.slice(0, 10) : '',
      assignee_user_id: t.assignee_user_id ?? '',
      resolution_note: t.resolution_note ?? '',
    })
    setTaskModalOpen(true)
  }

  async function submitTask(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) {
      setFormError('Title is required')
      return
    }
    setSaving(true)
    setFormError(null)
    const payload: any = {
      workspace_id: workspaceId,
      title: form.title.trim(),
      flow_id: form.flow_id || null,
      action_type: form.action_type || null,
      priority: form.priority,
      status: form.status,
      due_date: form.due_date || null,
      assignee_user_id: form.assignee_user_id || null,
      resolution_note: form.resolution_note || null,
    }
    try {
      if (editingTask) {
        await api.updateTask(editingTask.id, payload)
      } else {
        await api.createTask(payload)
      }
      setTaskModalOpen(false)
      await loadAll()
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save task')
    } finally {
      setSaving(false)
    }
  }

  async function quickStatus(t: Task, status: string) {
    try {
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status } : x)))
      await api.updateTask(t.id, { status })
      await loadAll()
    } catch (e: any) {
      setError(e?.message || 'Failed to update task')
      await loadAll()
    }
  }

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    try {
      await api.generateTasks(workspaceId ? { workspace_id: workspaceId } : undefined)
      await loadAll()
    } catch (e: any) {
      setError(e?.message || 'Failed to generate tasks')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return <PageLoader label="Loading gaps & remediation…" />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Gaps &amp; Remediation</h1>
          <p className="mt-1 text-sm text-slate-400">
            Open Chapter V coverage gaps ranked by sensitivity and volume, with a remediation task workspace.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleGenerate} disabled={generating}>
            {generating ? 'Generating…' : 'Auto-generate tasks'}
          </Button>
          <Button onClick={() => openCreate()}>New task</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Open gaps" value={stats.openGaps} tone={stats.openGaps ? 'danger' : 'success'} />
        <Stat label="High-risk gaps" value={stats.highRiskGaps} tone={stats.highRiskGaps ? 'danger' : 'default'} />
        <Stat label="Open tasks" value={stats.open} tone={stats.open ? 'warning' : 'default'} />
        <Stat label="In progress" value={stats.inProgress} />
        <Stat label="Done" value={stats.done} tone="success" />
      </div>

      {/* Gaps section */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Open coverage gaps</h2>
            <p className="text-xs text-slate-500">Ranked by computed risk score (sensitivity × volume × adequacy).</p>
          </div>
          <Badge tone="neutral">{gaps.length} gaps</Badge>
        </CardHeader>
        <CardBody className="p-0">
          {gaps.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No open gaps"
                description="Every transfer flow currently has a valid coverage verdict. Recompute coverage to refresh."
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Flow</TH>
                  <TH>State / Verdict</TH>
                  <TH>Failed conditions</TH>
                  <TH>Risk</TH>
                  <TH className="text-right">Action</TH>
                </TR>
              </THead>
              <TBody>
                {[...gaps]
                  .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))
                  .map((g, i) => {
                    const band = riskBand(g.risk_score)
                    const fails = g.failed_conditions ?? []
                    return (
                      <TR key={g.id ?? g.flow_id ?? i}>
                        <TD>
                          <div className="font-medium text-slate-100">
                            {g.flow_name ?? g.name ?? g.flow_id ?? 'Unnamed flow'}
                          </div>
                          {g.destination && <div className="text-xs text-slate-500">to {g.destination}</div>}
                        </TD>
                        <TD>
                          <Badge tone={coverageTone(g.verdict ?? g.state)}>{g.verdict ?? g.state ?? 'gap'}</Badge>
                        </TD>
                        <TD>
                          {fails.length ? (
                            <div className="flex flex-wrap gap-1">
                              {fails.slice(0, 4).map((f, fi) => (
                                <span
                                  key={fi}
                                  className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300"
                                >
                                  {f}
                                </span>
                              ))}
                              {fails.length > 4 && (
                                <span className="text-[11px] text-slate-500">+{fails.length - 4}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">—</span>
                          )}
                        </TD>
                        <TD>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-800">
                              <div
                                className={
                                  band.tone === 'danger'
                                    ? 'h-full bg-rose-500'
                                    : band.tone === 'warning'
                                    ? 'h-full bg-amber-500'
                                    : 'h-full bg-emerald-500'
                                }
                                style={{ width: `${Math.min(100, g.risk_score ?? 0)}%` }}
                              />
                            </div>
                            <Badge tone={band.tone}>{g.risk_score ?? 0}</Badge>
                          </div>
                        </TD>
                        <TD className="text-right">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              openCreate({
                                title: `Remediate: ${g.flow_name ?? g.name ?? 'flow'}`,
                                flow_id: g.flow_id ?? '',
                                action_type: g.recommended_action ?? '',
                                priority: band.tone === 'danger' ? 'high' : 'medium',
                              })
                            }
                          >
                            Create task
                          </Button>
                        </TD>
                      </TR>
                    )
                  })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Tasks section */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-base font-semibold text-white">Remediation tasks</h2>
            <div className="flex flex-wrap gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks…"
                className="w-44 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-yellow-400 focus:outline-none"
              />
              <select
                value={taskStatusFilter}
                onChange={(e) => setTaskStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
              >
                <option value="all">All statuses</option>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={taskPriorityFilter}
                onChange={(e) => setTaskPriorityFilter(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
              >
                <option value="all">All priorities</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {filteredTasks.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title={tasks.length ? 'No tasks match your filters' : 'No remediation tasks yet'}
                description={
                  tasks.length
                    ? 'Adjust the status, priority, or search filters.'
                    : 'Auto-generate tasks from current gaps, or create one manually.'
                }
                action={
                  tasks.length ? undefined : (
                    <Button variant="secondary" onClick={handleGenerate} disabled={generating}>
                      {generating ? 'Generating…' : 'Auto-generate tasks'}
                    </Button>
                  )
                }
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Task</TH>
                  <TH>Action</TH>
                  <TH>Priority</TH>
                  <TH>Status</TH>
                  <TH>Due</TH>
                  <TH className="text-right">Manage</TH>
                </TR>
              </THead>
              <TBody>
                {filteredTasks.map((t) => (
                  <TR key={t.id}>
                    <TD>
                      <div className="font-medium text-slate-100">{t.title}</div>
                      {t.flow_name && <div className="text-xs text-slate-500">{t.flow_name}</div>}
                      {t.resolution_note && (
                        <div className="mt-0.5 text-xs text-slate-500 italic">{t.resolution_note}</div>
                      )}
                    </TD>
                    <TD>
                      {t.action_type ? (
                        <Badge tone="info">{t.action_type.replace(/_/g, ' ')}</Badge>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </TD>
                    <TD>
                      <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
                    </TD>
                    <TD>
                      <select
                        value={t.status}
                        onChange={(e) => quickStatus(t, e.target.value)}
                        className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 focus:border-yellow-400 focus:outline-none"
                      >
                        {TASK_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </TD>
                    <TD className="text-slate-400">{fmtDate(t.due_date)}</TD>
                    <TD className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>
                        Edit
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal
        open={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        title={editingTask ? 'Edit remediation task' : 'New remediation task'}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setTaskModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submitTask} disabled={saving}>
              {saving ? <Spinner /> : editingTask ? 'Save changes' : 'Create task'}
            </Button>
          </div>
        }
      >
        <form onSubmit={submitTask} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {formError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
              placeholder="e.g. Attach SCC Module 2 for vendor X"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Action type</label>
              <select
                value={form.action_type}
                onChange={(e) => setForm({ ...form, action_type: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
              >
                <option value="">— none —</option>
                {ACTION_TYPES.map((a) => (
                  <option key={a} value={a}>
                    {a.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Due date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Flow ID (optional)</label>
            <input
              value={form.flow_id}
              onChange={(e) => setForm({ ...form, flow_id: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
              placeholder="Link to a transfer flow"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Assignee user ID (optional)</label>
            <input
              value={form.assignee_user_id}
              onChange={(e) => setForm({ ...form, assignee_user_id: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
            />
          </div>
          {(editingTask || form.status === 'done') && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Resolution note</label>
              <textarea
                value={form.resolution_note}
                onChange={(e) => setForm({ ...form, resolution_note: e.target.value })}
                rows={2}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
                placeholder="How was this remediated?"
              />
            </div>
          )}
        </form>
      </Modal>
    </div>
  )
}
