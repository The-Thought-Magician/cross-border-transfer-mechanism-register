'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, coverageTone } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { PageLoader, Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Mechanism {
  id: string
  workspace_id?: string
  flow_id?: string
  legal_basis_id?: string
  mechanism_type?: string
  scc_agreement_id?: string
  derogation_justification?: string
  status?: string
  effective_date?: string
  expiry_date?: string
  flow?: { id: string; name: string }
  legal_basis?: { id: string; code?: string; name?: string }
}
interface Flow {
  id: string
  name: string
  coverage_state?: string
  destination_country?: { name?: string }
}
interface LegalBasis {
  id: string
  code?: string
  name?: string
  article?: string
  category?: string
  requires_tia?: boolean
}
interface Scc {
  id: string
  clause_version?: string
  module?: string
  signature_status?: string
  recipient?: { legal_name?: string }
}

const MECHANISM_TYPES = [
  'adequacy',
  'scc',
  'bcr',
  'codes-of-conduct',
  'certification',
  'derogation',
]

const fieldClass =
  'w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'
const labelClass = 'mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500'

function fmtDate(d?: string) {
  if (!d) return '—'
  const t = new Date(d)
  if (Number.isNaN(t.getTime())) return d
  return t.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const emptyForm = {
  flow_id: '',
  mechanism_type: 'scc',
  legal_basis_id: '',
  scc_agreement_id: '',
  derogation_justification: '',
  status: 'active',
  effective_date: '',
  expiry_date: '',
}

export default function MechanismsPage() {
  const [mechanisms, setMechanisms] = useState<Mechanism[]>([])
  const [flows, setFlows] = useState<Flow[]>([])
  const [legalBases, setLegalBases] = useState<LegalBasis[]>([])
  const [sccs, setSccs] = useState<Scc[]>([])
  const [workspaceId, setWorkspaceId] = useState('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const ws: any[] = await api.getMyWorkspaces().catch(() => [])
      const wid = Array.isArray(ws) && ws[0]?.id ? ws[0].id : ''
      setWorkspaceId(wid)
      const params = wid ? { workspace_id: wid } : undefined
      const [m, f, lb, s] = await Promise.all([
        api.getMechanisms(params).catch(() => []),
        api.getFlows(params).catch(() => []),
        api.getLegalBases().catch(() => []),
        api.getSccs(params).catch(() => []),
      ])
      setMechanisms(Array.isArray(m) ? m : [])
      setFlows(Array.isArray(f) ? f : [])
      setLegalBases(Array.isArray(lb) ? lb : [])
      setSccs(Array.isArray(s) ? s : [])
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load mechanisms')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const flowName = useCallback(
    (m: Mechanism) =>
      m.flow?.name ?? flows.find((f) => f.id === m.flow_id)?.name ?? m.flow_id ?? '—',
    [flows],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return mechanisms.filter((m) => {
      if (typeFilter && m.mechanism_type !== typeFilter) return false
      if (statusFilter && m.status !== statusFilter) return false
      if (q) {
        const hay = `${flowName(m)} ${m.mechanism_type ?? ''} ${m.legal_basis?.name ?? ''} ${
          m.legal_basis?.code ?? ''
        }`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [mechanisms, typeFilter, statusFilter, search, flowName])

  const stats = useMemo(() => {
    const total = mechanisms.length
    const active = mechanisms.filter((m) => (m.status ?? '').toLowerCase() === 'active').length
    const now = Date.now()
    const expiring = mechanisms.filter((m) => {
      if (!m.expiry_date) return false
      const t = new Date(m.expiry_date).getTime()
      return !Number.isNaN(t) && t > now && t - now < 1000 * 60 * 60 * 24 * 90
    }).length
    const byType: Record<string, number> = {}
    for (const m of mechanisms) {
      const k = m.mechanism_type ?? 'unknown'
      byType[k] = (byType[k] ?? 0) + 1
    }
    return { total, active, expiring, byType }
  }, [mechanisms])

  const maxTypeCount = useMemo(
    () => Math.max(1, ...Object.values(stats.byType)),
    [stats.byType],
  )

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...emptyForm })
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (m: Mechanism) => {
    setEditingId(m.id)
    setForm({
      flow_id: m.flow_id ?? '',
      mechanism_type: m.mechanism_type ?? 'scc',
      legal_basis_id: m.legal_basis_id ?? '',
      scc_agreement_id: m.scc_agreement_id ?? '',
      derogation_justification: m.derogation_justification ?? '',
      status: m.status ?? 'active',
      effective_date: m.effective_date ? m.effective_date.slice(0, 10) : '',
      expiry_date: m.expiry_date ? m.expiry_date.slice(0, 10) : '',
    })
    setFormError('')
    setModalOpen(true)
  }

  const save = async () => {
    setFormError('')
    if (!form.flow_id) {
      setFormError('Select a flow to attach the mechanism to.')
      return
    }
    setSaving(true)
    try {
      const payload: any = {
        flow_id: form.flow_id,
        mechanism_type: form.mechanism_type,
        legal_basis_id: form.legal_basis_id || null,
        scc_agreement_id: form.mechanism_type === 'scc' ? form.scc_agreement_id || null : null,
        derogation_justification:
          form.mechanism_type === 'derogation' ? form.derogation_justification.trim() || null : null,
        status: form.status,
        effective_date: form.effective_date || null,
        expiry_date: form.expiry_date || null,
      }
      if (workspaceId) payload.workspace_id = workspaceId

      if (editingId) await api.updateMechanism(editingId, payload)
      else await api.createMechanism(payload)
      setModalOpen(false)
      await load()
    } catch (e: any) {
      setFormError(e?.message ?? 'Failed to save mechanism')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (m: Mechanism) => {
    if (!confirm(`Remove this ${m.mechanism_type ?? 'mechanism'} from "${flowName(m)}"?`)) return
    setDeletingId(m.id)
    try {
      await api.deleteMechanism(m.id)
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to delete mechanism')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return <PageLoader label="Loading mechanisms…" />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Transfer Mechanisms</h1>
          <p className="mt-1 text-sm text-slate-500">
            The Chapter V safeguards attached to each flow — adequacy, SCCs, BCRs,
            certifications, and Article 49 derogations.
          </p>
        </div>
        <Button onClick={openCreate}>Attach mechanism</Button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <span>{error}</span>
          <Button size="sm" variant="secondary" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Mechanisms" value={stats.total} />
        <Stat label="Active" value={stats.active} tone="success" />
        <Stat
          label="Expiring ≤90d"
          value={stats.expiring}
          tone={stats.expiring > 0 ? 'warning' : 'default'}
        />
        <Stat label="Flows" value={flows.length} />
      </div>

      {/* Mix-by-type mini chart */}
      {stats.total > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-white">Mechanism mix</h2>
          </CardHeader>
          <CardBody className="space-y-2.5">
            {Object.entries(stats.byType)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <div key={type} className="flex items-center gap-3">
                  <div className="w-32 shrink-0 text-xs text-slate-400">{type}</div>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${(count / maxTypeCount) * 100}%` }}
                    />
                  </div>
                  <div className="w-8 shrink-0 text-right text-xs text-slate-400">{count}</div>
                </div>
              ))}
          </CardBody>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          <input
            className={`${fieldClass} max-w-xs`}
            placeholder="Search flow / basis / type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className={`${fieldClass} max-w-[12rem]`}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All types</option>
            {MECHANISM_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            className={`${fieldClass} max-w-[12rem]`}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {['active', 'pending', 'expired', 'invalidated'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {(typeFilter || statusFilter || search) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setTypeFilter('')
                setStatusFilter('')
                setSearch('')
              }}
            >
              Clear
            </Button>
          )}
          <span className="ml-auto text-xs text-slate-500">
            {filtered.length} of {mechanisms.length}
          </span>
        </CardBody>
      </Card>

      {/* Table */}
      <Card>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={mechanisms.length === 0 ? 'No mechanisms yet' : 'No mechanisms match'}
                description={
                  mechanisms.length === 0
                    ? 'Attach a transfer mechanism to a flow to begin covering it under Chapter V.'
                    : 'Try clearing the filters above.'
                }
                action={
                  mechanisms.length === 0 ? (
                    <Button onClick={openCreate}>Attach mechanism</Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Flow</TH>
                  <TH>Type</TH>
                  <TH>Legal basis</TH>
                  <TH>Status</TH>
                  <TH>Effective</TH>
                  <TH>Expiry</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((m) => (
                  <TR key={m.id}>
                    <TD>
                      {m.flow_id ? (
                        <Link
                          href={`/dashboard/flows/${m.flow_id}`}
                          className="text-indigo-300 hover:text-indigo-200"
                        >
                          {flowName(m)}
                        </Link>
                      ) : (
                        flowName(m)
                      )}
                    </TD>
                    <TD>
                      <Badge tone="info">{m.mechanism_type ?? '—'}</Badge>
                    </TD>
                    <TD>{m.legal_basis?.name ?? m.legal_basis?.code ?? '—'}</TD>
                    <TD>
                      <Badge tone={coverageTone(m.status)}>{m.status ?? '—'}</Badge>
                    </TD>
                    <TD>{fmtDate(m.effective_date)}</TD>
                    <TD>{fmtDate(m.expiry_date)}</TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(m)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => remove(m)}
                          disabled={deletingId === m.id}
                        >
                          {deletingId === m.id ? '…' : 'Remove'}
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit mechanism' : 'Attach mechanism'}
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Spinner /> : editingId ? 'Save' : 'Attach'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {formError}
            </div>
          )}

          <div>
            <label className={labelClass}>Flow *</label>
            <select
              className={fieldClass}
              value={form.flow_id}
              onChange={(e) => setForm((f) => ({ ...f, flow_id: e.target.value }))}
            >
              <option value="">Select a flow…</option>
              {flows.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {f.destination_country?.name ? ` → ${f.destination_country.name}` : ''}
                </option>
              ))}
            </select>
            {flows.length === 0 && (
              <p className="mt-1 text-xs text-amber-300">
                No flows yet —{' '}
                <Link href="/dashboard/flows/new" className="underline">
                  create one first
                </Link>
                .
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Mechanism type</label>
              <select
                className={fieldClass}
                value={form.mechanism_type}
                onChange={(e) => setForm((f) => ({ ...f, mechanism_type: e.target.value }))}
              >
                {MECHANISM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select
                className={fieldClass}
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                {['active', 'pending', 'expired', 'invalidated'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Legal basis (Chapter V)</label>
            <select
              className={fieldClass}
              value={form.legal_basis_id}
              onChange={(e) => setForm((f) => ({ ...f, legal_basis_id: e.target.value }))}
            >
              <option value="">None</option>
              {legalBases.map((lb) => (
                <option key={lb.id} value={lb.id}>
                  {lb.code ? `${lb.code} — ` : ''}
                  {lb.name ?? lb.id}
                  {lb.article ? ` (Art. ${lb.article})` : ''}
                </option>
              ))}
            </select>
          </div>

          {form.mechanism_type === 'scc' && (
            <div>
              <label className={labelClass}>SCC agreement</label>
              <select
                className={fieldClass}
                value={form.scc_agreement_id}
                onChange={(e) => setForm((f) => ({ ...f, scc_agreement_id: e.target.value }))}
              >
                <option value="">None linked</option>
                {sccs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.recipient?.legal_name ?? 'SCC'}
                    {s.clause_version ? ` · ${s.clause_version}` : ''}
                    {s.module ? ` · ${s.module}` : ''}
                    {s.signature_status ? ` (${s.signature_status})` : ''}
                  </option>
                ))}
              </select>
              {sccs.length === 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  No SCC agreements yet — manage them in the SCC Tracker.
                </p>
              )}
            </div>
          )}

          {form.mechanism_type === 'derogation' && (
            <div>
              <label className={labelClass}>Derogation justification (Art. 49)</label>
              <textarea
                className={`${fieldClass} min-h-[70px]`}
                value={form.derogation_justification}
                onChange={(e) =>
                  setForm((f) => ({ ...f, derogation_justification: e.target.value }))
                }
                placeholder="Explicit consent, contract necessity, important public interest…"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Effective date</label>
              <input
                type="date"
                className={fieldClass}
                value={form.effective_date}
                onChange={(e) => setForm((f) => ({ ...f, effective_date: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelClass}>Expiry date</label>
              <input
                type="date"
                className={fieldClass}
                value={form.expiry_date}
                onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))}
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
