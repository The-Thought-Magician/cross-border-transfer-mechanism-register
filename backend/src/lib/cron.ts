// ---------------------------------------------------------------------------
// cron.ts — the deterministic scheduling/collision engine.
//
// Pure, self-contained functions used by the route handlers. No DB access, no
// external services. A "job" is anything with a schedule (kind + expr +
// timezone). Three schedule kinds are supported:
//   - 'cron'   : a standard 5/6-field cron expression, parsed with cron-parser.
//   - 'rate'   : "every N minutes|hours|days", computed arithmetically.
//   - 'oneoff' : a single ISO instant (the expr itself).
//
// Everything returns ISO UTC instants (strings ending in 'Z') so callers never
// have to reason about timezones once they leave this module.
// ---------------------------------------------------------------------------

import { CronExpressionParser } from 'cron-parser'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScheduleKind = 'cron' | 'rate' | 'oneoff'

export interface Job {
  id: string
  kind: ScheduleKind
  expr: string
  timezone?: string
  resourceId?: string | null
}

export interface ValidationResult {
  valid: boolean
  error?: string
}

export interface CollisionWindow {
  windowStart: string
  windowEnd: string
  jobIds: string[]
  severity: 'low' | 'medium' | 'high'
  resourceId?: string | null
}

export interface HeatmapBucket {
  bucket: string
  count: number
}

export type DstTrapType = 'double_fire' | 'skip' | 'ambiguous'

export interface DstTrap {
  type: DstTrapType
  atLocal: string
  atUtc: string
}

export interface CoverageWindow {
  start: string
  end: string
  label?: string
}

export interface CoverageGap {
  gapStart: string
  gapEnd: string
  durationMinutes: number
}

export interface SpreadSuggestion {
  jobId: string
  suggestedExpr: string
  reason: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

function isValidTimezone(tz: string): boolean {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const RATE_RE = /^every\s+(\d+)\s+(minute|minutes|hour|hours|day|days)$/i

function parseRate(expr: string): { count: number; unitMs: number } | null {
  const m = expr.trim().match(RATE_RE)
  if (!m) return null
  const count = parseInt(m[1], 10)
  if (!Number.isFinite(count) || count <= 0) return null
  const unit = m[2].toLowerCase()
  const unitMs = unit.startsWith('minute') ? MINUTE_MS : unit.startsWith('hour') ? HOUR_MS : DAY_MS
  return { count, unitMs }
}

function toISO(d: Date): string {
  return d.toISOString()
}

// Returns the UTC-offset (in minutes) that `timezone` has at a given instant.
function tzOffsetMinutes(date: Date, timezone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(date)
  const map: Record<string, string> = {}
  for (const p of parts) map[p.type] = p.value
  const asUTC = Date.UTC(
    parseInt(map.year, 10),
    parseInt(map.month, 10) - 1,
    parseInt(map.day, 10),
    parseInt(map.hour === '24' ? '0' : map.hour, 10),
    parseInt(map.minute, 10),
    parseInt(map.second, 10),
  )
  return Math.round((asUTC - date.getTime()) / MINUTE_MS)
}

function bucketMinuteKey(d: Date): string {
  // ISO minute bucket (zero seconds), e.g. 2026-06-30T14:05:00.000Z
  const ms = Math.floor(d.getTime() / MINUTE_MS) * MINUTE_MS
  return new Date(ms).toISOString()
}

// ---------------------------------------------------------------------------
// validateExpression
// ---------------------------------------------------------------------------

export function validateExpression(kind: ScheduleKind, expr: string): ValidationResult {
  if (!expr || !expr.trim()) return { valid: false, error: 'Expression is empty' }
  switch (kind) {
    case 'cron': {
      try {
        CronExpressionParser.parse(expr)
        return { valid: true }
      } catch (err) {
        return { valid: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
    case 'rate': {
      return parseRate(expr)
        ? { valid: true }
        : { valid: false, error: 'Rate must look like "every N minutes|hours|days"' }
    }
    case 'oneoff': {
      const t = Date.parse(expr)
      return Number.isNaN(t)
        ? { valid: false, error: 'One-off must be an ISO date-time' }
        : { valid: true }
    }
    default:
      return { valid: false, error: `Unknown schedule kind: ${kind}` }
  }
}

// ---------------------------------------------------------------------------
// describeExpression
// ---------------------------------------------------------------------------

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function describeExpression(kind: ScheduleKind, expr: string, timezone = 'UTC'): string {
  const v = validateExpression(kind, expr)
  if (!v.valid) return `Invalid (${v.error})`
  const tzLabel = timezone && timezone !== 'UTC' ? ` (${timezone})` : ' (UTC)'

  if (kind === 'rate') {
    const r = parseRate(expr)!
    const unit = r.unitMs === MINUTE_MS ? 'minute' : r.unitMs === HOUR_MS ? 'hour' : 'day'
    const plural = r.count === 1 ? unit : `${unit}s`
    return r.count === 1 ? `Every ${unit}` : `Every ${r.count} ${plural}`
  }

  if (kind === 'oneoff') {
    return `Once at ${new Date(expr).toISOString()}`
  }

  // cron
  const fields = expr.trim().split(/\s+/)
  // Support 5-field (min hr dom mon dow) and 6-field (sec min hr dom mon dow).
  const f = fields.length === 6 ? fields.slice(1) : fields
  const [min, hr, dom, mon, dow] = f
  const parts: string[] = []

  if (min === '*' && hr === '*') {
    parts.push('Every minute')
  } else if (hr === '*' && /^\*\/(\d+)$/.test(min)) {
    parts.push(`Every ${min.split('/')[1]} minutes`)
  } else if (/^\d+$/.test(min) && /^\d+$/.test(hr)) {
    parts.push(`At ${hr.padStart(2, '0')}:${min.padStart(2, '0')}`)
  } else if (/^\d+$/.test(min) && hr === '*') {
    parts.push(`At minute ${min} of every hour`)
  } else {
    parts.push(`Cron ${expr}`)
  }

  if (dow && dow !== '*') {
    const days = dow
      .split(',')
      .map((d) => {
        const n = parseInt(d, 10)
        return Number.isFinite(n) ? DOW[n % 7] : d
      })
      .join(', ')
    parts.push(`on ${days}`)
  } else if (dom && dom !== '*') {
    parts.push(`on day ${dom} of the month`)
  } else if (mon && mon !== '*') {
    parts.push(`in month ${mon}`)
  }

  return parts.join(' ') + tzLabel
}

// ---------------------------------------------------------------------------
// nextFirings
// ---------------------------------------------------------------------------

export function nextFirings(
  kind: ScheduleKind,
  expr: string,
  timezone = 'UTC',
  fromISO: string = new Date().toISOString(),
  count = 5,
): string[] {
  const v = validateExpression(kind, expr)
  if (!v.valid) return []
  const from = new Date(fromISO)
  if (Number.isNaN(from.getTime())) return []
  const tz = isValidTimezone(timezone) ? timezone : 'UTC'
  const n = Math.max(0, Math.min(count, 1000))
  if (n === 0) return []

  if (kind === 'cron') {
    try {
      const interval = CronExpressionParser.parse(expr, { tz, currentDate: from })
      const out: string[] = []
      for (let i = 0; i < n; i++) {
        const next = interval.next()
        out.push(new Date(next.getTime()).toISOString())
      }
      return out
    } catch {
      return []
    }
  }

  if (kind === 'rate') {
    const r = parseRate(expr)!
    const step = r.count * r.unitMs
    const out: string[] = []
    let t = from.getTime() + step
    for (let i = 0; i < n; i++) {
      out.push(toISO(new Date(t)))
      t += step
    }
    return out
  }

  // oneoff: return the instant only if it is in the future relative to `from`.
  const t = Date.parse(expr)
  if (Number.isNaN(t)) return []
  return t > from.getTime() ? [toISO(new Date(t))] : []
}

// ---------------------------------------------------------------------------
// computeCollisions
// ---------------------------------------------------------------------------

export function computeCollisions(
  jobs: Job[],
  opts: { horizonDays?: number; threshold?: number } = {},
): CollisionWindow[] {
  const horizonDays = opts.horizonDays ?? 7
  const threshold = Math.max(2, opts.threshold ?? 2)
  const now = new Date()
  const horizonEnd = now.getTime() + horizonDays * DAY_MS

  // Estimate firings-per-job needed to span the horizon (cap to keep bounded).
  const count = Math.min(2000, Math.max(50, horizonDays * 48))

  // bucketKey -> { jobIds:Set, byResource: Map<resourceId, Set<jobId>> }
  const buckets = new Map<string, { jobIds: Set<string>; byResource: Map<string, Set<string>> }>()

  for (const job of jobs) {
    const firings = nextFirings(job.kind, job.expr, job.timezone ?? 'UTC', now.toISOString(), count)
    for (const iso of firings) {
      const t = Date.parse(iso)
      if (t > horizonEnd) break
      const key = bucketMinuteKey(new Date(t))
      let b = buckets.get(key)
      if (!b) {
        b = { jobIds: new Set(), byResource: new Map() }
        buckets.set(key, b)
      }
      b.jobIds.add(job.id)
      if (job.resourceId) {
        let rset = b.byResource.get(job.resourceId)
        if (!rset) {
          rset = new Set()
          b.byResource.set(job.resourceId, rset)
        }
        rset.add(job.id)
      }
    }
  }

  const windows: CollisionWindow[] = []
  for (const [key, b] of buckets) {
    const concurrency = b.jobIds.size
    // Resource contention: any single resource hit by >= 2 jobs in this minute.
    let resourceHit: { resourceId: string; jobIds: string[] } | null = null
    for (const [rid, set] of b.byResource) {
      if (set.size >= 2) {
        resourceHit = { resourceId: rid, jobIds: [...set] }
        break
      }
    }

    const concurrencyFlag = concurrency >= threshold
    if (!concurrencyFlag && !resourceHit) continue

    const windowStart = key
    const windowEnd = new Date(Date.parse(key) + MINUTE_MS).toISOString()
    const jobIds = resourceHit ? resourceHit.jobIds : [...b.jobIds]

    let severity: CollisionWindow['severity'] = 'low'
    if (concurrency >= threshold * 2 || (resourceHit && concurrency >= threshold)) severity = 'high'
    else if (concurrencyFlag || resourceHit) severity = 'medium'

    windows.push({
      windowStart,
      windowEnd,
      jobIds,
      severity,
      resourceId: resourceHit ? resourceHit.resourceId : undefined,
    })
  }

  windows.sort((a, b) => a.windowStart.localeCompare(b.windowStart))
  return windows
}

// ---------------------------------------------------------------------------
// loadHeatmap
// ---------------------------------------------------------------------------

export function loadHeatmap(jobs: Job[], opts: { horizonDays?: number } = {}): HeatmapBucket[] {
  const horizonDays = opts.horizonDays ?? 7
  const now = new Date()
  const horizonEnd = now.getTime() + horizonDays * DAY_MS
  const count = Math.min(2000, Math.max(50, horizonDays * 48))

  // Bucket by hour for a readable heatmap.
  const hourCounts = new Map<string, number>()

  for (const job of jobs) {
    const firings = nextFirings(job.kind, job.expr, job.timezone ?? 'UTC', now.toISOString(), count)
    for (const iso of firings) {
      const t = Date.parse(iso)
      if (t > horizonEnd) break
      const hourMs = Math.floor(t / HOUR_MS) * HOUR_MS
      const key = new Date(hourMs).toISOString()
      hourCounts.set(key, (hourCounts.get(key) ?? 0) + 1)
    }
  }

  return [...hourCounts.entries()]
    .map(([bucket, c]) => ({ bucket, count: c }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket))
}

// ---------------------------------------------------------------------------
// dstTraps
// ---------------------------------------------------------------------------

export function dstTraps(
  kind: ScheduleKind,
  expr: string,
  timezone: string,
  fromISO: string = new Date().toISOString(),
  days = 365,
): DstTrap[] {
  const traps: DstTrap[] = []
  if (!isValidTimezone(timezone) || timezone === 'UTC') return traps
  const v = validateExpression(kind, expr)
  if (!v.valid) return traps

  const from = new Date(fromISO)
  if (Number.isNaN(from.getTime())) return traps
  const horizonEnd = from.getTime() + days * DAY_MS

  // 1. Detect the DST transition instants in the window by scanning hour-by-hour
  //    for offset changes.
  type Transition = { at: number; before: number; after: number }
  const transitions: Transition[] = []
  let prevOffset = tzOffsetMinutes(from, timezone)
  for (let t = from.getTime() + HOUR_MS; t <= horizonEnd; t += HOUR_MS) {
    const off = tzOffsetMinutes(new Date(t), timezone)
    if (off !== prevOffset) {
      transitions.push({ at: t, before: prevOffset, after: off })
      prevOffset = off
    }
  }
  if (transitions.length === 0) return traps

  // 2. For each transition, decide the trap type from the offset delta.
  //    after > before  => clocks moved forward (spring): a wall-clock hour is
  //                       skipped  -> 'skip' (and a scheduled fire may be lost).
  //    after < before  => clocks moved back (fall): a wall-clock hour repeats
  //                       -> 'ambiguous' / possible 'double_fire'.
  const firings =
    kind === 'oneoff'
      ? nextFirings(kind, expr, timezone, from.toISOString(), 1)
      : nextFirings(kind, expr, timezone, from.toISOString(), Math.min(5000, days * 8))

  for (const tr of transitions) {
    const gapMs = Math.abs(tr.after - tr.before) * MINUTE_MS
    const windowStart = tr.at - HOUR_MS
    const windowEnd = tr.at + HOUR_MS
    const local = (ms: number) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(ms))

    const firesNear = firings.filter((iso) => {
      const t = Date.parse(iso)
      return t >= windowStart && t <= windowEnd
    })

    if (tr.after > tr.before) {
      // spring-forward: the skipped wall-clock window
      const skipped = firesNear.length > 0
      traps.push({
        type: 'skip',
        atLocal: local(tr.at),
        atUtc: new Date(tr.at).toISOString(),
      })
      if (skipped) {
        // a scheduled fire fell inside the skipped hour: also surface explicitly
        for (const iso of firesNear) {
          traps.push({ type: 'skip', atLocal: local(Date.parse(iso)), atUtc: iso })
        }
      }
      void gapMs
    } else {
      // fall-back: the repeated wall-clock window is ambiguous; fires inside it
      // can run twice.
      traps.push({
        type: 'ambiguous',
        atLocal: local(tr.at),
        atUtc: new Date(tr.at).toISOString(),
      })
      for (const iso of firesNear) {
        traps.push({ type: 'double_fire', atLocal: local(Date.parse(iso)), atUtc: iso })
      }
    }
  }

  return traps
}

// ---------------------------------------------------------------------------
// coverageGaps
// ---------------------------------------------------------------------------
//
// Given required coverage windows (e.g. "a job must fire at least once per
// window") and the actual jobs, return windows that have NO firing inside them.

export function coverageGaps(
  windows: CoverageWindow[],
  jobs: Job[],
  opts: { horizonDays?: number } = {},
): CoverageGap[] {
  const horizonDays = opts.horizonDays ?? 7
  const now = new Date()
  const horizonEnd = now.getTime() + horizonDays * DAY_MS
  const count = Math.min(5000, Math.max(50, horizonDays * 96))

  // Collect all firing instants across jobs within the horizon.
  const fires: number[] = []
  for (const job of jobs) {
    const list = nextFirings(job.kind, job.expr, job.timezone ?? 'UTC', now.toISOString(), count)
    for (const iso of list) {
      const t = Date.parse(iso)
      if (t > horizonEnd) break
      fires.push(t)
    }
  }
  fires.sort((a, b) => a - b)

  const gaps: CoverageGap[] = []
  for (const w of windows) {
    const ws = Date.parse(w.start)
    const we = Date.parse(w.end)
    if (Number.isNaN(ws) || Number.isNaN(we) || we <= ws) continue
    const covered = fires.some((t) => t >= ws && t <= we)
    if (!covered) {
      gaps.push({
        gapStart: new Date(ws).toISOString(),
        gapEnd: new Date(we).toISOString(),
        durationMinutes: Math.round((we - ws) / MINUTE_MS),
      })
    }
  }
  return gaps
}

// ---------------------------------------------------------------------------
// autoSpread
// ---------------------------------------------------------------------------
//
// For jobs that collide (>= threshold sharing a minute), suggest a staggered
// cron expression that nudges each colliding job to a distinct minute offset so
// load is spread across the hour.

export function autoSpread(
  jobs: Job[],
  opts: { threshold?: number; horizonDays?: number } = {},
): SpreadSuggestion[] {
  const threshold = Math.max(2, opts.threshold ?? 2)
  const collisions = computeCollisions(jobs, {
    threshold,
    horizonDays: opts.horizonDays ?? 1,
  })

  const suggestions: SpreadSuggestion[] = []
  const seen = new Set<string>()
  const jobById = new Map(jobs.map((j) => [j.id, j]))

  for (const win of collisions) {
    // Keep the first job at its slot; stagger the rest by N minutes each.
    win.jobIds.forEach((jobId, idx) => {
      if (idx === 0 || seen.has(jobId)) return
      const job = jobById.get(jobId)
      if (!job) return

      const offset = (idx * 5) % 60 // 5-minute stagger steps within the hour
      let suggestedExpr = job.expr

      if (job.kind === 'cron') {
        const fields = job.expr.trim().split(/\s+/)
        const hasSeconds = fields.length === 6
        const minIdx = hasSeconds ? 1 : 0
        const copy = [...fields]
        copy[minIdx] = String(offset)
        suggestedExpr = copy.join(' ')
      } else if (job.kind === 'rate') {
        // For rate jobs, nudging the start is not expressible in the rate
        // grammar; suggest converting to a cron with a staggered minute.
        suggestedExpr = `${offset} * * * *`
      }

      suggestions.push({
        jobId,
        suggestedExpr,
        reason: `Shares the ${win.windowStart} window with ${win.jobIds.length} job(s)${
          win.resourceId ? ` on resource ${win.resourceId}` : ''
        }; stagger by ${offset}m to spread load.`,
      })
      seen.add(jobId)
    })
  }

  return suggestions
}
