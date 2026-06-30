'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, coverageTone } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { PageLoader, Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'

interface FlowDetail {
  id: string
  workspace_id?: string
  name: string
  source_region?: string
  destination_country_id?: string
  destination_country?: { id: string; name: string; iso_code?: string; eu_adequacy_status?: string }
  exporting_entity?: string
  recipient_id?: string
  recipient?: { id: string; legal_name: string; role?: string }
  recipient_role?: string
  purpose?: string
  volume_band?: string
  frequency?: string
  coverage_state?: string
  tags?: string[]
  notes?: string
  archived?: boolean
  created_at?: string
  updated_at?: string
  data_categories?: { id: string; name: string; is_special?: boolean }[]
  subject_categories?: { id: string; name: string }[]
  coverage?: CoverageResult | null
  mechanism?: Mechanism | null
  mechanisms?: Mechanism[]
}
interface CoverageResult {
  state?: string
  verdict?: string
  failed_conditions?: string[]
  risk_score?: number
  computed_at?: string
}
interface Mechanism {
  id: string
  flow_id?: string
  mechanism_type?: string
  status?: string
  effective_date?: string
  expiry_date?: string
  legal_basis?: { code?: string; name?: string }
  legal_basis_id?: string
}

const fieldClass =
  'w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'
const labelClass = 'mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500'

function fmtDate(d?: string) {
  if (!d) return '—'
  const t = new Date(d)
  if (Number.isNaN(t.getTime())) return d
  return t.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function FlowDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params?.id as string

  const [flow, setFlow] = useState<FlowDetail | null>(null)
  const [mechanisms, setMechanisms] = useState<Mechanism[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [recomputing, setRecomputing] = useState(false)
  const [savingCats, setSavingCats] = useState(false)
  const [actionMsg, setActionMsg] = useState('')

  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '',
    purpose: '',
    volume_band: '',
    frequency: '',
    notes: '',
    tags: '',
  })
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const f: FlowDetail = await api.getFlow(id)
      setFlow(f)
      const m: any = await api.getMechanisms({ flow_id: id }).catch(() => [])
      setMechanisms(Array.isArray(m) ? m : [])
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load flow')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const coverage: CoverageResult | null = useMemo(() => {
    if (!flow) return null
    return flow.coverage ?? (flow.coverage_state ? { state: flow.coverage_state } : null)
  }, [flow])

  const activeMechanism = useMemo(() => {
    if (mechanisms.length) return mechanisms[0]
    return flow?.mechanism ?? (flow?.mechanisms && flow.mechanisms[0]) ?? null
  }, [mechanisms, flow])

  const handleRecompute = async () => {
    setRecomputing(true)
    setActionMsg('')
    try {
      await api.recomputeCoverage({ flow_id: id })
      await load()
      setActionMsg('Coverage recomputed.')
    } catch (e: any) {
      setActionMsg(e?.message ?? 'Recompute failed')
    } finally {
      setRecomputing(false)
    }
  }

  const removeCategory = async (kind: 'data' | 'subject', removeId: string) => {
    if (!flow) return
    setSavingCats(true)
    setActionMsg('')
    try {
      const data_category_ids = (flow.data_categories ?? [])
        .map((c) => c.id)
        .filter((cid) => !(kind === 'data' && cid === removeId))
      const subject_category_ids = (flow.subject_categories ?? [])
        .map((c) => c.id)
        .filter((cid) => !(kind === 'subject' && cid === removeId))
      await api.setFlowCategories(id, { data_category_ids, subject_category_ids })
      await load()
    } catch (e: any) {
      setActionMsg(e?.message ?? 'Failed to update categories')
    } finally {
      setSavingCats(false)
    }
  }

  const openEdit = () => {
    if (!flow) return
    setEditForm({
      name: flow.name ?? '',
      purpose: flow.purpose ?? '',
      volume_band: flow.volume_band ?? '',
      frequency: flow.frequency ?? '',
      notes: flow.notes ?? '',
      tags: (flow.tags ?? []).join(', '),
    })
    setEditError('')
    setEditOpen(true)
  }

  const saveEdit = async () => {
    setSavingEdit(true)
    setEditError('')
    try {
      await api.updateFlow(id, {
        name: editForm.name.trim(),
        purpose: editForm.purpose.trim() || null,
        volume_band: editForm.volume_band || null,
        frequency: editForm.frequency || null,
        notes: editForm.notes.trim() || null,
        tags: editForm.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      })
      setEditOpen(false)
      await load()
    } catch (e: any) {
      setEditError(e?.message ?? 'Failed to save')
    } finally {
      setSavingEdit(false)
    }
  }

  if (loading) return <PageLoader label="Loading flow…" />

  if (error || !flow) {
    return (
      <div className="mx-auto max-w-3xl">
        <Link href="/dashboard/flows" className="text-xs text-slate-500 hover:text-indigo-300">
          ← Transfer Flows
        </Link>
        <div className="mt-4">
          <EmptyState
            title="Could not load this flow"
            description={error || 'The flow may have been removed.'}
            action={
              <Button onClick={load} variant="secondary">
                Retry
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  const riskScore = coverage?.risk_score
  const riskTone =
    typeof riskScore === 'number'
      ? riskScore >= 60
        ? 'danger'
        : riskScore >= 30
          ? 'warning'
          : 'success'
      : 'default'

  const timeline: { label: string; date?: string }[] = [
    { label: 'Flow created', date: flow.created_at },
    { label: 'Last updated', date: flow.updated_at },
    { label: 'Mechanism effective', date: activeMechanism?.effective_date },
    { label: 'Mechanism expiry', date: activeMechanism?.expiry_date },
    { label: 'Coverage computed', date: coverage?.computed_at },
  ].filter((t) => t.date)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard/flows" className="text-xs text-slate-500 hover:text-indigo-300">
            ← Transfer Flows
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{flow.name}</h1>
            {flow.archived && <Badge tone="neutral">archived</Badge>}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {flow.source_region ?? '—'} →{' '}
            {flow.destination_country?.name ?? 'destination'}
            {flow.recipient?.legal_name ? ` · ${flow.recipient.legal_name}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={openEdit}>
            Edit
          </Button>
          <Button onClick={handleRecompute} disabled={recomputing}>
            {recomputing ? <Spinner /> : 'Recompute coverage'}
          </Button>
        </div>
      </div>

      {actionMsg && (
        <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-2.5 text-sm text-indigo-200">
          {actionMsg}
        </div>
      )}

      {/* Verdict / stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Coverage"
          value={coverage?.state ?? flow.coverage_state ?? 'unknown'}
          tone={
            coverageTone(coverage?.state ?? flow.coverage_state) === 'success'
              ? 'success'
              : coverageTone(coverage?.state ?? flow.coverage_state) === 'danger'
                ? 'danger'
                : coverageTone(coverage?.state ?? flow.coverage_state) === 'warning'
                  ? 'warning'
                  : 'default'
          }
        />
        <Stat
          label="Risk score"
          value={typeof riskScore === 'number' ? riskScore : '—'}
          tone={riskTone as any}
        />
        <Stat label="Volume" value={flow.volume_band ?? '—'} hint={flow.frequency ?? ''} />
        <Stat
          label="Mechanism"
          value={activeMechanism?.mechanism_type ?? 'none'}
          tone={activeMechanism ? 'default' : 'warning'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Verdict detail */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Coverage verdict</h2>
            {coverage?.computed_at && (
              <span className="text-xs text-slate-500">{fmtDate(coverage.computed_at)}</span>
            )}
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={coverageTone(coverage?.state ?? flow.coverage_state)}>
                {coverage?.state ?? flow.coverage_state ?? 'unknown'}
              </Badge>
              {coverage?.verdict && (
                <span className="text-sm text-slate-300">{coverage.verdict}</span>
              )}
            </div>

            {/* Risk score bar */}
            {typeof riskScore === 'number' && (
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                  <span>Risk score</span>
                  <span>{riskScore}/100</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full ${
                      riskScore >= 60
                        ? 'bg-rose-500'
                        : riskScore >= 30
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, riskScore))}%` }}
                  />
                </div>
              </div>
            )}

            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Failed conditions
              </div>
              {coverage?.failed_conditions && coverage.failed_conditions.length > 0 ? (
                <ul className="space-y-1.5">
                  {coverage.failed_conditions.map((c, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-sm text-rose-200"
                    >
                      <span className="mt-0.5 text-rose-400">✕</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-emerald-300">
                  No failing conditions — this flow currently satisfies its mechanism
                  requirements.
                </p>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Flow facts */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-white">Flow facts</h2>
          </CardHeader>
          <CardBody>
            <dl className="space-y-3 text-sm">
              <Fact label="Source region" value={flow.source_region} />
              <Fact
                label="Destination"
                value={
                  flow.destination_country?.name
                    ? `${flow.destination_country.name}${
                        flow.destination_country.iso_code
                          ? ` (${flow.destination_country.iso_code})`
                          : ''
                      }`
                    : undefined
                }
              />
              <Fact label="Adequacy" value={flow.destination_country?.eu_adequacy_status} />
              <Fact label="Exporting entity" value={flow.exporting_entity} />
              <Fact
                label="Recipient"
                value={flow.recipient?.legal_name}
                href={flow.recipient_id ? `/dashboard/recipients/${flow.recipient_id}` : undefined}
              />
              <Fact label="Recipient role" value={flow.recipient_role} />
              <Fact label="Purpose" value={flow.purpose} />
            </dl>
            {flow.tags && flow.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {flow.tags.map((t) => (
                  <Badge key={t} tone="info">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Mechanism */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Transfer mechanism</h2>
          <Link href="/dashboard/mechanisms" className="text-xs text-indigo-300 hover:text-indigo-200">
            Manage mechanisms →
          </Link>
        </CardHeader>
        <CardBody>
          {activeMechanism ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Fact label="Type" value={activeMechanism.mechanism_type} block />
              <Fact label="Status" value={activeMechanism.status} block />
              <Fact
                label="Legal basis"
                value={
                  activeMechanism.legal_basis?.name ?? activeMechanism.legal_basis?.code
                }
                block
              />
              <Fact label="Effective" value={fmtDate(activeMechanism.effective_date)} block />
              <Fact label="Expiry" value={fmtDate(activeMechanism.expiry_date)} block />
            </div>
          ) : (
            <EmptyState
              title="No mechanism attached"
              description="Attach an Article 46 safeguard, adequacy basis, or derogation to cover this transfer."
              action={
                <Link href="/dashboard/mechanisms">
                  <Button variant="secondary">Attach mechanism</Button>
                </Link>
              }
            />
          )}
        </CardBody>
      </Card>

      {/* Categories */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Data categories</h2>
            {savingCats && <Spinner />}
          </CardHeader>
          <CardBody>
            {flow.data_categories && flow.data_categories.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {flow.data_categories.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs text-slate-200"
                  >
                    {c.name}
                    {c.is_special && <Badge tone="danger">special</Badge>}
                    <button
                      onClick={() => removeCategory('data', c.id)}
                      className="ml-1 text-slate-500 hover:text-rose-300"
                      aria-label={`Remove ${c.name}`}
                      disabled={savingCats}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No data categories tagged.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Subject categories</h2>
            {savingCats && <Spinner />}
          </CardHeader>
          <CardBody>
            {flow.subject_categories && flow.subject_categories.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {flow.subject_categories.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs text-slate-200"
                  >
                    {c.name}
                    <button
                      onClick={() => removeCategory('subject', c.id)}
                      className="ml-1 text-slate-500 hover:text-rose-300"
                      aria-label={`Remove ${c.name}`}
                      disabled={savingCats}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No subject categories tagged.</p>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-white">Timeline</h2>
        </CardHeader>
        <CardBody>
          {timeline.length === 0 ? (
            <p className="text-sm text-slate-500">No dated events yet.</p>
          ) : (
            <ol className="relative space-y-4 border-l border-slate-800 pl-5">
              {timeline.map((t, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-indigo-400 bg-slate-950" />
                  <div className="text-sm text-slate-200">{t.label}</div>
                  <div className="text-xs text-slate-500">{fmtDate(t.date)}</div>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      {flow.notes && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-white">Notes</h2>
          </CardHeader>
          <CardBody>
            <p className="whitespace-pre-wrap text-sm text-slate-300">{flow.notes}</p>
          </CardBody>
        </Card>
      )}

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit flow"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? <Spinner /> : 'Save'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {editError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {editError}
            </div>
          )}
          <div>
            <label className={labelClass}>Name</label>
            <input
              className={fieldClass}
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelClass}>Purpose</label>
            <input
              className={fieldClass}
              value={editForm.purpose}
              onChange={(e) => setEditForm((f) => ({ ...f, purpose: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Volume band</label>
              <select
                className={fieldClass}
                value={editForm.volume_band}
                onChange={(e) => setEditForm((f) => ({ ...f, volume_band: e.target.value }))}
              >
                <option value="">—</option>
                {['low', 'medium', 'high', 'very-high'].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Frequency</label>
              <select
                className={fieldClass}
                value={editForm.frequency}
                onChange={(e) => setEditForm((f) => ({ ...f, frequency: e.target.value }))}
              >
                <option value="">—</option>
                {['one-off', 'occasional', 'regular', 'continuous'].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Tags (comma separated)</label>
            <input
              className={fieldClass}
              value={editForm.tags}
              onChange={(e) => setEditForm((f) => ({ ...f, tags: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              className={`${fieldClass} min-h-[80px]`}
              value={editForm.notes}
              onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

function Fact({
  label,
  value,
  href,
  block,
}: {
  label: string
  value?: string | null
  href?: string
  block?: boolean
}) {
  const content = value && value !== '—' ? value : '—'
  if (block) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
        <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
        <div className="mt-0.5 text-sm text-slate-200">
          {href && value ? (
            <Link href={href} className="text-indigo-300 hover:text-indigo-200">
              {content}
            </Link>
          ) : (
            content
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-right text-sm text-slate-200">
        {href && value ? (
          <Link href={href} className="text-indigo-300 hover:text-indigo-200">
            {content}
          </Link>
        ) : (
          content
        )}
      </dd>
    </div>
  )
}
