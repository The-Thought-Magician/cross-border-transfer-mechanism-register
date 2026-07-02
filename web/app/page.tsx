import Link from 'next/link'

const features = [
  {
    title: 'Transfer-Flow Register',
    body: 'Document every cross-border flow subject to compliance review: source region, destination country, recipient role, data and subject categories, purpose, volume and frequency, each resolving to a deterministic coverage state you can defend on record.',
  },
  {
    title: 'Mechanism Validity Engine',
    body: 'Given a flow and its attached mechanism, the engine determines whether the transfer is lawfully covered as of today, and names the specific failed condition when it is not, so remediation is never a guessing exercise.',
  },
  {
    title: 'TIA Workflow',
    body: 'The EDPB six-step Transfer Impact Assessment captured as a weighted questionnaire, with a supplementary-measures library and reviewer sign-off, producing a record that will withstand scrutiny.',
  },
  {
    title: 'Adequacy Tracker',
    body: 'Monitor third-country adequacy status under EU and UK regimes. When a decision changes, every dependent flow is automatically re-flagged At-Risk and routed into the review queue, without manual cross-checking.',
  },
  {
    title: 'SCC Module & Signature Tracker',
    body: 'Clause version, module, parties, signature status and expiry, with re-paper alerts for legacy clauses and module-versus-role validity checks, so no Standard Contractual Clause silently lapses.',
  },
  {
    title: 'Onward-Transfer Mapping',
    body: 'Model sub-processor re-exports as tracked flows, trace exporter to importer to sub-processor chains, and flag any broken leg lacking a valid mechanism before it becomes a finding.',
  },
  {
    title: 'Coverage Dashboard & Scorecard',
    body: 'A defensible summary of Chapter V posture: total flows, percent covered, open gaps, expiring mechanisms, overdue TIAs, and at-risk flows arising from adequacy changes.',
  },
  {
    title: 'Gap & Remediation Workspace',
    body: 'Remediation tasks generated automatically for each gap, ranked by data sensitivity and volume, with assignment, status, and resolution tracking your team can be held accountable to.',
  },
  {
    title: 'Regulator & Audit Export',
    body: 'Produce an audit-ready pack on demand: the full register, mechanisms, and TIAs, plus an Article 30 records-of-processing transfer section and per-flow evidence dossiers, ready for a supervisory authority request.',
  },
]

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <nav className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <span className="text-lg font-bold tracking-tight text-yellow-400">
          CrossBorderTransferMechanismRegister
        </span>
        <div className="flex items-center gap-4">
          <Link href="/adequacy-explorer" className="hidden text-sm text-slate-300 hover:text-white sm:inline">
            Adequacy Explorer
          </Link>
          <Link href="/pricing" className="hidden text-sm text-slate-300 hover:text-white sm:inline">
            Pricing
          </Link>
          <Link href="/auth/sign-in" className="text-sm text-slate-300 hover:text-white">
            Sign In
          </Link>
          <Link
            href="/auth/sign-up"
            className="rounded-lg bg-yellow-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-yellow-400"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <span className="inline-flex items-center rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1 text-xs font-medium text-yellow-300">
          GDPR Chapter V system of record
        </span>
        <h1 className="mt-6 text-4xl font-black leading-tight tracking-tight sm:text-5xl">
          Maintain cross-border transfer mechanism
          <br className="hidden sm:block" /> compliance, on the record.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
          A system of record for every personal-data flow leaving the EEA or UK: each flow mapped to its
          governing mechanism, each mechanism supported by a documented Transfer Impact Assessment, and the
          full register exportable as a GDPR Chapter V audit trail on request.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/auth/sign-up"
            className="rounded-lg bg-yellow-500 px-6 py-3 text-sm font-semibold text-slate-900 hover:bg-yellow-400"
          >
            Establish your register
          </Link>
          <Link
            href="/auth/sign-in"
            className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* Problem */}
      <section className="border-y border-slate-800 bg-slate-900/40">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <h2 className="text-2xl font-bold text-white">The compliance obligation, stated plainly</h2>
          <p className="mt-4 text-slate-400">
            Under the CJEU&apos;s Schrems II ruling, every transfer of EEA or UK personal data to a third
            country requires a valid Chapter V mechanism, and where that mechanism is a Standard
            Contractual Clause or a set of Binding Corporate Rules, a documented Transfer Impact Assessment
            of the destination&apos;s surveillance regime. Adequacy decisions are revised without notice, the
            2021 SCCs replaced legacy clauses under an 18-month re-paper deadline, and vendors add
            sub-processors in new jurisdictions on their own schedule, not yours. A compliance function that
            relies on spreadsheets cannot keep pace with any of this, and a stale register is not a defense
            in a regulatory inquiry.
          </p>
        </div>
      </section>

      {/* Feature grid */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-2xl font-bold text-white">A register built for audit, not for show</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-400">
          Deterministic coverage determinations. Automatic re-flagging on regulatory change. Evidence that
          holds up under review.
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 transition-colors hover:border-yellow-500/40"
            >
              <h3 className="text-base font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-slate-800 bg-slate-900/40">
        <div className="mx-auto max-w-4xl px-6 py-16 text-center">
          <h2 className="text-2xl font-bold text-white">Be ready to answer a supervisory authority</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">
            For this transfer, to this recipient, in this third country: what is the lawful mechanism, what
            supplementary measures apply, and where is the assessment documenting adequacy? The register
            should answer before the question is asked twice.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href="/auth/sign-up"
              className="rounded-lg bg-yellow-500 px-6 py-3 text-sm font-semibold text-slate-900 hover:bg-yellow-400"
            >
              Get Started
            </Link>
            <Link
              href="/adequacy-explorer"
              className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              Review adequacy data
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800 py-10 text-center text-sm text-slate-600">
        <p>CrossBorderTransferMechanismRegister — the Chapter V transfer register and TIA compliance system.</p>
      </footer>
    </main>
  )
}
