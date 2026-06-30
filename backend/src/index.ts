import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { db } from './db/index.js'
import { migrate } from './db/migrate.js'
import {
  plans,
  countries,
  legal_bases,
  data_categories,
  subject_categories,
  supplementary_measures,
} from './db/schema.js'

import workspacesRoutes from './routes/workspaces.js'
import flowsRoutes from './routes/flows.js'
import mechanismsRoutes from './routes/mechanisms.js'
import sccRoutes from './routes/scc.js'
import tiasRoutes from './routes/tias.js'
import adequacyRoutes from './routes/adequacy.js'
import countriesRoutes from './routes/countries.js'
import recipientsRoutes from './routes/recipients.js'
import subprocessorsRoutes from './routes/subprocessors.js'
import onwardRoutes from './routes/onward.js'
import coverageRoutes from './routes/coverage.js'
import gapsRoutes from './routes/gaps.js'
import reviewsRoutes from './routes/reviews.js'
import dataCategoriesRoutes from './routes/data-categories.js'
import subjectCategoriesRoutes from './routes/subject-categories.js'
import legalBasesRoutes from './routes/legal-bases.js'
import measuresRoutes from './routes/measures.js'
import auditRoutes from './routes/audit.js'
import notificationsRoutes from './routes/notifications.js'
import reportsRoutes from './routes/reports.js'
import dashboardRoutes from './routes/dashboard.js'
import settingsRoutes from './routes/settings.js'
import seedRoutes from './routes/seed.js'
import billingRoutes from './routes/billing.js'

const app = new Hono()

const allowedOrigins = [
  process.env.FRONTEND_URL ?? 'http://localhost:3000',
  'https://cross-border-transfer-mechanism-register.vercel.app',
]

app.use(
  '*',
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]),
    credentials: true,
  }),
)

// ---------------------------------------------------------------------------
// Seed data (idempotent: count-then-insert). Plans + small reference set.
// ---------------------------------------------------------------------------

const seedPlans = [
  { id: 'free', name: 'Free', price_cents: 0 },
  { id: 'pro', name: 'Pro', price_cents: 4900 },
]

const seedCountries = [
  {
    iso_code: 'US',
    name: 'United States',
    region: 'Third',
    eu_adequacy_status: 'Partial',
    uk_adequacy_status: 'Partial',
    eu_decision_ref: 'EU-US Data Privacy Framework (2023)',
    uk_decision_ref: 'UK-US Data Bridge (2023)',
    surveillance_risk: 'high',
    notes: 'Adequacy limited to DPF-certified organisations.',
  },
  {
    iso_code: 'GB',
    name: 'United Kingdom',
    region: 'UK',
    eu_adequacy_status: 'Adequate',
    uk_adequacy_status: 'Adequate',
    eu_decision_ref: 'C(2021) 4800',
    surveillance_risk: 'low',
  },
  {
    iso_code: 'CH',
    name: 'Switzerland',
    region: 'Third',
    eu_adequacy_status: 'Adequate',
    uk_adequacy_status: 'Adequate',
    eu_decision_ref: '2000/518/EC',
    surveillance_risk: 'low',
  },
  {
    iso_code: 'CA',
    name: 'Canada',
    region: 'Third',
    eu_adequacy_status: 'Partial',
    uk_adequacy_status: 'Partial',
    eu_decision_ref: '2002/2/EC',
    surveillance_risk: 'medium',
    notes: 'Adequacy covers commercial PIPEDA-governed activity only.',
  },
  {
    iso_code: 'IN',
    name: 'India',
    region: 'Third',
    eu_adequacy_status: 'None',
    uk_adequacy_status: 'None',
    surveillance_risk: 'high',
  },
  {
    iso_code: 'DE',
    name: 'Germany',
    region: 'EEA',
    eu_adequacy_status: 'Adequate',
    uk_adequacy_status: 'Adequate',
    surveillance_risk: 'low',
  },
]

const seedLegalBases = [
  {
    code: 'art45_adequacy',
    article: 'Art. 45',
    name: 'Adequacy decision',
    category: 'adequacy',
    requires_tia: false,
    is_systematic: true,
    description: 'Transfer on the basis of a European Commission adequacy decision.',
  },
  {
    code: 'art46_sccs',
    article: 'Art. 46(2)(c)',
    name: 'Standard Contractual Clauses',
    category: 'appropriate_safeguard',
    requires_tia: true,
    is_systematic: true,
    description: 'EU SCCs (2021) as an appropriate safeguard; requires a TIA.',
  },
  {
    code: 'art47_bcrs',
    article: 'Art. 47',
    name: 'Binding Corporate Rules',
    category: 'appropriate_safeguard',
    requires_tia: true,
    is_systematic: true,
    description: 'Approved BCRs for intra-group transfers; requires a TIA.',
  },
  {
    code: 'art49_derogation',
    article: 'Art. 49',
    name: 'Derogations for specific situations',
    category: 'derogation',
    requires_tia: false,
    is_systematic: false,
    description: 'Explicit consent, contract necessity, etc.; non-systematic transfers only.',
  },
]

const seedDataCategories = [
  { name: 'Contact details', article: null, sensitivity_weight: 1, is_special: false },
  { name: 'Account identifiers', article: null, sensitivity_weight: 2, is_special: false },
  { name: 'Financial data', article: null, sensitivity_weight: 3, is_special: false },
  { name: 'Health data', article: 'Art.9', sensitivity_weight: 5, is_special: true },
  { name: 'Biometric data', article: 'Art.9', sensitivity_weight: 5, is_special: true },
  { name: 'Criminal offence data', article: 'Art.10', sensitivity_weight: 5, is_special: true },
]

const seedSubjectCategories = [
  { name: 'Customers', risk_weight: 2 },
  { name: 'Employees', risk_weight: 3 },
  { name: 'Children', risk_weight: 5 },
  { name: 'Prospects', risk_weight: 1 },
]

const seedMeasures = [
  {
    name: 'End-to-end encryption in transit and at rest',
    measure_type: 'technical',
    effectiveness: 'high',
    description: 'Strong encryption with keys held in the EEA.',
  },
  {
    name: 'Pseudonymisation',
    measure_type: 'technical',
    effectiveness: 'medium',
    description: 'Replace identifiers with tokens before transfer.',
  },
  {
    name: 'Transparency / government-access reporting',
    measure_type: 'organizational',
    effectiveness: 'medium',
    description: 'Publish and challenge government access requests.',
  },
  {
    name: 'Additional contractual warranties',
    measure_type: 'contractual',
    effectiveness: 'low',
    description: 'Importer warranties on local-law conflicts and challenge obligations.',
  },
]

async function seedIfEmpty() {
  // Plans
  const existingPlans = await db.select().from(plans).limit(1)
  if (existingPlans.length === 0) {
    for (const p of seedPlans) await db.insert(plans).values(p as any)
    console.log('Seeded plans')
  }
  // Countries
  const existingCountries = await db.select().from(countries).limit(1)
  if (existingCountries.length === 0) {
    for (const c of seedCountries) await db.insert(countries).values(c as any)
    console.log('Seeded countries')
  }
  // Legal bases
  const existingBases = await db.select().from(legal_bases).limit(1)
  if (existingBases.length === 0) {
    for (const b of seedLegalBases) await db.insert(legal_bases).values(b as any)
    console.log('Seeded legal bases')
  }
  // Data categories (global)
  const existingDC = await db.select().from(data_categories).limit(1)
  if (existingDC.length === 0) {
    for (const d of seedDataCategories) await db.insert(data_categories).values(d as any)
    console.log('Seeded data categories')
  }
  // Subject categories (global)
  const existingSC = await db.select().from(subject_categories).limit(1)
  if (existingSC.length === 0) {
    for (const s of seedSubjectCategories) await db.insert(subject_categories).values(s as any)
    console.log('Seeded subject categories')
  }
  // Supplementary measures (global)
  const existingM = await db.select().from(supplementary_measures).limit(1)
  if (existingM.length === 0) {
    for (const m of seedMeasures) await db.insert(supplementary_measures).values(m as any)
    console.log('Seeded supplementary measures')
  }
}

const api = new Hono()
api.route('/workspaces', workspacesRoutes)
api.route('/flows', flowsRoutes)
api.route('/mechanisms', mechanismsRoutes)
api.route('/scc', sccRoutes)
api.route('/tias', tiasRoutes)
api.route('/adequacy', adequacyRoutes)
api.route('/countries', countriesRoutes)
api.route('/recipients', recipientsRoutes)
api.route('/subprocessors', subprocessorsRoutes)
api.route('/onward', onwardRoutes)
api.route('/coverage', coverageRoutes)
api.route('/gaps', gapsRoutes)
api.route('/reviews', reviewsRoutes)
api.route('/data-categories', dataCategoriesRoutes)
api.route('/subject-categories', subjectCategoriesRoutes)
api.route('/legal-bases', legalBasesRoutes)
api.route('/measures', measuresRoutes)
api.route('/audit', auditRoutes)
api.route('/notifications', notificationsRoutes)
api.route('/reports', reportsRoutes)
api.route('/dashboard', dashboardRoutes)
api.route('/settings', settingsRoutes)
api.route('/seed', seedRoutes)
api.route('/billing', billingRoutes)

app.route('/api/v1', api)
app.get('/health', (c) => c.json({ ok: true }))

// CRITICAL boot order: bind the port FIRST so the platform health check sees a
// live service immediately, THEN run migrate() and seedIfEmpty() (both
// idempotent) AFTER serve(). A slow/cold DB connection must never block the
// port binding.
const port = parseInt(process.env.PORT ?? '3001')
serve({ fetch: app.fetch, port }, () => console.log(`Server running on port ${port}`))

;(async () => {
  try {
    await migrate()
    console.log('Migration complete')
  } catch (e) {
    console.error('Migration error:', e)
  }
  try {
    await seedIfEmpty()
  } catch (e) {
    console.error('Seed error:', e)
  }
})()

export default app
