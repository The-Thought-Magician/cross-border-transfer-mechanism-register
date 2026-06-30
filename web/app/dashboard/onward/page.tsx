'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, coverageTone } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { PageLoader, Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

type Flow = {
  id: string
  name: string
  workspace_id?: string
  exporting_entity?: string
  recipient_id?: string
  destination_country_id?: string
}
type Subprocessor = {
  id: string
  name: string
  recipient_id?: string
  service?: string
  country_id?: string
}
type Onward = {
  id: string
  workspace_id: string
  parent_flow_id?: string
  subprocessor_id?: string
  destination_country_id?: string
  mechanism_type?: string
  coverage_state?: string
  notes?: string
  created_at?: string
}
type ChainLeg = {
  from?: string
  to?: string
  label?: string
  party?: string
  mechanism_type?: string
  coverage_state?: string
  broken?: boolean
  ok?: boolean
}
type OnwardChain = {
  flow_id?: string
  parent_flow_id?: string
  flow_name?: string
  name?: string
  exporter?: string
  importer?: string
  legs?: ChainLeg[]
  broken?: boolean
  broken_leg?: boolean
  has_broken_leg?: boolean
  coverage_state?: string
}

const MECHANISM_OPTIONS = [
  'adequacy',
  'scc',
  'bcr',
  'dpf',
  'derogation',
  'none',
]

function isBrokenChain(c: OnwardChain): boolean {
  if (c.broken || c.broken_leg || c.has_broken_leg) return true
  if (Array.isArray(c.legs)) return c.legs.some((l) => l.broken || l.ok === false)
  const s = (c.coverage_state || '').toLowerCase()
  return s === 'gap' || s === 'at-risk' || s === 'broken'
}

export default function OnwardPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [onward, setOnward] = useState<Onward[]>([])
  const [chains, setChains] = useState<OnwardChain[]>([])
  const [flows, setFlows] = useState<Flow[]>([])
  const [subprocessors, setSubprocessors] = useState<Subprocessor[]>([])

  const [search, setSearch] = useState('')
  const [flowFilter, setFlowFilter] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [onlyBroken, setOnlyBroken] = useState(false)
  const [view, setView] = useState<'chains' | 'legs'>('chains')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Onward>>({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const flowName = useCallback(
    (id?: string) => flows.find((f) => f.id === id)?.name || id || '—',
    [flows],
  )
  const subName = useCallback(
    (id?: string) => subprocessors.find((s) => s.id === id)?.name || id || '—',
    [subprocessors],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [on, ch, fl, subs] = await Promise.all([
        api.getOnward() as Promise<Onward[]>,
        api.getOnwardChains() as Promise<OnwardChain[]>,
        api.getFlows() as Promise<Flow[]>,
        api.getSubprocessors() as Promise<Subprocessor[]>,
      ])
      setOnward(Array.isArray(on) ? on : [])
      setChains(Array.isArray(ch) ? ch : [])
      setFlows(Array.isArray(fl) ? fl : [])
      setSubprocessors(Array.isArray(subs) ? subs : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load onward transfers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const brokenCount = useMemo(() => chains.filter(isBrokenChain).length, [chains])

  const filteredChains = useMemo(() => {
    const q = search.trim().toLowerCase()
    return chains.filter((c) => {
      if (onlyBroken && !isBrokenChain(c)) return false
      if (flowFilter && (c.flow_id || c.parent_flow_id) !== flowFilter) return false
      if (q) {
        const hay = `${c.flow_name || c.name || ''} ${c.exporter || ''} ${c.importer || ''} ${flowName(c.flow_id || c.parent_flow_id)}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [chains, onlyBroken, flowFilter, search, flowName])

  const filteredLegs = useMemo(() => {
    const q = search.trim().toLowerCase()
    return onward.filter((o) => {
      if (flowFilter && o.parent_flow_id !== flowFilter) return false
      if (stateFilter && (o.coverage_state || '') !== stateFilter) return false
      if (onlyBroken) {
        const s = (o.coverage_state || '').toLowerCase()
        if (!(s === 'gap' || s === 'at-risk' || s === 'broken')) return false
      }
      if (q) {
        const hay = `${flowName(o.parent_flow_id)} ${subName(o.subprocessor_id)} ${o.mechanism_type || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [onward, flowFilter, stateFilter, onlyBroken, search, flowName, subName])

  function openCreate() {
    setEditingId(null)
    setForm({ mechanism_type: 'scc', coverage_state: 'covered' })
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(o: Onward) {
    setEditingId(o.id)
    setForm({ ...o })
    setFormError(null)
    setModalOpen(true)
  }

  async function save() {
    if (!form.parent_flow_id) {
      setFormError('Select a parent flow')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const parent = flows.find((f) => f.id === form.parent_flow_id)
      const payload: any = {
        parent_flow_id: form.parent_flow_id,
        subprocessor_id: form.subprocessor_id || null,
        destination_country_id: form.destination_country_id || null,
        mechanism_type: form.mechanism_type || null,
        coverage_state: form.coverage_state || null,
        notes: form.notes || null,
      }
      if (parent?.workspace_id) payload.workspace_id = parent.workspace_id
      if (editingId) {
        await api.updateOnward(editingId, payload)
      } else {
        await api.createOnward(payload)
      }
      setModalOpen(false)
      await load()
    } catch (e: any) {
      setFormError(e?.message || 'Failed to save onward leg')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this onward leg?')) return
    try {
      await api.deleteOnward(id)
      setOnward((prev) => prev.filter((o) => o.id !== id))
      await load()
    } catch (e: any) {
      setError(e?.message || 'Failed to delete onward leg')
    }
  }

  const subsForFlow = useMemo(() => {
    const parent = flows.find((f) => f.id === form.parent_flow_id)
    if (!parent?.recipient_id) return subprocessors
    const scoped = subprocessors.filter((s) => s.recipient_id === parent.recipient_id)
    return scoped.length ? scoped : subprocessors
  }, [flows, form.parent_flow_id, subprocessors])

  if (loading) return <PageLoader label="Loading onward transfers..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Onward Transfers</h1>
          <p className="mt-1 text-sm text-slate-400">
            Exporter → importer → subprocessor chains with broken-leg detection.
          </p>
        </div>
        <Button onClick={openCreate}>Add onward leg</Button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <span>{error}</span>
          <Button size="sm" variant="secondary" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Chains" value={chains.length} />
        <Stat
          label="Broken legs"
          value={brokenCount}
          tone={brokenCount > 0 ? 'danger' : 'success'}
        />
        <Stat label="Onward legs" value={onward.length} />
        <Stat label="Subprocessors" value={subprocessors.length} />
      </div>

      {/* Controls */}
      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-700">
            <button
              onClick={() => setView('chains')}
              className={`px-3 py-1.5 text-sm ${view === 'chains' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
            >
              Chains
            </button>
            <button
              onClick={() => setView('legs')}
              className={`px-3 py-1.5 text-sm ${view === 'legs' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
            >
              Legs
            </button>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="min-w-[160px] flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
          />
          <select
            value={flowFilter}
            onChange={(e) => setFlowFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
          >
            <option value="">All flows</option>
            {flows.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          {view === 'legs' && (
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
            >
              <option value="">All states</option>
              <option value="covered">covered</option>
              <option value="partial">partial</option>
              <option value="at-risk">at-risk</option>
              <option value="gap">gap</option>
            </select>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={onlyBroken}
              onChange={(e) => setOnlyBroken(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600"
            />
            Broken only
          </label>
        </CardBody>
      </Card>

      {/* Chains view */}
      {view === 'chains' &&
        (filteredChains.length === 0 ? (
          <EmptyState
            title="No onward chains"
            description="Onward chains appear once flows have subprocessors and onward legs declared."
            action={<Button onClick={openCreate}>Add onward leg</Button>}
          />
        ) : (
          <div className="space-y-4">
            {filteredChains.map((c, i) => {
              const broken = isBrokenChain(c)
              const fid = c.flow_id || c.parent_flow_id
              return (
                <Card
                  key={fid || i}
                  className={broken ? 'border-rose-500/40' : ''}
                >
                  <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        {c.flow_name || c.name || flowName(fid)}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {c.exporter || 'Exporter'} → {c.importer || 'Importer'}
                      </p>
                    </div>
                    <Badge tone={broken ? 'danger' : 'success'}>
                      {broken ? 'Broken leg' : 'Intact'}
                    </Badge>
                  </CardHeader>
                  <CardBody>
                    <ChainDiagram chain={c} />
                  </CardBody>
                </Card>
              )
            })}
          </div>
        ))}

      {/* Legs view */}
      {view === 'legs' &&
        (filteredLegs.length === 0 ? (
          <EmptyState
            title="No onward legs"
            description="Declare an onward leg to track sub-processing transfers."
            action={<Button onClick={openCreate}>Add onward leg</Button>}
          />
        ) : (
          <Card>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Parent flow</TH>
                    <TH>Subprocessor</TH>
                    <TH>Mechanism</TH>
                    <TH>Coverage</TH>
                    <TH className="text-right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {filteredLegs.map((o) => (
                    <TR key={o.id}>
                      <TD className="font-medium text-slate-100">{flowName(o.parent_flow_id)}</TD>
                      <TD>{subName(o.subprocessor_id)}</TD>
                      <TD>
                        <Badge tone="neutral">{o.mechanism_type || 'none'}</Badge>
                      </TD>
                      <TD>
                        <Badge tone={coverageTone(o.coverage_state)}>
                          {o.coverage_state || 'unknown'}
                        </Badge>
                      </TD>
                      <TD className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(o)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(o.id)}>
                            Delete
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardBody>
          </Card>
        ))}

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit onward leg' : 'Add onward leg'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Spinner /> : editingId ? 'Save' : 'Create'}
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
          <Field label="Parent flow">
            <select
              className="form-input"
              value={form.parent_flow_id || ''}
              onChange={(e) => setForm((f) => ({ ...f, parent_flow_id: e.target.value }))}
            >
              <option value="">Select flow</option>
              {flows.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Subprocessor">
            <select
              className="form-input"
              value={form.subprocessor_id || ''}
              onChange={(e) => setForm((f) => ({ ...f, subprocessor_id: e.target.value }))}
            >
              <option value="">Select subprocessor</option>
              {subsForFlow.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.service ? ` — ${s.service}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mechanism">
              <select
                className="form-input"
                value={form.mechanism_type || ''}
                onChange={(e) => setForm((f) => ({ ...f, mechanism_type: e.target.value }))}
              >
                {MECHANISM_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Coverage state">
              <select
                className="form-input"
                value={form.coverage_state || ''}
                onChange={(e) => setForm((f) => ({ ...f, coverage_state: e.target.value }))}
              >
                <option value="covered">covered</option>
                <option value="partial">partial</option>
                <option value="at-risk">at-risk</option>
                <option value="gap">gap</option>
              </select>
            </Field>
          </div>
          <Field label="Notes">
            <textarea
              className="form-input"
              rows={3}
              value={form.notes || ''}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>

      <style jsx global>{`
        .form-input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid rgb(51 65 85);
          background-color: rgb(15 23 42);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: rgb(226 232 240);
        }
        .form-input:focus {
          outline: none;
          border-color: rgb(99 102 241);
        }
        .form-input::placeholder {
          color: rgb(71 85 105);
        }
      `}</style>
    </div>
  )
}

function ChainDiagram({ chain }: { chain: OnwardChain }) {
  // Build node sequence from legs if present, else from exporter/importer.
  const nodes: { label: string; broken?: boolean; meta?: string }[] = []
  if (Array.isArray(chain.legs) && chain.legs.length) {
    chain.legs.forEach((leg, idx) => {
      if (idx === 0 && leg.from) nodes.push({ label: leg.from })
      const to = leg.to || leg.party || leg.label
      nodes.push({
        label: to || `Hop ${idx + 1}`,
        broken: leg.broken || leg.ok === false,
        meta: leg.mechanism_type,
      })
    })
  } else {
    if (chain.exporter) nodes.push({ label: chain.exporter })
    if (chain.importer) nodes.push({ label: chain.importer, broken: isBrokenChain(chain) })
  }
  if (nodes.length === 0) {
    return (
      <p className="text-sm text-slate-500">No leg detail available for this chain.</p>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {nodes.map((n, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`rounded-lg border px-3 py-2 text-xs ${
              n.broken
                ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                : 'border-slate-700 bg-slate-900 text-slate-200'
            }`}
          >
            <div className="font-medium">{n.label}</div>
            {n.meta && <div className="text-[10px] text-slate-500">{n.meta}</div>}
          </div>
          {i < nodes.length - 1 && (
            <span
              className={
                nodes[i + 1]?.broken ? 'text-rose-400' : 'text-slate-600'
              }
            >
              {nodes[i + 1]?.broken ? '⤍' : '→'}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  )
}
