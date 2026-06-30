'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { PageLoader, Spinner } from '@/components/ui/Spinner'

interface Country {
  id: string
  iso_code?: string
  name: string
  region?: string
  eu_adequacy_status?: string
  surveillance_risk?: string
}
interface Recipient {
  id: string
  legal_name: string
  role?: string
  country_id?: string
  dpf_certified?: boolean
}
interface Category {
  id: string
  name: string
  is_special?: boolean
  sensitivity_weight?: number
  risk_weight?: number
  article?: string
}

const SOURCE_REGIONS = ['EEA', 'UK', 'EEA+UK', 'Switzerland', 'Other']
const VOLUME_BANDS = ['low', 'medium', 'high', 'very-high']
const FREQUENCIES = ['one-off', 'occasional', 'regular', 'continuous']
const RECIPIENT_ROLES = ['controller', 'processor', 'joint-controller', 'sub-processor']

const fieldClass =
  'w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'
const labelClass = 'mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500'

export default function NewFlowPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const [workspaceId, setWorkspaceId] = useState<string>('')
  const [countries, setCountries] = useState<Country[]>([])
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [dataCategories, setDataCategories] = useState<Category[]>([])
  const [subjectCategories, setSubjectCategories] = useState<Category[]>([])

  const [form, setForm] = useState({
    name: '',
    source_region: 'EEA',
    destination_country_id: '',
    exporting_entity: '',
    recipient_id: '',
    recipient_role: 'processor',
    purpose: '',
    volume_band: 'medium',
    frequency: 'regular',
    tags: '',
    notes: '',
  })
  const [selectedData, setSelectedData] = useState<Set<string>>(new Set())
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set())

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const ws: any[] = await api.getMyWorkspaces().catch(() => [])
        const wid = Array.isArray(ws) && ws[0]?.id ? ws[0].id : ''
        const params = wid ? { workspace_id: wid } : undefined
        const [c, r, dc, sc] = await Promise.all([
          api.getCountries().catch(() => []),
          api.getRecipients(params).catch(() => []),
          api.getDataCategories(params).catch(() => []),
          api.getSubjectCategories(params).catch(() => []),
        ])
        if (!mounted) return
        setWorkspaceId(wid)
        setCountries(Array.isArray(c) ? c : [])
        setRecipients(Array.isArray(r) ? r : [])
        setDataCategories(Array.isArray(dc) ? dc : [])
        setSubjectCategories(Array.isArray(sc) ? sc : [])
      } catch (e: any) {
        if (mounted) setLoadError(e?.message ?? 'Failed to load reference data')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const toggle = (setFn: typeof setSelectedData, id: string) => {
    setFn((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const destCountry = useMemo(
    () => countries.find((c) => c.id === form.destination_country_id),
    [countries, form.destination_country_id],
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')
    if (!form.name.trim()) {
      setSubmitError('Flow name is required')
      return
    }
    if (!form.destination_country_id) {
      setSubmitError('Select a destination country')
      return
    }
    setSubmitting(true)
    try {
      const payload: any = {
        name: form.name.trim(),
        source_region: form.source_region,
        destination_country_id: form.destination_country_id,
        exporting_entity: form.exporting_entity.trim() || null,
        recipient_id: form.recipient_id || null,
        recipient_role: form.recipient_role,
        purpose: form.purpose.trim() || null,
        volume_band: form.volume_band,
        frequency: form.frequency,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        notes: form.notes.trim() || null,
      }
      if (workspaceId) payload.workspace_id = workspaceId

      const created: any = await api.createFlow(payload)
      const flowId = created?.id ?? created?.flow?.id

      if (flowId && (selectedData.size > 0 || selectedSubjects.size > 0)) {
        await api
          .setFlowCategories(flowId, {
            data_category_ids: Array.from(selectedData),
            subject_category_ids: Array.from(selectedSubjects),
          })
          .catch(() => {})
      }

      if (flowId) router.push(`/dashboard/flows/${flowId}`)
      else router.push('/dashboard/flows')
    } catch (e: any) {
      setSubmitError(e?.message ?? 'Failed to create flow')
      setSubmitting(false)
    }
  }

  if (loading) return <PageLoader label="Loading reference data..." />

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            href="/dashboard/flows"
            className="text-xs text-slate-500 hover:text-indigo-300"
          >
            ← Transfer Flows
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-white">New Transfer Flow</h1>
          <p className="mt-1 text-sm text-slate-500">
            Register a cross-border data transfer and tag its categories so the validity
            engine can assess Chapter V coverage.
          </p>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {loadError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-white">Transfer details</h2>
          </CardHeader>
          <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={labelClass}>Flow name *</label>
              <input
                className={fieldClass}
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. EU customer support tickets → US helpdesk"
                required
              />
            </div>

            <div>
              <label className={labelClass}>Source region</label>
              <select
                className={fieldClass}
                value={form.source_region}
                onChange={(e) => set('source_region', e.target.value)}
              >
                {SOURCE_REGIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Destination country *</label>
              <select
                className={fieldClass}
                value={form.destination_country_id}
                onChange={(e) => set('destination_country_id', e.target.value)}
                required
              >
                <option value="">Select a country…</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.iso_code ? ` (${c.iso_code})` : ''}
                  </option>
                ))}
              </select>
              {destCountry && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <Badge
                    tone={
                      (destCountry.eu_adequacy_status ?? '').toLowerCase() === 'adequate'
                        ? 'success'
                        : 'warning'
                    }
                  >
                    EU: {destCountry.eu_adequacy_status ?? 'unknown'}
                  </Badge>
                  {destCountry.surveillance_risk && (
                    <Badge tone="neutral">
                      Surveillance: {destCountry.surveillance_risk}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className={labelClass}>Exporting entity</label>
              <input
                className={fieldClass}
                value={form.exporting_entity}
                onChange={(e) => set('exporting_entity', e.target.value)}
                placeholder="Exporter legal entity"
              />
            </div>

            <div>
              <label className={labelClass}>Recipient / importer</label>
              <select
                className={fieldClass}
                value={form.recipient_id}
                onChange={(e) => set('recipient_id', e.target.value)}
              >
                <option value="">No recipient yet</option>
                {recipients.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.legal_name}
                    {r.role ? ` — ${r.role}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Recipient role</label>
              <select
                className={fieldClass}
                value={form.recipient_role}
                onChange={(e) => set('recipient_role', e.target.value)}
              >
                {RECIPIENT_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Volume band</label>
              <select
                className={fieldClass}
                value={form.volume_band}
                onChange={(e) => set('volume_band', e.target.value)}
              >
                {VOLUME_BANDS.map((v) => (
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
                value={form.frequency}
                onChange={(e) => set('frequency', e.target.value)}
              >
                {FREQUENCIES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Purpose</label>
              <input
                className={fieldClass}
                value={form.purpose}
                onChange={(e) => set('purpose', e.target.value)}
                placeholder="Purpose of the transfer"
              />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Tags (comma separated)</label>
              <input
                className={fieldClass}
                value={form.tags}
                onChange={(e) => set('tags', e.target.value)}
                placeholder="hr, payroll, marketing"
              />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Notes</label>
              <textarea
                className={`${fieldClass} min-h-[80px]`}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Context, scope, internal references…"
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Data categories</h2>
            <span className="text-xs text-slate-500">{selectedData.size} selected</span>
          </CardHeader>
          <CardBody>
            {dataCategories.length === 0 ? (
              <p className="text-sm text-slate-500">
                No data categories in the catalog yet. You can add them under Reference →
                Data Categories.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {dataCategories.map((c) => {
                  const active = selectedData.has(c.id)
                  return (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => toggle(setSelectedData, c.id)}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        active
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-100'
                          : 'border-slate-700 bg-slate-950/40 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <span className="truncate">{c.name}</span>
                      {c.is_special && (
                        <Badge tone="danger" className="ml-2 shrink-0">
                          special
                        </Badge>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Subject categories</h2>
            <span className="text-xs text-slate-500">{selectedSubjects.size} selected</span>
          </CardHeader>
          <CardBody>
            {subjectCategories.length === 0 ? (
              <p className="text-sm text-slate-500">
                No subject categories in the catalog yet. Add them under Reference → Subject
                Categories.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {subjectCategories.map((c) => {
                  const active = selectedSubjects.has(c.id)
                  return (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => toggle(setSelectedSubjects, c.id)}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        active
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-100'
                          : 'border-slate-700 bg-slate-950/40 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <span className="truncate">{c.name}</span>
                      {typeof c.risk_weight === 'number' && (
                        <span className="ml-2 shrink-0 text-xs text-slate-500">
                          w{c.risk_weight}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </CardBody>
        </Card>

        {submitError && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {submitError}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <Link href="/dashboard/flows">
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={submitting}>
            {submitting ? <Spinner /> : 'Create flow'}
          </Button>
        </div>
      </form>
    </div>
  )
}
