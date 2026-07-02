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

interface LegalBasis {
  id: string
  code?: string
  article?: string
  name?: string
  category?: string
  requires_tia?: boolean
  is_systematic?: boolean
  description?: string | null
  created_at?: string
}

const CATEGORIES = [
  { value: 'adequacy', label: 'Adequacy (Art. 45)' },
  { value: 'safeguard', label: 'Safeguard (Art. 46)' },
  { value: 'bcr', label: 'BCR (Art. 47)' },
  { value: 'derogation', label: 'Derogation (Art. 49)' },
]

function categoryTone(c?: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  switch ((c || '').toLowerCase()) {
    case 'adequacy':
      return 'success'
    case 'safeguard':
      return 'info'
    case 'bcr':
      return 'info'
    case 'derogation':
      return 'danger'
    default:
      return 'neutral'
  }
}

function categoryLabel(c?: string): string {
  const found = CATEGORIES.find((x) => x.value === (c || '').toLowerCase())
  return found ? found.label : c || 'Other'
}

const emptyForm = {
  code: '',
  article: '',
  name: '',
  category: 'safeguard',
  requires_tia: false,
  is_systematic: true,
  description: '',
}

type Form = typeof emptyForm

export default function LegalBasesPage() {
  const [items, setItems] = useState<LegalBasis[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [tiaOnly, setTiaOnly] = useState(false)

  const [detail, setDetail] = useState<LegalBasis | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<Form>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.getLegalBases()
      setItems(Array.isArray(res) ? res : res?.items ?? [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load legal bases')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const stats = useMemo(() => {
    const byCat: Record<string, number> = {}
    let requiresTia = 0
    let systematic = 0
    for (const i of items) {
      const c = (i.category || 'other').toLowerCase()
      byCat[c] = (byCat[c] || 0) + 1
      if (i.requires_tia) requiresTia++
      if (i.is_systematic) systematic++
    }
    return { total: items.length, byCat, requiresTia, systematic }
  }, [items])

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (catFilter !== 'all' && (i.category || '').toLowerCase() !== catFilter) return false
      if (tiaOnly && !i.requires_tia) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const hay = [i.code, i.article, i.name, i.description, i.category].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, catFilter, tiaOnly, search])

  async function openDetail(i: LegalBasis) {
    setDetail(i)
    setDetailLoading(true)
    try {
      const full = await api.getLegalBasis(i.id)
      setDetail(full || i)
    } catch {
      // fall back to the row data already shown
    } finally {
      setDetailLoading(false)
    }
  }

  function openCreate() {
    setForm(emptyForm)
    setFormError(null)
    setModalOpen(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.code.trim() || !form.name.trim()) {
      setFormError('Code and name are required')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await api.createLegalBasis({
        code: form.code.trim(),
        article: form.article.trim() || null,
        name: form.name.trim(),
        category: form.category,
        requires_tia: form.requires_tia,
        is_systematic: form.is_systematic,
        description: form.description.trim() || null,
      })
      setModalOpen(false)
      await load()
    } catch (err: any) {
      setFormError(err?.message || 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoader label="Loading legal-basis library..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Legal Bases & Derogations</h1>
          <p className="mt-1 text-sm text-slate-400">
            Chapter V transfer mechanisms — adequacy, Article 46 safeguards, BCRs, and Article 49 derogations.
          </p>
        </div>
        <Button onClick={openCreate}>+ Add Custom Basis</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total bases" value={stats.total} />
        <Stat label="Adequacy" value={stats.byCat['adequacy'] || 0} tone="success" />
        <Stat label="Safeguards" value={stats.byCat['safeguard'] || 0} tone="default" />
        <Stat label="Derogations" value={stats.byCat['derogation'] || 0} tone={stats.byCat['derogation'] ? 'warning' : 'default'} />
        <Stat label="Require TIA" value={stats.requiresTia} hint="Art. 46 path" />
        <Stat label="Systematic" value={stats.systematic} hint="Repeatable use" />
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code, article, name..."
            className="w-full max-w-xs rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-yellow-400 focus:outline-none"
          />
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
          >
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={tiaOnly}
              onChange={(e) => setTiaOnly(e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900"
            />
            Requires TIA only
          </label>
          <span className="ml-auto text-xs text-slate-500">{filtered.length} shown</span>
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={items.length === 0 ? 'No legal bases loaded' : 'No matches'}
                description={
                  items.length === 0
                    ? 'The Chapter V library seeds adequacy decisions, Article 46 safeguards, BCRs, and Article 49 derogations. Add a custom basis to extend it.'
                    : 'Adjust your search or filters to see legal bases.'
                }
                action={items.length === 0 ? <Button onClick={openCreate}>+ Add Custom Basis</Button> : undefined}
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Article</TH>
                  <TH>Category</TH>
                  <TH>TIA</TH>
                  <TH>Systematic</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((i) => (
                  <TR key={i.id}>
                    <TD className="font-mono text-xs text-yellow-200">{i.code || '—'}</TD>
                    <TD className="font-medium text-slate-100">{i.name || '—'}</TD>
                    <TD className="text-slate-400">{i.article || '—'}</TD>
                    <TD>
                      <Badge tone={categoryTone(i.category)}>{categoryLabel(i.category)}</Badge>
                    </TD>
                    <TD>
                      {i.requires_tia ? (
                        <Badge tone="warning">Required</Badge>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </TD>
                    <TD>
                      {i.is_systematic ? (
                        <Badge tone="success">Yes</Badge>
                      ) : (
                        <Badge tone="neutral">One-off</Badge>
                      )}
                    </TD>
                    <TD>
                      <div className="flex justify-end">
                        <Button size="sm" variant="ghost" onClick={() => openDetail(i)}>
                          View
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

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.name || 'Legal Basis'}>
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={categoryTone(detail.category)}>{categoryLabel(detail.category)}</Badge>
              {detail.code && <Badge tone="info">{detail.code}</Badge>}
              {detail.article && <Badge tone="neutral">{detail.article}</Badge>}
              {detail.requires_tia && <Badge tone="warning">Requires TIA</Badge>}
              {detail.is_systematic ? (
                <Badge tone="success">Systematic</Badge>
              ) : (
                <Badge tone="neutral">One-off</Badge>
              )}
            </div>
            {detailLoading && <Spinner label="Loading detail..." />}
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Description</div>
              <p className="mt-1 text-sm text-slate-300">
                {detail.description || 'No description recorded for this basis.'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                <div className="text-xs text-slate-500">Code</div>
                <div className="font-mono text-yellow-200">{detail.code || '—'}</div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                <div className="text-xs text-slate-500">Article</div>
                <div className="text-slate-200">{detail.article || '—'}</div>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              {detail.requires_tia
                ? 'Relying on this basis requires a documented Transfer Impact Assessment before transfers may proceed.'
                : 'This basis does not, on its own, require a Transfer Impact Assessment.'}
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Custom Legal Basis"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button form="legal-form" type="submit" disabled={saving}>
              {saving ? <Spinner /> : 'Create'}
            </Button>
          </div>
        }
      >
        <form id="legal-form" onSubmit={submit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Code</label>
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="e.g. art49-1-a"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-yellow-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Article</label>
              <input
                value={form.article}
                onChange={(e) => setForm({ ...form, article: e.target.value })}
                placeholder="e.g. Art. 49(1)(a)"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-yellow-400 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Explicit consent"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-yellow-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={form.requires_tia}
                onChange={(e) => setForm({ ...form, requires_tia: e.target.checked })}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900"
              />
              Requires TIA
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={form.is_systematic}
                onChange={(e) => setForm({ ...form, is_systematic: e.target.checked })}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900"
              />
              Systematic / repeatable
            </label>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              placeholder="Conditions and constraints for relying on this basis."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-yellow-400 focus:outline-none"
            />
          </div>
        </form>
      </Modal>
    </div>
  )
}
