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
import { PageLoader, Spinner } from '@/components/ui/Spinner'

type SavedReport = {
  id: string
  workspace_id?: string
  name: string
  report_type?: string | null
  config?: Record<string, any> | null
  snapshot?: Record<string, any> | null
  created_by?: string | null
  created_at?: string
  [k: string]: any
}

const REPORT_TYPES = [
  { value: 'coverage', label: 'Coverage scorecard', desc: 'Org-wide validity verdicts and KPIs at the moment of capture.' },
  { value: 'gaps', label: 'Gap register', desc: 'Open Chapter V gaps ranked by sensitivity and volume.' },
  { value: 'tia', label: 'TIA status', desc: 'Transfer Impact Assessment outcomes and outstanding reviews.' },
  { value: 'scc', label: 'SCC tracker', desc: 'Signature status and repaper exposure across agreements.' },
  { value: 'adequacy', label: 'Adequacy exposure', desc: 'Flows grouped by destination adequacy status.' },
  { value: 'full', label: 'Full register', desc: 'Complete flows + mechanisms + TIAs + gaps snapshot.' },
]

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

function reportTypeLabel(t?: string | null) {
  const found = REPORT_TYPES.find((r) => r.value === t)
  return found ? found.label : t ?? 'Report'
}

function reportTone(t?: string | null): 'success' | 'warning' | 'danger' | 'info' | 'review' | 'neutral' {
  switch (t) {
    case 'coverage':
      return 'success'
    case 'gaps':
      return 'danger'
    case 'tia':
      return 'review'
    case 'scc':
      return 'warning'
    case 'adequacy':
      return 'info'
    default:
      return 'neutral'
  }
}

function countSnapshot(snap?: Record<string, any> | null): number {
  if (!snap) return 0
  let n = 0
  for (const v of Object.values(snap)) {
    if (Array.isArray(v)) n += v.length
    else if (v && typeof v === 'object') n += Object.keys(v).length
  }
  return n
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function ReportsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [reports, setReports] = useState<SavedReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')

  // create modal
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', report_type: 'coverage' })

  // view modal
  const [viewing, setViewing] = useState<SavedReport | null>(null)
  const [viewLoading, setViewLoading] = useState(false)

  // export
  const [exporting, setExporting] = useState(false)
  const [exportPreview, setExportPreview] = useState<any>(null)
  const [exportOpen, setExportOpen] = useState(false)

  async function load(wsId?: string | null) {
    setError(null)
    try {
      const ws = wsId ?? workspaceId
      const res: any = await api.getReports(ws ? { workspace_id: ws } : undefined)
      const list = Array.isArray(res) ? res : (res?.reports ?? res?.items ?? [])
      setReports(list)
    } catch (e: any) {
      setError(e?.message || 'Failed to load reports')
      setReports([])
    }
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      try {
        const ws: any[] = await api.getMyWorkspaces().catch(() => [])
        const wsId = Array.isArray(ws) && ws.length ? ws[0].id : null
        if (!mounted) return
        setWorkspaceId(wsId)
        await load(wsId)
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to load')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return reports
      .filter((r) => {
        if (typeFilter !== 'all' && r.report_type !== typeFilter) return false
        if (q && !`${r.name} ${r.report_type ?? ''}`.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
  }, [reports, typeFilter, search])

  const stats = useMemo(() => {
    const types = new Set(reports.map((r) => r.report_type).filter(Boolean)).size
    const latest = reports.reduce<string | null>((acc, r) => {
      if (!r.created_at) return acc
      if (!acc || new Date(r.created_at) > new Date(acc)) return r.created_at
      return acc
    }, null)
    return { total: reports.length, types, latest }
  }, [reports])

  function openCreate() {
    setForm({ name: '', report_type: 'coverage' })
    setFormError(null)
    setCreateOpen(true)
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setFormError('Report name is required')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await api.createReport({
        workspace_id: workspaceId,
        name: form.name.trim(),
        report_type: form.report_type,
        config: {},
      })
      setCreateOpen(false)
      await load()
    } catch (err: any) {
      setFormError(err?.message || 'Failed to generate report')
    } finally {
      setSaving(false)
    }
  }

  async function openView(r: SavedReport) {
    setViewing(r)
    // If the list row lacks the full snapshot, fetch the detail.
    if (!r.snapshot) {
      setViewLoading(true)
      try {
        const full: any = await api.getReport(r.id)
        setViewing(full?.report ?? full ?? r)
      } catch {
        // keep the row-level data
      } finally {
        setViewLoading(false)
      }
    }
  }

  async function handleExport(preview: boolean) {
    setExporting(true)
    setError(null)
    try {
      const pack: any = await api.exportAuditPack(workspaceId ? { workspace_id: workspaceId } : undefined)
      if (preview) {
        setExportPreview(pack)
        setExportOpen(true)
      } else {
        const stamp = new Date().toISOString().slice(0, 10)
        downloadJson(`audit-pack-${stamp}.json`, pack)
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to export audit pack')
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <PageLoader label="Loading reports…" />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Reports &amp; Export</h1>
          <p className="mt-1 text-sm text-slate-400">
            Capture point-in-time compliance snapshots and export a full Chapter V audit pack for regulators or auditors.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => handleExport(true)} disabled={exporting}>
            {exporting ? 'Preparing…' : 'Preview audit pack'}
          </Button>
          <Button onClick={openCreate}>Generate report</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Saved reports" value={stats.total} />
        <Stat label="Report types" value={stats.types} />
        <Stat label="Latest snapshot" value={stats.latest ? fmtDateTime(stats.latest) : '—'} />
      </div>

      {/* Audit pack export card */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-white">Audit pack export</h2>
          <p className="text-xs text-slate-500">
            Bundles every transfer flow, mechanism, TIA, and open gap into a single evidence file.
          </p>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-400">
              Export the complete register as JSON. Preview it first, or download directly for your records.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => handleExport(true)} disabled={exporting}>
                {exporting ? <Spinner /> : 'Preview'}
              </Button>
              <Button onClick={() => handleExport(false)} disabled={exporting}>
                {exporting ? 'Working…' : 'Download JSON'}
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Saved reports */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Saved reports</h2>
              <p className="text-xs text-slate-500">
                Showing {filtered.length} of {reports.length}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reports…"
                className="w-44 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-yellow-400 focus:outline-none"
              />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
              >
                <option value="all">All types</option>
                {REPORT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
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
                title={reports.length ? 'No reports match your filters' : 'No saved reports yet'}
                description={
                  reports.length
                    ? 'Adjust the type or search filters.'
                    : 'Generate a snapshot report to freeze your compliance posture at a point in time.'
                }
                action={
                  reports.length ? undefined : (
                    <Button onClick={openCreate}>Generate report</Button>
                  )
                }
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Type</TH>
                  <TH>Records</TH>
                  <TH>Generated</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <div className="font-medium text-slate-100">{r.name}</div>
                    </TD>
                    <TD>
                      <Badge tone={reportTone(r.report_type)}>{reportTypeLabel(r.report_type)}</Badge>
                    </TD>
                    <TD className="text-slate-400">{countSnapshot(r.snapshot) || '—'}</TD>
                    <TD className="whitespace-nowrap text-slate-400">{fmtDateTime(r.created_at)}</TD>
                    <TD className="text-right">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openView(r)}>
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            downloadJson(`${r.name.replace(/\s+/g, '-').toLowerCase()}.json`, r.snapshot ?? r)
                          }
                        >
                          Download
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

      {/* Create report modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Generate report snapshot"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={saving}>
              {saving ? <Spinner /> : 'Generate'}
            </Button>
          </div>
        }
      >
        <form onSubmit={submitCreate} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {formError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Report name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
              placeholder="e.g. Q2 2026 board coverage review"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Report type</label>
            <div className="space-y-2">
              {REPORT_TYPES.map((t) => (
                <label
                  key={t.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                    form.report_type === t.value
                      ? 'border-yellow-400 bg-yellow-500/10'
                      : 'border-slate-700 bg-slate-900 hover:border-slate-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="report_type"
                    value={t.value}
                    checked={form.report_type === t.value}
                    onChange={(e) => setForm({ ...form, report_type: e.target.value })}
                    className="mt-1 accent-yellow-400"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-200">{t.label}</div>
                    <div className="text-xs text-slate-500">{t.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </form>
      </Modal>

      {/* View report modal */}
      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.name ?? 'Report'}
        footer={
          viewing ? (
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setViewing(null)}>
                Close
              </Button>
              <Button
                onClick={() =>
                  viewing &&
                  downloadJson(`${viewing.name.replace(/\s+/g, '-').toLowerCase()}.json`, viewing.snapshot ?? viewing)
                }
              >
                Download JSON
              </Button>
            </div>
          ) : undefined
        }
      >
        {viewing && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={reportTone(viewing.report_type)}>{reportTypeLabel(viewing.report_type)}</Badge>
              <span className="text-xs text-slate-500">{fmtDateTime(viewing.created_at)}</span>
            </div>
            {viewLoading ? (
              <div className="flex items-center gap-2 text-slate-400">
                <Spinner /> Loading snapshot…
              </div>
            ) : (
              <div>
                <div className="mb-1 text-xs font-medium text-slate-500">Snapshot</div>
                <pre className="max-h-80 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
                  {JSON.stringify(viewing.snapshot ?? viewing.config ?? {}, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Audit pack preview modal */}
      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Audit pack preview"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setExportOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                const stamp = new Date().toISOString().slice(0, 10)
                downloadJson(`audit-pack-${stamp}.json`, exportPreview)
              }}
            >
              Download JSON
            </Button>
          </div>
        }
      >
        {exportPreview && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Object.entries(exportPreview)
                .filter(([, v]) => Array.isArray(v))
                .map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                    <div className="text-lg font-semibold text-white">{(v as any[]).length}</div>
                    <div className="text-xs text-slate-500">{k}</div>
                  </div>
                ))}
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-slate-500">Full bundle</div>
              <pre className="max-h-80 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
                {JSON.stringify(exportPreview, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
