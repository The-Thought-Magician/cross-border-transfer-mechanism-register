import { db } from './index.js'
import { sql } from 'drizzle-orm'

// Self-provisioning schema for a fresh Neon DB. Each statement is idempotent
// (CREATE TABLE IF NOT EXISTS) and matches src/db/schema.ts column names/types
// exactly. Timestamps are timestamptz, JSON columns jsonb, floats real.

const statements: string[] = [
  `CREATE TABLE IF NOT EXISTS workspaces (
    id text PRIMARY KEY,
    name text NOT NULL,
    default_regime text NOT NULL DEFAULT 'EU',
    exporting_entities jsonb DEFAULT '[]'::jsonb,
    tia_review_months integer NOT NULL DEFAULT 12,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS workspace_members (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    role text NOT NULL DEFAULT 'member',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS countries (
    id text PRIMARY KEY,
    iso_code text NOT NULL UNIQUE,
    name text NOT NULL,
    region text,
    eu_adequacy_status text NOT NULL DEFAULT 'None',
    uk_adequacy_status text NOT NULL DEFAULT 'None',
    eu_decision_ref text,
    uk_decision_ref text,
    effective_date timestamptz,
    review_date timestamptz,
    surveillance_risk text NOT NULL DEFAULT 'unknown',
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS adequacy_events (
    id text PRIMARY KEY,
    country_id text NOT NULL REFERENCES countries(id),
    regime text NOT NULL DEFAULT 'EU',
    old_status text,
    new_status text NOT NULL,
    decision_ref text,
    effective_date timestamptz,
    description text,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS data_categories (
    id text PRIMARY KEY,
    workspace_id text REFERENCES workspaces(id),
    name text NOT NULL,
    article text,
    sensitivity_weight integer NOT NULL DEFAULT 1,
    description text,
    is_special boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS subject_categories (
    id text PRIMARY KEY,
    workspace_id text REFERENCES workspaces(id),
    name text NOT NULL,
    risk_weight integer NOT NULL DEFAULT 1,
    description text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS legal_bases (
    id text PRIMARY KEY,
    code text NOT NULL UNIQUE,
    article text NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    requires_tia boolean NOT NULL DEFAULT false,
    is_systematic boolean NOT NULL DEFAULT true,
    description text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS supplementary_measures (
    id text PRIMARY KEY,
    workspace_id text REFERENCES workspaces(id),
    name text NOT NULL,
    measure_type text NOT NULL,
    effectiveness text NOT NULL DEFAULT 'medium',
    description text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS recipients (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    legal_name text NOT NULL,
    role text NOT NULL DEFAULT 'processor',
    country_id text REFERENCES countries(id),
    group_affiliation text,
    contact_email text,
    dpf_certified boolean NOT NULL DEFAULT false,
    dpf_status text,
    dpf_renewal_date timestamptz,
    notes text,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS subprocessors (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    recipient_id text NOT NULL REFERENCES recipients(id),
    name text NOT NULL,
    country_id text REFERENCES countries(id),
    service text,
    declared_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS transfer_flows (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    name text NOT NULL,
    source_region text NOT NULL DEFAULT 'EEA',
    destination_country_id text REFERENCES countries(id),
    exporting_entity text,
    recipient_id text REFERENCES recipients(id),
    recipient_role text NOT NULL DEFAULT 'processor',
    purpose text,
    volume_band text NOT NULL DEFAULT 'medium',
    frequency text NOT NULL DEFAULT 'continuous',
    coverage_state text NOT NULL DEFAULT 'Under-Review',
    owner_user_id text,
    tags jsonb DEFAULT '[]'::jsonb,
    notes text,
    archived boolean NOT NULL DEFAULT false,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS flow_data_categories (
    id text PRIMARY KEY,
    flow_id text NOT NULL REFERENCES transfer_flows(id),
    data_category_id text NOT NULL REFERENCES data_categories(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (flow_id, data_category_id)
  )`,

  `CREATE TABLE IF NOT EXISTS flow_subject_categories (
    id text PRIMARY KEY,
    flow_id text NOT NULL REFERENCES transfer_flows(id),
    subject_category_id text NOT NULL REFERENCES subject_categories(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (flow_id, subject_category_id)
  )`,

  `CREATE TABLE IF NOT EXISTS transfer_mechanisms (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    flow_id text NOT NULL REFERENCES transfer_flows(id),
    legal_basis_id text REFERENCES legal_bases(id),
    mechanism_type text NOT NULL,
    scc_agreement_id text,
    derogation_justification text,
    status text NOT NULL DEFAULT 'active',
    effective_date timestamptz,
    expiry_date timestamptz,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS scc_agreements (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    recipient_id text REFERENCES recipients(id),
    clause_version text NOT NULL DEFAULT 'eu_2021',
    module integer,
    parties jsonb DEFAULT '[]'::jsonb,
    docking_parties jsonb DEFAULT '[]'::jsonb,
    signature_status text NOT NULL DEFAULT 'pending',
    signed_date timestamptz,
    effective_date timestamptz,
    expiry_date timestamptz,
    needs_repaper boolean NOT NULL DEFAULT false,
    notes text,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS tias (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    flow_id text REFERENCES transfer_flows(id),
    recipient_id text REFERENCES recipients(id),
    country_id text REFERENCES countries(id),
    title text NOT NULL,
    status text NOT NULL DEFAULT 'draft',
    outcome text,
    risk_score real,
    reviewer_user_id text,
    approved_by text,
    approved_at timestamptz,
    review_due_date timestamptz,
    summary text,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS tia_steps (
    id text PRIMARY KEY,
    tia_id text NOT NULL REFERENCES tias(id),
    step_number integer NOT NULL,
    step_key text NOT NULL,
    question text,
    answer text,
    risk_points real DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tia_id, step_number)
  )`,

  `CREATE TABLE IF NOT EXISTS tia_measures (
    id text PRIMARY KEY,
    tia_id text NOT NULL REFERENCES tias(id),
    measure_id text NOT NULL REFERENCES supplementary_measures(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tia_id, measure_id)
  )`,

  `CREATE TABLE IF NOT EXISTS onward_transfers (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    parent_flow_id text NOT NULL REFERENCES transfer_flows(id),
    subprocessor_id text REFERENCES subprocessors(id),
    destination_country_id text REFERENCES countries(id),
    mechanism_type text,
    coverage_state text NOT NULL DEFAULT 'Under-Review',
    notes text,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS coverage_results (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    flow_id text NOT NULL REFERENCES transfer_flows(id) UNIQUE,
    state text NOT NULL DEFAULT 'Under-Review',
    verdict text,
    failed_conditions jsonb DEFAULT '[]'::jsonb,
    risk_score real,
    computed_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS remediation_tasks (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    flow_id text REFERENCES transfer_flows(id),
    title text NOT NULL,
    action_type text,
    status text NOT NULL DEFAULT 'open',
    priority text NOT NULL DEFAULT 'medium',
    assignee_user_id text,
    due_date timestamptz,
    resolution_note text,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS reviews (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    status text NOT NULL DEFAULT 'draft',
    reviewer_user_id text,
    decided_by text,
    decided_at timestamptz,
    comment text,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS audit_logs (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    actor_user_id text,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    detail jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS notifications (
    id text PRIMARY KEY,
    workspace_id text REFERENCES workspaces(id),
    user_id text NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    body text,
    entity_type text,
    entity_id text,
    read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS country_subscriptions (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    country_id text NOT NULL REFERENCES countries(id),
    user_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (country_id, user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS saved_reports (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    name text NOT NULL,
    report_type text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb,
    snapshot jsonb DEFAULT '{}'::jsonb,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS plans (
    id text PRIMARY KEY,
    name text NOT NULL,
    price_cents integer NOT NULL DEFAULT 0
  )`,

  `CREATE TABLE IF NOT EXISTS subscriptions (
    id text PRIMARY KEY,
    user_id text NOT NULL UNIQUE,
    plan_id text NOT NULL DEFAULT 'free',
    stripe_customer_id text,
    stripe_subscription_id text,
    status text NOT NULL DEFAULT 'active',
    current_period_end timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
]

const indexes: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_adequacy_events_country ON adequacy_events(country_id)`,
  `CREATE INDEX IF NOT EXISTS idx_data_categories_workspace ON data_categories(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_subject_categories_workspace ON subject_categories(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_supplementary_measures_workspace ON supplementary_measures(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_recipients_workspace ON recipients(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_recipients_country ON recipients(country_id)`,
  `CREATE INDEX IF NOT EXISTS idx_subprocessors_workspace ON subprocessors(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_subprocessors_recipient ON subprocessors(recipient_id)`,
  `CREATE INDEX IF NOT EXISTS idx_transfer_flows_workspace ON transfer_flows(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_transfer_flows_recipient ON transfer_flows(recipient_id)`,
  `CREATE INDEX IF NOT EXISTS idx_transfer_flows_destination ON transfer_flows(destination_country_id)`,
  `CREATE INDEX IF NOT EXISTS idx_flow_data_categories_flow ON flow_data_categories(flow_id)`,
  `CREATE INDEX IF NOT EXISTS idx_flow_subject_categories_flow ON flow_subject_categories(flow_id)`,
  `CREATE INDEX IF NOT EXISTS idx_transfer_mechanisms_workspace ON transfer_mechanisms(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_transfer_mechanisms_flow ON transfer_mechanisms(flow_id)`,
  `CREATE INDEX IF NOT EXISTS idx_scc_agreements_workspace ON scc_agreements(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_scc_agreements_recipient ON scc_agreements(recipient_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tias_workspace ON tias(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tias_flow ON tias(flow_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tia_steps_tia ON tia_steps(tia_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tia_measures_tia ON tia_measures(tia_id)`,
  `CREATE INDEX IF NOT EXISTS idx_onward_transfers_workspace ON onward_transfers(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_onward_transfers_parent ON onward_transfers(parent_flow_id)`,
  `CREATE INDEX IF NOT EXISTS idx_coverage_results_workspace ON coverage_results(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_remediation_tasks_workspace ON remediation_tasks(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_remediation_tasks_flow ON remediation_tasks(flow_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_workspace ON reviews(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace ON audit_logs(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_workspace ON notifications(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_country_subscriptions_workspace ON country_subscriptions(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_saved_reports_workspace ON saved_reports(workspace_id)`,
]

export async function migrate() {
  for (const stmt of statements) {
    await db.execute(sql.raw(stmt))
  }
  for (const idx of indexes) {
    await db.execute(sql.raw(idx))
  }
  console.log('Migration complete')
}
