'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Stat } from '@/components/ui/Stat'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader, Spinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Measure {
  id: string
  workspace_id?: string | null
  name?: string
  measure_type?: string
  effectiveness?: string | number | null
  description?: string | null
  created_at?: string
}

const MEASURE_TYPES = [
  { value: 'technical', label: 'Technical' },
  { value: 'contractual', label: 'Contractual' },
  { value: 'organisational', label: 'Organisational' },
]

const EFFECTIVENESS = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

function typeTone(t?: string): 'info' | 'review' | 'success' | 'neutral' {
  switch ((t || '').toLowerCase()) {
    case 'technical':
      return 'info'
    case 'contractual':
      return 'review'
    case 'organisational':
      return 'success'
    default:
      return 'neutral'
  }
}

function effTone(e?: string | number | null): 'success' | 'warning' | 'danger' | 'neutral' {
  const v = String(e ?? '').toLowerCase()
  if (v === 'high' || v === '3') return 'success'
  if (v === 'medium' || v === '2') return 'warning'
  if (v === 'low' || v === '1') return 'danger'
  return 'neutral'
}

function effLabel(e?: string | number | null): string {
  const v = String(e ?? '').toLowerCase()
  if (v === '3') return 'high'
  if (v === '2') return 'medium'
  if (v === '1') return 'low'
  return e != null && v !== '' ? String(e) : 'unrated'
}

function fmtDate(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function typeLabel(t?: string): string {
  const found = MEASURE_TYPES.find((x) => x.value === (t || '').toLowerCase())
  return found ? found.label : t || 'Other'
}

const emptyForm = {
  name: '',
  measure_type: 'technical',
  effectiveness: 'high',
  description: '',
}

type Form = typeof emptyForm

export default function MeasuresPage() {
  const [items, setItems] = useState<Measure[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [effFilter, setEffFilter] = useState('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Measure | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.getMeasures()
      setItems(Array.isArray(res) ? res : res?.items ?? [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load supplementary measures')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const stats = useMemo(() => {
    const byType: Record<string, number> = {}
    let high = 0
    for (const i of items) {
      const t = (i.measure_type || 'other').toLowerCase()
      byType[t] = (byType[t] || 0) + 1
      if (effTone(i.effectiveness) === 'success') high++
    }
    return { total: items.length, byType, high }
  }, [items])

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (typeFilter !== 'all' && (i.measure_type || '').toLowerCase() !== typeFilter) return false
      if (effFilter !== 'all' && effLabel(i.effectiveness) !== effFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const hay = [i.name, i.description, i.measure_type].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, typeFilter, effFilter, search])

  const grouped = useMemo(() => {
    const g: Record<string, Measure[]> = {}
    for (const i of filtered) {
      const t = (i.measure_type || 'other').toLowerCase()
      ;(g[t] ||= []).push(i)
    }
    return g
  }, [filtered])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(i: Measure) {
    setEditing(i)
    setForm({
      name: i.name || '',
      measure_type: (i.measure_type || 'technical').toLowerCase(),
      effectiveness: effLabel(i.effectiveness) === 'unrated' ? 'high' : effLabel(i.effectiveness),
      description: i.description || '',
    })
    setFormError(null)
    setModalOpen(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setFormError('Name is required')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const payload = {
        name: form.name.trim(),
        measure_type: form.measure_type,
        effectiveness: form.effectiveness,
        description: form.description.trim() || null,
      }
      if (editing) await api.updateMeasure(editing.id, payload)
      else await api.createMeasure(payload)
      setModalOpen(false)
      await load()
    } catch (err: any) {
      setFormError(err?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function remove(i: Measure) {
    if (!confirm(`Delete measure "${i.name}"?`)) return
    setBusyId(i.id)
    try {
      await api.deleteMeasure(i.id)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Delete failed')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <PageLoader label="Loading supplementary measures..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Supplementary Measures</h1>
          <p className="mt-1 text-sm text-slate-400">
            EDPB-style library of technical, contractual, and organisational measures applied in TIAs to bring
            transfers up to an essentially equivalent level of protection.
          </p>
        </div>
        <Button onClick={openCreate}>+ New Measure</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Total" value={stats.total} />
        <Stat label="Technical" value={stats.byType['technical'] || 0} />
        <Stat label="Contractual" value={stats.byType['contractual'] || 0} />
        <Stat label="Organisational" value={stats.byType['organisational'] || 0} />
        <Stat label="High Effect." value={stats.high} tone="success" />
      </div>

      {items.length > 0 && (
        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-white">Composition by type</span>
          </CardHeader>
          <CardBody>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
              {MEASURE_TYPES.map((t) => {
                const n = stats.byType[t.value] || 0
                const pct = stats.total ? (n / stats.total) * 100 : 0
                const color =
                  t.value === 'technical'
                    ? 'bg-yellow-400'
                    : t.value === 'contractual'
                      ? 'bg-sky-500'
                      : 'bg-emerald-500'
                return <div key={t.value} className={color} style={{ width: `${pct}%` }} />
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-yellow-400" /> Technical ({stats.byType['technical'] || 0})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-sky-500" /> Contractual ({stats.byType['contractual'] || 0})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Organisational (
                {stats.byType['organisational'] || 0})
              </span>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search measures..."
            className="w-full max-w-xs rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-yellow-400 focus:outline-none"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
          >
            <option value="all">All types</option>
            {MEASURE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <select
            value={effFilter}
            onChange={(e) => setEffFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
          >
            <option value="all">All effectiveness</option>
            {EFFECTIVENESS.map((eff) => (
              <option key={eff.value} value={eff.value}>
                {eff.label}
              </option>
            ))}
          </select>
          <span className="ml-auto text-xs text-slate-500">{filtered.length} shown</span>
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={items.length === 0 ? 'No measures yet' : 'No matches'}
                description={
                  items.length === 0
                    ? 'Build a catalog of encryption, pseudonymisation, contractual warranties, and governance controls to attach to Transfer Impact Assessments.'
                    : 'Adjust your search or filters to see measures.'
                }
                action={items.length === 0 ? <Button onClick={openCreate}>+ New Measure</Button> : undefined}
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Type</TH>
                  <TH>Effectiveness</TH>
                  <TH>Scope</TH>
                  <TH>Description</TH>
                  <TH>Created</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((i) => (
                  <TR key={i.id}>
                    <TD className="font-medium text-slate-100">{i.name || '—'}</TD>
                    <TD>
                      <Badge tone={typeTone(i.measure_type)}>{typeLabel(i.measure_type)}</Badge>
                    </TD>
                    <TD>
                      <Badge tone={effTone(i.effectiveness)}>{effLabel(i.effectiveness)}</Badge>
                    </TD>
                    <TD>
                      {i.workspace_id ? <Badge tone="info">Workspace</Badge> : <Badge tone="neutral">Global</Badge>}
                    </TD>
                    <TD className="max-w-md text-slate-400">{i.description || '—'}</TD>
                    <TD className="text-slate-500">{fmtDate(i.created_at)}</TD>
                    <TD>
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" disabled={busyId === i.id} onClick={() => openEdit(i)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="danger" disabled={busyId === i.id} onClick={() => remove(i)}>
                          {busyId === i.id ? '…' : 'Delete'}
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

      {filtered.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          {MEASURE_TYPES.map((t) => {
            const list = grouped[t.value] || []
            if (list.length === 0) return null
            return (
              <Card key={t.value}>
                <CardHeader className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">{t.label}</span>
                  <Badge tone={typeTone(t.value)}>{list.length}</Badge>
                </CardHeader>
                <CardBody className="space-y-2">
                  {list.slice(0, 6).map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2"
                    >
                      <span className="truncate text-sm text-slate-200">{m.name}</span>
                      <Badge tone={effTone(m.effectiveness)}>{effLabel(m.effectiveness)}</Badge>
                    </div>
                  ))}
                  {list.length > 6 && (
                    <div className="text-xs text-slate-500">+{list.length - 6} more</div>
                  )}
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Measure' : 'New Supplementary Measure'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button form="measure-form" type="submit" disabled={saving}>
              {saving ? <Spinner /> : editing ? 'Save changes' : 'Create'}
            </Button>
          </div>
        }
      >
        <form id="measure-form" onSubmit={submit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {formError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. End-to-end encryption with EU-held keys"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-yellow-400 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Type</label>
              <select
                value={form.measure_type}
                onChange={(e) => setForm({ ...form, measure_type: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
              >
                {MEASURE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Effectiveness</label>
              <select
                value={form.effectiveness}
                onChange={(e) => setForm({ ...form, effectiveness: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
              >
                {EFFECTIVENESS.map((eff) => (
                  <option key={eff.value} value={eff.value}>
                    {eff.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              placeholder="How this measure mitigates third-country access risk."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-yellow-400 focus:outline-none"
            />
          </div>
        </form>
      </Modal>
    </div>
  )
}
