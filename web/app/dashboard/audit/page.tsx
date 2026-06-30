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
import { PageLoader } from '@/components/ui/Spinner'

type AuditLog = {
  id: string
  workspace_id?: string
  actor_user_id?: string | null
  action: string
  entity_type?: string | null
  entity_id?: string | null
  detail?: Record<string, any> | null
  created_at?: string
  [k: string]: any
}

function fmtDateTime(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtDay(d?: string | null) {
  if (!d) return 'Unknown date'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return 'Unknown date'
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

function actionTone(action: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  const a = action.toLowerCase()
  if (a.includes('delete') || a.includes('reject') || a.includes('remove') || a.includes('at-risk') || a.includes('fail')) return 'danger'
  if (a.includes('create') || a.includes('approve') || a.includes('add') || a.includes('sign')) return 'success'
  if (a.includes('update') || a.includes('edit') || a.includes('change') || a.includes('repaper')) return 'warning'
  if (a.includes('review') || a.includes('recompute') || a.includes('export') || a.includes('import')) return 'info'
  return 'neutral'
}

function shortId(id?: string | null) {
  if (!id) return '—'
  return id.length > 12 ? `${id.slice(0, 8)}…` : id
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // server-side filters
  const [entityTypeFilter, setEntityTypeFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [actorFilter, setActorFilter] = useState('')

  // client-side search
  const [search, setSearch] = useState('')

  // detail modal
  const [selected, setSelected] = useState<AuditLog | null>(null)

  async function load() {
    setError(null)
    try {
      const params: Record<string, string> = {}
      if (entityTypeFilter !== 'all') params.entity_type = entityTypeFilter
      if (actionFilter !== 'all') params.action = actionFilter
      if (actorFilter.trim()) params.actor = actorFilter.trim()
      const res: any = await api.getAuditLogs(Object.keys(params).length ? params : undefined)
      const list = Array.isArray(res) ? res : (res?.logs ?? res?.items ?? [])
      setLogs(list)
    } catch (e: any) {
      setError(e?.message || 'Failed to load audit log')
      setLogs([])
    }
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      await load()
      if (mounted) setLoading(false)
    })()
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-fetch when server filters change (debounce actor text input)
  useEffect(() => {
    if (loading) return
    const t = setTimeout(() => {
      load()
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityTypeFilter, actionFilter, actorFilter])

  const entityTypes = useMemo(() => {
    const s = new Set<string>()
    logs.forEach((l) => l.entity_type && s.add(l.entity_type))
    return Array.from(s).sort()
  }, [logs])

  const actions = useMemo(() => {
    const s = new Set<string>()
    logs.forEach((l) => l.action && s.add(l.action))
    return Array.from(s).sort()
  }, [logs])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return logs
    return logs.filter((l) =>
      `${l.action} ${l.entity_type ?? ''} ${l.entity_id ?? ''} ${l.actor_user_id ?? ''} ${JSON.stringify(l.detail ?? {})}`
        .toLowerCase()
        .includes(q)
    )
  }, [logs, search])

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()),
    [filtered]
  )

  // Group by day for the timeline render
  const grouped = useMemo(() => {
    const map = new Map<string, AuditLog[]>()
    for (const l of sorted) {
      const key = fmtDay(l.created_at)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(l)
    }
    return Array.from(map.entries())
  }, [sorted])

  const stats = useMemo(() => {
    const today = new Date().toDateString()
    const todayCount = logs.filter((l) => l.created_at && new Date(l.created_at).toDateString() === today).length
    const actors = new Set(logs.map((l) => l.actor_user_id).filter(Boolean)).size
    const entities = new Set(logs.map((l) => l.entity_type).filter(Boolean)).size
    return { total: logs.length, todayCount, actors, entities }
  }, [logs])

  function resetFilters() {
    setEntityTypeFilter('all')
    setActionFilter('all')
    setActorFilter('')
    setSearch('')
  }

  if (loading) return <PageLoader label="Loading audit log…" />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Audit Log</h1>
          <p className="mt-1 text-sm text-slate-400">
            Immutable activity trail of every change to flows, mechanisms, TIAs, SCCs, and adequacy records.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={resetFilters}>
            Reset filters
          </Button>
          <Button onClick={load}>Refresh</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total entries" value={stats.total} />
        <Stat label="Today" value={stats.todayCount} tone={stats.todayCount ? 'warning' : 'default'} />
        <Stat label="Distinct actors" value={stats.actors} />
        <Stat label="Entity types" value={stats.entities} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Activity</h2>
              <p className="text-xs text-slate-500">
                Showing {sorted.length} of {logs.length} entries.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search entries…"
                className="w-44 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
              <select
                value={entityTypeFilter}
                onChange={(e) => setEntityTypeFilter(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="all">All entity types</option>
                {entityTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="all">All actions</option>
                {actions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <input
                value={actorFilter}
                onChange={(e) => setActorFilter(e.target.value)}
                placeholder="Actor user ID"
                className="w-40 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {sorted.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title={logs.length ? 'No entries match your filters' : 'No activity recorded yet'}
                description={
                  logs.length
                    ? 'Adjust the entity type, action, actor, or search filters.'
                    : 'As changes are made across the register, they will be logged here automatically.'
                }
              />
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {grouped.map(([day, entries]) => (
                <div key={day}>
                  <div className="sticky top-0 z-10 bg-slate-900/80 px-5 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 backdrop-blur">
                    {day} · {entries.length}
                  </div>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Time</TH>
                        <TH>Action</TH>
                        <TH>Entity</TH>
                        <TH>Actor</TH>
                        <TH className="text-right">Detail</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {entries.map((l) => (
                        <TR key={l.id}>
                          <TD className="whitespace-nowrap text-slate-400">{fmtDateTime(l.created_at)}</TD>
                          <TD>
                            <Badge tone={actionTone(l.action)}>{l.action}</Badge>
                          </TD>
                          <TD>
                            {l.entity_type ? (
                              <div>
                                <span className="text-slate-200">{l.entity_type}</span>
                                <div className="font-mono text-[11px] text-slate-500">{shortId(l.entity_id)}</div>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-500">—</span>
                            )}
                          </TD>
                          <TD className="font-mono text-xs text-slate-400">{shortId(l.actor_user_id)}</TD>
                          <TD className="text-right">
                            {l.detail && Object.keys(l.detail).length ? (
                              <Button size="sm" variant="ghost" onClick={() => setSelected(l)}>
                                View
                              </Button>
                            ) : (
                              <span className="text-xs text-slate-600">—</span>
                            )}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Audit entry detail">
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-medium text-slate-500">Action</div>
                <Badge tone={actionTone(selected.action)}>{selected.action}</Badge>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500">When</div>
                <div className="text-slate-200">{fmtDateTime(selected.created_at)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500">Entity type</div>
                <div className="text-slate-200">{selected.entity_type ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500">Entity ID</div>
                <div className="break-all font-mono text-xs text-slate-300">{selected.entity_id ?? '—'}</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs font-medium text-slate-500">Actor user ID</div>
                <div className="break-all font-mono text-xs text-slate-300">{selected.actor_user_id ?? '—'}</div>
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-slate-500">Detail payload</div>
              <pre className="max-h-72 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
                {JSON.stringify(selected.detail ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
