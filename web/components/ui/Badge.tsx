import type { HTMLAttributes } from 'react'

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'review'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

const tones: Record<Tone, string> = {
  neutral: 'bg-slate-800 text-slate-300 border-slate-700',
  success: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  warning: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  danger: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  info: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
  review: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
}

// Maps common domain states to a tone so pages can pass coverage/status strings directly.
export function coverageTone(state?: string): Tone {
  switch ((state ?? '').toLowerCase()) {
    case 'covered':
    case 'adequate':
    case 'approved':
    case 'signed':
    case 'active':
      return 'success'
    case 'expiring':
    case 'pending':
    case 'in-review':
    case 'adequate-with-measures':
    case 'partial':
      return 'warning'
    case 'gap':
    case 'at-risk':
    case 'inadequate':
    case 'invalidated':
    case 'rejected':
    case 'expired':
    case 'none':
      return 'danger'
    case 'under-review':
    case 'draft':
      return 'review'
    default:
      return 'neutral'
  }
}

export function Badge({ tone = 'neutral', className = '', children, ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}
