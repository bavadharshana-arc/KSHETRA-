# KSHETRA — Step 8A: Exposure & Priority Engine
## Audit + Architectural Design (no implementation)

**Status: AUDIT/DESIGN ONLY.** No code, schema, migration, or frontend file was created or
modified in this step. This document is the sole deliverable.

---

## 1. Executive summary

KSHETRA already has two genuinely deterministic, evidence-backed engines to build on: the Step 6B
statutory clock engine (`backend/legal/`) and the Step 7B/7B.1 B1–B4 blocker engine
(`backend/blockers/`). Both compute rich, already-labeled severity/confidence outputs. **Nothing
in the codebase today combines them into a single "what should I act on first" answer** — the
closest existing thing, confirmed by direct inspection, is a plain UI sort
(`AppContext.tsx:1417-1432`) over `Parcel.delayRiskScore`/`predictedDelayMonths`/`areaAcres`, with
zero weighting, aggregation, or exposure logic anywhere in the frontend. Step 8 is genuinely
greenfield, not a refinement of something that partly exists.

The audit's two most important findings:

1. **Double-counting is a real, concrete risk, not a theoretical one.** B2's evidence
   (`ownershipDispute`, `documentStatus`) and B3's evidence (`compensationStatus`) are read from
   the *exact same* `Parcel` fields that the ML model's `ownership_disputes`/`document_issues`/
   `compensation_pending_pct` features are counted from (`predictionFeatures.ts:35-74`). A naive
   `Exposure = likelihood × consequence` formula that used blocker severity as "consequence" would
   multiply the same underlying fact into the score twice. §5/§9 design the fix: exposure's
   non-likelihood terms are restricted to axes the ML model provably does not see at all (legal
   consequence class, downstream extent, possession-blocking status, project scale) — never a
   second pass over dispute/document/compensation counts.
2. **"Downstream impact" is not currently computable, and Step 7A's own audit slightly
   overstated it.** `docs/step7a-blocker-engine-audit.md` §M called `contiguous_segment_ref` "a
   real existing linkage... answerable today via `parcel → project → corridorSections`." Direct
   inspection this step found that is not quite right: `Parcel` carries no `sectionId`, no
   chainage, no sequence field of any kind (`types/index.ts:183-261`), and
   `corridorSections[].chainageKm` is a **free-text display string** ("Km 0.0 - 18.2",
   `mockData.ts:70,79,88`), not a structured numeric range. Determining "which section a parcel is
   in" requires a real geometric computation (projecting the parcel's GPS point onto the
   project's `corridorPath` polyline) that exists nowhere in the codebase today — confirmed by an
   exhaustive grep of `GisMapView.tsx` (936 lines) finding zero adjacency/downstream logic. This
   correction is carried through the rest of this document: downstream/possession impact is
   **DERIVABLE with new GIS code**, not an existing wiring job, and today's demo-safe answer is
   "the one directly affected parcel," honestly labeled as such (§6, §14).

Given both findings, this design recommends: (a) a strict separation of PREDICTION (likelihood),
EXPOSURE (consequence magnitude if the risk materializes), and PRIORITY (exposure + urgency +
actionability) as three genuinely independent axes drawing from disjoint evidence; (b) a
transparent, banded weighted-sum formula (not multiplication) so a single missing or uncertain
input dampens rather than destroys the score; (c) reuse of the blocker engine's own severity/
confidence/owner/action outputs verbatim rather than re-deriving anything; and (d) one new,
minimal, append-only database table.

---

## 2. Current-system findings

Confirmed by direct inspection (own prior work on `backend/legal/**`/`backend/blockers/**` from
Steps 6B–7B.1, plus fresh inspection this step of `src/`, `backend/models.py`,
`backend/routers/**`, `ai-model/**`):

| Layer | State |
|---|---|
| Government ingestion / entity resolution | Does not exist. All parcel/project data is seeded demo data (`backend/seed.py`, `src/data/mockData.ts`). |
| Canonical Parcel | `backend/models.py` `Parcel` (and `src/types/index.ts` `Parcel`) — real, stable schema, confirmed unchanged since Step 7A. |
| Statutory Clock | `backend/legal/` — real, deterministic, 66 passing tests, unaffected by any later step. |
| ML Prediction | `backend/inference_service.py` + `ai-model/**`, persisted via `backend/models.py` `Prediction` (append-only, `backend/crud.py:252-278` has the exact "latest prediction for project/parcel X" query pattern this design reuses). |
| SHAP / Evidence | `Prediction.shap_factors` (raw contribution dicts, not the frontend's narrative `ShapFactor` shape — see `backend/schemas.py:481-495`'s own documented reason). |
| Blocker Detection | `backend/blockers/` — real, deterministic, 90 passing tests (as of Step 7B.1), B1–B4, ranking, actions, all reusing `legal.enums.SourceType`. |
| Possession Impact | **Does not exist.** `Blocker.downstream_extent.contiguous_segment_ref`/`critical_path_impact` are dataclass fields that exist but are **always `None`** in every one of the four detectors (`backend/blockers/models.py:52-59`'s own docstring says so explicitly). |
| Exposure / Priority | **Does not exist anywhere** — not in the backend, not in the frontend. The only frontend "priority" behavior is a plain array sort (below). |
| Owner | Exists, but only inside the blocker engine (`Blocker.owner_role`/`responsible_authority`), never surfaced project/case-wide. |
| Recommended Action | Exists per-blocker (`backend/blockers/actions.py`), never surfaced as "the one action for this case" at a higher level. |

**The frontend's actual "priority" logic, verbatim** (`src/context/AppContext.tsx:1417-1432`):
```ts
}).sort((a, b) => {
    switch (filters.sortBy) {
      case 'riskScoreDesc': return b.delayRiskScore - a.delayRiskScore;
      case 'riskScoreAsc':  return a.delayRiskScore - b.delayRiskScore;
      case 'surveyNo':      return a.surveyNumber.localeCompare(b.surveyNumber);
      case 'areaDesc':      return b.areaAcres - a.areaAcres;
      case 'delayMonthsDesc': return b.predictedDelayMonths - a.predictedDelayMonths;
      default: return b.delayRiskScore - a.delayRiskScore;
    }
});
```
The Dashboard's "Critical High-Priority Queue" (`DashboardView.tsx:347-349,381`) is literally
`parcels.slice(0, 4)` of this already-sorted array — no independent scoring. `Parcel.priority`
(`'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'`, `types/index.ts:240`) is a hand-authored demo field, not
computed by any function found. **This existing field name collides with the natural name for
Step 8's own output** — §14/§21 recommend the new concept use distinct field names
(`priority_band`, not `priority`) to avoid ambiguity.

---

## 3. Existing data inventory

Per the task's required axes A–K, classified as **EXISTING + TRUSTWORTHY** /
**EXISTING BUT DEMO/SYNTHETIC** / **EXISTING BUT NOT PROVENANCE-AWARE** / **DERIVABLE** /
**MISSING** / **SHOULD NOT BE USED**:

| Axis | Field(s) | Classification | Notes |
|---|---|---|---|
| A. Probability/likelihood | `Prediction.delay_probability`/`delay_risk_score` (`models.py:323-325`) | **EXISTING, DEMO/SYNTHETIC** | Deterministic and reproducible given `prediction_mode` (`live-model`/`demo-fallback`), but the model is trained on synthetic data — the project's own `/health` disclaimer says "not certified for official government decisions." Use the number; never drop the disclosure. |
| B. Statutory urgency | `StatutoryClockResult.days_remaining` | **EXISTING + TRUSTWORTHY** | Deterministic Step 6B output; trustworthy exactly to the degree `clock_status` itself claims (i.e. not when `CLOCK_UNCERTAIN`). |
| C. Legal consequence severity | `ConsequenceClass` (via B1's `BlockerSeverity`) | **EXISTING + TRUSTWORTHY** | Already the right level of abstraction — consume B1's blocker severity, never the raw `ConsequenceClass` a second time. |
| D. Downstream parcel impact | *(none)* | **MISSING** (self-only extent is **EXISTING**); true multi-parcel downstream is **DERIVABLE** | See §1 correction. `Parcel` has no chainage/sequence field (`types/index.ts:183-261`); `corridorSections[].chainageKm` is a display string, not numeric (`mockData.ts:70,79,88`). |
| E. Area/extent impact | `Parcel.areaAcres` | **EXISTING + TRUSTWORTHY** | For the single directly-affected parcel only; project/segment-wide aggregation is **DERIVABLE**, not existing. |
| F. Possession impact | `Blocker.affects_possession` (B3/B4) | **EXISTING + TRUSTWORTHY** (categorical) | Bare `Parcel.possessionStatus` alone is **EXISTING BUT NOT PROVENANCE-AWARE** (no source_type/verified/timestamp — same finding as Step 7A audit §F). |
| G. Project criticality | `Project.project_value_crores`, `total_length_km`, `agency`, `project_type` | **DERIVABLE (as a labeled proxy only)** | No real criticality field exists. `Project.planningPriorities` **SHOULD NOT BE USED** — its own doc comment states "no optimization logic is attached to these" (`types/index.ts:301-304`), confirmed by every usage site being purely cosmetic display. |
| H. Acquisition stage | `Parcel.stage`/`Project.currentLarrStage` (`LarrStage`) | **EXISTING BUT NOT PROVENANCE-AWARE — display/cross-reference only** | Step 6A/7A already established this rule for the legal/blocker engines; Exposure inherits it unchanged: never a scoring input. |
| I. Blocker severity | `Blocker.severity` (`BlockerSeverity`) | **EXISTING + TRUSTWORTHY** | Deterministic, `BLOCKER_SEVERITY_RANK` already defines a 0–4 ordinal scale — reused directly (§9). |
| J. Blocker confidence | `Blocker.status` + `BLOCKER_STATUS_CONFIDENCE_RANK` | **EXISTING + TRUSTWORTHY** | `CONFIRMED`(2) > `DETECTED`(1) > `SUSPECTED`(0); `CONFLICTED`/`INSUFFICIENT_EVIDENCE` excluded from `PRIMARY_ELIGIBLE_STATUSES` already. |
| K. Owner/responsible authority | `Blocker.owner_role`/`responsible_authority` | **EXISTING + TRUSTWORTHY, domain-validation-recommended** | Same caveat Step 7A §K already recorded: mapping is a defensible starting default, not a validated government org-chart. |

**Two additional findings worth recording explicitly:**
- `SystemSettings.riskThresholdLowMax`/`riskThresholdMedMax` (`types/index.ts:392-393`) exist only
  as ephemeral frontend React state (`AppContext.tsx:288`), never persisted server-side — **NOT
  usable** as a backend exposure/priority threshold source without a new backend config surface.
- `Parcel.priority` (`'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'`) is **EXISTING BUT DEMO/SYNTHETIC**
  (hand-authored, not computed) and must not be confused with, or overwritten by, Step 8's new
  output — naming collision, flagged in §14/§21.

---

## 4. Exposure definition

**Exposure = the magnitude of consequence if the currently-predicted/blocked risk actually
materializes.** It answers "how much does it matter," not "how likely is it" (that's Prediction)
and not "what should I do about it right now" (that's Priority, §10).

Exposure is built from axes the ML model **cannot** already represent, to avoid double-counting
(§5): legal consequence severity (B1), possession-blocking status (B4), downstream extent (§6),
and project scale (a labeled proxy). It deliberately excludes raw dispute/document/compensation
*counts*, since those are already the ML likelihood's own inputs.

---

## 5. Do not double-count risk — analysis and resolution

`predictionFeatures.ts:27-100` documents the fixed 7-field ML schema: `parcel_count`,
`litigation_cases`, `ownership_disputes`, `document_issues`, `compensation_pending_pct`,
`notification_age_months`, `acquisition_stage`. Every one of these except `parcel_count`/
`notification_age_months`/`acquisition_stage` is counted **directly from the same `Parcel` fields**
the blocker engine's B2/B3 detectors read:

| ML feature | Source field | Also read by |
|---|---|---|
| `ownership_disputes` | `parcel.ownershipDispute != 'No'` | B2 (`detection.py` bucket `ownership_or_partition`) |
| `document_issues` | `parcel.documentStatus in {'Disputed','Missing Documents'}` | B2 (`detection.py` bucket `document`) |
| `compensation_pending_pct` | `parcel.compensationStatus != 'Disbursed 100%'` | B3 (`detection.py` `compensationStatus` check) |
| `litigation_cases` | `parcel.courtCaseStatus in {'Active - Stay Order','Pending Hearing'}` | B3 (corroboration) and B4 (`bare_court_restraint`) |

**Consequence, if this design were careless:** `Exposure = likelihood × blocker_severity` would
multiply the *same* title-dispute fact into the score twice — once because it raised
`delay_probability` (via `ownership_disputes`), again because it raised `blocker.severity` (B2
`DETECTED`, derived from the same field). A case would look doubly dangerous for one underlying
fact, not two independent ones.

**Resolution, implemented as a hard rule for Step 8B:** Exposure's non-likelihood terms are
restricted to information the ML feature schema provably does not encode at all:

- **Legal consequence class** (via B1) — the legal clock has no ML feature counterpart whatsoever;
  entirely independent evidence.
- **Possession-blocking status** (via B4's `affects_possession` flag, a categorical yes/no, not a
  re-count of court cases) — `litigation_cases` counts *how many* cases exist; B4's flag encodes
  *whether a specific verified restraint blocks possession*, a different, non-redundant fact.
- **Downstream extent** (§6) — never an ML feature; the model only knows the project's *total*
  `parcel_count`, never which specific parcels are downstream of a given blocker.
- **Project scale proxy** (`project_value_crores`, `total_length_km`) — never an ML feature.

**Blocker *severity* for B2/B3 specifically is deliberately NOT used as an exposure multiplier** —
it is the same evidence-count signal the ML model already saw. It is still used (as designed in
Step 7A/7B) for *primary blocker selection* and for gating *confidence*, which are different jobs
from magnifying a consequence score. B1 and B4 severity are exempt from this restriction: B1's
severity comes from the legal clock (no ML overlap at all), and B4's from possession-restraint
evidence (categorical, not a duplicate of the `litigation_cases` count).

---

## 6. Possession-impact design

**Operational definition of "downstream," proposed for Step 8B (a genuine modeling choice, not a
fact already in the data — flagged as an open question in §23):** parcel *Q* is downstream of
blocked parcel *P* if, projecting both parcels' `centerCoordinate` onto the project's
`corridorPath` polyline and measuring cumulative arc-length from the project's `startCoords`, *Q*'s
projected position is farther from the start than *P*'s, up to the next already-`possessionStatus
== 'Complete'` parcel or the project end. This assumes a single, linear, start-to-end corridor
build sequence — a real assumption that may not hold for every `projectType` (a "Bypass" or
"Freight Corridor" could have multiple simultaneous work fronts) — **explicitly not validated by
this audit**, see §23.

**What is genuinely computable today, and what is not:**

| Capability | Status |
|---|---|
| "This blocker affects parcel P itself, area X acres" | **EXISTING** — trivial, already wired into every `Blocker.downstream_extent` (`affected_parcel_count=1`, `affected_area_acres=parcel.areaAcres`). |
| "This blocker prevents possession" | **EXISTING** — B4's `affects_possession` flag, B3's (interface-only) flag. |
| "N other parcels are downstream of P" | **DERIVABLE**, not existing — requires the point-on-polyline projection above, using only fields that already exist (`Project.corridorPath`, `Parcel.centerCoordinate`) but with **zero existing computation code** (confirmed: `GisMapView.tsx` has no adjacency/downstream logic at all, and no other file computes it either). |
| "X% of the alignment is affected" | **DERIVABLE** from the same projection, dividing affected arc-length by `Project.totalLengthKm`. |
| "This creates a disconnected/critical segment" | **MISSING** — no existing data supports identifying whether a specific parcel is a structural chokepoint (e.g. the only crossing of a river) versus an arbitrary point on a otherwise-parallel-workable stretch. Would need either real engineering/survey input or a much cruder proxy (e.g. "is this parcel inside the corridor section with the project's own highest `bottleneckCount`" — a weak, demo-only proxy, not a real criticality determination). |
| "Local vs corridor-wide" | **DERIVABLE** at a coarse level via which `corridorSections[]` entry the projected point falls nearest to (matching against each section's own order in the array, since `chainageKm` is unparsed text) — coarser and less precise than the parcel-level projection above, but requires no new field, only new code. |

**Recommendation for Step 8B's first cut (demo-safe, explicitly not "production downstream
impact"):** ship only the row already available today — `affected_parcel_count=1`,
`affected_area_acres=parcel.areaAcres` — exactly what `blockers/detection.py` already produces,
with `contiguous_segment_ref`/`critical_path_impact` left `None` and the exposure formula's
downstream term treating that as the documented neutral/self-only band (§9), not zero and not
maximal. Implementing the real point-on-polyline projection is legitimate, valuable, *deferred*
follow-up work for Step 8B or a later step — not a prerequisite this design blocks on, and it must
never be silently assumed to already exist in any UI copy.

---

## 7. Legal-severity integration

The exposure engine **consumes `Blocker.severity`/`Blocker.status` for a case's B1 blocker
directly** (§C of the Step 7A audit, unchanged and already implemented) — it never re-reads
`StatutoryClockResult` itself and never performs date arithmetic. This is a structural guarantee,
not just a convention: the exposure engine's package should import from `backend/blockers/`, never
from `backend/legal/`, mirroring exactly the one-way dependency Step 7A/7B already established
(legal → blockers → exposure, never reversed).

The `APPARENT_LAPSE`-is-not-a-legal-lapse and `CLOCK_UNCERTAIN`-is-capped distinctions require **no
new logic** — they are already encoded in `Blocker.status`/`Blocker.severity`/`Blocker.notes` by
B1's existing mapping (`docs/step7a-blocker-engine-audit.md` §C table, `backend/blockers/detection.py`
`detect_b1`). The exposure engine's obligation is narrow and mechanical: **carry `Blocker.notes`'s
disclaimer text through into any exposure/priority explanation verbatim** whenever the underlying
blocker is B1/`CONFIRMED` — never paraphrase "confirms an apparent lapse" into "confirms a lapse."

---

## 8. Blocker integration

Per the audited enums (`backend/blockers/enums.py`, confirmed this step): `BlockerStatus` =
`DETECTED`/`SUSPECTED`/`CONFIRMED`/`INSUFFICIENT_EVIDENCE`/`CONFLICTED`/`RESOLVED`;
`BLOCKER_STATUS_CONFIDENCE_RANK` = `{CONFIRMED: 2, DETECTED: 1, SUSPECTED: 0}`;
`PRIMARY_ELIGIBLE_STATUSES` = `{CONFIRMED, DETECTED, SUSPECTED}`.

- **Blocker severity → exposure magnitude** (B1/B4 only, per §5's double-counting rule; B2/B3
  severity is excluded from the magnitude term but still used for primary-blocker selection).
- **Blocker confidence → a multiplicative discount, not a separate score.** A `SUSPECTED` B1 (rank
  0) should contribute less to exposure than a `DETECTED` (rank 1) or `CONFIRMED` (rank 2) B1 of
  the *same* severity — implemented as `confidence_discount = (rank + 1) / 3` (so `SUSPECTED` →
  0.33×, `DETECTED` → 0.67×, `CONFIRMED` → 1.0×), applied to that blocker's severity contribution
  only.
- **The primary blocker is necessary but not sufficient.** A case with `B1 DETECTED` *and* `B3
  DETECTED` genuinely carries more risk than one with `B1 DETECTED` alone (a ticking clock *and* an
  independent reason the required milestone can't be met). Recommendation: exposure =
  `primary_blocker_contribution + capped_secondary_bonus`, where the secondary bonus is
  `min(0.15 × Σ(secondary blocker severity_rank × confidence_discount), 0.5)` (an illustrative,
  explicitly tunable cap — see §23) — bounded so four weak `SUSPECTED` secondaries can never
  out-rank one `CONFIRMED CRITICAL` primary (anti-gaming, §18; monotonicity, §19).
- **`CONFLICTED` blockers contribute nothing positive** to the magnitude term (already excluded
  from `PRIMARY_ELIGIBLE_STATUSES`) but **must** set an explicit `unresolved_conflict: true` flag
  on the exposure/priority record and downgrade its confidence label (§11) — never silently
  dropped, never allowed to inflate urgency either.
- **`NO_EVIDENCE`/`EVIDENCE_OF_NO_BLOCKER`** never raise a `Blocker` row at all (per
  `blockers/enums.py`'s own design) — so "nothing to add" is already the correct, automatic
  behavior; no special-casing needed in the exposure engine.
- **`INSUFFICIENT_EVIDENCE`** contributes nothing positive either, and — like `CONFLICTED` — sets a
  confidence-downgrade flag rather than being silently invisible.
- **No hardcoded `B1 > B2 > B3 > B4`.** Exposure's blocker term is keyed off `severity`/`status`
  exactly as `ranking.py` already proves is type-order-independent (`RankingSeverityFirstTests
  .test_never_hardcoded_b1_over_b2`) — reusing that same evidence, not blocker-type identity.

---

## 9. Exposure formula options

| Approach | Assessment |
|---|---|
| **Multiplication** (`likelihood × consequence × downstream × criticality`) | Rejected as the primary mechanism: any single missing/zero factor collapses the *entire* product to zero, hiding real risk — exactly the failure mode the brief warns against ("resistant to one missing field dominating the score"). Also punishes legitimate uncertainty (a `SUSPECTED` blocker) far more harshly than warranted. |
| **Weighted normalized sum** | Recommended (below) — each axis converted to a bounded ordinal band, summed with fixed weights. Missing/unknown inputs degrade gracefully to a neutral band rather than zeroing the total. Structurally monotonic (non-negative weights ⇒ increasing any one input band can never decrease the total). |
| **Ordinal priority (rank-only, no numeric score)** | Good for tie-proof ranking, poor for the "why" explanation a government tool needs (§12/§24's worked example needs a numeric, explainable breakdown, not just "case 3 of 40"). Used as a *secondary* output (the banded label), not the sole one. |
| **Threshold-based bands** | Good for the UI-facing label (`LOW`/`MODERATE`/`HIGH`/`CRITICAL`), poor as the sole underlying computation (loses the fine-grained tie-breaking and explainable component trace a weighted sum gives). |

**Recommended: a banded weighted sum, presented as both a numeric score (auditability, tie-break)
and a threshold-derived band (UI label)** — combining the second and fourth rows above rather than
picking one exclusively, which the brief explicitly permits ("Evaluate... Choose the most
defensible approach").

---

## 10. Recommended baseline formula

```
legal_band        = BLOCKER_SEVERITY_RANK[primary_blocker.severity]  if primary_blocker.blocker_type == B1
                     else 1 (neutral)                                 if no B1 blocker raised
                     -- confidence-discounted per §8

possession_band    = 4  if any raised blocker has affects_possession == True
                          AND status in {CONFIRMED, DETECTED}
                     1 (neutral)  otherwise (no possession-blocking evidence found or only SUSPECTED)

downstream_band     = min(4, affected_parcel_count)   -- today, always 1 (self only, §6) ⇒ band = 1
                       (this term is inert until Step 8B ships real downstream computation --
                        recorded honestly, not inflated)

project_scale_band  = ordinal bucket of project_value_crores (e.g. quartiles across all projects
                       currently in the database) -- a labeled PROXY, never called "criticality"
                       in any user-facing text without that qualifier

secondary_bonus      = min(0.5, 0.15 * sum(severity_rank(b) * confidence_discount(b)
                                            for b in secondary_blockers))

Exposure_raw   = w1*legal_band + w2*possession_band + w3*downstream_band + w4*project_scale_band
                 + secondary_bonus
Exposure_score = round(100 * Exposure_raw / (4*(w1+w2+w3+w4) + 0.5))   -- rescaled to 0-100
Exposure_band  = CRITICAL (>=75) | HIGH (>=50) | MODERATE (>=25) | LOW (<25)
```

Illustrative default weights `w1=0.35, w2=0.30, w3=0.20, w4=0.15` (sum to 1.0) — **explicitly
tunable, not domain-validated**, see §23. `w2` (possession) is weighted close to `w1` (legal)
deliberately: a case that cannot physically proceed to possession is close to as consequential as
one whose clock is expiring, even before any deadline math.

**Missing-value handling (explicit, per the brief's requirement):** every band above has a defined
**neutral value (band = 1)** for "unknown/not computed," never 0 (would understate risk by
pretending a real unknown is confirmed-safe) and never the maximum (would fabricate false
certainty). `project_scale_band` defaults to neutral when `project_value_crores` is null.
`downstream_band` defaults to 1 (self-only) rather than "unknown," since the parcel itself is
always at least that much extent. Every neutral substitution is recorded in the component-trace
JSON (§14) so "we didn't know this" is visible, not silently absorbed into the score.

**Monotonicity:** guaranteed structurally (non-negative weights, non-negative bands, capped
non-negative bonus) — increasing any one band while holding the others fixed cannot decrease
`Exposure_score`. Verified by test (§19, test 1).

---

## 11. Priority formula / ranking design

**Priority ≠ Exposure.** Per the brief's own worked example (a huge-exposure case 18 months out
vs. a small-exposure case 20 days out), Priority additionally weighs *urgency* (independent of,
not double-counted with, `legal_band` — see below) and *actionability*.

```
urgency_band = 4  if days_remaining is not None and days_remaining <= 14
             = 3  if days_remaining <= 30
             = 2  if days_remaining <= 90
             = 1  if days_remaining > 90, OR no statutory clock exists at all (neutral, not 0)
             -- keyed on the RAW day-count from B1's linked clock, distinct information from
             -- legal_band (which is keyed on clock STATUS/CONSEQUENCE, a categorical read) --
             -- these are two different facts about the same clock, not the same fact counted twice

actionability_band = 4  if primary_blocker.status in {CONFIRMED, DETECTED}  (a concrete owner +
                         action exist right now)
                    = 1  if primary_blocker.status in {SUSPECTED, CONFLICTED, INSUFFICIENT_EVIDENCE}
                         or no blocker at all (neutral -- nothing concrete to act on yet)

Priority_raw   = v1*Exposure_band_equivalent + v2*urgency_band + v3*actionability_band
                 (Exposure_band_equivalent = round(Exposure_score / 25), i.e. the 0-4 band Exposure
                 already produced, reused rather than re-computed)
Priority_score = round(100 * Priority_raw / (4*(v1+v2+v3)))
Priority_band  = ACT_NOW (>=75) | SOON (>=50) | MONITOR (>=25) | WATCH (<25)
```

Illustrative default weights `v1=0.4, v2=0.4, v3=0.2` — chosen so urgency carries **equal weight**
to exposure, which is what makes the brief's own example achievable: a 20-day, modest-exposure
case (`urgency_band=4`, `exposure_band≈2`) can score `0.4*2+0.4*4+0.2*a` vs. an 18-month,
large-exposure case (`urgency_band=1`, `exposure_band=4`) scoring `0.4*4+0.4*1+0.2*a` — the former
wins under these weights, as the brief's example requires. **These weights are a design choice
this audit makes explicit and defends, not a fact derived from data — flagged for domain
calibration in §23.**

Priority is **never suppressed to invisible** — see §13 for why "hide it" is rejected as unsafe.

---

## 12. Uncertainty design

| Situation | Design |
|---|---|
| `CLOCK_UNCERTAIN` | B1 already caps at `SUSPECTED`/`WATCH` (Step 7A §C) — `legal_band` inherits that cap automatically by construction (never re-elevated). `confidence_label` (below) downgraded. |
| `EXTENSION_UNVERIFIED` | B1 already reports `DETECTED`/`HIGH`, not `CONFIRMED` — inherited, not re-derived. |
| `CONFLICTED` blocker evidence | Excluded from positive contribution (§8); `unresolved_conflict=true` flag set; `confidence_label` forced to `NEEDS_VERIFICATION`. |
| Insufficient possession evidence | `possession_band` stays neutral (1); not silently read as "no possession issue." |
| Missing downstream GIS | `downstream_band` stays neutral/self-only (1); the component trace records "not computed," never "computed as zero impact." |
| Missing project criticality | `project_scale_band` stays neutral (1); `confidence_label` downgraded one notch if this is the *only* missing input, more if combined with others. |

**A parallel, always-shown `confidence_label`** (`VERIFIED` / `PARTIAL` / `NEEDS_VERIFICATION` /
`INSUFFICIENT`) is the recommended mechanism for "separate urgency from confidence" — it is never
merged into the numeric score. A high `Priority_score` with `confidence_label = NEEDS_VERIFICATION`
must render visibly differently from the same score with `VERIFIED`, so an officer never mistakes
an unresolved-conflict case for a settled one.

**Suppress vs. cap vs. "needs verification" — recommendation: cap + tag, never suppress.**
Suppressing a case from a ranked list because its evidence is uncertain would hide it from an
officer filtering "top priority only" — a real, unresolved risk becoming *invisible* is more
dangerous than it appearing with a visibly downgraded confidence label. The only case that is
correctly absent from a ranked list is one with **no evidence to rank at all** (no clock, no
blocker, no prediction) — that is "not evaluated," a different state from "evaluated and
uncertain."

---

## 13. Owner assignment design

**No new owner-assignment logic.** The exposure/priority record surfaces
`primary_blocker.owner_role`/`responsible_authority` verbatim — the mapping is already
deterministic, evidence-backed, and explicitly not-LLM (B1→Collector/CALA/LAO, B2→Revenue/
Registration, B3→Compensation Authority/LARR, B4→context-dependent including the dual-owner case,
all per `backend/blockers/detection.py`). If no blocker was raised at all for a case that still
shows meaningful exposure (e.g. driven purely by a high ML probability with no deterministic
blocker found), owner defaults to a generic, clearly-labeled `"Project Director / Planner (no
specific blocker identified — manual triage required)"` — an explicit low-confidence fallback,
never a fabricated specific authority. **This mapping (like Step 7A's own K section already
states) is a defensible starting default, not a validated government organizational chart** —
domain validation recommended before any production use.

---

## 14. Recommended-action design

**No new action-selection algorithm.** "The ONE recommended action" is simply the primary
blocker's `ActionRecommendation` (already implemented, `backend/blockers/actions.py`,
non-LLM, structured, evidence-citing) — the exposure/priority record references it by
`action_id`, it does not duplicate or regenerate it. If secondary blockers exist, their own
actions remain independently queryable (already modeled) but are not promoted to "the" action.
If no blocker was raised, no action is surfaced — an explicit `null`, never a fabricated
placeholder instruction.

This directly assembles the brief's target explanation chain (§24) from already-existing,
already-tested parts: `WHY THIS CASE` = exposure component trace; `WHY NOW` = urgency band;
`WHAT IS BLOCKING IT` = primary blocker; `HOW MUCH IMPACT` = downstream/possession bands; `WHO
SHOULD ACT` = primary blocker's owner; `WHAT SHOULD THEY DO` = primary blocker's action.

---

## 15. Data model proposal

**One new table, not several — `exposure_assessments`.** Exposure and priority are two numbers
produced by one computation pass over the same inputs; splitting them into separate
`exposure_assessments`/`priority_assessments` tables would duplicate the row identity, FK set,
and provenance trace for no benefit — the same reasoning Step 7A used to avoid an unnecessary
`blocker_conflicts` table. No separate `possession_impacts` table either: `downstream_extent`
already lives inline as a JSON-able structure on `Blocker` (Step 7B precedent); this design keeps
the possession/downstream component inline on the same assessment row, not normalized out.

```
exposure_assessments   (append-only, mirrors StatutoryClockRecord/BlockerRecord precedent)

id                      String PK (server-generated, e.g. "EXP-<uuid hex>")
case_reference          String, indexed          -- same scoping convention as legal/blockers (no Case entity)
project_id              FK projects.id, nullable, ON DELETE SET NULL
parcel_id               FK parcels.id, nullable, ON DELETE SET NULL

prediction_id           String, nullable   -- REFERENCE only (not FK-enforced join), the
                                            -- predictions.id this run read; nullable if no
                                            -- prediction existed yet
primary_blocker_id      FK blockers.id, nullable, ON DELETE SET NULL
secondary_blocker_ids   JSON list[str]     -- reference only, mirrors Blocker.affected_clock_ids' own pattern

exposure_score          Float (0-100)
exposure_band           String  (LOW | MODERATE | HIGH | CRITICAL)
priority_score           Float (0-100)
priority_band            String  (WATCH | MONITOR | SOON | ACT_NOW)
confidence_label          String  (VERIFIED | PARTIAL | NEEDS_VERIFICATION | INSUFFICIENT)
unresolved_conflict        Boolean, default False

component_trace           JSON   -- {"legal_band":..,"possession_band":..,"downstream_band":..,
                                     "project_scale_band":..,"urgency_band":..,
                                     "actionability_band":..,"secondary_bonus":..,
                                     "neutral_substitutions":[...], "weights_version": "..."}
recommended_action_id      String, nullable  -- reference to blocker_actions.id

engine_version              String   -- mirrors CALCULATION_VERSION/ENGINE_VERSION pattern
calculation_date             Date     -- explicit "as of", never implicit wall-clock
notes                          Text
calculated_at                  DateTime(timezone=True)
created_at                      DateTime(timezone=True), indexed
```

- **Append-only**, same audit-trail reasoning as `StatutoryClockRecord`/`BlockerRecord`: every
  recomputation is a new row; "current" = latest `created_at` per `case_reference`, following the
  exact `evaluation_run_id`/`latest_only` pattern `blockers/db_crud.py` already implements.
- **Recalculable/versioned** via `engine_version`, following `ENGINE_VERSION`/
  `CALCULATION_VERSION`'s existing precedent.
- **Linked to prediction** by reference (`prediction_id`, not FK — predictions are queried via the
  existing `crud.latest_project_prediction`/`latest_parcel_prediction` pattern, no new join
  needed). **Linked to blocker** by real FK (`primary_blocker_id`). **Linked to clock** only
  *transitively*, via the primary blocker's own `affected_clock_ids` — no direct
  `exposure_assessments → statutory_clocks` FK, to avoid duplicating a linkage that already exists
  one hop away (minimal-schema discipline).
- **Provenance-aware**: `component_trace` cites the exact source values/IDs behind every band,
  including every neutral-substitution decision — reproducible and auditable by construction.

---

## 16. API proposal

Existing convention, confirmed this step (`backend/routers/predictions.py:180-217`,
`backend/routers/blockers.py`): `GET /api/projects/{id}/X`, `GET /api/projects/{id}/X/latest`,
`GET /api/parcels/{id}/X`, same pattern for parcels. Step 8B should mirror this exactly:

```
GET /api/exposure?project_id=&parcel_id=&min_band=&latest_only=      -- filtered list
GET /api/exposure/{assessment_id}                                     -- full record incl. component_trace
GET /api/projects/{project_id}/exposure/latest
GET /api/parcels/{parcel_id}/exposure/latest
GET /api/exposure/priority-queue?project_id=&limit=&min_band=         -- ** the actual answer to
                                                                            "what should I act on
                                                                            first" ** — ranked by
                                                                            priority_score desc
                                                                            across cases
```

**`priority-queue` is the single most important endpoint this design adds beyond the brief's own
suggested list** — the per-project/per-parcel `/exposure` and `/exposure/latest` endpoints alone
answer "how exposed is this one case," not "which case, among all of them, should I act on first."
Recommended response fields for every endpoint: `exposure_score`, `exposure_band`,
`priority_score`, `priority_band`, `confidence_label`, `unresolved_conflict`, `component_trace`,
`primary_blocker_id` (+ inline owner/action summary, mirroring how `GET /api/blockers/{id}`
already inlines evidence/actions), `recommended_action_id`. Read-only, no write endpoint — writes
happen only via a `db_crud.py`-equivalent `persist_case_assessment`, called from a script/test, not
HTTP — the exact same discipline Steps 6B/7B already established. **Not implemented in this step.**

---

## 17. Demo vs. production boundary

| Capability | DEMO (Step 8B can honestly ship) | PRODUCTION (needs real data) |
|---|---|---|
| Legal severity/urgency | Real — Step 6B's actual computation | Same, once rule sets clear legal review (`RuleApprovalStatus`, already `PENDING_LEGAL_REVIEW`) |
| Blocker severity/confidence/owner/action | Real — Step 7B's actual computation | Same, plus the provenance entities Step 7A's Data Gap table (B2-1/B3-1/B4-2/B4-3) already flagged as missing |
| Downstream/possession impact | Self-parcel only (`affected_parcel_count=1`); labeled explicitly, not claimed corridor-wide | Real point-on-polyline projection (§6) *and* validated build-sequence assumptions |
| Project criticality | A labeled proxy from `project_value_crores`/`total_length_km` | A real planning-authority-issued criticality classification |
| ML likelihood | Real mechanism, synthetic-trained model | A model trained/validated on real acquisition outcomes |
| Exposure/priority weights (§10/§11) | Illustrative defaults, clearly marked tunable | Domain-calibrated weights, signed off by a process owner |

**Do not claim** (in any future UI copy) that downstream possession impact or project criticality
is "measured" — both are explicitly a proxy/self-only placeholder in the demo, per this table.

---

## 18. Edge-case matrix

| # | Case | Design behavior |
|---|---|---|
| 1 | No statutory clock | `legal_band`/`urgency_band` = neutral (1); confidence downgraded; case still ranked on remaining axes. |
| 2 | `CLOCK_UNCERTAIN` | Inherited cap from B1's `SUSPECTED` (§12); never re-elevated. |
| 3 | `APPARENT_LAPSE` | `legal_band` = max; B1's disclaimer text carried verbatim into the explanation (§7); never rendered as a confirmed legal lapse. |
| 4 | Extension claimed, unverified | B1 `DETECTED`/`HIGH` inherited; `confidence_label` = `PARTIAL`. |
| 5 | Multiple blockers | Primary term + capped secondary bonus (§8). |
| 6 | Conflicting blocker evidence | Excluded from magnitude; `unresolved_conflict=true`; `NEEDS_VERIFICATION`. |
| 7 | No downstream parcels known | `downstream_band` = neutral/self-only (1), not 0. |
| 8 | Missing GIS geometry | Same as #7; `component_trace` records "not computed." |
| 9 | Missing project criticality | `project_scale_band` neutral (1); confidence downgraded one notch. |
| 10 | Very high probability, low consequence | Priority stays moderate — likelihood is one weighted term among several, never a standalone gate; demonstrates prediction≠exposure working. |
| 11 | Low probability, catastrophic consequence | Not buried — likelihood never zeroes the exposure/consequence terms (multiplicative gating rejected in §9 precisely for this reason). |
| 12 | Huge exposure, 18 months remaining | `urgency_band` low pulls `Priority_score` down relative to raw exposure — the brief's own worked example, achievable under §11's weights. |
| 13 | Small exposure, 20 days remaining | `urgency_band=4` can push `Priority_score` above #12's case — same example, other direction. |
| 14 | `EVIDENCE_OF_NO_BLOCKER` | No `Blocker` row exists — contributes nothing; exposure from remaining axes only, never treated as "case is clear" unless *all* axes are also clean. |
| 15 | Duplicate/retry prediction records | Use `crud.latest_project_prediction`/`latest_parcel_prediction`'s exact existing tie-break (`generated_at desc, created_at desc`) — reused verbatim, not reinvented. |
| 16 | Stale prediction | `component_trace` records the source prediction's `generated_at`; a policy-driven staleness threshold (open question, §23) should downgrade `confidence_label`, never silently trust an old row as current. |
| 17 | Stale blocker evidence | Same mechanism via `blockers` `calculated_at`/`created_at` and the existing `evaluation_run_id`/`latest_only` pattern. |
| 18 | Synthetic/demo data | Every assessment traceable (via its `component_trace`'s cited source IDs) back to `SourceType.SYNTHETIC_DEMO`-tagged evidence where applicable — never presented as government data, per [[status-truthfulness]]. |

---

## 19. Anti-gaming / provenance design

- **Downstream extent must always be server-computed** from `corridorPath`/GPS data, never
  accepted as an officer-editable number — today it's hardcoded to the parcel's own trivial
  `areaAcres`/count, which has no manipulable surface; this constraint matters once §6's real
  projection ships.
- **Blocker severity cannot be manually overridden** — Exposure consumes `Blocker.severity` exactly
  as the deterministic engine computed it; no API path in this design accepts a caller-supplied
  severity value.
- **Project-scale inputs (`project_value_crores`, `total_length_km`) are officer-editable today**
  via `PATCH /api/projects/{id}` — recommend `project_scale_band`'s weight stay deliberately small
  (`w4=0.15`, §10) and that any *change* to these fields after a project's creation be visible in
  `AuditLog` (already an existing table) so a criticality-inflation attempt is at least
  after-the-fact auditable; a "locked after creation" or approval-gated field is a policy decision
  flagged in §23, not implemented here.
- **Stale predictions/evidence cannot silently inflate or deflate a score** — every assessment
  cites exactly which `prediction`/`blocker` row (with its own timestamp) it used (§15/§18 edge
  cases 15–17); an officer can always check "how old is the evidence behind this number."
- **Unverified legal dates never bypass the legal engine's own discipline** — Exposure only ever
  reads `Blocker.severity` (already gated by `SOURCE_AUTHORITY_RANK`/`EvidenceVerificationStatus`
  through the legal/blocker engines), never a raw `AcquisitionEvent` date directly.

---

## 20. Test strategy

Deterministic `unittest` tests (mirroring `backend/blockers/tests/`'s own conventions), at least
the following 12 concrete scenarios:

1. **Monotonicity**: increasing `legal_band` alone (all else fixed) never decreases `Exposure_score`.
2. **Ranking**: three synthetic cases with hand-computed expected bands rank in the expected order.
3. **Uncertainty cap**: a `CLOCK_UNCERTAIN`-backed case never reaches `exposure_band=CRITICAL`
   regardless of every other input being maxed.
4. **Missing data**: a case with no downstream/no project-criticality data produces a valid,
   non-crashing, non-zero, non-max score with `confidence_label` downgraded (not suppressed).
5. **Blocker combination, bounded**: `B1+B2+B3` all `DETECTED` scores higher than `B1 DETECTED`
   alone, but by no more than the documented `secondary_bonus` cap (0.5).
6. **Urgency worked example**: a 20-day/modest-exposure case outranks an 18-month/large-exposure
   case under the default weights (§11's own example, asserted directly).
7. **Possession impact**: a `B4 CONFIRMED` (possession blocked) case's `possession_band` is
   provably at maximum versus an otherwise-identical case with no B4 raised.
8. **Project criticality, bounded**: two identical cases differing only in `project_value_crores`
   rank differently, but by a bounded margin that a `w4=0.15` weight cannot let dominate `w1`/`w2`.
9. **Tie-breaking**: two cases with identical component bands resolve via a documented, stable
   tiebreak (e.g. `case_reference` ascending) — reproducible across repeated runs.
10. **Stale evidence**: a case whose latest blocker/prediction run predates a controlled staleness
    threshold is flagged/downgraded in `confidence_label`, asserted with an explicit fixed
    `calculated_at`.
11. **Reproducibility**: running the assessment twice on identical input state yields an identical
    `exposure_score`/`priority_score`/band (mirrors the blocker engine's own determinism tests).
12. **Confidence-gating**: a `CONFIRMED` B1 outranks a `SUSPECTED` B1 of otherwise-identical
    severity (structurally the same pattern `ranking.py`'s own
    `RankingConfidenceTiebreakTests` already proves for blockers, reused for exposure).

---

## 21. Implementation plan for Step 8B

1. **Sign-off gate**: circulate this document — especially §9–§11's formula/weights (explicitly
   marked illustrative, not domain-validated) and §6's downstream-impact scope decision (self-only
   vs. real polyline projection) — before writing code, mirroring the Step 7A→7B gate.
2. **Pure-logic package** `backend/exposure/` (no DB, no HTTP, no ML import — mirrors
   `backend/blockers/`'s own structure): `enums.py` (bands, confidence labels),
   `models.py` (frozen dataclasses: `ExposureAssessment`, `ComponentTrace`), `scoring.py`
   (the §10/§11 formulas as pure functions over `Blocker`/`Prediction`-shaped inputs),
   `engine.py` (orchestrator: pulls the latest blocker set + latest prediction for a case, computes
   both scores in one pass), `demo_scenarios.py` (≥6 scenarios covering §18's edge cases),
   `db_models.py`/`db_schemas.py`/`db_crud.py`, `tests/`.
3. **Unit tests** per §20, run via `python -m unittest discover -s exposure/tests`.
4. **Persistence**: `exposure_assessments` table (§15), one additive Alembic migration.
5. **Read-only API**: `backend/routers/exposure.py` (§16), mounted via the exact
   degrade-gracefully `try/except` pattern `main.py` already uses twice (`legal_router`,
   `blockers_router`).
6. **Regression**: full existing suite (66 legal + 90 blockers) must stay green; every existing
   endpoint must return unchanged output; `npm run build` must stay clean (no frontend touched).
7. **Explicitly deferred beyond 8B**: real downstream/GIS projection (§6 — a legitimate follow-up,
   not required for 8B's first cut), owner/action org-chart validation (§13), weight calibration
   (§23), frontend surfacing, ML feature wiring, precedent retrieval, what-if simulation.

---

## 22. Files Step 8B MAY modify

- **New**: `backend/exposure/**` (enums, models, scoring, engine, demo_scenarios, db_models,
  db_schemas, db_crud, tests)
- **New**: `backend/routers/exposure.py`
- **New**: `backend/migrations/versions/*_add_exposure_engine_tables.py`
- **Additive edits only**: `backend/main.py` (mount block, mirroring the existing two), and
  `backend/migrations/env.py` (one import line, mirroring the existing two)
- **New**: `docs/step8b-exposure-priority-implementation-report.md`

`backend/crud.py`, `backend/legal/db_crud.py`, and `backend/blockers/db_crud.py` are **read/import
only** for Step 8B (reusing `latest_project_prediction`/`latest_parcel_prediction`/
`list_blockers`) — never edited.

## 23. Files Step 8B MUST NOT modify

`ai-model/**`, `backend/inference_service.py`, `backend/demo_fallback.py`,
`src/services/predictionFeatures.ts`, `src/services/mlApiService.ts`, `src/context/AppContext.tsx`,
`src/types/index.ts`, `backend/legal/**` (entire package — consumed only, never edited),
`backend/blockers/**` (entire package — consumed only, never edited), `backend/models.py`,
`backend/schemas.py`, `backend/crud.py`, every existing router, every existing frontend component,
`src/data/mockData.ts`.

---

## 24. Open legal/domain questions

1. What staleness threshold (hours/days) should downgrade `confidence_label` for predictions and
   blocker evaluations?
2. Is the linear, single-direction corridor build-sequence assumption (§6) valid for every
   `projectType` (National Highway/Expressway/Freight Corridor/Bypass/Other), or do some project
   types genuinely have multiple simultaneous work fronts that break the "everything after this
   point is downstream" definition?
3. Are the illustrative exposure/priority weights (§10/§11) acceptable as a starting default, or
   does a real planning/legal stakeholder need to set them before any non-demo use?
4. Should `project_value_crores`/`total_length_km` genuinely stand in for "project criticality," or
   does the real government process have an actual, separate project-priority classification that
   should replace this proxy entirely?
5. Should `CONFLICTED`-evidence cases be entirely excluded from a "top priority" ranked list (to
   avoid acting on disputed evidence) or merely flagged while still ranked, as this design
   recommends?
6. Who has authority to approve/override project-level fields that factor into exposure — does a
   change to `project_value_crores` after creation need a review workflow, given §19's finding
   that it's otherwise officer-editable with only after-the-fact audit-log visibility?
7. Should Exposure/Priority ever surface to an officer as a single compact number, or does policy
   require the component breakdown to always be shown (transparency-by-default vs. a compact
   score with drill-down)?
8. Does `B4`'s dual-owner case (§K of the Step 7A audit) need to propagate into exposure's single
   `owner_role` surfacing as a list, or is picking one (and how) a decision this design still owes?

---

## 25. Final architecture diagram

```
Government Sources (not yet ingested — demo/synthetic today)
        |
Ingestion + Provenance (not yet implemented)
        |
Entity Resolution (not yet implemented)
        |
Canonical Parcel/Project  --------------------------------  backend/models.py (real, stable)
        |                                                          |
        v                                                          v
STATUTORY CLOCK  (backend/legal/, real, deterministic)     ML PREDICTION (backend/inference_service.py,
        |                                                   ai-model/**, real mechanism / synthetic-
        v                                                   trained model, via /predict, persisted
BLOCKER  (backend/blockers/, real, deterministic;           append-only in Prediction)
 consumes the clock result above, never recomputes it)             |
        |                                                    SHAP / Evidence (Prediction.shap_factors)
        v
POSSESSION IMPACT  (self-parcel only today, §6; real
 corridor-wide computation is DERIVABLE, not yet built)
        |
        +-------------------------------+
        |                               |
        v                               v
   EXPOSURE  <----------------------  (reads: blocker severity/confidence [never B2/B3's severity
   (§9/§10, banded weighted sum,       as a magnitude term, per §5's double-count guard], possession
    never multiplicative)              flag, downstream extent, project-scale proxy)
        |
        v
   PRIORITY  (§11: exposure_band + urgency_band [from B1's linked clock days_remaining] +
              actionability_band [primary blocker's status] -- NOT identical to exposure)
        |
        v
   OWNER  (= primary_blocker.owner_role/responsible_authority, verbatim, §13)
        |
        v
   ONE ACTION  (= primary_blocker's existing ActionRecommendation, verbatim, §14)
```

Every claim in the brief's target explanation (§22 of the brief) is sourced exactly as required:
"42 days remaining" → the linked `StatutoryClockResult` via B1; "predicted probability... high" →
`Prediction.delay_probability`; "primary blocker is B2" → `RankingResult.primary_blocker_id`;
"verified evidence supports the blocker" → that blocker's `BlockerEvidence` rows'
`verification_status`; "N downstream parcels" → `DownstreamExtent` (today: 1, honestly, until §6
ships); "critical to possession" → `affects_possession`; "exposure is high" → `Exposure_band`;
"owner should perform action Y" → the primary blocker's `owner_role` + `ActionRecommendation`. No
step in this chain is LLM-generated or invented; every box cites a deterministic rule, an ML
prediction (explicitly labeled as such), a blocker-evidence record, a GIS calculation (where it
exists), project metadata, or an explicit demo assumption (§17).

---

# STEP 8A COMPLETE — NO IMPLEMENTATION PERFORMED.
