'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, coverageTone } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { PageLoader, Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

type Country = { id: string; iso_code?: string; name?: string; eu_adequacy_status?: string }
type Subprocessor = {
  id: string
  recipient_id: string
  name: string
  service?: string
  country_id?: string
  declared_at?: string
  created_at?: string
}
type Recipient = {
  id: string
  workspace_id: string
  legal_name: string
  role?: string
  country_id?: string
  group_affiliation?: string
  contact_email?: string
  dpf_certified?: boolean
  dpf_status?: string
  dpf_renewal_date?: string
  notes?: string
}
type RecipientDetail = Recipient & {
  recipient?: Recipient
  subprocessors?: Subprocessor[]
  coverage?: any
  coverage_summary?: any
}

const ROLE_OPTIONS = ['controller', 'processor', 'sub-processor', 'joint-controller']
const DPF_STATUS_OPTIONS = ['none', 'active', 'pending', 'withdrawn', 'expired']

function fmtDate(v?: string) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function RecipientDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const recipientId = params?.id

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recipient, setRecipient] = useState<Recipient | null>(null)
  const [subprocessors, setSubprocessors] = useState<Subprocessor[]>([])
  const [countries, setCountries] = useState<Country[]>([])

  // edit recipient
  const [editing, setEditing] = useState(false)
  const [savingRecipient, setSavingRecipient] = useState(false)
  const [form, setForm] = useState<Partial<Recipient>>({})

  // subprocessor modal
  const [spModalOpen, setSpModalOpen] = useState(false)
  const [spEditingId, setSpEditingId] = useState<string | null>(null)
  const [spForm, setSpForm] = useState<Partial<Subprocessor>>({})
  const [savingSp, setSavingSp] = useState(false)
  const [spError, setSpError] = useState<string | null>(null)
  const [spSearch, setSpSearch] = useState('')

  const countryName = useCallback(
    (id?: string) => {
      if (!id) return '—'
      const c = countries.find((x) => x.id === id)
      return c ? c.name || c.iso_code || id : id
    },
    [countries],
  )

  const load = useCallback(async () => {
    if (!recipientId) return
    setLoading(true)
    setError(null)
    try {
      const [detail, subs, ctry] = await Promise.all([
        api.getRecipient(recipientId) as Promise<RecipientDetail>,
        api.getSubprocessors({ recipient_id: recipientId }) as Promise<Subprocessor[]>,
        api.getCountries() as Promise<Country[]>,
      ])
      const rec: Recipient = (detail?.recipient as Recipient) || (detail as Recipient)
      setRecipient(rec)
      setForm(rec || {})
      const subList = Array.isArray(subs) ? subs : detail?.subprocessors || []
      setSubprocessors(Array.isArray(subList) ? subList : [])
      setCountries(Array.isArray(ctry) ? ctry : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load recipient')
    } finally {
      setLoading(false)
    }
  }, [recipientId])

  useEffect(() => {
    load()
  }, [load])

  const filteredSubs = useMemo(() => {
    const q = spSearch.trim().toLowerCase()
    if (!q) return subprocessors
    return subprocessors.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.service?.toLowerCase().includes(q) ||
        countryName(s.country_id).toLowerCase().includes(q),
    )
  }, [subprocessors, spSearch, countryName])

  async function saveRecipient() {
    if (!recipient) return
    setSavingRecipient(true)
    setError(null)
    try {
      const payload = {
        legal_name: form.legal_name,
        role: form.role,
        country_id: form.country_id || null,
        group_affiliation: form.group_affiliation || null,
        contact_email: form.contact_email || null,
        dpf_certified: !!form.dpf_certified,
        dpf_status: form.dpf_status || 'none',
        dpf_renewal_date: form.dpf_renewal_date || null,
        notes: form.notes || null,
      }
      const updated = (await api.updateRecipient(recipient.id, payload)) as Recipient
      setRecipient((updated && updated.id ? updated : { ...recipient, ...payload }) as Recipient)
      setEditing(false)
    } catch (e: any) {
      setError(e?.message || 'Failed to update recipient')
    } finally {
      setSavingRecipient(false)
    }
  }

  function openCreateSp() {
    setSpEditingId(null)
    setSpForm({ name: '', service: '', country_id: recipient?.country_id || '' })
    setSpError(null)
    setSpModalOpen(true)
  }

  function openEditSp(s: Subprocessor) {
    setSpEditingId(s.id)
    setSpForm({ name: s.name, service: s.service, country_id: s.country_id })
    setSpError(null)
    setSpModalOpen(true)
  }

  async function saveSp() {
    if (!recipient) return
    if (!spForm.name?.trim()) {
      setSpError('Name is required')
      return
    }
    setSavingSp(true)
    setSpError(null)
    try {
      if (spEditingId) {
        const updated = (await api.updateSubprocessor(spEditingId, {
          name: spForm.name,
          service: spForm.service || null,
          country_id: spForm.country_id || null,
        })) as Subprocessor
        setSubprocessors((prev) =>
          prev.map((s) => (s.id === spEditingId ? { ...s, ...updated, ...spForm } : s)),
        )
      } else {
        const created = (await api.createSubprocessor({
          workspace_id: recipient.workspace_id,
          recipient_id: recipient.id,
          name: spForm.name,
          service: spForm.service || null,
          country_id: spForm.country_id || null,
        })) as Subprocessor
        if (created && created.id) {
          setSubprocessors((prev) => [created, ...prev])
        } else {
          await load()
        }
      }
      setSpModalOpen(false)
    } catch (e: any) {
      setSpError(e?.message || 'Failed to save subprocessor')
    } finally {
      setSavingSp(false)
    }
  }

  async function deleteSp(id: string) {
    if (!confirm('Delete this subprocessor?')) return
    try {
      await api.deleteSubprocessor(id)
      setSubprocessors((prev) => prev.filter((s) => s.id !== id))
    } catch (e: any) {
      setError(e?.message || 'Failed to delete subprocessor')
    }
  }

  if (loading) return <PageLoader label="Loading recipient..." />

  if (error && !recipient) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          title="Could not load recipient"
          description={error}
          action={
            <div className="flex gap-2">
              <Button onClick={load}>Retry</Button>
              <Link href="/dashboard/recipients">
                <Button variant="secondary">Back to recipients</Button>
              </Link>
            </div>
          }
        />
      </div>
    )
  }

  if (!recipient) {
    return (
      <EmptyState
        title="Recipient not found"
        action={
          <Link href="/dashboard/recipients">
            <Button variant="secondary">Back to recipients</Button>
          </Link>
        }
      />
    )
  }

  const dpfStatus = recipient.dpf_status || (recipient.dpf_certified ? 'active' : 'none')

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/dashboard/recipients"
            className="text-xs text-slate-500 hover:text-indigo-300"
          >
            ← Recipients
          </Link>
          <h1 className="mt-1 truncate text-2xl font-semibold text-white">
            {recipient.legal_name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {recipient.role && <Badge tone="info">{recipient.role}</Badge>}
            <Badge tone={coverageTone(dpfStatus)}>DPF: {dpfStatus}</Badge>
            <span className="text-sm text-slate-500">{countryName(recipient.country_id)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => router.push('/dashboard/recipients')}>
            Back
          </Button>
          <Button onClick={() => { setForm(recipient); setEditing(true) }}>Edit recipient</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Subprocessors" value={subprocessors.length} />
        <Stat
          label="DPF Status"
          value={dpfStatus}
          tone={dpfStatus === 'active' ? 'success' : dpfStatus === 'none' ? 'default' : 'warning'}
        />
        <Stat label="DPF Renewal" value={fmtDate(recipient.dpf_renewal_date)} />
        <Stat label="Group" value={recipient.group_affiliation || '—'} />
      </div>

      {/* Profile + DPF */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-white">Profile</h2>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            <Row label="Legal name" value={recipient.legal_name} />
            <Row label="Role" value={recipient.role || '—'} />
            <Row label="Country" value={countryName(recipient.country_id)} />
            <Row label="Group affiliation" value={recipient.group_affiliation || '—'} />
            <Row
              label="Contact"
              value={
                recipient.contact_email ? (
                  <a
                    href={`mailto:${recipient.contact_email}`}
                    className="text-indigo-300 hover:underline"
                  >
                    {recipient.contact_email}
                  </a>
                ) : (
                  '—'
                )
              }
            />
            {recipient.notes && (
              <div className="border-t border-slate-800 pt-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Notes</div>
                <p className="mt-1 whitespace-pre-wrap text-slate-300">{recipient.notes}</p>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-white">
              Data Privacy Framework (DPF) status
            </h2>
          </CardHeader>
          <CardBody className="space-y-4 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Certification</div>
                <div className="mt-0.5 text-slate-200">
                  {recipient.dpf_certified ? 'Certified' : 'Not certified'}
                </div>
              </div>
              <Badge tone={coverageTone(dpfStatus)}>{dpfStatus}</Badge>
            </div>
            <Row label="Renewal date" value={fmtDate(recipient.dpf_renewal_date)} />
            <p className="text-xs text-slate-500">
              DPF self-certification enables EU-US transfers without additional Article 46
              safeguards. Monitor the renewal date and re-paper to SCCs if certification lapses.
            </p>
            {dpfStatus !== 'active' && dpfStatus !== 'none' && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                DPF is {dpfStatus}. Flows relying on DPF may need an alternative mechanism.
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Subprocessors */}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Subprocessors</h2>
            <p className="text-xs text-slate-500">
              Onward parties this recipient engages to process personal data.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={spSearch}
              onChange={(e) => setSpSearch(e.target.value)}
              placeholder="Search subprocessors..."
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
            />
            <Button size="sm" onClick={openCreateSp}>
              Add subprocessor
            </Button>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {filteredSubs.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={spSearch ? 'No matches' : 'No subprocessors declared'}
                description={
                  spSearch
                    ? 'Try a different search term.'
                    : 'Declare the onward processors this recipient relies on.'
                }
                action={
                  !spSearch && (
                    <Button size="sm" onClick={openCreateSp}>
                      Add subprocessor
                    </Button>
                  )
                }
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Service</TH>
                  <TH>Country</TH>
                  <TH>Declared</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filteredSubs.map((s) => (
                  <TR key={s.id}>
                    <TD className="font-medium text-slate-100">{s.name}</TD>
                    <TD>{s.service || '—'}</TD>
                    <TD>{countryName(s.country_id)}</TD>
                    <TD>{fmtDate(s.declared_at || s.created_at)}</TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEditSp(s)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteSp(s.id)}>
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

      {/* Edit recipient modal */}
      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit recipient"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={savingRecipient}>
              Cancel
            </Button>
            <Button onClick={saveRecipient} disabled={savingRecipient}>
              {savingRecipient ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Legal name">
            <input
              className="form-input"
              value={form.legal_name || ''}
              onChange={(e) => setForm((f) => ({ ...f, legal_name: e.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <select
                className="form-input"
                value={form.role || ''}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              >
                <option value="">Select role</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Country">
              <select
                className="form-input"
                value={form.country_id || ''}
                onChange={(e) => setForm((f) => ({ ...f, country_id: e.target.value }))}
              >
                <option value="">Select country</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.iso_code}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Group affiliation">
              <input
                className="form-input"
                value={form.group_affiliation || ''}
                onChange={(e) => setForm((f) => ({ ...f, group_affiliation: e.target.value }))}
              />
            </Field>
            <Field label="Contact email">
              <input
                type="email"
                className="form-input"
                value={form.contact_email || ''}
                onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="DPF status">
              <select
                className="form-input"
                value={form.dpf_status || 'none'}
                onChange={(e) => setForm((f) => ({ ...f, dpf_status: e.target.value }))}
              >
                {DPF_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="DPF renewal date">
              <input
                type="date"
                className="form-input"
                value={form.dpf_renewal_date ? form.dpf_renewal_date.slice(0, 10) : ''}
                onChange={(e) => setForm((f) => ({ ...f, dpf_renewal_date: e.target.value }))}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={!!form.dpf_certified}
              onChange={(e) => setForm((f) => ({ ...f, dpf_certified: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600"
            />
            DPF self-certified
          </label>
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

      {/* Subprocessor modal */}
      <Modal
        open={spModalOpen}
        onClose={() => setSpModalOpen(false)}
        title={spEditingId ? 'Edit subprocessor' : 'Add subprocessor'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSpModalOpen(false)} disabled={savingSp}>
              Cancel
            </Button>
            <Button onClick={saveSp} disabled={savingSp}>
              {savingSp ? <Spinner /> : spEditingId ? 'Save' : 'Add'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {spError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {spError}
            </div>
          )}
          <Field label="Name">
            <input
              className="form-input"
              value={spForm.name || ''}
              onChange={(e) => setSpForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label="Service">
            <input
              className="form-input"
              placeholder="e.g. cloud hosting, email delivery"
              value={spForm.service || ''}
              onChange={(e) => setSpForm((f) => ({ ...f, service: e.target.value }))}
            />
          </Field>
          <Field label="Country">
            <select
              className="form-input"
              value={spForm.country_id || ''}
              onChange={(e) => setSpForm((f) => ({ ...f, country_id: e.target.value }))}
            >
              <option value="">Select country</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.iso_code}
                </option>
              ))}
            </select>
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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-right text-slate-200">{value}</span>
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
