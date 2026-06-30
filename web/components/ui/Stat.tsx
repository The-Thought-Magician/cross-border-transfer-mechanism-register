interface StatProps {
  label: string
  value: React.ReactNode
  hint?: string
  tone?: 'default' | 'success' | 'warning' | 'danger'
}

const toneClasses = {
  default: 'text-white',
  success: 'text-emerald-300',
  warning: 'text-amber-300',
  danger: 'text-rose-300',
}

export function Stat({ label, value, hint, tone = 'default' }: StatProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneClasses[tone]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  )
}
