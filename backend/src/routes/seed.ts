import { Hono } from 'hono'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  workspaces,
  workspace_members,
  countries,
  recipients,
  transfer_flows,
  transfer_mechanisms,
  scc_agreements,
  tias,
  tia_steps,
  legal_bases,
  coverage_results,
  audit_logs,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Sample-data seeder for the caller's workspace.
//
// POST /sample
//   - Resolves (or creates) a workspace for the caller.
//   - Ensures a handful of reference countries exist (idempotent on iso_code).
//   - Ensures the Chapter V legal-basis library has at least the core entries.
//   - Seeds recipients, transfer flows, an SCC agreement, mechanisms, a TIA
//     with its 6 EDPB steps, and coverage results — but only if the workspace
//     has no flows yet (so repeated calls are idempotent).
// ---------------------------------------------------------------------------

const SAMPLE_COUNTRIES: Array<{
  iso_code: string
  name: string
  region: string
  eu_adequacy_status: string
  uk_adequacy_status: string
  eu_decision_ref?: string
  surveillance_risk: string
}> = [
  {
    iso_code: 'US',
    name: 'United States',
    region: 'Third',
    eu_adequacy_status: 'Partial',
    uk_adequacy_status: 'Partial',
    eu_decision_ref: 'EU-US DPF 2023',
    surveillance_risk: 'high',
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
    iso_code: 'IN',
    name: 'India',
    region: 'Third',
    eu_adequacy_status: 'None',
    uk_adequacy_status: 'None',
    surveillance_risk: 'medium',
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
    iso_code: 'SG',
    name: 'Singapore',
    region: 'Third',
    eu_adequacy_status: 'None',
    uk_adequacy_status: 'None',
    surveillance_risk: 'medium',
  },
]

const CORE_LEGAL_BASES: Array<{
  code: string
  article: string
  name: string
  category: string
  requires_tia: boolean
  is_systematic: boolean
  description: string
}> = [
  {
    code: 'art45_adequacy',
    article: 'Art. 45',
    name: 'Adequacy decision',
    category: 'adequacy',
    requires_tia: false,
    is_systematic: true,
    description: 'Transfer on the basis of a Commission adequacy decision.',
  },
  {
    code: 'art46_sccs',
    article: 'Art. 46(2)(c)',
    name: 'Standard Contractual Clauses',
    category: 'appropriate_safeguard',
    requires_tia: true,
    is_systematic: true,
    description: 'Transfer relying on EU SCCs as an appropriate safeguard.',
  },
  {
    code: 'art47_bcrs',
    article: 'Art. 47',
    name: 'Binding Corporate Rules',
    category: 'appropriate_safeguard',
    requires_tia: true,
    is_systematic: true,
    description: 'Intra-group transfer governed by approved BCRs.',
  },
  {
    code: 'art49_derogation',
    article: 'Art. 49',
    name: 'Derogation for specific situations',
    category: 'derogation',
    requires_tia: false,
    is_systematic: false,
    description: 'Occasional, non-systematic transfer on a derogation.',
  },
]

const EDPB_STEPS: Array<{ step_number: number; step_key: string; question: string }> = [
  { step_number: 1, step_key: 'map_transfer', question: 'Know your transfer: map the data flow, parties, and purposes.' },
  { step_number: 2, step_key: 'identify_tool', question: 'Identify the Chapter V transfer tool relied upon.' },
  { step_number: 3, step_key: 'assess_law', question: 'Assess the law and practice of the destination country.' },
  { step_number: 4, step_key: 'supplementary_measures', question: 'Identify and adopt supplementary measures if needed.' },
  { step_number: 5, step_key: 'procedural_steps', question: 'Take any formal procedural steps the measures require.' },
  { step_number: 6, step_key: 'reevaluate', question: 'Re-evaluate at appropriate intervals.' },
]

// Resolve the workspace for the caller, creating one if none exists.
async function ensureWorkspace(userId: string) {
  const memberships = await db
    .select()
    .from(workspace_members)
    .where(eq(workspace_members.user_id, userId))
    .orderBy(desc(workspace_members.created_at))

  if (memberships.length > 0) {
    const [ws] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, memberships[0].workspace_id))
    if (ws) return ws
  }

  const owned = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.created_by, userId))
    .orderBy(desc(workspaces.created_at))
  if (owned.length > 0) return owned[0]

  const [created] = await db
    .insert(workspaces)
    .values({
      name: 'My Workspace',
      default_regime: 'EU',
      exporting_entities: ['Acme EU GmbH'],
      created_by: userId,
    })
    .returning()
  await db.insert(workspace_members).values({
    workspace_id: created.id,
    user_id: userId,
    role: 'owner',
  })
  return created
}

// Ensure reference countries exist; return a map iso_code -> id.
async function ensureCountries(): Promise<Record<string, string>> {
  const isoCodes = SAMPLE_COUNTRIES.map((c) => c.iso_code)
  const existing = await db
    .select()
    .from(countries)
    .where(inArray(countries.iso_code, isoCodes))
  const byIso: Record<string, string> = {}
  for (const row of existing) byIso[row.iso_code] = row.id

  for (const c of SAMPLE_COUNTRIES) {
    if (byIso[c.iso_code]) continue
    const [inserted] = await db
      .insert(countries)
      .values({
        iso_code: c.iso_code,
        name: c.name,
        region: c.region,
        eu_adequacy_status: c.eu_adequacy_status,
        uk_adequacy_status: c.uk_adequacy_status,
        eu_decision_ref: c.eu_decision_ref ?? null,
        surveillance_risk: c.surveillance_risk,
      })
      .onConflictDoNothing({ target: countries.iso_code })
      .returning()
    if (inserted) {
      byIso[c.iso_code] = inserted.id
    } else {
      const [row] = await db
        .select()
        .from(countries)
        .where(eq(countries.iso_code, c.iso_code))
      if (row) byIso[c.iso_code] = row.id
    }
  }
  return byIso
}

// Ensure the core Chapter V legal bases exist; return a map code -> id.
async function ensureLegalBases(): Promise<Record<string, string>> {
  const codes = CORE_LEGAL_BASES.map((l) => l.code)
  const existing = await db
    .select()
    .from(legal_bases)
    .where(inArray(legal_bases.code, codes))
  const byCode: Record<string, string> = {}
  for (const row of existing) byCode[row.code] = row.id

  for (const l of CORE_LEGAL_BASES) {
    if (byCode[l.code]) continue
    const [inserted] = await db
      .insert(legal_bases)
      .values(l)
      .onConflictDoNothing({ target: legal_bases.code })
      .returning()
    if (inserted) {
      byCode[l.code] = inserted.id
    } else {
      const [row] = await db
        .select()
        .from(legal_bases)
        .where(eq(legal_bases.code, l.code))
      if (row) byCode[l.code] = row.id
    }
  }
  return byCode
}

router.post('/sample', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const workspace = await ensureWorkspace(userId)

  // Idempotency guard: if the workspace already has flows, do nothing.
  const existingFlows = await db
    .select()
    .from(transfer_flows)
    .where(eq(transfer_flows.workspace_id, workspace.id))
    .limit(1)
  if (existingFlows.length > 0) {
    return c.json({ seeded: false, reason: 'Workspace already has data', workspace_id: workspace.id })
  }

  const countryByIso = await ensureCountries()
  const basisByCode = await ensureLegalBases()

  const now = new Date()
  const inDays = (n: number) => new Date(now.getTime() + n * 86_400_000)

  // --- Recipients -----------------------------------------------------------
  const [awsRecipient] = await db
    .insert(recipients)
    .values({
      workspace_id: workspace.id,
      legal_name: 'Cloud Vendor Inc.',
      role: 'processor',
      country_id: countryByIso['US'] ?? null,
      group_affiliation: 'CloudVendor Group',
      contact_email: 'privacy@cloudvendor.example',
      dpf_certified: true,
      dpf_status: 'active',
      dpf_renewal_date: inDays(300),
      notes: 'Primary hosting & analytics processor.',
      created_by: userId,
    })
    .returning()

  const [supportRecipient] = await db
    .insert(recipients)
    .values({
      workspace_id: workspace.id,
      legal_name: 'Global Support Pvt Ltd',
      role: 'processor',
      country_id: countryByIso['IN'] ?? null,
      group_affiliation: 'Support Co',
      contact_email: 'dpo@support.example',
      dpf_certified: false,
      dpf_status: 'none',
      notes: 'Tier-1 customer support outsourcing.',
      created_by: userId,
    })
    .returning()

  // --- Transfer flows -------------------------------------------------------
  const [hostingFlow] = await db
    .insert(transfer_flows)
    .values({
      workspace_id: workspace.id,
      name: 'Customer data hosting (US)',
      source_region: 'EEA',
      destination_country_id: countryByIso['US'] ?? null,
      exporting_entity: 'Acme EU GmbH',
      recipient_id: awsRecipient.id,
      recipient_role: 'processor',
      purpose: 'Cloud hosting of customer account data',
      volume_band: 'high',
      frequency: 'continuous',
      coverage_state: 'Covered',
      owner_user_id: userId,
      tags: ['hosting', 'core'],
      notes: 'Covered by EU SCCs + DPF certification.',
      created_by: userId,
    })
    .returning()

  const [supportFlow] = await db
    .insert(transfer_flows)
    .values({
      workspace_id: workspace.id,
      name: 'Support ticket access (India)',
      source_region: 'EEA',
      destination_country_id: countryByIso['IN'] ?? null,
      exporting_entity: 'Acme EU GmbH',
      recipient_id: supportRecipient.id,
      recipient_role: 'processor',
      purpose: 'Remote access to support tickets containing personal data',
      volume_band: 'medium',
      frequency: 'continuous',
      coverage_state: 'Gap',
      owner_user_id: userId,
      tags: ['support'],
      notes: 'No appropriate safeguard in place yet; needs SCCs + TIA.',
      created_by: userId,
    })
    .returning()

  // --- SCC agreement --------------------------------------------------------
  const [scc] = await db
    .insert(scc_agreements)
    .values({
      workspace_id: workspace.id,
      recipient_id: awsRecipient.id,
      clause_version: 'eu_2021',
      module: 2,
      parties: ['Acme EU GmbH', 'Cloud Vendor Inc.'],
      docking_parties: [],
      signature_status: 'signed',
      signed_date: inDays(-120),
      effective_date: inDays(-120),
      expiry_date: inDays(610),
      needs_repaper: false,
      notes: 'EU 2021 SCCs Module 2 (controller-to-processor).',
      created_by: userId,
    })
    .returning()

  // --- Mechanisms -----------------------------------------------------------
  await db.insert(transfer_mechanisms).values({
    workspace_id: workspace.id,
    flow_id: hostingFlow.id,
    legal_basis_id: basisByCode['art46_sccs'] ?? null,
    mechanism_type: 'scc',
    scc_agreement_id: scc.id,
    status: 'active',
    effective_date: inDays(-120),
    expiry_date: inDays(610),
    created_by: userId,
  })

  // --- TIA with 6 EDPB steps ------------------------------------------------
  const [tia] = await db
    .insert(tias)
    .values({
      workspace_id: workspace.id,
      flow_id: hostingFlow.id,
      recipient_id: awsRecipient.id,
      country_id: countryByIso['US'] ?? null,
      title: 'TIA — Customer data hosting (US)',
      status: 'approved',
      outcome: 'adequate_with_measures',
      risk_score: 2.5,
      reviewer_user_id: userId,
      approved_by: userId,
      approved_at: inDays(-90),
      review_due_date: inDays(275),
      summary: 'US transfer relying on SCCs + DPF; supplementary measures (encryption) bring residual risk to acceptable.',
      created_by: userId,
    })
    .returning()

  for (const step of EDPB_STEPS) {
    await db.insert(tia_steps).values({
      tia_id: tia.id,
      step_number: step.step_number,
      step_key: step.step_key,
      question: step.question,
      answer: step.step_number <= 4 ? 'Completed during initial assessment.' : 'Scheduled.',
      risk_points: step.step_number === 3 ? 2.5 : 0,
    })
  }

  // --- Coverage results -----------------------------------------------------
  await db.insert(coverage_results).values({
    workspace_id: workspace.id,
    flow_id: hostingFlow.id,
    state: 'Covered',
    verdict: 'Valid SCCs + completed TIA + DPF-certified recipient.',
    failed_conditions: [],
    risk_score: 2.5,
  })

  await db.insert(coverage_results).values({
    workspace_id: workspace.id,
    flow_id: supportFlow.id,
    state: 'Gap',
    verdict: 'No transfer mechanism attached; no TIA on file.',
    failed_conditions: ['missing_mechanism', 'missing_tia'],
    risk_score: 7.5,
  })

  // --- Audit log ------------------------------------------------------------
  await db.insert(audit_logs).values({
    workspace_id: workspace.id,
    actor_user_id: userId,
    action: 'create',
    entity_type: 'seed',
    entity_id: workspace.id,
    detail: {
      countries: Object.keys(countryByIso).length,
      recipients: 2,
      flows: 2,
      scc_agreements: 1,
      mechanisms: 1,
      tias: 1,
    },
  })

  return c.json({
    seeded: true,
    workspace_id: workspace.id,
    counts: {
      countries: Object.keys(countryByIso).length,
      recipients: 2,
      flows: 2,
      scc_agreements: 1,
      mechanisms: 1,
      tias: 1,
      tia_steps: EDPB_STEPS.length,
      coverage_results: 2,
    },
  })
})

export default router
