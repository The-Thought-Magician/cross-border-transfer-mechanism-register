'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'

const planFeatures = [
  'Unlimited transfer flows and recipients',
  'Mechanism validity engine with per-flow verdicts',
  'EDPB six-step TIA workflow and sign-off',
  'EU and UK adequacy tracker with auto re-flagging',
  'SCC module, signature, and re-paper tracking',
  'Onward-transfer chain mapping',
  'Coverage scorecard and gap remediation',
  'Regulator audit-pack and Article 30 export',
  'Activity and audit log',
  'Workspace membership and roles',
]

export default function Pricing() {
  const [stripeEnabled, setStripeEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    // Public page: probe billing config but tolerate the unauthenticated 401.
    api
      .getBillingPlan()
      .then((res: any) => setStripeEnabled(Boolean(res?.stripeEnabled)))
      .catch(() => setStripeEnabled(false))
  }, [])

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <nav className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold tracking-tight text-indigo-400">
          CrossBorderTransferMechanismRegister
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/auth/sign-in" className="text-sm text-slate-300 hover:text-white">
            Sign In
          </Link>
          <Link
            href="/auth/sign-up"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Get Started
          </Link>
        </div>
      </nav>

      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="text-4xl font-black tracking-tight">Simple, honest pricing</h1>
        <p className="mx-auto mt-4 max-w-xl text-slate-400">
          Every feature is free for signed-in users. A Pro tier exists for future use; billing is optional
          and the platform runs fully without it.
        </p>
      </section>

      <section className="mx-auto grid max-w-4xl gap-6 px-6 pb-24 md:grid-cols-2">
        {/* Free plan */}
        <div className="rounded-2xl border border-indigo-500/40 bg-slate-900/60 p-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Free</h2>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
              All features included
            </span>
          </div>
          <div className="mt-4 flex items-baseline gap-1">
            <span className="text-4xl font-black">$0</span>
            <span className="text-slate-500">/ month</span>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            The complete Chapter V transfer register, for every signed-in user.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-slate-300">
            {planFeatures.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span className="mt-0.5 text-emerald-400">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/auth/sign-up"
            className="mt-8 block rounded-lg bg-indigo-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Start free
          </Link>
        </div>

        {/* Pro plan */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Pro</h2>
            <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300">
              Future use
            </span>
          </div>
          <div className="mt-4 flex items-baseline gap-1">
            <span className="text-4xl font-black">Soon</span>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            Reserved for future capacity, SSO, and priority support. Stripe checkout is{' '}
            {stripeEnabled === null ? 'being checked' : stripeEnabled ? 'enabled' : 'not configured yet'}.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-slate-400">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-slate-500">•</span>
              <span>Everything in Free, today and always.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-slate-500">•</span>
              <span>Subscription state is tracked for a future paid tier.</span>
            </li>
          </ul>
          <button
            disabled
            className="mt-8 block w-full cursor-not-allowed rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-center text-sm font-semibold text-slate-400 opacity-70"
          >
            Not available yet
          </button>
        </div>
      </section>

      <footer className="border-t border-slate-800 py-10 text-center text-sm text-slate-600">
        <p>CrossBorderTransferMechanismRegister — all features free for signed-in users.</p>
      </footer>
    </main>
  )
}
