'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Stat } from '@/components/ui/Stat'
import { Badge, coverageTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/button'
import { PageLoader } from '@/components/ui/Spinner'

interface DashboardSummary {
  total_flows?: number
  covered_flows?: number
  coverage_pct?: number
  open_gaps?: number
  expiring_mechanisms?: number
  overdue_tias?: number
  at_risk_flows?: number
  total_recipients?: number
  total_tias?: number
  [k: string]: any
}

interface Scorecard {
  total?: number
  by_state?: Record<string, number>
  by_verdict?: Record<string, number>
  coverage_pct?: number
  [k: string]: any
}

function num(v: any, d = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

function CoverageGauge({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct))
  const radius = 70
  const circ = 2 * Math.PI * radius
  const dash = (clamped / 100) * circ
  const tone =
    clamped >= 80 ? '#34d399' : clamped >= 50 ? '#fbbf24' : '#fb7185'
  return (
    <div className="flex flex-col items-center">
      <svg width="180" height="180" viewBox="0 0 180 180">
        <circle cx="90" cy="90" r={radius} fill="none" stroke="#1e293b" strokeWidth="14" />
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform="rotate(-90 90 90)"
        />
        <text x="90" y="84" textAnchor="middle" className="fill-white" fontSize="34" fontWeight="700">
          {clamped.toFixed(0)}%
        </text>
        <text x="90" y="108" textAnchor="middle" className="fill-slate-500" fontSize="12">
          covered
        </text>
      </svg>
    </div>
  )
}

function StateBar({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).filter(([, v]) => num(v) > 0)
  const total = entries.reduce((s, [, v]) => s + num(v), 0)
  if (total === 0) return <p className="text-sm text-slate-500">No coverage results computed yet.</p>
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
        {entries.map(([state, v]) => {
          const tone = coverageTone(state)
          const color =
            tone === 'success'
              ? 'bg-emerald-500'
              : tone === 'warning'
                ? 'bg-amber-500'
                : tone === 'danger'
                  ? 'bg-rose-500'
                  : tone === 'review'
                    ? 'bg-sky-500'
                    : 'bg-slate-600'
          return (
            <div key={state} className={color} style={{ width: `${(num(v) / total) * 100}%` }} title={`${state}: ${v}`} />
          )
        })}
      </div>
      <div className="flex flex-wrap gap-3">
        {entries.map(([state, v]) => (
          <div key={state} className="flex items-center gap-1.5 text-xs">
            <Badge tone={coverageTone(state)}>{state}</Badge>
            <span className="text-slate-400">{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [scorecard, setScorecard] = useState<Scorecard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [seedMsg, setSeedMsg] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    Promise.all([api.getDashboard(), api.getScorecard()])
      .then(([d, s]) => {
        setSummary(d || {})
        setScorecard(s || {})
        setError(null)
      })
      .catch((err) => setError(err?.message || 'Failed to load dashboard'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const handleSeed = async () => {
    setSeeding(true)
    setSeedMsg(null)
    try {
      await api.seedSample()
      setSeedMsg('Sample data seeded. Refreshing metrics...')
      load()
    } catch (err: any) {
      setSeedMsg(err?.message || 'Seeding failed')
    } finally {
      setSeeding(false)
    }
  }

  if (loading && !summary) return <PageLoader label="Loading dashboard..." />

  const coveragePct = num(summary?.coverage_pct ?? scorecard?.coverage_pct)
  const totalFlows = num(summary?.total_flows ?? scorecard?.total)
  const byState: Record<string, number> = (scorecard?.by_state as any) || {}
  const isEmpty = totalFlows === 0 && Object.keys(byState).length === 0

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Overview</h1>
          <p className="mt-1 text-sm text-slate-400">
            Chapter V transfer-compliance posture across your register.
          </p>
        </div>
        <Button onClick={handleSeed} disabled={seeding} variant="secondary">
          {seeding ? 'Seeding...' : 'Seed sample data'}
        </Button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}
      {seedMsg && (
        <div className="mb-6 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
          {seedMsg}
        </div>
      )}

      {isEmpty ? (
        <Card>
          <CardBody className="flex flex-col items-center gap-4 py-14 text-center">
            <h2 className="text-lg font-semibold text-white">Your register is empty</h2>
            <p className="max-w-md text-sm text-slate-400">
              Seed a realistic sample of countries, recipients, transfer flows, SCCs and TIAs to explore the
              platform, or start building your register from scratch.
            </p>
            <div className="flex gap-3">
              <Button onClick={handleSeed} disabled={seeding}>
                {seeding ? 'Seeding...' : 'Seed sample data'}
              </Button>
              <Link href="/dashboard/flows">
                <Button variant="secondary">Add a flow</Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Transfer flows" value={totalFlows} hint={`${num(summary?.covered_flows)} covered`} />
            <Stat
              label="At-risk flows"
              value={num(summary?.at_risk_flows)}
              tone={num(summary?.at_risk_flows) > 0 ? 'danger' : 'success'}
            />
            <Stat
              label="Open gaps"
              value={num(summary?.open_gaps)}
              tone={num(summary?.open_gaps) > 0 ? 'warning' : 'success'}
            />
            <Stat
              label="Overdue TIAs"
              value={num(summary?.overdue_tias)}
              tone={num(summary?.overdue_tias) > 0 ? 'danger' : 'success'}
            />
            <Stat
              label="Expiring mechanisms"
              value={num(summary?.expiring_mechanisms)}
              tone={num(summary?.expiring_mechanisms) > 0 ? 'warning' : 'default'}
            />
            <Stat label="Recipients" value={num(summary?.total_recipients)} />
            <Stat label="TIAs" value={num(summary?.total_tias)} />
            <Stat label="Coverage" value={`${coveragePct.toFixed(0)}%`} tone={coveragePct >= 80 ? 'success' : coveragePct >= 50 ? 'warning' : 'danger'} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-white">Coverage gauge</h2>
              </CardHeader>
              <CardBody className="flex flex-col items-center gap-3">
                <CoverageGauge pct={coveragePct} />
                <p className="text-center text-xs text-slate-500">
                  {num(summary?.covered_flows)} of {totalFlows} flows have a valid transfer mechanism.
                </p>
              </CardBody>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <h2 className="text-sm font-semibold text-white">Coverage by state</h2>
              </CardHeader>
              <CardBody>
                <StateBar data={byState} />
                {scorecard?.by_verdict && Object.keys(scorecard.by_verdict).length > 0 && (
                  <div className="mt-6">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      By verdict
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(scorecard.by_verdict).map(([k, v]) => (
                        <div key={k} className="flex items-center gap-1.5 text-xs">
                          <Badge tone={coverageTone(k)}>{k}</Badge>
                          <span className="text-slate-400">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { href: '/dashboard/flows', label: 'Transfer flows', desc: 'Manage the register' },
              { href: '/dashboard/coverage', label: 'Coverage scorecard', desc: 'Run the validity engine' },
              { href: '/dashboard/gaps', label: 'Gaps & tasks', desc: 'Work the remediation queue' },
              { href: '/dashboard/adequacy', label: 'Adequacy tracker', desc: 'Watch country changes' },
            ].map((q) => (
              <Link key={q.href} href={q.href}>
                <Card className="h-full transition-colors hover:border-yellow-400/50">
                  <CardBody>
                    <div className="text-sm font-semibold text-white">{q.label}</div>
                    <div className="mt-1 text-xs text-slate-500">{q.desc}</div>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
