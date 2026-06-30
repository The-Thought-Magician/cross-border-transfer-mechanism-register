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

type Review = {
  id: string
  workspace_id?: string
  entity_type: string
  entity_id: string
  status: string
  reviewer_user_id?: string | null
  decided_by?: string | null
  decided_at?: string | null
  comment?: string | null
  created_by?: string
  created_at?: string
  [k: string]: any
}

const ENTITY_TYPES = ['tia', 'scc', 'flow']
const STATUSES = ['draft', 'in-review', 'approved', 'rejected']

function fmtDateTime(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function entityTone(t: string) {
  switch (t) {
    case 'tia':
      return 'info'
    case 'scc':
      return 'review'
    case 'flow':
      return 'neutral'
    default:
      return 'neutral'
  }
}

export default function ReviewsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [entityFilter, setEntityFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  // open review modal
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState({ entity_type: 'tia', entity_id: '', reviewer_user_id: '', comment: '' })

  // decide modal
  const [decideTarget, setDecideTarget] = useState<Review | null>(null)
  const [decideComment, setDecideComment] = useState('')
  const [deciding, setDeciding] = useState(false)
  const [decideError, setDecideError] = useState<string | null>(null)

  async function load(wsId?: string | null) {
    setError(null)
    try {
      const ws = wsId ?? workspaceId
      const params = ws ? { workspace_id: ws } : undefined
      const r = await api.getReviews(params)
      setReviews(Array.isArray(r) ? r : (r?.reviews ?? []))
    } catch (e: any) {
      setError(e?.message || 'Failed to load reviews')
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
        await load(wsId)
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return reviews.filter((r) => {
      if (entityFilter !== 'all' && r.entity_type !== entityFilter) return false
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (q && !`${r.entity_type} ${r.entity_id} ${r.comment ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [reviews, entityFilter, statusFilter, search])

  const stats = useMemo(() => {
    const pending = reviews.filter((r) => r.status === 'draft' || r.status === 'in-review').length
    const approved = reviews.filter((r) => r.status === 'approved').length
    const rejected = reviews.filter((r) => r.status === 'rejected').length
    return { total: reviews.length, pending, approved, rejected }
  }, [reviews])

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.entity_id.trim()) {
      setFormError('Entity ID is required')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await api.createReview({
        workspace_id: workspaceId,
        entity_type: form.entity_type,
        entity_id: form.entity_id.trim(),
        reviewer_user_id: form.reviewer_user_id || null,
        comment: form.comment || null,
      })
      setCreateOpen(false)
      setForm({ entity_type: 'tia', entity_id: '', reviewer_user_id: '', comment: '' })
      await load()
    } catch (err: any) {
      setFormError(err?.message || 'Failed to open review')
    } finally {
      setSaving(false)
    }
  }

  function openDecide(r: Review) {
    setDecideTarget(r)
    setDecideComment(r.comment ?? '')
    setDecideError(null)
  }

  async function decide(status: 'approved' | 'rejected') {
    if (!decideTarget) return
    setDeciding(true)
    setDecideError(null)
    try {
      await api.decideReview(decideTarget.id, { status, comment: decideComment || null })
      setDecideTarget(null)
      await load()
    } catch (err: any) {
      setDecideError(err?.message || 'Failed to record decision')
    } finally {
      setDeciding(false)
    }
  }

  if (loading) return <PageLoader label="Loading review queue…" />

  const pendingRows = filtered.filter((r) => r.status === 'draft' || r.status === 'in-review')
  const decidedRows = filtered.filter((r) => r.status === 'approved' || r.status === 'rejected')

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Review &amp; Approval Queue</h1>
          <p className="mt-1 text-sm text-slate-400">
            Sign-off workflow for TIAs, SCC agreements, and transfer flows. Approve or reject pending items.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Open review</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total reviews" value={stats.total} />
        <Stat label="Pending" value={stats.pending} tone={stats.pending ? 'warning' : 'default'} />
        <Stat label="Approved" value={stats.approved} tone="success" />
        <Stat label="Rejected" value={stats.rejected} tone={stats.rejected ? 'danger' : 'default'} />
      </div>

      {/* filters */}
      <Card>
        <CardBody className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by entity or comment…"
            className="w-56 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
          >
            <option value="all">All entity types</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.toUpperCase()}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
          >
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </CardBody>
      </Card>

      {/* Pending queue */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Pending decisions</h2>
          <Badge tone={pendingRows.length ? 'warning' : 'neutral'}>{pendingRows.length}</Badge>
        </CardHeader>
        <CardBody className="p-0">
          {pendingRows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Queue is clear"
                description="No reviews are awaiting a decision. Open a review to route a TIA, SCC, or flow for sign-off."
                action={<Button variant="secondary" onClick={() => setCreateOpen(true)}>Open review</Button>}
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Entity</TH>
                  <TH>Reviewer</TH>
                  <TH>Status</TH>
                  <TH>Opened</TH>
                  <TH className="text-right">Decision</TH>
                </TR>
              </THead>
              <TBody>
                {pendingRows.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Badge tone={entityTone(r.entity_type)}>{r.entity_type.toUpperCase()}</Badge>
                        <span className="font-mono text-xs text-slate-400">{r.entity_id}</span>
                      </div>
                      {r.comment && <div className="mt-1 text-xs text-slate-500">{r.comment}</div>}
                    </TD>
                    <TD className="text-slate-400">{r.reviewer_user_id || '—'}</TD>
                    <TD>
                      <Badge tone={coverageTone(r.status)}>{r.status}</Badge>
                    </TD>
                    <TD className="text-slate-400">{fmtDateTime(r.created_at)}</TD>
                    <TD className="text-right">
                      <Button size="sm" onClick={() => openDecide(r)}>
                        Decide
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Decided history */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Decided</h2>
          <Badge tone="neutral">{decidedRows.length}</Badge>
        </CardHeader>
        <CardBody className="p-0">
          {decidedRows.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No decisions yet" description="Approved and rejected reviews will appear here." />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Entity</TH>
                  <TH>Outcome</TH>
                  <TH>Decided by</TH>
                  <TH>Decided at</TH>
                  <TH>Comment</TH>
                </TR>
              </THead>
              <TBody>
                {decidedRows.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Badge tone={entityTone(r.entity_type)}>{r.entity_type.toUpperCase()}</Badge>
                        <span className="font-mono text-xs text-slate-400">{r.entity_id}</span>
                      </div>
                    </TD>
                    <TD>
                      <Badge tone={coverageTone(r.status)}>{r.status}</Badge>
                    </TD>
                    <TD className="text-slate-400">{r.decided_by || '—'}</TD>
                    <TD className="text-slate-400">{fmtDateTime(r.decided_at)}</TD>
                    <TD className="max-w-xs text-slate-400">{r.comment || '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Open review modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Open a review"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={saving}>
              {saving ? <Spinner /> : 'Open review'}
            </Button>
          </div>
        }
      >
        <form onSubmit={submitCreate} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {formError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Entity type</label>
            <select
              value={form.entity_type}
              onChange={(e) => setForm({ ...form, entity_type: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
            >
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Entity ID</label>
            <input
              value={form.entity_id}
              onChange={(e) => setForm({ ...form, entity_id: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
              placeholder="ID of the TIA / SCC / flow to review"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Reviewer user ID (optional)</label>
            <input
              value={form.reviewer_user_id}
              onChange={(e) => setForm({ ...form, reviewer_user_id: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Comment (optional)</label>
            <textarea
              value={form.comment}
              onChange={(e) => setForm({ ...form, comment: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
              placeholder="Context for the reviewer"
            />
          </div>
        </form>
      </Modal>

      {/* Decide modal */}
      <Modal
        open={!!decideTarget}
        onClose={() => setDecideTarget(null)}
        title="Record decision"
        footer={
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setDecideTarget(null)} disabled={deciding}>
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button variant="danger" onClick={() => decide('rejected')} disabled={deciding}>
                Reject
              </Button>
              <Button onClick={() => decide('approved')} disabled={deciding}>
                {deciding ? <Spinner /> : 'Approve'}
              </Button>
            </div>
          </div>
        }
      >
        {decideTarget && (
          <div className="space-y-4">
            {decideError && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                {decideError}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Badge tone={entityTone(decideTarget.entity_type)}>{decideTarget.entity_type.toUpperCase()}</Badge>
              <span className="font-mono text-xs text-slate-400">{decideTarget.entity_id}</span>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Decision comment</label>
              <textarea
                value={decideComment}
                onChange={(e) => setDecideComment(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
                placeholder="Rationale for the decision (recorded in the audit trail)"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
