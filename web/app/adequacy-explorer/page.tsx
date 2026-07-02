'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Badge, coverageTone } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Stat } from '@/components/ui/Stat'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/button'

interface Country {
  id: string
  iso_code: string
  name: string
  region?: string | null
  eu_adequacy_status?: string | null
  uk_adequacy_status?: string | null
  eu_decision_ref?: string | null
  uk_decision_ref?: string | null
  effective_date?: string | null
  review_date?: string | null
  surveillance_risk?: string | null
  notes?: string | null
}

interface AdequacyEvent {
  id: string
  country_id: string
  regime?: string | null
  old_status?: string | null
  new_status?: string | null
  decision_ref?: string | null
  effective_date?: string | null
  description?: string | null
  created_at?: string | null
}

function statusLabel(s?: string | null) {
  if (!s) return 'Not assessed'
  return s
    .split(/[-_\s]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function fmtDate(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function AdequacyExplorerPage() {
  const [countries, setCountries] = useState<Country[]>([])
  const [events, setEvents] = useState<AdequacyEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [region, setRegion] = useState('all')
  const [regime, setRegime] = useState<'eu' | 'uk'>('eu')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    let active = true
    Promise.all([api.getCountries(), api.getAdequacyEvents()])
      .then(([c, e]) => {
        if (!active) return
        setCountries(Array.isArray(c) ? c : [])
        setEvents(Array.isArray(e) ? e : [])
      })
      .catch((err) => active && setError(err?.message || 'Failed to load adequacy data'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const regions = useMemo(() => {
    const set = new Set<string>()
    countries.forEach((c) => c.region && set.add(c.region))
    return Array.from(set).sort()
  }, [countries])

  const statusValue = (c: Country) =>
    regime === 'eu' ? c.eu_adequacy_status : c.uk_adequacy_status

  const statuses = useMemo(() => {
    const set = new Set<string>()
    countries.forEach((c) => {
      const v = statusValue(c)
      if (v) set.add(v)
    })
    return Array.from(set).sort()
  }, [countries, regime])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return countries
      .filter((c) => {
        if (region !== 'all' && c.region !== region) return false
        if (statusFilter !== 'all' && statusValue(c) !== statusFilter) return false
        if (q) {
          const hay = `${c.name} ${c.iso_code} ${c.region ?? ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [countries, region, statusFilter, search, regime])

  const counts = useMemo(() => {
    let adequate = 0
    let partial = 0
    let inadequate = 0
    countries.forEach((c) => {
      const tone = coverageTone(statusValue(c) ?? '')
      if (tone === 'success') adequate++
      else if (tone === 'warning') partial++
      else if (tone === 'danger') inadequate++
    })
    return { adequate, partial, inadequate, total: countries.length }
  }, [countries, regime])

  const recentEvents = useMemo(
    () =>
      [...events]
        .sort((a, b) => (b.effective_date || b.created_at || '').localeCompare(a.effective_date || a.created_at || ''))
        .slice(0, 12),
    [events]
  )

  const countryName = (id: string) => countries.find((c) => c.id === id)?.name || 'Unknown country'

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <PublicNav />
        <PageLoader label="Loading adequacy register..." />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <PublicNav />
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">Public register</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Country Adequacy Explorer</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            EU (GDPR Chapter V) and UK adequacy status for cross-border personal-data transfers, with the
            decision references and the latest status-change events.
          </p>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Countries" value={counts.total} />
          <Stat label="Adequate" value={counts.adequate} tone="success" hint={regime.toUpperCase()} />
          <Stat label="With conditions" value={counts.partial} tone="warning" hint={regime.toUpperCase()} />
          <Stat label="Not adequate" value={counts.inadequate} tone="danger" hint={regime.toUpperCase()} />
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-700">
            {(['eu', 'uk'] as const).map((r) => (
              <button
                key={r}
                onClick={() => {
                  setRegime(r)
                  setStatusFilter('all')
                }}
                className={`px-4 py-2 text-sm font-medium ${
                  regime === r ? 'bg-yellow-500 text-slate-900' : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                {r === 'eu' ? 'EU adequacy' : 'UK adequacy'}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search country or ISO code..."
            className="min-w-[14rem] flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-yellow-400 focus:outline-none"
          />
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-yellow-400 focus:outline-none"
          >
            <option value="all">All regions</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-yellow-400 focus:outline-none"
          >
            <option value="all">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">
                  Adequacy register
                  <span className="ml-2 text-xs font-normal text-slate-500">{filtered.length} shown</span>
                </h2>
              </CardHeader>
              <CardBody className="px-0 py-0">
                {filtered.length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      title="No matching countries"
                      description="Adjust your search, region, or status filters."
                    />
                  </div>
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Country</TH>
                        <TH>Region</TH>
                        <TH>{regime === 'eu' ? 'EU status' : 'UK status'}</TH>
                        <TH>Decision ref</TH>
                        <TH>Effective</TH>
                        <TH>Surveillance</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {filtered.map((c) => {
                        const st = statusValue(c)
                        const decRef = regime === 'eu' ? c.eu_decision_ref : c.uk_decision_ref
                        return (
                          <TR key={c.id}>
                            <TD>
                              <div className="flex items-center gap-2">
                                <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-slate-400">
                                  {c.iso_code}
                                </span>
                                <span className="font-medium text-white">{c.name}</span>
                              </div>
                            </TD>
                            <TD>{c.region || '—'}</TD>
                            <TD>
                              <Badge tone={coverageTone(st ?? '')}>{statusLabel(st)}</Badge>
                            </TD>
                            <TD className="font-mono text-xs">{decRef || '—'}</TD>
                            <TD>{fmtDate(c.effective_date)}</TD>
                            <TD>
                              {c.surveillance_risk ? (
                                <Badge tone={coverageTone(c.surveillance_risk)}>
                                  {statusLabel(c.surveillance_risk)}
                                </Badge>
                              ) : (
                                '—'
                              )}
                            </TD>
                          </TR>
                        )
                      })}
                    </TBody>
                  </Table>
                )}
              </CardBody>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-white">Recent adequacy changes</h2>
              </CardHeader>
              <CardBody className="space-y-4">
                {recentEvents.length === 0 ? (
                  <p className="text-sm text-slate-500">No recorded adequacy-change events yet.</p>
                ) : (
                  recentEvents.map((e) => (
                    <div key={e.id} className="border-l-2 border-yellow-500/40 pl-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-white">{countryName(e.country_id)}</span>
                        <span className="text-xs text-slate-500">{fmtDate(e.effective_date || e.created_at)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        {e.regime && <Badge tone="info">{e.regime.toUpperCase()}</Badge>}
                        {e.old_status && (
                          <Badge tone={coverageTone(e.old_status)}>{statusLabel(e.old_status)}</Badge>
                        )}
                        <span className="text-slate-600">→</span>
                        {e.new_status && (
                          <Badge tone={coverageTone(e.new_status)}>{statusLabel(e.new_status)}</Badge>
                        )}
                      </div>
                      {e.description && <p className="mt-1 text-xs text-slate-400">{e.description}</p>}
                      {e.decision_ref && (
                        <p className="mt-0.5 font-mono text-[11px] text-slate-500">{e.decision_ref}</p>
                      )}
                    </div>
                  ))
                )}
              </CardBody>
            </Card>

            <Card>
              <CardBody className="space-y-3 text-sm text-slate-400">
                <p className="font-medium text-white">Manage your own transfer register</p>
                <p>
                  Sign in to map transfer flows against these adequacy decisions, run the validity engine, and
                  generate regulator-ready audit packs.
                </p>
                <Link href="/auth/sign-up">
                  <Button className="w-full">Get started free</Button>
                </Link>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>
    </main>
  )
}

function PublicNav() {
  return (
    <nav className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
      <Link href="/" className="text-lg font-bold tracking-tight text-yellow-400">
        CrossBorderTransferMechanismRegister
      </Link>
      <div className="flex items-center gap-4">
        <Link href="/pricing" className="text-sm text-slate-300 hover:text-white">
          Pricing
        </Link>
        <Link href="/auth/sign-in" className="text-sm text-slate-300 hover:text-white">
          Sign In
        </Link>
        <Link
          href="/auth/sign-up"
          className="rounded-lg bg-yellow-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-yellow-400"
        >
          Get Started
        </Link>
      </div>
    </nav>
  )
}
