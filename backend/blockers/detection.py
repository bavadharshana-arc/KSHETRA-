"""
The four blocker detectors: detect_b1 / detect_b2 / detect_b3 / detect_b4.

Pure functions. No database, no HTTP, no ML import. Every function ALWAYS
returns a `BlockerEvaluation` (never None, never raises for an ordinary
"evidence isn't good enough" situation -- mirrors
legal.clock_engine.compute_statutory_clock's own discipline), so a clean or
insufficient-evidence outcome is exactly as inspectable/testable as a raised
one.

B1 consumes `legal.clock_engine.StatutoryClockResult` directly and performs
NO date arithmetic, NO deadline computation, and imports no RuleSet -- see
docs/step7a-blocker-engine-audit.md Section C and the Step 7B brief Section 4
("B1 MUST consume the existing Step 6B legal clock result. DO NOT calculate
another statutory deadline.").

B2/B3/B4 consume `evidence.ParcelEvidenceInput` (and, for B4, an optional
real `legal.stays.CourtStayEvent`) and are explicitly capped at the
confidence ceilings established in docs/step7a-blocker-engine-audit.md
Sections D/E/F -- most importantly: B2 and B3 (evidence-only, bare status
fields with no provenance) can NEVER reach BlockerStatus.CONFIRMED in this
implementation; only B1 (backed by the Step 6B legal engine) and B4 (when
backed by a real, verified, in-scope CourtStayEvent) can.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timezone
from typing import Optional

from legal.clock_engine import StatutoryClockResult
from legal.enums import ClockStatus, ConsequenceClass, EvidenceVerificationStatus, StayScope
from legal.stays import CourtStayEvent

from .enums import (
    B4EvidenceSubtype,
    BLOCKER_SEVERITY_RANK,
    BlockerEvaluationOutcome,
    BlockerSeverity,
    BlockerStatus,
    BlockerType,
    EvidenceRelation,
    outcome_to_status,
)
from .evidence import (
    ParcelEvidenceInput,
    clock_evidence,
    court_stay_evidence,
    field_verification_evidence,
    new_id,
    parcel_field_evidence,
)
from .models import Blocker, BlockerEvaluation, DownstreamExtent

ENGINE_VERSION = "kshetra-blocker-engine-1.0.0"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# =============================================================================
# B1 -- Statutory Clock Exposure
# =============================================================================

_B1_OWNER_ROLE = "Collector / CALA / LAO"
_B1_AUTHORITY = "Collector / Competent Authority for Land Acquisition (CALA) / Land Acquisition Officer"

# days_remaining threshold at which a CLOCK_AT_RISK exposure is escalated
# from MODERATE to HIGH severity. Independent of, and narrower than,
# clock_engine.py's own 30-day CLOCK_AT_RISK threshold (clock_engine.py:239)
# -- B1 never redefines that threshold, only adds a finer severity grade
# within the window the legal engine already flagged.
_B1_HIGH_SEVERITY_DAYS_REMAINING = 14


def detect_b1(
    clock: StatutoryClockResult, *, engine_version: str = ENGINE_VERSION
) -> BlockerEvaluation:
    """Maps one `StatutoryClockResult` onto a B1 evaluation, per the exact
    table in docs/step7a-blocker-engine-audit.md Section C. Never reads the
    wall clock, never recomputes a deadline -- `clock` is the entire input."""

    def _raise(
        outcome: BlockerEvaluationOutcome, severity: BlockerSeverity, notes_suffix: str = ""
    ) -> BlockerEvaluation:
        evidence = clock_evidence(
            evidence_id=new_id("BEV"),
            clock_id=clock.clock_id,
            clock_status=clock.clock_status.value,
            consequence_class=clock.consequence_class.value,
            days_remaining=clock.days_remaining,
            adjusted_deadline=clock.adjusted_deadline,
            calculation_basis=clock.calculation_basis,
            notes=clock.notes,
        )
        notes = clock.notes
        if notes_suffix:
            notes = f"{notes} {notes_suffix}".strip()
        blocker = Blocker(
            blocker_id=new_id("BLK"),
            case_reference=clock.case_reference,
            project_id=clock.project_id,
            parcel_id=clock.parcel_id,
            blocker_type=BlockerType.B1,
            status=outcome_to_status(outcome),
            severity=severity,
            owner_role=_B1_OWNER_ROLE,
            responsible_authority=_B1_AUTHORITY,
            evidence=(evidence,),
            affects_clock=True,
            affected_clock_ids=(clock.clock_id,),
            affects_possession=False,
            affects_project=clock.parcel_id is None,
            downstream_extent=DownstreamExtent(
                affected_parcel_ids=(clock.parcel_id,) if clock.parcel_id else (),
                affected_parcel_count=1 if clock.parcel_id else None,
            ),
            engine_version=engine_version,
            calculation_date=clock.calculation_date,
            notes=notes,
            calculated_at=clock.calculated_at,
        )
        return BlockerEvaluation(
            outcome=outcome,
            blocker=blocker,
            reason=f"clock_status={clock.clock_status.value}, consequence_class={clock.consequence_class.value}",
        )

    status = clock.clock_status
    consequence = clock.consequence_class

    if status == ClockStatus.INSUFFICIENT_BASIS:
        return _raise(BlockerEvaluationOutcome.INSUFFICIENT_EVIDENCE, BlockerSeverity.INFORMATIONAL)

    if status == ClockStatus.CLOCK_CERTAIN and consequence == ConsequenceClass.PROCESS_DELAY:
        return BlockerEvaluation(
            outcome=BlockerEvaluationOutcome.EVIDENCE_OF_NO_BLOCKER,
            blocker=None,
            reason="CLOCK_CERTAIN/PROCESS_DELAY: comfortably ahead of the statutory deadline.",
        )

    if status == ClockStatus.CLOCK_CERTAIN and consequence == ConsequenceClass.CLOCK_AT_RISK:
        days_remaining = clock.days_remaining
        severity = (
            BlockerSeverity.HIGH
            if days_remaining is not None and days_remaining <= _B1_HIGH_SEVERITY_DAYS_REMAINING
            else BlockerSeverity.MODERATE
        )
        return _raise(BlockerEvaluationOutcome.DETECTED, severity)

    if status == ClockStatus.CLOCK_UNCERTAIN:
        return _raise(
            BlockerEvaluationOutcome.SUSPECTED,
            BlockerSeverity.WATCH,
            notes_suffix=(
                "B1 confidence hard-capped at SUSPECTED: CLOCK_UNCERTAIN is a signal that KSHETRA "
                "cannot rule out expiry, never a confirmed finding of exposure."
            ),
        )

    if status == ClockStatus.EXTENSION_UNVERIFIED:
        return _raise(
            BlockerEvaluationOutcome.DETECTED,
            BlockerSeverity.HIGH,
            notes_suffix="Deadline passed under the original computation; a claimed extension is not yet verified.",
        )

    if status == ClockStatus.APPARENT_LAPSE:
        if consequence == ConsequenceClass.APPARENT_LAPSE:
            return _raise(
                BlockerEvaluationOutcome.CONFIRMED,
                BlockerSeverity.CRITICAL,
                notes_suffix=(
                    "CONFIRMED here means KSHETRA confirms its deterministic evidence indicates an "
                    "apparent lapse -- this is NOT a determination that the acquisition has legally "
                    "lapsed; only a competent authority/court can make that determination."
                ),
            )
        return _raise(
            BlockerEvaluationOutcome.DETECTED,
            BlockerSeverity.HIGH,
            notes_suffix=(
                "Non-acquisition-lapse rule passed its deadline (a procedural window or a "
                "possession-readiness precondition) -- this does not by itself mean any acquisition lapsed."
            ),
        )

    if status == ClockStatus.LEGACY_1894:
        if consequence == ConsequenceClass.LEGAL_STATUS_REQUIRES_VERIFICATION:
            outcome = BlockerEvaluationOutcome.INSUFFICIENT_EVIDENCE
        else:
            outcome = BlockerEvaluationOutcome.SUSPECTED
        return _raise(
            outcome,
            BlockerSeverity.WATCH,
            notes_suffix="Legacy 1894 case routing is itself a legal-uncertainty signal; never auto-CONFIRMED.",
        )

    # Defensive fallback -- ClockStatus is a closed enum so this should be
    # unreachable, but a blocker detector must never crash on an unexpected
    # (e.g. future-added) status; degrade to the most conservative outcome.
    return _raise(
        BlockerEvaluationOutcome.INSUFFICIENT_EVIDENCE,
        BlockerSeverity.INFORMATIONAL,
        notes_suffix=f"Unrecognized ClockStatus {status!r}; treated conservatively.",
    )


# =============================================================================
# B2 -- Title & Record Friction
# =============================================================================

_B2_OWNER_ROLE = "Revenue / Registration authority"
_B2_AUTHORITY = "Revenue Department (Tahsildar) / Sub-Registrar Office"

_B2_QUALIFYING_DOCUMENT = frozenset({"Disputed", "Missing Documents"})
_B2_QUALIFYING_MUTATION = frozenset({"Disputed", "Stale"})
_B2_QUALIFYING_ENCUMBRANCE_STANDALONE = frozenset({"Encumbered", "Mortgaged to Co-op Bank"})

_B2_BUCKET_SEVERITY = {
    "ownership_or_partition": BlockerSeverity.HIGH,
    "document": BlockerSeverity.MODERATE,
    "mutation": BlockerSeverity.MODERATE,
    "encumbrance": BlockerSeverity.MODERATE,
}

_B2_CONFIRMED_CEILING_NOTE = (
    "B2 CONFIRMED requires a provenance-carrying title/record evidence entity "
    "(source_type + verified + timestamp) that does not yet exist in KSHETRA "
    "(docs/step7a-blocker-engine-audit.md Data Gap row B2-1) -- this engine never "
    "reports CONFIRMED for B2 off bare Parcel status fields."
)


def detect_b2(
    parcel: ParcelEvidenceInput,
    *,
    calculation_date: date,
    engine_version: str = ENGINE_VERSION,
    secondary_ownership_observation: Optional[str] = None,
) -> BlockerEvaluation:
    """Per docs/step7a-blocker-engine-audit.md Section D. `ownershipDispute`
    != 'No' and `encumbranceStatus` == 'Pending Partition' are deliberately
    folded into ONE bucket ("ownership_or_partition") -- they very plausibly
    describe the same underlying fact, and counting them as two independent
    signals would inflate confidence without new information.

    `secondary_ownership_observation`: today's `Parcel` schema carries
    exactly one value per field (confirmed in
    docs/step7a-blocker-engine-audit.md Section D's audit) -- there is no
    "two competing government records" shape to disagree with itself the
    way `legal.events.AcquisitionEvent` can. This optional parameter models
    the case where KSHETRA genuinely holds a SECOND, independently-obtained
    reading of the same ownership question (e.g. a duplicate revenue
    extract, or a cross-check survey) that may disagree with
    `parcel.ownership_dispute`. Neither reading outranks the other (both are
    `SourceType.IMPORTED_SYSTEM`-tier, same authority rank) -- per
    `legal.conflicts`'s own philosophy, a genuine same-tier disagreement is
    never silently resolved by picking one; it is reported as
    `BlockerStatus.CONFLICTED` with both readings preserved."""
    od = parcel.ownership_dispute
    ds = parcel.document_status
    ms = parcel.mutation_status
    es = parcel.encumbrance_status
    rc = parcel.record_confidence

    if secondary_ownership_observation is not None and od is not None:
        primary_says_clean = od == "No"
        secondary_says_clean = secondary_ownership_observation == "No"
        if primary_says_clean != secondary_says_clean:
            conflict_evidences = [
                parcel_field_evidence(
                    evidence_id=new_id("BEV"),
                    parcel_id=parcel.parcel_id,
                    field_name="ownershipDispute",
                    field_value=od,
                    description=f"Primary record: ownershipDispute = {od!r}.",
                    relation=EvidenceRelation.CONTRADICTS if primary_says_clean else EvidenceRelation.SUPPORTS,
                ),
                parcel_field_evidence(
                    evidence_id=new_id("BEV"),
                    parcel_id=parcel.parcel_id,
                    field_name="ownershipDispute(secondary_observation)",
                    field_value=secondary_ownership_observation,
                    description=f"Independent secondary observation: ownership = {secondary_ownership_observation!r}.",
                    relation=EvidenceRelation.CONTRADICTS if secondary_says_clean else EvidenceRelation.SUPPORTS,
                ),
            ]
            notes = (
                "Two independently-obtained, same-authority-tier (IMPORTED_SYSTEM) readings of "
                "ownership status disagree; per legal.conflicts's own philosophy, neither is preferred "
                "and both are preserved rather than one silently overwriting the other."
            )
            blocker = Blocker(
                blocker_id=new_id("BLK"),
                case_reference=parcel.case_reference,
                project_id=parcel.project_id,
                parcel_id=parcel.parcel_id,
                blocker_type=BlockerType.B2,
                status=BlockerStatus.CONFLICTED,
                severity=BlockerSeverity.HIGH,
                owner_role=_B2_OWNER_ROLE,
                responsible_authority=_B2_AUTHORITY,
                evidence=tuple(conflict_evidences),
                affects_clock=False,
                affects_possession=False,
                affects_project=parcel.parcel_id is None,
                downstream_extent=DownstreamExtent(
                    affected_parcel_ids=(parcel.parcel_id,) if parcel.parcel_id else (),
                    affected_parcel_count=1 if parcel.parcel_id else None,
                    affected_area_acres=parcel.area_acres if parcel.parcel_id else None,
                ),
                engine_version=engine_version,
                calculation_date=calculation_date,
                notes=notes,
                calculated_at=_utcnow(),
            )
            return BlockerEvaluation(outcome=BlockerEvaluationOutcome.CONFLICTED, blocker=blocker, reason=notes)

    evidences = []
    buckets: set = set()

    def add(bucket: str, field_name: str, field_value: object, description: str) -> None:
        buckets.add(bucket)
        evidences.append(
            parcel_field_evidence(
                evidence_id=new_id("BEV"),
                parcel_id=parcel.parcel_id,
                field_name=field_name,
                field_value=field_value,
                description=description,
            )
        )

    if od not in (None, "No"):
        add("ownership_or_partition", "ownershipDispute", od, f"Ownership dispute on record: {od}.")
    if es == "Pending Partition" and "ownership_or_partition" not in buckets:
        add(
            "ownership_or_partition",
            "encumbranceStatus",
            es,
            "Revenue record encumbrance status is 'Pending Partition'.",
        )
    if ds in _B2_QUALIFYING_DOCUMENT:
        add("document", "documentStatus", ds, f"Document status flagged: {ds}.")
    if ms in _B2_QUALIFYING_MUTATION:
        add("mutation", "mutationStatus", ms, f"Mutation status flagged: {ms}.")
    if es in _B2_QUALIFYING_ENCUMBRANCE_STANDALONE:
        add("encumbrance", "encumbranceStatus", es, f"Revenue record shows encumbrance: {es}.")

    def build(outcome: BlockerEvaluationOutcome, severity: BlockerSeverity, notes: str) -> BlockerEvaluation:
        blocker = Blocker(
            blocker_id=new_id("BLK"),
            case_reference=parcel.case_reference,
            project_id=parcel.project_id,
            parcel_id=parcel.parcel_id,
            blocker_type=BlockerType.B2,
            status=outcome_to_status(outcome),
            severity=severity,
            owner_role=_B2_OWNER_ROLE,
            responsible_authority=_B2_AUTHORITY,
            evidence=tuple(evidences),
            affects_clock=False,
            affects_possession=False,
            affects_project=parcel.parcel_id is None,
            downstream_extent=DownstreamExtent(
                affected_parcel_ids=(parcel.parcel_id,) if parcel.parcel_id else (),
                affected_parcel_count=1 if parcel.parcel_id else None,
                affected_area_acres=parcel.area_acres if parcel.parcel_id else None,
            ),
            engine_version=engine_version,
            calculation_date=calculation_date,
            notes=notes,
            calculated_at=_utcnow(),
        )
        return BlockerEvaluation(outcome=outcome, blocker=blocker, reason=notes)

    num_buckets = len(buckets)
    all_key_fields_present = all(v is not None for v in (od, ds, ms, es))

    if num_buckets == 0:
        if not all_key_fields_present:
            return BlockerEvaluation(
                outcome=BlockerEvaluationOutcome.NO_EVIDENCE,
                blocker=None,
                reason="One or more title/record fields are not populated for this parcel.",
            )
        clean = od == "No" and ds == "Verified" and ms == "Up-to-date" and es == "Clear"
        if clean:
            if rc == "Low":
                return build(
                    BlockerEvaluationOutcome.INSUFFICIENT_EVIDENCE,
                    BlockerSeverity.INFORMATIONAL,
                    "All title/record fields read clean, but recordConfidence is 'Low' -- the record "
                    "itself says it may be unreliable, so this is downgraded from a clearance to "
                    "insufficient evidence rather than reported as EVIDENCE_OF_NO_BLOCKER.",
                )
            return BlockerEvaluation(
                outcome=BlockerEvaluationOutcome.EVIDENCE_OF_NO_BLOCKER,
                blocker=None,
                reason=(
                    "ownershipDispute='No', documentStatus='Verified', mutationStatus='Up-to-date', "
                    "encumbranceStatus='Clear', recordConfidence != 'Low': explicit clean evidence."
                ),
            )
        return build(
            BlockerEvaluationOutcome.INSUFFICIENT_EVIDENCE,
            BlockerSeverity.INFORMATIONAL,
            "Title/record fields are present but ambiguous (e.g. 'Pending Verification') -- neither a "
            "qualifying friction signal nor a clean clearance.",
        )

    severity = max((_B2_BUCKET_SEVERITY[b] for b in buckets), key=lambda s: BLOCKER_SEVERITY_RANK[s])
    low_confidence_record = rc == "Low"
    if num_buckets == 1:
        outcome = (
            BlockerEvaluationOutcome.INSUFFICIENT_EVIDENCE
            if low_confidence_record
            else BlockerEvaluationOutcome.SUSPECTED
        )
    else:
        outcome = (
            BlockerEvaluationOutcome.SUSPECTED if low_confidence_record else BlockerEvaluationOutcome.DETECTED
        )
    notes = (
        f"{num_buckets} independent record-friction signal(s) on file ({sorted(buckets)}). "
        f"{_B2_CONFIRMED_CEILING_NOTE}"
    )
    return build(outcome, severity, notes)


# =============================================================================
# B3 -- Contested Compensation / R&R
# =============================================================================

_B3_OWNER_ROLE = "Compensation Authority / LARR Authority"
_B3_AUTHORITY = "LA-RA (Land Acquisition, Rehabilitation and Resettlement) Authority"

_B3_CONFIRMED_CEILING_NOTE = (
    "B3 CONFIRMED requires a provenance-carrying compensation-dispute evidence entity that does not "
    "yet exist (docs/step7a-blocker-engine-audit.md Data Gap row B3-1) -- this engine never reports "
    "CONFIRMED for B3 off bare Parcel status fields. R&R obligations/completion and contested-amount "
    "evidence (offered vs. claimed) are complete data gaps (rows B3-2/B3-3) and are not evaluated at all."
)

_B3_ACTIVE_LITIGATION_STATUSES = frozenset({"Active - Stay Order", "Pending Hearing"})


def detect_b3(
    parcel: ParcelEvidenceInput, *, calculation_date: date, engine_version: str = ENGINE_VERSION
) -> BlockerEvaluation:
    """Per docs/step7a-blocker-engine-audit.md Section E. Deliberately does
    NOT treat `compensationStatus == 'Pending'` as dispute evidence by
    itself -- conflating "not yet disbursed" with "contested" is exactly the
    anti-pattern the Step 7B brief Section 6 prohibits."""
    cs = parcel.compensation_status
    has_active_litigation = bool(parcel.court_case) and parcel.court_case_status in _B3_ACTIVE_LITIGATION_STATUSES

    def build(
        outcome: BlockerEvaluationOutcome, severity: BlockerSeverity, notes: str, evidences: list
    ) -> BlockerEvaluation:
        blocker = Blocker(
            blocker_id=new_id("BLK"),
            case_reference=parcel.case_reference,
            project_id=parcel.project_id,
            parcel_id=parcel.parcel_id,
            blocker_type=BlockerType.B3,
            status=outcome_to_status(outcome),
            severity=severity,
            owner_role=_B3_OWNER_ROLE,
            responsible_authority=_B3_AUTHORITY,
            evidence=tuple(evidences),
            affects_clock=False,
            affects_possession=True,  # RFCTLARR S.38 possession-readiness precondition (interface only, §L/E)
            affects_project=parcel.parcel_id is None,
            downstream_extent=DownstreamExtent(
                affected_parcel_ids=(parcel.parcel_id,) if parcel.parcel_id else (),
                affected_parcel_count=1 if parcel.parcel_id else None,
                affected_area_acres=parcel.area_acres if parcel.parcel_id else None,
            ),
            engine_version=engine_version,
            calculation_date=calculation_date,
            notes=notes,
            calculated_at=_utcnow(),
        )
        return BlockerEvaluation(outcome=outcome, blocker=blocker, reason=notes)

    if cs is None:
        return BlockerEvaluation(
            outcome=BlockerEvaluationOutcome.NO_EVIDENCE,
            blocker=None,
            reason="compensationStatus not populated for this parcel.",
        )

    if cs == "Under Dispute in LA-RA Authority":
        evidences = [
            parcel_field_evidence(
                evidence_id=new_id("BEV"),
                parcel_id=parcel.parcel_id,
                field_name="compensationStatus",
                field_value=cs,
                description=f"Compensation status: '{cs}' -- a named, institutional dispute before the LA-RA Authority.",
            )
        ]
        if has_active_litigation:
            evidences.append(
                parcel_field_evidence(
                    evidence_id=new_id("BEV"),
                    parcel_id=parcel.parcel_id,
                    field_name="courtCaseStatus",
                    field_value=parcel.court_case_status,
                    description=(
                        f"Active court case on record ({parcel.court_case_status}) -- may relate to the "
                        "compensation dispute; case subject-matter is not independently classified from "
                        "current data (Data Gap row B3-4)."
                    ),
                )
            )
        return build(
            BlockerEvaluationOutcome.DETECTED,
            BlockerSeverity.HIGH,
            f"compensationStatus == 'Under Dispute in LA-RA Authority' is the strongest existing B3 "
            f"signal; capped below CONFIRMED. {_B3_CONFIRMED_CEILING_NOTE}",
            evidences,
        )

    if cs == "Pending":
        if has_active_litigation:
            evidences = [
                parcel_field_evidence(
                    evidence_id=new_id("BEV"),
                    parcel_id=parcel.parcel_id,
                    field_name="compensationStatus",
                    field_value=cs,
                    description="compensationStatus == 'Pending' (ordinary process timing by itself).",
                ),
                parcel_field_evidence(
                    evidence_id=new_id("BEV"),
                    parcel_id=parcel.parcel_id,
                    field_name="courtCaseStatus",
                    field_value=parcel.court_case_status,
                    description=(
                        f"Independent active court case on record ({parcel.court_case_status}) -- weak "
                        "corroboration only; case subject-matter not verifiable from current data."
                    ),
                ),
            ]
            return build(
                BlockerEvaluationOutcome.SUSPECTED,
                BlockerSeverity.WATCH,
                "compensationStatus == 'Pending' alone is not treated as B3 evidence; weakly corroborated "
                "here only by an independent active court case of unverifiable subject-matter.",
                evidences,
            )
        return BlockerEvaluation(
            outcome=BlockerEvaluationOutcome.NO_EVIDENCE,
            blocker=None,
            reason=(
                "compensationStatus == 'Pending' is ordinary process timing; not treated as B3 evidence "
                "by itself (docs/step7a-blocker-engine-audit.md Section E)."
            ),
        )

    if cs in ("Determined", "Disbursed 100%"):
        return BlockerEvaluation(
            outcome=BlockerEvaluationOutcome.EVIDENCE_OF_NO_BLOCKER,
            blocker=None,
            reason=f"compensationStatus == '{cs}': explicit evidence compensation is settled with no recorded dispute.",
        )

    if cs == "Disbursed 40%":
        evidences = [
            parcel_field_evidence(
                evidence_id=new_id("BEV"),
                parcel_id=parcel.parcel_id,
                field_name="compensationStatus",
                field_value=cs,
                description="Partial (40%) disbursement on record.",
            )
        ]
        return build(
            BlockerEvaluationOutcome.INSUFFICIENT_EVIDENCE,
            BlockerSeverity.INFORMATIONAL,
            "Partial disbursement is ambiguous -- could be ordinary phased payment or a stalled dispute; "
            f"current data cannot distinguish (Data Gap row B3-2: no offered-vs-claimed amount pair). {_B3_CONFIRMED_CEILING_NOTE}",
            evidences,
        )

    # Unrecognized compensationStatus value -- never silently treated as clean.
    evidences = [
        parcel_field_evidence(
            evidence_id=new_id("BEV"),
            parcel_id=parcel.parcel_id,
            field_name="compensationStatus",
            field_value=cs,
            description=f"Unrecognized compensationStatus value: {cs!r}.",
        )
    ]
    return build(
        BlockerEvaluationOutcome.INSUFFICIENT_EVIDENCE,
        BlockerSeverity.INFORMATIONAL,
        f"compensationStatus value {cs!r} is not one this detector recognizes; treated conservatively.",
        evidences,
    )


# =============================================================================
# B4 -- Possession-Blocking Encumbrance
# =============================================================================

# --- Step 7B.1 fix -----------------------------------------------------
# The original implementation matched raw single-word substrings
# ("occup", "structure", "block", "obstruct", ...) anywhere in
# `field_verification_notes`, so an explicit CLEARANCE note such as
# "Occupant vacated the site voluntarily; no obstruction remains and
# possession can proceed without hindrance" was wrongly reported as a B4
# physical obstruction (every one of those risk words appears in the
# clearance sentence itself). Replaced with two-layer, phrase-level
# (not single-word) regex matching:
#
#   1. `_B4_NEGATION_PATTERNS` -- explicit clearance/negation phrases.
#      Checked FIRST and always take precedence, even if a risk-sounding
#      word also appears nearby (e.g. "no structure blocking possession"
#      is suppressed even though "structure"/"block" both occur in it).
#   2. `_B4_POSITIVE_OBSTRUCTION_PATTERNS` -- only a specific,
#      consequence-bearing phrase (an action or state actually tied to
#      blocking/preventing possession or access, e.g. "refuses to
#      vacate", "prevents possession", "cannot ... be effected") counts
#      as evidence -- never the bare occurrence of a risk word like
#      "occupant"/"structure"/"block"/"obstruction" on its own.
#
# Text matching neither list (e.g. "structure observed on parcel") is
# AMBIGUOUS and is conservatively treated as NOT obstruction evidence --
# per the explicit safety rule: prefer no B4 detection over falsely
# asserting a possession blocker. This remains a small, deterministic set
# of regexes -- not an NLP/ML text classifier.
_B4_NEGATION_PATTERNS = tuple(
    re.compile(pattern)
    for pattern in (
        r"\bno\s+(?:physical\s+)?obstruction\b",
        r"\bno\s+encroachment\b",
        r"\bno\s+structure\b",
        r"\bno\s+hindrance\b",
        r"\bno\s+issues?\b",
        r"\bvacated\b",
        r"\bsite\s+is\s+clear\b",
        r"\bpossession\s+can\s+proceed\b",
    )
)

_B4_POSITIVE_OBSTRUCTION_PATTERNS = tuple(
    re.compile(pattern)
    for pattern in (
        r"\bprevents?\s+possession\b",
        r"\brefuses?\s+to\s+vacate\b",
        r"\bblocks?\s+(?:access|possession)\b",
        r"\bcannot\s+(?:currently\s+)?(?:be\s+)?(?:taken|effected|proceed\w*)\b",
        r"\bobstructs?\s+(?:the\s+)?(?:right\s+of\s+way|possession|access)\b",
    )
)


def _field_notes_indicate_obstruction(notes: Optional[str]) -> bool:
    """Conservative, deterministic classification of free-text field-
    verification notes for a physical possession obstruction -- see the
    module comment above `_B4_NEGATION_PATTERNS`. Negation/clearance
    phrases are checked first and always suppress a match; only a
    specific positive phrase (never a bare risk word) can then raise
    `True`; anything else (including plain ambiguous mentions of a risk
    word) returns `False`."""
    if not notes:
        return False
    text = notes.lower()
    if any(pattern.search(text) for pattern in _B4_NEGATION_PATTERNS):
        return False
    return any(pattern.search(text) for pattern in _B4_POSITIVE_OBSTRUCTION_PATTERNS)


def _stay_covers_parcel(stay: CourtStayEvent, parcel: ParcelEvidenceInput) -> bool:
    """Scope-matching per docs/step7a-blocker-engine-audit.md Section F,
    reusing `legal.stays`'s own `StayScope` rather than inventing a second
    scoping model. A STAGE-scoped stay is conservatively treated as NOT
    covering a B4 evaluation -- this detector has no "current process
    stage" input to compare against (unlike the legal engine's clock
    computation, which always knows its own `section_reference`)."""
    if stay.case_reference != parcel.case_reference:
        return False
    if stay.scope == StayScope.PROJECT:
        return True
    if stay.scope == StayScope.PARCEL:
        return bool(parcel.parcel_id) and parcel.parcel_id in stay.affected_parcels
    return False  # StayScope.STAGE -- conservative, see docstring


def detect_b4(
    parcel: ParcelEvidenceInput,
    *,
    calculation_date: date,
    engine_version: str = ENGINE_VERSION,
    court_stay: Optional[CourtStayEvent] = None,
) -> BlockerEvaluation:
    """Per docs/step7a-blocker-engine-audit.md Section F. `court_stay`, when
    supplied, must be a real `legal.stays.CourtStayEvent` -- reusing the
    legal engine's own structured `StayScope` rather than the free-text
    `Parcel.courtRecord`. A VERIFIED, in-scope `CourtStayEvent` is the ONE
    path by which B4 can reach `CONFIRMED` in this implementation; bare
    `courtCaseStatus`/`interimInjunction` fields alone never do."""
    evidences = []
    subtypes: set = set()

    physical_obstruction = False
    if parcel.field_verified and parcel.field_verification_notes:
        if _field_notes_indicate_obstruction(parcel.field_verification_notes):
            physical_obstruction = True
            subtypes.add(B4EvidenceSubtype.PHYSICAL_OBSTRUCTION)
            evidences.append(
                field_verification_evidence(
                    evidence_id=new_id("BEV"),
                    parcel_id=parcel.parcel_id,
                    notes_text=parcel.field_verification_notes,
                    photo_attached=parcel.evidence_photo_attached,
                    verified_at_display=parcel.field_verified_at,
                    description=(
                        "Field verification notes indicate a possible physical obstruction to possession: "
                        f"{parcel.field_verification_notes!r}."
                    ),
                )
            )

    provenanced_restraint = court_stay is not None and (
        court_stay.verification_status == EvidenceVerificationStatus.VERIFIED
        and _stay_covers_parcel(court_stay, parcel)
    )
    bare_court_restraint = bool(
        not provenanced_restraint
        and parcel.court_case_status == "Active - Stay Order"
        and parcel.interim_injunction
    )
    if provenanced_restraint:
        subtypes.add(B4EvidenceSubtype.COURT_RESTRAINT)
        evidences.append(
            court_stay_evidence(
                evidence_id=new_id("BEV"),
                stay=court_stay,
                description=(
                    f"Verified court stay ({court_stay.scope.value} scope) covers this case/parcel -- "
                    "indicates a judicially-imposed restraint. The specific activity restrained "
                    "(possession vs. compensation vs. construction) is not independently tagged on the "
                    "stay record itself."
                ),
            )
        )
    elif bare_court_restraint:
        subtypes.add(B4EvidenceSubtype.COURT_RESTRAINT)
        evidences.append(
            parcel_field_evidence(
                evidence_id=new_id("BEV"),
                parcel_id=parcel.parcel_id,
                field_name="courtCaseStatus/interimInjunction",
                field_value=(parcel.court_case_status, parcel.interim_injunction),
                description=(
                    "Active court case with interim injunction on record -- a possession restraint is "
                    "plausible, but scope and subject-matter are not independently verifiable from "
                    "current fields (Data Gap row B4-2)."
                ),
            )
        )

    regulatory_precondition = bool(
        parcel.environmental_zone in ("CRZ", "Forest Border") or parcel.water_body_adjacent
    )
    if regulatory_precondition:
        subtypes.add(B4EvidenceSubtype.REGULATORY_PRECONDITION)
        evidences.append(
            parcel_field_evidence(
                evidence_id=new_id("BEV"),
                parcel_id=parcel.parcel_id,
                field_name="environmentalZone/waterBodyAdjacent",
                field_value=(parcel.environmental_zone, parcel.water_body_adjacent),
                description=(
                    "GIS record indicates a regulatory/environmental precondition "
                    f"(environmentalZone={parcel.environmental_zone!r}, "
                    f"waterBodyAdjacent={parcel.water_body_adjacent!r}) -- a distinct sub-type from a "
                    "physical possession obstruction; clearance-related, not occupant-related."
                ),
            )
        )

    if not evidences:
        if parcel.possession_status == "Complete":
            return BlockerEvaluation(
                outcome=BlockerEvaluationOutcome.EVIDENCE_OF_NO_BLOCKER,
                blocker=None,
                reason="possessionStatus == 'Complete' with no obstruction/restraint/regulatory signal on record.",
            )
        if all(
            v is None
            for v in (
                parcel.possession_status,
                parcel.field_verified,
                parcel.court_case_status,
                parcel.environmental_zone,
            )
        ):
            return BlockerEvaluation(
                outcome=BlockerEvaluationOutcome.NO_EVIDENCE,
                blocker=None,
                reason="No possession-relevant fields populated for this parcel.",
            )
        return BlockerEvaluation(
            outcome=BlockerEvaluationOutcome.NO_EVIDENCE,
            blocker=None,
            reason=(
                "possessionStatus alone (no obstruction/restraint/regulatory signal) is ordinary process "
                "timing; not treated as B4 evidence by itself (docs/step7a-blocker-engine-audit.md Section F)."
            ),
        )

    if provenanced_restraint:
        outcome = BlockerEvaluationOutcome.CONFIRMED
        severity = BlockerSeverity.CRITICAL if court_stay.scope == StayScope.PROJECT else BlockerSeverity.HIGH
    elif physical_obstruction and bare_court_restraint:
        outcome = BlockerEvaluationOutcome.DETECTED
        severity = BlockerSeverity.HIGH
    elif physical_obstruction:
        outcome = BlockerEvaluationOutcome.DETECTED
        severity = BlockerSeverity.HIGH
    elif bare_court_restraint:
        outcome = BlockerEvaluationOutcome.DETECTED
        severity = BlockerSeverity.MODERATE
    else:  # regulatory precondition only
        outcome = BlockerEvaluationOutcome.SUSPECTED
        severity = BlockerSeverity.WATCH

    # Owner is NOT single-valued by design (docs/step7a-blocker-engine-audit.md
    # Section K: "B4: No fixed default -- must be resolved from the evidence").
    if physical_obstruction and (provenanced_restraint or bare_court_restraint):
        owner_role = "Revenue / Field Team (Tahsildar) AND Legal Desk (jointly -- evidence spans both a field finding and a judicial restraint)"
        authority = "Revenue Department (Tahsildar) / Government Pleader"
    elif provenanced_restraint or bare_court_restraint:
        owner_role = "Legal Desk / Government Pleader"
        authority = "Government Pleader / Court-facing legal desk"
    elif physical_obstruction:
        owner_role = "Revenue / Field Team (Tahsildar)"
        authority = "Revenue Department (Tahsildar)"
    else:
        owner_role = "Revenue / Environmental Clearance authority"
        authority = "Revenue Department / Environmental Clearance authority"

    notes = f"B4 evidence sub-type(s): {sorted(s.value for s in subtypes)}."
    if not provenanced_restraint:
        notes += (
            " B4 CONFIRMED requires a VERIFIED, in-scope legal.stays.CourtStayEvent "
            "(docs/step7a-blocker-engine-audit.md Data Gap row B4-2 / Section F); bare Parcel fields "
            "alone never reach CONFIRMED."
        )

    blocker = Blocker(
        blocker_id=new_id("BLK"),
        case_reference=parcel.case_reference,
        project_id=parcel.project_id,
        parcel_id=parcel.parcel_id,
        blocker_type=BlockerType.B4,
        status=outcome_to_status(outcome),
        severity=severity,
        owner_role=owner_role,
        responsible_authority=authority,
        evidence=tuple(evidences),
        affects_clock=False,
        affects_possession=True,
        affects_project=parcel.parcel_id is None
        or bool(provenanced_restraint and court_stay.scope == StayScope.PROJECT),
        downstream_extent=DownstreamExtent(
            affected_parcel_ids=(parcel.parcel_id,) if parcel.parcel_id else (),
            affected_parcel_count=1 if parcel.parcel_id else None,
            affected_area_acres=parcel.area_acres if parcel.parcel_id else None,
        ),
        engine_version=engine_version,
        calculation_date=calculation_date,
        notes=notes,
        calculated_at=_utcnow(),
    )
    return BlockerEvaluation(outcome=outcome, blocker=blocker, reason=notes)
