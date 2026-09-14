# KSHETRA — Step 6A: Deterministic Statutory Clock Engine
## Legal Audit + Architecture Design (no implementation)

**Status:** Audit/design only. No code, migrations, or schema changes were made in this step.
**Scope note:** This document is a prototype engineering design aid, not a legal opinion. Every
clock, classification and confidence level below is provisional and must be reviewed by a
qualified land-acquisition lawyer before any of it drives a real decision. Where the primary
sources were ambiguous or contested in case law, that is stated explicitly rather than resolved
by assumption.

---

## 1. Executive conclusion

KSHETRA currently has **zero** statutory-clock logic anywhere in the codebase. `LarrStage` (in
`src/types/index.ts`) is a six-value cosmetic label — e.g. `'Notification (Sec 3A/11)'`,
`'Declaration (Sec 3D/19)'` — used only for ML categorical encoding
(`acquisition_stage` in `predictionFeatures.ts`) and UI display. **It already conflates the
National Highways Act, 1956 (NH Act) and the RFCTLARR Act, 2013 by pairing their section numbers
as if interchangeable** (`3A/11`, `3C/15`, `3D/19`, `3G/23`, `3E/38`). That conflation is a
reasonable ML-modeling simplification (one categorical stage axis) but it is legally unsafe as a
basis for a clock engine, exactly as this task's brief warns against. Step 6B must build the
clock engine as an entirely new, independent subsystem that does not read or write `LarrStage`,
and must keep the two statutory families (RFCTLARR vs NH Act) structurally separate.

Primary-source research (India Code bare-act text, corroborated via `indiankanoon.org` verbatim
section reproductions and Supreme Court judgments) confirms the task's central warning is
legally correct: RFCTLARR and the NH Act are **procedurally independent acquisition regimes**
with different objection periods (60 days vs 21 days), different declaration deadlines (12
months from Section 11, judicially stay-excluded only by case law, vs 12 months from 3A with an
**express statutory** stay-exclusion clause), different consequences of a missed declaration
(RFCTLARR: notification "deemed to have been rescinded"; NH Act: notification "cease[s] to have
effect"), and NH Act Section 3D has **no extension mechanism at all**, unlike RFCTLARR Sections
19 and 25 which both allow government-ordered extensions with written reasons. The two families
share only one deliberate legislative bridge: RFCTLARR's Fourth Schedule + Section 105(3) + the
RFCTLARR (Removal of Difficulties) Order, 2015 imported RFCTLARR's **compensation quantum**
(solatium/interest formulas) into NH Act acquisitions — but did **not** import RFCTLARR's
acquisition-process clocks (Sections 11/15/19/24/25) into NH Act cases. NH Act cases keep their
own 3A–3J process timeline.

Legacy 1894 cases are a third, distinct family (Section 24 RFCTLARR), governed by a Constitution
Bench interpretation (*Indore Development Authority v. Manoharlal*, (2020) 8 SCC 129) that is
itself the product of an overruled earlier precedent (*Pune Municipal Corporation v. Harakchand
Misirimal Solanki*, (2014) 3 SCC 183) — i.e., the law here changed once already and the 2020
judgment reasons **do not appear as express statutory text**, so any Section 24(2) determination
must be flagged for legal review rather than computed silently.

The recommended architecture (Sections 12–17 below) uses a versioned `RuleSet` per Act/section/
jurisdiction, a canonical provenance-carrying `AcquisitionEvent` model, an explicit
`StatutoryClock` object with a bounded status state machine that defaults to uncertainty rather
than a fabricated deadline, and a strict AI/law boundary: the ML model never sees or infers a
legal deadline — it only ever receives clock *state* (certain / uncertain / at-risk / expired),
never a number the clock engine hasn't itself certified.

---

## 2. Existing KSHETRA legal/date logic (repo audit)

Audited: `backend/`, `src/`, `src/types/`, `src/context/`, `src/services/`, `src/data/`,
`ai-model/`. Nothing below was modified.

| Location | What exists | Relevance to Step 6B |
|---|---|---|
| `src/types/index.ts` `LarrStage` | 6-value union: `Notification (Sec 3A/11)`, `SIA & Objection (Sec 3C/15)`, `Declaration (Sec 3D/19)`, `Award Inquiry (Sec 3G/23)`, `Compensation Disbursement`, `Possession (Sec 3E/38)` | **Do not extend or reuse for legal computation.** It pairs NH Act and RFCTLARR section numbers as equivalent stages (`3C/15` is a paired label, not a rule). It's a display/ML-categorical value only. `Award Inquiry (Sec 3G/23)` also mislabels — RFCTLARR's inquiry-into-objections-to-the-*award-amount* provision is Section 21 (Hearing of Disputes) not 23 (Section 23 is "Matters to be considered in determining compensation", carried over conceptually from 1894 Act numbering the labels appear to echo loosely). This confirms the label set was written for readability, not legal precision. |
| `src/types/index.ts` `Parcel.notificationDate` | Free-text date string (e.g. `'18-Jan-2024'`), parsed via `new Date(...)` | Candidate raw material for a trigger date, but has no `source_type`, no confidence, no distinction between Gazette date and any other publication mode — cannot be an `AcquisitionEvent` as-is. |
| `src/types/index.ts` `Parcel.courtCase`, `courtCaseStatus`, `ECourtRecord` (`caseStatus`, `interimInjunction`, `nextHearingDate`) | Synthetic court-record fields | Candidate raw material for a `COURT_STAY_START`/`COURT_STAY_END` event, but currently has no `effective_from`/`effective_to`, no `scope` (parcel vs project), no `order_date`. `interimInjunction: boolean` is a flag, not a dated event. |
| `src/types/index.ts` `Parcel.acquisitionStatus`, `possessionStatus`, `compensationStatus` | Free enums (`Pending`/`Acquired`/…, `Not Started`/`Partial`/`Complete`, `Pending`/`Determined`/`Disbursed 40%`/…) | Operational status, not a legal determination. Useful later as *evidence* an event model can point at, not a substitute for one. |
| `src/services/predictionFeatures.ts` `DEMO_ASOF_DATE`, `notificationAgeMonths()` | Fixed synthetic "as-of" date (`2026-09-07`) and elapsed-month calculator, clamped `[1, 360]` | This is an ML feature-engineering utility (deterministic day-count), **not** a legal date-computation utility. Its month-length constant (`30.4375` days) is a statistical average for feature stability, not a legally correct calendar-month computation (see §15) — must not be reused for statutory deadlines. |
| `backend/models.py` `Parcel.notification_date`, `.assigned_due_date`, `.last_synced_at` | Stored as display strings, explicitly **not** parsed to `DATETIME` (per the module docstring) "to avoid any behavior change" | Confirms no backend date arithmetic exists today. A future `AcquisitionEvent`/`StatutoryClock` table would need real `DateTime` columns — this is new ground, not a migration of existing logic. |
| `backend/main.py`, `backend/routers/*.py` | No matches for `stage`, `notification`, `possession`, `award`, `extension`, `stay`, `lapse` beyond the health-check docstring | Confirms zero legal logic in the backend. |
| `ai-model/*.py` | `acquisition_stage` is a fixed 6-category one-hot feature (same 6 `LarrStage` values); no date-window logic | Confirms the ML model treats "stage" as a categorical label from `LarrStage`, never computes a deadline. Must remain untouched (Step 6A/6B constraint). |
| `src/data/mockData.ts` | `notificationDate` strings, `stage` labels re-used per the same `LarrStage` conflation (e.g. `'Declaration (Sec 3D/19)'` assigned regardless of which Act actually applies to that synthetic project) | Confirms today's synthetic data does not track which Act a given case is under — Step 6B demo data (§17/§20 below) must add that (an `applicableAct` field does not exist yet). |
| `src/components/reports/ReportGeneratorView.tsx:205` | Generated-report copy: *"…notified under Section 3A of the National Highways Act / RFCTLARR Act 2013."* | UI text that already conflates the two Acts in one sentence. Not in scope to fix now (Step 6A is audit/design only) but flagged for Step 6B/later UI work — this is exactly the kind of sentence the new engine must stop the app from being able to say when it isn't legally accurate for the specific case. |
| Everywhere else (`AppContext.tsx`, `apiSimulation.ts`, `apiClient.ts`) | No date-deadline logic; `simulateGovernmentSync` only touches `lastSyncedAt`/`syncStatus` (per [[parcel-source-of-truth]] memory) | Confirms the sync layer is unrelated and must stay untouched. |

**Conclusion:** there is nothing to migrate or refactor — Step 6B is a greenfield addition. The
one real risk is that `LarrStage`/`acquisition_stage` looks superficially like a "stage machine"
and could be mistaken for a legal-state source; it is not, and the new engine must not derive
from it or write back to it.

---

## 3. Authoritative sources reviewed

Primary legal text was located via India Code (`indiacode.nic.in` — blocked automated fetch with
HTTP 403 in this environment, so verbatim text was cross-verified through `indiankanoon.org`,
which republishes the Gazette-sourced bare-act text of central Acts, plus a state-government
mirror). Every rule below cites where its text/interpretation came from; none of it is from a
blog's paraphrase alone — where only a paraphrase was available, that is stated.

| # | Source | Authority | What it establishes | What it does NOT establish |
|---|---|---|---|---|
| S1 | Right to Fair Compensation and Transparency in Land Acquisition, Rehabilitation and Resettlement Act, 2013 (Act No. 30 of 2013) — bare act text, Sections 4–8, 11, 14, 15, 19, 24, 25, 30, 38 | Central Act (primary) | The RFCTLARR statutory clocks used in §4 below | Any state-amendment variant (e.g. Tamil Nadu Rules) — none reviewed in this pass; see §26 |
| S2 | National Highways Act, 1956 (Act No. 48 of 1956), Sections 3A–3J (Chapter II-A, inserted by Act 68 of 1997) — bare act text | Central Act (primary) | The NH Act statutory clocks used in §5 below | State-specific highway notifications or rule-level procedural detail |
| S3 | *Indore Development Authority v. Manoharlal & Ors.*, (2020) 8 SCC 129 — Constitution Bench, decided 6 March 2020, `indiankanoon.org/doc/49625991/` | Supreme Court (5-judge bench) | Interpretation of Section 24(2)'s "or" as disjunctive (either possession-not-taken **or** compensation-not-paid is sufficient to avoid lapse — i.e., harder for landowners to get a lapse than the earlier reading); overrules S4 below; also addressed the "impossibility" treatment of court-stay periods for 24(2) | Does not amend the statute — it is judicial interpretation, and per its own history it can in principle be revisited (it already overruled a prior 3-judge reading) |
| S4 | *Pune Municipal Corporation v. Harakchand Misirimal Solanki*, (2014) 3 SCC 183 | Supreme Court (3-judge bench) | The **overruled** predecessor reading ("or" read conjunctively as "and") — kept here only so Step 6B's `RuleSet` versioning can represent "the interpretive rule that applied to determinations made before 6 March 2020" if ever needed for historical/legacy cases | Not current law post-S3 |
| S5 | *Union of India & Anr. v. Tarsem Singh & Ors.*, (2019) 9 SCC 304, decided 19 September 2019, plus 2025 INSC 146 (4 Feb 2025) and subsequent 2026 review clarification (reported by SCC Online, March 2026) | Supreme Court | NH Act Section 3J's exclusion of the 1894 Act is unconstitutional (Art. 14) to the extent it denies solatium/interest; establishes that compensation-quantum benefits flow to NH Act acquisitions even though the *process* provisions of the 1894/2013 Acts don't apply | Does not import RFCTLARR's acquisition-*process* clocks (Sections 11/15/19/24/25) into NH Act cases — only compensation quantum. Post-2019 litigation on retrospective scope is still active (2025/2026) — treat as an evolving area, not settled once and for all |
| S6 | RFCTLARR Section 105(3) + Fourth Schedule + RFCTLARR (Removal of Difficulties) Order, 2015 (dated 28 Aug 2015, effective 1 Jan 2015) | Central Government subordinate legislation (Order under statutory removal-of-difficulties power) | The specific legal mechanism that grafts RFCTLARR's First/Second/Third Schedule compensation formulas onto the 13 Fourth-Schedule Acts including the NH Act | Does not graft RFCTLARR's Chapter III/IV acquisition-process sections onto those Acts |
| S7 | *Executive Engineer, Gosikhurd Project, Ambad v. Mahesh*, decided by Supreme Court 10 Nov 2021 | Supreme Court | RFCTLARR Section 25's 12-month award period applies to awards made under Section 24(1)(a) (legacy 1894 cases converted to RFCTLARR compensation-determination track), with the 12 months held to run from 1 January 2014 (RFCTLARR's commencement date) for those specific legacy conversions | Does not change Section 25's application to ordinary (non-legacy) RFCTLARR Section 19 declarations, which run from the Section 19 publication date as normal |
| S8 | Multiple corroborating case-law commentary (e.g. iPleaders, LiveLaw summaries of *State of Haryana v. Rajbir* and related High Court decisions) on whether Section 24(2)'s five-year period statutorily excludes court-stay periods | Secondary (used only to triangulate, never as the rule source itself) | That, unlike Sections 19(7) and NH Act 3D(3), **Section 24(2) itself contains no express stay-exclusion proviso** in the bare-act text — any exclusion applied is judge-made (via the "lex non cogit ad impossibilia" reasoning in S3), and its scope is contested across benches | Not used to assert a specific numeric exclusion rule — flagged `NOT SUFFICIENTLY VERIFIED` in the matrix (§4) pending legal review |

**Sources explicitly NOT relied on as authoritative:** ipleaders.in, aaptaxlaw.com, kanoongpt.in,
Wikipedia, and other law-blog aggregators were used only as a *locating* aid or to
cross-corroborate wording already visible in the `indiankanoon.org` verbatim reproduction; no
rule in §4/§5 rests on a blog paraphrase alone without an `indiankanoon.org` (Gazette-sourced)
or case-law citation backing it. **India Code's own PDF/HTML could not be fetched in this
environment (HTTP 403 on both the bitstream PDF and the `show-data` HTML endpoint)** — this is a
tooling limitation, not a substantive gap; Step 6B (or a legal reviewer) should re-verify the
exact wording quoted below against an India Code hard copy or a subscription legal database
(Manupatra/SCC Online) before treating any duration/consequence as final.

---

## 4. RFCTLARR statutory-clock matrix

| Section | Event | Trigger | Period | Consequence | Extension | Stay treatment | Confidence | Source |
|---|---|---|---|---|---|---|---|---|
| **S. 4–8** (SIA, Ch. II) | Social Impact Assessment: preliminary investigation, public hearing, SIA study publication, Expert Group appraisal | Government's decision to examine acquisition for a project | No single fixed duration found in this pass (SIA process itself is multi-step) | N/A directly — feeds into S.14 below | N/A | N/A | Classify: **INFORMATIONAL / NON-LAPSE MILESTONE** (as a group) | S1 |
| **S. 14** | SIA report lapse if no preliminary notification follows | Date of communication of the Expert Group's views on the SIA report (S.7) | 12 months | SIA report "deemed to have lapsed"; a fresh SIA must be conducted | Not established in this pass — **NOT SUFFICIENTLY VERIFIED** | Not established in this pass — **NOT SUFFICIENTLY VERIFIED** | Medium (paraphrase-sourced, not yet verbatim-verified) | S1 (secondary-corroborated paraphrase; verbatim text not independently confirmed in this pass) |
| **S. 11** | Preliminary notification | Government's determination that land is/may be required for public purpose | — (this section is itself a trigger-setting event, not a duration) | Starts the S.14 and S.19 clocks; triggers S.15 objection window | N/A | N/A | Classify: **PROCEDURAL DEADLINE** (as a trigger-defining event, not itself a countable clock) | S1 |
| **S. 15** | Hearing of objections | Date of publication of the S.11 preliminary notification | 60 days (objection filing window) | Objections not filed within 60 days cannot be raised; Collector reports to government; government's decision on objections is final | N/A (fixed window, no extension provision identified) | Not established in this pass | Classify: **PROCEDURAL DEADLINE**. Confidence: High (window length, verbatim-corroborated) | S1 |
| **S. 19** | Publication of declaration (+ mandatory R&R scheme summary) | Date of publication of the S.11 preliminary notification | 12 months | **S.19(7): if no declaration is made within 12 months, "such notification shall be deemed to have been rescinded."** | Yes — appropriate Government may extend, reasons recorded in writing, published on the authority's website (mirrors S.25's mechanism) | **Express statutory exclusion**: "any period or periods during which the proceedings... were held up on account of any stay or injunction by the order of any Court shall be excluded" (per indiankanoon verbatim extraction) | Classify: **ACQUISITION-LAPSE CLOCK** (the S.11 notification itself lapses/rescinds). Confidence: High | S1 |
| **S. 24(1)(a)** | Legacy-1894 case, no S.11(1894) award made | 1894-Act proceedings already underway at RFCTLARR commencement (1 Jan 2014) | — | All RFCTLARR compensation-determination provisions apply going forward (but see S7: Section 25's 12-month award clock then applies, running from 1 Jan 2014 per Gosikhurd) | N/A | N/A | Classify: **LEGACY_1894 transitional rule** feeding into an **ACQUISITION-LAPSE CLOCK** (S.25, once triggered) | S1, S7 |
| **S. 24(1)(b)** | Legacy-1894 case, S.11(1894) award already made | Award made before commencement | Proceedings continue entirely under the 1894 Act "as if [it] has not been repealed" | N/A (case stays in the old regime) | N/A | N/A | Classify: **LEGACY_1894** (informational routing rule, not itself a clock) | S1 |
| **S. 24(2)** | Legacy-1894 lapse test | 1894-Act award made ≥5 years before RFCTLARR commencement (1 Jan 2014) | 5 years (measured backward from commencement, per the bare text) | Deemed lapse of the 1894 proceedings **if** (per S3's disjunctive reading) either possession has not been taken **or** compensation has not been paid — proviso: if compensation undeposited for a *majority* of land holdings, affected beneficiaries get RFCTLARR-rate compensation (a partial, not full, consequence) | N/A (this is a one-time transitional test, not a renewable clock) | **Contested / not express in statute.** No stay-exclusion proviso appears in the S.24(2) bare text (unlike S.19(7) and NH Act 3D(3)); S3 read in an "impossibility" exception judicially rather than the statute doing so expressly, and its scope is not settled across all fact patterns | Classify: **NOT SUFFICIENTLY VERIFIED for computational purposes** despite the interpretation being Constitution-Bench law — the *duration* rule is settled, the *stay-adjustment* rule is not statute-express and should not be hard-coded without legal sign-off. Confidence: Medium (duration/consequence), Low (stay adjustment) | S1, S3, S4, S8 |
| **S. 25** | Award | Date of publication of the S.19 declaration | 12 months | "the entire proceedings for the acquisition of the land shall lapse" | Yes — appropriate Government may extend, reasons recorded in writing, published on the authority's website | **Not express in the S.25 bare text itself** (confirmed via verbatim extraction — no proviso/explanation present); a stay-exclusion is applied by case law (by analogy/impossibility reasoning), same caveat as S.24(2) | Classify: **ACQUISITION-LAPSE CLOCK**. Confidence: High (duration, trigger, consequence, extension mechanism); Medium (stay treatment — case-law sourced, not bare-text) | S1, S7 (Gosikhurd: S.25 applies to S.24(1)(a) awards, running from 1 Jan 2014) |
| **S. 30 / 38** | Award (S.30) → possession precondition (S.38) | Date of the award made under S.30 | 3 months (full compensation payment/tender) · 6 months (monetary R&R entitlements, Second Schedule) · 18 months (infrastructural R&R entitlements, Second/Third Schedule) | Possession under S.38(1) may occur **only after** compensation and R&R are "paid or tendered" — not an acquisition-lapse consequence, a possession-blocking precondition; S.38(2) additionally requires the R&R process to be complete "before displacing the affected families" | Not established in this pass | Not established in this pass | Classify: **POSSESSION READINESS CLOCK** (three overlapping sub-periods, not a single number). Confidence: Medium — verbatim-corroborated by two independent paraphrase extractions of the same page, but the exact bare-act wording of the three durations was not independently cross-verified against a second primary source in this pass | S1 |

**Not investigated in this pass (explicitly out of scope for now, flagged for §26):** Section 21
(hearing of disputes regarding apportionment of the award — distinct from S.15's hearing of
objections to the notification), the detailed Rehabilitation & Resettlement Award machinery
(Chapter V beyond S.38, e.g. Sections 31–37), and any Tamil Nadu state-specific RFCTLARR Rules
(the project's synthetic data is Tamil-Nadu-flavoured per `mockData.ts` village/taluk names —
see [[parcel-source-of-truth]] — so state rules would matter for a real deployment).

---

## 5. National Highways Act statutory-clock matrix

| Section | Event | Trigger | Period | Consequence | Extension | Stay treatment | Confidence | Source |
|---|---|---|---|---|---|---|---|---|
| **3A** | Preliminary notification ("declare its intention to acquire") | Central Government's determination that land is required for a national highway | — (trigger-setting event; must be published in the Gazette + two local newspapers, one vernacular) | Starts the 3C objection window and the 3D one-year window | N/A | N/A | Classify: trigger-defining event, not itself a clock | S2 |
| **3B** | Power to enter for survey | Issuance of the 3A notification | — | Enables inspection/survey/valuation activity; not a deadline | N/A | N/A | Classify: **INFORMATIONAL / NON-LAPSE MILESTONE** | S2 |
| **3C** | Hearing of objections | Date of publication of the 3A notification | **21 days** (objection filing window — materially shorter than RFCTLARR's 60 days; do not treat as equivalent) | Objections heard by competent authority ("in person or by a legal practitioner"); the authority's order allowing/disallowing is stated to be "final" | Not established in this pass | Not established in this pass | Classify: **PROCEDURAL DEADLINE**. Confidence: High (duration verbatim-corroborated) | S2 |
| **3D** | Declaration of acquisition | Date of publication of the 3A notification | **1 year** | If no 3D declaration is published within 1 year of the 3A notification, "the said notification shall cease to have any effect." On publication of a timely 3D, land "vest[s] absolutely in the Central Government free from all encumbrances." The 3D declaration itself "shall not be called in question in any court or by any other authority." | **None identified** — no extension-of-the-one-year-period mechanism was found in the sources reviewed (contrast sharply with RFCTLARR S.19/S.25, both of which do have one) | **Express statutory exclusion**: "the period or periods during which any action or proceedings to be taken in pursuance of the notification... is stayed by an order of a court shall be excluded" (verbatim-corroborated) | Classify: **ACQUISITION-LAPSE CLOCK**. Confidence: High on duration/consequence/stay-exclusion; **the absence of an extension mechanism should be treated as Medium confidence** (an exhaustive negative — "no extension provision exists" — was not proven by finding an explicit "no extension" clause, only by its absence from every source reviewed; Step 6B should not hard-code "extension impossible" without one more explicit confirmation pass) | S2 |
| **3E** | Power to take possession | Land vested under 3D **and** compensation amount deposited under 3H | Notice requires surrender/delivery of possession within **60 days** of the notice | Non-compliance: competent authority may apply to the Commissioner of Police (metropolitan areas) or District Collector (elsewhere) to enforce surrender | N/A | Not established in this pass | Classify: **POSSESSION READINESS CLOCK** (a compound precondition: 3D vesting + 3H deposit, then a 60-day notice-compliance window). Confidence: Medium — summarized, not independently verbatim-double-checked | S2 |
| **3F** | Right to enter vested land | Publication of 3D declaration | — | Authorized persons may act on the land for highway building/maintenance/operation | N/A | N/A | Classify: **INFORMATIONAL / NON-LAPSE MILESTONE** | S2 |
| **3G** | Determination of compensation amount | Acquisition under the Act (post-vesting) | Public-notice-driven claims process; no single fixed statutory countdown identified in this pass | Competent authority determines the amount; disputed determinations go to an arbitrator appointed by the Central Government; valuation considers market value **as of the 3A notification date**, severance/injurious-affection damage, relocation expenses | N/A | Not established in this pass | Classify: **COMPENSATION / PAYMENT DEADLINE** family (process, not a countdown). Confidence: Medium | S2 |
| **3H** | Deposit and payment of amount | Before taking possession | Compensation "shall be deposited... before taking possession"; payment follows "as soon as may be" after deposit | Apportionment disputes among multiple claimants go to the principal civil court of original jurisdiction; if an arbitrator's award exceeds the competent authority's determination, 9% p.a. interest on the excess runs from the possession date to the deposit date | N/A | N/A | Classify: **COMPENSATION / PAYMENT DEADLINE** (precondition to 3E, not a self-standing lapse clock). Confidence: Medium | S2 |
| **3I** | Competent authority's civil-court powers | — | — | Procedural (summoning witnesses, requiring documents, receiving affidavits, requisitioning records, issuing commissions) | N/A | N/A | Classify: **NOT A CLOCK** — purely procedural/evidentiary powers. Confidence: High (verbatim-confirmed) | S2 |
| **3J** | Exclusion of the Land Acquisition Act, 1894 | — | — | "Nothing in the Land Acquisition Act, 1894 shall apply to an acquisition under this Act" — **but held unconstitutional to the extent it denied solatium/interest** (S5); compensation quantum is separately restored via RFCTLARR's Fourth Schedule mechanism (S6), **not** via 3J itself | N/A | N/A | Classify: **NOT A CLOCK** — a scope/applicability rule, materially qualified by S5/S6. Confidence: High that the qualification exists; **Medium-to-Low on the precise retrospective boundary**, given active 2025/2026 litigation (S5) | S2, S5, S6 |

**The "one-year relationship between 3A and 3D" (item F in the task brief) is therefore:** a
single, non-extendable (as far as this pass could determine), stay-excludable, hard deadline —
structurally similar in shape to RFCTLARR's S.19(7) (12 months, express stay exclusion) but with
two material differences the engine must preserve: (1) the NH Act window is **1 year**, not 12
calendar months measured the RFCTLARR way (verify whether either Act's "12 months"/"1 year" is
meant as calendar months or 365 days — see §15), and (2) **NH Act 3D has no extension power**
while RFCTLARR S.19 does.

**Not investigated in this pass:** the National Highways (Land Acquisition Procedure) Rules
(subordinate legislation implementing 3A–3J procedural detail) were not fetched; they would
refine publication-mode and notice-service mechanics. Flagged for §26.

---

## 6. Legacy 1894 analysis

- **Two structurally different legacy questions exist**, and KSHETRA must not merge them:
  1. *"Which regime does this case's ongoing acquisition process fall under?"* — answered by
     RFCTLARR Section 24(1)(a)/(1)(b): no pre-2014 award ⇒ RFCTLARR compensation rules apply
     going forward (but the acquisition otherwise proceeds, eventually hitting the RFCTLARR
     Section 25 award clock per *Gosikhurd*, S7); pre-2014 award already made ⇒ the case stays
     entirely inside the 1894 Act "as if [it] has not been repealed."
  2. *"Has this old 1894 acquisition lapsed outright?"* — answered by RFCTLARR Section 24(2): a
     ≥5-year-old 1894 award with neither possession taken nor compensation paid (per the
     Constitution Bench's disjunctive "or" reading in S3, so in practice: possession not taken
     **or** compensation not paid, whichever the evidence shows) is deemed lapsed, subject to the
     majority-compensation proviso and the unresolved stay-exclusion question (§4, row S.24(2)).
- **`LEGACY_1894` must be a distinct case classification**, never silently converted to
  `CURRENT_RFCTLARR`. A case only becomes "current RFCTLARR" in the sense of running RFCTLARR's
  own process clocks (S.11/15/19/25) if it is a *genuinely new* acquisition commenced under
  RFCTLARR — a legacy 24(1)(a) case that continues does **not** restart at Section 11; it
  resumes RFCTLARR compensation-determination machinery (and, per *Gosikhurd*, eventually the
  Section 25 award clock, dated from 1 Jan 2014, not from any RFCTLARR-side notification the
  case never had).
- **Judicial volatility is itself a modeling fact.** S3 overruled S4 on the central "or"/"and"
  question six years after RFCTLARR commenced. This is why the engine's `RuleSet` needs
  `effective_from`/`effective_to` and an `approved_by`/`approval_status` field (§16) — a legacy
  determination made under the pre-2020 interpretation, and one made after, are **different
  RuleSet versions**, not the same rule applied twice.
- **If evidence is insufficient to place a case into 24(1)(a), 24(1)(b), or determine the 24(2)
  five-year/possession/compensation facts, the correct output is `CLOCK_UNCERTAIN`**, never a
  default assumption that the case is "probably current RFCTLARR" or "probably lapsed."

---

## 7. Canonical acquisition-event model

Design only — no `AcquisitionEvent` type exists in the codebase today (§2). Proposed event
catalogue, evaluated against the task's candidate list (не blindly implementing all of it):

| Event | Act applicability | Trigger significance | Required date | Evidence required | Source(s) | Confidence field | Starts a clock? | Stops a clock? | Pauses a clock? | Alters a deadline? |
|---|---|---|---|---|---|---|---|---|---|---|
| `SIA_NOTIFICATION` | RFCTLARR only | Starts SIA process | Yes | Gazette/portal record | OFFICIAL_GAZETTE, GOVERNMENT_PORTAL | Per-event | No (feeds S.14 only once Expert Group views exist) | No | No | No |
| `SIA_EXPERT_GROUP_VIEWS_COMMUNICATED` | RFCTLARR only | Starts the S.14 12-month window | Yes | Official communication record | GOVERNMENT_PORTAL, OFFICIAL_GAZETTE | Per-event | **Yes** (S.14) | No | No | No |
| `PRELIMINARY_NOTIFICATION` (S.11 / 3A) | Both, kept as **two distinct event subtypes** `RFCTLARR_S11` and `NHACT_3A` — never unified into one generic "notification" event | Starts the objection window and the declaration-deadline window for its own Act only | Yes | Gazette notification number, S.O. number, publication date(s) | OFFICIAL_GAZETTE | Per-event | **Yes** (starts S.15/S.19 or 3C/3D respectively) | No | No | No |
| `OBJECTIONS_FILED` | Both (S.15 / 3C) | Evidentiary — records that the window was used | Yes | Filing record | COURT_RECORD, GOVERNMENT_PORTAL, MANUAL_ENTRY | Per-event | No | No | No | No |
| `OBJECTIONS_DECIDED` | Both | Closes the objections stage | Yes | Government/competent-authority order | GOVERNMENT_PORTAL, OFFICIAL_GAZETTE | Per-event | No | No | No | No |
| `DECLARATION` (S.19 / 3D) | Both, kept as two subtypes `RFCTLARR_S19` and `NHACT_3D` | Satisfies the S.19/3D deadline; starts the S.25 award clock (RFCTLARR only — NH Act has no equivalent award-deadline clock identified in this pass) | Yes | Gazette notification, parent-notification back-reference (§8) | OFFICIAL_GAZETTE | Per-event | **Yes** (S.25, RFCTLARR only) | **Yes** (stops S.19/3D clock by satisfying it) | No | No |
| `AWARD` (S.25 / S.30) | RFCTLARR (both are RFCTLARR; NH Act's compensation-determination under 3G is modeled as a separate event, see next row) | Satisfies the S.25 clock; starts the S.38 possession-readiness sub-clocks | Yes | Award document reference | OFFICIAL_GAZETTE, GOVERNMENT_PORTAL, COURT_RECORD | Per-event | **Yes** (S.38 sub-clocks) | **Yes** (stops S.25) | No | No |
| `COMPENSATION_DETERMINED` (3G) | NH Act | Fixes the compensation amount pre-deposit | Yes | Competent authority order or arbitrator award | GOVERNMENT_PORTAL, COURT_RECORD | Per-event | No | No | No | No |
| `COMPENSATION_DEPOSITED` (3H) | NH Act | Precondition to possession (3E) | Yes | Deposit record/challan | GOVERNMENT_PORTAL, REGISTERED_RECORD | Per-event | No | No | No | No |
| `COMPENSATION_PAID_OR_TENDERED` (S.38, 3H) | Both | Satisfies the S.38 3-month / relevant NH Act payment precondition | Yes | Payment/tender record | REGISTERED_RECORD, GOVERNMENT_PORTAL | Per-event | No | **Partially** (satisfies one of S.38's sub-clocks) | No | No |
| `RR_AWARD` | RFCTLARR only | Feeds S.38's 6-/18-month R&R sub-clocks | Yes | R&R award document | GOVERNMENT_PORTAL | Per-event | No | Partially | No | No |
| `POSSESSION_NOTICE` (3E 60-day notice) | Both, but shaped differently per Act | Starts a possession-surrender countdown (NH Act: 60 days explicit; RFCTLARR: possession itself is post-S.38-precondition, no separate 60-day notice clock identified) | Yes | Notice document | GOVERNMENT_PORTAL, FIELD_VERIFICATION | Per-event | **Yes** (NH Act 60-day notice only) | No | No | No |
| `POSSESSION_TAKEN` | Both | Satisfies S.38/3E preconditions; relevant to S.24(2) legacy lapse test | Yes | Possession record, field verification | FIELD_VERIFICATION, GOVERNMENT_PORTAL, COURT_RECORD | Per-event | No | **Yes** (satisfies possession-readiness clocks; relevant input to §24(2) legacy test) | No | No |
| `COURT_STAY_START` / `COURT_STAY_END` | Both — see §13 for the dedicated model | Pauses relevant clock(s) *only within scope* | Yes | Court order | COURT_RECORD | Per-event, plus a separate `scope`/`affected_stage` verification flag | No | No | **Yes**, scoped (§13) | No |
| `EXTENSION_GRANTED` / `EXTENSION_REFUSED` | RFCTLARR S.19/S.25 only (NH Act 3D has no identified extension mechanism — §5) | Alters the computed deadline, subject to verification (§12) | Yes | Extension order, web-published notice | OFFICIAL_GAZETTE, GOVERNMENT_PORTAL | Per-event | No | No | No | **Yes**, only if `EXTENSION_VERIFIED` |
| `WITHDRAWAL` / `ABANDONMENT` | Both | Terminates the acquisition (RFCTLARR has a separate withdrawal provision not audited in this pass, §26) | Yes | Government order | OFFICIAL_GAZETTE | Per-event | No | **Yes** (terminates all open clocks for the case) | No | No |
| `CORRECTION_REPUBLICATION` | Both | Supersedes an earlier event record (via `supersedes_event_id`, §9) | Yes | Corrigendum/Gazette republication | OFFICIAL_GAZETTE | Per-event | Depends on what's corrected | Depends | No | No |
| `GAZETTE_PUBLICATION` | Both | A publication-channel record, potentially attached to any of the above rather than a standalone semantic event | Yes | Gazette metadata | OFFICIAL_GAZETTE | Per-event | No (it's a *carrier* of other events' evidence, not independently clock-relevant) | No | No | No |

**Deliberately excluded from "can start/stop/pause a clock" status without further legal review:**
`RR_AWARD` and `COMPENSATION_DETERMINED` only partially satisfy compound preconditions (S.38,
3E/3H) — the engine must model these as **contributing conditions to a compound
`POSSESSION READINESS CLOCK`**, not as independent lapse clocks in their own right, to avoid
inventing a deadline the statute doesn't actually impose standalone.

---

## 8. Event provenance model

```
AcquisitionEvent
  event_id                  string (UUID)
  case_id                   string            — the acquisition case (may span many parcels)
  parcel_ref | project_ref  string | null     — which scope this event record concerns
  event_type                enum              — from the catalogue in §7 (Act-qualified subtype,
                                                 e.g. "RFCTLARR_S11" not generic "NOTIFICATION")
  applicable_act             enum ('RFCTLARR' | 'NH_ACT_1956' | 'LA_ACT_1894')
  event_date                 date              — the legally operative date (may differ from
                                                 publication_date, e.g. an order dated before its
                                                 Gazette publication)
  publication_date           date | null
  source_type                enum              — OFFICIAL_GAZETTE | GOVERNMENT_PORTAL |
                                                 COURT_RECORD | REGISTERED_RECORD |
                                                 FIELD_VERIFICATION | IMPORTED_SYSTEM |
                                                 MANUAL_ENTRY | SYNTHETIC_DEMO
  source_reference            string            — e.g. Gazette S.O. number, case CNR number
  source_document_id          string | null     — pointer into a document store (future)
  extracted_from              string            — how this record was produced (OCR, manual
                                                 transcription, API ingestion, demo seed)
  confidence                  enum ('HIGH' | 'MEDIUM' | 'LOW')
  verified                    boolean
  verification_timestamp      datetime | null
  supersedes_event_id         string | null     — points at an event this one corrects/replaces;
                                                 the superseded event is NEVER deleted (§11)
  notes                       string
```

- `applicable_act` is mandatory and non-inferred — it must come from case intake, never guessed
  from the event's shape (an "objection filed" event looks structurally identical whether it's a
  3C or S.15 objection; only case-level metadata says which).
- `SYNTHETIC_DEMO` is a first-class source type specifically so demo/illustrative data (§20) can
  never be confused with `OFFICIAL_GAZETTE`/`GOVERNMENT_PORTAL` provenance at the schema level,
  not just by a UI label.
- Events are **append-only**. A "correction" is a new event with `supersedes_event_id` set, never
  an in-place edit — this is what makes conflict resolution (§9/§11) and audit possible.

---

## 9. Conflict-resolution strategy

Source-authority hierarchy (highest to lowest, used only to pick a *default calculation
candidate for display*, never to silently discard the weaker record):

1. `OFFICIAL_GAZETTE`
2. `COURT_RECORD` (for stay/judicial facts specifically; not higher than Gazette for a
   notification date)
3. `GOVERNMENT_PORTAL`
4. `REGISTERED_RECORD`
5. `FIELD_VERIFICATION`
6. `IMPORTED_SYSTEM`
7. `MANUAL_ENTRY`
8. `SYNTHETIC_DEMO` (never eligible to be an authoritative calculation candidate outside the
   demo/illustrative context, §20)

Algorithm for two events of the same `event_type`/`case_id`/`parcel_ref` with different dates:

1. **Preserve both** `AcquisitionEvent` rows unconditionally — never overwrite.
2. **Detect the conflict** (same logical event, different `event_date`) and record it as a
   first-class `EventConflict` record (case_id, event_type, competing event_ids, detected_at) —
   not implemented as code in this step, but must exist as a queryable object in Step 6B, not
   just a UI warning banner.
3. **Determine authoritative-source hierarchy** per the list above.
4. **Select a calculation candidate only if justified**: the higher-authority source is used as
   the clock's `calculation_basis` **only if** (a) it strictly outranks every competing source,
   and (b) no competing source is itself `verified: true` while the higher-ranked one is
   `verified: false`. A verified lower-ranked source beats an unverified higher-ranked one.
5. **Otherwise, `CLOCK_UNCERTAIN`.** No tie-break by recency ("whichever arrived last"), and no
   silent averaging/splitting-the-difference of two dates.
6. **Gazette vs manual entry, specifically**: per the task's explicit example, a Gazette-sourced
   date is never overwritten by a manual-entry date. The manual entry is kept as a competing,
   lower-authority record, visible for human reconciliation, and the clock stays on the Gazette
   date (or `CLOCK_UNCERTAIN` if the Gazette record itself is unverified/low-confidence).

---

## 10. Extension strategy

Four-state model, matching the task's spec:

- `EXTENSION_UNKNOWN` — default; no extension has been asserted at all.
- `EXTENSION_CLAIMED` — an extension has been entered/asserted (any source) but not yet backed
  by a verifiable order.
- `EXTENSION_VERIFIED` — a specific `ExtensionEvidence` record exists and has been marked
  verified (see below).
- `EXTENSION_REJECTED` — an extension was claimed/sought and a competent authority order refused
  it, or a verification review determined the claimed evidence does not actually support an
  extension.

```
ExtensionEvidence
  extension_order_id         string
  extension_date              date
  authority                   string            — must match the Act's extension power-holder
                                                 (RFCTLARR: "appropriate Government"; NH Act 3D:
                                                 NO known extension power — see §5, so an NH Act
                                                 3D extension claim should default toward
                                                 EXTENSION_REJECTED pending a specific legal
                                                 finding that a mechanism does exist)
  reason                       string
  source_document              string
  effective_period             {from: date, to: date}
  verification_status          enum (mirrors the 4 states above)
```

**Rule: an `ExtensionEvidence` record existing is not sufficient by itself to move
`extension_status` to `EXTENSION_VERIFIED`.** Verification requires the evidence to be checked
against the Act's actual extension power (does this Act/section even have one? — per §4/§5, only
RFCTLARR S.19/S.25 do) and against the "written reasons + web-published" formal requirement both
of those sections impose. An extension claimed for a clock that has no statutory extension power
(NH Act 3D) is a data-quality signal, not a valid extension, and should route to
`EXTENSION_REJECTED` with a note, not `EXTENSION_UNVERIFIED`.

If no `ExtensionEvidence` exists at all for a clock that has apparently expired:
`EXTENSION_UNVERIFIED` is the correct clock-status contribution (§14) — **the deadline is never
silently pushed out.**

---

## 11. Court-stay strategy

```
CourtStayEvent (two rows per stay: COURT_STAY_START, COURT_STAY_END; END may be absent = ongoing)
  case_reference               string
  court                         string
  order_date                    date
  effective_from                date
  effective_to                  date | null
  scope                         enum ('PARCEL' | 'STAGE' | 'PROJECT')
  affected_parcels              string[]         — required if scope = PARCEL
  affected_stage                enum | null      — required if scope = STAGE (e.g. only pauses
                                                  the S.25 award clock, not the S.19 declaration
                                                  clock, if that's what the order actually says)
  source_document                string
  verification_status            enum (mirrors §10's states, reused for consistency)
```

- **A stay only pauses the specific clock(s) its scope actually covers.** Per §4/§5, this
  matters legally: S.19(7) and NH Act 3D(3) both have **express** statutory stay-exclusion
  language for *their own* deadline; S.25 and S.24(2) do not have express language and rely on
  case-law reasoning whose scope is less certain (§4). A `CourtStayEvent`'s `affected_stage`
  must therefore be checked against the specific `RuleSet`'s `stay_definition` (§16) for that
  clock before it is allowed to pause it — a stay order that only restrains "further proceedings
  under Section 19" should not be applied to pause a Section 25 clock the case hasn't reached
  yet, and vice versa.
- **Partial-scope stays (some parcels only, or one stage only) must not be applied
  project-wide.** A project-level clock computed by aggregating parcel-level clocks (mirroring
  how `mlApiService.aggregateProjectCaseInput` already aggregates parcel data for the ML feature
  vector — see [[prediction-feature-schema]]) must apply a `PARCEL`-scoped stay only to the
  specific parcels named in `affected_parcels`.
- **Unclear-scope stays** (order text ambiguous about what it restrains) should not be
  auto-applied to any clock; they should surface as `CLOCK_UNCERTAIN` with the stay event
  attached as unresolved evidence, pending human classification of scope.
- **Do not sum every open court case's duration and subtract it from every clock.** A parcel
  having `courtCaseStatus: 'Active - Stay Order'` today (as already modeled in `Parcel`, §2) is
  evidence a `CourtStayEvent` *might* exist — it is not itself a stay-scope-and-effective-date
  record and must not be treated as one.

---

## 12. Clock-status state machine

States (task's minimum set, no additions found necessary in this pass):

```
INSUFFICIENT_BASIS      — no trigger event/date exists for this clock at all
CLOCK_CERTAIN            — trigger exists, is verified/high-confidence, no unresolved conflict,
                            no unresolved stay claim, deadline computed and not yet exceeded
CLOCK_UNCERTAIN          — trigger conflict unresolved, OR stay-scope unresolved, OR the
                            applicable RuleSet's own duration/stay/extension definition is itself
                            flagged NOT SUFFICIENTLY VERIFIED (e.g. S.24(2) stay treatment, S.14
                            duration — §4)
EXTENSION_UNVERIFIED     — clock's computed deadline has passed AND an extension has been
                            claimed (EXTENSION_CLAIMED) but not yet verified
APPARENT_LAPSE           — clock's computed deadline has passed, no extension claim exists (or
                            an extension claim exists and was EXTENSION_REJECTED), and the
                            evidence basis for the computation was itself CLOCK_CERTAIN
LEGACY_1894              — case is routed through RFCTLARR Section 24 rather than an ordinary
                            RFCTLARR/NH-Act clock; this is a case-classification state that sits
                            alongside (not necessarily "instead of") one of the above for
                            whichever specific clock (e.g. the Section 25 award clock a
                            24(1)(a) case is subject to) is actually in play
```

Transitions (exact, matching the task's example plus the gaps it left open):

```
no trigger date recorded
  → INSUFFICIENT_BASIS

trigger exists, single source, verified, high confidence
  → CLOCK_CERTAIN

trigger exists but ≥2 competing unresolved AcquisitionEvent records (§9)
  → CLOCK_UNCERTAIN

trigger exists, verified, clock computed, current_date < adjusted_deadline
  → CLOCK_CERTAIN   (this is the "on track" / not-yet-due case — the task's example set doesn't
                      name a separate "not yet due" state, and CLOCK_CERTAIN already means
                      "the computation itself is trustworthy", not "the deadline has passed" —
                      days_remaining on the StatutoryClock object, §15, carries the "how close"
                      information, not the status enum)

trigger exists, verified, clock computed, current_date > adjusted_deadline,
no extension claim, no unresolved stay
  → APPARENT_LAPSE

trigger exists, verified, clock computed, current_date > adjusted_deadline,
EXTENSION_CLAIMED exists, not yet EXTENSION_VERIFIED
  → EXTENSION_UNVERIFIED

trigger exists, verified, clock computed, current_date > adjusted_deadline,
EXTENSION_VERIFIED exists and its effective_period covers current_date
  → CLOCK_CERTAIN   (re-enters certain state under the extended deadline)

trigger exists, but the clock's own RuleSet.duration_definition or .stay_definition is itself
NOT SUFFICIENTLY VERIFIED (§4 rows so flagged)
  → CLOCK_UNCERTAIN   (regardless of how clean the case-level evidence is — the rule itself,
                        not just the facts, must be trustworthy)

case identified as RFCTLARR Section 24 territory
  → LEGACY_1894 (case-classification state; a specific clock within the case, e.g. the
                  Gosikhurd-derived Section 25 award clock, still separately carries one of the
                  states above)
```

`APPARENT_LAPSE` must be rendered with the task's exact caveat attached at the data-model level
(not left to a UI string that could drift): a `consequence_class` field (§15) distinguishes
`PROCESS_DELAY` / `CLOCK_AT_RISK` / `CLOCK_EXPIRED` / `APPARENT_LAPSE` /
`LEGAL_STATUS_REQUIRES_VERIFICATION` (§19) from the *legal* conclusion the phrase could be
misread as. The clock-status enum answers "what does KSHETRA's deterministic evidence show";
`consequence_class` answers "how should a human read this" — keeping them as two fields (not
one) is what stops a high clock-status number from silently becoming a UI word like "LAPSED"
(§19's own requirement).

---

## 13. StatutoryClock schema

```
StatutoryClock
  clock_id                    string
  case_id                     string
  parcel_ref | project_ref    string | null
  applicable_act               enum ('RFCTLARR' | 'NH_ACT_1956' | 'LA_ACT_1894')
  section_reference             string            — e.g. "RFCTLARR s.25", "NH Act s.3D" — never
                                                    a paired label like the existing "Sec 3D/19"
  rule_set_id + rule_set_version string           — FK into RuleSet (§16); the clock is always
                                                    computed against one specific, named,
                                                    versioned rule, never an inline constant
  trigger_event_id               string            — FK into AcquisitionEvent (§8)
  trigger_date                   date
  statutory_period                string            — human/legally-readable, e.g.
                                                    "12 months from s.19 declaration publication",
                                                    not just a bare number, so the record itself
                                                    documents what it means
  computed_deadline               date | null       — null while INSUFFICIENT_BASIS/UNCERTAIN
  extension_status                 enum (§10)
  extension_evidence_id            string | null    — FK into ExtensionEvidence (§10)
  stay_adjustment_days             integer           — total days excluded by in-scope, verified
                                                       CourtStayEvents (§11); 0 if none apply
  adjusted_deadline                 date | null       — computed_deadline + stay_adjustment_days,
                                                       further shifted by a verified extension
  current_date                      date              — the date the clock was evaluated against
                                                       (never "now" implicitly — always recorded,
                                                       mirroring the existing DEMO_ASOF_DATE
                                                       discipline already used for reproducible
                                                       demo predictions, §2)
  days_elapsed                      integer | null
  days_remaining                    integer | null    — signed; negative once past deadline
  clock_status                      enum (§12)
  consequence_class                 enum (§19)
  calculation_basis                 enum             — mirrors §9's source-authority tier that
                                                       was actually used, or "UNRESOLVED_CONFLICT"
  source_references                 string[]          — AcquisitionEvent / CourtStayEvent /
                                                       ExtensionEvidence ids that fed this
                                                       computation, for full traceability
  calculated_at                     datetime
  calculation_version               string            — the date-calculation utility's own
                                                       version (§15), independent of rule_set_version
```

`section_reference` is deliberately a plain string tied one-to-one to a single Act's section,
never a `"3D/19"`-style paired value — this is the field that directly prevents the `LarrStage`
conflation (§2) from leaking into the new engine.

---

## 14. RuleSet/versioning architecture

```
RuleSet
  rule_set_id                 string
  act                          enum ('RFCTLARR' | 'NH_ACT_1956' | 'LA_ACT_1894')
  section                       string             — e.g. "25", "3D", "24(2)"
  jurisdiction                  string             — e.g. "IN-TN" (state-level rules may refine
                                                    central-Act defaults; none reviewed yet, §26)
  version                       string
  effective_from                 date
  effective_to                   date | null
  trigger_definition              structured spec  — which AcquisitionEvent subtype(s) count as
                                                    the trigger for this rule
  duration_definition             structured spec  — the period + its calendar-counting method
                                                    (§15), plus a `confidence` field carried at
                                                    the RULE level (so, e.g., the S.24(2)
                                                    duration itself is HIGH confidence while its
                                                    stay treatment sub-field is LOW — §4)
  extension_definition             structured spec | null  — null for rules with no identified
                                                    extension mechanism (NH Act 3D, per §5) —
                                                    explicitly null, not merely omitted, so the
                                                    absence is itself a checked, versioned fact
  stay_definition                  structured spec | null  — whether/how a CourtStayEvent may
                                                    pause this rule's clock; carries its own
                                                    `basis` field distinguishing "express
                                                    statutory text" (S.19, 3D) from "case-law
                                                    only" (S.25, S.24(2), §4)
  consequence_definition           structured spec  — e.g. "notification deemed rescinded" (S.19)
                                                    vs "entire proceedings shall lapse" (S.25) vs
                                                    "notification ceases to have effect" (3D) —
                                                    these are legally distinct outcomes and must
                                                    not be normalized into one generic "lapse"
                                                    string
  source_reference                  string            — citation (Act/section, or case citation
                                                    for judicially-derived sub-rules)
  source_hash                       string            — hash of the source text/citation, so a
                                                    later re-verification pass can detect if the
                                                    underlying source text this RuleSet was built
                                                    from has since been re-checked/changed
  approved_by                       string | null     — a named legal reviewer, not a role
  approval_status                    enum ('DRAFT' | 'PENDING_LEGAL_REVIEW' | 'APPROVED' |
                                          'SUPERSEDED')
```

**Every RuleSet in §4/§5's matrices that this audit marked below "High" confidence on any
sub-field must be created with `approval_status: PENDING_LEGAL_REVIEW`, not `APPROVED`, at
initial load — none of this audit's findings should be treated as pre-approved for production
use.** `Application code must not contain hard-coded legal constants` (the task's own rule) means
Step 6B's engine reads `duration_definition.value` etc. from the DB row, never from a
`const`/`AWARD_LIMIT_MONTHS = 12` anywhere in `backend/` or `src/`.

---

## 15. Date-calculation strategy

Findings/decisions to carry into Step 6B (no utility implemented yet):

- **Calendar months, not a fixed-day approximation.** RFCTLARR's "12 months" and the NH Act's
  "1 year" are calendar periods (e.g. 19 Jan 2024 + 12 months = 19 Jan 2025), **not** the
  `30.4375`-day average already used by `predictionFeatures.ts`'s `notificationAgeMonths()`
  (§2) — that utility is correct for its own ML-feature purpose (a smooth, stable elapsed-time
  number) but legally wrong for a deadline computation, and the two must never share code. A
  future `calculateStatutoryDeadline()` utility needs real calendar-month arithmetic (respecting
  actual month lengths and leap years, e.g. via each language's proper date-library month-add
  operation, not manual day counting).
- **Inclusive/exclusive counting of the trigger day itself** was not resolved in this pass —
  Indian land-acquisition case law on "12 months from the date of publication" (whether that
  date is day 0 or day 1) needs a specific citation before Step 6B encodes it either way; default
  to flagging this as an open question in the date-utility's own design doc rather than guessing.
- **Which publication event is "the" trigger date** when an Act requires multiple publication
  modes (Gazette + newspapers + local affixing, per S.11/3A) was also not resolved to a specific
  citation in this pass — commonly the *last* of the required publications is treated as
  operative under general principles carried over from the 1894 Act era, but this must be
  confirmed, not assumed, before the engine picks one `AcquisitionEvent.publication_date` over
  another for the same notification.
- **Court-stay exclusion arithmetic**: `stay_adjustment_days` (§13) must be computed only from
  `CourtStayEvent` rows that are (a) `verification_status: EXTENSION_VERIFIED`-equivalent (i.e.
  actually verified, not merely claimed) and (b) in-scope for the specific clock per §11 — never
  a blanket "total days any court case was open."
- **Extensions** shift `adjusted_deadline` only when `extension_status: EXTENSION_VERIFIED` and
  `current_date` falls within the extension's own `effective_period`.
- **Missing/conflicting dates**: per §9/§12, these resolve to `CLOCK_UNCERTAIN`/
  `INSUFFICIENT_BASIS`, never a computed number with an asterisk.
- **One centralized utility.** Whatever calendar-math library Step 6B picks (backend Python:
  likely `dateutil.relativedelta` for calendar-correct month addition; frontend, if ever needed
  for display-only re-derivation: a proper date library, not manual ms-arithmetic) must be used
  by every RuleSet's `duration_definition` evaluation — no per-clock-type bespoke date math,
  mirroring the same "one centralized helper, not per-function reinvention" principle already
  applied to the sync layer in Step 5B ([[prediction-architecture]] shows the project's existing
  preference for single-sourced logic over parallel copies).

---

## 16. AI integration boundary

**Not connected in this step**, and the task's constraint (`/predict`'s contract and
`predictionFeatures.ts` untouched) is fully respected — nothing here changes the existing 7-field
`FastApiCaseInput` schema documented in [[prediction-feature-schema]].

Future-facing design (not implemented):

```
Case State  +  Statutory Clock State  +  Blockers  +  Process Features
                                    ↓
                              ML Model
                                    ↓
     Probability of missing the required milestone before the statutory consequence
                                    ↓
                     Expected timing / uncertainty
```

- The model must **never** receive a `computed_deadline` or `days_remaining` number and treat it
  as ground truth for a case whose `clock_status` is anything other than `CLOCK_CERTAIN`. A
  `CLOCK_UNCERTAIN`/`INSUFFICIENT_BASIS`/`EXTENSION_UNVERIFIED` case should feed the model a
  **clock-state category**, not a fabricated day-count.
- Proposed future response shape: `PREDICTION_WITH_CLOCK_UNCERTAINTY` — a prediction is still
  produced (the model still answers "how likely is delay"), but it is explicitly flagged as not
  anchored to a certain legal deadline, and the UI must not render a countdown number next to
  it. An alternative considered: refusing to predict at all when the clock is uncertain — rejected
  as unnecessarily restrictive, since the model's actual trained target (delay probability, per
  [[prediction-architecture]]) does not strictly require a certain deadline to be meaningful; it
  only becomes misleading if the deadline uncertainty is hidden rather than surfaced.
- This boundary is a **one-way gate**: clock state can flow into a future model input; a model
  probability must never flow backward into deciding what the clock status is (that would let an
  ML confidence score override a legal determination — precisely the inversion §1's core
  principle forbids).
- Retraining, feature-schema changes, or touching `ai-model/**`, `train.py`, `survival.py`,
  `explain.py` is explicitly out of scope for Step 6A **and** for whatever immediately follows in
  Step 6B per the task's own constraint list — this boundary section is a target architecture for
  a *later*, separately-scoped step, not a Step 6B deliverable.

---

## 17. Demo scenarios (illustrative / synthetic only)

All six are **ILLUSTRATIVE / SYNTHETIC DEMO** data, to be built with `source_type:
SYNTHETIC_DEMO` on every event, never presented as real government cases (per the task's
constraint and the project's existing hard rule against implying live government connectivity —
[[status-truthfulness]]).

| Case | Act | Scenario | Expected clock_status | Purpose |
|---|---|---|---|---|
| **A** | RFCTLARR | Clean S.19 declaration on record, single verified source, current date approaching but not past the S.25 12-month award deadline | `CLOCK_CERTAIN`, `consequence_class: CLOCK_AT_RISK` as it nears the deadline | Baseline "everything is knowable" case |
| **B** | RFCTLARR | S.25 deadline has passed; an extension is claimed (a date and a named authority given) but no `ExtensionEvidence.source_document` / web-publication proof exists | `EXTENSION_UNVERIFIED` | Demonstrates the task's core anti-pattern guard: an unverified claim never silently pushes the deadline |
| **C** | NH Act | 3A notification on record; no 3D declaration yet; elapsed time approaching the 1-year 3A→3D limit | `CLOCK_CERTAIN`, `consequence_class: CLOCK_AT_RISK`, and — because §5 found no NH Act 3D extension mechanism — the UI must not offer an "extend" affordance for this clock the way it could for Case A/B | Demonstrates the RFCTLARR-vs-NH-Act asymmetry from §1/§5 concretely |
| **D** | NH Act | 3A and 3D both on record, both `OFFICIAL_GAZETTE`-sourced, gazette numbers/S.O. numbers/dates cross-consistent (§8's entity-resolution keys all match) | `VERIFIED_PAIR` (§8) feeding a `CLOCK_CERTAIN`, deadline already satisfied (3D published inside the 1-year window) | Demonstrates a clean notification-pairing success path |
| **E** | RFCTLARR or NH Act (either) | Two competing `AcquisitionEvent` records for the same declaration/notification with different dates from different sources, neither clearly dominant per §9's hierarchy | `CLOCK_UNCERTAIN` | Demonstrates conflict-preservation instead of last-write-wins |
| **F** | Legacy 1894 → RFCTLARR S.24 | 1894 award made pre-2014, now past the 5-year mark, possession not taken (per S3's disjunctive reading this alone can support lapse) but a live court stay of ambiguous scope is on record | `LEGACY_1894` case classification; the specific S.24(2)/S.25 clock evaluates to `CLOCK_UNCERTAIN` **because the stay-scope is ambiguous and S.24(2)'s stay treatment is itself flagged NOT SUFFICIENTLY VERIFIED (§4)** — deliberately not `APPARENT_LAPSE` despite the 5-year mark being passed, to demonstrate that a rule-level uncertainty (§4/§16) overrides a case-level "looks expired" reading | Demonstrates §12's "the rule itself, not just the facts, must be trustworthy" transition, and legacy-case handling together |

Every demo case's data (event dates, gazette numbers, court references) must be clearly synthetic
in form (e.g. placeholder S.O. numbers, fictional court/CNR patterns consistent with how the
existing `mockData.ts` already fabricates `ECourtRecord`/`BhoomiRevenueRecord` data — §2) and
each screen/report showing them must carry the same "Simulated/Illustrative" labelling the
project already uses for `GovDataSyncView` and the parcel dossier gov-record tabs
([[status-truthfulness]]).

---

## 18. Existing fields reusable from KSHETRA

| Existing field | Reusable as | Caveat |
|---|---|---|
| `Parcel.notificationDate` | Seed data / migration source for an initial `PRELIMINARY_NOTIFICATION` `AcquisitionEvent` per parcel | Must be re-classified with an explicit `applicable_act` (not currently recorded) and a `source_type` (likely `SYNTHETIC_DEMO` for all current seed data) before it can back a real clock |
| `Parcel.courtCase`, `courtCaseStatus`, `ECourtRecord.{interimInjunction, filingDate, nextHearingDate, caseStatus}` | Signal that a `CourtStayEvent` may exist for that parcel | Needs a real `effective_from`/`effective_to`/`scope` before use — today's fields describe case *status*, not a stay's *legal effect window* |
| `Parcel.acquisitionStatus`, `possessionStatus`, `compensationStatus` | Corroborating/cross-check evidence once real clocks exist (e.g. a clock computation can be sanity-checked against `possessionStatus: 'Complete'`) | Must never be read as the primary source of a legal determination — these are operational status fields, not provenance-carrying events |
| `Project.currentLarrStage` / `Parcel.stage` (`LarrStage`) | UI label only, for cross-reference display next to a real clock (e.g. "declared stage says X; clock engine says Y" as a consistency check) | **Must never be the input to a clock computation** (§1/§2) |
| `AuditLog` | Model for the append-only, attributed logging pattern already established for user actions ([[running-the-app]]-adjacent code in `AppContext.tsx`) | A future `AcquisitionEvent`/`StatutoryClock` change history should follow the same append-only philosophy, not literally reuse the `AuditLog` table (different entity, different retention needs) |
| `backend/models.py` SQLAlchemy patterns (human-readable string PKs, `created_at`/`updated_at` via `_utcnow()`, JSON columns for structured sub-objects) | Direct structural precedent for new tables (§19) | New date-bearing columns (`event_date`, `trigger_date`, `computed_deadline` etc.) should be real `DateTime`/`Date` columns from the start, unlike the existing display-string pattern the docstring in `models.py` explicitly says was a deliberate choice to avoid behavior change — that constraint doesn't apply to a brand-new subsystem |
| `apiClient.ts` typed-wrapper pattern (one file owns all HTTP calls; `AppContext` orchestrates) | Structural precedent for however Step 6B's frontend consumes the new clock endpoints, if/when a frontend surface is added | Not a Step 6B requirement by itself — see §21 (frontend changes are explicitly deferred) |

---

## 19. New database tables required (design only — no migration created)

- `acquisition_events` — backs §8's `AcquisitionEvent`.
- `court_stay_events` — backs §13's `CourtStayEvent`.
- `extension_evidence` — backs §10's `ExtensionEvidence`.
- `rule_sets` — backs §16's `RuleSet` (seeded from this audit's matrices, all rows starting
  `approval_status: PENDING_LEGAL_REVIEW`).
- `statutory_clocks` — backs §15's `StatutoryClock`, one row per (case, parcel_or_project,
  section_reference) computation snapshot — likely append-only/versioned like
  `case_predictions` already is (`backend/models.py` §2), so a clock's history over time is
  itself auditable, not overwritten in place.
- `event_conflicts` — backs §11's conflict-preservation requirement (a queryable record of
  unresolved competing events, not just a transient UI state).
- Association/lookup support: a `case_id` concept does not exist yet at all in the current schema
  (today everything hangs off `parcel_id`/`project_id` directly) — Step 6B needs to decide
  whether "case" = "project" 1:1, or a new intermediate entity (a project can plausibly span
  multiple legally-distinct acquisition cases, e.g. a highway corridor with both legacy-1894
  segments and fresh RFCTLARR segments). **Flagged as a design decision Step 6B must make
  explicitly, not default silently** — this could be the "absolutely required" migration the
  task asks to be stopped and reported on, if Step 6B concludes a new `case_id` concept is
  unavoidable. Recorded here, not decided here.

None of this was created in this step, per the task's stop condition.

---

## 20. New API endpoints required (design only)

Illustrative REST shape, following the existing `apiClient.ts`/`backend/routers/*.py`
per-entity-file convention (§18):

- `GET/POST /api/acquisition-events`, `GET /api/acquisition-events/{id}`
- `GET/POST /api/court-stay-events`
- `GET/POST /api/extension-evidence`
- `GET /api/rule-sets`, `GET /api/rule-sets/{act}/{section}` (read-mostly; rule-set authoring is
  presumably an admin/legal-reviewer path, not a general write endpoint)
- `GET /api/statutory-clocks?case_id=...` / `GET /api/statutory-clocks/{clock_id}`
- `POST /api/statutory-clocks/recompute` (explicit recomputation trigger, not an implicit
  side-effect of unrelated writes elsewhere — recomputation should be an auditable, deliberate
  action, mirroring the explicit `runSyncedMutation`-style centralization already adopted for the
  sync layer)
- `GET /api/event-conflicts?case_id=...`

None of this was created in this step.

---

## 21. Frontend changes eventually required (design only)

- A new "Statutory Clocks" view/tab per case, showing `StatutoryClock` rows with their
  `clock_status`, `consequence_class`, and `days_remaining` — explicitly **not** merged into the
  existing `PredictiveAnalyticsView` (which is ML-only) or the existing `SystemStatusIndicator`
  (which is app/infra status, not legal status — [[status-truthfulness]]).
- A conflict-resolution/review surface for `event_conflicts` and `PENDING_LEGAL_REVIEW`
  `rule_sets` — likely relevant to a "legal reviewer" role that does not exist in today's
  `UserRole` union (`'collector' | 'cala' | 'planner'`, `src/types/index.ts`) — **a new role may
  be needed**, flagged for Step 6B/later, not decided here.
- UI copy must adopt the `consequence_class` distinctions (§19 below) rather than the word
  "lapsed" for any ML-probability-driven or clock-uncertain state, and must fix the
  `ReportGeneratorView.tsx:205` two-Acts-in-one-sentence pattern (§2) once a real
  `applicable_act` is available per case, instead of continuing to imply both Acts always apply
  together.
- None of this was implemented in this step, per the task's stop condition.

---

## 22. Files Step 6B should create

*(Design recommendation only, mirroring the existing per-entity file layout — not created now.)*

- `backend/models.py` — new SQLAlchemy model classes for the tables in §19 (additive to the
  existing file, not a rewrite).
- `backend/routers/acquisition_events.py`, `court_stay_events.py`, `extension_evidence.py`,
  `rule_sets.py`, `statutory_clocks.py` — one router per entity, matching the existing
  `alerts.py`/`case_actions.py`/`projects.py` pattern.
- `backend/legal/` (new package) — home for the date-calculation utility (§15), the clock-state
  machine (§12), and the conflict-resolution logic (§9) as pure, independently testable Python
  modules, kept deliberately separate from `backend/routers/*.py` (thin HTTP layer) and from
  `ai-model/**`/`inference_service.py` (ML layer) so the "LAW vs AI PREDICTION" boundary from §1
  is a real module boundary, not just a documentation convention.
- `backend/legal/rule_sets_seed.py` (or a seed-data JSON/fixture) — the RuleSet rows derived from
  this audit's §4/§5 matrices, all `approval_status: PENDING_LEGAL_REVIEW`.
- `src/types/legal.ts` — new frontend types mirroring §8/§13/§14/§15's schemas (kept separate
  from `src/types/index.ts`'s existing `Parcel`/`Project` types).
- `src/services/legalClient.ts` — typed HTTP wrapper for §20's endpoints, matching the existing
  `apiClient.ts` convention (one file owns the HTTP calls).
- `docs/step6a-statutory-clock-audit.md` — **this file**, already created in this step as the
  audit/design record Step 6B should build from.

## 23. Files that MUST remain untouched

Per the task's explicit list, all confirmed still present and unmodified by this step:

- `ai-model/**` (`explain.py`, `generate_dataset.py`, `predict.py`, `survival.py`, `train.py`,
  `models/`, `data/`)
- `backend/main.py`, `backend/inference_service.py`
- `src/services/predictionFeatures.ts` (and its Python counterpart, `predictionFeatures.py`,
  referenced by the task — note: no `predictionFeatures.py` file exists in this repo today; the
  canonical feature schema lives only in the TypeScript file per [[prediction-feature-schema]].
  Flagged so Step 6B doesn't go looking for a Python file that isn't there.)
- `src/context/AppContext.tsx`
- Any statutory-clock or blocker logic — none exists to touch
- The `/predict` request/response contract (`FastApiCaseInput`, `backend/schemas.py`'s
  `CaseInput`)

## 24. Step 6B implementation order (recommendation)

1. **Legal review gate first**: circulate this document (§4/§5/§6 especially) to a qualified
   reviewer before writing any Step 6B code — several rows are explicitly marked Medium/Low
   confidence or "NOT SUFFICIENTLY VERIFIED," and §26 lists open questions that affect schema
   shape (e.g. whether `case_id` needs to be a new first-class entity, §19).
2. `backend/legal/` pure-logic modules first (date calculation §15, clock state machine §12,
   conflict resolution §9) — unit-testable without any DB/API surface, and they're the highest-
   risk-of-legal-error code, so they benefit most from isolated, reviewable, well-tested
   implementation before anything depends on them.
3. `RuleSet` schema + seed data from §4/§5's matrices, all `PENDING_LEGAL_REVIEW`.
4. `AcquisitionEvent`/`CourtStayEvent`/`ExtensionEvidence` schema + the append-only/provenance
   rules from §8/§10/§11.
5. `StatutoryClock` computation wiring the above together, plus `event_conflicts`.
6. Read-only API endpoints (§20) before any write/recompute endpoint, so the computed clocks can
   be reviewed by a human before the system starts acting on its own recomputations.
7. Demo/illustrative seed data (§17) clearly flagged `SYNTHETIC_DEMO`, exercised against the
   pure-logic modules from step 2 as the actual test fixtures.
8. Frontend surface (§21) last, and only once the backend clock states are trustworthy enough to
   show a human without the risk of an unreviewed number looking authoritative.
9. AI integration boundary (§16) — explicitly **not** part of Step 6B; a later, separately-scoped
   step once the clock engine itself has been legally reviewed and is stable.

## 25. Legal uncertainties requiring human/legal review

1. **RFCTLARR Section 24(2) stay treatment** — no express statutory exclusion found; case-law
   basis and exact scope not confirmed to this audit's satisfaction (§4, §11).
2. **RFCTLARR Section 25 stay treatment** — same issue; case-law sourced only, no bare-text
   proviso found (§4).
3. **RFCTLARR Section 14's exact duration/extension/stay provisions** — sourced only via
   paraphrase in this pass, not independently verbatim-confirmed (§4).
4. **NH Act 3D: confirmed absence of an extension mechanism** — established by absence-of-
   evidence across sources reviewed, not by finding an explicit "no extension" clause; needs one
   more confirmation pass against the bare act or a specialist commentary before being hard-coded
   as a `null` `extension_definition` (§5, §14).
5. **Publication-mode trigger-date rule** (which of Gazette/newspaper/local publication counts as
   "the" date when multiple modes are required) — not resolved to a specific citation (§15).
6. **Inclusive/exclusive day-one counting** for "12 months"/"1 year" periods — not resolved (§15).
7. **NH Act Section 3G/3H exact sub-clause text** — summarized via a single aggregated source
   pass, not independently cross-verified against a second primary source the way §4's RFCTLARR
   rows were (§5).
8. **RFCTLARR Section 38's exact three durations (3/6/18 months) and their precise triggers** —
   corroborated by two independent paraphrase extractions but not verified against the literal
   bare-act clause numbering (§4).
9. **Scope of *Tarsem Singh*'s retrospective effect** — described by sources as still under
   active litigation into 2025/2026; the exact boundary of which pre-2019 NH Act awards get
   solatium/interest is not settled enough to encode as a fixed rule (§3, §5).
10. **State-level RFCTLARR Rules and NH Act procedural Rules** — not reviewed in this pass at all
    (§4, §5); given the project's Tamil Nadu-flavoured synthetic data, Tamil Nadu's own RFCTLARR
    Rules should be reviewed before any state-specific clock nuance is encoded.
11. **Whether India Code's own published text differs in any way** from the `indiankanoon.org`
    reproductions relied on here — India Code itself could not be fetched in this environment
    (HTTP 403 on every URL pattern tried); this is a residual verification gap, not a resolved
    fact (§3).
12. **RFCTLARR withdrawal/abandonment provisions** — mentioned in the task's candidate event list
    but not independently audited against the bare act in this pass (§7, §22 file list should
    account for this being researched during Step 6B, not assumed).

## 26. Risks and safeguards

| Risk | Safeguard already designed in |
|---|---|
| A future engineer conflates RFCTLARR and NH Act clocks the way `LarrStage` already does | `applicable_act` mandatory on every `AcquisitionEvent`/`StatutoryClock`/`RuleSet`; `section_reference` never a paired label (§13); `LarrStage` explicitly excluded as an input source (§18) |
| An unverified extension or stay claim silently changes a computed deadline | §10/§11's verification-gated state machines; §12's explicit `EXTENSION_UNVERIFIED` state |
| Conflicting source dates get resolved by "last write wins" | §9's preserve-both + hierarchy-with-justification algorithm, defaulting to `CLOCK_UNCERTAIN` |
| A rule whose legal basis is itself shaky (§4's "NOT SUFFICIENTLY VERIFIED" rows) gets treated as trustworthy just because the case-level facts are clean | §12's explicit transition rule: rule-level uncertainty forces `CLOCK_UNCERTAIN` regardless of fact-level cleanliness; §16's `approval_status: PENDING_LEGAL_REVIEW` default |
| `APPARENT_LAPSE` gets read by a user (or a future ML integration) as a certified legal conclusion | §12/§19's two-field split (`clock_status` vs `consequence_class`) plus the task's exact caveat language, carried as a design requirement, not left to UI copy discretion |
| Demo/illustrative data drifts into being displayed as real | `SYNTHETIC_DEMO` as a first-class, schema-level `source_type` (§8), consistent with the project's existing [[status-truthfulness]] discipline |
| Step 6B scope-creeps into touching the ML model, `/predict`, or `AppContext.tsx` | §16's explicit one-way-gate AI boundary description; §23's untouched-files list; this audit itself recommends deferring AI integration to a separately-scoped step (§24, step 9) |
| A new `case_id` concept turns out to require a real schema migration Step 6B didn't plan for | Flagged explicitly in §19 as a design decision to surface and report on, not silently default |
| This audit's own legal conclusions are wrong or incomplete (India Code itself was unreachable in this environment; several rows are explicitly hedged) | §3's source table states confidence per source; §26 (this section's own list) enumerates exactly what needs human legal review before Step 6B encodes it as `APPROVED` |

---

*End of Step 6A report. No code, schema, or migration was written. Stopping here per the task's
strict stop condition.*
