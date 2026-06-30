# Cross-Border Transfer Mechanism Register

## Overview

CrossBorderTransferMechanismRegister is a privacy-compliance platform that tracks every cross-border personal-data flow inside an organization and proves each one is covered by a valid Chapter V transfer mechanism (SCCs, adequacy decision, or BCRs) backed by a documented Transfer Impact Assessment (TIA). It is the system of record for the legal transfer layer: the register of flows, the mechanism that lawfully covers each flow, the TIA that justifies that mechanism, and the audit-ready export that a DPA examiner or accountability review can rely on.

The product answers one regulator question with evidence: "For this transfer of EU/UK personal data to this recipient in this third country, what is the lawful transfer mechanism, what supplementary measures apply, and where is the assessment that says it is adequate?" Every flow in the register resolves to a coverage state (Covered, Gap, Expiring, At-Risk) computed deterministically from the mechanism, its expiry, the destination's adequacy status, and the TIA outcome.

## Problem

Post-Schrems II (CJEU C-311/18, July 2020), every transfer of personal data from the EEA/UK to a third country requires (1) a valid transfer mechanism under GDPR Chapter V and (2), where that mechanism is the Standard Contractual Clauses or BCRs, a documented Transfer Impact Assessment evaluating the destination country's surveillance laws and any supplementary measures needed to bring protection up to an essentially-equivalent standard. "No valid transfer mechanism" and "transfers without a TIA" have drawn nine-figure DPA fines (Meta's EUR 1.2bn fine in 2023 being the headline). Adequacy decisions change (the EU-US Data Privacy Framework replaced Privacy Shield in 2023; the UK has its own adequacy regime), the 2021 SCCs replaced the 2010/2004 clauses with an 18-month re-paper deadline, and vendors constantly add new sub-processors in new regions. Most organizations track this in spreadsheets that go stale the moment a vendor changes a sub-processor or an adequacy decision is challenged.

DPOs and privacy counsel need a living register that (a) inventories every flow, (b) matches each flow to its lawful mechanism and flags any flow with no valid basis, (c) drives the TIA workflow so each SCC/BCR-based transfer has a current risk assessment, (d) watches adequacy decisions and re-flags affected flows when a decision changes or is invalidated, (e) tracks SCC signature, version, modules, and expiry with re-paper alerts, (f) maps onward (sub-processor) transfers so a vendor's re-export does not silently break coverage, and (g) exports the whole inventory for a DPA audit.

## Target Users

- **Data Protection Officers (DPOs)** at multinationals and EU/UK-data-handling companies who carry personal regulator accountability for Chapter V compliance.
- **Privacy counsel / legal** who draft and sign SCCs, run TIAs, and respond to DPA inquiries.
- **Privacy program managers** who maintain the transfer inventory, chase vendors for sub-processor disclosures, and prepare audit packs.
- **Vendor / TPRM teams** who onboard new processors and need to know whether a new vendor introduces an uncovered transfer.
- **Internal/external auditors** consuming the register as accountability evidence.

The buyer is the DPO or privacy counsel with a compliance budget and direct regulator exposure. ROI is fine avoidance: a documented, current transfer register with TIAs is the difference between a routine audit and a Chapter V enforcement action.

## Why This Is NOT an Existing Project

This product governs the **legal transfer-mechanism layer** (which lawful basis covers a flow, the TIA that justifies it, SCC/BCR/adequacy lifecycle), not data discovery or geography mapping. Named near-neighbors:

- **subprocessor-geography-graph** (sibling): discovers and graphs where vendor data physically lives. That is geography *discovery*; this is the *legal mechanism* that must cover any flow the graph reveals. This product consumes a flow's destination region but adds the SCC/adequacy/BCR + TIA layer the graph does not model.
- **deletion-locality-attestation** (sibling): proves erasure happened in a given locality. That is the *erasure* lifecycle; this is the *transfer* lifecycle. Different Chapter (Art. 17 vs Chapter V) and different evidence.
- **dpia-decision-engine** (nearest sibling in the portfolio): runs the Article 35 DPIA "is a DPIA required, and what's the outcome" decision. A DPIA is a *processing-risk* assessment; a TIA is a *transfer-risk* assessment under Chapter V. They are different legal instruments — a processing activity can need a DPIA but no transfer, or a transfer with a TIA but no DPIA. This product is the Chapter V transfer register and TIA engine, not the Article 35 engine.
- **Consent / data-residency platforms** (nearest corpus): manage consent capture or residency policy. Neither models the per-transfer lawful mechanism, the TIA surveillance-law analysis, or the SCC signature/expiry lifecycle.
- **Generic GRC / vendor-risk tools**: track vendors and controls generally; none provide the deterministic flow-to-mechanism validity engine, the adequacy-decision tracker that re-flags affected flows, or the SCC module/version/re-paper lifecycle that Chapter V specifically requires.

What is unique here: a deterministic **mechanism-validity engine** that, given a flow's source region, destination country, recipient role, data categories, and the attached mechanism, computes whether the flow is lawfully covered today; an **adequacy tracker** that, when a decision changes, automatically re-flags every dependent flow; a **TIA workflow** modeled on the EDPB six-step methodology with supplementary-measure capture; and an **onward-transfer map** so a sub-processor re-export is itself a tracked flow.

## Major Features

### 1. Transfer-Flow Register
The core inventory. Each flow records source region, destination country, exporting entity, importing recipient, recipient role (controller/processor/sub-processor), data categories, data-subject categories, transfer purpose, volume band, and frequency.
- Create, edit, archive, and clone flows.
- Per-flow coverage state (Covered / Gap / Expiring / At-Risk / Under-Review) computed by the validity engine.
- Bulk import flows from CSV and from the sample-data seeder.
- Flow tagging, owner assignment, and free-text notes.
- Flow timeline showing every state transition and linked event.
- Filter and search by region, country, recipient, coverage state, data category, owner.

### 2. Mechanism Validity Engine
The deterministic core. Given a flow and its attached transfer mechanism, decide whether the flow is lawfully covered.
- Rule set per mechanism type: adequacy (destination must have a current adequacy decision covering the data), SCCs (correct module for the controller/processor role pairing, signed, unexpired, TIA present and passing), BCRs (approved BCR covering the entities and categories), Article 49 derogation (occasional, documented).
- Per-flow validity verdict with the specific failed condition (e.g., "SCC module 2 required for C2P but module 1 attached", "adequacy decision invalidated", "TIA outcome = inadequate without supplementary measures").
- Recompute on demand and on any dependency change (mechanism edit, adequacy change, TIA completion).
- Gap report: every flow with no valid basis, ranked by data sensitivity and volume.
- Coverage scorecard: organization-wide % of flows covered.

### 3. Transfer Impact Assessment (TIA) Workflow
EDPB six-step methodology captured as a structured workflow.
- TIA per flow (or per recipient+country): identify the transfer, identify the mechanism, assess destination law (surveillance/government-access regime), assess effectiveness in practice, identify supplementary measures, document the conclusion.
- Step-by-step questionnaire with weighted risk scoring producing an outcome (Adequate / Adequate-with-measures / Inadequate).
- Supplementary-measures library (technical: encryption, pseudonymization, split processing; contractual; organizational) attachable to a TIA.
- Reviewer assignment, draft/in-review/approved status, and sign-off with timestamp and approver identity.
- TIA review cadence (e.g., annual) with due-date tracking and re-assessment prompts.
- Clone a prior TIA for a similar transfer.

### 4. Adequacy-Status Tracker
Authoritative list of third countries and their adequacy posture from the data exporter's perspective (EU and UK regimes tracked separately).
- Country records: adequacy status (Adequate / Partial / None / Invalidated), decision reference, effective and review dates, regime (EU / UK), notes.
- Adequacy-change events: when a status changes, every flow relying on that country's adequacy is automatically re-flagged At-Risk and queued for review.
- Subscription: owners watching a country get notified on change.
- Timeline of historical adequacy changes per country.

### 5. SCC Module & Signature Tracker
Lifecycle for Standard Contractual Clauses agreements.
- SCC record: clause version (2021 EU SCCs / UK IDTA / UK Addendum / legacy 2010), module (1 C2C, 2 C2P, 3 P2P, 4 P2C), parties, signature status and date, effective date, expiry/review date, docking-clause parties, linked flows.
- Re-paper alerts: legacy-clause agreements flagged for migration; expiring agreements flagged ahead of expiry.
- Signature tracker dashboard: signed / pending / expired counts.
- Attach an SCC to one or more flows; the validity engine checks module-vs-role correctness.

### 6. Onward-Transfer Mapping
Model sub-processor re-exports so a vendor's onward transfer is itself a tracked flow.
- Recipient (vendor) records with their declared sub-processors and sub-processor regions.
- Derive onward flows: a flow to a processor that re-exports to a sub-processor in a third country creates a child onward flow needing its own coverage.
- Onward-transfer chain visualization (exporter -> importer -> sub-processor).
- Flag broken chains where an onward leg has no mechanism.

### 7. Recipient / Vendor Directory
Registry of importing parties.
- Recipient records: legal name, role, country, group affiliation, contact, declared sub-processors, DPF certification status (for US recipients).
- Link recipients to flows and SCCs.
- Per-recipient coverage summary.

### 8. Regulator / Audit Export
Produce an audit-ready pack of the transfer inventory.
- Export the full register, mechanisms, and TIAs as a structured JSON/CSV bundle.
- Generated audit-pack record (snapshot at a point in time) with a manifest of included flows, mechanisms, TIAs, and gaps.
- Article 30(1)/(2)-style records-of-processing transfer section export.
- Per-flow evidence dossier: flow + mechanism + TIA + adequacy context.

### 9. Coverage Dashboard & Scorecard
Executive view of Chapter V health.
- KPIs: total flows, % covered, open gaps, expiring mechanisms, overdue TIAs, at-risk flows from adequacy changes.
- Coverage trend over time.
- Breakdown by destination country, recipient, data category.

### 10. Gap & Remediation Workspace
Operational queue for fixing uncovered flows.
- Auto-generated remediation tasks for each gap (e.g., "attach SCC", "complete TIA", "confirm adequacy").
- Task assignment, status, due date, and resolution note.
- Bulk-remediate similar gaps.

### 11. Alerts & Notifications
- Per-user notification feed for: new gaps, expiring SCCs, overdue TIAs, adequacy changes affecting watched countries, assigned tasks/reviews.
- Mark-read / mark-all-read.
- Notification preferences per category.

### 12. Data-Category Catalog
- Catalog of personal-data categories (basic identifiers, special-category Art. 9 data, criminal Art. 10 data, financial, location, etc.) with sensitivity weighting used by the validity engine and TIA scoring.
- Map categories to flows.

### 13. Data-Subject Category Catalog
- Catalog of data-subject types (customers, employees, prospects, children, patients) with risk weighting.
- Map to flows; children/patients raise TIA risk.

### 14. Legal-Basis & Derogation Library
- Reference library of Chapter V bases: Art. 45 adequacy, Art. 46 SCCs/BCRs, Art. 47 BCRs, Art. 49 derogations (consent, contract necessity, important reasons of public interest, occasional).
- Attach a derogation to a flow with required justification fields; validity engine treats derogations as occasional/non-systematic.

### 15. Supplementary-Measures Library
- Curated catalog of technical, contractual, and organizational supplementary measures with descriptions and effectiveness notes.
- Reusable across TIAs; selecting measures feeds TIA outcome computation.

### 16. Review & Approval Workflow
- Generic review queue spanning TIAs, SCCs, and high-risk flows.
- Multi-state status (draft, in-review, approved, rejected) with approver and timestamp.
- Audit trail of approvals.

### 17. Activity & Audit Log
- Immutable append-only log of every create/update/delete/state-change across flows, mechanisms, TIAs, adequacy records.
- Filter by entity, actor, action, date.
- Feeds the audit export.

### 18. Sample-Data Seeder & Demo Mode
- Built-in seeder populating realistic countries, recipients, flows, SCCs, TIAs, and adequacy records so the product is demoable immediately.
- Public read access to seeded reference data (countries, legal bases, supplementary measures, data categories).

### 19. Reporting & Analytics
- Saved reports: gaps-by-country, expiring-mechanisms-next-90-days, TIA-completion-rate, adequacy-exposure.
- Time-series coverage analytics.
- Exportable report payloads.

### 20. Settings, Org Profile & Billing
- Org profile: exporting entities, default regime (EU/UK), default review cadences.
- User settings and notification preferences.
- Billing: all features free for signed-in users; Stripe optional and returns 503 when unconfigured. Plans (free/pro) and subscription state tracked for future use.

### 21. Workspace & Membership
- Per-workspace scoping of all data; users belong to a workspace.
- Workspace creation, invite, and membership roles (owner/member).

### 22. Recipient DPF & Certification Tracking
- Track Data Privacy Framework (and successor) certification for US recipients, with self-certification status and renewal date, feeding the adequacy/validity engine for US flows.

## Data Model (Tables)

- `workspaces` — tenant container.
- `workspace_members` — user-to-workspace membership with role.
- `countries` — third-country reference with adequacy status per regime.
- `adequacy_events` — adequacy-status change history per country.
- `recipients` — importing parties / vendors.
- `subprocessors` — declared sub-processors of a recipient.
- `data_categories` — personal-data category catalog with sensitivity weight.
- `subject_categories` — data-subject category catalog with risk weight.
- `legal_bases` — Chapter V legal-basis reference library.
- `supplementary_measures` — measures catalog.
- `transfer_flows` — the core flow register.
- `flow_data_categories` — join: flows to data categories.
- `flow_subject_categories` — join: flows to subject categories.
- `transfer_mechanisms` — SCC/BCR/adequacy/derogation instances attached to flows.
- `scc_agreements` — SCC-specific lifecycle records.
- `tias` — Transfer Impact Assessments.
- `tia_steps` — per-step answers within a TIA.
- `tia_measures` — join: TIAs to supplementary measures.
- `onward_transfers` — derived sub-processor re-export legs.
- `coverage_results` — latest validity-engine verdict per flow.
- `remediation_tasks` — gap remediation queue.
- `reviews` — generic review/approval records.
- `audit_logs` — append-only activity log.
- `notifications` — per-user notification feed.
- `country_subscriptions` — users watching a country for adequacy changes.
- `saved_reports` — saved report definitions/snapshots.
- `plans` — billing plans (free/pro).
- `subscriptions` — per-user subscription state.

## API Surface (high level)

REST under `/api/v1`, public reads / auth-gated writes, ownership checks on workspace-scoped data. Domains: flows, mechanisms, scc, tias, adequacy, countries, recipients, subprocessors, onward, coverage, gaps/remediation, reviews, data-categories, subject-categories, legal-bases, measures, audit, notifications, reports, dashboard, workspaces, settings, billing, seed.

## Frontend Pages (~24)

Public: landing, sign-in, sign-up, pricing, public adequacy explorer.
Dashboard: overview, flows list, flow detail, new flow, mechanisms, SCC tracker, TIAs list, TIA detail/workflow, adequacy tracker, country detail, recipients, recipient detail, onward-transfer map, coverage scorecard, gaps & remediation, reviews, data categories, subject categories, legal bases, supplementary measures, audit log, notifications, reports, settings.
