"""
Shared vocabularies for the exposure/priority engine. Mirrors
`blockers/enums.py`'s own plain-`str`-Enum, explicit-rank-dict conventions.

CRITICAL: `BlockerType`, `BlockerStatus`, `BlockerSeverity`,
`BLOCKER_SEVERITY_RANK`, `BLOCKER_STATUS_CONFIDENCE_RANK`, and
`PRIMARY_ELIGIBLE_STATUSES` are imported (read-only) from `blockers.enums` --
never redefined here. There is exactly one blocker vocabulary in KSHETRA, and
exposure consumes it, per docs/step8a-exposure-priority-audit.md's
architectural-boundary rule (legal -> blockers -> exposure, never reversed,
never duplicated).
"""

from __future__ import annotations

from enum import Enum

# Re-exported so callers can `from exposure.enums import BlockerType, ...`
# without reaching into `blockers.enums` directly.
from blockers.enums import (  # noqa: F401
    BLOCKER_SEVERITY_RANK,
    BLOCKER_STATUS_CONFIDENCE_RANK,
    BlockerSeverity,
    BlockerStatus,
    BlockerType,
    PRIMARY_ELIGIBLE_STATUSES,
)


class ExposureBand(str, Enum):
    """Threshold-derived UI label for `exposure_score` (0-100). Per
    docs/step8a-exposure-priority-audit.md Section 9/10: CRITICAL >= 75,
    HIGH >= 50, MODERATE >= 25, LOW < 25."""

    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class PriorityBand(str, Enum):
    """Threshold-derived UI label for `priority_score` (0-100). Per
    docs/step8a-exposure-priority-audit.md Section 11: ACT_NOW >= 75,
    SOON >= 50, MONITOR >= 25, WATCH < 25."""

    WATCH = "WATCH"
    MONITOR = "MONITOR"
    SOON = "SOON"
    ACT_NOW = "ACT_NOW"


class ConfidenceLabel(str, Enum):
    """Always-shown, never-merged-into-the-score uncertainty marker. Per
    docs/step8a-exposure-priority-audit.md Section 12: a high `priority_score`
    with `confidence_label = NEEDS_VERIFICATION` must render visibly
    differently from the same score with `VERIFIED`."""

    VERIFIED = "VERIFIED"
    PARTIAL = "PARTIAL"
    NEEDS_VERIFICATION = "NEEDS_VERIFICATION"
    INSUFFICIENT = "INSUFFICIENT"


# Ordering used to "downgrade N notches" (higher = less confident). Plain
# dict, independently testable, mirrors BLOCKER_SEVERITY_RANK's own pattern.
CONFIDENCE_RANK = {
    ConfidenceLabel.VERIFIED: 0,
    ConfidenceLabel.PARTIAL: 1,
    ConfidenceLabel.NEEDS_VERIFICATION: 2,
    ConfidenceLabel.INSUFFICIENT: 3,
}
_RANK_TO_CONFIDENCE = {v: k for k, v in CONFIDENCE_RANK.items()}


def downgrade_confidence(label: ConfidenceLabel, notches: int) -> ConfidenceLabel:
    """Moves `label` toward INSUFFICIENT by `notches` steps, clamped at
    INSUFFICIENT. `notches <= 0` returns `label` unchanged (this never
    upgrades confidence -- only scoring.py's own explicit VERIFIED default
    can do that, at the start of a fresh computation)."""
    if notches <= 0:
        return label
    new_rank = min(CONFIDENCE_RANK[label] + notches, max(_RANK_TO_CONFIDENCE))
    return _RANK_TO_CONFIDENCE[new_rank]


class GisDownstreamStatus(str, Enum):
    """Per docs/step8a-exposure-priority-audit.md Sections 1/6: true
    point-on-polyline downstream computation does not exist yet. This
    prototype has exactly one honest value -- there is no "computed" branch
    to accidentally fall into."""

    NOT_COMPUTED = "NOT_COMPUTED"


# -----------------------------------------------------------------------------
# Versioning -- every number below is ILLUSTRATIVE/TUNABLE, never claimed to
# be domain-validated or empirically calibrated (docs/step8a-exposure-priority-
# audit.md Sections 9/11/17/23). Bumping any weight/threshold below MUST bump
# its version string so a persisted `component_trace.weights_version` always
# identifies exactly which formula produced it (mirrors
# blockers.detection.ENGINE_VERSION's own precedent).
# -----------------------------------------------------------------------------
ENGINE_VERSION = "kshetra-exposure-engine-1.0.0"
EXPOSURE_WEIGHTS_VERSION = "exposure-weights-v1-illustrative"
PRIORITY_WEIGHTS_VERSION = "priority-weights-v1-illustrative"

# docs/step8a-exposure-priority-audit.md Section 18/23 open question #1:
# "What staleness threshold should downgrade confidence_label?" is an
# EXPLICITLY OPEN domain question -- there is no government-approved answer.
# This default is a labeled PROTOTYPE ASSUMPTION, configurable, and must never
# be presented as legally authoritative. 90 days is an arbitrary, documented
# placeholder chosen only so the engine has *a* deterministic answer today.
STALENESS_POLICY_VERSION = "staleness-prototype-v1-UNVALIDATED"
STALE_EVIDENCE_THRESHOLD_DAYS = 90
