# KSHETRA — Step 8C-A: Frontend Integration Audit
## Exposure + Priority UI integration design, and a government-grade UX/UI audit

**Status: AUDIT/DESIGN ONLY.** No frontend file, backend file, or AppContext/types file was created or
modified in this step. `docs/step8c-frontend-integration-audit.md` is the sole deliverable. Checkpoint
audited against: `df2bd8c — Implement exposure and priority engine` (working tree clean at time of audit).

---

## 1. Executive summary

KSHETRA's frontend is a single-page, tab-switched React app (no router) with a genuinely disciplined,
already-institutional design system (`src/components/ui/*`, `src/styles/tokens.css`) and a strict
"never claim what didn't happen" convention already proven twice — once for prediction (`live-model` vs
`demo-fallback` badges) and once for government connectivity (`SystemStatusIndicator.tsx`). This is a much
better starting point than a typical hackathon dashboard; the main visual-maturity gaps are narrow
(emoji-as-status-icon, sub-12px type, a few hardcoded/unbound demo numbers), not structural.

Two findings should gate the Step 8C-B decision:

1. **The Step 8B API is read-only and currently empty for every real seeded case.** No write/recompute
   endpoint exists, and nothing in `backend/seed.py` calls `assess_and_persist_for_case` for the demo
   project's real parcels — `backend/exposure/demo_scenarios.py`'s eight scenarios are explicitly
   **not persisted** to `kshetra.db` (its own docstring: they'd violate the FK-enforced `parcels` table).
   A frontend built against this API today will correctly render an honest "no assessment yet" empty
   state for P-0245 and every other seeded parcel, not live exposure/priority data. This is not a bug to
   route around in Step 8C — it is a real gap that needs its own decision (§15, §18) before Step 8C-B can
   show anything but empty states end-to-end.
2. **The response contract deliberately withholds interpretation, not just data.** `component_trace` is
   `Dict[str, Any]` (no typed wire contract), `primary_blocker_id`/`secondary_blocker_ids` are bare
   strings (no inlined blocker text unless the caller separately resolves them), and several concepts the
   task brief names — "legal consequence", "possession impact", "downstream status" — do not exist as
   literal field names; they exist as banded numeric proxies inside `component_trace` (§7). A frontend
   that free-translates `legal_band: 3.0` into a sentence risks fabricating certainty the backend
   deliberately did not commit to. The UI must display these as labeled, sourced numbers/bands — not
   prose the backend never produced.

Given both, this audit's verdict (§23) is a **qualified approve**: Step 8C-B (types + service layer) can
proceed now, because it only needs the real, stable API contract documented in §7. Step 8C-C (Priority
Queue) should not be scheduled until there is a decision on how real exposure data gets into `kshetra.db`
for the demo project — otherwise the flagship new screen ships permanently empty.

---

## 2. Current frontend architecture

- **No `src/pages/`, no router.** `App.tsx` renders one `MainLayout` that conditionally mounts one of ten
  view components based on `AppContext.activeTab` (`App.tsx:48-57`), a plain string state, not a URL.
  Global overlays — `ParcelDetailModal`, `NotificationsDrawer`, `LoginModal`, `GuidedTour` — are mounted
  once at the `MainLayout` level (`App.tsx:61-74`) and controlled by AppContext state
  (`selectedParcel`, drawer/modal booleans), not by route params.
- **State**: one context, `src/context/AppContext.tsx` (1520 lines), holding *all* app state — no Redux,
  no Zustand, no React Query. Every list (`parcels`, `alerts`, `actions`, `alignments`, `projects`,
  `auditLogs`) is `useState` seeded from `localStorage` (keys prefixed `bhu_drishti_*`,
  `AppContext.tsx:172-183`) and re-persisted via matching `useEffect`s (`AppContext.tsx:356-389`).
  Data mutation is on-demand (button click → async function → `setState` → `useEffect` persists) — there
  is no polling loop except two independent 15s/20s `/health` checks
  (`PredictiveAnalyticsView.tsx:53-68`, `SystemStatusIndicator.tsx:61-83`) and no query cache to invalidate.
- **Two backend-facing service files, cleanly separated by concern**:
  - `src/services/mlApiService.ts` — the ML `/predict` and `/health` contract only. Owns
    `FASTAPI_BASE_URL` (`import.meta.env.VITE_API_BASE_URL`, default `http://127.0.0.1:8000`,
    `mlApiService.ts:33-35`). **Protected file (§14).**
  - `src/services/apiClient.ts` (1007 lines) — a generic typed CRUD client over the persistence routers
    (`/api/projects`, `/api/parcels`, `/api/alerts`, `/api/case-actions`, `/api/audit-logs`,
    `/api/.../predictions`). Built around one shared `apiFetch<T>(path, options)` helper
    (`apiClient.ts:90-140`): 10s `AbortController` timeout, uniform `ApiError` class carrying an HTTP
    `status` (0 = network/unreachable, distinguished from a real 4xx/5xx), and a FastAPI-shaped
    `extractErrorMessage` that already understands both `{"detail": ...}` (`HTTPException`) and
    `{"error": {message, hint}}` shapes (`apiClient.ts:60-83`). Each resource gets hand-written
    `listX`/`getX`/`createX`/`updateX`/`deleteX` functions plus a `mapXFromApi`/`mapXToApi` pair at the
    snake_case↔camelCase boundary (module docstring, `apiClient.ts:1-22`).
  - **Neither file currently calls `/api/legal/*` or `/api/blockers/*` or `/api/exposure/*`.** Those three
    routers (statutory clock, blocker engine, exposure/priority engine) exist and are mounted in
    `backend/main.py` but have **zero frontend consumers today** — confirmed by grep across
    `apiClient.ts`/`mlApiService.ts`/`apiSimulation.ts` for `legal`, `blocker`, `exposure`. Step 8C is not
    "wire up the last mile of an already-connected feature"; it is the first frontend code that will ever
    call any of these three backends.
- **Design system**: `src/components/ui/colors.ts` centralizes one `AccentColor` union (`blue, navy, teal,
  indigo, purple, emerald, amber, red, neutral`) mapped to Tailwind class bundles (tile/badge/text/edge/
  surface/dot/hoverBorder), consumed by `Badge`, `IconTile`, `KpiCard`, `SectionHeading`, `Card`. Color
  *meaning* is already documented and consistent: blue=primary/info, navy=institutional chrome, teal=GIS,
  indigo=AI, purple=gov-sync/integrations, emerald=success/low-risk, amber=warning/medium,
  red=danger/high (`colors.ts:19-29`, `tokens.css:19-29`). Palette values live in
  `src/styles/tokens.css` as Tailwind v4 `@theme` tokens (`--color-blue-600`, etc.), which **override**
  Tailwind's built-in `blue`/`red`/`slate`/etc. scale project-wide (`tokens.css:11-17`) — this is why
  every `bg-blue-600` in the app resolves to KSHETRA's institutional blue (`#1769E0`), not Tailwind's stock
  blue.
  - **Note (minor, flag for cleanup, not blocking)**: `tailwind.config.js:9-38` *also* defines a
    `navy`/`gov`/`risk` color extension in the legacy Tailwind v3 style. Since `tokens.css`'s `@theme`
    values win for any name Tailwind already owns (`navy`, and anything under `red`/`emerald`/`amber` if
    those keys collide), and nothing in the ~20 components read grepped in this audit referenced `gov-*`
    or `risk-*` classes, this file is very likely dead/superseded config left over from an earlier design
    pass. It is not wired into anything Step 8C touches, but two sources of truth for "navy" is worth a
    P2 cleanup ticket.

---

## 3. Existing screens & components

| Nav item (`config/roles.ts`) | Component | One-line purpose |
|---|---|---|
| Executive Dashboard | `DashboardView.tsx` | Hero banner + role focus panel + 8 KPI tiles + 2 charts + high-risk table + bottleneck card |
| Land Parcels | `ParcelsView.tsx` | Filterable/sortable parcel table, row → dossier |
| GIS Cadastral Map | `GisMapView.tsx` | Leaflet map, parcels colored by risk, route editing (planner) |
| Predictive Analytics (AI) | `PredictiveAnalyticsView.tsx` | The primary ML prediction console |
| Gov Data Sources | `GovDataSyncView.tsx` | Simulated integration walkthrough (Bhoomi/e-Courts/Bhuvan) |
| Early Warning Alerts | `AlertsView.tsx` | Alert feed, assign/resolve |
| Case & Action Tracker | `ActionsView.tsx` | Kanban/list of `CaseAction`s |
| Corridor Route Analysis | `CorridorAnalysisView.tsx` | Alignment comparison (planner) |
| Generate Reports | `ReportGeneratorView.tsx` | Report generation |
| System Settings | `SettingsView.tsx` | Risk thresholds, notification prefs |

Global overlay: `ParcelDetailModal.tsx` — the parcel "dossier", reachable from Dashboard's table, every
`ParcelsView` row, `AlertsView`'s "Review Case", `ActionsView`'s "Dossier"/parcel links, and the GIS map's
parcel inspector — always via `AppContext.openParcelDetail(parcelId)`.

Nav visibility, order, and per-item accent color/badge are centralized in `src/config/roles.ts`
(`NAV_ITEM_DEFINITIONS`, `ROLES[role].navItemIds`) — not hardcoded per-component. Three roles exist
(`collector`, `cala`, `planner`, `types/index.ts:1`), each with a different `navItemIds` subset and a
different `RoleFocusPanel.tsx` KPI-card section on the Dashboard (§9 candidate slot).

---

## 4. Current prediction/risk presentation

Two **parallel, deliberately-disambiguated** risk concepts already coexist — this pattern is the template
Exposure/Priority must follow, not a competitor to unify away:

1. **Catalogued/indicative parcel fields** — `Parcel.delayRiskScore` / `riskLevel` / `predictedDelayRange`
   / `topRiskFactor` / `shapFactors` (`types/index.ts:222-230`). Demo/seed data, drives the `ParcelsView`
   table, GIS map polygon colors, and Dashboard KPI tiles. `ParcelDetailModal.tsx:304-309` explicitly
   labels this "a parcel-level indicator from the case register, **not** an AI prediction."
2. **The real ML prediction** — `ProjectPrediction` (`types/index.ts:82-148`): `delayProbability`,
   `delayRiskScore`, `riskLevel`, `shapFactors`, `survivalAnalysis` (Cox), `predictionMode`
   (`'live-model' | 'demo-fallback'`). Produced only by `AppContext.runProjectDelayPrediction()` (one
   prediction per *project*, not per parcel — the model is trained case/project-level). Surfaced in
   exactly two places: `ParcelDetailModal`'s **Project AI Prediction** tab
   (`ParcelDetailModal.tsx:550-769`) and `PredictiveAnalyticsView.tsx` (the "primary" console,
   lines 163-382).

Concretely, probability/risk/SHAP/explanation render as:
- **Headline card** (navy, `ParcelDetailModal.tsx:596-635`; light, `PredictiveAnalyticsView.tsx:241-271`):
  delay probability %, risk classification word (HIGH/MEDIUM/LOW), risk score /100, Cox relative hazard ×.
- **SHAP**: a list of colored-dot rows (severity → red/amber/blue dot), factor name, description, signed
  `impactPercent` ("+38%"/"−12%"), raw log-odds in small mono text
  (`ParcelDetailModal.tsx:647-683`) — plus a horizontal bar chart (Recharts) in
  `PredictiveAnalyticsView.tsx:476-494` that falls back to an `illustrativeShapData` reference set
  (clearly separate variable, never silently mixed with live data) until a real prediction exists
  (`PredictiveAnalyticsView.tsx:76-95`).
- **Cox survival**: hazard tier, "model median delay-free" milestone, a 5-cell S(t) grid
  (`ParcelDetailModal.tsx:691-753`).
- **Mode honesty**: a small pill reading "Demo fallback · synthetic data" vs "Local engine · synthetic
  data" (`ParcelDetailModal.tsx:602-604`); a full amber banner when `predictionMode === 'demo-fallback'`
  (`PredictiveAnalyticsView.tsx:228-236`); backend `/health` polled live for an "Available/Unavailable" +
  "Live model/Demo fallback" status pair (`PredictiveAnalyticsView.tsx:426-446`,
  `SystemStatusIndicator.tsx:61-83`). **This exact pattern — a small always-visible provenance pill, never
  a silent substitution — is what `gis_downstream_status: "NOT_COMPUTED"` and `confidence_label` need in
  the Exposure/Priority UI (§11).**
- Failure/loading/empty states are explicit and never destructive: a failed call shows an amber banner +
  Retry and **keeps the last good values on screen** (`ParcelDetailModal.tsx:561-576`,
  `PredictiveAnalyticsView.tsx:201-219`) — matches the `[[prediction-architecture]]` memory rule.

---

## 5. Existing project/parcel flow

Single active project at a time (`AppContext.project`, derived from `selectedProjectId` +
`projects[]`); a planner can create/switch projects via `ProjectPlannerManagement.tsx`/`NewProjectModal.tsx`
(Dashboard, planner role only) — there is no project switcher in the main nav for other roles.

Parcel drill-down is uniform everywhere: click a row/marker/link → `openParcelDetail(parcelId)` →
`ParcelDetailModal` opens with **6 tabs, in this fixed order** (`ParcelDetailModal.tsx:181-241`):

1. **Overview** — stage, compensation, litigation summary, cadastral/ownership key-value grids, co-owners.
2. **Bhoomi / Land Records** (`govrecords`) — revenue record, labeled "Simulated Integration (Demo)".
3. **e-Courts Legal Status** (`ecourts`) — court case dossier, labeled "Simulated Integration (Demo)".
4. **Project AI Prediction** (`ai`) — the `ProjectPrediction` display described in §4.
5. **What-If Sandbox** (`whatif`) — parcel-level heuristic scenario toggles, explicitly labeled
   "SCENARIO — LOCAL HEURISTIC... not the ML model" (`ParcelDetailModal.tsx:843-848`).
6. **Case Actions** (`actions`) — `CaseAction`s filtered to this parcel.

**There is no "Statutory Clock" tab and no "Blocker" tab today.** The e-Courts tab shows a *court case*
record (a data source), which is related to but not the same thing as a B1 statutory-clock blocker or a
`StatutoryClockResult` — those backend concepts (`/api/legal/clocks`, `/api/blockers`) are entirely
unsurfaced in this modal. This matters directly for §10 (explanation flow): the chain the task wants
users to see (Prediction → Statutory Clock → Blocker → Exposure → Priority → Owner → Action) currently has
two invisible links (Statutory Clock, Blocker) between two visible ones (Prediction, Action).

---

## 6. Existing alert/action flow

`Alert` (`types/index.ts:327-343`): `level` (`CRITICAL|HIGH|MEDIUM|INFO`), `title`, `trigger`, `reason`,
`recommendedAction` (free text), `status` (`Active|Assigned|In Progress|Escalated|Resolved`),
`assignedTo?`. Rendered as a card feed (`AlertsView.tsx:125-224`) with severity filter tabs, a
"Recommended Action" line inline in the card body, and Review Case / Assign Officer / Mark Resolved
buttons. **No `blocker_id`, no `exposure_assessment_id`, no numeric priority score anywhere on `Alert`** —
today's "priority" signal is just the `level` string.

`CaseAction` (`types/index.ts:345-360`): `actionType` (closed enum of 6 categories), `assignedOfficer`,
`assignedOfficerRole`, **`priority: 'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'`**, `status`
(`Pending|In Progress|Completed|Escalated`), `dueDate`, `notes`, `targetDelayReductionMonths`. Rendered as
a Kanban board (3 columns) or list table (`ActionsView.tsx:134-306`), and again inline inside
`ParcelDetailModal`'s Case Actions tab.

**Naming-collision risk to carry into Step 8C-B (see also §15):** there are already **two** independent
`CRITICAL|HIGH|MEDIUM|LOW` "priority" fields in the type system —
`Parcel.priority` (`types/index.ts:240`, intervention priority) and `CaseAction.priority`
(`types/index.ts:353`, action urgency) — both rendered with the exact same red/amber badge styling. The
new backend `PriorityBand` is a **different four-value scale** (`WATCH|MONITOR|SOON|ACT_NOW`,
`enums.py:41-49`). Reusing the word "Priority" for a third, differently-scaled concept, styled the same
red/amber way, will read to an officer as "yet another priority number that disagrees with the other two."
§9/§11/§20 treat this as a P0 terminology/visual-distinction requirement, not a cosmetic nit.

Owner/action is already present today at the alert/action level (`assignedTo`, `assignedOfficer`,
`recommendedAction`/`notes`) — but it is manually entered by an officer through a form, never derived from
a blocker's `owner_role`/`responsible_authority`. There is no existing UI location that reads a
machine-computed owner or recommended action; that is new (§7, §9).

---

## 7. Step 8B API mapping (exact fields — nothing invented)

All 7 exposure endpoints are `GET`-only, mounted in `backend/main.py:201-203`
(`backend/routers/exposure.py`):

| Method & path | Query params | Response schema |
|---|---|---|
| `GET /api/exposure` | `project_id`, `parcel_id`, `case_reference`, `min_band` (LOW\|MODERATE\|HIGH\|CRITICAL), `latest_only=true` | `List[ExposureAssessmentRead]` |
| `GET /api/exposure/priority-queue` | `project_id`, `limit`, `min_band` (WATCH\|MONITOR\|SOON\|ACT_NOW) | `List[ExposureAssessmentWithContextRead]`, ranked `priority_score` desc, tie-broken by `case_reference` |
| `GET /api/exposure/{assessment_id}` | — | `ExposureAssessmentWithContextRead` (404 if missing) |
| `GET /api/projects/{project_id}/exposure` | — | `List[ExposureAssessmentRead]` |
| `GET /api/projects/{project_id}/exposure/latest` | — | `ExposureAssessmentWithContextRead \| null` |
| `GET /api/parcels/{parcel_id}/exposure` | — | `List[ExposureAssessmentRead]` |
| `GET /api/parcels/{parcel_id}/exposure/latest` | — | `ExposureAssessmentWithContextRead \| null` |

**No write endpoint, no recompute-on-demand endpoint.** Assessments are created only by
`exposure/db_crud.py`'s `assess_and_persist_for_case`, called from a script/seed context
(`routers/exposure.py:10-14` docstring) — never through HTTP. See §15 for what this means in practice.

Both `project_id` and `parcel_id` are optional/nullable on the same record
(`ExposureAssessmentRead.project_id`/`parcel_id`, `db_schemas.py:23-24`) and separate project-scoped and
parcel-scoped convenience routes exist — **the design already anticipates project-level assessments, not
just parcel-level**, matching how `ProjectPrediction` itself is project-scoped (§4).

### Field-by-field mapping to the concepts named in the task brief

| Requested concept | Exact field(s) | Type | Exists as named? |
|---|---|---|---|
| Exposure score | `exposure_score` | `float` (0–100) | Yes, literally |
| Exposure band | `exposure_band` | `str` — `LOW\|MODERATE\|HIGH\|CRITICAL` (`ExposureBand`, `enums.py:30-38`) | Yes, literally |
| Priority score | `priority_score` | `float` (0–100) | Yes, literally |
| Priority band | `priority_band` | `str` — `WATCH\|MONITOR\|SOON\|ACT_NOW` (`PriorityBand`, `enums.py:41-49`) | Yes, literally |
| Primary blocker | `primary_blocker_id` | `str \| null` — **an ID only**, no inlined blocker record | Partially — id exists, human-readable blocker text does not (would need a separate `GET /api/blockers/{id}` call, which no frontend service makes today) |
| Secondary blockers | `secondary_blocker_ids` | `List[str]` — **IDs only** | Partially, same caveat |
| Confidence | `confidence_label` | `str` — `VERIFIED\|PARTIAL\|NEEDS_VERIFICATION\|INSUFFICIENT` (`ConfidenceLabel`, `enums.py:52-60`) | Yes, but as a **qualitative band**, never a numeric confidence score — deliberately never merged into `priority_score` (`enums.py:52-56` docstring) |
| Uncertainty | `confidence_label` (same field) + `unresolved_conflict: bool` | — | No separate "uncertainty" field exists; `unresolved_conflict` flags specifically unresolved CONFLICTED-blocker evidence |
| Legal consequence | `component_trace.legal_band` | `float`, 1.0–4.0 | **No** — this is a banded numeric proxy (B1 blocker severity × status-confidence discount), not a "legal consequence" text/enum. Do not translate into free prose the backend didn't produce. |
| Possession impact | `component_trace.possession_band` | `float`, categorical `1.0` or `4.0` only | **No** — literally "does any CONFIRMED/DETECTED blocker have `affects_possession=True`", not a graded impact score |
| Downstream status | `component_trace.gis_downstream_status` | `str`, **always `"NOT_COMPUTED"`** (`GisDownstreamStatus`, `enums.py:86-93` — the enum has exactly one member) | Yes, literally, and it is the field that must drive §11's honesty requirement |
| Project-scale component | `component_trace.project_scale_band` | `float`, 1.0–4.0, quartile bucket of `project_value_crores` among other projects; `neutral_substitutions` lists when it fell back to neutral (unknown value or <4 comparable projects) | Yes |
| Component trace | `component_trace` | `Dict[str, Any]` (`db_schemas.py:37`) | Yes, but **untyped at the wire level** — see full sub-field list below |
| Owner | `owner_role`, `responsible_authority` | `str \| null` | **Only on `ExposureAssessmentWithContextRead`**, and only populated when `primary_blocker_id` resolves to a real `Blocker` row (`exposure.py:48-67`); falls back to a fixed engine-level string when there's no primary blocker, but that fallback lives in `component_trace.owner_role`, not guaranteed echoed onto the top-level field the frontend reads first |
| Recommended action | `recommended_action_id`, `recommended_action_type`, `recommended_action_rationale` | `str \| null` each | Only on `WithContextRead`; only the id is on plain `ExposureAssessmentRead` |
| Calculation timestamp | `calculated_at`, `calculation_date`, `created_at` | `datetime`/`date`/`datetime` | Yes, three related timestamps — `calculated_at` (engine compute time), `calculation_date` (nominal "as of" date), `created_at` (DB insert time) |
| Rule-set / engine version | `engine_version` (top-level), plus `component_trace.weights_version`, `.priority_weights_version`, `.staleness_policy_version` | `str` each | Yes — `engine_version` (e.g. `"kshetra-exposure-engine-1.0.0"`) is the top-level analogue of "Rule Set Version"; the other three are more granular and buried in `component_trace` |

`component_trace`'s full sub-field set (from `backend/exposure/models.py:17-66`'s `ComponentTrace`
dataclass, serialized as-is): `legal_band`, `possession_band`, `downstream_band`, `project_scale_band`,
`secondary_bonus`, `exposure_raw`, `exposure_band_equivalent`, `urgency_band`, `actionability_band`,
`priority_raw`, `weights_version`, `priority_weights_version`, `staleness_policy_version`,
`gis_downstream_status`, `days_remaining`, `clock_status`, `project_value_crores`,
`project_value_reference_count`, `affected_parcel_count`, `affected_area_acres`,
`contributing_b1_blocker_ids`, `contributing_possession_blocker_ids`, `primary_blocker_id`,
`secondary_blocker_ids`, `conflicted_blocker_ids`, `insufficient_blocker_ids`, `owner_role`,
`responsible_authority`, `prediction_id`, `prediction_delay_probability`, `prediction_generated_at`,
`prediction_is_stale`, `blocker_evidence_is_stale`, `neutral_substitutions` (tuple of human-readable
strings — e.g. `"legal_band: no determinate B1 blocker raised for this case (neutral=1)."`), `disclaimers`
(tuple of strings, carried verbatim from blocker `.notes`), `extra` (open dict).

Because `component_trace` is `Dict[str, Any]` in the Pydantic response model, **there is no server-enforced
wire contract for any of this** — a hand-written frontend TypeScript interface mirroring `ComponentTrace`
is a documentation convenience, not a guarantee, and every field access must be defensive
(`trace?.gis_downstream_status`, not `trace.gis_downstream_status`).

---

## 8. Recommended Exposure UI placement

Two placements, additive, no redesign:

- **Parcel dossier (`ParcelDetailModal`)**: a new 7th tab, **"Exposure & Priority"**, positioned
  immediately after "Project AI Prediction" and before "What-If Sandbox" — it is the next link in the
  causal chain (Prediction → ... → Exposure → Priority), not a peer of the What-If sandbox. Content:
  reuse the exact card language already proven in the AI Prediction tab (§4) — a navy headline card with
  `exposure_score`/`exposure_band` and `priority_score`/`priority_band`, a `confidence_label` chip that is
  **never the same color scale as risk/priority** (§20), a component breakdown section (legal/possession/
  downstream/project-scale bands as labeled bars or a compact key-value table, not a chart implying false
  precision), primary/secondary blocker references (id + a short label, degrading gracefully if the
  blocker record can't be resolved), owner/responsible authority, recommended action text, and the
  `gis_downstream_status: NOT_COMPUTED` disclosure rendered exactly as prominently as the existing
  "demo fallback" pill (§11).
- **Project level (`PredictiveAnalyticsView`)**: a new card, parallel to and below the existing
  "Project-Level Delay Prediction" card, titled **"Project Exposure & Priority"**, using
  `GET /api/projects/{id}/exposure/latest`. Same content pattern as above, project-scoped.

Do **not** add exposure/priority to the Overview tab or the KPI row directly — those are already dense and
governed by catalogued/mock fields (§4); mixing a real, sparsely-populated new engine's output into that
surface before it has real data (§15) would be the first place a judge notices an empty/broken tile.

---

## 9. Recommended Priority Queue

A dedicated screen is justified — `priority-queue` is a named, ranked, cross-case endpoint the existing
nav has no equivalent for (the closest existing thing is `ParcelsView`'s plain client-side sort, §15). But
it should **not** be a new top-level nav item competing with "Early Warning Alerts" and "Case & Action
Tracker" — those already occupy the "what needs attention" niche for officers. Two options, in order of
preference:

1. **Fold it into `RoleFocusPanel.tsx`** (Dashboard) as a 5th/replacement card for CALA and Collector
   roles — it already reads live `AppContext` derived data per-role with zero new mock datasets
   (`RoleFocusPanel.tsx:25-35` docstring), which is exactly the discipline a new queue-summary card should
   follow. Card shows top N by `priority_score` desc, banded by `priority_band`, click → filtered list.
2. **A dedicated panel reachable from `AlertsView`** (a "Priority View" toggle next to the existing
   severity filter tabs) rather than a new sidebar item — keeps it discoverable inside the screen officers
   already use for "what's urgent," without adding an 11th nav module.

Either way, the four bands should render as **ordered columns or an ordered list, never a pie/donut** —
`ACT_NOW → SOON → MONITOR → WATCH`, with `ACT_NOW` visually distinct from `CRITICAL`/`HIGH` risk styling
(§6, §20) even though both may use red — e.g. reserve amber-black double border, or a small icon shape, or
band initials, so "priority ACT_NOW" and "risk HIGH" are never visually interchangeable when scanned
quickly.

Suggested columns/fields per row: `case_reference` / linked parcel-or-project, `priority_band` + numeric
score, `exposure_band` + numeric score, primary blocker (short label + severity), owner_role, days
remaining (from `component_trace.days_remaining`, only if not null), `confidence_label` chip,
recommended action (truncated), a "Review Case" button reusing the existing pattern
(`openParcelDetail`/navigate to project).

---

## 10. Explanation UX

The task's target chain (Prediction → Statutory Clock → Blocker → Exposure → Priority → Owner → Action)
maps onto KSHETRA's own terminology as:

```
AI Prediction (ProjectPrediction)
      ↓
Statutory Clock (StatutoryClockResult — /api/legal/clocks, NOT YET SURFACED ANYWHERE IN THE UI)
      ↓
Blocker (Blocker — /api/blockers, NOT YET SURFACED ANYWHERE IN THE UI)
      ↓
Exposure (ExposureAssessment.exposure_score/band)
      ↓
Priority (ExposureAssessment.priority_score/band)
      ↓
Owner (owner_role / responsible_authority)
      ↓
Recommended Action (recommended_action_id → type/rationale)
```

Two of seven links are currently invisible in the UI (§5). Shipping the Exposure/Priority tab (§8) without
at least a minimal read of `primary_blocker_id`'s blocker record would leave a **visible gap in the
chain** — a score with no legible "why" underneath it, which directly contradicts the task's "why is this
parcel/project being prioritized, in a few seconds" requirement. Recommendation, in priority order:

1. **Minimum viable (ships with Step 8C-D):** inside the Exposure & Priority tab, render a compact
   **causal breadcrumb** — five small chained chips (Prediction % → Clock status → Blocker type/severity →
   Exposure band → Priority band), each chip clickable to jump to more detail (existing AI tab for
   Prediction; the Exposure tab's own detail sections for the rest). This does not require building a
   Statutory Clock or Blocker UI — it requires one new read call to `GET /api/blockers/{primary_blocker_id}`
   to get a human label (`blocker_type`, `severity`, `status`, `description`) for the breadcrumb, which is
   a small additive service function, not a new screen.
2. **Fuller (a later step, out of scope for 8C):** an actual Statutory Clock mini-panel and a Blocker
   detail panel, each reusing the same card language, reachable from the breadcrumb chips.

Visually: the breadcrumb should be a single horizontal row of small chips with `→` connectors (text, not
icons — avoid a literal animated flow-diagram; §21 design direction). Each chip's color follows its own
domain's existing accent (Prediction=indigo per `predictive` nav color, Clock=neutral/blue, Blocker=red/
amber by severity, Exposure=its own band color, Priority=its own band color) — this is more legible under
time pressure than one uniform gradient.

---

## 11. Demo/prototype boundary

`gis_downstream_status: "NOT_COMPUTED"` (§7) is the literal field carrying exactly the honesty
requirement the task brief describes: today's `downstream_band` is a **parcel-count heuristic**
(`scoring.py:155-163`: `min(4, max(1, affected_parcel_count))`, and `affected_parcel_count` itself
defaults to `1` — self-only — everywhere it's called today, per `engine.py:88-91`'s own docstring), not a
real point-on-polyline GIS corridor computation. The UI must:

- Render `gis_downstream_status` as an explicit, permanent label next to the downstream/project-scale
  component — e.g. "Downstream corridor impact: **Not computed** (self-parcel only)" — using the exact
  same visual weight as the existing "Demo fallback" prediction pill (§4), not a small greyed-out footnote.
- Never let a UI copywriter turn `project_scale_band: 4.0` into "top-priority project" prose — `§7` already
  shows this is a quartile bucket among *currently on-record* projects (which, in a demo DB with one or two
  projects, will almost always neutral-substitute to `1.0` per `scoring.py:184-185`'s "<4 distinct known
  values" rule) — show the raw band + the `neutral_substitutions` string verbatim when present, exactly as
  `PredictiveAnalyticsView.tsx:360-372` already does for out-of-training-range ML inputs.
- Treat `engine_version`/`weights_version`/`priority_weights_version`/`staleness_policy_version` as
  required, always-visible provenance strings (a compact "Calculated {calculated_at} · Engine
  {engine_version}" footer line), mirroring the existing "Generated {date} · LightGBM + SHAP + Cox... not
  an official government determination" footer pattern
  (`PredictiveAnalyticsView.tsx:375-378`, `ParcelDetailModal.tsx:762-764`).
- `STALENESS_POLICY_VERSION = "staleness-prototype-v1-UNVALIDATED"` (`enums.py:113`) and the 90-day
  threshold are explicitly an unvalidated placeholder (`enums.py:107-114`) — if `prediction_is_stale` or
  `blocker_evidence_is_stale` surfaces in the UI, it must say "stale by this prototype's unvalidated
  90-day rule," not "stale" unqualified.
- `SystemStatusIndicator.tsx` (§2, confirmed unchanged from `[[status-truthfulness]]` memory — no drift
  found in this audit) is the right place to add a 6th row, **"Exposure / Priority Engine"**, tone
  `simulated` or `online` depending on whether any assessment exists for the active project — reusing the
  existing `TONE_STYLES` (`SystemStatusIndicator.tsx:20-45`) rather than inventing new status colors.

---

## 12. State/API integration design (recommendation only — not implemented)

- **New service file**: `src/services/exposureService.ts`, modeled directly on `apiClient.ts`'s existing
  pattern — reuse its `apiFetch<T>`/`ApiError` (import, don't duplicate), add `mapExposureAssessmentFromApi`
  if any camelCase reshaping is wanted (the API is already close to camelCase-adjacent snake_case, so this
  may be a thin passthrough). Functions: `listExposureAssessments(filters)`, `getExposureAssessment(id)`,
  `getProjectLatestExposure(projectId)`, `getParcelLatestExposure(parcelId)`, `getPriorityQueue(filters)`.
  Does **not** touch `mlApiService.ts` (protected, unrelated contract) — mirrors `apiClient.ts`'s own
  "does NOT touch /predict" boundary statement (`apiClient.ts:11`).
- **New TypeScript types**: a `src/types/exposure.ts` (or an additive block in `types/index.ts` if the
  project prefers one file — `types/index.ts` is protected, so the default recommendation is a **new**
  file to avoid touching it) mirroring `ExposureAssessmentRead`/`ExposureAssessmentWithContextRead`/
  `ComponentTrace` field-for-field per §7, with every `component_trace` sub-field optional (`?:`) since
  it's untyped at the wire level.
- **AppContext integration (additive only, per §14)**: new state —
  `projectExposure: ExposureAssessmentWithContext | null`, `parcelExposureById: Record<string, ...>`,
  `priorityQueue: ExposureAssessmentWithContext[]`, loading/error booleans matching the existing
  `isProjectPredicting`/`projectPredictionError` naming convention — plus fetch functions
  `fetchProjectExposure()`/`fetchParcelExposure(id)`/`fetchPriorityQueue(filters)`. These are **read-only
  GETs on demand** (mount of the new tab, or a manual refresh button), matching the app's existing
  "fetch-on-action, not poll" discipline (§2) — no new polling loop needed, since exposure data does not
  change from a live government feed, only from a backend recompute step that doesn't exist yet (§15).
- **No React Query needed** — nothing else in the codebase uses it, and one-shot GETs with a loading/error
  boolean pair is the established idiom everywhere else in this AppContext.
- **Caching**: none beyond the existing AppContext-in-memory + localStorage pattern; exposure data is
  small (one row per case) and infrequently refreshed, so no additional cache layer is justified.

---

## 13. File-level implementation plan (for a future 8C-B/C/D — not built now)

| File | Change | Protected? |
|---|---|---|
| `src/services/exposureService.ts` | **New** | No |
| `src/types/exposure.ts` | **New** | No |
| `src/context/AppContext.tsx` | **Additive** state/fetchers (§12) | **Yes — needs explicit approval** |
| `src/types/index.ts` | Possibly additive `Alert.exposureAssessmentId?` / `CaseAction.exposureAssessmentId?` later, NOT in 8C-B | **Yes — needs explicit approval** |
| `src/components/parcels/ParcelDetailModal.tsx` | New 7th tab (§8) | No, but high-traffic — review carefully |
| `src/components/analytics/PredictiveAnalyticsView.tsx` | New card (§8) | No |
| `src/components/dashboard/RoleFocusPanel.tsx` | New/replaced card (§9) | No |
| `src/components/layout/SystemStatusIndicator.tsx` | New status row (§11) | No |
| `src/components/alerts/AlertsView.tsx` | Optional "Priority View" toggle (§9, if chosen over Dashboard placement) | No |

---

## 14. Protected files

Per the task's standing instruction, these remain untouched in this step and require explicit approval
before any future step modifies them:

```
src/context/AppContext.tsx
src/types/index.ts
src/services/predictionFeatures.ts
src/services/mlApiService.ts
```

Confirmed in this audit: none of the four were opened for editing, and the recommended integration design
(§12) treats `AppContext.tsx`/`types/index.ts` changes as strictly additive (new optional fields/state),
never a rename or removal of an existing field — so a future approval should be a low-risk, mechanically
reviewable diff.

---

## 15. Risks / conflicts

1. **Empty-by-default data (blocking for §9, not for §8/§12).** §1/§7 — no seed path populates real
   `ExposureAssessment` rows for the demo project's real parcels. A Priority Queue screen built before this
   is resolved will demo as an empty state on a fresh checkout. Needs a decision: either (a) extend
   `backend/seed.py` (or add a new seed script) to call `assess_and_persist_for_case` for the real seeded
   blockers/predictions, or (b) accept an honest "Not yet computed" empty state as the Step 8C demo story.
   This audit does not recommend which — it is a product decision, not a frontend one (§18).
2. **Triple "priority" naming collision** (§6) — `Parcel.priority`, `CaseAction.priority` (both
   `CRITICAL|HIGH|MEDIUM|LOW`), and the new `PriorityBand` (`WATCH|MONITOR|SOON|ACT_NOW`). Must be
   visually and label-wise disambiguated (§20 P0).
3. **`ParcelsView`'s existing "risk" sort** (`AppContext.tsx` `sortBy` switch, confirmed still present at
   the location `[[step8a-exposure-priority-audit.md]]` cited — `riskScoreDesc`/`riskScoreAsc`/
   `delayMonthsDesc`/`areaDesc`/`surveyNo`, `ParcelsView.tsx:132-136`) is a plain client-side sort over
   catalogued `Parcel` fields. It has no awareness of `priority_score`. Do not silently repoint this sort
   at the new engine — that would change existing, already-demoed behavior without being asked. Leave it
   alone; the Priority Queue is a new, separate ranking (§9), not a replacement for this sort.
4. **Untyped `component_trace`** (§7) — any TS type written for it is documentation, not a contract; a
   backend change to `ComponentTrace` fields would silently stop matching the frontend type with no
   compiler error. Recommend a runtime presence check (`'legal_band' in trace`) at at least one call site
   as a canary, not full runtime validation (out of scope for a prototype).
5. **`localStorage`/API sync boundary** — exposure data comes only from the backend (there is no
   client-side fallback/demo generator the way `demo_fallback.py` exists for `/predict`). If the backend is
   offline, the Exposure tab must show the same honest "service unreachable, Retry" pattern as
   `ParcelDetailModal.tsx:561-576` — it must **not** silently fall back to a fabricated client-side
   estimate the way nothing here currently threatens to, but which is worth stating explicitly since a
   `demo_fallback.py`-style temptation exists for prediction and should not be copied here (exposure has no
   equivalent honest fallback — an unreachable backend means no data, full stop).
6. **Existing GIS map has no blocker/exposure overlay** — `GisMapView.tsx` colors parcels strictly by
   `riskLevel` (§4/§GIS). Adding an exposure/priority layer there is out of scope for Step 8C per this
   audit's "minimum UI changes" mandate (§9 already gives Priority Queue a non-map home); flagging only so
   a future step doesn't assume the map already has a slot for this.
7. **Dashboard hardcoded numbers** (pre-existing, unrelated to Step 8B, found during this audit) —
   `DashboardView.tsx`'s risk-pie legend counts ("28 (7.4%)", "46 (12.1%)", "306 (80.5%)",
   `DashboardView.tsx:317-341`) are **literal hardcoded strings**, not bound to the `displayHighRisk`/
   `displayMedRisk`/`displayLowRisk` variables computed two sections above
   (`DashboardView.tsx:62-64`) — and `stageData`/`bottleneckData` (`DashboardView.tsx:70-91`) are 100%
   static, disconnected from `parcels`/`alerts` state entirely. Not caused by and not required to be fixed
   by Step 8C, but worth a separate ticket since it's a real "two sources of truth" defect a judge could
   catch by changing filters and noticing the legend doesn't move.

---

## 16. Testing strategy (for the future implementation step, not this audit)

- **Service layer**: unit tests for `exposureService.ts` mirroring whatever test pattern (if any) already
  covers `apiClient.ts` — mock `fetch`, assert URL/query-param construction, assert `ApiError` thrown on
  non-2xx and on network failure.
- **Empty-state coverage**: explicit test/manual-QA case for "no exposure assessment exists yet" (§15 #1)
  — this will be the *common* case until seeding is resolved, so it deserves first-class treatment, not an
  afterthought `?? '—'`.
- **Honesty regression**: a manual QA checklist item verifying `gis_downstream_status` always renders as
  "Not computed" text somewhere visible whenever an assessment is shown — a simple grep-able marker
  (e.g. a `data-testid="downstream-not-computed"`) would let a future automated check catch a regression
  where this label gets dropped in a refactor.
- **Visual**: since three "priority"-labeled UI elements now coexist (§6, §15 #2), a manual side-by-side
  screenshot check that `Parcel.priority`, `CaseAction.priority`, and `PriorityBand` badges are
  distinguishable at a glance is worth a one-time design review before Step 8C-D ships.

---

## 17. Exact Step 8C-B implementation plan

Step 8C-B should be scoped to **exactly**: `src/services/exposureService.ts` (new) +
`src/types/exposure.ts` (new). Nothing else. This keeps it a small, independently reviewable,
low-risk diff that:

- Does not touch any protected file (§14).
- Does not touch any existing component (nothing renders exposure data yet).
- Is fully exercisable against the real backend today (§7's contract is live and stable, even though the
  data behind it is currently empty for real cases — §15 #1 is a *data* problem, not an *API* problem, and
  does not block building and testing the service layer itself against an empty/404 response).
- Gives Step 8C-C/D concrete, typed functions to build against instead of ad-hoc `fetch` calls.

Step 8C-C (Priority Queue) and 8C-D (Project/Parcel tab integration) should each get their own short audit
check-in before starting, specifically to re-confirm the seeding decision from §15 #1 has been made one
way or the other.

---

## 18. Open questions

1. **Seeding (§15 #1, blocking §9/§C):** should Step 8C or an earlier step add an exposure-seeding path for
   the real demo project, or does Step 8C intentionally ship with an honest empty state as its demo story?
2. **Where does the Priority Queue live** — Dashboard `RoleFocusPanel` card vs. a panel inside
   `AlertsView` (§9)? This audit has a preference (RoleFocusPanel) but it's a product call.
3. **Blocker detail resolution (§10):** is a minimal `GET /api/blockers/{id}` read (for the causal
   breadcrumb's Blocker chip) acceptable as part of Step 8C-D, or should that wait for a dedicated
   Blocker-UI step? The breadcrumb is materially weaker without it.
4. **`Alert`/`CaseAction` → exposure linkage:** should a future step add an optional
   `exposureAssessmentId` to `Alert`/`CaseAction` so an officer can jump from an alert straight to its
   exposure detail? Not needed for 8C-B/C/D, but worth deciding before `types/index.ts` is touched at all,
   since it's the kind of change best done once.
5. **Role-gating:** should the Exposure/Priority tab and Priority Queue be visible to all three roles, or
   CALA/Collector only (mirroring how `corridor` is planner-only today, `config/roles.ts:191-215`)? This
   audit leans "all roles can view, since exposure is diagnostic not planning" but flags it as undecided.

---

## 19. Government-grade UX/UI audit

### 19.1 Visual maturity — what's already right

The design system (§2) is a genuinely above-average starting point, not a typical "AI hackathon" baseline:

- Deliberate restraint is already documented in code comments, not just achieved by accident: `Badge.tsx`
  explicitly avoids "excessive rounded pills" for "a crisper, denser enterprise look" (`Badge.tsx:12-16`);
  `KpiCard.tsx` keeps most tiles white/neutral so the row doesn't read as "a rainbow strip"
  (`KpiCard.tsx:19-24`); `SectionHeading.tsx` standardizes "colored icon + navy heading" instead of
  colored card backgrounds (`SectionHeading.tsx:15-19`).
- One centralized semantic color vocabulary (`colors.ts`) with documented meaning per hue
  (`tokens.css:19-29`) — this is exactly the "color semantics" discipline §19.5 below asks for, already
  half-built.
- The navbar already frames the product institutionally: "GOVERNMENT OF INDIA / Ministry of Road Transport
  & Highways (MoRTH) / PM-GatiShakti Decision Support — Prototype" (`Navbar.tsx:61-71`), and the
  `SystemStatusIndicator` (§11) is a genuinely mature, honest status pattern most prototypes don't bother
  building at all.

### 19.2 Visual maturity — what reads as immature or inconsistent

- **Emoji-as-status-icon, pervasive.** 🔴/🟡/🟢 appear inside filter dropdown option text, dashboard pie
  legends, and the GIS map legend (`ParcelsView.tsx:132,163-165`, `DashboardView.tsx:80-82,317-339`,
  `GisMapView.tsx:818-826`). Colored dots/badges already exist for the exact same purpose elsewhere in the
  same screens (e.g. `ParcelsView.tsx` table cells use a proper colored `<span>` badge, not an emoji) — the
  emoji usage is inconsistent with the app's own better pattern, not a deliberate style.
- **Sub-legible type sizes.** Extensive use of literal pixel classes below the 12px floor typically
  recommended for body/data text — `text-[9px]`, `text-[10px]`, `text-[10.5px]`, `text-[11px]` appear
  dozens of times across `KpiCard.tsx`, `Badge.tsx`, table cells, and card metadata rows. This is a real
  accessibility and "long working session" concern (§19.7), not just an aesthetic one — an officer doing
  a multi-hour case review needs data-row text no smaller than ~12-13px.
- **Two color-config sources** (`tokens.css` vs. `tailwind.config.js`, §2) — low risk today since the
  legacy file appears dead, but worth resolving so a future contributor doesn't reintroduce a real
  conflict.
- **Dead/unbound demo numbers** (§15 #7) undermine institutional credibility more than a cosmetic issue
  would — a static legend percentage that doesn't move when filters change is the kind of thing a skeptical
  evaluator notices and generalizes from ("if this number is fake, what else is").
- **Font-family duplication** — `tailwind.config.js:40-43` declares `fontFamily.sans = ['Inter', ...]` but
  `index.css:9` also hardcodes the same stack directly on `body`, bypassing the Tailwind token. Low risk,
  minor inconsistency.

### 19.3 Government/institutional language audit

Actual copy in the app is, on the whole, **already close to the target register** — "Land Acquisition
Delay Risk Decision Console", "Explainable AI (XAI) Model", "Institutional Demo Notice", "Statutory Stage
Progress & Bottleneck Funnel" are not casual phrasings. Specific deviations found:

| Current text | Location | Issue | Suggested |
|---|---|---|---|
| "Deep Dive" (button) | `DashboardView.tsx:431`, `ParcelsView.tsx:414` | Casual/startup register | "Open Dossier" (matches the modal's own "Close Dossier" footer button, `ParcelDetailModal.tsx:986`) |
| "Score this parcel" / "Score All Parcels" | `ParcelsView.tsx:404`, `PredictiveAnalyticsView.tsx:159` | "Score" as a verb is ML-jargon, not administrative language | "Run Indicative Assessment" / "Assess All Parcels (Indicative)" |
| "Analyzing…" / "Contacting the prediction service and scoring..." | Multiple | Mild but acceptable — "scoring" repeats the jargon issue above | "Calculating…" |
| "Launch Tour" / "Guided Demo Tour" | `Sidebar.tsx:116`, `Navbar.tsx:137-138` | Fine for a prototype evaluation aid — this is legitimately demo chrome, not case-management chrome, so casual register here is lower-risk | No change needed; consider visually separating demo-chrome from case-management chrome (already mostly true — it's confined to the amber banner and one nav button) |
| "Contribution share" / raw SHAP language | `ParcelDetailModal.tsx:674` | Technically correct per `[[prediction-feature-schema]]` memory (deliberately precise, not simplified) — good | No change; this precision is correct given the ML-integrity work already done |
| "Problem Identified" / "Problem:" | `GisMapView.tsx:407,857` | Vague, non-administrative — "problem" doesn't map to any LARR/statutory term | "Primary Blocker" (once Exposure/Priority ships, this can literally become the real field) or "Top Risk Factor" (matches `Parcel.topRiskFactor`'s own name) meanwhile |
| "STATUS: SIMULATED" | `ParcelDetailModal.tsx:446-448` | Good — terse, accurate, already institutional | No change |

No instance of "Fix Now", "Something went wrong", "Smart Recommendation", or "High Risk!" (with
exclamation) was found anywhere in the ~20 files read for this audit — the more alarmist end of the
"childish" spectrum the task worries about is **not actually present** in this codebase.

**Terminology to hold the line on for Step 8C** (per the task's explicit instruction, restated here as a
checklist against real field names now that §7 is done): Exposure is never "risk" (`exposure_score` is a
consequence-magnitude score, `delayRiskScore`/`riskLevel` remain the likelihood terms — §4's existing
disambiguation pattern already proves this separation works in this codebase); Priority is never
"prediction"; `gis_downstream_status: NOT_COMPUTED` is never implied to be a real corridor calculation
(§11); `confidence_label` is never rendered as if it were a percentage (it is a four-value band, not a
score).

### 19.4 Information architecture — the 10-question test

Walking the task's ten officer questions against the *current* app (before Step 8C):

| # | Question | Answerable today? |
|---|---|---|
| 1 | What case/project am I looking at? | Yes — project name/code in Dashboard hero and modal header |
| 2 | What statutory clock applies? | **No** — no Statutory Clock UI exists (§5) |
| 3 | How much time remains? | **No** — same gap; `predictedDelayRange` is a *catalogued* estimate, not a clock deadline |
| 4 | Is the clock certain or uncertain? | **No** — no `clock_status`/`ClockStatus` surfaced anywhere |
| 5 | What is blocking progress? | Partially — `topRiskFactor` (catalogued) and SHAP top factor (ML) exist; no real Blocker record surfaced |
| 6 | What downstream impact is exposed? | **No** — nothing today; will become "No (honestly)" post-8C via `gis_downstream_status` |
| 7 | Why is this prioritized? | Partially — SHAP explains the ML score; nothing today explains *prioritization* as opposed to *risk* |
| 8 | Who owns the next action? | Partially — manually-assigned `assignedTo`/`assignedOfficer` exist; no machine-derived `owner_role` |
| 9 | What evidence supports the assessment? | Partially — court/revenue record tabs exist; blocker evidence chain does not |
| 10 | What should be reviewed next? | Partially — Action tracker exists; no ranked "next" signal beyond a manual due-date sort |

Five of ten are currently unanswerable or only partially answerable — largely the same five gaps §10's
causal-chain analysis already identified (clock + blocker visibility). This is the single biggest
information-architecture finding of this audit: **Step 8C's value is disproportionately in closing
questions 2-4 and 6-7, not in questions 8-10** (which are already reasonably served today).

### 19.5 Color semantics — current state

Already-consistent today (`colors.ts`, `tokens.css`, confirmed by reading every consumer in this audit):
blue=primary/info, navy=institutional chrome, teal=GIS, indigo=AI/predictive, purple=integrations,
emerald=success/low-risk, amber=warning/pending/medium, red=danger/high-risk. This is a real, working
semantic system — not just a claim in a comment.

**Gap for Step 8C**: no existing color carries "uncertainty" or "legal issue" as *distinct* meanings from
"warning" (amber) or "danger" (red) — both of those hues are already fully claimed by risk semantics.
`confidence_label` (VERIFIED/PARTIAL/NEEDS_VERIFICATION/INSUFFICIENT) needs a visually distinct treatment
— recommend **not** a new hue (avoid palette sprawl) but a distinct *shape/pattern* language: a dashed or
hatched border, or an outline-only badge style (vs. the existing filled badges) reserved specifically for
confidence/uncertainty, so "HIGH exposure, NEEDS_VERIFICATION confidence" is legible as two independent
axes at a glance, never mistaken for "confidence is a shade of risk." This directly serves the task's
explicit warning: "critical legal uncertainty must not be visually confused with a confirmed legal
violation."

### 19.6 Data presentation

The app already leans correctly toward tables/key-value rows for dense data (`ParcelsView` table,
`ParcelDetailModal` Overview grids) rather than decorative cards — this is right for the target audience
and should be the default for the new Exposure/Priority content too (§8's recommendation to use a
key-value/bar breakdown, not a chart, for `component_trace` follows this existing convention). The
Dashboard's two Recharts visualizations (bar + pie, §DashboardView) are the one screen leaning toward
"visualization," and even those are restrained (no 3D, no gradients, muted palette) — acceptable as-is.

### 19.7 GIS interface

`GisMapView.tsx` is closer to "operational" than "decorative" already: real Leaflet polygons keyed to
actual parcel geometry, a working legend, click-to-inspect drawer, route-editing tools for the planner
role. It communicates parcel status (risk color) and selection state well. It does **not** currently
communicate blocker, exposure, or priority — and per §15 #6/§9, this audit recommends **not** adding that
now (a color-by-exposure toggle would compete visually with the existing risk-color scheme and is better
suited to a later, dedicated step once real exposure data exists broadly enough to be worth a map layer).

### 19.8 Accessibility

Not exhaustively audited (would require a live browser pass, out of scope for a read-only code audit), but
from static inspection: the sub-12px type sizes (§19.2) are the clearest concrete accessibility risk found.
Color is not used as the *sole* carrier of status anywhere observed — every risk/status badge pairs color
with a text label (e.g. "HIGH", "Pending", "Resolved") or an icon, which is the right pattern and should
continue for confidence/exposure/priority badges. Focus states, keyboard navigation, and screen-reader
semantics were not verifiable from source alone and should get a real browser pass before/alongside Step
8C-D.

### 19.9 Government-grade maturity scorecard

| Dimension | Score /10 | Why |
|---|---|---|
| Visual maturity | 7 | Restrained, documented design system; let down by emoji-as-icon and sub-12px type |
| Institutional credibility | 8 | Navy chrome, ministry/programme framing, honest status indicator — genuinely above baseline |
| Information hierarchy | 6 | Good within each screen; the causal Prediction→...→Action chain has real gaps today (§19.4) |
| Terminology quality | 7 | Mostly precise/administrative already; a handful of casual verbs ("Deep Dive", "Score") |
| Operational usability | 7 | Filters, sort, tabs, dossier drill-down all present and coherent; some hardcoded/dead data undermines trust |
| GIS usability | 7 | Real geometry, working legend/inspector; no exposure/priority layer yet (acceptable per §19.7) |
| Accessibility | 5 | Type-size risk is real; color-plus-label discipline is good; unverified focus/keyboard behavior |
| Evidence/provenance presentation | 7 | Prediction mode/health honesty is excellent; court/revenue "Simulated" labels are excellent; exposure provenance not yet built (this audit's own recommendation, §11, closes this) |
| Consistency | 6 | One real design-token duplication (§2) and one real dead-data bug (§15 #7); otherwise consistent |
| Overall decision-support readiness | 6.5 | Strong bones, missing the causal middle (clock/blocker) the task itself is trying to close |

### 19.10 Prioritized fix list

**P0 — must fix for government credibility (do alongside or before Step 8C ships):**
- Disambiguate the three "priority" concepts visually and lexically (§6, §15 #2).
- `gis_downstream_status`/confidence honesty rendering (§11) — this is the credibility-defining feature of
  this entire step; get it visibly right or the rest of the audit's other findings don't matter.
- Fix the Dashboard's disconnected hardcoded legend numbers (§15 #7) — cheap, high-visibility credibility
  risk, unrelated to Step 8C but likely to be noticed by the same evaluators looking at the new Exposure UI.

**P1 — important, do soon:**
- Replace emoji risk icons with the existing colored-badge pattern already used elsewhere (§19.2).
- Raise the minimum body/data text size off the sub-12px classes in `KpiCard`/`Badge`/table cells.
- Resolve the `tokens.css` vs. `tailwind.config.js` color duplication (§2).
- Retitle "Deep Dive" → "Open Dossier" and "Score (All) Parcels" → "Assess (All) Parcels (Indicative)"
  (§19.3) — small, mechanical, improves register without touching layout.

**P2 — polish:**
- Consolidate `fontFamily` declaration to one source (§19.2).
- "Problem Identified" GIS map label rewording (§19.3), ideally timed with a future Blocker-UI step so it
  can become a real field reference instead of a renamed placeholder.

---

## 20. Target frontend character — gap assessment

The task's target ("operational government decision-support system," not "college AI project," not
"generic SaaS admin," not "futuristic AI demo") is **already mostly achieved** by the existing codebase,
contrary to what a "make it look more professional" request might assume. The gaps found in this audit are
narrow and enumerable (§19.10), not a wholesale visual-identity problem. This changes the recommendation in
§21/§23 materially: **this is not a redesign situation.**

---

## 21. Proposed visual design system for Step 8C (extends, does not replace, the existing system)

- **Typography direction**: keep Inter; raise the practical minimum size for any data-bearing text (badges,
  table cells, card metadata) to 12px, reserving anything below that for genuinely decorative/auxiliary
  micro-labels only (e.g. a chart axis tick). No new typeface, no new weight scale — the existing
  font-black/extrabold/bold/semibold/medium ladder is already sufficient and consistently applied.
- **Color philosophy**: extend `colors.ts`'s `AccentColor` union with the new bands' own semantics reusing
  existing hues wherever the meaning is a genuine match (`exposure_band`/`priority_band` CRITICAL/ACT_NOW →
  `red`; HIGH/SOON → `amber`; MODERATE/MONITOR → a hue not yet claimed for risk — recommend `blue` or
  `indigo` reused at lower saturation, since MODERATE/MONITOR is not "safe" the way LOW/emerald is; LOW/
  WATCH → `neutral`, deliberately *not* `emerald`, since "watch" is not "resolved"). `confidence_label`
  gets the shape-language treatment from §19.5, not a new hue.
- **Spacing**: unchanged — the existing 4px-based Tailwind spacing scale and card padding conventions
  (`Card.tsx` `sm`/`md`/`none`) are consistent and should be reused as-is for every new panel.
- **Component style**: reuse `Card`, `Badge`, `IconTile`, `KpiCard`, `SectionHeading` verbatim for all new
  Exposure/Priority UI — no new base components needed except possibly one small new primitive, a
  **"BandBar"** (a labeled horizontal bar 1-4 segments filled, for `component_trace`'s 1.0-4.0 banded
  values) if the team wants a visual rather than purely numeric rendering of the component breakdown; this
  is the only genuinely new visual element this audit's recommendations require.
- **Navigation style**: unchanged — no new top-level nav item recommended (§9).
- **Table style**: reuse the existing dense, small-caps-header, divide-y table pattern
  (`ParcelsView.tsx`/`ActionsView.tsx` list view) for the Priority Queue.
- **Map style**: unchanged for Step 8C (§19.7); defer an exposure map layer to a later step.
- **Status system**: reuse `SystemStatusIndicator`'s `TONE_STYLES` (online/simulated/notConnected/checking)
  verbatim for the new status row (§11); reuse the existing "provenance pill" pattern (§4, §11) for
  engine/weights version display.
- **Button language**: reuse existing button classes/hierarchy (primary blue solid, secondary
  white/bordered, destructive/warning amber); apply the §19.10 P1 label rewording to existing buttons
  opportunistically, not as a Step-8C-scoped task.
- **Animation philosophy**: unchanged — the codebase already uses animation sparingly and purposefully
  (`animate-subtle-pulse` reserved for "genuinely live/urgent," per `KpiCard.tsx:15-16`'s own comment;
  `animate-pulse` on the CRITICAL alert icon). New Exposure/Priority UI should follow the same rule:
  reserve any pulse/motion for `ACT_NOW`/`CRITICAL` bands only, never decoratively.
- **Responsive strategy**: unchanged — existing screens already use `grid-cols-1 sm:.../lg:...` responsive
  breakpoints consistently; new cards/tables should follow the same breakpoints already in use on
  neighboring screens.

---

## 22. Visual design verdict

**B — substantially restyled in the narrow areas identified (§19.10), while preserving the existing
functionality, architecture, and the majority of the current visual system**, not (A) a trivial polish
pass and not (C) a presentation-layer redesign. The existing design system is a real asset; the correct
scope of change is the P0/P1 list in §19.10 plus the additive Exposure/Priority components in §8/§9/§21 —
not a rebuild of anything already working.

---

## 23. Final verdict

**APPROVE STEP 8C-B**, scoped exactly as §17 describes (`exposureService.ts` + `exposure.ts` types only),
because:

- The API contract it depends on (§7) is real, stable, mounted, and independently testable today —
  building against it does not require the seeding question (§18 #1) to be resolved first.
- It touches no protected file and no existing component — zero regression risk to anything currently
  working or demoed.
- It gives every subsequent step (8C-C, 8C-D) a typed, reviewable foundation instead of ad-hoc fetches.

**DO NOT SCHEDULE STEP 8C-C (Priority Queue) YET** — resolve Open Question §18 #1 (the seeding/empty-data
gap) first. A flagship new screen that renders empty for the demo project on a fresh checkout is a worse
outcome than delaying it by one decision.

**STEP 8C-D (Project/Parcel tab integration, §8) may proceed once 8C-B lands**, independent of the seeding
question, since an honest "Not yet computed" empty state inside an existing dossier tab is a normal,
expected state for a new feature — unlike a dedicated queue screen whose entire reason to exist is showing
ranked results.
