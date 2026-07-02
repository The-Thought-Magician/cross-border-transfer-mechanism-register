'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Badge, coverageTone } from '@/components/ui/Badge'

interface FlowLite {
  id: string
  recipient_name?: string
  destination_country?: string
  coverage_state?: string
  updated_at?: string
  created_at?: string
  [k: string]: any
}

interface Scorecard {
  total?: number
  coverage_pct?: number
  by_state?: Record<string, number>
  [k: string]: any
}

function timeAgo(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return ''
  const diffMs = Date.now() - d
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

/**
 * Persistent contextual rail: real quick-stats and recent register activity,
 * pulled from existing endpoints (coverage/scorecard, flows).
 */
export default function RightRail() {
  const [scorecard, setScorecard] = useState<Scorecard | null>(null)
  const [recentFlows, setRecentFlows] = useState<FlowLite[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    Promise.all([api.getScorecard(), api.getFlows({ limit: 6 })])
      .then(([sc, flows]) => {
        if (!mounted) return
        setScorecard(sc || {})
        const list: FlowLite[] = Array.isArray(flows) ? flows : flows?.data || flows?.items || []
        const sorted = [...list].sort((a, b) => {
          const ta = new Date(a.updated_at || a.created_at || 0).getTime()
          const tb = new Date(b.updated_at || b.created_at || 0).getTime()
          return tb - ta
        })
        setRecentFlows(sorted.slice(0, 5))
      })
      .catch(() => {
        if (mounted) {
          setScorecard({})
          setRecentFlows([])
        }
      })
      .finally(() => mounted && setLoading(false))
    return () => {
      mounted = false
    }
  }, [])

  const byState = scorecard?.by_state || {}
  const openGaps = (byState['gap'] || 0) + (byState['none'] || 0)

  return (
    <aside className="hidden w-72 shrink-0 border-l border-slate-800 bg-slate-900/40 xl:block">
      <div className="sticky top-0 flex h-screen flex-col overflow-y-auto p-5">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">
          Register at a glance
        </h2>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Flows</div>
            <div className="mt-1 text-xl font-bold text-white">
              {loading ? '—' : scorecard?.total ?? 0}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Coverage</div>
            <div className="mt-1 text-xl font-bold text-yellow-400">
              {loading ? '—' : `${Number(scorecard?.coverage_pct ?? 0).toFixed(0)}%`}
            </div>
          </div>
          <div className="col-span-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Open gaps</div>
            <div className="mt-1 text-xl font-bold text-white">{loading ? '—' : openGaps}</div>
          </div>
        </div>

        <h2 className="mt-6 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
          Recent register updates
        </h2>
        <div className="mt-3 space-y-2">
          {loading && <p className="text-xs text-slate-500">Loading...</p>}
          {!loading && recentFlows.length === 0 && (
            <p className="text-xs text-slate-500">No flows recorded yet.</p>
          )}
          {recentFlows.map((f) => (
            <Link
              key={f.id}
              href={`/dashboard/flows/${f.id}`}
              className="block rounded-lg border border-slate-800 bg-slate-900/60 p-3 transition-colors hover:border-yellow-500/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-slate-200">
                  {f.recipient_name || f.destination_country || 'Transfer flow'}
                </span>
                {f.coverage_state && (
                  <Badge tone={coverageTone(f.coverage_state)} className="shrink-0">
                    {f.coverage_state}
                  </Badge>
                )}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {timeAgo(f.updated_at || f.created_at)}
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-6 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
          <p className="text-[11px] leading-relaxed text-slate-400">
            Chapter V audit trail: every mechanism change and TIA sign-off is logged for regulator
            review.
          </p>
          <Link
            href="/dashboard/audit"
            className="mt-2 inline-block text-xs font-medium text-yellow-400 hover:text-yellow-300"
          >
            View audit log →
          </Link>
        </div>
      </div>
    </aside>
  )
}
