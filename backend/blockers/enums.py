"""
Shared vocabularies for the blocker engine.

CRITICAL: `SourceType` and `SOURCE_AUTHORITY_RANK` are imported from
`legal.enums`, never redefined here. Per docs/step7a-blocker-engine-audit.md
Section H/§9 of the Step 7B brief: "Reuse Step 6B's existing SourceType,
SOURCE_AUTHORITY_RANK. Do NOT duplicate or redefine the legal source
hierarchy." There is exactly one authority ranking in KSHETRA.

`EvidenceVerificationStatus` is likewise imported from `legal.enums` rather
than re-invented -- its docstring already describes it as "shared
verification-state shape for individual pieces of case evidence", which is
exactly what a BlockerEvidence row is.
"""

from __future__ import annotations

from enum import Enum

# Re-exported so callers can `from blockers.enums import SourceType,
# SOURCE_AUTHORITY_RANK, EvidenceVerificationStatus` without reaching into
# `legal.enums` directly -- the import itself is the guarantee against a
# second, competing hierarchy ever being defined here.
from legal.enums import (  # noqa: F401
    EvidenceVerificationStatus,
    SOURCE_AUTHORITY_RANK,
    SourceType,
)


class BlockerType(str, Enum):
    """The four canonical blocker classes. See
    docs/step7a-blocker-engine-audit.md Sections C-F."""

    B1 = "B1"  # Statutory-clock exposure
    B2 = "B2"  # Title & record friction
    B3 = "B3"  # Contested compensation / R&R
    B4 = "B4"  # Possession-blocking encumbrance


class BlockerStatus(str, Enum):
    """The persisted state of a Blocker row. Per the Step 7B brief Section 8:
    "Do NOT collapse NO_EVIDENCE into NO_BLOCKER. Missing evidence should
    remain distinguishable." Accordingly, `NO_EVIDENCE` and
    `EVIDENCE_OF_NO_BLOCKER` are deliberately NOT members of this enum --
    they are `BlockerEvaluationOutcome` values that never produce a
    persisted Blocker row at all (see that enum's docstring, and
    docs/step7a-blocker-engine-audit.md Section G)."""

    DETECTED = "DETECTED"
    SUSPECTED = "SUSPECTED"
    CONFIRMED = "CONFIRMED"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"
    CONFLICTED = "CONFLICTED"
    RESOLVED = "RESOLVED"


# Status values a detection pass may raise a fresh Blocker row for.
# BlockerStatus.RESOLVED is deliberately excluded -- it is only ever reached
# by a later resolution transition, never emitted directly by a detector.
RAISED_STATUSES = frozenset(
    {
        BlockerStatus.DETECTED,
        BlockerStatus.SUSPECTED,
        BlockerStatus.CONFIRMED,
        BlockerStatus.INSUFFICIENT_EVIDENCE,
        BlockerStatus.CONFLICTED,
    }
)

# Statuses eligible to be selected as the PRIMARY blocker for a case (§J of
# the audit): a merely-uncertain or conflicted blocker is never promoted to
# primary over a confirmed/detected/suspected one. If only ineligible
# statuses exist for a case, ranking.py reports no confident primary rather
# than guessing.
PRIMARY_ELIGIBLE_STATUSES = frozenset(
    {BlockerStatus.CONFIRMED, BlockerStatus.DETECTED, BlockerStatus.SUSPECTED}
)


class BlockerEvaluationOutcome(str, Enum):
    """The full outcome space of a detector run -- a superset of
    `BlockerStatus` that additionally distinguishes the two "nothing wrong
    here" cases the Step 7A audit insisted on separating (Section 5/G):

      NO_EVIDENCE            -- the engine looked and found nothing bearing
                                 on this blocker class at all (fields are
                                 unpopulated / not on record). KSHETRA
                                 genuinely does not know.
      EVIDENCE_OF_NO_BLOCKER -- the engine found EXPLICIT, on-record
                                 evidence that affirmatively indicates the
                                 blocker condition is ABSENT (e.g.
                                 ownershipDispute == 'No' AND documentStatus
                                 == 'Verified' AND ...). A positive finding,
                                 not silence.

    Only outcomes in RAISED_STATUSES (mirrored below as
    RAISED_EVALUATION_OUTCOMES) ever produce a persisted Blocker row --
    see docs/step7a-blocker-engine-audit.md Section G's "open
    persistence-policy question", resolved here as: store only informative/
    actionable outcomes.
    """

    NO_EVIDENCE = "NO_EVIDENCE"
    EVIDENCE_OF_NO_BLOCKER = "EVIDENCE_OF_NO_BLOCKER"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"
    SUSPECTED = "SUSPECTED"
    DETECTED = "DETECTED"
    CONFIRMED = "CONFIRMED"
    CONFLICTED = "CONFLICTED"


# Outcomes that raise a persisted Blocker row. Kept as a literal mirror of
# RAISED_STATUSES (same string values) rather than derived from it, so the
# two enums can be read side by side without indirection.
RAISED_EVALUATION_OUTCOMES = frozenset(
    {
        BlockerEvaluationOutcome.SUSPECTED,
        BlockerEvaluationOutcome.DETECTED,
        BlockerEvaluationOutcome.CONFIRMED,
        BlockerEvaluationOutcome.INSUFFICIENT_EVIDENCE,
        BlockerEvaluationOutcome.CONFLICTED,
    }
)


def outcome_to_status(outcome: "BlockerEvaluationOutcome") -> BlockerStatus:
    """Maps a raised evaluation outcome onto its persisted BlockerStatus.
    Raises ValueError for NO_EVIDENCE/EVIDENCE_OF_NO_BLOCKER -- callers must
    check `outcome in RAISED_EVALUATION_OUTCOMES` first (every detector in
    detection.py does this itself before constructing a Blocker)."""
    if outcome not in RAISED_EVALUATION_OUTCOMES:
        raise ValueError(
            f"{outcome!r} does not raise a Blocker row (NO_EVIDENCE / "
            "EVIDENCE_OF_NO_BLOCKER are evaluation-only outcomes, never a "
            "persisted BlockerStatus)."
        )
    return BlockerStatus(outcome.value)


class BlockerSeverity(str, Enum):
    """How bad the blocker is IF the evidence is right -- deliberately a
    separate axis from confidence/status (how SURE KSHETRA is), mirroring
    the legal engine's own split between `clock_status` (evidentiary state)
    and `consequence_class` (what it means, §12/§19 of the Step 6A audit)."""

    INFORMATIONAL = "INFORMATIONAL"
    WATCH = "WATCH"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


# Ordering for ranking.py's severity-first sort. Higher = more severe. Mirrors
# the SOURCE_AUTHORITY_RANK pattern in legal.enums (a plain dict, not relying
# on Enum member declaration order, so it's explicit and independently
# testable).
BLOCKER_SEVERITY_RANK = {
    BlockerSeverity.INFORMATIONAL: 0,
    BlockerSeverity.WATCH: 1,
    BlockerSeverity.MODERATE: 2,
    BlockerSeverity.HIGH: 3,
    BlockerSeverity.CRITICAL: 4,
}

# Ordering for ranking.py's confidence tie-break (§J: "confidence tier as
# tie-break: CONFIRMED > DETECTED > SUSPECTED"). CONFLICTED/
# INSUFFICIENT_EVIDENCE never reach this comparison at all -- they are
# excluded from PRIMARY_ELIGIBLE_STATUSES entirely.
BLOCKER_STATUS_CONFIDENCE_RANK = {
    BlockerStatus.CONFIRMED: 2,
    BlockerStatus.DETECTED: 1,
    BlockerStatus.SUSPECTED: 0,
}


class EvidenceType(str, Enum):
    """What KIND of underlying record a BlockerEvidence row cites. See
    docs/step7a-blocker-engine-audit.md Section H."""

    ACQUISITION_EVENT = "ACQUISITION_EVENT"
    COURT_STAY_EVENT = "COURT_STAY_EVENT"
    EXTENSION_EVIDENCE = "EXTENSION_EVIDENCE"
    STATUTORY_CLOCK = "STATUTORY_CLOCK"
    PARCEL_FIELD = "PARCEL_FIELD"
    FIELD_VERIFICATION = "FIELD_VERIFICATION"
    MANUAL_ENTRY = "MANUAL_ENTRY"


class EvidenceRelation(str, Enum):
    """Whether one evidence row supports, contradicts, or is merely
    ambiguous with respect to the blocker it is attached to. Lets one
    blocker aggregate several evidentiary signals honestly -- including
    disagreeing ones -- without silently picking a winner at the
    evidence-recording stage (resolution happens in ranking/conflict logic,
    not here). See docs/step7a-blocker-engine-audit.md Section H."""

    SUPPORTS = "SUPPORTS"
    CONTRADICTS = "CONTRADICTS"
    AMBIGUOUS = "AMBIGUOUS"


class ConflictResolutionStatus(str, Enum):
    UNRESOLVED = "UNRESOLVED"
    RESOLVED_BY_AUTHORITY_HIERARCHY = "RESOLVED_BY_AUTHORITY_HIERARCHY"
    RESOLVED_BY_HUMAN_REVIEW = "RESOLVED_BY_HUMAN_REVIEW"


class B4EvidenceSubtype(str, Enum):
    """B4 evidence is deliberately NOT one undifferentiated bucket --
    docs/step7a-blocker-engine-audit.md Section F distinguishes a physical/
    occupant obstruction from a court-ordered restraint from a purely
    regulatory/environmental precondition. Recorded on BlockerEvidence.notes
    context (via evidence description), and used by detection.py to decide
    which severity/confidence rules apply."""

    PHYSICAL_OBSTRUCTION = "PHYSICAL_OBSTRUCTION"
    COURT_RESTRAINT = "COURT_RESTRAINT"
    REGULATORY_PRECONDITION = "REGULATORY_PRECONDITION"
