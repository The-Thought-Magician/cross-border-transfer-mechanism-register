'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, coverageTone } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { Spinner, PageLoader } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

type Country = {
  id: string
  iso_code?: string
  name: string
}

type Recipient = {
  id: string
  legal_name: string
  role?: string
  country_id?: string
  group_affiliation?: string
  contact_email?: string
  dpf_certified?: boolean
  dpf_status?: string
  dpf_renewal_date?: string
  notes?: string
  created_at?: string
}

const ROLES = ['processor', 'controller', 'joint-controller', 'sub-processor']
const DPF_STATUSES = ['active', 'pending', 'lapsed', 'withdrawn', 'none']

function fmtDate(d?: string) {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return d
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function label(s?: string) {
  if (!s) return '—'
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ')
}

const emptyForm = {
  legal_name: '',
  role: 'processor',
  country_id: '',
  group_affiliation: '',
  contact_email: '',
  dpf_certified: false,
  dpf_status: 'none',
  dpf_renewal_date: '',
  notes: '',
}

export default function RecipientsPage() {
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [countries, setCountries] = useState<Country[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [dpfFilter, setDpfFilter] = useState('all')

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState({ ...emptyForm })

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [r, c] = await Promise.all([
        api.getRecipients() as Promise<Recipient[]>,
        api.getCountries() as Promise<Country[]>,
      ])
      setRecipients(Array.isArray(r) ? r : [])
      setCountries(Array.isArray(c) ? c : [])
      setSelected(new Set())
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load recipients')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const countryName = useMemo(() => {
    const m = new Map<string, Country>()
    for (const c of countries) m.set(c.id, c)
    return m
  }, [countries])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return recipients.filter((r) => {
      if (q) {
        const hay = `${r.legal_name} ${r.group_affiliation ?? ''} ${r.contact_email ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (roleFilter !== 'all' && (r.role ?? '') !== roleFilter) return false
      if (dpfFilter === 'certified' && !r.dpf_certified) return false
      if (dpfFilter === 'uncertified' && r.dpf_certified) return false
      if (DPF_STATUSES.includes(dpfFilter) && (r.dpf_status ?? '') !== dpfFilter) return false
      return true
    })
  }, [recipients, search, roleFilter, dpfFilter])

  const dpfCount = useMemo(() => recipients.filter((r) => r.dpf_certified).length, [recipients])
  const lapsedCount = useMemo(
    () => recipients.filter((r) => ['lapsed', 'withdrawn'].includes((r.dpf_status ?? '').toLowerCase())).length,
    [recipients]
  )

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => {
      if (prev.size === filtered.length && filtered.length > 0) return new Set()
      return new Set(filtered.map((r) => r.id))
    })
  }

  async function bulkDelete() {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} recipient(s)? This cannot be undone.`)) return
    setBulkBusy(true)
    setError('')
    try {
      await Promise.all(Array.from(selected).map((id) => api.deleteRecipient(id)))
      await load()
    } catch (err: any) {
      setError(err?.message ?? 'Bulk delete failed')
    } finally {
      setBulkBusy(false)
    }
  }

  async function deleteOne(id: string) {
    if (!confirm('Delete this recipient?')) return
    setError('')
    try {
      await api.deleteRecipient(id)
      await load()
    } catch (err: any) {
      setError(err?.message ?? 'Delete failed')
    }
  }

  function openModal() {
    setFormError('')
    setForm({ ...emptyForm, country_id: countries[0]?.id ?? '' })
    setModalOpen(true)
  }

  async function submit() {
    if (!form.legal_name.trim()) {
      setFormError('Legal name is required')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      await api.createRecipient({
        legal_name: form.legal_name.trim(),
        role: form.role,
        country_id: form.country_id || undefined,
        group_affiliation: form.group_affiliation || undefined,
        contact_email: form.contact_email || undefined,
        dpf_certified: form.dpf_certified,
        dpf_status: form.dpf_status,
        dpf_renewal_date: form.dpf_renewal_date || undefined,
        notes: form.notes || undefined,
      })
      setModalOpen(false)
      await load()
    } catch (err: any) {
      setFormError(err?.message ?? 'Failed to create recipient')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoader label="Loading recipients..." />

  const allSelected = filtered.length > 0 && selected.size === filtered.length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Recipients &amp; Vendors</h1>
          <p className="mt-1 text-sm text-slate-500">
            Data importers, processors, and group affiliates that receive cross-border transfers.
          </p>
        </div>
        <Button onClick={openModal}>Add recipient</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-700 bg-rose-900/30 p-3 text-sm text-rose-300">
          {error}{' '}
          <button onClick={load} className="underline">
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Recipients" value={recipients.length} />
        <Stat label="DPF certified" value={dpfCount} tone="success" />
        <Stat label="DPF lapsed/withdrawn" value={lapsedCount} tone={lapsedCount > 0 ? 'danger' : 'default'} />
        <Stat label="Countries covered" value={new Set(recipients.map((r) => r.country_id).filter(Boolean)).size} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, group, email..."
              className="min-w-[200px] flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-yellow-400 focus:outline-none"
            />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-yellow-400 focus:outline-none"
            >
              <option value="all">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {label(r)}
                </option>
              ))}
            </select>
            <select
              value={dpfFilter}
              onChange={(e) => setDpfFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-yellow-400 focus:outline-none"
            >
              <option value="all">All DPF</option>
              <option value="certified">DPF certified</option>
              <option value="uncertified">Not certified</option>
              {DPF_STATUSES.map((s) => (
                <option key={s} value={s}>
                  DPF: {label(s)}
                </option>
              ))}
            </select>
          </div>
          {selected.size > 0 && (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2">
              <span className="text-sm text-yellow-200">{selected.size} selected</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
                <Button size="sm" variant="danger" onClick={bulkDelete} disabled={bulkBusy}>
                  {bulkBusy ? <Spinner /> : `Delete ${selected.size}`}
                </Button>
              </div>
            </div>
          )}
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title={recipients.length === 0 ? 'No recipients yet' : 'No recipients match'}
                description={
                  recipients.length === 0
                    ? 'Add your first data importer or processor to start mapping transfers.'
                    : 'Adjust your search or filters.'
                }
                action={recipients.length === 0 ? <Button onClick={openModal}>Add recipient</Button> : undefined}
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-yellow-400"
                    />
                  </TH>
                  <TH>Recipient</TH>
                  <TH>Role</TH>
                  <TH>Country</TH>
                  <TH>Group</TH>
                  <TH>DPF</TH>
                  <TH>Contact</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((r) => {
                  const c = r.country_id ? countryName.get(r.country_id) : undefined
                  return (
                    <TR key={r.id}>
                      <TD>
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleOne(r.id)}
                          className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-yellow-400"
                        />
                      </TD>
                      <TD>
                        <Link
                          href={`/dashboard/recipients/${r.id}`}
                          className="font-medium text-white hover:text-yellow-300"
                        >
                          {r.legal_name}
                        </Link>
                        {r.notes && <div className="max-w-xs truncate text-xs text-slate-500">{r.notes}</div>}
                      </TD>
                      <TD>{label(r.role)}</TD>
                      <TD>
                        {c ? (
                          <Link href={`/dashboard/countries/${c.id}`} className="text-slate-300 hover:text-yellow-300">
                            {c.iso_code ?? c.name}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </TD>
                      <TD>{r.group_affiliation ?? '—'}</TD>
                      <TD>
                        {r.dpf_certified ? (
                          <div className="flex flex-col gap-1">
                            <Badge tone={coverageTone(r.dpf_status ?? 'active')}>
                              {label(r.dpf_status ?? 'active')}
                            </Badge>
                            {r.dpf_renewal_date && (
                              <span className="text-xs text-slate-500">renews {fmtDate(r.dpf_renewal_date)}</span>
                            )}
                          </div>
                        ) : (
                          <Badge tone="neutral">Not certified</Badge>
                        )}
                      </TD>
                      <TD>
                        {r.contact_email ? (
                          <a href={`mailto:${r.contact_email}`} className="text-yellow-400 hover:text-yellow-300">
                            {r.contact_email}
                          </a>
                        ) : (
                          '—'
                        )}
                      </TD>
                      <TD className="text-right">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/dashboard/recipients/${r.id}`}
                            className="text-sm text-yellow-400 hover:text-yellow-300"
                          >
                            Open
                          </Link>
                          <button
                            onClick={() => deleteOne(r.id)}
                            className="text-sm text-rose-400 hover:text-rose-300"
                          >
                            Delete
                          </button>
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
        title="Add recipient"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? <Spinner label="Saving..." /> : 'Create recipient'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-rose-700 bg-rose-900/30 p-3 text-sm text-rose-300">{formError}</div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Legal name *</label>
            <input
              value={form.legal_name}
              onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
              placeholder="Acme Cloud Services Inc."
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-yellow-400 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-yellow-400 focus:outline-none"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {label(r)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Country</label>
              <select
                value={form.country_id}
                onChange={(e) => setForm({ ...form, country_id: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-yellow-400 focus:outline-none"
              >
                <option value="">Select country</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.iso_code ? `${c.iso_code} · ` : ''}
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Group affiliation</label>
              <input
                value={form.group_affiliation}
                onChange={(e) => setForm({ ...form, group_affiliation: e.target.value })}
                placeholder="Parent group / BCR group"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-yellow-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Contact email</label>
              <input
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                placeholder="privacy@vendor.com"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-yellow-400 focus:outline-none"
              />
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
              <input
                type="checkbox"
                checked={form.dpf_certified}
                onChange={(e) => setForm({ ...form, dpf_certified: e.target.checked })}
                className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-yellow-400"
              />
              Data Privacy Framework (DPF) certified
            </label>
            {form.dpf_certified && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">DPF status</label>
                  <select
                    value={form.dpf_status}
                    onChange={(e) => setForm({ ...form, dpf_status: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-yellow-400 focus:outline-none"
                  >
                    {DPF_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {label(s)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">Renewal date</label>
                  <input
                    type="date"
                    value={form.dpf_renewal_date}
                    onChange={(e) => setForm({ ...form, dpf_renewal_date: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-yellow-400 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-yellow-400 focus:outline-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
