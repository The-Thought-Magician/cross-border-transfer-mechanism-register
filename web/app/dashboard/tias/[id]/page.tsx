'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Stat } from '@/components/ui/Stat'
import { Badge, coverageTone } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader, Spinner } from '@/components/ui/Spinner'

interface TiaStep {
  id?: string
  step_number: number
  step_key?: string
  question?: string
  answer?: string | null
  risk_points?: number | null
}

interface Measure {
  id: string
  name?: string
  measure_type?: string
  effectiveness?: string | null
  description?: string | null
}

interface Tia {
  id: string
  flow_id?: string
  recipient_id?: string
  country_id?: string
  title?: string
  status?: string
  outcome?: string | null
  risk_score?: number | null
  reviewer_user_id?: string | null
  approved_by?: string | null
  approved_at?: string | null
  review_due_date?: string | null
  summary?: string | null
  steps?: TiaStep[]
  measures?: Measure[] | string[]
  measure_ids?: string[]
}

const EDPB_STEPS: { key: string; title: string; question: string }[] = [
  {
    key: 'map_transfer',
    title: 'Step 1 — Map the transfer',
    question: 'Describe the transfer: data categories, subjects, purpose, recipients and any onward transfers.',
  },
  {
    key: 'identify_tool',
    title: 'Step 2 — Identify the transfer tool',
    question: 'Which Chapter V transfer mechanism is relied on (adequacy, SCCs, BCRs, derogation)?',
  },
  {
    key: 'assess_law',
    title: 'Step 3 — Assess the third-country law & practice',
    question: 'Does the destination law or practice (e.g. surveillance powers) impinge on the chosen tool?',
  },
  {
    key: 'supplementary_measures',
    title: 'Step 4 — Identify supplementary measures',
    question: 'What technical, contractual or organisational measures bring protection to the EU standard?',
  },
  {
    key: 'procedural_steps',
    title: 'Step 5 — Procedural steps',
    question: 'What formal steps are needed to adopt the measures (e.g. amend SCCs, notify DPA)?',
  },
  {
    key: 're_evaluate',
    title: 'Step 6 — Re-evaluate at intervals',
    question: 'How and when will this assessment be monitored and re-evaluated for legal developments?',
  },
]

function fmtDate(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function riskTone(score?: number | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (score === null || score === undefined) return 'neutral'
  if (score >= 60) return 'danger'
  if (score >= 30) return 'warning'
  return 'success'
}

export default function TiaDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id || '')

  const [tia, setTia] = useState<Tia | null>(null)
  const [measures, setMeasures] = useState<Measure[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [stepAnswers, setStepAnswers] = useState<Record<number, { answer: string; risk_points: number }>>({})
  const [selectedMeasures, setSelectedMeasures] = useState<Set<string>>(new Set())

  const [savingSteps, setSavingSteps] = useState(false)
  const [savingMeasures, setSavingMeasures] = useState(false)
  const [savingMeta, setSavingMeta] = useState(false)
  const [deciding, setDeciding] = useState<'approve' | 'reject' | null>(null)

  const [meta, setMeta] = useState({ title: '', status: 'draft', review_due_date: '', summary: '' })

  function hydrate(t: Tia, ms: Measure[]) {
    const stepsByNumber = new Map<number, TiaStep>()
    for (const s of t.steps || []) stepsByNumber.set(s.step_number, s)
    const answers: Record<number, { answer: string; risk_points: number }> = {}
    EDPB_STEPS.forEach((_, i) => {
      const n = i + 1
      const existing = stepsByNumber.get(n)
      answers[n] = {
        answer: existing?.answer || '',
        risk_points: existing?.risk_points ?? 0,
      }
    })
    setStepAnswers(answers)

    const selected = new Set<string>()
    const rawMeasures = t.measures || []
    if (Array.isArray(rawMeasures)) {
      for (const m of rawMeasures) {
        if (typeof m === 'string') selected.add(m)
        else if (m && typeof m === 'object' && 'id' in m) selected.add((m as Measure).id)
      }
    }
    for (const mid of t.measure_ids || []) selected.add(mid)
    setSelectedMeasures(selected)

    setMeta({
      title: t.title || '',
      status: t.status || 'draft',
      review_due_date: t.review_due_date ? t.review_due_date.slice(0, 10) : '',
      summary: t.summary || '',
    })
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [tiaRes, measuresRes] = await Promise.all([
        api.getTia(id),
        api.getMeasures().catch(() => []),
      ])
      const t: Tia = tiaRes
      const ms: Measure[] = Array.isArray(measuresRes) ? measuresRes : measuresRes?.items ?? []
      setTia(t)
      setMeasures(ms)
      hydrate(t, ms)
    } catch (e: any) {
      setError(e?.message || 'Failed to load TIA')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const projectedRisk = useMemo(
    () => Object.values(stepAnswers).reduce((sum, s) => sum + (Number(s.risk_points) || 0), 0),
    [stepAnswers],
  )

  const answeredCount = useMemo(
    () => Object.values(stepAnswers).filter((s) => s.answer.trim()).length,
    [stepAnswers],
  )

  async function saveSteps() {
    setSavingSteps(true)
    setError(null)
    setNotice(null)
    try {
      const steps = EDPB_STEPS.map((s, i) => ({
        step_number: i + 1,
        step_key: s.key,
        question: s.question,
        answer: stepAnswers[i + 1]?.answer || '',
        risk_points: Number(stepAnswers[i + 1]?.risk_points) || 0,
      }))
      const updated = await api.updateTiaSteps(id, { steps })
      setNotice('Step answers saved and risk recomputed.')
      if (updated && updated.id) {
        setTia(updated)
        hydrate(updated, measures)
      } else {
        await load()
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to save steps')
    } finally {
      setSavingSteps(false)
    }
  }

  function toggleMeasure(mid: string) {
    setSelectedMeasures((prev) => {
      const next = new Set(prev)
      if (next.has(mid)) next.delete(mid)
      else next.add(mid)
      return next
    })
  }

  async function saveMeasures() {
    setSavingMeasures(true)
    setError(null)
    setNotice(null)
    try {
      const updated = await api.setTiaMeasures(id, { measure_ids: Array.from(selectedMeasures) })
      setNotice('Supplementary measures updated.')
      if (updated && updated.id) {
        setTia(updated)
        hydrate(updated, measures)
      } else {
        await load()
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to save measures')
    } finally {
      setSavingMeasures(false)
    }
  }

  async function saveMeta() {
    setSavingMeta(true)
    setError(null)
    setNotice(null)
    try {
      await api.updateTia(id, {
        title: meta.title,
        status: meta.status,
        review_due_date: meta.review_due_date || null,
        summary: meta.summary || null,
      })
      setNotice('Assessment details saved.')
      await load()
    } catch (e: any) {
      setError(e?.message || 'Failed to save details')
    } finally {
      setSavingMeta(false)
    }
  }

  async function decide(decision: 'approve' | 'reject') {
    setDeciding(decision)
    setError(null)
    setNotice(null)
    try {
      await api.approveTia(id, { decision, approved: decision === 'approve' })
      setNotice(decision === 'approve' ? 'TIA approved and signed off.' : 'TIA rejected.')
      await load()
    } catch (e: any) {
      setError(e?.message || 'Sign-off failed')
    } finally {
      setDeciding(null)
    }
  }

  if (loading) return <PageLoader label="Loading assessment..." />

  if (error && !tia) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/tias" className="text-sm text-yellow-200 hover:text-yellow-300">
          ← Back to TIAs
        </Link>
        <EmptyState title="Could not load TIA" description={error} action={<Button onClick={load}>Retry</Button>} />
      </div>
    )
  }

  if (!tia) return null

  const isApproved = (tia.status || '').toLowerCase() === 'approved'
  const measureName = (mid: string) => measures.find((m) => m.id === mid)?.name || mid

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/tias" className="text-sm text-yellow-200 hover:text-yellow-300">
          ← Back to TIAs
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-white">{tia.title || 'Transfer Impact Assessment'}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={coverageTone(tia.status)}>{tia.status || 'draft'}</Badge>
              {tia.outcome && <Badge tone={coverageTone(tia.outcome)}>{tia.outcome}</Badge>}
              <Badge tone={riskTone(tia.risk_score)}>
                Risk {tia.risk_score ?? '—'}
              </Badge>
              {tia.approved_at && (
                <span className="text-xs text-slate-500">Signed off {fmtDate(tia.approved_at)}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Current Risk Score" value={tia.risk_score ?? '—'} tone={riskTone(tia.risk_score) === 'neutral' ? 'default' : (riskTone(tia.risk_score) as any)} />
        <Stat label="Outcome" value={tia.outcome || 'pending'} />
        <Stat label="Steps Answered" value={`${answeredCount} / 6`} />
        <Stat label="Review Due" value={fmtDate(tia.review_due_date)} />
      </div>

      {/* Risk meter */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white">Risk meter</span>
          <span className="text-xs text-slate-500">Projected from edited steps: {projectedRisk}</span>
        </CardHeader>
        <CardBody>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={
                projectedRisk >= 60 ? 'h-full bg-rose-500' : projectedRisk >= 30 ? 'h-full bg-amber-500' : 'h-full bg-emerald-500'
              }
              style={{ width: `${Math.min(100, projectedRisk)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-slate-500">
            <span>0 — Adequate</span>
            <span>30 — With measures</span>
            <span>60+ — Inadequate</span>
          </div>
        </CardBody>
      </Card>

      {/* Six-step workflow */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white">EDPB Six-Step Assessment</span>
          <Button size="sm" onClick={saveSteps} disabled={savingSteps || isApproved}>
            {savingSteps ? <Spinner /> : 'Save steps & recompute risk'}
          </Button>
        </CardHeader>
        <CardBody className="space-y-5">
          {isApproved && (
            <p className="text-xs text-amber-300">This TIA is approved. Reopen via status to edit steps.</p>
          )}
          {EDPB_STEPS.map((s, i) => {
            const n = i + 1
            const val = stepAnswers[n] || { answer: '', risk_points: 0 }
            return (
              <div key={s.key} className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">{s.title}</h3>
                    <p className="mt-0.5 text-xs text-slate-500">{s.question}</p>
                  </div>
                  <Badge tone={riskTone(val.risk_points)}>{val.risk_points} pts</Badge>
                </div>
                <textarea
                  value={val.answer}
                  disabled={isApproved}
                  onChange={(e) =>
                    setStepAnswers((prev) => ({ ...prev, [n]: { ...prev[n], answer: e.target.value } }))
                  }
                  rows={3}
                  placeholder="Document your assessment for this step…"
                  className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-yellow-400 focus:outline-none disabled:opacity-60"
                />
                <div className="mt-3 flex items-center gap-3">
                  <label className="text-xs font-medium text-slate-400">Risk points</label>
                  <input
                    type="range"
                    min={0}
                    max={25}
                    value={val.risk_points}
                    disabled={isApproved}
                    onChange={(e) =>
                      setStepAnswers((prev) => ({
                        ...prev,
                        [n]: { ...prev[n], risk_points: Number(e.target.value) },
                      }))
                    }
                    className="flex-1 accent-yellow-400"
                  />
                  <input
                    type="number"
                    min={0}
                    max={25}
                    value={val.risk_points}
                    disabled={isApproved}
                    onChange={(e) =>
                      setStepAnswers((prev) => ({
                        ...prev,
                        [n]: { ...prev[n], risk_points: Number(e.target.value) || 0 },
                      }))
                    }
                    className="w-16 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none disabled:opacity-60"
                  />
                </div>
              </div>
            )
          })}
        </CardBody>
      </Card>

      {/* Supplementary measures */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white">Supplementary Measures</span>
          <Button size="sm" variant="secondary" onClick={saveMeasures} disabled={savingMeasures || isApproved}>
            {savingMeasures ? <Spinner /> : 'Save measures'}
          </Button>
        </CardHeader>
        <CardBody>
          {measures.length === 0 ? (
            <EmptyState
              title="No measures in catalog"
              description="Add supplementary measures from the Supplementary Measures reference page first."
            />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {measures.map((m) => {
                const checked = selectedMeasures.has(m.id)
                return (
                  <label
                    key={m.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                      checked ? 'border-yellow-400/50 bg-yellow-500/10' : 'border-slate-800 bg-slate-900/40 hover:bg-slate-800/40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isApproved}
                      onChange={() => toggleMeasure(m.id)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-100">{m.name || m.id}</span>
                        {m.measure_type && <Badge tone="info">{m.measure_type}</Badge>}
                        {m.effectiveness && <Badge tone={coverageTone(m.effectiveness)}>{m.effectiveness}</Badge>}
                      </div>
                      {m.description && <p className="mt-1 text-xs text-slate-500">{m.description}</p>}
                    </div>
                  </label>
                )
              })}
            </div>
          )}
          {selectedMeasures.size > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Array.from(selectedMeasures).map((mid) => (
                <Badge key={mid} tone="info">
                  {measureName(mid)}
                </Badge>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Assessment details */}
        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-white">Assessment Details</span>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Title</label>
              <input
                value={meta.title}
                onChange={(e) => setMeta({ ...meta, title: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Status</label>
                <select
                  value={meta.status}
                  onChange={(e) => setMeta({ ...meta, status: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
                >
                  {['draft', 'in-progress', 'in-review', 'approved', 'rejected'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Review due</label>
                <input
                  type="date"
                  value={meta.review_due_date}
                  onChange={(e) => setMeta({ ...meta, review_due_date: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Summary</label>
              <textarea
                value={meta.summary}
                onChange={(e) => setMeta({ ...meta, summary: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-yellow-400 focus:outline-none"
              />
            </div>
            <Button onClick={saveMeta} disabled={savingMeta}>
              {savingMeta ? <Spinner /> : 'Save details'}
            </Button>
          </CardBody>
        </Card>

        {/* Sign-off */}
        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-white">Sign-off</span>
          </CardHeader>
          <CardBody className="space-y-4">
            <p className="text-sm text-slate-400">
              Approving records the reviewer decision and locks the assessment. Rejecting sends it back for revision.
            </p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Outcome</dt>
                <dd className="text-slate-200">{tia.outcome || 'pending'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Risk score</dt>
                <dd className="text-slate-200">{tia.risk_score ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Approved by</dt>
                <dd className="text-slate-200">{tia.approved_by || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Approved at</dt>
                <dd className="text-slate-200">{fmtDate(tia.approved_at)}</dd>
              </div>
            </dl>
            <div className="flex gap-2">
              <Button onClick={() => decide('approve')} disabled={deciding !== null || isApproved}>
                {deciding === 'approve' ? <Spinner /> : 'Approve & sign off'}
              </Button>
              <Button variant="danger" onClick={() => decide('reject')} disabled={deciding !== null}>
                {deciding === 'reject' ? <Spinner /> : 'Reject'}
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
