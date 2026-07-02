'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Stat } from '@/components/ui/Stat'
import { Badge, coverageTone } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader, Spinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Tia {
  id: string
  workspace_id?: string
  flow_id?: string
  recipient_id?: string
  country_id?: string
  title?: string
  status?: string
  outcome?: string | null
  risk_score?: number | null
  reviewer_user_id?: string | null
  approved_by?: string | null
  approved_at?: string | null
  review_due_date?: string | null
  summary?: string | null
  created_at?: string
}

interface Flow {
  id: string
  name?: string
}

const STATUSES = ['draft', 'in-progress', 'in-review', 'approved', 'rejected']
const OUTCOMES = ['adequate', 'adequate-with-measures', 'inadequate']

function fmtDate(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function riskTone(score?: number | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (score === null || score === undefined) return 'neutral'
  if (score >= 60) return 'danger'
  if (score >= 30) return 'warning'
  return 'success'
}

export default function TiasPage() {
  const [tias, setTias] = useState<Tia[]>([])
  const [flows, setFlows] = useState<Flow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [outcomeFilter, setOutcomeFilter] = useState('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', flow_id: '', review_due_date: '', summary: '' })
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [tiasRes, flowsRes] = await Promise.all([
        api.getTias(),
        api.getFlows().catch(() => []),
      ])
      setTias(Array.isArray(tiasRes) ? tiasRes : tiasRes?.items ?? [])
      setFlows(Array.isArray(flowsRes) ? flowsRes : flowsRes?.items ?? [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load TIAs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const flowName = (id?: string) => flows.find((f) => f.id === id)?.name || (id ? 'Unknown flow' : '—')

  const counts = useMemo(() => {
    const c = { total: tias.length, approved: 0, inReview: 0, draft: 0, inadequate: 0, overdue: 0 }
    const now = Date.now()
    for (const t of tias) {
      const st = (t.status || '').toLowerCase()
      if (st === 'approved') c.approved++
      else if (st === 'in-review') c.inReview++
      else if (st === 'draft') c.draft++
      if ((t.outcome || '').toLowerCase() === 'inadequate') c.inadequate++
      if (t.review_due_date && new Date(t.review_due_date).getTime() < now && st !== 'approved') c.overdue++
    }
    return c
  }, [tias])

  const filtered = useMemo(() => {
    return tias.filter((t) => {
      if (statusFilter !== 'all' && (t.status || '').toLowerCase() !== statusFilter) return false
      if (outcomeFilter !== 'all' && (t.outcome || '').toLowerCase() !== outcomeFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const hay = [t.title, flowName(t.flow_id), t.summary || '', t.status || '', t.outcome || ''].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [tias, statusFilter, outcomeFilter, search, flows])

  function openCreate() {
    setForm({ title: '', flow_id: '', review_due_date: '', summary: '' })
    setFormError(null)
    setModalOpen(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) {
      setFormError('Title is required')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await api.createTia({
        title: form.title.trim(),
        flow_id: form.flow_id || undefined,
        review_due_date: form.review_due_date || null,
        summary: form.summary || null,
      })
      setModalOpen(false)
      await load()
    } catch (err: any) {
      setFormError(err?.message || 'Failed to create TIA')
    } finally {
      setSaving(false)
    }
  }

  async function remove(t: Tia) {
    if (!confirm(`Delete TIA "${t.title || t.id}"?`)) return
    setBusyId(t.id)
    try {
      await api.deleteTia(t.id)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Delete failed')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <PageLoader label="Loading TIAs..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Transfer Impact Assessments</h1>
          <p className="mt-1 text-sm text-slate-400">
            EDPB six-step assessments for Chapter V transfers — status, risk score, and outcome.
          </p>
        </div>
        <Button onClick={openCreate}>+ New TIA</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total" value={counts.total} />
        <Stat label="Approved" value={counts.approved} tone="success" />
        <Stat label="In Review" value={counts.inReview} tone="warning" />
        <Stat label="Draft" value={counts.draft} />
        <Stat label="Inadequate" value={counts.inadequate} tone={counts.inadequate ? 'danger' : 'default'} />
        <Stat label="Review Overdue" value={counts.overdue} tone={counts.overdue ? 'danger' : 'default'} />
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, flow, summary..."
            className="w-full max-w-xs rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-yellow-400 focus:outline-none"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
          >
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
          >
            <option value="all">All outcomes</option>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <span className="ml-auto text-xs text-slate-500">{filtered.length} shown</span>
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={tias.length === 0 ? 'No TIAs yet' : 'No matching TIAs'}
                description={
                  tias.length === 0
                    ? 'Create a Transfer Impact Assessment to evaluate the lawfulness of a cross-border data flow.'
                    : 'Try adjusting your filters or search query.'
                }
                action={tias.length === 0 ? <Button onClick={openCreate}>+ New TIA</Button> : undefined}
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Title</TH>
                  <TH>Flow</TH>
                  <TH>Status</TH>
                  <TH>Outcome</TH>
                  <TH>Risk</TH>
                  <TH>Review Due</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((t) => {
                  const overdue =
                    t.review_due_date &&
                    new Date(t.review_due_date).getTime() < Date.now() &&
                    (t.status || '').toLowerCase() !== 'approved'
                  return (
                    <TR key={t.id}>
                      <TD className="font-medium text-slate-100">
                        <Link href={`/dashboard/tias/${t.id}`} className="hover:text-yellow-300">
                          {t.title || 'Untitled TIA'}
                        </Link>
                      </TD>
                      <TD className="text-slate-400">{flowName(t.flow_id)}</TD>
                      <TD>
                        <Badge tone={coverageTone(t.status)}>{t.status || 'draft'}</Badge>
                      </TD>
                      <TD>
                        {t.outcome ? (
                          <Badge tone={coverageTone(t.outcome)}>{t.outcome}</Badge>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </TD>
                      <TD>
                        {t.risk_score === null || t.risk_score === undefined ? (
                          <span className="text-slate-600">—</span>
                        ) : (
                          <Badge tone={riskTone(t.risk_score)}>{t.risk_score}</Badge>
                        )}
                      </TD>
                      <TD>
                        <span className={overdue ? 'text-rose-300' : 'text-slate-400'}>{fmtDate(t.review_due_date)}</span>
                      </TD>
                      <TD>
                        <div className="flex justify-end gap-1.5">
                          <Link href={`/dashboard/tias/${t.id}`}>
                            <Button size="sm" variant="secondary">
                              Open
                            </Button>
                          </Link>
                          <Button size="sm" variant="danger" disabled={busyId === t.id} onClick={() => remove(t)}>
                            {busyId === t.id ? '…' : 'Delete'}
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New Transfer Impact Assessment"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button form="tia-form" type="submit" disabled={saving}>
              {saving ? <Spinner /> : 'Create TIA'}
            </Button>
          </div>
        }
      >
        <form id="tia-form" onSubmit={submit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {formError}
            </div>
          )}
          <p className="text-xs text-slate-500">
            Creating a TIA seeds the six EDPB assessment steps. You will complete the workflow on the detail page.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Title *</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="TIA — US analytics processor"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-yellow-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Transfer flow</label>
            <select
              value={form.flow_id}
              onChange={(e) => setForm({ ...form, flow_id: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
            >
              <option value="">No linked flow</option>
              {flows.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name || f.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Review due date</label>
            <input
              type="date"
              value={form.review_due_date}
              onChange={(e) => setForm({ ...form, review_due_date: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Summary</label>
            <textarea
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              rows={3}
              placeholder="Scope and context of this assessment…"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-yellow-400 focus:outline-none"
            />
          </div>
        </form>
      </Modal>
    </div>
  )
}
