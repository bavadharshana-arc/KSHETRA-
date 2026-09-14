# KSHETRA — Step 7A: B1–B4 Blocker Engine
## Audit + Architectural Design (no implementation)

**Status: AUDIT/DESIGN ONLY. No code, schema, migration, or frontend change was made in this
step.** This document is the sole deliverable.

Scope discipline followed throughout: the four blocker classes are **evidence-resolution
outputs**, never ML-feature reuse; the legal clock (Step 6B, `backend/legal/`) remains the sole
authority on statutory deadlines; `ai-model/**`, `backend/inference_service.py`,
`backend/demo_fallback.py`, `predictionFeatures.ts`, `AppContext.tsx`, and every existing
database table are read-only inputs to this audit, never edited.

---

## 0. Executive summary

KSHETRA's Step 6B legal-clock engine (`backend/legal/`) is a genuinely deterministic,
provenance-first system: every date comes from an `AcquisitionEvent` with a ranked `source_type`
and a `verified` flag; every duration comes from a `RuleSet` whose `duration_confidence` gates
whether the clock may ever report `CLOCK_CERTAIN`; every stay/extension either applies under an
explicit, sourced rule or the clock degrades to `CLOCK_UNCERTAIN` — never a guess. That
discipline is the correct foundation for the Blocker Engine, and this design reuses it directly
(`SourceType`, `SOURCE_AUTHORITY_RANK`, the conflict-preservation philosophy in `conflicts.py`,
the append-only philosophy in `db_models.py`) rather than inventing a parallel one.

The audit's single most important finding: **outside of B1 (which can be derived rigorously from
the Step 6B clock), the rest of KSHETRA's current data model cannot support a `CONFIRMED`
blocker.** `Parcel`'s title/record/compensation/possession fields (`ownershipDispute`,
`documentStatus`, `mutationStatus`, `compensationStatus`, `possessionStatus`,
`courtCaseStatus`/`ECourtRecord`, `revenueRecord.encumbranceStatus`) are **opinion-like status
labels with no provenance** — no `source_type`, no `verified` flag, no timestamp, no
distinguishing of "government record" from "demo seed string." They are structurally identical
in kind to what `Parcel.notificationDate` was before Step 6B (see
`docs/step6a-statutory-clock-audit.md` §18) — reusable as **illustrative seed input**, never as
load-bearing evidence for a `CONFIRMED` legal determination, until a provenance-carrying evidence
entity is built for them. This is reported honestly below (§C–F, §U) rather than worked around.

The design therefore separates, for every blocker class, what is **reachable today** (bounded at
`DETECTED`/`SUSPECTED`/`INSUFFICIENT_EVIDENCE`/`EVIDENCE_OF_NO_BLOCKER`) from what requires new,
explicitly-scoped evidence entities before `CONFIRMED` becomes honest (§U, Data Gap table).

No `Case` entity is introduced — same conclusion Step 6B reached (`db_models.py` lines 40–54),
for the same reason: `case_reference` + `project_id` + optional `parcel_id` remain adequate
scoping, and the blocker engine reuses that scoping unchanged rather than re-litigating it.

---

## A. Existing relevant architecture

| Layer | File(s) | Relevant to blockers because |
|---|---|---|
| Legal clock engine (pure) | `backend/legal/{enums,dates,events,conflicts,extensions,stays,rule_sets,clock_engine}.py` | B1 is derived directly from `StatutoryClockResult`. `SourceType`/`SOURCE_AUTHORITY_RANK` (enums.py:23-47) and the conflict-preservation pattern (conflicts.py) are reused verbatim, not reinvented. |
| Legal persistence | `backend/legal/db_models.py`, `db_schemas.py`, `db_crud.py` | Structural precedent: human-readable string PK for catalog data, UUID PK for newly-invented append-only entities, nullable FK + `SET NULL` on delete (never CASCADE) for historical/evidentiary rows, JSON columns for nested structures. |
| Legal read API | `backend/routers/legal.py`, mounted at `/api/legal` via a degrade-gracefully `try/except` in `backend/main.py:92-97` | Direct precedent for a future `backend/routers/blockers.py` mount — same pattern, same "read-only first, no recompute endpoint" discipline. |
| Core persistence | `backend/models.py` (Project, Parcel, Alert, CaseAction, AuditLog, Prediction) | Parcel's title/record/compensation/possession fields are the primary candidate evidence source for B2/B3/B4 (see §0, §U). `Prediction`/legal's `StatutoryClockRecord` establish the append-only-history pattern this design reuses for `blockers`. |
| Core CRUD API | `backend/routers/{alerts,case_actions,parcels,projects,predictions}.py`, `backend/crud.py`, `backend/schemas.py` | `Alert` and `CaseAction` are the two entities a blocker output would eventually connect to (§O, §K). |
| ML boundary | `backend/inference_service.py`, `src/services/predictionFeatures.ts` | The exact 7-field `FastApiCaseInput` schema (`predictionFeatures.ts:106-114`) the blocker engine must **not** touch or be confused with (§3, §P). |
| ML narrative fallback | `backend/demo_fallback.py` | Confirms the anti-pattern to avoid: `litigation_cases > 0`, `ownership_disputes >= 5` etc. already drive narrative SHAP-style labels there (lines 88-101, 134-149, 210-218) — that is aggregate-feature narrative generation, not evidence resolution, and must never be mistaken for or merged with the blocker engine. |
| Frontend types | `src/types/index.ts` | Canonical field domains for every candidate B2/B3/B4 evidence field (`Parcel`, `ECourtRecord`, `BhoomiRevenueRecord`, `BhuvanGisRecord`, lines 150-261); `Alert`/`CaseAction`/`NotificationItem` shapes for §O/§K. |
| Prior audit | `docs/step6a-statutory-clock-audit.md` | §16 already sketches `Case State + Statutory Clock State + Blockers + Process Features → ML Model` as a **future** architecture (line 625) — this step is that anticipated "Blockers" box, designed now, still not wired to ML. §18/§19 already flagged the No-Case-entity decision and the reusable-vs-not-reusable existing fields; this document extends that table for B2/B3/B4 specifically (§U). |

---

## B. Existing blocker-related data (inventory)

No entity named "blocker" (or anything computing one) exists anywhere in the repository (`grep -ri
blocker src backend` returns only the two docs mentions cited above). What exists is:

1. **Deterministic, provenance-carrying legal evidence** (Step 6B): `AcquisitionEvent`,
   `CourtStayEvent`, `ExtensionEvidence`, `StatutoryClock`, `EventConflict`. Fully reusable — this
   is B1's actual source of truth, and `CourtStayEvent`'s `StayScope` (PARCEL/STAGE/PROJECT,
   `stays.py:128-131`) is the best existing model for scoping a B4 court-restraint signal too
   (§F).
2. **Static, non-provenanced status labels on `Parcel`**: `mutationStatus`, `documentStatus`,
   `recordFreshnessScore`, `recordConfidence`, `ownershipDispute`, `courtCase`/
   `courtCaseStatus`/`ECourtRecord`, `revenueRecord` (incl. `encumbranceStatus`),
   `compensationStatus`, `possessionStatus`, `fieldVerified`/`fieldVerificationNotes`/
   `evidencePhotoAttached`/`fieldVerifiedAt`. These are today's only candidate B2/B3/B4 signal
   source. `fieldVerified*` is the *closest* of the group to real evidence (has a verified-style
   boolean, a timestamp, and optional photo corroboration) — the rest are opinion labels with no
   verification state at all.
3. **Hand-authored narrative demo content, not a rule engine**: every `Alert.trigger`/`.reason`/
   `.recommendedAction` string in `src/data/mockData.ts` (e.g. lines 878-880, 893-895) is prose
   written by a human for the demo dataset. **There is no existing deterministic alert-generation
   logic in this codebase to preserve, reuse, or accidentally break** — this materially changes
   the answer to §O (Alert relationship): there is no engine there today, only static content.
4. **ML narrative labels derived from aggregate counts** (`backend/demo_fallback.py`): confirms
   the exact anti-pattern §3 of the task prohibits already exists *in the ML fallback layer*
   (which is out of scope to touch) — a useful negative example, not a pattern to copy.

---

## C. B1 — Statutory Clock Exposure

**Source of truth: `legal.clock_engine.StatutoryClockResult` only.** B1 never recomputes a
deadline, a duration, or a day-count — it reads the already-computed `clock_status`,
`consequence_class`, `days_remaining`, `extension_status`, and the underlying `RuleSet`'s
`is_duration_sufficiently_verified()`, and maps them to a blocker status/confidence/severity. B1
is therefore a **re-labeling and enrichment layer over Step 6B's output**, never a second
computation of legal time.

### Mapping (deterministic, no invented thresholds beyond what `clock_engine.py` already uses)

| `ClockStatus` | `ConsequenceClass` | B1 status | B1 confidence ceiling | B1 severity | Rationale |
|---|---|---|---|---|---|
| `INSUFFICIENT_BASIS` | `LEGAL_STATUS_REQUIRES_VERIFICATION` | `INSUFFICIENT_EVIDENCE` | — | — | No trigger event or no rule duration on record. Must **not** collapse to "no exposure" — KSHETRA genuinely cannot say. |
| `CLOCK_CERTAIN` | `PROCESS_DELAY` | *(no B1 row emitted; `EVIDENCE_OF_NO_BLOCKER`-tier outcome)* | — | — | Clock is trustworthy and comfortably ahead of deadline. |
| `CLOCK_CERTAIN` | `CLOCK_AT_RISK` (`days_remaining <= 30`, the threshold already fixed in `clock_engine.py:239`) | `DETECTED` | Bounded by `rule.duration_confidence` | `MODERATE`→`HIGH`, scaled by `days_remaining` | This is the literal "deadline is close" case the task warns against treating as the *whole* of B1 — it is exactly one row of this table, not the definition of B1. |
| `CLOCK_UNCERTAIN` | `LEGAL_STATUS_REQUIRES_VERIFICATION` | `SUSPECTED` | **Hard-capped at `SUSPECTED`, never higher** | Reported, but explicitly marked non-authoritative | Explicit task requirement: `CLOCK_UNCERTAIN` must never become a false high-confidence B1. Uncertainty is itself a risk signal (can't rule out expiry) but confidence must reflect that it's an *unknown*, not a *finding*. |
| `EXTENSION_UNVERIFIED` | `LEGAL_STATUS_REQUIRES_VERIFICATION` | `DETECTED` | `MODERATE` | `HIGH` | Deadline nominally passed under the original computation; an extension is claimed but not verified — a real, present exposure until verified. |
| `APPARENT_LAPSE` | `APPARENT_LAPSE` | `CONFIRMED` — but see boundary rule below | High, gated on `rule.is_duration_sufficiently_verified()` | `CRITICAL` | Treated separately from ordinary deadline-approach exposure per the task's explicit instruction. |
| `APPARENT_LAPSE` | `CLOCK_EXPIRED` | `DETECTED` | Moderate–High | `HIGH` | A non-acquisition-lapse rule (procedural window / possession precondition) passed its deadline — real, but a different, non-lapse consequence; must never be labeled as if the acquisition lapsed. |
| `LEGACY_1894` | *(any)* | `SUSPECTED` or `INSUFFICIENT_EVIDENCE`, keyed off the underlying `consequence_class` | Capped at `SUSPECTED` | — | Legacy routing is itself a legal-uncertainty signal (per `clock_engine.py`'s own scenario-6 commentary); never auto-`CONFIRMED`. |

**Boundary rule on `CONFIRMED` for `APPARENT_LAPSE`:** `CONFIRMED` here means *"KSHETRA confirms
its deterministic evidence indicates an apparent lapse,"* verbatim inheriting
`clock_engine.py`'s own disclaimer (lines 262-266) — it must **never** be rendered or reasoned
about as *"KSHETRA confirms the acquisition has legally lapsed."* This distinction must propagate
into B1's `notes` field and into any owner/action text derived from it (§K), unedited from the
clock engine's own wording, not paraphrased.

**Absent:** `CLOCK_CERTAIN`/`PROCESS_DELAY` with no other signal → B1 not raised.
**Suspected:** `CLOCK_UNCERTAIN`, or `LEGACY_1894` with a still-uncertain underlying consequence.
**Confirmed:** only `APPARENT_LAPSE`/`APPARENT_LAPSE`, and only when the underlying `RuleSet`'s
duration was itself sufficiently verified (i.e. B1 can never be more confident than the clock
engine itself would be — see next point).
**Critical:** severity `CRITICAL`, reserved for `APPARENT_LAPSE` outcomes.

**Coexistence:** B1 can and routinely will coexist with B2/B3/B4 — e.g. `CLOCK_AT_RISK` (B1) *and*
an unresolved title dispute (B2) on the same case. The engine reports both; it does **not** infer
that B2 *caused* B1's exposure unless a specific evidentiary link is established (§L) — an
important discipline: correlation in one report is not asserted causation.

---

## D. B2 — Title & Record Friction

### Audit of existing evidence (`Parcel`, `src/types/index.ts:183-261`, `schemas.py:192-253`)

| Field | Signal strength | Why |
|---|---|---|
| `revenueRecord.khataNumber`/`pattaNumber`, `ulpin`, `surveyNumber` | Identity keys only | No existing logic cross-checks them for mismatch; a future entity-resolution pass could compute a mismatch signal, but nothing does today. |
| `ownershipDispute` (`'Yes - Partition Suit' \| 'Yes - Joint Heir Conflict' \| 'Yes - Boundary Dispute' \| 'No'`) | **Weak/moderate** | A typed, specific label — better than a boolean — but no `source_type`, `verified`, or timestamp. Cannot corroborate itself. |
| `documentStatus` (`'Verified' \| 'Pending Verification' \| 'Disputed' \| 'Missing Documents'`) | Weak | Same gap: no provenance. `'Verified'` here is a *label*, not the legal engine's `verified: bool` + `verification_timestamp` discipline. |
| `mutationStatus` (`'Up-to-date' \| 'Pending Verification' \| 'Disputed' \| 'Stale'`), `lastMutationYearsAgo` | Weak | Same gap. `lastMutationYearsAgo` is at least a real number, usable as a corroborating signal (a very stale mutation record raises suspicion but is not itself a dispute). |
| `recordFreshnessScore` (0–100), `recordConfidence` (`Low\|Medium\|High`) | **Meta-signal, not evidence** | Describes how much to trust the *other* fields on this parcel — should gate B2 confidence, not itself be a blocker. |
| `revenueRecord.encumbranceStatus` (`'Clear' \| 'Encumbered' \| 'Mortgaged to Co-op Bank' \| 'Pending Partition'`) | Weak/moderate | Same provenance gap; `'Pending Partition'` overlaps conceptually with `ownershipDispute`'s partition-suit value — the design must not double-count the same underlying fact as two independent signals (§ranking note below). |
| `gisRecord.*` | Not title evidence | Spatial only; can corroborate a *survey/parcel-identity* question in principle (e.g. `intersectionAreaSqM` vs declared `areaSqMeters`) but nothing computes that today — flagged as a future weak-signal source, not usable now. |

### Confidence hierarchy

- **`VERIFIED TITLE CONFLICT` (would map to B2 `CONFIRMED`):** requires a provenance-carrying
  record — `source_type` ranked and `verified=true`, mirroring `AcquisitionEvent`. **No such
  entity exists yet.** This tier is **structurally unreachable from current data.** This is
  reported as a gap (§U row B2-1), not worked around by loosening the bar.
- **`POSSIBLE RECORD FRICTION` (maps to `DETECTED`/`SUSPECTED`):** `ownershipDispute != 'No'`, or
  `documentStatus in {'Disputed','Missing Documents'}`, or `mutationStatus in {'Disputed','Stale'}`,
  or `encumbranceStatus in {'Encumbered','Mortgaged to Co-op Bank','Pending Partition'}`. One
  qualifying field → `SUSPECTED`; two or more *independent* qualifying fields (not double-counting
  `ownershipDispute='Yes - Partition Suit'` and `encumbranceStatus='Pending Partition'` as two
  signals when they likely describe the same underlying fact) → `DETECTED`. Confidence is further
  capped downward when `recordConfidence == 'Low'`.
- **`NO RELIABLE TITLE EVIDENCE` (maps to `EVIDENCE_OF_NO_BLOCKER`, or `INSUFFICIENT_EVIDENCE` if
  `recordConfidence == 'Low'`):** all fields read clean (`documentStatus='Verified'`,
  `mutationStatus='Up-to-date'`, `ownershipDispute='No'`, `encumbranceStatus='Clear'`) *and*
  `recordConfidence` is `Medium`/`High`. A clean read under `recordConfidence='Low'` is
  **positively downgraded to `INSUFFICIENT_EVIDENCE`**, not silently treated as a clearance — the
  record itself says it may be unreliable.

**New field/event needed for a real B2 (Phase 2+, not this step):** a provenance-carrying
`TitleRecordEvent`/`RecordFrictionEvidence` entity paralleling `AcquisitionEvent` (`source_type`,
`verified`, `verification_timestamp`, `source_document_id`), capturing specific, structured
findings (survey/parcel-identity mismatch, duplicate-claimant record, registration mismatch)
instead of today's single coarse enum per parcel.

---

## E. B3 — Contested Compensation / R&R

### Audit of existing evidence

| Field | Signal strength | Why |
|---|---|---|
| `compensationStatus` (`'Pending'\|'Determined'\|'Disbursed 40%'\|'Under Dispute in LA-RA Authority'\|'Disbursed 100%'`) | **`'Under Dispute in LA-RA Authority'` is the one genuinely strong existing B3 signal** — it names a specific institutional dispute state. The other values (`'Pending'`, `'Determined'`, partial disbursement) describe ordinary process timing, **not** a dispute. | Conflating `'Pending'` with "blocked" repeats exactly the `compensation_pending_pct > 0 → B3` anti-pattern the task prohibits (§3, §8) — explicitly rejected here. |
| `estimatedCompensationCrores` | Not dispute evidence | A single point estimate; there is no "offered vs. claimed" pair, so "contested amount" cannot be represented at all today. |
| `courtCaseStatus`/`ECourtRecord.{caseType, prayer}` | Very weak, unstructured | `caseType` and `prayer` are free-text; nothing classifies a case as compensation-related vs. title- vs. possession-related. A court case *could* be about compensation, but current data cannot reliably say so. |
| R&R (rehabilitation & resettlement) fields | **None exist** | Complete gap — no R&R award status, no R&R completion flag anywhere in `Parcel`/`Project`. |

### Confidence hierarchy

- `compensationStatus == 'Under Dispute in LA-RA Authority'` → `DETECTED` (a real, named
  institutional dispute state) — capped below `CONFIRMED` because, like B2, the field itself
  carries no `source_type`/`verified`/timestamp.
- `compensationStatus == 'Pending'` alone → **not** B3 by itself. It may feed B1/general delay
  context, never a compensation-*dispute* blocker, unless paired with an independent litigation or
  objection signal that specifically concerns compensation (currently unreliable to detect, per
  the `caseType`/`prayer` free-text problem above) — in which case it stays capped at `SUSPECTED`.
- Contested-amount evidence: **not representable today** (no offered/claimed pair) — gap.
- R&R obligations/completion: **not representable today** — gap.

### Relationship to RFCTLARR S.25 / S.30 / S.38 (interface only — **not implemented**)

The legal engine already models S.25 (award) as `RFCTLARR_S25_AWARD` in `rule_seed_data.py`.
S.30 (award) and S.38 (possession-readiness, three overlapping sub-periods — 3-month
compensation-tender, 6-month monetary R&R, 18-month infrastructural R&R, per
`docs/step6a-statutory-clock-audit.md` §5 line 127) have **no `RuleSet` yet** — correctly out of
scope per this task's hard stop. B3's architecture therefore defines the *interface*, not the
computation: B3 uses the same `affected_clock_ids` hook B1 uses (§L), so that once S.30/S.38
`RuleSet`s exist, a B3 blocker can point at the resulting `StatutoryClock` rows exactly the way B1
does. Until then, B3 is evidence-only with no clock to reference — this is stated explicitly
rather than left implicit, so a future implementer doesn't assume the linkage already works.

---

## F. B4 — Possession-Blocking Encumbrance

### Audit of existing evidence

| Field | Signal strength | Why |
|---|---|---|
| `fieldVerified`, `fieldVerificationNotes`, `evidencePhotoAttached`, `fieldVerifiedAt` | **Strongest existing candidate.** Has a verification-style boolean, a timestamp, optional photographic corroboration, and maps naturally onto the legal engine's own `SourceType.FIELD_VERIFICATION` (rank 4 of 8, `enums.py:43`). | `fieldVerificationNotes` is free text with no controlled vocabulary (no `obstructionType` field) — an obstruction finding must currently be read from prose, not a structured value. |
| `courtCaseStatus == 'Active - Stay Order'` + `ECourtRecord.interimInjunction` | Moderate | An interim injunction is a much sharper possession-specific signal than "active litigation" generically. But the schema does not record *what* the injunction restrains (possession vs. compensation vs. construction) — only `prayer` (free text) hints at it. |
| `possessionStatus` (`'Pending'\|'Partial'\|'Complete'\|'Not Started'`) | Weak alone | Same "pending ≠ blocker" problem as B3 — ordinary process-stage timing by itself is not evidence of an obstruction. |
| `gisRecord.environmentalZone`/`waterBodyAdjacent` | Distinct sub-type, not a physical obstruction | Signals a *regulatory/environmental precondition* (e.g. CRZ/Forest-Border clearance needed) — architecturally this should be tagged as a different B4 evidence sub-type from a *physical/occupant* obstruction, never merged into one undifferentiated "B4 evidence" bucket. |
| Existing structure / occupant / encroachment / utility-conflict / access-issue fields | **None exist** | Complete gap, matching the task's own example list. Needs a new `FIELD_VERIFICATION`-sourced evidence type (e.g. a future `POSSESSION_OBSTRUCTION_OBSERVED` event, extending `legal.enums.EventType`'s existing "shared/cross-Act evidentiary events" category alongside `POSSESSION_TAKEN` — not added in this step). |

### Confidence hierarchy

- `interimInjunction == true` AND `courtCaseStatus == 'Active - Stay Order'` → `DETECTED`/
  `SUSPECTED` — capped because *scope* (does the stay cover this specific parcel — the legal
  engine's own `StayScope.PARCEL/STAGE/PROJECT` distinction, `stays.py:128-131`) and *subject*
  (does it restrain possession specifically) are both unknown from `ECourtRecord` alone. **Design
  recommendation:** B4 should, once implemented, prefer the legal engine's own `CourtStayEvent`
  (if/when a stay is entered there with a real `StayScope`) over parsing `Parcel.courtRecord` —
  reusing structured scope data rather than inferring it from prose.
- `fieldVerified == true` with obstruction language in `fieldVerificationNotes` → `DETECTED`,
  confidence informally raised by `evidencePhotoAttached == true` (photographic corroboration).
- `possessionStatus` alone → no B4 signal.
- B4 must support both **parcel-scoped** (one obstructed parcel) and **project/downstream-scoped**
  (an obstruction blocking handover of a contiguous corridor segment) — same
  `affects_project`/`downstream_extent` hook fields as B1/B2/B3 (§M), populated by a *future*
  possession-impact engine, not computed here.

---

## G. Blocker state machine

```
                 ┌────────────────────┐
 evidence exists │                    │ evidence exists,
 but inadequate  │  INSUFFICIENT_     │ points both ways
 either way ─────▶  EVIDENCE         │◀──── or unresolved
                 │                    │      at top authority tier
                 └─────────┬──────────┘
                           │ stronger evidence arrives
                           ▼
                 ┌────────────────────┐        ┌────────────────────┐
   weak/indirect │                    │ meets  │                    │
   /unverified   │     SUSPECTED      ├───────▶│      DETECTED      │
   signal ───────▶                    │ minimum│  (candidate blocker,│
                 └─────────┬──────────┘  bar   │  not yet at highest │
                           │                    │  confidence tier)   │
                           │                    └─────────┬──────────┘
                           │        sufficiently authoritative,
                           │        verified evidence establishes it
                           │                    ┌─────────▼──────────┐
                           └───────────────────▶│      CONFIRMED      │
                                                 └─────────┬──────────┘
                                                           │
                       any of the above, once new  ┌───────▼──────────┐
                       evidence closes the matter ─▶│      RESOLVED     │
                                                     └────────────────┘

                 ┌────────────────────┐
 evidence exists │      CONFLICTED     │  reachable from any state once
 on both sides,  │  (supports AND      │  genuinely contradictory,
 top-tier tie ──▶│  contradicts,       │  same-authority-tier evidence
                 │  unresolved)        │  is on record
                 └────────────────────┘
```

**Not a state, a distinct evaluation outcome:** when a blocker-class evaluation finds the
condition genuinely absent — not merely undiscussed — the engine records
`EVIDENCE_OF_NO_BLOCKER`, explicitly different from silence. This is the direct implementation of
the task's requirement (§5): *missing* compensation information → `INSUFFICIENT_EVIDENCE`;
*explicit, on-record* evidence that compensation is fully disbursed and undisputed →
`EVIDENCE_OF_NO_BLOCKER`. Only the latter may ever be reported as "no B3 blocker" with any
confidence.

**Open persistence-policy question (flagged for Step 7B, not decided here):** does every
evaluation run persist a row for `EVIDENCE_OF_NO_BLOCKER`/`NO_EVIDENCE` outcomes (full audit
trail, but likely heavy — one row per parcel per blocker class per run), or are only
`DETECTED`/`SUSPECTED`/`CONFIRMED`/`CONFLICTED`/`INSUFFICIENT_EVIDENCE`/`RESOLVED` persisted, with
a clean outcome computed live on read and never stored? This document recommends the latter
(store only informative/actionable outcomes; compute "no blocker of this type" on demand) to avoid
unbounded table growth, but this is a product decision, not asserted as settled (§V).

---

## H. Evidence / provenance model

**Reused, not reinvented:** `legal.enums.SourceType` and `SOURCE_AUTHORITY_RANK`
(`enums.py:23-47`) are the *one* authority hierarchy for the whole system. The blocker engine does
not define a second ranking.

**`BlockerEvidence`** (design — see §Q for the table):

- `evidence_id`
- `blocker_id` (FK)
- `evidence_type` — what *kind* of underlying record this cites: `ACQUISITION_EVENT` |
  `COURT_STAY_EVENT` | `EXTENSION_EVIDENCE` | `STATUTORY_CLOCK` | `PARCEL_FIELD` | `COURT_RECORD` |
  `REVENUE_RECORD` | `GIS_RECORD` | `FIELD_VERIFICATION` | `MANUAL_ENTRY`
- `source_ref_type` + `source_ref_id` — a polymorphic pointer to the actual row/field this cites
  (e.g. `"statutory_clocks"`/`clk-1`, or `"parcels"`/`"P-0245.ownershipDispute"` for a bare status
  field with no dedicated row of its own)
- `source_type` — a `legal.enums.SourceType` value (reused unmodified)
- `description` — plain text of what the evidence actually says (never LLM-generated, §12)
- `supports_or_contradicts` — `SUPPORTS` | `CONTRADICTS` | `AMBIGUOUS` — lets one blocker
  aggregate several evidentiary signals honestly, including disagreeing ones, without silently
  picking a winner at the evidence-recording stage (resolution happens separately, §I)
- `confidence`, `verified`, `observed_at`/`recorded_at`, `notes`

This gives every blocker the exact WHY → EVIDENCE → SOURCE → TIMESTAMP → CONFIDENCE chain the
task requires (§12), built from structured rows rather than prose.

---

## I. Conflict resolution

Directly reuses `conflicts.py`'s philosophy, restated for blockers:

1. **Both/all competing evidence rows are always preserved** — a blocker engine run never deletes
   or edits a `BlockerEvidence` row.
2. **No averaging, no "pick latest," no silent overwrite.**
3. A higher-authority source wins **only if** it is not itself unverified while a lower-authority
   competitor is verified (identical rule to `conflicts.py:95-109`).
4. Anything left unresolved at the top authority tier → `BlockerStatus.CONFLICTED`, never a guess.
5. A `blocker_conflicts` table (mirroring `EventConflictRecord`) is the recommended (but flagged
   as conditionally-deferrable, §Q) mechanism for making an unresolved conflict independently
   queryable, not just an internal computation detail.

Example scenario worked through: Revenue record says ownership clear (`GOVERNMENT_PORTAL`,
unverified) vs. court record indicates a title dispute (`COURT_RECORD`, verified) vs. field
verification says parcel is occupied (`FIELD_VERIFICATION`, verified). Per the authority
hierarchy, `COURT_RECORD` (rank 1) outranks `GOVERNMENT_PORTAL` (rank 2) regardless of the
revenue record's own state — and since the court record is verified while the (unverified) higher
tier doesn't exist here, the court record's title-dispute finding stands as B2 evidence; the
field-verification occupancy finding is separately evaluated as B4 evidence (a different blocker
class — these are not automatically merged into one finding just because they're about the same
parcel). This demonstrates provenance-respecting resolution without discarding any source.

---

## J. Primary/secondary blocker ranking

**Not** a hardcoded `B1 > B2 > B3 > B4`. A deterministic, explainable multi-criterion order:

1. **Severity** (`INFORMATIONAL < WATCH < MODERATE < HIGH < CRITICAL`) — a shared scale across all
   four classes, each populated by that class's own mapping (§C–F), not by blocker-type identity.
2. **Confidence tier** as tie-break (`CONFIRMED > DETECTED > SUSPECTED`; `CONFLICTED` and
   `INSUFFICIENT_EVIDENCE` are **never** promoted to primary over any `CONFIRMED`/`DETECTED`/
   `SUSPECTED` alternative — if *only* conflicted/insufficient blockers exist for a case, the
   engine reports **no confidently primary blocker**, explicitly, rather than arbitrarily picking
   one — this mirrors `clock_engine.py`'s own refusal to guess).
3. **Downstream possession impact magnitude** (§M), when known; unknown/undetermined does not
   penalize a blocker, since the possession-impact engine is future work.
4. **Actionability** — kept as a *separate*, independently exposed ranking
   (`most_actionable_blocker`), per the task's explicit instruction to separate "most severe" from
   "most actionable." The primary-by-severity blocker and the most-actionable blocker are reported
   as two distinct fields; the API never silently substitutes one for the other.

`Blocker.primary: bool` is set by this ranking pass at evaluation time and persisted with that
run's row (append-only, §Q) — so historical "what was primary as of date X" remains queryable, the
same way `StatutoryClockRecord` preserves history rather than overwriting it.

---

## K. Owner + action architecture

**Default `owner_role` per class** (a starting point, not a hardcoded final answer):

| Class | Default owner | Note |
|---|---|---|
| B1 | Collector / CALA / LAO | Matches the task's own framing. |
| B2 | Revenue / Registration authority | — |
| B3 | Compensation authority / LARR Authority / R&R function | — |
| B4 | **No fixed default** | Must be resolved from the evidence: a court-stay-sourced B4 routes toward a legal desk; a field-verified physical-obstruction B4 routes toward Revenue/Tahsildar/field team. This indeterminacy is stated explicitly rather than papered over with a fake default. |

**`ActionRecommendation`** (design only, per §13):

- `action_id`, `blocker_id`, `owner_role`, `authority`, `action_type` (kept as an **open
  string**, not a closed enum, in this design — see next point), `rationale` (must cite specific
  `BlockerEvidence` rows, never freeform/LLM text), `evidence_refs`, `priority`
  (`CRITICAL`/`HIGH`/`MEDIUM`/`LOW`, reusing the scale already used by `Parcel.priority` and
  `CaseAction.priority`), `status`, `precedent_refs` (nullable, empty in this design — precedent
  retrieval is explicitly out of scope), `created_at`.

**Compatibility recommendation:** `CaseAction.actionType` is already a closed 6-value production
union (`'Legal Verification' | 'Fast-Track Compensation' | 'Lok Adalat Settlement' | 'Joint
Mutation Camp' | 'Field Geo-Survey' | 'Collector Hearing'`, `types/index.ts:350`). A future
`ActionRecommendation.action_type` taxonomy should be a **superset-compatible** vocabulary — so a
blocker-derived recommendation can later be promoted 1:1 into a real `CaseAction` — rather than an
incompatible second taxonomy invented independently. Not decided or built now, only recommended.

---

## L. Blocker → statutory clock interface

- `Blocker.affects_clock: bool` + `Blocker.affected_clock_ids: list[str]` (FKs into
  `statutory_clocks.id`).
- **One-way dependency, enforced architecturally:** `backend/blockers/` (future package) may
  *read* `legal/` (via `legal.db_crud` read functions) but `legal/` never imports or knows about
  `blockers/`. This mirrors the Step 6A audit's own "clock state can flow into a future model
  input; a model probability must never flow backward into the clock" principle (§16 of that
  audit), applied one layer earlier: blocker evidence can flow toward exposure/ML; it must never
  flow backward into changing what the legal engine computes.
- A blocker may say *"this evidence threatens completion before the deadline recorded at
  `statutory_clocks/{id}"* — it must **never** write to `acquisition_events`, `court_stay_events`,
  `extension_evidence`, or `statutory_clocks`, and must never contain a second, competing deadline
  computation of its own.

---

## M. Blocker → possession impact interface

Fields the blocker engine must **expose**, not compute (a future subsystem's job):

- `affected_parcel_ids: list[str]` — trivially `[parcel_id]` for a parcel-scoped blocker; for a
  project-scoped one, left to the future engine to populate.
- `affected_parcel_count`, `affected_area_acres` — **a cheap, honest win available now**: for a
  parcel-scoped blocker this is just `Parcel.areaAcres` for that one row; no invention required.
- `contiguous_segment_ref` — nullable pointer to `Project.corridorSections[].sectionId`. This is
  a **real existing linkage** (`Project.corridorSections` already carries `chainageKm`,
  `riskScore`, `bottleneckCount` per section, `types/index.ts:280-288`) — "which corridor section
  is this blocker in" is answerable today via `parcel → project → corridorSections`, not invented.
- `critical_path_impact` — left `null`/undetermined. No existing data supports this; explicitly
  future work, not stubbed with a fake value.

---

## N. Blocker → exposure interface

Outputs the (not-yet-built) Exposure Engine will need, per the task's own formula sketch (never
implemented here):

- `legal_severity` (from B1's clock-derived severity, §C)
- `blocker_severity` (the blocker's own severity field, §G/§J)
- `blocker_confidence`
- `downstream_impact` (§M's fields)
- `affected_extent` (area/parcel count, §M)
- `deadline_proximity` (raw `days_remaining` from a linked clock, exposed as a fact — **not**
  itself a severity determination; severity was already computed in §C)
- `project_stage` (existing `Project.currentLarrStage` / `Parcel.stage`, for cross-reference only
  — never a computation input, per the same rule Step 6A already established for `LarrStage`,
  `docs/step6a-statutory-clock-audit.md` §18 row 4)

**Hard separation restated:** `Prediction.delayProbability` (ML) must never be substituted for, or
averaged into, blocker confidence or severity. They are independent axes from independent systems.
Blocker computation is architected to run **before and independently of** any `/predict` call.

---

## O. Relationship with existing Alerts

Audited `backend/models.py` `Alert` + `backend/routers/alerts.py` + every `Alert` row in
`src/data/mockData.ts`. Finding (§B.3): **`Alert` today has no generating engine at all** — its
`trigger`/`reason`/`recommendedAction` text is hand-authored demo prose, not computed. This
changes the shape of the decision:

- **(A) remain separate** — rejected as a permanent end-state: it would leave two disconnected
  "something is wrong here" concepts indefinitely.
- **(B) `Alert` references `Blocker`** — **recommended**, but only as a *later*, additive
  migration (a nullable `blocker_id` FK), not in Step 7A/7B. A `Blocker` transitioning to
  `DETECTED`/`CONFIRMED` becomes the natural, real trigger for creating an `Alert` row through the
  existing `crud.create_alert` path — while `Alert`'s own table/API shape stays untouched through
  the read-only blocker phase.
- **(C) replace Alert with blocker-derived alerts** — rejected: `Alert`/`NotificationItem` already
  serve a broader "operational notice" concept (`type: 'alert'|'action'|'sync'|'prediction'`,
  `types/index.ts:409`) that legal-blocker semantics alone shouldn't swallow.
- **(D) support both** — effectively what (B) becomes once wired: legal-blocker-triggered alerts
  coexist with sync/field/prediction-triggered ones under the same `Alert` table.

**Not done in this step:** no migration of existing alerts, no `Alert` API change.

---

## P. Relationship with existing Predictions / ML

`Prediction`/`/predict` are **not modified**, consistent with the hard-stop list. Future
model-consumable features, explicitly labeled **FUTURE MODEL FEATURES, not current inputs**:

- `blocker_count`, `primary_blocker_type`, `blocker_confidence`
- `b1_exposure`, `b2_title_friction`, `b3_compensation_friction`, `b4_possession_obstruction`
- `unresolved_blocker_count`

None of these exist in `predictionFeatures.ts`'s fixed 7-field `FastApiCaseInput`
(`predictionFeatures.ts:106-114`) today, and none are added by this step. Adding them later
requires a genuinely separate, explicitly-scoped step (retraining, schema versioning) — not a side
effect of building the blocker engine.

---

## Q. Proposed database design (design only — no migration created)

**No `Case` entity.** Same conclusion as Step 6B (`db_models.py:40-54`) for the same reason:
`case_reference` + `project_id` (+ optional `parcel_id`) remains adequate scoping for the
prototype's one-acquisition-proceeding-per-project assumption; introducing `Case` now would be
solving a problem this audit did not find evidence for.

| Table | Necessary? | Notes |
|---|---|---|
| `blockers` | Yes | Core entity, §Q.1 below. |
| `blocker_evidence` | Yes | §H. Without it, `CONFIRMED`/`CONFLICTED` states have no queryable basis — this is the single most load-bearing new table. |
| `blocker_actions` | Yes | §K. Unlike `blockers`/`blocker_evidence`, recommend this follow `CaseAction`'s **mutable, PATCH-able** pattern (status changes as work happens) rather than pure append-only — an `ActionRecommendation` is operationally closer to `CaseAction` (already mutable) than to a legal evidence record. Flagged as a deliberate deviation from "append-only everywhere," justified above, not silently inconsistent. |
| `blocker_conflicts` | **Conditionally recommended** | Mirrors `EventConflictRecord` for parity and independent queryability. Genuinely the one entity this audit is least certain is needed at launch — could initially be folded into `blocker_evidence.supports_or_contradicts` + `blocker.status = CONFLICTED` without a dedicated table, revisited once real conflict volume is observed in Step 7B. Recommendation: **build it**, for architectural parity with the legal engine and because retrofitting it later is more disruptive than an unused table now — but this is explicitly flagged as the one judgment call reasonable people could make differently. |

### Q.1 `blockers` — proposed fields

Append-only (mirrors `StatutoryClockRecord`/`AcquisitionEventRecord`: every evaluation run is a
new row; no update path; `primary` is set at write time by that run's ranking pass, §J).

```
blocker_id            UUID PK (server-generated, mirrors legal's newly-invented entities)
case_reference         string, indexed (NOT a Case FK — same scoping as legal/*)
project_id             FK projects.id, nullable, ON DELETE SET NULL
parcel_id              FK parcels.id, nullable, ON DELETE SET NULL
blocker_type           B1 | B2 | B3 | B4
status                 DETECTED | SUSPECTED | CONFIRMED | INSUFFICIENT_EVIDENCE |
                        CONFLICTED | RESOLVED
severity                INFORMATIONAL | WATCH | MODERATE | HIGH | CRITICAL
confidence              (blocker-specific tier; distinct concept from legal's LegalConfidence,
                         which grades RuleSet sourcing, not blocker evidence)
owner_role              string
responsible_authority   string
affects_clock           bool
affected_clock_ids      JSON list[str]  (FKs into statutory_clocks.id, not enforced at DB level
                        the way legal's own JSON list[str] columns already work, e.g.
                        StatutoryClockRecord.source_references)
affects_possession       bool
affects_project           bool
downstream_extent         JSON  (affected_parcel_ids, affected_parcel_count, affected_area_acres,
                          contiguous_segment_ref, critical_path_impact — §M, best-effort/nullable)
primary                  bool  (this run's ranking outcome, §J)
ranking_basis             JSON  (transparent score components, mirrors StatutoryClockResult's
                          plain-string calculation_basis rather than one opaque number)
resolution_status          nullable, subset reusing `status`'s RESOLVED value
resolution_notes           text, nullable
resolution_evidence_refs    JSON list[str]
engine_version              string  (mirrors CALCULATION_VERSION pattern in clock_engine.py:28)
calculation_date             date  (explicit "as of," never implicit wall-clock — same discipline
                              as clock_engine.py's calculation_date and DEMO_ASOF_DATE)
notes                          text
created_at                     DateTime(timezone=True)  (bookkeeping; mirrors _utcnow() pattern)
```

### Q.2 `blocker_evidence` — proposed fields (§H, repeated for completeness)

`evidence_id` (UUID PK), `blocker_id` (FK), `evidence_type`, `source_ref_type`, `source_ref_id`,
`source_type` (`legal.enums.SourceType`, reused), `description`, `supports_or_contradicts`,
`confidence`, `verified` (bool), `observed_at`, `recorded_at`, `notes`, `created_at`.
Append-only, `ON DELETE SET NULL` for its `blocker_id` FK if a parent blocker row is ever purged
(historical record should outlive its parent the same way `AuditLog.parcel_id` does).

### Q.3 `blocker_actions` — proposed fields (§K)

`action_id` (UUID PK), `blocker_id` (FK, `ON DELETE SET NULL`), `owner_role`, `authority`,
`action_type` (open string, §K), `rationale`, `evidence_refs` (JSON list[str]), `priority`,
`status` (mutable — recommend PATCH support mirroring `CaseAction`), `precedent_refs` (JSON
list[str], empty in this design), `created_at`, `updated_at`.

### Q.4 `blocker_conflicts` — proposed fields (mirrors `EventConflictRecord`)

`conflict_id` (UUID PK), `case_reference`, `blocker_type`, `competing_evidence_ids` (JSON
list[str]), `resolution_status` (`UNRESOLVED` | `RESOLVED_BY_AUTHORITY_HIERARCHY` |
`RESOLVED_BY_HUMAN_REVIEW`), `notes`, `created_at`.

**Reused, not reinvented, structural conventions:** human-readable business-key PKs only where a
prior ID scheme exists (none does here — every new entity uses a server-generated UUID, matching
how Step 6B treated its own newly-invented entities); nullable FK + `SET NULL` on delete (never
`CASCADE`) for every table that is historical/evidentiary in nature; JSON columns for nested
structures, identical on SQLite/Postgres, per `models.py`'s own documented rationale.

---

## R. API proposal (design only — nothing implemented)

Minimal, read-only, mirroring `backend/routers/legal.py`'s own shape and the same
degrade-gracefully `try/except` mount pattern already used in `backend/main.py:92-97` for
`legal_router`:

```
GET /api/blockers?project_id=&parcel_id=&blocker_type=&status=
GET /api/blockers/{blocker_id}
GET /api/blockers/{blocker_id}/evidence
GET /api/blockers/{blocker_id}/actions
GET /api/projects/{project_id}/blockers
GET /api/parcels/{parcel_id}/blockers
GET /api/projects/{project_id}/blockers/primary
```

Would live in a new `backend/routers/blockers.py`, mounted at `/api/blockers`. **Not created in
this step.** No write/recompute endpoint is proposed yet, mirroring Step 6B's own "read-only
first" rule (`routers/legal.py:9-12`).

---

## S. Frontend contract (design only — no frontend file touched)

Sketch of the eventual typed shape (not written to `src/types/index.ts`):

```ts
interface BlockerSummary {
  blockerId: string;
  blockerType: 'B1' | 'B2' | 'B3' | 'B4';
  status: 'DETECTED' | 'SUSPECTED' | 'CONFIRMED' | 'INSUFFICIENT_EVIDENCE' | 'CONFLICTED' | 'RESOLVED';
  severity: 'INFORMATIONAL' | 'WATCH' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  confidence: string;
  ownerRole: string;
  responsibleAuthority: string;
  primary: boolean;
  evidence: { description: string; sourceType: string; verified: boolean; observedAt?: string }[];
  affectedClockIds: string[];
  affectsPossession: boolean;
  affectsProject: boolean;
  downstreamExtent?: { affectedParcelCount?: number; affectedAreaAcres?: number; contiguousSegmentRef?: string };
  recommendedAction?: { ownerRole: string; actionType: string; rationale: string };
  notes: string;
}
```

Renders conceptually as the "STATUTORY EXPOSURE / PRIMARY BLOCKER / CONFIDENCE / WHY / EVIDENCE /
OWNER / NEXT ACTION / IMPACT" layout sketched in the task (§22). **Not built in this step.**

---

## T. Six demo scenarios (design only)

Modeled on `legal/demo_scenarios.py`'s `DemoScenario` shape and its "clearly synthetic" discipline
(`source_type = SYNTHETIC_DEMO` throughout, obviously-placeholder IDs).

**A — B1 only, statutory deadline approaching.**
Input: reuse Step 6B's own scenario 5 (NH Act 3A notification, `CLOCK_CERTAIN`/`CLOCK_AT_RISK`,
~10 days remaining, no 3D on record). No other parcel evidence.
Expected blockers: `[B1]`. Primary: B1. Status: `DETECTED`. Confidence: bounded by the clock's own
`CLOCK_CERTAIN` (never `CONFIRMED` — reserved for `APPARENT_LAPSE`). Owner: Collector / CALA.
Action category: expedite the 3D declaration before the 1-year window closes.

**B — B2 possible record friction (explicitly *not* "verified title conflict").**
Input: `ownershipDispute = 'Yes - Partition Suit'`, `documentStatus = 'Disputed'`,
`mutationStatus = 'Disputed'` — three independent existing fields agreeing.
Expected blockers: `[B2]`. Status: `DETECTED` (capped — per §D, `CONFIRMED` is structurally
unreachable from today's data). Owner: Revenue / Registration. Action category: verify title
records before compensation proceeds. *Scenario note, stated in the scenario description itself:*
this deliberately stops at `DETECTED`, demonstrating the Data Gap in §U row B2-1 rather than
hiding it.

**C — B3 contested compensation.**
Input: `compensationStatus = 'Under Dispute in LA-RA Authority'`, `courtCase = true`,
`ECourtRecord.prayer` text indicating compensation relief.
Expected blockers: `[B3]`. Status: `DETECTED`. Owner: Compensation Authority / LA-RA Authority.
Action category: convene LA-RA Authority hearing.

**D — B4 possession obstruction.**
Input: `fieldVerified = true`, `fieldVerificationNotes` describing a physical
occupant/encroachment, `evidencePhotoAttached = true`, `courtCaseStatus = 'Active - Stay Order'`,
`interimInjunction = true`.
Expected blockers: `[B4]`. Status: `DETECTED`. Owner: **not single-valued** — field team/Revenue
(for the physical finding) *and* legal desk (for the injunction) are both plausible; scenario
explicitly notes this as a case for a future multi-owner extension (§V), not resolved by picking
one arbitrarily.

**E — Multiple blockers, one primary + secondaries.**
Input: A + B + C combined on one case. Ranking (§J) computed transparently via `ranking_basis`,
not asserted by type order: B1's `CLOCK_AT_RISK` severity outranks B2/B3's `DETECTED`-tier
evidence-only severity under the severity-first criterion in *this* instance — the scenario
includes a documented variant where B3 is upgraded to a hypothetical `CONFIRMED`-tier, fully-
provenanced compensation dispute with its own hard deadline while B1 is downgraded to
`CLOCK_UNCERTAIN`/`SUSPECTED`, showing the ranking flips — proving the order is evidence-driven,
not a hardcoded B1>B2>B3>B4.

**F — Conflicting / insufficient evidence.**
Input (insufficient): `recordConfidence = 'Low'`, `documentStatus = 'Pending Verification'` — no
clear signal either way → `INSUFFICIENT_EVIDENCE`.
Input (conflicted, constructed): two same-authority-tier records disagreeing on ownership status.
Expected blockers: `[B2: INSUFFICIENT_EVIDENCE or CONFLICTED]`. Primary: **none** — reported
explicitly as "no confidently primary blocker; open evidence question requires review," not an
arbitrary pick. Owner: legal/records review. Action category: verify records before any
substantive blocker determination is made.

---

## U. Data gap analysis

| Required blocker evidence | Exists now? | Existing source | Reliable enough for `CONFIRMED`? | New field/event needed? | Phase |
|---|---|---|---|---|---|
| B1 trigger dates, deadlines, extension/stay status | **Yes, fully** | `legal/` (Step 6B) | Yes, exactly to the degree the clock engine itself trusts it | No | Available now |
| B2-1: provenance-carrying title/record dispute record (source_type + verified + timestamp) | **No** | — | N/A | Yes — `TitleRecordEvent`/`RecordFrictionEvidence` entity | 2 |
| B2-2: parcel-identity/survey mismatch detection | No | `ulpin`/`surveyNumber`/GIS fields exist as raw identity keys, but nothing cross-checks them | N/A | Yes — entity-resolution pass + evidence record | 3+ |
| B2-3: coarse dispute/document/mutation status labels | Yes | `Parcel.ownershipDispute`/`documentStatus`/`mutationStatus`/`revenueRecord.encumbranceStatus` | No — capped at `DETECTED`/`SUSPECTED` | Provenance fields on top of existing labels (or supersede via B2-1) | 2 |
| B3-1: named institutional compensation dispute state | Yes | `Parcel.compensationStatus == 'Under Dispute in LA-RA Authority'` | No — capped at `DETECTED` | Provenance fields | 2 |
| B3-2: offered-vs-claimed contested amount | No | — | N/A | New field pair | 2 |
| B3-3: R&R obligations/completion | **No — complete gap** | — | N/A | New entity entirely | 2 |
| B3-4: case-subject classification (is a court case about compensation specifically?) | No — only free-text `caseType`/`prayer` | `ECourtRecord` | No | Structured case-subject field/taxonomy | 2 |
| B4-1: field-verification finding with obstruction detail | Partial | `Parcel.fieldVerified`/`fieldVerificationNotes`/`evidencePhotoAttached`/`fieldVerifiedAt` | No — free-text notes, capped at `DETECTED` | Controlled-vocabulary `obstructionType` field | 2 |
| B4-2: court-stay scope specific to possession | Partial | `ECourtRecord.interimInjunction`/`courtCaseStatus`, or a real `CourtStayEvent` if entered into the legal engine | Yes, **if** routed through `legal.CourtStayEvent` (has real `StayScope`); No if read only from `Parcel.courtRecord` | Prefer wiring B4 evidence intake through `legal/` stays rather than a new parallel entity | 2 |
| B4-3: existing structure / occupant / encroachment / utility conflict / access issue | **No — complete gap**, matches task's own example list | — | N/A | New `FIELD_VERIFICATION`-sourced event type | 2 |
| B4-4: regulatory/environmental precondition (CRZ/Forest Border/Buffer Zone) | Yes, as a distinct signal | `Parcel.gisRecord.environmentalZone`/`waterBodyAdjacent` | Weak — no provenance, and conceptually a *different* B4 sub-type from physical obstruction | Sub-type tagging in the evidence model | 2 |
| Downstream possession impact (area/parcel count) | Yes, cheaply computable | `Parcel.areaAcres`, `Project.corridorSections` | Yes for the simple parcel-scoped case | No new field — just wiring | 1 (cheap win, could ship alongside blockers) |
| Contiguous-segment / critical-path impact | No | — | N/A | New computation entirely | 3+ |

---

## V. Legal / operational uncertainties

1. Does `compensationStatus == 'Pending'` ever legitimately constitute B3 evidence when paired
   with an independent objection/litigation signal, or should it *never* contribute to B3 under
   any combination? This document takes the conservative position (never alone; only as a weak
   corroborator) but flags it as a product/legal judgment call, not a settled fact.
2. Does `ECourtRecord.interimInjunction` reliably imply a *possession* restraint specifically, or
   could it just as often restrain compensation disbursement or construction activity? Current
   data cannot distinguish these; B4 confidence is capped accordingly (§F) until case-subject
   classification exists (§U row B3-4/B4 equivalent).
3. Should `blocker_conflicts` be its own table or folded into `blocker_evidence` +
   `blocker.status=CONFLICTED`? Flagged in §Q as the one genuinely open call.
4. Should `blocker_actions` follow `CaseAction`'s mutable pattern (recommended, §Q.3) or the
   append-only pattern the rest of this design uses? Recommended: mutable, but this is a real
   product decision about whether "acting on a blocker" is itself an auditable event stream.
5. Should every blocker evaluation run persist a row even for clean (`EVIDENCE_OF_NO_BLOCKER`)
   outcomes, for a complete audit trail, at the cost of table growth? Recommended: no (§G), but
   flagged as a genuine trade-off, not a certainty.
6. Should B4 support more than one `owner_role` when evidence genuinely implicates two different
   authorities (e.g. Scenario D)? The MVP field as designed is single-valued; a future multi-owner
   extension is plausible but not designed here.
7. RFCTLARR S.30/S.38 durations remain legally unverified per Step 6A §25 items 8/9 — any future
   B3/B4-to-clock linkage inherits that same uncertainty and must not silently present a
   possession-readiness clock as more certain than the underlying (not-yet-built) `RuleSet` would
   be.

---

## W. Recommended Step 7B implementation order

1. **Sign-off gate first.** Circulate this document — especially §C–F's confidence ceilings (in
   particular: B2 `CONFIRMED` being currently unreachable, and B1's `APPARENT_LAPSE`
   `CONFIRMED`-but-not-a-legal-lapse boundary rule) and §J's ranking criteria order — for
   product/legal review before writing code, mirroring Step 6A→6B's own gate.
2. **Pure-logic modules first**, no DB dependency (new `backend/blockers/` package):
   `enums.py` (`BlockerType`, `BlockerStatus`, `BlockerSeverity`, `EvidenceRelation`), `evidence.py`
   (`BlockerEvidence` dataclass + aggregation helpers reusing `legal.enums.SourceType`/
   `SOURCE_AUTHORITY_RANK` directly), `b1_engine.py` (pure function:
   `StatutoryClockResult → B1 result`, per §C's table, no DB import), `b2_engine.py`/
   `b3_engine.py`/`b4_engine.py` (pure functions over Parcel-shaped input, explicitly capped at
   the confidence ceilings this audit established — no `CONFIRMED` for B2/B3 until the Phase-2
   evidence entities in §U exist), `ranking.py` (deterministic primary/secondary selection per
   §J).
3. **Unit tests** mirroring `backend/legal/tests/` conventions (exact-status assertions). Cover
   the six demo scenarios (§T) plus edge cases: `INSUFFICIENT_BASIS` clock → B1
   `INSUFFICIENT_EVIDENCE`, never silently absent; an all-clean parcel → `EVIDENCE_OF_NO_BLOCKER`
   for B2/B3/B4, never a fabricated confident clearance under `recordConfidence='Low'`.
4. **Persistence layer**: `db_models.py`/`db_schemas.py`/`db_crud.py` for
   `blockers`/`blocker_evidence`/`blocker_actions` (+ `blocker_conflicts` if retained per §Q's
   judgment call), then an Alembic migration — additive only, same nullable + `SET NULL` FK
   pattern as `legal/db_models.py`.
5. **Demo seed data**: a `seed_demo_db.py`-equivalent building the six demo scenarios, every row
   clearly `source_type = SYNTHETIC_DEMO`.
6. **Read-only API**: `backend/routers/blockers.py` (§R) + the same 6-line degrade-gracefully
   `try/except` mount `main.py` already uses for `legal_router` (`main.py:92-97`). No write or
   recompute endpoint yet — same "read-only first" discipline Step 6B enforced.
7. **Frontend contract** (§S) only after the backend blocker states are trustworthy — a later
   step (7C+), not 7B.
8. **Explicitly deferred beyond 7B**, unchanged from this task's hard-stop list: Exposure/Priority
   Engine, RFCTLARR S.38 implementation, ML feature wiring (`b*_exposure` features), precedent
   retrieval, what-if simulation.

---

## X. Files that must remain untouched (confirmed via this audit; none were modified)

- `ai-model/**`, `train.py`, `explain.py`, `survival.py`, all LightGBM/Cox artifacts
- `backend/inference_service.py`, `backend/demo_fallback.py`
- `src/services/predictionFeatures.ts`, `src/services/mlApiService.ts`
- `backend/legal/**` (audited for a genuine defect; **none found** — no change warranted)
- `backend/models.py`, `backend/schemas.py`, `backend/crud.py`, `backend/main.py`
- `src/types/index.ts`, `src/context/AppContext.tsx`, `src/data/mockData.ts`
- Any Alembic migration, any database file

---

## Y. Risks and safeguards

- **Risk:** conflating "pending"/"not yet complete" status fields with "contested/blocked."
  Already observed as an actual anti-pattern inside `backend/demo_fallback.py`'s narrative labels
  (out of scope to fix, but a live example of the failure mode this design must not replicate).
  **Safeguard:** §D/§E explicitly reject `compensationStatus == 'Pending'` / `possessionStatus`
  alone as B3/B4 evidence.
- **Risk:** a future implementer mistakes `Alert`'s hand-authored `mockData.ts` prose for the
  output of an existing deterministic engine and tries to "integrate" the blocker engine with
  logic that doesn't exist. **Safeguard:** §B.3/§O state plainly that no such engine exists today.
- **Risk:** B2/B3 `CONFIRMED` being reached carelessly straight off today's bare enum fields
  without the provenance entities §U calls for. **Safeguard:** §D/§E's confidence ceilings are
  explicit and the demo scenarios (§T, Scenario B) are deliberately written to demonstrate the cap
  rather than to reach `CONFIRMED` artificially.
- **Risk:** table bloat from persisting a row per parcel per blocker class per run regardless of
  outcome. **Safeguard:** §G's selective-persistence recommendation, flagged as an open decision
  rather than silently defaulted.
- **Safeguard, restated per the task's own boundary list (§24):** this design is advisory only. It
  does not adjudicate title, does not declare legal ownership, does not declare a court case
  legally decisive, does not alter statutory deadlines (§L's one-way dependency is the structural
  enforcement of this), does not declare a legal lapse from a score, does not replace the
  competent authority, does not write back to government systems, and every demo scenario is
  `SYNTHETIC_DEMO`-labeled, never presented as government data ([[status-truthfulness]]).

---

# STEP 7A COMPLETE — NO IMPLEMENTATION PERFORMED.

No code, schema, migration, router, or frontend file was created or modified in this step. This
document is the entire deliverable.

**Recommended Step 7B sequence** (repeated from §W for visibility): (1) product/legal sign-off on
§C–F's confidence ceilings and §J's ranking criteria; (2) pure-logic `backend/blockers/` modules,
no DB; (3) unit tests against the six demo scenarios; (4) persistence layer + Alembic migration,
additive only; (5) demo seed data, `SYNTHETIC_DEMO`-labeled; (6) read-only
`backend/routers/blockers.py`, mounted via the same degrade-gracefully pattern as `legal_router`;
(7) frontend contract, deferred to 7C+; (8) Exposure Engine / S.38 / ML wiring / precedent
retrieval / what-if simulation remain explicitly out of scope beyond 7B.
