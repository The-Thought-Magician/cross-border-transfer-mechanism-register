'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader, Spinner } from '@/components/ui/Spinner'

type Notification = {
  id: string
  workspace_id?: string
  user_id?: string
  category?: string | null
  title: string
  body?: string | null
  entity_type?: string | null
  entity_id?: string | null
  read: boolean
  created_at?: string
  [k: string]: any
}

function fmtRelative(d?: string | null) {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return ''
  const diff = Date.now() - dt.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function categoryTone(cat?: string | null): 'success' | 'warning' | 'danger' | 'info' | 'review' | 'neutral' {
  const c = (cat ?? '').toLowerCase()
  if (c.includes('risk') || c.includes('expir') || c.includes('overdue') || c.includes('alert') || c.includes('adequacy')) return 'danger'
  if (c.includes('repaper') || c.includes('due') || c.includes('warn')) return 'warning'
  if (c.includes('review') || c.includes('approval')) return 'review'
  if (c.includes('task') || c.includes('assign')) return 'info'
  return 'neutral'
}

function entityLink(n: Notification): string | null {
  if (!n.entity_type || !n.entity_id) return null
  switch (n.entity_type) {
    case 'flow':
    case 'transfer_flow':
      return `/dashboard/flows/${n.entity_id}`
    case 'tia':
      return `/dashboard/tias/${n.entity_id}`
    case 'recipient':
      return `/dashboard/recipients/${n.entity_id}`
    case 'country':
      return `/dashboard/countries/${n.entity_id}`
    case 'scc':
      return `/dashboard/scc`
    case 'review':
      return `/dashboard/reviews`
    case 'task':
    case 'remediation_task':
      return `/dashboard/gaps`
    default:
      return null
  }
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)

  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [search, setSearch] = useState('')

  async function load() {
    setError(null)
    try {
      const res: any = await api.getNotifications()
      const list = Array.isArray(res) ? res : (res?.notifications ?? res?.items ?? [])
      setItems(list)
    } catch (e: any) {
      setError(e?.message || 'Failed to load notifications')
      setItems([])
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
  }, [])

  const categories = useMemo(() => {
    const s = new Set<string>()
    items.forEach((n) => n.category && s.add(n.category))
    return Array.from(s).sort()
  }, [items])

  const unreadCount = useMemo(() => items.filter((n) => !n.read).length, [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items
      .filter((n) => {
        if (tab === 'unread' && n.read) return false
        if (categoryFilter !== 'all' && n.category !== categoryFilter) return false
        if (q && !`${n.title} ${n.body ?? ''} ${n.category ?? ''}`.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
  }, [items, tab, categoryFilter, search])

  const stats = useMemo(() => {
    const high = items.filter((n) => categoryTone(n.category) === 'danger').length
    return { total: items.length, unread: unreadCount, high }
  }, [items, unreadCount])

  async function markRead(n: Notification) {
    if (n.read) return
    setBusy(n.id)
    // optimistic
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
    try {
      await api.markNotificationRead(n.id)
    } catch (e: any) {
      setError(e?.message || 'Failed to mark notification read')
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: false } : x)))
    } finally {
      setBusy(null)
    }
  }

  async function markAll() {
    if (!unreadCount) return
    setMarkingAll(true)
    setError(null)
    const snapshot = items
    setItems((prev) => prev.map((x) => ({ ...x, read: true })))
    try {
      await api.markAllNotificationsRead()
      await load()
    } catch (e: any) {
      setError(e?.message || 'Failed to mark all read')
      setItems(snapshot)
    } finally {
      setMarkingAll(false)
    }
  }

  if (loading) return <PageLoader label="Loading notifications…" />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Notifications</h1>
          <p className="mt-1 text-sm text-slate-400">
            Adequacy changes, expiring mechanisms, repaper alerts, overdue TIAs, and review assignments.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={load}>
            Refresh
          </Button>
          <Button onClick={markAll} disabled={markingAll || !unreadCount}>
            {markingAll ? 'Marking…' : `Mark all read${unreadCount ? ` (${unreadCount})` : ''}`}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Total" value={stats.total} />
        <Stat label="Unread" value={stats.unread} tone={stats.unread ? 'warning' : 'success'} />
        <Stat label="High priority" value={stats.high} tone={stats.high ? 'danger' : 'default'} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-0.5">
              <button
                onClick={() => setTab('all')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  tab === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setTab('unread')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  tab === 'unread' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Unread {unreadCount ? `(${unreadCount})` : ''}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search notifications…"
                className="w-48 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="all">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title={items.length ? 'Nothing here' : 'No notifications yet'}
                description={
                  items.length
                    ? tab === 'unread'
                      ? 'You are all caught up. No unread notifications.'
                      : 'No notifications match your filters.'
                    : 'Alerts about adequacy changes, expiring mechanisms, and review tasks will appear here.'
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-800">
              {filtered.map((n) => {
                const link = entityLink(n)
                return (
                  <li
                    key={n.id}
                    className={`flex items-start gap-3 px-5 py-4 transition ${
                      n.read ? 'bg-transparent' : 'bg-indigo-500/5'
                    }`}
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
                        n.read ? 'bg-slate-700' : 'bg-indigo-400'
                      }`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-sm font-medium ${n.read ? 'text-slate-300' : 'text-white'}`}>
                          {n.title}
                        </span>
                        {n.category && <Badge tone={categoryTone(n.category)}>{n.category}</Badge>}
                        <span className="text-xs text-slate-500">{fmtRelative(n.created_at)}</span>
                      </div>
                      {n.body && <p className="mt-1 text-sm text-slate-400">{n.body}</p>}
                      {link && (
                        <a
                          href={link}
                          onClick={() => markRead(n)}
                          className="mt-1 inline-block text-xs font-medium text-indigo-400 hover:text-indigo-300"
                        >
                          View {n.entity_type} →
                        </a>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      {!n.read && (
                        <Button size="sm" variant="ghost" onClick={() => markRead(n)} disabled={busy === n.id}>
                          {busy === n.id ? <Spinner /> : 'Mark read'}
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
