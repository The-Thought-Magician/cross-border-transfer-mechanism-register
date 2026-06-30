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
  region?: string
  eu_adequacy_status?: string
  uk_adequacy_status?: string
  eu_decision_ref?: string
  uk_decision_ref?: string
  effective_date?: string
  review_date?: string
  surveillance_risk?: string
}

type AdequacyEvent = {
  id: string
  country_id: string
  regime?: string
  old_status?: string
  new_status?: string
  decision_ref?: string
  effective_date?: string
  description?: string
  created_at?: string
}

type ExposureBucket = {
  status?: string
  flows?: number
  count?: number
  label?: string
}

type AdequacyExposure = {
  buckets?: ExposureBucket[]
  byStatus?: Record<string, number>
  total?: number
  atRisk?: number
  [k: string]: any
}

const REGIMES = ['EU', 'UK']
const STATUSES = ['adequate', 'partial', 'inadequate', 'pending', 'none']

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

export default function AdequacyTrackerPage() {
  const [countries, setCountries] = useState<Country[]>([])
  const [events, setEvents] = useState<AdequacyEvent[]>([])
  const [exposure, setExposure] = useState<AdequacyExposure | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [regimeFilter, setRegimeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState({
    country_id: '',
    regime: 'EU',
    old_status: '',
    new_status: 'adequate',
    decision_ref: '',
    effective_date: '',
    description: '',
  })

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [c, e, x] = await Promise.all([
        api.getCountries() as Promise<Country[]>,
        api.getAdequacyEvents() as Promise<AdequacyEvent[]>,
        api.getAdequacyExposure() as Promise<AdequacyExposure>,
      ])
      setCountries(Array.isArray(c) ? c : [])
      setEvents(Array.isArray(e) ? e : [])
      setExposure(x ?? null)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load adequacy data')
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

  const exposureBuckets: ExposureBucket[] = useMemo(() => {
    if (!exposure) return []
    if (Array.isArray(exposure.buckets) && exposure.buckets.length) return exposure.buckets
    if (exposure.byStatus) {
      return Object.entries(exposure.byStatus).map(([status, count]) => ({
        status,
        count: Number(count),
      }))
    }
    return []
  }, [exposure])

  const maxBucket = useMemo(
    () => Math.max(1, ...exposureBuckets.map((b) => Number(b.flows ?? b.count ?? 0))),
    [exposureBuckets]
  )

  const totalFlows = useMemo(() => {
    if (typeof exposure?.total === 'number') return exposure.total
    return exposureBuckets.reduce((s, b) => s + Number(b.flows ?? b.count ?? 0), 0)
  }, [exposure, exposureBuckets])

  const atRisk = useMemo(() => {
    if (typeof exposure?.atRisk === 'number') return exposure.atRisk
    return exposureBuckets
      .filter((b) => ['inadequate', 'none', 'at-risk', 'pending'].includes((b.status ?? '').toLowerCase()))
      .reduce((s, b) => s + Number(b.flows ?? b.count ?? 0), 0)
  }, [exposure, exposureBuckets])

  const filteredCountries = useMemo(() => {
    const q = search.trim().toLowerCase()
    return countries.filter((c) => {
      if (q && !`${c.name} ${c.iso_code ?? ''} ${c.region ?? ''}`.toLowerCase().includes(q)) return false
      if (statusFilter !== 'all') {
        const eu = (c.eu_adequacy_status ?? '').toLowerCase()
        const uk = (c.uk_adequacy_status ?? '').toLowerCase()
        if (regimeFilter === 'EU' && eu !== statusFilter) return false
        if (regimeFilter === 'UK' && uk !== statusFilter) return false
        if (regimeFilter === 'all' && eu !== statusFilter && uk !== statusFilter) return false
      }
      return true
    })
  }, [countries, search, statusFilter, regimeFilter])

  const filteredEvents = useMemo(() => {
    return events
      .filter((e) => (regimeFilter === 'all' ? true : (e.regime ?? '').toUpperCase() === regimeFilter))
      .filter((e) => (statusFilter === 'all' ? true : (e.new_status ?? '').toLowerCase() === statusFilter))
      .slice()
      .sort((a, b) => {
        const ad = new Date(a.effective_date ?? a.created_at ?? 0).getTime()
        const bd = new Date(b.effective_date ?? b.created_at ?? 0).getTime()
        return bd - ad
      })
  }, [events, regimeFilter, statusFilter])

  function openModal() {
    setFormError('')
    setForm({
      country_id: countries[0]?.id ?? '',
      regime: 'EU',
      old_status: '',
      new_status: 'adequate',
      decision_ref: '',
      effective_date: new Date().toISOString().slice(0, 10),
      description: '',
    })
    setModalOpen(true)
  }

  async function submit() {
    if (!form.country_id) {
      setFormError('Select a country')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      await api.createAdequacyEvent({
        country_id: form.country_id,
        regime: form.regime,
        old_status: form.old_status || undefined,
        new_status: form.new_status,
        decision_ref: form.decision_ref || undefined,
        effective_date: form.effective_date || undefined,
        description: form.description || undefined,
      })
      setModalOpen(false)
      await load()
    } catch (err: any) {
      setFormError(err?.message ?? 'Failed to record event')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoader label="Loading adequacy tracker..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Adequacy Tracker</h1>
          <p className="mt-1 text-sm text-slate-500">
            EU and UK adequacy decisions, change events, and exposure of dependent transfer flows.
          </p>
        </div>
        <Button onClick={openModal}>Record adequacy change</Button>
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
        <Stat label="Countries tracked" value={countries.length} />
        <Stat label="Flows mapped" value={totalFlows} hint="From exposure summary" />
        <Stat label="Flows at risk" value={atRisk} tone={atRisk > 0 ? 'danger' : 'success'} />
        <Stat label="Change events" value={events.length} />
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Exposure by adequacy status</h2>
          <span className="text-xs text-slate-500">Dependent flows per status</span>
        </CardHeader>
        <CardBody>
          {exposureBuckets.length === 0 ? (
            <p className="text-sm text-slate-500">No exposure data yet. Map transfer flows to recipients and countries.</p>
          ) : (
            <div className="space-y-3">
              {exposureBuckets.map((b) => {
                const value = Number(b.flows ?? b.count ?? 0)
                const pct = Math.round((value / maxBucket) * 100)
                return (
                  <div key={b.status ?? b.label} className="flex items-center gap-3">
                    <div className="w-36 shrink-0">
                      <Badge tone={coverageTone(b.status ?? b.label)}>{statusLabel(b.status ?? b.label)}</Badge>
                    </div>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full rounded-full ${
                          coverageTone(b.status ?? b.label) === 'danger'
                            ? 'bg-rose-500'
                            : coverageTone(b.status ?? b.label) === 'warning'
                              ? 'bg-amber-500'
                              : coverageTone(b.status ?? b.label) === 'success'
                                ? 'bg-emerald-500'
                                : 'bg-indigo-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="w-10 shrink-0 text-right text-sm font-semibold text-slate-200">{value}</div>
                  </div>
                )
              })}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search countries..."
              className="min-w-[180px] flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
            <select
              value={regimeFilter}
              onChange={(e) => setRegimeFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">All regimes</option>
              {REGIMES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {filteredCountries.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No countries match"
                description="Adjust your filters or seed sample data from the dashboard."
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Country</TH>
                  <TH>Region</TH>
                  <TH>EU adequacy</TH>
                  <TH>UK adequacy</TH>
                  <TH>Review date</TH>
                  <TH>Surveillance</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filteredCountries.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <Link href={`/dashboard/countries/${c.id}`} className="font-medium text-white hover:text-indigo-300">
                        {c.iso_code ? `${c.iso_code} · ` : ''}
                        {c.name}
                      </Link>
                    </TD>
                    <TD>{c.region ?? '—'}</TD>
                    <TD>
                      <Badge tone={coverageTone(c.eu_adequacy_status)}>{statusLabel(c.eu_adequacy_status)}</Badge>
                    </TD>
                    <TD>
                      <Badge tone={coverageTone(c.uk_adequacy_status)}>{statusLabel(c.uk_adequacy_status)}</Badge>
                    </TD>
                    <TD>{fmtDate(c.review_date)}</TD>
                    <TD>
                      {c.surveillance_risk ? (
                        <Badge tone={coverageTone(c.surveillance_risk)}>{statusLabel(c.surveillance_risk)}</Badge>
                      ) : (
                        '—'
                      )}
                    </TD>
                    <TD className="text-right">
                      <Link href={`/dashboard/countries/${c.id}`} className="text-sm text-indigo-400 hover:text-indigo-300">
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

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-white">Adequacy change timeline</h2>
        </CardHeader>
        <CardBody>
          {filteredEvents.length === 0 ? (
            <EmptyState
              title="No adequacy events"
              description="Record a change to flag dependent flows and notify country subscribers."
              action={<Button onClick={openModal}>Record adequacy change</Button>}
            />
          ) : (
            <ol className="relative space-y-5 border-l border-slate-800 pl-6">
              {filteredEvents.map((e) => {
                const c = countryName.get(e.country_id)
                return (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-slate-950 bg-indigo-500" />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white">
                        {c ? (
                          <Link href={`/dashboard/countries/${c.id}`} className="hover:text-indigo-300">
                            {c.name}
                          </Link>
                        ) : (
                          e.country_id
                        )}
                      </span>
                      <Badge tone="info">{(e.regime ?? '—').toUpperCase()}</Badge>
                      {e.old_status && (
                        <Badge tone={coverageTone(e.old_status)}>{statusLabel(e.old_status)}</Badge>
                      )}
                      <span className="text-slate-600">→</span>
                      <Badge tone={coverageTone(e.new_status)}>{statusLabel(e.new_status)}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {fmtDate(e.effective_date ?? e.created_at)}
                      {e.decision_ref ? ` · ${e.decision_ref}` : ''}
                    </div>
                    {e.description && <p className="mt-1 text-sm text-slate-400">{e.description}</p>}
                  </li>
                )
              })}
            </ol>
          )}
        </CardBody>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Record adequacy change"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? <Spinner label="Saving..." /> : 'Record event'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-rose-700 bg-rose-900/30 p-3 text-sm text-rose-300">{formError}</div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Country</label>
            <select
              value={form.country_id}
              onChange={(e) => setForm({ ...form, country_id: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="">Select a country</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.iso_code ? `${c.iso_code} · ` : ''}
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Regime</label>
              <select
                value={form.regime}
                onChange={(e) => setForm({ ...form, regime: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
              >
                {REGIMES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Effective date</label>
              <input
                type="date"
                value={form.effective_date}
                onChange={(e) => setForm({ ...form, effective_date: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Old status</label>
              <select
                value={form.old_status}
                onChange={(e) => setForm({ ...form, old_status: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Unknown / new</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">New status</label>
              <select
                value={form.new_status}
                onChange={(e) => setForm({ ...form, new_status: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Decision reference</label>
            <input
              value={form.decision_ref}
              onChange={(e) => setForm({ ...form, decision_ref: e.target.value })}
              placeholder="e.g. 2021/914 or DPF"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              placeholder="Context for this adequacy change..."
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <p className="text-xs text-slate-500">
            Recording a change re-flags dependent flows as at-risk and notifies country subscribers.
          </p>
        </div>
      </Modal>
    </div>
  )
}
