'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, coverageTone } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { PageLoader, Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

type Coverage = {
  id?: string
  flow_id: string
  flow_name?: string
  workspace_id?: string
  state?: string
  verdict?: string
  failed_conditions?: string[]
  risk_score?: number
  computed_at?: string
}
type Scorecard = {
  total_flows?: number
  total?: number
  covered?: number
  partial?: number
  at_risk?: number
  gaps?: number
  gap?: number
  percent_covered?: number
  coverage_percent?: number
  avg_risk_score?: number
  by_state?: Record<string, number> | { state: string; count: number }[]
  states?: Record<string, number>
  breakdown?: { state: string; count: number }[]
}

const STATE_COLORS: Record<string, string> = {
  covered: '#34d399',
  adequate: '#34d399',
  partial: '#fbbf24',
  'at-risk': '#fb923c',
  expiring: '#fbbf24',
  gap: '#fb7185',
  none: '#fb7185',
  unknown: '#64748b',
}

function colorFor(state: string) {
  return STATE_COLORS[state.toLowerCase()] || '#64748b'
}

function normalizeBreakdown(sc: Scorecard | null, coverage: Coverage[]): { state: string; count: number }[] {
  if (sc) {
    if (Array.isArray(sc.breakdown) && sc.breakdown.length) return sc.breakdown
    if (Array.isArray(sc.by_state)) return sc.by_state as { state: string; count: number }[]
    const map = (sc.by_state && !Array.isArray(sc.by_state) ? sc.by_state : sc.states) as
      | Record<string, number>
      | undefined
    if (map && Object.keys(map).length) {
      return Object.entries(map).map(([state, count]) => ({ state, count: Number(count) }))
    }
    const derived: { state: string; count: number }[] = []
    if (sc.covered != null) derived.push({ state: 'covered', count: sc.covered })
    if (sc.partial != null) derived.push({ state: 'partial', count: sc.partial })
    if (sc.at_risk != null) derived.push({ state: 'at-risk', count: sc.at_risk })
    const g = sc.gaps ?? sc.gap
    if (g != null) derived.push({ state: 'gap', count: g })
    if (derived.length) return derived
  }
  // derive from coverage rows
  const counts: Record<string, number> = {}
  for (const c of coverage) {
    const s = (c.state || 'unknown').toLowerCase()
    counts[s] = (counts[s] || 0) + 1
  }
  return Object.entries(counts).map(([state, count]) => ({ state, count }))
}

export default function CoveragePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [coverage, setCoverage] = useState<Coverage[]>([])
  const [scorecard, setScorecard] = useState<Scorecard | null>(null)

  const [recomputing, setRecomputing] = useState(false)
  const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [cov, sc] = await Promise.all([
        api.getCoverage() as Promise<Coverage[]>,
        api.getScorecard().catch(() => null) as Promise<Scorecard | null>,
      ])
      setCoverage(Array.isArray(cov) ? cov : [])
      setScorecard(sc)
    } catch (e: any) {
      setError(e?.message || 'Failed to load coverage')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const breakdown = useMemo(() => normalizeBreakdown(scorecard, coverage), [scorecard, coverage])
  const totalForBreakdown = useMemo(
    () => breakdown.reduce((a, b) => a + b.count, 0),
    [breakdown],
  )

  const total = scorecard?.total_flows ?? scorecard?.total ?? coverage.length
  const covered =
    scorecard?.covered ??
    coverage.filter((c) => ['covered', 'adequate'].includes((c.state || '').toLowerCase())).length
  const gaps =
    scorecard?.gaps ??
    scorecard?.gap ??
    coverage.filter((c) => ['gap', 'none'].includes((c.state || '').toLowerCase())).length
  const atRisk =
    scorecard?.at_risk ??
    coverage.filter((c) => (c.state || '').toLowerCase() === 'at-risk').length
  const pct =
    scorecard?.percent_covered ??
    scorecard?.coverage_percent ??
    (total ? Math.round((covered / total) * 100) : 0)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return coverage.filter((c) => {
      if (stateFilter && (c.state || '').toLowerCase() !== stateFilter) return false
      if (q) {
        const hay = `${c.flow_name || ''} ${c.flow_id} ${c.verdict || ''} ${(c.failed_conditions || []).join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [coverage, stateFilter, search])

  async function recompute() {
    setRecomputing(true)
    setRecomputeMsg(null)
    setError(null)
    try {
      const res = (await api.recomputeCoverage({})) as Coverage[] | { count?: number }
      const count = Array.isArray(res) ? res.length : res?.count
      setRecomputeMsg(
        count != null ? `Recomputed coverage for ${count} flow(s).` : 'Coverage recomputed.',
      )
      await load()
    } catch (e: any) {
      setError(e?.message || 'Recompute failed')
    } finally {
      setRecomputing(false)
    }
  }

  if (loading) return <PageLoader label="Loading coverage scorecard..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Coverage Scorecard</h1>
          <p className="mt-1 text-sm text-slate-400">
            Validity-engine results across every transfer flow in the register.
          </p>
        </div>
        <Button onClick={recompute} disabled={recomputing}>
          {recomputing ? <Spinner label="Recomputing..." /> : 'Recompute coverage'}
        </Button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <span>{error}</span>
          <Button size="sm" variant="secondary" onClick={load}>
            Retry
          </Button>
        </div>
      )}
      {recomputeMsg && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {recomputeMsg}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total flows" value={total} />
        <Stat label="Covered" value={covered} tone="success" />
        <Stat label="At risk" value={atRisk} tone={atRisk > 0 ? 'warning' : 'default'} />
        <Stat label="Gaps" value={gaps} tone={gaps > 0 ? 'danger' : 'success'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Coverage gauge */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <h2 className="text-sm font-semibold text-white">Coverage</h2>
          </CardHeader>
          <CardBody className="flex flex-col items-center">
            <Gauge percent={Number(pct) || 0} />
            <div className="mt-4 text-center text-sm text-slate-400">
              {covered} of {total} flows have a valid Chapter V mechanism
            </div>
            {scorecard?.avg_risk_score != null && (
              <div className="mt-2 text-xs text-slate-500">
                Avg. residual risk score: {Math.round(scorecard.avg_risk_score)}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Breakdown bar chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="text-sm font-semibold text-white">By coverage state</h2>
          </CardHeader>
          <CardBody>
            {breakdown.length === 0 || totalForBreakdown === 0 ? (
              <p className="text-sm text-slate-500">No coverage data yet. Recompute to populate.</p>
            ) : (
              <div className="space-y-3">
                {/* stacked bar */}
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
                  {breakdown.map((b) => (
                    <div
                      key={b.state}
                      style={{
                        width: `${(b.count / totalForBreakdown) * 100}%`,
                        backgroundColor: colorFor(b.state),
                      }}
                      title={`${b.state}: ${b.count}`}
                    />
                  ))}
                </div>
                {/* legend rows with proportional bars */}
                <div className="space-y-2">
                  {breakdown
                    .slice()
                    .sort((a, b) => b.count - a.count)
                    .map((b) => (
                      <div key={b.state} className="flex items-center gap-3">
                        <span className="w-24 shrink-0 text-xs capitalize text-slate-400">
                          {b.state}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(b.count / totalForBreakdown) * 100}%`,
                              backgroundColor: colorFor(b.state),
                            }}
                          />
                        </div>
                        <span className="w-10 shrink-0 text-right text-xs text-slate-300">
                          {b.count}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Per-flow table */}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">Per-flow results</h2>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search flows / conditions..."
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:border-yellow-400 focus:outline-none"
            />
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
            >
              <option value="">All states</option>
              <option value="covered">covered</option>
              <option value="partial">partial</option>
              <option value="at-risk">at-risk</option>
              <option value="gap">gap</option>
            </select>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={coverage.length === 0 ? 'No coverage results' : 'No matches'}
                description={
                  coverage.length === 0
                    ? 'Run a recompute to evaluate flow validity against Chapter V conditions.'
                    : 'Adjust your search or filter.'
                }
                action={
                  coverage.length === 0 && (
                    <Button onClick={recompute} disabled={recomputing}>
                      Recompute coverage
                    </Button>
                  )
                }
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Flow</TH>
                  <TH>State</TH>
                  <TH>Verdict</TH>
                  <TH>Failed conditions</TH>
                  <TH>Risk</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((c) => (
                  <TR key={c.id || c.flow_id}>
                    <TD className="font-medium text-slate-100">
                      <Link
                        href={`/dashboard/flows/${c.flow_id}`}
                        className="hover:text-yellow-300"
                      >
                        {c.flow_name || c.flow_id}
                      </Link>
                    </TD>
                    <TD>
                      <Badge tone={coverageTone(c.state)}>{c.state || 'unknown'}</Badge>
                    </TD>
                    <TD className="max-w-xs text-slate-400">{c.verdict || '—'}</TD>
                    <TD>
                      {c.failed_conditions && c.failed_conditions.length ? (
                        <div className="flex flex-wrap gap-1">
                          {c.failed_conditions.map((f, i) => (
                            <Badge key={i} tone="danger">
                              {f}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-600">none</span>
                      )}
                    </TD>
                    <TD>
                      <span
                        className={
                          (c.risk_score || 0) >= 70
                            ? 'text-rose-300'
                            : (c.risk_score || 0) >= 40
                              ? 'text-amber-300'
                              : 'text-slate-300'
                        }
                      >
                        {c.risk_score != null ? c.risk_score : '—'}
                      </span>
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

function Gauge({ percent }: { percent: number }) {
  const p = Math.max(0, Math.min(100, percent))
  const r = 54
  const c = 2 * Math.PI * r
  const dash = (p / 100) * c
  const color = p >= 80 ? '#34d399' : p >= 50 ? '#fbbf24' : '#fb7185'
  return (
    <div className="relative h-40 w-40">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#1e293b" strokeWidth="12" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold text-white">{Math.round(p)}%</span>
        <span className="text-xs uppercase tracking-wide text-slate-500">covered</span>
      </div>
    </div>
  )
}
