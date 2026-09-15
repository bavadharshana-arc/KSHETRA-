"""
Pure §9/§10/§11 formulas from docs/step8a-exposure-priority-audit.md. No
database, no HTTP, no ML import -- mirrors `blockers/detection.py` and
`blockers/ranking.py`'s own no-side-effects discipline. Every function here
takes plain values or `blockers.models.Blocker` frozen dataclasses (never an
ORM row) and returns plain values -- independently unit-testable without a
database, exactly like `ranking.py`'s own precedent of operating directly on
`Tuple[Blocker, ...]`.

DOUBLE-COUNTING GUARD (docs/step8a-exposure-priority-audit.md Section 5):
B2/B3 `severity` is NEVER read by `legal_band`/`possession_band` below as a
magnitude multiplier -- `legal_band` only ever looks at `BlockerType.B1`
blockers, and `possession_band` only ever looks at the `affects_possession`
boolean flag (never blocker-type identity, never B2/B3's severity value).
B2/B3 severity is used only inside `secondary_bonus` (a capped, independent
bonus for genuinely additional evidence -- see that function's docstring)
and, upstream in `blockers/ranking.py` (never re-implemented here), for
primary-blocker selection.

NO HARDCODED B1 > B2 > B3 > B4: every function below is keyed off
`severity`/`status`/`affects_possession` -- the same evidence
`blockers/ranking.py` already proves is type-order-independent -- never off
`blocker_type` identity for ranking purposes. `blocker_type == BlockerType.B1`
is checked in exactly one place (`legal_band_from_blockers`) because B1
*is*, by definition, the statutory-clock blocker class -- this is a type
check for "is this the clock signal", not a priority ordering.
"""

from __future__ import annotations

import math
from datetime import date, datetime, timezone
from typing import Optional, Sequence, Tuple

from blockers.models import Blocker

from .enums import (
    BLOCKER_SEVERITY_RANK,
    BLOCKER_STATUS_CONFIDENCE_RANK,
    BlockerSeverity,
    BlockerStatus,
    BlockerType,
    CONFIDENCE_RANK,
    ConfidenceLabel,
    EXPOSURE_WEIGHTS_VERSION,
    ExposureBand,
    PRIORITY_WEIGHTS_VERSION,
    PriorityBand,
    STALE_EVIDENCE_THRESHOLD_DAYS,
)

# -----------------------------------------------------------------------------
# Illustrative default weights (docs/step8a-exposure-priority-audit.md
# Sections 10/11). Explicitly NOT domain-validated -- see enums.py's
# EXPOSURE_WEIGHTS_VERSION/PRIORITY_WEIGHTS_VERSION docstring. Sum to 1.0 by
# construction; changing any value here MUST bump the matching version string.
# -----------------------------------------------------------------------------
W1_LEGAL = 0.35
W2_POSSESSION = 0.30
W3_DOWNSTREAM = 0.20
W4_PROJECT_SCALE = 0.15
_EXPOSURE_WEIGHT_SUM = W1_LEGAL + W2_POSSESSION + W3_DOWNSTREAM + W4_PROJECT_SCALE  # 1.0
_SECONDARY_BONUS_CAP = 0.5
_SECONDARY_BONUS_COEFFICIENT = 0.15

V1_EXPOSURE = 0.4
V2_URGENCY = 0.4
V3_ACTIONABILITY = 0.2
_PRIORITY_WEIGHT_SUM = V1_EXPOSURE + V2_URGENCY + V3_ACTIONABILITY  # 1.0

NEUTRAL_BAND = 1.0  # the one documented "unknown/not computed" value (never 0, never max)
_MAX_BAND = 4.0


def severity_rank(severity: BlockerSeverity) -> int:
    """0-4 ordinal, reused verbatim from `blockers.enums.BLOCKER_SEVERITY_RANK`
    -- never re-derived."""
    return BLOCKER_SEVERITY_RANK[severity]


def confidence_discount(status: BlockerStatus) -> float:
    """Per docs/step8a-exposure-priority-audit.md Section 8: 'confidence ->
    a multiplicative discount, not a separate score.' `(rank + 1) / 3`, so
    SUSPECTED -> 0.33x, DETECTED -> 0.67x, CONFIRMED -> 1.0x. Statuses with no
    confidence rank at all (CONFLICTED, INSUFFICIENT_EVIDENCE, RESOLVED)
    discount to exactly 0.0 -- 'CONFLICTED blockers contribute nothing
    positive to the magnitude term' / same for INSUFFICIENT_EVIDENCE (Section
    8) -- never a fabricated partial credit for evidence KSHETRA cannot
    stand behind."""
    rank = BLOCKER_STATUS_CONFIDENCE_RANK.get(status)
    if rank is None:
        return 0.0
    return (rank + 1) / 3.0


# -----------------------------------------------------------------------------
# Exposure component bands (Section 10)
# -----------------------------------------------------------------------------
def legal_band_from_blockers(blockers: Sequence[Blocker]) -> Tuple[float, Tuple[str, ...], Tuple[str, ...], Tuple[str, ...]]:
    """Legal band: consumes the case's B1 blocker(s) directly -- NEVER
    recomputes a legal date, NEVER reads `StatutoryClockResult` itself
    (docs/step8a-exposure-priority-audit.md Section 7). Deliberately not
    gated on whether a B1 blocker happens to be the case's overall *primary*
    (a different, independent axis, per Section 8's rank-blockers-not-types
    rule) -- a ticking statutory clock matters exactly as much whether or not
    B4/B2/B3 happens to outrank it in the primary-selection sort.

    Multiple raised B1 blockers (one case may have more than one statutory
    clock, e.g. an S.19 clock and an S.25 clock) are resolved by taking the
    WORST (max) determinate contribution -- monotonic, never averaged-down.

    A B1 blocker with `status` in {CONFLICTED, INSUFFICIENT_EVIDENCE} is
    real, on-record uncertainty (KSHETRA looked and could not tell), which is
    a different fact from "no B1 blocker was ever raised" -- so it is
    reported separately (not folded into the neutral-substitution band) and
    never allowed to either inflate `legal_band` or silently vanish; the
    caller uses the returned id tuples to drive `confidence_label`.

    Returns (legal_band, contributing_determinate_ids, conflicted_ids,
    insufficient_ids)."""
    b1_blockers = [b for b in blockers if b.blocker_type == BlockerType.B1]
    determinate = [b for b in b1_blockers if b.status in BLOCKER_STATUS_CONFIDENCE_RANK]
    conflicted = tuple(b.blocker_id for b in b1_blockers if b.status == BlockerStatus.CONFLICTED)
    insufficient = tuple(b.blocker_id for b in b1_blockers if b.status == BlockerStatus.INSUFFICIENT_EVIDENCE)

    if not determinate:
        return NEUTRAL_BAND, (), conflicted, insufficient

    contributions = [
        (severity_rank(b.severity) * confidence_discount(b.status), b.blocker_id) for b in determinate
    ]
    best_value = max(value for value, _ in contributions)
    best_ids = tuple(sorted(bid for value, bid in contributions if value == best_value))
    return best_value, best_ids, conflicted, insufficient


def possession_band_from_blockers(blockers: Sequence[Blocker]) -> Tuple[float, Tuple[str, ...]]:
    """Possession band: 4 when ANY raised blocker (B3 or B4 in practice, per
    `blockers/detection.py` -- never gated on blocker_type identity) has
    `affects_possession == True` AND `status` in {CONFIRMED, DETECTED}. A
    SUSPECTED/CONFLICTED/INSUFFICIENT possession signal does not count --
    exactly the audit's own carve-out ('otherwise (no possession-blocking
    evidence found or only SUSPECTED)'). Never reads B3/B4 `severity` here --
    a categorical yes/no, per Section 5's double-count guard."""
    contributing = tuple(
        sorted(
            b.blocker_id
            for b in blockers
            if b.affects_possession and b.status in (BlockerStatus.CONFIRMED, BlockerStatus.DETECTED)
        )
    )
    return (_MAX_BAND, contributing) if contributing else (NEUTRAL_BAND, ())


def downstream_band(affected_parcel_count: Optional[int]) -> float:
    """Per Section 6/10: today always self-only (`affected_parcel_count=1`)
    because real point-on-polyline downstream computation does not exist yet
    -- this term is inert, honestly, until a later step ships it. `None`
    (not computed at all) still defaults to the neutral self-only value
    (1), never 0 and never max."""
    if affected_parcel_count is None:
        return NEUTRAL_BAND
    return float(min(int(_MAX_BAND), max(1, affected_parcel_count)))


def project_scale_band(
    project_value_crores: Optional[float], reference_values: Sequence[Optional[float]]
) -> Tuple[float, bool]:
    """Bounded PROXY only -- never called 'criticality' without that
    qualifier (Section 10). Buckets `project_value_crores` into a quartile
    (1-4) among `reference_values` (all projects currently on record, per the
    caller). Falls back to the documented neutral band (1) -- flagged as a
    substitution -- when the project's own value is unknown OR when the
    comparison set is too small (fewer than 4 distinct known values) to make
    a quartile bucket meaningful; a single-project database must not report
    that project as trivially 'top quartile'.

    Returns (band, was_neutral_substitution)."""
    if project_value_crores is None:
        return NEUTRAL_BAND, True

    known = sorted(v for v in reference_values if v is not None)
    distinct = sorted(set(known))
    if len(distinct) < 4:
        return NEUTRAL_BAND, True

    at_or_below = sum(1 for v in known if v <= project_value_crores)
    percentile = at_or_below / len(known)
    band = min(int(_MAX_BAND), max(1, math.ceil(percentile * _MAX_BAND)))
    return float(band), False


def secondary_bonus(secondary_blockers: Sequence[Blocker]) -> float:
    """Capped bonus for genuinely ADDITIONAL raised blockers beyond the
    primary (Section 8): `min(0.5, 0.15 * sum(severity_rank * confidence
    discount))`. Deliberately uses every secondary blocker's `severity`
    (B1/B2/B3/B4 alike) -- this is NOT the Section 5 double-count-guarded
    magnitude term (`legal_band`/`possession_band`); it is a small,
    explicitly bounded acknowledgment that independent additional evidence
    (e.g. B1 DETECTED *and* B3 DETECTED) carries more risk than either alone,
    capped so four weak SUSPECTED secondaries can never out-rank one
    CONFIRMED CRITICAL primary (anti-gaming)."""
    total = sum(severity_rank(b.severity) * confidence_discount(b.status) for b in secondary_blockers)
    return min(_SECONDARY_BONUS_CAP, _SECONDARY_BONUS_COEFFICIENT * total)


def exposure_band_for_score(score: float) -> ExposureBand:
    if score >= 75:
        return ExposureBand.CRITICAL
    if score >= 50:
        return ExposureBand.HIGH
    if score >= 25:
        return ExposureBand.MODERATE
    return ExposureBand.LOW


def compute_exposure(
    *,
    legal_band: float,
    possession_band: float,
    downstream_band_value: float,
    project_scale_band_value: float,
    secondary_bonus_value: float,
) -> Tuple[float, float, ExposureBand]:
    """Section 9/10's banded weighted sum -- NOT multiplicative, so one
    missing/neutral factor dampens rather than zeroes the total (structural
    monotonicity: non-negative weights/bands/bonus, so increasing any one
    band while holding the others fixed can never decrease `exposure_score`).
    Returns (exposure_raw, exposure_score[0-100], exposure_band)."""
    raw = (
        W1_LEGAL * legal_band
        + W2_POSSESSION * possession_band
        + W3_DOWNSTREAM * downstream_band_value
        + W4_PROJECT_SCALE * project_scale_band_value
        + secondary_bonus_value
    )
    denom = _MAX_BAND * _EXPOSURE_WEIGHT_SUM + _SECONDARY_BONUS_CAP  # 4*1.0 + 0.5 = 4.5
    score = max(0.0, min(100.0, round(100.0 * raw / denom, 2)))
    return raw, score, exposure_band_for_score(score)


# -----------------------------------------------------------------------------
# Priority (Section 11)
# -----------------------------------------------------------------------------
def urgency_band(days_remaining: Optional[int]) -> int:
    """Keyed on the RAW day-count from the B1-linked clock -- distinct
    information from `legal_band` (which is keyed on clock STATUS/CONSEQUENCE,
    a categorical read of the same clock, not the same fact counted twice).
    `None` (no statutory clock at all) is neutral (1), never 0."""
    if days_remaining is None:
        return 1
    if days_remaining <= 14:
        return 4
    if days_remaining <= 30:
        return 3
    if days_remaining <= 90:
        return 2
    return 1


def actionability_band(primary_status: Optional[BlockerStatus]) -> int:
    """4 when the case's primary blocker is CONFIRMED/DETECTED (a concrete
    owner + action exist right now); 1 (neutral, not 0) for
    SUSPECTED/CONFLICTED/INSUFFICIENT_EVIDENCE or no blocker at all."""
    if primary_status in (BlockerStatus.CONFIRMED, BlockerStatus.DETECTED):
        return 4
    return 1


def exposure_band_equivalent(exposure_score: float) -> int:
    """Reused (not re-derived) 0-4 band, per Section 11: `round(exposure_score
    / 25)`."""
    return max(0, min(4, round(exposure_score / 25)))


def priority_band_for_score(score: float) -> PriorityBand:
    if score >= 75:
        return PriorityBand.ACT_NOW
    if score >= 50:
        return PriorityBand.SOON
    if score >= 25:
        return PriorityBand.MONITOR
    return PriorityBand.WATCH


def compute_priority(
    *, exposure_score: float, urgency_band_value: int, actionability_band_value: int
) -> Tuple[float, float, PriorityBand, int]:
    """Section 11's weighted sum. `Priority != Exposure`: urgency and
    actionability are independent, disjoint-evidence terms (never
    re-deriving `exposure_score`'s own inputs). Returns (priority_raw,
    priority_score[0-100], priority_band, exposure_band_equivalent_used)."""
    band_equiv = exposure_band_equivalent(exposure_score)
    raw = (
        V1_EXPOSURE * band_equiv
        + V2_URGENCY * urgency_band_value
        + V3_ACTIONABILITY * actionability_band_value
    )
    denom = _MAX_BAND * _PRIORITY_WEIGHT_SUM  # 4 * 1.0 = 4.0
    score = max(0.0, min(100.0, round(100.0 * raw / denom, 2)))
    return raw, score, priority_band_for_score(score), band_equiv


# -----------------------------------------------------------------------------
# Uncertainty (Section 12)
# -----------------------------------------------------------------------------
def _at_least(label: ConfidenceLabel, floor: ConfidenceLabel) -> ConfidenceLabel:
    """Returns whichever of `label`/`floor` is LESS confident -- never
    upgrades, only ever pins a minimum downgrade."""
    return label if CONFIDENCE_RANK[label] >= CONFIDENCE_RANK[floor] else floor


def _to_naive_utc(dt: datetime) -> datetime:
    """Normalizes an aware-or-naive datetime to naive UTC before comparison.
    SQLite's `DateTime(timezone=True)` columns do not actually persist tzinfo
    (SQLite has no native timestamp type), so a value round-tripped through
    the real database comes back naive even though the in-memory engine's own
    `_utcnow()` is timezone-aware -- every naive datetime in this codebase is
    already UTC by convention (`models._utcnow`/`blockers.detection._utcnow`/
    this module's own callers), so a naive value is trusted as UTC as-is."""
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def is_stale(evidence_timestamp: Optional[datetime], as_of: datetime, threshold_days: int = STALE_EVIDENCE_THRESHOLD_DAYS) -> bool:
    """Prototype staleness check (Section 18/23 open question #1 -- NOT a
    government-approved policy, see enums.STALENESS_POLICY_VERSION). A
    missing timestamp is never asserted stale -- absence of a date is not
    evidence of age, it is a different kind of unknown (handled by the
    caller's own missing-data path)."""
    if evidence_timestamp is None:
        return False
    delta = _to_naive_utc(as_of) - _to_naive_utc(evidence_timestamp)
    return delta.days > threshold_days


def compute_confidence_label(
    *,
    has_conflicted_blocker: bool,
    has_insufficient_blocker: bool,
    no_confident_primary_but_blockers_exist: bool,
    clock_status: Optional[str],
    legal_band_is_neutral_no_b1: bool,
    project_scale_is_neutral: bool,
    prediction_is_stale: bool,
    blocker_evidence_is_stale: bool,
) -> ConfidenceLabel:
    """Section 12's uncertainty table, implemented as a monotonic
    'cap + tag, never suppress' downgrade chain -- confidence only ever
    moves away from VERIFIED here, never back toward it (Section 12: 'cap
    vs. suppress -- recommendation: cap + tag, never suppress')."""
    label = ConfidenceLabel.VERIFIED

    if has_conflicted_blocker:
        label = _at_least(label, ConfidenceLabel.NEEDS_VERIFICATION)

    if no_confident_primary_but_blockers_exist:
        label = _at_least(label, ConfidenceLabel.INSUFFICIENT)
    elif has_insufficient_blocker:
        label = _at_least(label, ConfidenceLabel.PARTIAL)

    if clock_status == "CLOCK_UNCERTAIN":
        label = _at_least(label, ConfidenceLabel.NEEDS_VERIFICATION)
    elif clock_status == "EXTENSION_UNVERIFIED":
        label = _at_least(label, ConfidenceLabel.PARTIAL)

    notches = int(legal_band_is_neutral_no_b1) + int(project_scale_is_neutral)
    if notches:
        from .enums import downgrade_confidence

        label = downgrade_confidence(label, notches)

    if prediction_is_stale or blocker_evidence_is_stale:
        from .enums import downgrade_confidence

        label = downgrade_confidence(label, 1)

    return label
