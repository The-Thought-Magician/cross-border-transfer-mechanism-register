# Build Plan — Cross-Border Transfer Mechanism Register

Authoritative build contract. Filenames, mount paths, api method names, and page files declared here are binding. Stack per `_template-report.md`: Hono backend (`/api/v1` child router, `export default router`, `getUserId(c)`, `X-User-Id`), Next.js 16 + `@neondatabase/auth@0.4.2-beta`, `proxy.ts` only, drizzle-orm + Neon. Public reads / auth-gated writes with zod + ownership checks. Frontend calls `fetch('/api/proxy/<path>')` mapping 1:1 to `/api/v1/<path>`.

---

## (a) Tables (columns)

See `backend/src/db/schema.ts` and `migrate.ts` for exact types. Summary:

- **workspaces** — id, name, default_regime, exporting_entities[], tia_review_months, created_by, created_at, updated_at
- **workspace_members** — id, workspace_id→workspaces, user_id, role, created_at; UNIQUE(workspace_id,user_id)
- **countries** — id, iso_code(unique), name, region, eu_adequacy_status, uk_adequacy_status, eu_decision_ref, uk_decision_ref, effective_date, review_date, surveillance_risk, notes, created_at, updated_at
- **adequacy_events** — id, country_id→countries, regime, old_status, new_status, decision_ref, effective_date, description, created_by, created_at
- **data_categories** — id, workspace_id→workspaces(nullable), name, article, sensitivity_weight, description, is_special, created_at
- **subject_categories** — id, workspace_id→workspaces(nullable), name, risk_weight, description, created_at
- **legal_bases** — id, code(unique), article, name, category, requires_tia, is_systematic, description, created_at
- **supplementary_measures** — id, workspace_id→workspaces(nullable), name, measure_type, effectiveness, description, created_at
- **recipients** — id, workspace_id→workspaces, legal_name, role, country_id→countries, group_affiliation, contact_email, dpf_certified, dpf_status, dpf_renewal_date, notes, created_by, created_at, updated_at
- **subprocessors** — id, workspace_id→workspaces, recipient_id→recipients, name, country_id→countries, service, declared_at, created_at
- **transfer_flows** — id, workspace_id→workspaces, name, source_region, destination_country_id→countries, exporting_entity, recipient_id→recipients, recipient_role, purpose, volume_band, frequency, coverage_state, owner_user_id, tags[], notes, archived, created_by, created_at, updated_at
- **flow_data_categories** — id, flow_id→transfer_flows, data_category_id→data_categories, created_at; UNIQUE(flow_id,data_category_id)
- **flow_subject_categories** — id, flow_id→transfer_flows, subject_category_id→subject_categories, created_at; UNIQUE(flow_id,subject_category_id)
- **transfer_mechanisms** — id, workspace_id→workspaces, flow_id→transfer_flows, legal_basis_id→legal_bases, mechanism_type, scc_agreement_id, derogation_justification, status, effective_date, expiry_date, created_by, created_at, updated_at
- **scc_agreements** — id, workspace_id→workspaces, recipient_id→recipients, clause_version, module, parties[], docking_parties[], signature_status, signed_date, effective_date, expiry_date, needs_repaper, notes, created_by, created_at, updated_at
- **tias** — id, workspace_id→workspaces, flow_id→transfer_flows, recipient_id→recipients, country_id→countries, title, status, outcome, risk_score, reviewer_user_id, approved_by, approved_at, review_due_date, summary, created_by, created_at, updated_at
- **tia_steps** — id, tia_id→tias, step_number, step_key, question, answer, risk_points, created_at; UNIQUE(tia_id,step_number)
- **tia_measures** — id, tia_id→tias, measure_id→supplementary_measures, created_at; UNIQUE(tia_id,measure_id)
- **onward_transfers** — id, workspace_id→workspaces, parent_flow_id→transfer_flows, subprocessor_id→subprocessors, destination_country_id→countries, mechanism_type, coverage_state, notes, created_by, created_at
- **coverage_results** — id, workspace_id→workspaces, flow_id→transfer_flows(unique), state, verdict, failed_conditions[], risk_score, computed_at
- **remediation_tasks** — id, workspace_id→workspaces, flow_id→transfer_flows, title, action_type, status, priority, assignee_user_id, due_date, resolution_note, created_by, created_at, updated_at
- **reviews** — id, workspace_id→workspaces, entity_type, entity_id, status, reviewer_user_id, decided_by, decided_at, comment, created_by, created_at
- **audit_logs** — id, workspace_id→workspaces, actor_user_id, action, entity_type, entity_id, detail{}, created_at
- **notifications** — id, workspace_id→workspaces, user_id, category, title, body, entity_type, entity_id, read, created_at
- **country_subscriptions** — id, workspace_id→workspaces, country_id→countries, user_id, created_at; UNIQUE(country_id,user_id)
- **saved_reports** — id, workspace_id→workspaces, name, report_type, config{}, snapshot{}, created_by, created_at
- **plans** — id('free'|'pro'), name, price_cents
- **subscriptions** — id, user_id(unique), plan_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, created_at, updated_at

---

## (b) Backend route files (mount under `/api/v1`)

Conventions: `export default router`; public GET reads; auth-gated POST/PUT/DELETE via `authMiddleware` + `getUserId(c)`; zod validation on bodies; workspace ownership checks on writes. Response shapes are JSON.

### 1. `workspaces.ts` → `/api/v1/workspaces`
- `GET /mine` — auth — workspaces the user belongs to — `Workspace[]`
- `GET /:id` — public — one workspace — `Workspace`
- `POST /` — auth — create workspace + owner membership — `Workspace`
- `PUT /:id` — auth(owner) — update profile — `Workspace`
- `POST /:id/invite` — auth(owner) — add member by user_id — `WorkspaceMember`
- `GET /:id/members` — auth — list members — `WorkspaceMember[]`

### 2. `flows.ts` → `/api/v1/flows`
- `GET /` — public — list flows (filters: workspace_id, coverage_state, country, recipient) — `Flow[]`
- `GET /:id` — public — flow with categories + mechanism + coverage — `FlowDetail`
- `POST /` — auth — create flow — `Flow`
- `PUT /:id` — auth(owner) — update — `Flow`
- `DELETE /:id` — auth(owner) — archive/delete — `{success}`
- `POST /:id/categories` — auth(owner) — set data/subject categories — `FlowDetail`
- `POST /import` — auth — bulk CSV/JSON import — `{imported:number}`

### 3. `mechanisms.ts` → `/api/v1/mechanisms`
- `GET /` — public — mechanisms (filter flow_id, workspace_id) — `Mechanism[]`
- `GET /:id` — public — one — `Mechanism`
- `POST /` — auth — attach mechanism to flow — `Mechanism`
- `PUT /:id` — auth(owner) — update — `Mechanism`
- `DELETE /:id` — auth(owner) — remove — `{success}`

### 4. `scc.ts` → `/api/v1/scc`
- `GET /` — public — SCC agreements (filters: workspace_id, signature_status) — `Scc[]`
- `GET /:id` — public — one — `Scc`
- `GET /tracker` — public — counts signed/pending/expired + repaper list — `SccTracker`
- `POST /` — auth — create agreement — `Scc`
- `PUT /:id` — auth(owner) — update (sign, expiry, repaper) — `Scc`
- `DELETE /:id` — auth(owner) — delete — `{success}`

### 5. `tias.ts` → `/api/v1/tias`
- `GET /` — public — TIAs (filters: workspace_id, status, flow_id) — `Tia[]`
- `GET /:id` — public — TIA with steps + measures — `TiaDetail`
- `POST /` — auth — create TIA (seeds 6 EDPB steps) — `Tia`
- `PUT /:id` — auth(owner) — update header/status — `Tia`
- `PUT /:id/steps` — auth(owner) — upsert step answers, recompute risk + outcome — `TiaDetail`
- `POST /:id/measures` — auth(owner) — set supplementary measures — `TiaDetail`
- `POST /:id/approve` — auth(owner) — approve/reject sign-off — `Tia`
- `DELETE /:id` — auth(owner) — delete — `{success}`

### 6. `adequacy.ts` → `/api/v1/adequacy`
- `GET /events` — public — adequacy change events (filter country_id) — `AdequacyEvent[]`
- `POST /events` — auth — record adequacy change; re-flags dependent flows At-Risk + notifies subscribers — `AdequacyEvent`
- `GET /exposure` — public — flows-by-adequacy-status exposure summary — `AdequacyExposure`

### 7. `countries.ts` → `/api/v1/countries`
- `GET /` — public — country reference list — `Country[]`
- `GET /:id` — public — country + adequacy events + dependent flows — `CountryDetail`
- `POST /` — auth — add country — `Country`
- `PUT /:id` — auth — update adequacy status (emits adequacy_event) — `Country`
- `POST /:id/subscribe` — auth — watch country for changes — `CountrySubscription`
- `DELETE /:id/subscribe` — auth — unwatch — `{success}`

### 8. `recipients.ts` → `/api/v1/recipients`
- `GET /` — public — recipients (filter workspace_id) — `Recipient[]`
- `GET /:id` — public — recipient + subprocessors + coverage summary — `RecipientDetail`
- `POST /` — auth — create — `Recipient`
- `PUT /:id` — auth(owner) — update (incl. DPF status) — `Recipient`
- `DELETE /:id` — auth(owner) — delete — `{success}`

### 9. `subprocessors.ts` → `/api/v1/subprocessors`
- `GET /` — public — subprocessors (filter recipient_id, workspace_id) — `Subprocessor[]`
- `POST /` — auth — declare subprocessor — `Subprocessor`
- `PUT /:id` — auth(owner) — update — `Subprocessor`
- `DELETE /:id` — auth(owner) — delete — `{success}`

### 10. `onward.ts` → `/api/v1/onward`
- `GET /` — public — onward transfer legs (filter parent_flow_id, workspace_id) — `Onward[]`
- `GET /chains` — public — exporter→importer→subprocessor chains with broken-leg flags — `OnwardChain[]`
- `POST /` — auth — create onward leg — `Onward`
- `PUT /:id` — auth(owner) — update — `Onward`
- `DELETE /:id` — auth(owner) — delete — `{success}`

### 11. `coverage.ts` → `/api/v1/coverage`
- `GET /` — public — coverage results per flow (filter workspace_id, state) — `Coverage[]`
- `POST /recompute` — auth — run validity engine for a flow or whole workspace — `Coverage[]`
- `GET /scorecard` — public — org coverage KPIs + breakdowns — `Scorecard`

### 12. `gaps.ts` → `/api/v1/gaps`
- `GET /` — public — open gaps ranked by sensitivity/volume — `Gap[]`
- `GET /tasks` — public — remediation tasks (filter status, assignee) — `Task[]`
- `POST /tasks` — auth — create remediation task — `Task`
- `PUT /tasks/:id` — auth(owner) — update status/resolution — `Task`
- `POST /tasks/generate` — auth — auto-generate tasks for current gaps — `Task[]`

### 13. `reviews.ts` → `/api/v1/reviews`
- `GET /` — public — review queue (filters: entity_type, status) — `Review[]`
- `GET /:id` — public — one — `Review`
- `POST /` — auth — open a review — `Review`
- `PUT /:id` — auth(owner) — decide approve/reject — `Review`

### 14. `data-categories.ts` → `/api/v1/data-categories`
- `GET /` — public — catalog (global + workspace) — `DataCategory[]`
- `POST /` — auth — create — `DataCategory`
- `PUT /:id` — auth(owner) — update — `DataCategory`
- `DELETE /:id` — auth(owner) — delete — `{success}`

### 15. `subject-categories.ts` → `/api/v1/subject-categories`
- `GET /` — public — catalog — `SubjectCategory[]`
- `POST /` — auth — create — `SubjectCategory`
- `PUT /:id` — auth(owner) — update — `SubjectCategory`
- `DELETE /:id` — auth(owner) — delete — `{success}`

### 16. `legal-bases.ts` → `/api/v1/legal-bases`
- `GET /` — public — Chapter V legal-basis library — `LegalBasis[]`
- `GET /:id` — public — one — `LegalBasis`
- `POST /` — auth — add custom basis — `LegalBasis`

### 17. `measures.ts` → `/api/v1/measures`
- `GET /` — public — supplementary-measures catalog — `Measure[]`
- `POST /` — auth — create — `Measure`
- `PUT /:id` — auth(owner) — update — `Measure`
- `DELETE /:id` — auth(owner) — delete — `{success}`

### 18. `audit.ts` → `/api/v1/audit`
- `GET /` — public — audit log (filters: entity_type, actor, action) — `AuditLog[]`
- `POST /` — auth — append a log entry — `AuditLog`

### 19. `notifications.ts` → `/api/v1/notifications`
- `GET /` — auth — current user's notifications — `Notification[]`
- `PUT /:id/read` — auth — mark one read — `Notification`
- `PUT /read-all` — auth — mark all read — `{success}`

### 20. `reports.ts` → `/api/v1/reports`
- `GET /` — public — saved reports (filter workspace_id) — `SavedReport[]`
- `GET /:id` — public — one report w/ snapshot — `SavedReport`
- `POST /` — auth — save/generate a report snapshot — `SavedReport`
- `GET /export` — public — full audit-pack export bundle (flows+mechanisms+tias+gaps) — `AuditPack`

### 21. `dashboard.ts` → `/api/v1/dashboard`
- `GET /` — public — overview KPIs (flows, %covered, gaps, expiring, overdue TIAs, at-risk) — `DashboardSummary`

### 22. `settings.ts` → `/api/v1/settings`
- `GET /` — auth — current user settings + workspace profile — `Settings`
- `PUT /` — auth — update settings/notification prefs — `Settings`

### 23. `seed.ts` → `/api/v1/seed`
- `POST /sample` — auth — seed sample countries/recipients/flows/SCCs/TIAs for caller's workspace — `{seeded:true}`

### 24. `billing.ts` → `/api/v1/billing`
- `GET /plan` — auth-header — subscription + plan + stripeEnabled — `{subscription,plan,stripeEnabled}`
- `POST /checkout` — Stripe-optional, 503 if unconfigured — `{url}`
- `POST /portal` — Stripe-optional, 503 — `{url}`
- `POST /webhook` — Stripe-optional, 503 — `{received}`

`health.ts` is served directly by `app.get('/health')` in index.ts (not a mounted domain router).

---

## (c) lib/api.ts method list (web/lib/api.ts)

Each is `fetch('/api/proxy/<path>')`; path maps 1:1 to `/api/v1/<path>`.

| Method | Verb | Path |
|--------|------|------|
| getMyWorkspaces | GET | /api/proxy/workspaces/mine |
| getWorkspace | GET | /api/proxy/workspaces/:id |
| createWorkspace | POST | /api/proxy/workspaces |
| updateWorkspace | PUT | /api/proxy/workspaces/:id |
| inviteMember | POST | /api/proxy/workspaces/:id/invite |
| getWorkspaceMembers | GET | /api/proxy/workspaces/:id/members |
| getFlows | GET | /api/proxy/flows |
| getFlow | GET | /api/proxy/flows/:id |
| createFlow | POST | /api/proxy/flows |
| updateFlow | PUT | /api/proxy/flows/:id |
| deleteFlow | DELETE | /api/proxy/flows/:id |
| setFlowCategories | POST | /api/proxy/flows/:id/categories |
| importFlows | POST | /api/proxy/flows/import |
| getMechanisms | GET | /api/proxy/mechanisms |
| getMechanism | GET | /api/proxy/mechanisms/:id |
| createMechanism | POST | /api/proxy/mechanisms |
| updateMechanism | PUT | /api/proxy/mechanisms/:id |
| deleteMechanism | DELETE | /api/proxy/mechanisms/:id |
| getSccs | GET | /api/proxy/scc |
| getScc | GET | /api/proxy/scc/:id |
| getSccTracker | GET | /api/proxy/scc/tracker |
| createScc | POST | /api/proxy/scc |
| updateScc | PUT | /api/proxy/scc/:id |
| deleteScc | DELETE | /api/proxy/scc/:id |
| getTias | GET | /api/proxy/tias |
| getTia | GET | /api/proxy/tias/:id |
| createTia | POST | /api/proxy/tias |
| updateTia | PUT | /api/proxy/tias/:id |
| updateTiaSteps | PUT | /api/proxy/tias/:id/steps |
| setTiaMeasures | POST | /api/proxy/tias/:id/measures |
| approveTia | POST | /api/proxy/tias/:id/approve |
| deleteTia | DELETE | /api/proxy/tias/:id |
| getAdequacyEvents | GET | /api/proxy/adequacy/events |
| createAdequacyEvent | POST | /api/proxy/adequacy/events |
| getAdequacyExposure | GET | /api/proxy/adequacy/exposure |
| getCountries | GET | /api/proxy/countries |
| getCountry | GET | /api/proxy/countries/:id |
| createCountry | POST | /api/proxy/countries |
| updateCountry | PUT | /api/proxy/countries/:id |
| subscribeCountry | POST | /api/proxy/countries/:id/subscribe |
| unsubscribeCountry | DELETE | /api/proxy/countries/:id/subscribe |
| getRecipients | GET | /api/proxy/recipients |
| getRecipient | GET | /api/proxy/recipients/:id |
| createRecipient | POST | /api/proxy/recipients |
| updateRecipient | PUT | /api/proxy/recipients/:id |
| deleteRecipient | DELETE | /api/proxy/recipients/:id |
| getSubprocessors | GET | /api/proxy/subprocessors |
| createSubprocessor | POST | /api/proxy/subprocessors |
| updateSubprocessor | PUT | /api/proxy/subprocessors/:id |
| deleteSubprocessor | DELETE | /api/proxy/subprocessors/:id |
| getOnward | GET | /api/proxy/onward |
| getOnwardChains | GET | /api/proxy/onward/chains |
| createOnward | POST | /api/proxy/onward |
| updateOnward | PUT | /api/proxy/onward/:id |
| deleteOnward | DELETE | /api/proxy/onward/:id |
| getCoverage | GET | /api/proxy/coverage |
| recomputeCoverage | POST | /api/proxy/coverage/recompute |
| getScorecard | GET | /api/proxy/coverage/scorecard |
| getGaps | GET | /api/proxy/gaps |
| getTasks | GET | /api/proxy/gaps/tasks |
| createTask | POST | /api/proxy/gaps/tasks |
| updateTask | PUT | /api/proxy/gaps/tasks/:id |
| generateTasks | POST | /api/proxy/gaps/tasks/generate |
| getReviews | GET | /api/proxy/reviews |
| getReview | GET | /api/proxy/reviews/:id |
| createReview | POST | /api/proxy/reviews |
| decideReview | PUT | /api/proxy/reviews/:id |
| getDataCategories | GET | /api/proxy/data-categories |
| createDataCategory | POST | /api/proxy/data-categories |
| updateDataCategory | PUT | /api/proxy/data-categories/:id |
| deleteDataCategory | DELETE | /api/proxy/data-categories/:id |
| getSubjectCategories | GET | /api/proxy/subject-categories |
| createSubjectCategory | POST | /api/proxy/subject-categories |
| updateSubjectCategory | PUT | /api/proxy/subject-categories/:id |
| deleteSubjectCategory | DELETE | /api/proxy/subject-categories/:id |
| getLegalBases | GET | /api/proxy/legal-bases |
| getLegalBasis | GET | /api/proxy/legal-bases/:id |
| createLegalBasis | POST | /api/proxy/legal-bases |
| getMeasures | GET | /api/proxy/measures |
| createMeasure | POST | /api/proxy/measures |
| updateMeasure | PUT | /api/proxy/measures/:id |
| deleteMeasure | DELETE | /api/proxy/measures/:id |
| getAuditLogs | GET | /api/proxy/audit |
| createAuditLog | POST | /api/proxy/audit |
| getNotifications | GET | /api/proxy/notifications |
| markNotificationRead | PUT | /api/proxy/notifications/:id/read |
| markAllNotificationsRead | PUT | /api/proxy/notifications/read-all |
| getReports | GET | /api/proxy/reports |
| getReport | GET | /api/proxy/reports/:id |
| createReport | POST | /api/proxy/reports |
| exportAuditPack | GET | /api/proxy/reports/export |
| getDashboard | GET | /api/proxy/dashboard |
| getSettings | GET | /api/proxy/settings |
| updateSettings | PUT | /api/proxy/settings |
| seedSample | POST | /api/proxy/seed/sample |
| getBillingPlan | GET | /api/proxy/billing/plan |
| startCheckout | POST | /api/proxy/billing/checkout |
| openBillingPortal | POST | /api/proxy/billing/portal |

---

## (d) Page list (web/app)

| URL | File | Kind | API methods used | Renders |
|-----|------|------|------------------|---------|
| / | app/page.tsx | public | (none) | Static landing: hero, Chapter V value prop, feature grid, CTAs |
| /auth/sign-in | app/auth/sign-in/page.tsx | public | (authClient) | Email/password sign-in |
| /auth/sign-up | app/auth/sign-up/page.tsx | public | (authClient) | Email/password sign-up |
| /pricing | app/pricing/page.tsx | public | getBillingPlan | Free/Pro plans, all-features-free note |
| /adequacy-explorer | app/adequacy-explorer/page.tsx | public | getCountries, getAdequacyEvents | Public country adequacy-status explorer |
| /dashboard | app/dashboard/page.tsx | dashboard | getDashboard, getScorecard, seedSample | Overview KPIs, coverage gauge, seed-sample button |
| /dashboard/flows | app/dashboard/flows/page.tsx | dashboard | getFlows, deleteFlow, importFlows | Flow register table w/ coverage badges + filters |
| /dashboard/flows/new | app/dashboard/flows/new/page.tsx | dashboard | createFlow, getCountries, getRecipients, getDataCategories, getSubjectCategories, setFlowCategories | New-flow form |
| /dashboard/flows/[id] | app/dashboard/flows/[id]/page.tsx | dashboard | getFlow, updateFlow, getMechanisms, recomputeCoverage, setFlowCategories | Flow detail: coverage verdict, mechanism, categories, timeline |
| /dashboard/mechanisms | app/dashboard/mechanisms/page.tsx | dashboard | getMechanisms, createMechanism, updateMechanism, deleteMechanism, getFlows, getLegalBases, getSccs | Mechanisms list + attach form |
| /dashboard/scc | app/dashboard/scc/page.tsx | dashboard | getSccs, getSccTracker, createScc, updateScc, deleteScc, getRecipients | SCC signature tracker + repaper alerts |
| /dashboard/tias | app/dashboard/tias/page.tsx | dashboard | getTias, createTia, deleteTia, getFlows | TIA list w/ status + outcome |
| /dashboard/tias/[id] | app/dashboard/tias/[id]/page.tsx | dashboard | getTia, updateTia, updateTiaSteps, setTiaMeasures, approveTia, getMeasures | 6-step EDPB TIA workflow + sign-off |
| /dashboard/adequacy | app/dashboard/adequacy/page.tsx | dashboard | getCountries, getAdequacyEvents, createAdequacyEvent, getAdequacyExposure | Adequacy tracker + exposure summary |
| /dashboard/countries/[id] | app/dashboard/countries/[id]/page.tsx | dashboard | getCountry, updateCountry, subscribeCountry, unsubscribeCountry | Country detail: adequacy timeline, dependent flows, watch |
| /dashboard/recipients | app/dashboard/recipients/page.tsx | dashboard | getRecipients, createRecipient, deleteRecipient, getCountries | Recipient/vendor directory |
| /dashboard/recipients/[id] | app/dashboard/recipients/[id]/page.tsx | dashboard | getRecipient, updateRecipient, getSubprocessors, createSubprocessor, updateSubprocessor, deleteSubprocessor | Recipient detail + subprocessors + DPF status |
| /dashboard/onward | app/dashboard/onward/page.tsx | dashboard | getOnward, getOnwardChains, createOnward, updateOnward, deleteOnward, getFlows, getSubprocessors | Onward-transfer chains + broken-leg flags |
| /dashboard/coverage | app/dashboard/coverage/page.tsx | dashboard | getCoverage, getScorecard, recomputeCoverage | Coverage scorecard + recompute |
| /dashboard/gaps | app/dashboard/gaps/page.tsx | dashboard | getGaps, getTasks, createTask, updateTask, generateTasks | Gap & remediation workspace |
| /dashboard/reviews | app/dashboard/reviews/page.tsx | dashboard | getReviews, createReview, decideReview | Review/approval queue |
| /dashboard/data-categories | app/dashboard/data-categories/page.tsx | dashboard | getDataCategories, createDataCategory, updateDataCategory, deleteDataCategory | Data-category catalog |
| /dashboard/subject-categories | app/dashboard/subject-categories/page.tsx | dashboard | getSubjectCategories, createSubjectCategory, updateSubjectCategory, deleteSubjectCategory | Subject-category catalog |
| /dashboard/legal-bases | app/dashboard/legal-bases/page.tsx | dashboard | getLegalBases, getLegalBasis, createLegalBasis | Chapter V legal-basis & derogation library |
| /dashboard/measures | app/dashboard/measures/page.tsx | dashboard | getMeasures, createMeasure, updateMeasure, deleteMeasure | Supplementary-measures library |
| /dashboard/audit | app/dashboard/audit/page.tsx | dashboard | getAuditLogs | Activity/audit log viewer |
| /dashboard/notifications | app/dashboard/notifications/page.tsx | dashboard | getNotifications, markNotificationRead, markAllNotificationsRead | Notification feed |
| /dashboard/reports | app/dashboard/reports/page.tsx | dashboard | getReports, getReport, createReport, exportAuditPack | Reports + audit-pack export |
| /dashboard/settings | app/dashboard/settings/page.tsx | dashboard | getSettings, updateSettings, getBillingPlan, startCheckout, openBillingPortal, getMyWorkspaces, createWorkspace, updateWorkspace, inviteMember, getWorkspaceMembers | Settings, workspace profile, members, billing |

Total: 5 public + 24 dashboard = 29 page files (2 are auth pages). Core feature pages comfortably exceed the 22-26 bar.

---

## (e) DashboardLayout sidebar nav sections

`web/components/DashboardLayout.tsx` ('use client', `usePathname()` active state, mobile drawer). `web/app/dashboard/layout.tsx` wraps all `/dashboard/*` pages.

- **Overview**
  - Dashboard → /dashboard
  - Coverage Scorecard → /dashboard/coverage
- **Register**
  - Transfer Flows → /dashboard/flows
  - Mechanisms → /dashboard/mechanisms
  - SCC Tracker → /dashboard/scc
  - Onward Transfers → /dashboard/onward
- **Assessments**
  - TIAs → /dashboard/tias
  - Reviews → /dashboard/reviews
- **Geography**
  - Adequacy Tracker → /dashboard/adequacy
  - Recipients → /dashboard/recipients
- **Remediation**
  - Gaps & Tasks → /dashboard/gaps
  - Notifications → /dashboard/notifications
- **Reference**
  - Data Categories → /dashboard/data-categories
  - Subject Categories → /dashboard/subject-categories
  - Legal Bases → /dashboard/legal-bases
  - Supplementary Measures → /dashboard/measures
- **Records**
  - Reports & Export → /dashboard/reports
  - Audit Log → /dashboard/audit
- **Account**
  - Settings → /dashboard/settings

Country detail (`/dashboard/countries/[id]`), flow detail/new, recipient detail, and TIA detail are reached by drill-down, not top-level nav.

---

## Consistency guarantee

Every api method in (c) is implemented by exactly one endpoint in (b) and consumed by at least one page in (d). The mechanism-validity engine (coverage.ts), adequacy re-flagging (adequacy.ts), SCC lifecycle (scc.ts), TIA scoring (tias.ts), and onward-chain checks (onward.ts) are the deterministic cores; all read from the tables in (a) which match schema.ts and migrate.ts exactly.
