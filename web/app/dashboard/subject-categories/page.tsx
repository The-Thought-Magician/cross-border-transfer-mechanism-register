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

interface SubjectCategory {
  id: string
  workspace_id?: string | null
  name?: string
  risk_weight?: number | null
  description?: string | null
  created_at?: string
}

function fmtDate(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function riskTone(w?: number | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (w == null) return 'neutral'
  if (w >= 4) return 'danger'
  if (w >= 2) return 'warning'
  return 'success'
}

function riskLabel(w?: number | null): string {
  if (w == null) return 'Unweighted'
  if (w >= 4) return 'High'
  if (w >= 2) return 'Elevated'
  return 'Standard'
}

const emptyForm = {
  name: '',
  risk_weight: '1',
  description: '',
}

type Form = typeof emptyForm

export default function SubjectCategoriesPage() {
  const [items, setItems] = useState<SubjectCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [scopeFilter, setScopeFilter] = useState<'all' | 'global' | 'workspace'>('all')
  const [riskFilter, setRiskFilter] = useState<'all' | 'standard' | 'elevated' | 'high'>('all')
  const [sortBy, setSortBy] = useState<'risk' | 'name'>('risk')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SubjectCategory | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.getSubjectCategories()
      setItems(Array.isArray(res) ? res : res?.items ?? [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load subject categories')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const stats = useMemo(() => {
    const total = items.length
    const global = items.filter((i) => !i.workspace_id).length
    const high = items.filter((i) => (i.risk_weight ?? 0) >= 4).length
    const weights = items.map((i) => i.risk_weight ?? 0)
    const avg = weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : 0
    return { total, global, workspace: total - global, high, avg }
  }, [items])

  const filtered = useMemo(() => {
    let out = items.filter((i) => {
      if (scopeFilter === 'global' && i.workspace_id) return false
      if (scopeFilter === 'workspace' && !i.workspace_id) return false
      const w = i.risk_weight ?? 0
      if (riskFilter === 'standard' && w >= 2) return false
      if (riskFilter === 'elevated' && (w < 2 || w >= 4)) return false
      if (riskFilter === 'high' && w < 4) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const hay = [i.name, i.description].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    out = [...out].sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '')
      return (b.risk_weight ?? 0) - (a.risk_weight ?? 0)
    })
    return out
  }, [items, scopeFilter, riskFilter, search, sortBy])

  const maxWeight = useMemo(
    () => Math.max(5, ...items.map((i) => i.risk_weight ?? 0)),
    [items],
  )

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(i: SubjectCategory) {
    setEditing(i)
    setForm({
      name: i.name || '',
      risk_weight: i.risk_weight != null ? String(i.risk_weight) : '1',
      description: i.description || '',
    })
    setFormError(null)
    setModalOpen(true)
  }

  function buildPayload() {
    return {
      name: form.name.trim(),
      risk_weight: form.risk_weight === '' ? null : Number(form.risk_weight),
      description: form.description.trim() || null,
    }
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
      const payload = buildPayload()
      if (editing) await api.updateSubjectCategory(editing.id, payload)
      else await api.createSubjectCategory(payload)
      setModalOpen(false)
      await load()
    } catch (err: any) {
      setFormError(err?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function remove(i: SubjectCategory) {
    if (!confirm(`Delete subject category "${i.name}"?`)) return
    setBusyId(i.id)
    try {
      await api.deleteSubjectCategory(i.id)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Delete failed')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <PageLoader label="Loading subject categories..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Subject Categories</h1>
          <p className="mt-1 text-sm text-slate-400">
            Catalog of data-subject categories with risk weights used to score transfer flows and TIAs.
          </p>
        </div>
        <Button onClick={openCreate}>+ New Category</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Total" value={stats.total} />
        <Stat label="Global" value={stats.global} hint="Shared library" />
        <Stat label="Workspace" value={stats.workspace} hint="Custom" />
        <Stat label="High Risk" value={stats.high} tone={stats.high ? 'danger' : 'default'} hint="Weight ≥ 4" />
        <Stat label="Avg Weight" value={stats.avg.toFixed(1)} tone={stats.avg >= 3 ? 'warning' : 'default'} />
      </div>

      {items.length > 0 && (
        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-white">Risk-weight distribution</span>
          </CardHeader>
          <CardBody className="space-y-2">
            {[...items]
              .sort((a, b) => (b.risk_weight ?? 0) - (a.risk_weight ?? 0))
              .slice(0, 8)
              .map((i) => {
                const w = i.risk_weight ?? 0
                const pct = maxWeight ? (w / maxWeight) * 100 : 0
                return (
                  <div key={i.id} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 truncate text-xs text-slate-400">{i.name}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={
                          riskTone(w) === 'danger'
                            ? 'h-full bg-rose-500'
                            : riskTone(w) === 'warning'
                              ? 'h-full bg-amber-500'
                              : 'h-full bg-emerald-500'
                        }
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-xs font-medium text-slate-300">{w}</span>
                  </div>
                )
              })}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or description..."
            className="w-full max-w-xs rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-yellow-400 focus:outline-none"
          />
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value as any)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
          >
            <option value="all">All scopes</option>
            <option value="global">Global</option>
            <option value="workspace">Workspace</option>
          </select>
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value as any)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
          >
            <option value="all">All risk</option>
            <option value="standard">Standard (&lt;2)</option>
            <option value="elevated">Elevated (2–3)</option>
            <option value="high">High (≥4)</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
          >
            <option value="risk">Sort: risk weight</option>
            <option value="name">Sort: name</option>
          </select>
          <span className="ml-auto text-xs text-slate-500">{filtered.length} shown</span>
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={items.length === 0 ? 'No subject categories yet' : 'No matches'}
                description={
                  items.length === 0
                    ? 'Add categories of data subjects (employees, customers, minors…) and assign risk weights to drive transfer-risk scoring.'
                    : 'Adjust your search or filters to see categories.'
                }
                action={items.length === 0 ? <Button onClick={openCreate}>+ New Category</Button> : undefined}
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Risk Weight</TH>
                  <TH>Tier</TH>
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
                    <TD className="font-semibold text-slate-200">{i.risk_weight ?? '—'}</TD>
                    <TD>
                      <Badge tone={riskTone(i.risk_weight)}>{riskLabel(i.risk_weight)}</Badge>
                    </TD>
                    <TD>
                      {i.workspace_id ? (
                        <Badge tone="info">Workspace</Badge>
                      ) : (
                        <Badge tone="neutral">Global</Badge>
                      )}
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Subject Category' : 'New Subject Category'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button form="subject-form" type="submit" disabled={saving}>
              {saving ? <Spinner /> : editing ? 'Save changes' : 'Create'}
            </Button>
          </div>
        }
      >
        <form id="subject-form" onSubmit={submit} className="space-y-4">
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
              placeholder="e.g. Employees, Customers, Minors"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-yellow-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Risk weight ({form.risk_weight || '0'})
            </label>
            <input
              type="range"
              min={0}
              max={5}
              step={1}
              value={form.risk_weight || '0'}
              onChange={(e) => setForm({ ...form, risk_weight: e.target.value })}
              className="w-full accent-yellow-400"
            />
            <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-slate-600">
              <span>None</span>
              <span>Standard</span>
              <span>Elevated</span>
              <span>High</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              placeholder="When this category applies and why it carries this weight."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-yellow-400 focus:outline-none"
            />
          </div>
        </form>
      </Modal>
    </div>
  )
}
