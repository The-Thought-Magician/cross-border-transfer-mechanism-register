'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, coverageTone } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Spinner, PageLoader } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

type Country = {
  id: string
  iso_code?: string
  name: string
  region?: string
  eu_adequacy_status?: string
  uk_adequacy_status?: string
  eu_decision_ref?: string
  uk_decision_ref?: string
  effective_date?: string
  review_date?: string
  surveillance_risk?: string
  notes?: string
}

type AdequacyEvent = {
  id: string
  regime?: string
  old_status?: string
  new_status?: string
  decision_ref?: string
  effective_date?: string
  description?: string
  created_at?: string
}

type DependentFlow = {
  id: string
  name?: string
  coverage_state?: string
  recipient_role?: string
  purpose?: string
  exporting_entity?: string
}

type CountryDetail = Country & {
  events?: AdequacyEvent[]
  adequacy_events?: AdequacyEvent[]
  dependentFlows?: DependentFlow[]
  dependent_flows?: DependentFlow[]
  flows?: DependentFlow[]
  subscribed?: boolean
  isSubscribed?: boolean
  watching?: boolean
}

const STATUSES = ['adequate', 'partial', 'inadequate', 'pending', 'none']
const SURVEILLANCE = ['low', 'medium', 'high']

function fmtDate(d?: string) {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return d
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function statusLabel(s?: string) {
  if (!s) return 'Unknown'
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ')
}

export default function CountryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [country, setCountry] = useState<CountryDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [watching, setWatching] = useState(false)
  const [watchBusy, setWatchBusy] = useState(false)

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [edit, setEdit] = useState({
    eu_adequacy_status: '',
    uk_adequacy_status: '',
    eu_decision_ref: '',
    uk_decision_ref: '',
    review_date: '',
    surveillance_risk: '',
    notes: '',
  })

  async function load() {
    setLoading(true)
    setError('')
    try {
      const c = (await api.getCountry(id)) as CountryDetail
      setCountry(c)
      setWatching(Boolean(c.subscribed ?? c.isSubscribed ?? c.watching))
      setEdit({
        eu_adequacy_status: c.eu_adequacy_status ?? '',
        uk_adequacy_status: c.uk_adequacy_status ?? '',
        eu_decision_ref: c.eu_decision_ref ?? '',
        uk_decision_ref: c.uk_decision_ref ?? '',
        review_date: c.review_date ? c.review_date.slice(0, 10) : '',
        surveillance_risk: c.surveillance_risk ?? '',
        notes: c.notes ?? '',
      })
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load country')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function toggleWatch() {
    setWatchBusy(true)
    try {
      if (watching) {
        await api.unsubscribeCountry(id)
        setWatching(false)
      } else {
        await api.subscribeCountry(id)
        setWatching(true)
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update watch state')
    } finally {
      setWatchBusy(false)
    }
  }

  async function saveEdits() {
    setSaving(true)
    setSaveError('')
    try {
      await api.updateCountry(id, {
        eu_adequacy_status: edit.eu_adequacy_status || undefined,
        uk_adequacy_status: edit.uk_adequacy_status || undefined,
        eu_decision_ref: edit.eu_decision_ref || undefined,
        uk_decision_ref: edit.uk_decision_ref || undefined,
        review_date: edit.review_date || undefined,
        surveillance_risk: edit.surveillance_risk || undefined,
        notes: edit.notes || undefined,
      })
      setEditing(false)
      await load()
    } catch (err: any) {
      setSaveError(err?.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoader label="Loading country..." />

  if (error && !country) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/adequacy" className="text-sm text-yellow-400 hover:text-yellow-300">
          ← Back to adequacy tracker
        </Link>
        <div className="rounded-lg border border-rose-700 bg-rose-900/30 p-4 text-sm text-rose-300">
          {error}{' '}
          <button onClick={load} className="underline">
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!country) return null

  const events = country.events ?? country.adequacy_events ?? []
  const flows = country.dependentFlows ?? country.dependent_flows ?? country.flows ?? []
  const atRiskFlows = flows.filter((f) =>
    ['at-risk', 'gap', 'inadequate'].includes((f.coverage_state ?? '').toLowerCase())
  ).length

  const sortedEvents = events.slice().sort((a, b) => {
    const ad = new Date(a.effective_date ?? a.created_at ?? 0).getTime()
    const bd = new Date(b.effective_date ?? b.created_at ?? 0).getTime()
    return bd - ad
  })

  return (
    <div className="space-y-6">
      <Link href="/dashboard/adequacy" className="text-sm text-yellow-400 hover:text-yellow-300">
        ← Back to adequacy tracker
      </Link>

      {error && (
        <div className="rounded-lg border border-rose-700 bg-rose-900/30 p-3 text-sm text-rose-300">{error}</div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{country.name}</h1>
            {country.iso_code && <Badge tone="neutral">{country.iso_code}</Badge>}
          </div>
          <p className="mt-1 text-sm text-slate-500">{country.region ?? 'Region unknown'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant={watching ? 'secondary' : 'primary'} onClick={toggleWatch} disabled={watchBusy}>
            {watchBusy ? <Spinner /> : watching ? '★ Watching' : '☆ Watch country'}
          </Button>
          <Button variant="secondary" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Cancel edit' : 'Edit adequacy'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="EU adequacy" value={statusLabel(country.eu_adequacy_status)} />
        <Stat label="UK adequacy" value={statusLabel(country.uk_adequacy_status)} />
        <Stat label="Dependent flows" value={flows.length} />
        <Stat label="At-risk flows" value={atRiskFlows} tone={atRiskFlows > 0 ? 'danger' : 'success'} />
      </div>

      {editing && (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-white">Edit adequacy &amp; surveillance</h2>
          </CardHeader>
          <CardBody>
            {saveError && (
              <div className="mb-4 rounded-lg border border-rose-700 bg-rose-900/30 p-3 text-sm text-rose-300">
                {saveError}
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">EU adequacy status</label>
                <select
                  value={edit.eu_adequacy_status}
                  onChange={(e) => setEdit({ ...edit, eu_adequacy_status: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-yellow-400 focus:outline-none"
                >
                  <option value="">Unset</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">UK adequacy status</label>
                <select
                  value={edit.uk_adequacy_status}
                  onChange={(e) => setEdit({ ...edit, uk_adequacy_status: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-yellow-400 focus:outline-none"
                >
                  <option value="">Unset</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">EU decision ref</label>
                <input
                  value={edit.eu_decision_ref}
                  onChange={(e) => setEdit({ ...edit, eu_decision_ref: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-yellow-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">UK decision ref</label>
                <input
                  value={edit.uk_decision_ref}
                  onChange={(e) => setEdit({ ...edit, uk_decision_ref: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-yellow-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Review date</label>
                <input
                  type="date"
                  value={edit.review_date}
                  onChange={(e) => setEdit({ ...edit, review_date: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-yellow-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Surveillance risk</label>
                <select
                  value={edit.surveillance_risk}
                  onChange={(e) => setEdit({ ...edit, surveillance_risk: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-yellow-400 focus:outline-none"
                >
                  <option value="">Unset</option>
                  {SURVEILLANCE.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-300">Notes</label>
                <textarea
                  value={edit.notes}
                  onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-yellow-400 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={saveEdits} disabled={saving}>
                {saving ? <Spinner label="Saving..." /> : 'Save changes'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Updating adequacy status emits an adequacy event and may re-flag dependent flows.
            </p>
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-white">Adequacy detail</h2>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-slate-500">EU status</dt>
              <dd>
                <Badge tone={coverageTone(country.eu_adequacy_status)}>{statusLabel(country.eu_adequacy_status)}</Badge>
              </dd>
              <dt className="text-slate-500">EU decision ref</dt>
              <dd className="text-slate-300">{country.eu_decision_ref ?? '—'}</dd>
              <dt className="text-slate-500">UK status</dt>
              <dd>
                <Badge tone={coverageTone(country.uk_adequacy_status)}>{statusLabel(country.uk_adequacy_status)}</Badge>
              </dd>
              <dt className="text-slate-500">UK decision ref</dt>
              <dd className="text-slate-300">{country.uk_decision_ref ?? '—'}</dd>
              <dt className="text-slate-500">Effective date</dt>
              <dd className="text-slate-300">{fmtDate(country.effective_date)}</dd>
              <dt className="text-slate-500">Review date</dt>
              <dd className="text-slate-300">{fmtDate(country.review_date)}</dd>
              <dt className="text-slate-500">Surveillance risk</dt>
              <dd>
                {country.surveillance_risk ? (
                  <Badge tone={coverageTone(country.surveillance_risk)}>{statusLabel(country.surveillance_risk)}</Badge>
                ) : (
                  '—'
                )}
              </dd>
            </dl>
            {country.notes && (
              <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-400">
                {country.notes}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-white">Adequacy timeline</h2>
          </CardHeader>
          <CardBody>
            {sortedEvents.length === 0 ? (
              <EmptyState title="No recorded events" description="Adequacy changes for this country will appear here." />
            ) : (
              <ol className="relative space-y-5 border-l border-slate-800 pl-6">
                {sortedEvents.map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-slate-950 bg-yellow-400" />
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="info">{(e.regime ?? '—').toUpperCase()}</Badge>
                      {e.old_status && <Badge tone={coverageTone(e.old_status)}>{statusLabel(e.old_status)}</Badge>}
                      <span className="text-slate-600">→</span>
                      <Badge tone={coverageTone(e.new_status)}>{statusLabel(e.new_status)}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {fmtDate(e.effective_date ?? e.created_at)}
                      {e.decision_ref ? ` · ${e.decision_ref}` : ''}
                    </div>
                    {e.description && <p className="mt-1 text-sm text-slate-400">{e.description}</p>}
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Dependent transfer flows</h2>
          <span className="text-xs text-slate-500">{flows.length} flow(s) route to this country</span>
        </CardHeader>
        <CardBody className="p-0">
          {flows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No dependent flows"
                description="No transfer flows currently send personal data to this destination."
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Flow</TH>
                  <TH>Exporting entity</TH>
                  <TH>Recipient role</TH>
                  <TH>Purpose</TH>
                  <TH>Coverage</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {flows.map((f) => (
                  <TR key={f.id}>
                    <TD>
                      <Link href={`/dashboard/flows/${f.id}`} className="font-medium text-white hover:text-yellow-300">
                        {f.name ?? f.id}
                      </Link>
                    </TD>
                    <TD>{f.exporting_entity ?? '—'}</TD>
                    <TD>{f.recipient_role ?? '—'}</TD>
                    <TD className="max-w-xs truncate">{f.purpose ?? '—'}</TD>
                    <TD>
                      <Badge tone={coverageTone(f.coverage_state)}>{statusLabel(f.coverage_state)}</Badge>
                    </TD>
                    <TD className="text-right">
                      <Link href={`/dashboard/flows/${f.id}`} className="text-sm text-yellow-400 hover:text-yellow-300">
                        Open
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
