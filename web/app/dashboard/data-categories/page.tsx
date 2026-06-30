'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader, Spinner } from '@/components/ui/Spinner'

type DataCategory = {
  id: string
  workspace_id?: string | null
  name: string
  article?: string | null
  sensitivity_weight: number
  description?: string | null
  is_special: boolean
  created_at?: string
  [k: string]: any
}

const ARTICLES = ['', 'Art.6', 'Art.9', 'Art.10']

function sensitivityTone(w: number) {
  if (w >= 4) return 'danger'
  if (w >= 3) return 'warning'
  if (w >= 2) return 'review'
  return 'success'
}

const emptyForm = {
  name: '',
  article: '',
  sensitivity_weight: 1,
  description: '',
  is_special: false,
}

export default function DataCategoriesPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [categories, setCategories] = useState<DataCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [scopeFilter, setScopeFilter] = useState<'all' | 'global' | 'workspace'>('all')
  const [specialFilter, setSpecialFilter] = useState<'all' | 'special' | 'standard'>('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<DataCategory | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [deleting, setDeleting] = useState<DataCategory | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  async function load() {
    setError(null)
    try {
      const r = await api.getDataCategories()
      setCategories(Array.isArray(r) ? r : (r?.dataCategories ?? r?.categories ?? []))
    } catch (e: any) {
      setError(e?.message || 'Failed to load data categories')
    }
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      try {
        const ws: any[] = await api.getMyWorkspaces().catch(() => [])
        if (mounted) setWorkspaceId(Array.isArray(ws) && ws.length ? ws[0].id : null)
        await load()
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to load')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return categories.filter((c) => {
      if (scopeFilter === 'global' && c.workspace_id) return false
      if (scopeFilter === 'workspace' && !c.workspace_id) return false
      if (specialFilter === 'special' && !c.is_special) return false
      if (specialFilter === 'standard' && c.is_special) return false
      if (q && !`${c.name} ${c.article ?? ''} ${c.description ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [categories, search, scopeFilter, specialFilter])

  const stats = useMemo(() => {
    const special = categories.filter((c) => c.is_special).length
    const workspace = categories.filter((c) => !!c.workspace_id).length
    const avg = categories.length
      ? (categories.reduce((s, c) => s + (c.sensitivity_weight ?? 0), 0) / categories.length).toFixed(1)
      : '0'
    return { total: categories.length, special, workspace, avg }
  }, [categories])

  // sensitivity distribution for the simple SVG-free bar chart
  const distribution = useMemo(() => {
    const buckets = [1, 2, 3, 4, 5].map((w) => ({
      weight: w,
      count: categories.filter((c) => (c.sensitivity_weight ?? 1) === w).length,
    }))
    const max = Math.max(1, ...buckets.map((b) => b.count))
    return { buckets, max }
  }, [categories])

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm })
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(c: DataCategory) {
    setEditing(c)
    setForm({
      name: c.name ?? '',
      article: c.article ?? '',
      sensitivity_weight: c.sensitivity_weight ?? 1,
      description: c.description ?? '',
      is_special: !!c.is_special,
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
    const payload: any = {
      name: form.name.trim(),
      article: form.article || null,
      sensitivity_weight: Number(form.sensitivity_weight),
      description: form.description || null,
      is_special: form.is_special,
    }
    if (!editing) payload.workspace_id = workspaceId
    try {
      if (editing) {
        await api.updateDataCategory(editing.id, payload)
      } else {
        await api.createDataCategory(payload)
      }
      setModalOpen(false)
      await load()
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save category')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeletingBusy(true)
    try {
      await api.deleteDataCategory(deleting.id)
      setDeleting(null)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Failed to delete category')
    } finally {
      setDeletingBusy(false)
    }
  }

  if (loading) return <PageLoader label="Loading data-category catalog…" />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Data Category Catalog</h1>
          <p className="mt-1 text-sm text-slate-400">
            Classify personal-data categories with GDPR articles and sensitivity weights that drive transfer-risk scoring.
          </p>
        </div>
        <Button onClick={openCreate}>New category</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total categories" value={stats.total} />
        <Stat label="Special-category (Art.9/10)" value={stats.special} tone={stats.special ? 'danger' : 'default'} />
        <Stat label="Workspace-specific" value={stats.workspace} />
        <Stat label="Avg. sensitivity" value={stats.avg} />
      </div>

      {/* sensitivity distribution chart (pure divs) */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-white">Sensitivity distribution</h2>
          <p className="text-xs text-slate-500">Count of categories by sensitivity weight (1 = low, 5 = highest).</p>
        </CardHeader>
        <CardBody>
          <div className="flex items-end gap-4">
            {distribution.buckets.map((b) => (
              <div key={b.weight} className="flex flex-1 flex-col items-center gap-2">
                <div className="text-xs font-semibold text-slate-300">{b.count}</div>
                <div className="flex h-32 w-full items-end">
                  <div
                    className={
                      b.weight >= 4
                        ? 'w-full rounded-t bg-rose-500/70'
                        : b.weight === 3
                        ? 'w-full rounded-t bg-amber-500/70'
                        : b.weight === 2
                        ? 'w-full rounded-t bg-sky-500/70'
                        : 'w-full rounded-t bg-emerald-500/70'
                    }
                    style={{ height: `${(b.count / distribution.max) * 100}%`, minHeight: b.count ? 6 : 0 }}
                  />
                </div>
                <div className="text-xs text-slate-500">w{b.weight}</div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* filters + table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-base font-semibold text-white">Catalog</h2>
            <div className="flex flex-wrap gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search categories…"
                className="w-48 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
              <select
                value={scopeFilter}
                onChange={(e) => setScopeFilter(e.target.value as any)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="all">All scopes</option>
                <option value="global">Global / seeded</option>
                <option value="workspace">Workspace</option>
              </select>
              <select
                value={specialFilter}
                onChange={(e) => setSpecialFilter(e.target.value as any)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="all">All types</option>
                <option value="special">Special category</option>
                <option value="standard">Standard</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title={categories.length ? 'No categories match your filters' : 'No data categories yet'}
                description={
                  categories.length
                    ? 'Adjust your search or filters.'
                    : 'Add categories such as Contact data, Health data, or Criminal-offence data to start classifying flows.'
                }
                action={categories.length ? undefined : <Button variant="secondary" onClick={openCreate}>New category</Button>}
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Article</TH>
                  <TH>Sensitivity</TH>
                  <TH>Scope</TH>
                  <TH>Type</TH>
                  <TH className="text-right">Manage</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <div className="font-medium text-slate-100">{c.name}</div>
                      {c.description && <div className="text-xs text-slate-500">{c.description}</div>}
                    </TD>
                    <TD>
                      {c.article ? (
                        <span className="font-mono text-xs text-slate-300">{c.article}</span>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <span
                              key={n}
                              className={`h-2 w-2 rounded-full ${
                                n <= (c.sensitivity_weight ?? 1) ? 'bg-indigo-400' : 'bg-slate-700'
                              }`}
                            />
                          ))}
                        </div>
                        <Badge tone={sensitivityTone(c.sensitivity_weight ?? 1) as any}>{c.sensitivity_weight}</Badge>
                      </div>
                    </TD>
                    <TD>
                      <Badge tone={c.workspace_id ? 'info' : 'neutral'}>{c.workspace_id ? 'Workspace' : 'Global'}</Badge>
                    </TD>
                    <TD>
                      {c.is_special ? <Badge tone="danger">Special</Badge> : <Badge tone="neutral">Standard</Badge>}
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" className="text-rose-400 hover:text-rose-300" onClick={() => setDeleting(c)}>
                          Delete
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

      {/* create / edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit data category' : 'New data category'}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? <Spinner /> : editing ? 'Save changes' : 'Create category'}
            </Button>
          </div>
        }
      >
        <form onSubmit={submit} className="space-y-4">
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
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
              placeholder="e.g. Health data"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">GDPR article</label>
              <select
                value={form.article}
                onChange={(e) => setForm({ ...form, article: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                {ARTICLES.map((a) => (
                  <option key={a} value={a}>
                    {a || '— none —'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Sensitivity weight ({form.sensitivity_weight})
              </label>
              <input
                type="range"
                min={1}
                max={5}
                value={form.sensitivity_weight}
                onChange={(e) => setForm({ ...form, sensitivity_weight: Number(e.target.value) })}
                className="mt-2 w-full accent-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.is_special}
              onChange={(e) => setForm({ ...form, is_special: e.target.checked })}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-indigo-500"
            />
            Special category (Art.9 / Art.10) — heightens transfer risk
          </label>
        </form>
      </Modal>

      {/* delete confirm */}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete data category"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={deletingBusy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={deletingBusy}>
              {deletingBusy ? <Spinner /> : 'Delete'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-300">
          Delete <span className="font-semibold text-white">{deleting?.name}</span>? Flows referencing this category may lose their classification. This cannot be undone.
        </p>
      </Modal>
    </div>
  )
}
