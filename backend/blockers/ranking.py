"""
Deterministic primary/secondary/most-actionable ranking over one case's
blocker set. See docs/step7a-blocker-engine-audit.md Section J.

NOT a hardcoded B1 > B2 > B3 > B4. The sort key is, in order:
  1. severity (BLOCKER_SEVERITY_RANK)                     -- most severe first
  2. confidence tier (BLOCKER_STATUS_CONFIDENCE_RANK)       -- CONFIRMED > DETECTED > SUSPECTED
  3. downstream possession impact (affected_parcel_count)   -- known impact breaks a tie
  4. blocker_type (a fixed, documented LAST-RESORT tiebreak) -- only reached when
     1-3 are all genuinely tied; does not by itself decide any real case.
  5. blocker_id                                              -- final tiebreak for
     full ordering; not guaranteed stable across separate engine runs when two
     blockers of the SAME type also tie on 1-4 (their `blocker_id`s are
     freshly server-generated each run) -- an edge case no demo scenario or
     realistic case produces (see module docstring below).

CONFLICTED and INSUFFICIENT_EVIDENCE blockers are NEVER selected as primary,
regardless of severity -- see enums.PRIMARY_ELIGIBLE_STATUSES. If a case has
no CONFIRMED/DETECTED/SUSPECTED blocker at all, `primary_blocker_id` is
explicitly None with an explanatory note, never an arbitrary pick.
"""

from __future__ import annotations

import dataclasses
from typing import Tuple

from .enums import (
    BLOCKER_SEVERITY_RANK,
    BLOCKER_STATUS_CONFIDENCE_RANK,
    BlockerStatus,
    BlockerType,
    PRIMARY_ELIGIBLE_STATUSES,
)
from .models import Blocker, RankingResult

_BLOCKER_TYPE_TIEBREAK_ORDER = {
    BlockerType.B1: 0,
    BlockerType.B2: 1,
    BlockerType.B3: 2,
    BlockerType.B4: 3,
}


def _is_primary_eligible(blocker: Blocker) -> bool:
    return blocker.status in PRIMARY_ELIGIBLE_STATUSES


def _is_actionable(blocker: Blocker) -> bool:
    return blocker.status in (BlockerStatus.CONFIRMED, BlockerStatus.DETECTED) and bool(blocker.owner_role)


def _sort_key(blocker: Blocker):
    extent = blocker.downstream_extent.affected_parcel_count or 0
    confidence_rank = BLOCKER_STATUS_CONFIDENCE_RANK.get(blocker.status, -1)
    return (
        -BLOCKER_SEVERITY_RANK[blocker.severity],
        -confidence_rank,
        -extent,
        _BLOCKER_TYPE_TIEBREAK_ORDER[blocker.blocker_type],
        blocker.blocker_id,
    )


def rank_blockers(blockers: Tuple[Blocker, ...]) -> Tuple[Tuple[Blocker, ...], RankingResult]:
    """Returns (blockers with `primary`/`ranking_basis` populated, RankingResult).
    `blockers` should be every RAISED blocker for one case (i.e. every
    `BlockerEvaluation.blocker` where `outcome` is in RAISED_EVALUATION_OUTCOMES) --
    evaluations that produced no blocker row (NO_EVIDENCE / EVIDENCE_OF_NO_BLOCKER)
    are not ranking inputs at all."""
    if not blockers:
        return (), RankingResult(
            ordered_blocker_ids=(),
            primary_blocker_id=None,
            secondary_blocker_ids=(),
            most_actionable_blocker_id=None,
            note="No blockers were raised for this case.",
        )

    eligible = sorted((b for b in blockers if _is_primary_eligible(b)), key=_sort_key)
    ineligible = sorted((b for b in blockers if not _is_primary_eligible(b)), key=_sort_key)
    ordered = eligible + ineligible

    primary = eligible[0] if eligible else None
    note = (
        ""
        if primary is not None
        else "No confidently primary blocker: only CONFLICTED/INSUFFICIENT_EVIDENCE blockers are "
        "present for this case; primary selection is deliberately withheld rather than guessed."
    )

    actionable_sorted = sorted((b for b in blockers if _is_actionable(b)), key=_sort_key)
    most_actionable = actionable_sorted[0] if actionable_sorted else None
    # Per §J: most_actionable is reported ONLY when it differs from primary --
    # never silently substituted for it.
    if most_actionable is not None and primary is not None and most_actionable.blocker_id == primary.blocker_id:
        most_actionable = None

    updated = []
    for position, blocker in enumerate(ordered):
        is_primary = primary is not None and blocker.blocker_id == primary.blocker_id
        basis = {
            "criteria_order": ["severity", "confidence", "downstream_parcel_count", "blocker_type", "blocker_id"],
            "severity_rank": BLOCKER_SEVERITY_RANK[blocker.severity],
            "confidence_rank": BLOCKER_STATUS_CONFIDENCE_RANK.get(blocker.status),
            "downstream_parcel_count": blocker.downstream_extent.affected_parcel_count,
            "eligible_for_primary": _is_primary_eligible(blocker),
            "rank_position": position,
        }
        updated.append(dataclasses.replace(blocker, primary=is_primary, ranking_basis=basis))

    result = RankingResult(
        ordered_blocker_ids=tuple(b.blocker_id for b in updated),
        primary_blocker_id=primary.blocker_id if primary is not None else None,
        secondary_blocker_ids=tuple(
            b.blocker_id for b in updated if primary is None or b.blocker_id != primary.blocker_id
        ),
        most_actionable_blocker_id=most_actionable.blocker_id if most_actionable is not None else None,
        note=note,
    )
    return tuple(updated), result
