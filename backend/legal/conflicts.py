"""
Deterministic conflict resolution between competing AcquisitionEvent records
for the same (case, event_type). See docs/step6a-statutory-clock-audit.md §9.

Hard rules enforced here (never violated by this module):
  - Both/all competing records are always preserved (the caller decides what
    to persist; this module never deletes or edits an AcquisitionEvent).
  - No averaging, no "pick latest", no "pick earliest", no silent overwrite.
  - A higher-authority source wins ONLY if it isn't itself unverified while a
    lower-authority competitor is verified.
  - Anything left unresolved produces an EventConflict, never a guessed date.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Tuple

from .enums import SOURCE_AUTHORITY_RANK
from .events import AcquisitionEvent, active_events


@dataclass(frozen=True)
class EventConflict:
    case_reference: str
    event_type: str
    competing_event_ids: Tuple[str, ...]
    notes: str = ""


@dataclass(frozen=True)
class ConflictResolution:
    chosen_event: Optional[AcquisitionEvent]
    conflict: Optional[EventConflict]
    reason: str

    @property
    def resolved(self) -> bool:
        return self.chosen_event is not None


def resolve_trigger_event(
    events: List[AcquisitionEvent],
    event_type: str,
    case_reference: str,
) -> ConflictResolution:
    """
    Resolves which AcquisitionEvent (if any) should back a clock computation
    for `event_type` within `case_reference`.

    Returns a ConflictResolution where:
      - chosen_event is None and conflict is None  -> no such event on record
        at all (caller should treat this as INSUFFICIENT_BASIS).
      - chosen_event is set (conflict may or may not also be set)          -> a
        usable date was determined, either because there was no real
        disagreement, or because the authority hierarchy justified a pick
        (an EventConflict is still recorded for the record-keeping trail in
        that second case, but the pick stands).
      - chosen_event is None and conflict is set    -> a genuine, unresolved
        conflict (tied top-authority sources disagree); caller should treat
        this as CLOCK_UNCERTAIN.
    """
    matching = [
        e
        for e in active_events(events)
        if e.event_type == event_type and e.case_reference == case_reference
    ]
    if not matching:
        return ConflictResolution(chosen_event=None, conflict=None, reason="no_trigger_event_on_record")

    distinct_dates = {e.event_date for e in matching}
    if len(distinct_dates) <= 1:
        # No real disagreement (one record, or several that all agree). Pick
        # the highest-authority record purely for provenance/calculation_basis
        # reporting — the date itself is not in question.
        best = sorted(matching, key=lambda e: (SOURCE_AUTHORITY_RANK[e.source_type], e.event_id))[0]
        return ConflictResolution(chosen_event=best, conflict=None, reason="single_value")

    ranked = sorted(matching, key=lambda e: SOURCE_AUTHORITY_RANK[e.source_type])
    top_rank = SOURCE_AUTHORITY_RANK[ranked[0].source_type]
    top_tier = [e for e in ranked if SOURCE_AUTHORITY_RANK[e.source_type] == top_rank]

    conflict = EventConflict(
        case_reference=case_reference,
        event_type=event_type,
        competing_event_ids=tuple(sorted(e.event_id for e in matching)),
        notes="Competing AcquisitionEvent records disagree on event_date for the same event type.",
    )

    if len(top_tier) == 1:
        top = top_tier[0]
        # A verified lower-authority source beats an unverified higher-authority
        # one (§9's explicit rule) — never the reverse, and never a tie-break
        # by recency.
        if not top.verified:
            verified_lower = [
                e
                for e in ranked
                if SOURCE_AUTHORITY_RANK[e.source_type] > top_rank and e.verified
            ]
            if verified_lower:
                chosen = sorted(
                    verified_lower, key=lambda e: (SOURCE_AUTHORITY_RANK[e.source_type], e.event_id)
                )[0]
                return ConflictResolution(
                    chosen_event=chosen,
                    conflict=conflict,
                    reason="verified_lower_authority_over_unverified_higher",
                )
        return ConflictResolution(chosen_event=top, conflict=conflict, reason="highest_authority_wins")

    # Tie at the very top authority tier with differing dates: no justified pick.
    return ConflictResolution(chosen_event=None, conflict=conflict, reason="unresolved_tie_at_top_authority")
