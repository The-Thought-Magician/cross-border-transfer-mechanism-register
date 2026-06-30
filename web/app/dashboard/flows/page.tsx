'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge, coverageTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/button'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'

interface Flow {
  id: string
  name: string
  source_region?: string | null
  destination_country_id?: string | null
  destination_country_name?: string | null
  destination_country?: { name?: string; iso_code?: string } | null
  exporting_entity?: string | null
  recipient_id?: string | null
  recipient_name?: string | null
  recipient_role?: string | null
  purpose?: string | null
  volume_band?: string | null
  frequency?: string | null
  coverage_state?: string | null
  tags?: string[] | null
  archived?: boolean | null
  created_at?: string | null
}

function destName(f: Flow) {
  return f.destination_country_name || f.destination_country?.name || f.destination_country?.iso_code || '—'
}

function labelize(s?: string | null) {
  if (!s) return '—'
  return s
    .split(/[-_\s]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export default function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [coverageFilter, setCoverageFilter] = useState('all')
  const [regionFilter, setRegionFilter] = useState('all')
  const [showArchived, setShowArchived] = useState(false)

  const [deleting, setDeleting] = useState<Flow | null>(null)
  const [busy, setBusy] = useState(false)

  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importMsg, setImportMsg] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    api
      .getFlows()
      .then((res) => {
        setFlows(Array.isArray(res) ? res : [])
        setError(null)
      })
      .catch((err) => setError(err?.message || 'Failed to load flows'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const regions = useMemo(() => {
    const set = new Set<string>()
    flows.forEach((f) => f.source_region && set.add(f.source_region))
    return Array.from(set).sort()
  }, [flows])

  const coverageStates = useMemo(() => {
    const set = new Set<string>()
    flows.forEach((f) => f.coverage_state && set.add(f.coverage_state))
    return Array.from(set).sort()
  }, [flows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return flows.filter((f) => {
      if (!showArchived && f.archived) return false
      if (coverageFilter !== 'all' && (f.coverage_state || 'unknown') !== coverageFilter) return false
      if (regionFilter !== 'all' && f.source_region !== regionFilter) return false
      if (q) {
        const hay = `${f.name} ${f.exporting_entity ?? ''} ${f.recipient_name ?? ''} ${destName(f)} ${f.purpose ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [flows, search, coverageFilter, regionFilter, showArchived])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    flows.forEach((f) => {
      if (f.archived) return
      const k = f.coverage_state || 'unknown'
      c[k] = (c[k] || 0) + 1
    })
    return c
  }, [flows])

  const confirmDelete = async () => {
    if (!deleting) return
    setBusy(true)
    setActionError(null)
    try {
      await api.deleteFlow(deleting.id)
      setDeleting(null)
      load()
    } catch (err: any) {
      setActionError(err?.message || 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  const runImport = async () => {
    setBusy(true)
    setImportMsg(null)
    setActionError(null)
    try {
      let payload: any
      const trimmed = importText.trim()
      if (!trimmed) {
        setImportMsg('Provide JSON or CSV rows to import.')
        setBusy(false)
        return
      }
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        const parsed = JSON.parse(trimmed)
        payload = { flows: Array.isArray(parsed) ? parsed : parsed.flows ?? [parsed] }
      } else {
        // Treat as CSV: header row + data rows.
        const lines = trimmed.split(/\r?\n/).filter((l) => l.trim())
        const headers = lines[0].split(',').map((h) => h.trim())
        const rows = lines.slice(1).map((line) => {
          const cells = line.split(',').map((c) => c.trim())
          const obj: Record<string, string> = {}
          headers.forEach((h, i) => (obj[h] = cells[i] ?? ''))
          return obj
        })
        payload = { csv: trimmed, flows: rows }
      }
      const res: any = await api.importFlows(payload)
      const n = res?.imported ?? (Array.isArray(res) ? res.length : 0)
      setImportMsg(`Imported ${n} flow${n === 1 ? '' : 's'}.`)
      setImportText('')
      load()
    } catch (err: any) {
      setImportMsg(err?.message || 'Import failed. Check the format.')
    } finally {
      setBusy(false)
    }
  }

  if (loading && flows.length === 0) return <PageLoader label="Loading flow register..." />

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Transfer Flows</h1>
          <p className="mt-1 text-sm text-slate-400">
            Every cross-border data flow in the register, with its current coverage verdict.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            Import
          </Button>
          <Link href="/dashboard/flows/new">
            <Button>New flow</Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(counts).map(([state, n]) => (
          <button
            key={state}
            onClick={() => setCoverageFilter(coverageFilter === state ? 'all' : state)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              coverageFilter === state ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-700 hover:border-slate-600'
            }`}
          >
            <Badge tone={coverageTone(state)}>{labelize(state)}</Badge>
            <span className="ml-1.5 text-slate-400">{n}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search flows, entities, recipients..."
          className="min-w-[16rem] flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
        />
        <select
          value={coverageFilter}
          onChange={(e) => setCoverageFilter(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          <option value="all">All coverage</option>
          {coverageStates.map((s) => (
            <option key={s} value={s}>
              {labelize(s)}
            </option>
          ))}
        </select>
        <select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          <option value="all">All source regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-400">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-4 w-4 rounded border-slate-700 bg-slate-900 accent-indigo-600"
          />
          Show archived
        </label>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            Register
            <span className="ml-2 text-xs font-normal text-slate-500">{filtered.length} shown</span>
          </h2>
        </CardHeader>
        <CardBody className="px-0 py-0">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={flows.length === 0 ? 'No flows yet' : 'No flows match your filters'}
                description={
                  flows.length === 0
                    ? 'Create your first transfer flow or import a batch to begin the register.'
                    : 'Try clearing the search or filters.'
                }
                action={
                  flows.length === 0 ? (
                    <Link href="/dashboard/flows/new">
                      <Button>New flow</Button>
                    </Link>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Flow</TH>
                  <TH>Source → Destination</TH>
                  <TH>Recipient</TH>
                  <TH>Volume</TH>
                  <TH>Coverage</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((f) => (
                  <TR key={f.id}>
                    <TD>
                      <Link href={`/dashboard/flows/${f.id}`} className="font-medium text-white hover:text-indigo-300">
                        {f.name}
                      </Link>
                      {f.archived && (
                        <Badge tone="neutral" className="ml-2">
                          Archived
                        </Badge>
                      )}
                      {f.purpose && <div className="mt-0.5 text-xs text-slate-500">{f.purpose}</div>}
                      {f.tags && f.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {f.tags.map((t) => (
                            <span key={t} className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-400">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </TD>
                    <TD>
                      <div className="text-xs">
                        <span className="text-slate-400">{f.source_region || '—'}</span>
                        <span className="mx-1 text-slate-600">→</span>
                        <span className="text-white">{destName(f)}</span>
                      </div>
                      {f.exporting_entity && (
                        <div className="mt-0.5 text-[11px] text-slate-500">{f.exporting_entity}</div>
                      )}
                    </TD>
                    <TD>
                      <div className="text-slate-300">{f.recipient_name || '—'}</div>
                      {f.recipient_role && <div className="text-[11px] text-slate-500">{labelize(f.recipient_role)}</div>}
                    </TD>
                    <TD>
                      <div>{labelize(f.volume_band)}</div>
                      <div className="text-[11px] text-slate-500">{labelize(f.frequency)}</div>
                    </TD>
                    <TD>
                      <Badge tone={coverageTone(f.coverage_state ?? '')}>{labelize(f.coverage_state) || 'Unknown'}</Badge>
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/dashboard/flows/${f.id}`}>
                          <Button size="sm" variant="ghost">
                            View
                          </Button>
                        </Link>
                        <Button size="sm" variant="ghost" onClick={() => setDeleting(f)}>
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

      <Modal
        open={!!deleting}
        onClose={() => !busy && setDeleting(null)}
        title="Delete flow"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleting(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={busy}>
              {busy ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-300">
          Delete or archive <span className="font-medium text-white">{deleting?.name}</span>? This removes it from the
          active register and its coverage results.
        </p>
        {actionError && <p className="mt-3 text-sm text-rose-300">{actionError}</p>}
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => !busy && setImportOpen(false)}
        title="Bulk import flows"
        className="max-w-2xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setImportOpen(false)} disabled={busy}>
              Close
            </Button>
            <Button onClick={runImport} disabled={busy}>
              {busy ? 'Importing...' : 'Import'}
            </Button>
          </div>
        }
      >
        <p className="mb-2 text-sm text-slate-400">
          Paste a JSON array of flow objects, or CSV with a header row (e.g. <code className="text-slate-300">name,source_region,exporting_entity,purpose,volume_band,frequency</code>).
        </p>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={10}
          placeholder={'[{"name":"EU → US payroll","source_region":"EEA","purpose":"Payroll processing"}]'}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
        />
        {importMsg && <p className="mt-3 text-sm text-indigo-200">{importMsg}</p>}
      </Modal>
    </div>
  )
}
