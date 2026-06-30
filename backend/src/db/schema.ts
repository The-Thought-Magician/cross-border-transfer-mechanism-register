import { pgTable, text, integer, boolean, timestamp, jsonb, unique, real } from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Workspaces & membership
// ---------------------------------------------------------------------------

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  default_regime: text('default_regime').notNull().default('EU'), // EU | UK
  exporting_entities: jsonb('exporting_entities').$type<string[]>().default([]),
  tia_review_months: integer('tia_review_months').notNull().default(12),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const workspace_members = pgTable('workspace_members', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  role: text('role').notNull().default('member'), // owner | member
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.workspace_id, t.user_id)])

// ---------------------------------------------------------------------------
// Reference data (mostly public reads, seeded)
// ---------------------------------------------------------------------------

export const countries = pgTable('countries', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  iso_code: text('iso_code').notNull().unique(),
  name: text('name').notNull(),
  region: text('region'), // EEA | UK | Third
  eu_adequacy_status: text('eu_adequacy_status').notNull().default('None'), // Adequate | Partial | None | Invalidated
  uk_adequacy_status: text('uk_adequacy_status').notNull().default('None'),
  eu_decision_ref: text('eu_decision_ref'),
  uk_decision_ref: text('uk_decision_ref'),
  effective_date: timestamp('effective_date'),
  review_date: timestamp('review_date'),
  surveillance_risk: text('surveillance_risk').notNull().default('unknown'), // low | medium | high | unknown
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const adequacy_events = pgTable('adequacy_events', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  country_id: text('country_id').notNull().references(() => countries.id),
  regime: text('regime').notNull().default('EU'), // EU | UK
  old_status: text('old_status'),
  new_status: text('new_status').notNull(),
  decision_ref: text('decision_ref'),
  effective_date: timestamp('effective_date'),
  description: text('description'),
  created_by: text('created_by'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const data_categories = pgTable('data_categories', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').references(() => workspaces.id), // null = global/seeded
  name: text('name').notNull(),
  article: text('article'), // e.g. Art.9 | Art.10
  sensitivity_weight: integer('sensitivity_weight').notNull().default(1), // 1-5
  description: text('description'),
  is_special: boolean('is_special').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const subject_categories = pgTable('subject_categories', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').references(() => workspaces.id),
  name: text('name').notNull(),
  risk_weight: integer('risk_weight').notNull().default(1), // 1-5
  description: text('description'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const legal_bases = pgTable('legal_bases', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  code: text('code').notNull().unique(), // art45_adequacy | art46_sccs | art47_bcrs | art49_derogation
  article: text('article').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull(), // adequacy | appropriate_safeguard | derogation
  requires_tia: boolean('requires_tia').notNull().default(false),
  is_systematic: boolean('is_systematic').notNull().default(true),
  description: text('description'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const supplementary_measures = pgTable('supplementary_measures', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').references(() => workspaces.id),
  name: text('name').notNull(),
  measure_type: text('measure_type').notNull(), // technical | contractual | organizational
  effectiveness: text('effectiveness').notNull().default('medium'), // low | medium | high
  description: text('description'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Recipients & sub-processors
// ---------------------------------------------------------------------------

export const recipients = pgTable('recipients', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  legal_name: text('legal_name').notNull(),
  role: text('role').notNull().default('processor'), // controller | processor | sub-processor
  country_id: text('country_id').references(() => countries.id),
  group_affiliation: text('group_affiliation'),
  contact_email: text('contact_email'),
  dpf_certified: boolean('dpf_certified').notNull().default(false),
  dpf_status: text('dpf_status'), // active | withdrawn | none
  dpf_renewal_date: timestamp('dpf_renewal_date'),
  notes: text('notes'),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const subprocessors = pgTable('subprocessors', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  recipient_id: text('recipient_id').notNull().references(() => recipients.id),
  name: text('name').notNull(),
  country_id: text('country_id').references(() => countries.id),
  service: text('service'),
  declared_at: timestamp('declared_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Transfer flow register
// ---------------------------------------------------------------------------

export const transfer_flows = pgTable('transfer_flows', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  name: text('name').notNull(),
  source_region: text('source_region').notNull().default('EEA'), // EEA | UK
  destination_country_id: text('destination_country_id').references(() => countries.id),
  exporting_entity: text('exporting_entity'),
  recipient_id: text('recipient_id').references(() => recipients.id),
  recipient_role: text('recipient_role').notNull().default('processor'),
  purpose: text('purpose'),
  volume_band: text('volume_band').notNull().default('medium'), // low | medium | high
  frequency: text('frequency').notNull().default('continuous'), // occasional | periodic | continuous
  coverage_state: text('coverage_state').notNull().default('Under-Review'), // Covered | Gap | Expiring | At-Risk | Under-Review
  owner_user_id: text('owner_user_id'),
  tags: jsonb('tags').$type<string[]>().default([]),
  notes: text('notes'),
  archived: boolean('archived').notNull().default(false),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const flow_data_categories = pgTable('flow_data_categories', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  flow_id: text('flow_id').notNull().references(() => transfer_flows.id),
  data_category_id: text('data_category_id').notNull().references(() => data_categories.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.flow_id, t.data_category_id)])

export const flow_subject_categories = pgTable('flow_subject_categories', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  flow_id: text('flow_id').notNull().references(() => transfer_flows.id),
  subject_category_id: text('subject_category_id').notNull().references(() => subject_categories.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.flow_id, t.subject_category_id)])

// ---------------------------------------------------------------------------
// Mechanisms (SCC / adequacy / BCR / derogation instances)
// ---------------------------------------------------------------------------

export const transfer_mechanisms = pgTable('transfer_mechanisms', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  flow_id: text('flow_id').notNull().references(() => transfer_flows.id),
  legal_basis_id: text('legal_basis_id').references(() => legal_bases.id),
  mechanism_type: text('mechanism_type').notNull(), // adequacy | scc | bcr | derogation
  scc_agreement_id: text('scc_agreement_id'),
  derogation_justification: text('derogation_justification'),
  status: text('status').notNull().default('active'), // active | superseded | invalid
  effective_date: timestamp('effective_date'),
  expiry_date: timestamp('expiry_date'),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const scc_agreements = pgTable('scc_agreements', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  recipient_id: text('recipient_id').references(() => recipients.id),
  clause_version: text('clause_version').notNull().default('eu_2021'), // eu_2021 | uk_idta | uk_addendum | legacy_2010
  module: integer('module'), // 1 | 2 | 3 | 4
  parties: jsonb('parties').$type<string[]>().default([]),
  docking_parties: jsonb('docking_parties').$type<string[]>().default([]),
  signature_status: text('signature_status').notNull().default('pending'), // signed | pending | expired
  signed_date: timestamp('signed_date'),
  effective_date: timestamp('effective_date'),
  expiry_date: timestamp('expiry_date'),
  needs_repaper: boolean('needs_repaper').notNull().default(false),
  notes: text('notes'),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Transfer Impact Assessments
// ---------------------------------------------------------------------------

export const tias = pgTable('tias', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  flow_id: text('flow_id').references(() => transfer_flows.id),
  recipient_id: text('recipient_id').references(() => recipients.id),
  country_id: text('country_id').references(() => countries.id),
  title: text('title').notNull(),
  status: text('status').notNull().default('draft'), // draft | in-review | approved | rejected
  outcome: text('outcome'), // adequate | adequate_with_measures | inadequate
  risk_score: real('risk_score'),
  reviewer_user_id: text('reviewer_user_id'),
  approved_by: text('approved_by'),
  approved_at: timestamp('approved_at'),
  review_due_date: timestamp('review_due_date'),
  summary: text('summary'),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const tia_steps = pgTable('tia_steps', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tia_id: text('tia_id').notNull().references(() => tias.id),
  step_number: integer('step_number').notNull(), // 1-6 EDPB methodology
  step_key: text('step_key').notNull(),
  question: text('question'),
  answer: text('answer'),
  risk_points: real('risk_points').default(0),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.tia_id, t.step_number)])

export const tia_measures = pgTable('tia_measures', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tia_id: text('tia_id').notNull().references(() => tias.id),
  measure_id: text('measure_id').notNull().references(() => supplementary_measures.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.tia_id, t.measure_id)])

// ---------------------------------------------------------------------------
// Onward transfers (sub-processor re-export legs)
// ---------------------------------------------------------------------------

export const onward_transfers = pgTable('onward_transfers', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  parent_flow_id: text('parent_flow_id').notNull().references(() => transfer_flows.id),
  subprocessor_id: text('subprocessor_id').references(() => subprocessors.id),
  destination_country_id: text('destination_country_id').references(() => countries.id),
  mechanism_type: text('mechanism_type'), // adequacy | scc | bcr | derogation | none
  coverage_state: text('coverage_state').notNull().default('Under-Review'),
  notes: text('notes'),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Coverage results, remediation, reviews
// ---------------------------------------------------------------------------

export const coverage_results = pgTable('coverage_results', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  flow_id: text('flow_id').notNull().references(() => transfer_flows.id).unique(),
  state: text('state').notNull().default('Under-Review'),
  verdict: text('verdict'),
  failed_conditions: jsonb('failed_conditions').$type<string[]>().default([]),
  risk_score: real('risk_score'),
  computed_at: timestamp('computed_at').defaultNow().notNull(),
})

export const remediation_tasks = pgTable('remediation_tasks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  flow_id: text('flow_id').references(() => transfer_flows.id),
  title: text('title').notNull(),
  action_type: text('action_type'), // attach_scc | complete_tia | confirm_adequacy | repaper | review
  status: text('status').notNull().default('open'), // open | in-progress | done
  priority: text('priority').notNull().default('medium'),
  assignee_user_id: text('assignee_user_id'),
  due_date: timestamp('due_date'),
  resolution_note: text('resolution_note'),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const reviews = pgTable('reviews', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  entity_type: text('entity_type').notNull(), // tia | scc | flow
  entity_id: text('entity_id').notNull(),
  status: text('status').notNull().default('draft'), // draft | in-review | approved | rejected
  reviewer_user_id: text('reviewer_user_id'),
  decided_by: text('decided_by'),
  decided_at: timestamp('decided_at'),
  comment: text('comment'),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Audit log, notifications, subscriptions, reports
// ---------------------------------------------------------------------------

export const audit_logs = pgTable('audit_logs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  actor_user_id: text('actor_user_id'),
  action: text('action').notNull(), // create | update | delete | state_change | export
  entity_type: text('entity_type').notNull(),
  entity_id: text('entity_id'),
  detail: jsonb('detail').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const notifications = pgTable('notifications', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  category: text('category').notNull(), // gap | expiry | tia_overdue | adequacy_change | task | review
  title: text('title').notNull(),
  body: text('body'),
  entity_type: text('entity_type'),
  entity_id: text('entity_id'),
  read: boolean('read').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const country_subscriptions = pgTable('country_subscriptions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  country_id: text('country_id').notNull().references(() => countries.id),
  user_id: text('user_id').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.country_id, t.user_id)])

export const saved_reports = pgTable('saved_reports', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  name: text('name').notNull(),
  report_type: text('report_type').notNull(), // gaps_by_country | expiring | tia_completion | adequacy_exposure | audit_pack
  config: jsonb('config').$type<Record<string, unknown>>().default({}),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().default({}),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Billing (webhook-inspector pattern: text plan_id 'free'/'pro')
// ---------------------------------------------------------------------------

export const plans = pgTable('plans', {
  id: text('id').primaryKey(), // 'free' | 'pro'
  name: text('name').notNull(),
  price_cents: integer('price_cents').notNull().default(0),
})

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull().unique(),
  plan_id: text('plan_id').notNull().default('free'),
  stripe_customer_id: text('stripe_customer_id'),
  stripe_subscription_id: text('stripe_subscription_id'),
  status: text('status').notNull().default('active'),
  current_period_end: timestamp('current_period_end'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})
