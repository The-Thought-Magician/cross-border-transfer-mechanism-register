'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Stat } from '@/components/ui/Stat'
import { Badge, coverageTone } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader, Spinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Scc {
  id: string
  workspace_id?: string
  recipient_id?: string
  clause_version?: string
  module?: string | number
  parties?: string[]
  docking_parties?: string[]
  signature_status?: string
  signed_date?: string | null
  effective_date?: string | null
  expiry_date?: string | null
  needs_repaper?: boolean
  notes?: string | null
  created_at?: string
}

interface Recipient {
  id: string
  legal_name?: string
  country_id?: string
}

interface SccTracker {
  signed?: number
  pending?: number
  expired?: number
  total?: number
  counts?: Record<string, number>
  repaper?: Scc[]
  needs_repaper?: Scc[]
}

const SIGNATURE_STATUSES = ['draft', 'pending', 'signed', 'expired']
const MODULES = ['1', '2', '3', '4']

function fmtDate(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function daysUntil(d?: string | null): number | null {
  if (!d) return null
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return null
  return Math.round((dt.getTime() - Date.now()) / 86400000)
}

const emptyForm = {
  recipient_id: '',
  clause_version: '2021/914',
  module: '2',
  parties: '',
  docking_parties: '',
  signature_status: 'draft',
  signed_date: '',
  effective_date: '',
  expiry_date: '',
  needs_repaper: false,
  notes: '',
}

export default function SccPage() {
  const [sccs, setSccs] = useState<Scc[]>([])
  const [tracker, setTracker] = useState<SccTracker | null>(null)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [repaperOnly, setRepaperOnly] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Scc | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [sccsRes, trackerRes, recRes] = await Promise.all([
        api.getSccs(),
        api.getSccTracker().catch(() => null),
        api.getRecipients().catch(() => []),
      ])
      setSccs(Array.isArray(sccsRes) ? sccsRes : sccsRes?.items ?? [])
      setTracker(trackerRes)
      setRecipients(Array.isArray(recRes) ? recRes : recRes?.items ?? [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load SCC agreements')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const recipientName = (id?: string) =>
    recipients.find((r) => r.id === id)?.legal_name || (id ? 'Unknown recipient' : '—')

  const counts = useMemo(() => {
    const c = { signed: 0, pending: 0, expired: 0, draft: 0, repaper: 0, total: sccs.length }
    for (const s of sccs) {
      const st = (s.signature_status || '').toLowerCase()
      if (st === 'signed') c.signed++
      else if (st === 'pending') c.pending++
      else if (st === 'expired') c.expired++
      else if (st === 'draft') c.draft++
      if (s.needs_repaper) c.repaper++
    }
    return c
  }, [sccs])

  const repaperList = useMemo(
    () => sccs.filter((s) => s.needs_repaper || (s.signature_status || '').toLowerCase() === 'expired'),
    [sccs],
  )

  const expiringSoon = useMemo(
    () =>
      sccs.filter((s) => {
        const d = daysUntil(s.expiry_date)
        return d !== null && d >= 0 && d <= 90
      }),
    [sccs],
  )

  const filtered = useMemo(() => {
    return sccs.filter((s) => {
      if (statusFilter !== 'all' && (s.signature_status || '').toLowerCase() !== statusFilter) return false
      if (repaperOnly && !s.needs_repaper) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const hay = [
          recipientName(s.recipient_id),
          s.clause_version,
          String(s.module ?? ''),
          (s.parties || []).join(' '),
          s.notes || '',
        ]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [sccs, statusFilter, repaperOnly, search, recipients])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(s: Scc) {
    setEditing(s)
    setForm({
      recipient_id: s.recipient_id || '',
      clause_version: s.clause_version || '2021/914',
      module: String(s.module ?? '2'),
      parties: (s.parties || []).join(', '),
      docking_parties: (s.docking_parties || []).join(', '),
      signature_status: s.signature_status || 'draft',
      signed_date: s.signed_date ? s.signed_date.slice(0, 10) : '',
      effective_date: s.effective_date ? s.effective_date.slice(0, 10) : '',
      expiry_date: s.expiry_date ? s.expiry_date.slice(0, 10) : '',
      needs_repaper: !!s.needs_repaper,
      notes: s.notes || '',
    })
    setFormError(null)
    setModalOpen(true)
  }

  function buildPayload() {
    return {
      recipient_id: form.recipient_id || undefined,
      clause_version: form.clause_version || undefined,
      module: form.module || undefined,
      parties: form.parties
        ? form.parties.split(',').map((p) => p.trim()).filter(Boolean)
        : [],
      docking_parties: form.docking_parties
        ? form.docking_parties.split(',').map((p) => p.trim()).filter(Boolean)
        : [],
      signature_status: form.signature_status,
      signed_date: form.signed_date || null,
      effective_date: form.effective_date || null,
      expiry_date: form.expiry_date || null,
      needs_repaper: form.needs_repaper,
      notes: form.notes || null,
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      const payload = buildPayload()
      if (editing) await api.updateScc(editing.id, payload)
      else await api.createScc(payload)
      setModalOpen(false)
      await load()
    } catch (err: any) {
      setFormError(err?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function quickSign(s: Scc) {
    setBusyId(s.id)
    try {
      await api.updateScc(s.id, {
        signature_status: 'signed',
        signed_date: new Date().toISOString().slice(0, 10),
        needs_repaper: false,
      })
      await load()
    } catch (e: any) {
      setError(e?.message || 'Failed to mark signed')
    } finally {
      setBusyId(null)
    }
  }

  async function quickRepaper(s: Scc) {
    setBusyId(s.id)
    try {
      await api.updateScc(s.id, { needs_repaper: !s.needs_repaper })
      await load()
    } catch (e: any) {
      setError(e?.message || 'Failed to flag repaper')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(s: Scc) {
    if (!confirm(`Delete SCC agreement for ${recipientName(s.recipient_id)}?`)) return
    setBusyId(s.id)
    try {
      await api.deleteScc(s.id)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Delete failed')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <PageLoader label="Loading SCC tracker..." />

  const signed = tracker?.signed ?? tracker?.counts?.signed ?? counts.signed
  const pending = tracker?.pending ?? tracker?.counts?.pending ?? counts.pending
  const expired = tracker?.expired ?? tracker?.counts?.expired ?? counts.expired
  const total = tracker?.total ?? counts.total
  const signedPct = total ? Math.round((signed / total) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">SCC Signature Tracker</h1>
          <p className="mt-1 text-sm text-slate-400">
            Standard Contractual Clauses lifecycle — signatures, expiries, and repaper alerts.
          </p>
        </div>
        <Button onClick={openCreate}>+ New SCC Agreement</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total" value={total} />
        <Stat label="Signed" value={signed} tone="success" />
        <Stat label="Pending" value={pending} tone="warning" />
        <Stat label="Expired" value={expired} tone="danger" />
        <Stat label="Needs Repaper" value={counts.repaper} tone={counts.repaper ? 'danger' : 'default'} />
        <Stat label="Expiring ≤90d" value={expiringSoon.length} tone={expiringSoon.length ? 'warning' : 'default'} />
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white">Signed coverage</span>
          <span className="text-sm text-slate-400">
            {signed} / {total} ({signedPct}%)
          </span>
        </CardHeader>
        <CardBody>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
            <div className="bg-emerald-500" style={{ width: `${total ? (signed / total) * 100 : 0}%` }} />
            <div className="bg-amber-500" style={{ width: `${total ? (pending / total) * 100 : 0}%` }} />
            <div className="bg-rose-500" style={{ width: `${total ? (expired / total) * 100 : 0}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Signed</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> Pending</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" /> Expired</span>
          </div>
        </CardBody>
      </Card>

      {repaperList.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader className="flex items-center gap-2">
            <span className="text-sm font-semibold text-amber-300">⚠ Repaper Alerts</span>
            <Badge tone="warning">{repaperList.length}</Badge>
          </CardHeader>
          <CardBody className="space-y-2">
            {repaperList.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2"
              >
                <div className="text-sm text-slate-200">
                  <span className="font-medium">{recipientName(s.recipient_id)}</span>
                  <span className="ml-2 text-slate-500">
                    Module {String(s.module ?? '—')} · {s.clause_version || '—'}
                  </span>
                  {(s.signature_status || '').toLowerCase() === 'expired' && (
                    <span className="ml-2 text-rose-300">expired {fmtDate(s.expiry_date)}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" disabled={busyId === s.id} onClick={() => openEdit(s)}>
                    Repaper
                  </Button>
                  <Button size="sm" disabled={busyId === s.id} onClick={() => quickSign(s)}>
                    Mark Signed
                  </Button>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recipient, clause, parties..."
            className="w-full max-w-xs rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-yellow-400 focus:outline-none"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
          >
            <option value="all">All statuses</option>
            {SIGNATURE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={repaperOnly}
              onChange={(e) => setRepaperOnly(e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900"
            />
            Repaper only
          </label>
          <span className="ml-auto text-xs text-slate-500">{filtered.length} shown</span>
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No SCC agreements"
                description="Create your first Standard Contractual Clauses agreement to start tracking signatures and repaper deadlines."
                action={<Button onClick={openCreate}>+ New SCC Agreement</Button>}
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Recipient</TH>
                  <TH>Module</TH>
                  <TH>Clause</TH>
                  <TH>Status</TH>
                  <TH>Signed</TH>
                  <TH>Expiry</TH>
                  <TH>Repaper</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((s) => {
                  const d = daysUntil(s.expiry_date)
                  return (
                    <TR key={s.id}>
                      <TD className="font-medium text-slate-100">{recipientName(s.recipient_id)}</TD>
                      <TD>Module {String(s.module ?? '—')}</TD>
                      <TD className="text-slate-400">{s.clause_version || '—'}</TD>
                      <TD>
                        <Badge tone={coverageTone(s.signature_status)}>{s.signature_status || 'draft'}</Badge>
                      </TD>
                      <TD className="text-slate-400">{fmtDate(s.signed_date)}</TD>
                      <TD>
                        <span className={d !== null && d >= 0 && d <= 90 ? 'text-amber-300' : 'text-slate-400'}>
                          {fmtDate(s.expiry_date)}
                          {d !== null && d >= 0 && d <= 90 && <span className="ml-1 text-xs">({d}d)</span>}
                        </span>
                      </TD>
                      <TD>
                        {s.needs_repaper ? <Badge tone="danger">Needed</Badge> : <span className="text-slate-600">—</span>}
                      </TD>
                      <TD>
                        <div className="flex justify-end gap-1.5">
                          {(s.signature_status || '').toLowerCase() !== 'signed' && (
                            <Button size="sm" disabled={busyId === s.id} onClick={() => quickSign(s)}>
                              Sign
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" disabled={busyId === s.id} onClick={() => quickRepaper(s)}>
                            {s.needs_repaper ? 'Clear' : 'Flag'}
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busyId === s.id} onClick={() => openEdit(s)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="danger" disabled={busyId === s.id} onClick={() => remove(s)}>
                            {busyId === s.id ? '…' : 'Delete'}
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
        title={editing ? 'Edit SCC Agreement' : 'New SCC Agreement'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button form="scc-form" type="submit" disabled={saving}>
              {saving ? <Spinner /> : editing ? 'Save changes' : 'Create'}
            </Button>
          </div>
        }
      >
        <form id="scc-form" onSubmit={submit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {formError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Recipient</label>
            <select
              value={form.recipient_id}
              onChange={(e) => setForm({ ...form, recipient_id: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
            >
              <option value="">Select recipient…</option>
              {recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.legal_name || r.id}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Clause version</label>
              <input
                value={form.clause_version}
                onChange={(e) => setForm({ ...form, clause_version: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Module</label>
              <select
                value={form.module}
                onChange={(e) => setForm({ ...form, module: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
              >
                {MODULES.map((m) => (
                  <option key={m} value={m}>
                    Module {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Parties (comma-separated)</label>
            <input
              value={form.parties}
              onChange={(e) => setForm({ ...form, parties: e.target.value })}
              placeholder="Exporter Ltd, Importer Inc"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-yellow-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Docking parties (comma-separated)</label>
            <input
              value={form.docking_parties}
              onChange={(e) => setForm({ ...form, docking_parties: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-yellow-400 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Signature status</label>
              <select
                value={form.signature_status}
                onChange={(e) => setForm({ ...form, signature_status: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
              >
                {SIGNATURE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Signed date</label>
              <input
                type="date"
                value={form.signed_date}
                onChange={(e) => setForm({ ...form, signed_date: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Effective date</label>
              <input
                type="date"
                value={form.effective_date}
                onChange={(e) => setForm({ ...form, effective_date: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Expiry date</label>
              <input
                type="date"
                value={form.expiry_date}
                onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.needs_repaper}
              onChange={(e) => setForm({ ...form, needs_repaper: e.target.checked })}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900"
            />
            Flag for repaper
          </label>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-yellow-400 focus:outline-none"
            />
          </div>
        </form>
      </Modal>
    </div>
  )
}
