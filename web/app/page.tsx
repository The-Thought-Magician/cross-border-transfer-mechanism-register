import Link from 'next/link'

const features = [
  {
    title: 'Transfer-Flow Register',
    body: 'Inventory every cross-border flow: source region, destination country, recipient role, data and subject categories, purpose, volume and frequency, each resolving to a deterministic coverage state.',
  },
  {
    title: 'Mechanism Validity Engine',
    body: 'Given a flow and its attached mechanism, the engine decides whether the transfer is lawfully covered today, with the specific failed condition when it is not.',
  },
  {
    title: 'TIA Workflow',
    body: 'The EDPB six-step Transfer Impact Assessment captured as a weighted questionnaire, with a supplementary-measures library and reviewer sign-off.',
  },
  {
    title: 'Adequacy Tracker',
    body: 'Track third-country adequacy under EU and UK regimes. When a decision changes, every dependent flow is automatically re-flagged At-Risk and queued for review.',
  },
  {
    title: 'SCC Module & Signature Tracker',
    body: 'Clause version, module, parties, signature status and expiry, with re-paper alerts for legacy clauses and module-versus-role validity checks.',
  },
  {
    title: 'Onward-Transfer Mapping',
    body: 'Model sub-processor re-exports as tracked flows, visualize exporter to importer to sub-processor chains, and flag any broken leg with no mechanism.',
  },
  {
    title: 'Coverage Dashboard & Scorecard',
    body: 'Executive Chapter V health: total flows, percent covered, open gaps, expiring mechanisms, overdue TIAs, and at-risk flows from adequacy changes.',
  },
  {
    title: 'Gap & Remediation Workspace',
    body: 'Auto-generated remediation tasks for each gap, ranked by data sensitivity and volume, with assignment, status, and resolution tracking.',
  },
  {
    title: 'Regulator & Audit Export',
    body: 'Produce an audit-ready pack: the full register, mechanisms, and TIAs, plus an Article 30 records-of-processing transfer section and per-flow evidence dossiers.',
  },
]

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <nav className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <span className="text-lg font-bold tracking-tight text-indigo-400">
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
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <span className="inline-flex items-center rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
          GDPR Chapter V system of record
        </span>
        <h1 className="mt-6 text-4xl font-black leading-tight tracking-tight sm:text-5xl">
          Prove every cross-border data transfer
          <br className="hidden sm:block" /> is lawfully covered.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
          Track every personal-data flow leaving the EEA or UK, match each one to its lawful transfer
          mechanism, justify it with a documented TIA, and export the whole register for a DPA audit.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/auth/sign-up"
            className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Start your register
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
          <h2 className="text-2xl font-bold text-white">The Schrems II problem</h2>
          <p className="mt-4 text-slate-400">
            Since the CJEU&apos;s Schrems II ruling, every transfer of EEA or UK personal data to a third
            country needs a valid Chapter V mechanism and, for SCCs or BCRs, a documented Transfer Impact
            Assessment of the destination&apos;s surveillance laws. Adequacy decisions change, the 2021 SCCs
            replaced the legacy clauses on an 18-month re-paper deadline, and vendors constantly add new
            sub-processors in new regions. Most teams track this in spreadsheets that go stale the moment a
            vendor changes a sub-processor or a decision is challenged. The fines for getting it wrong run
            to nine figures.
          </p>
        </div>
      </section>

      {/* Feature grid */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-2xl font-bold text-white">A living register, not a spreadsheet</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-400">
          Deterministic coverage. Automatic re-flagging. Audit-ready evidence.
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 transition-colors hover:border-indigo-500/40"
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
          <h2 className="text-2xl font-bold text-white">Answer the regulator with evidence</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">
            For this transfer, to this recipient, in this third country: what is the lawful mechanism, what
            supplementary measures apply, and where is the assessment that says it is adequate?
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href="/auth/sign-up"
              className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Get Started
            </Link>
            <Link
              href="/adequacy-explorer"
              className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              Explore adequacy data
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800 py-10 text-center text-sm text-slate-600">
        <p>CrossBorderTransferMechanismRegister — the Chapter V transfer register and TIA engine.</p>
      </footer>
    </main>
  )
}
