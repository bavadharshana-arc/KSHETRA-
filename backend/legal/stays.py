"""
CourtStayEvent + stay-applicability evaluation. See
docs/step6a-statutory-clock-audit.md §11.

A stay pauses a clock only if it is (1) VERIFIED, (2) actually in scope for
that specific clock (PARCEL/STAGE/PROJECT), and (3) the applicable RuleSet's
own stay_definition permits stay adjustment for that section at all — and
even then, only a RuleSet whose stay_definition was itself sourced from
EXPRESS statutory text may have a stay silently applied. A stay that is
verified and in-scope, but whose applicability rests on a RuleSet the Step 6A
audit could only source from case law (RFCTLARR S.25, S.24(2)), is treated as
a RULE-UNCERTAIN signal: never silently applied, but also never silently
discarded — its presence pushes the whole clock computation to
CLOCK_UNCERTAIN rather than letting an unadjusted clock look falsely certain.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import List, Optional, Tuple

from .enums import EvidenceVerificationStatus, LegalConfidence, StayScope
from .rule_sets import RuleSet


@dataclass(frozen=True)
class CourtStayEvent:
    stay_id: str
    case_reference: str
    court: str
    order_date: date
    effective_from: date
    effective_to: Optional[date]  # None = ongoing / not yet lifted
    scope: StayScope
    affected_parcels: Tuple[str, ...]
    affected_stage: Optional[str]  # a section_reference this stay is said to restrain (STAGE scope)
    source_document: Optional[str]
    verification_status: EvidenceVerificationStatus
    notes: str = ""


@dataclass(frozen=True)
class StayApplicability:
    applies: bool
    reason: str
    ambiguous_scope: bool = False
    rule_uncertain: bool = False


def stay_applies_to_clock(
    stay: CourtStayEvent,
    rule: RuleSet,
    section_reference: str,
    parcel_id: Optional[str],
) -> StayApplicability:
    if stay.verification_status != EvidenceVerificationStatus.VERIFIED:
        return StayApplicability(False, "stay_not_verified")

    # ---- scope check first: an ambiguous scope is ambiguous regardless of
    # what the RuleSet says, and is reported as such rather than folded into
    # "rule uncertain". ----
    if stay.scope == StayScope.PROJECT:
        scope_matches = True
    elif stay.scope == StayScope.STAGE:
        if not stay.affected_stage:
            return StayApplicability(False, "ambiguous_stage_scope", ambiguous_scope=True)
        scope_matches = stay.affected_stage == section_reference
    elif stay.scope == StayScope.PARCEL:
        if not stay.affected_parcels:
            return StayApplicability(False, "ambiguous_parcel_scope", ambiguous_scope=True)
        if parcel_id is None:
            return StayApplicability(False, "project_level_clock_not_covered_by_parcel_stay")
        scope_matches = parcel_id in stay.affected_parcels
    else:
        return StayApplicability(False, "unrecognized_scope", ambiguous_scope=True)

    if not scope_matches:
        return StayApplicability(False, "scope_does_not_match_this_clock")

    # ---- scope matches: now check whether the RULE itself confidently
    # permits a stay adjustment here at all. ----
    if rule.stay_definition is None:
        return StayApplicability(False, "ruleset_stay_treatment_not_established", rule_uncertain=True)

    if rule.stay_definition.permitted and rule.stay_definition.confidence == LegalConfidence.VERIFIED:
        return StayApplicability(True, "verified_in_scope_stay_on_an_express_statutory_exclusion_rule")

    if rule.stay_definition.permitted and rule.stay_definition.confidence != LegalConfidence.VERIFIED:
        # The rule's text says a stay-exclusion exists but the Step 6A audit
        # has not independently verbatim-confirmed it (e.g. it was located
        # via a secondary corroboration rather than a direct primary-source
        # extraction) -- apply it, but the caller/test suite can distinguish
        # this from the VERIFIED case via `reason`.
        return StayApplicability(True, "in_scope_stay_on_a_pending_review_statutory_exclusion_rule")

    # rule.stay_definition.permitted is False: this is ALWAYS treated as
    # rule-uncertain (never a silent "does not apply"), because every
    # `permitted=False` StayDefinition in rule_seed_data.py represents an
    # unresolved/case-law-only finding, not a positively confirmed "stays
    # never pause this clock" rule (see StayDefinition's docstring).
    return StayApplicability(False, "ruleset_stay_treatment_unresolved_for_this_section", rule_uncertain=True)


def compute_stay_adjustment(
    stays: List[CourtStayEvent],
    rule: RuleSet,
    section_reference: str,
    parcel_id: Optional[str],
    trigger_date: date,
    calculation_date: date,
) -> Tuple[int, List[CourtStayEvent], List[CourtStayEvent], List[CourtStayEvent]]:
    """
    Returns (total_days_excluded, applied_stays, ambiguous_stays, rule_uncertain_stays).

    Only `applied_stays` contribute days. Overlapping stay windows are
    de-duplicated via a day-ordinal set (not summed naively), so two
    overlapping stays over the same clock never double-subtract.
    """
    applied: List[CourtStayEvent] = []
    ambiguous: List[CourtStayEvent] = []
    rule_uncertain: List[CourtStayEvent] = []
    covered_days: set = set()

    for stay in stays:
        applicability = stay_applies_to_clock(stay, rule, section_reference, parcel_id)
        if applicability.ambiguous_scope:
            ambiguous.append(stay)
            continue
        if applicability.rule_uncertain:
            rule_uncertain.append(stay)
            continue
        if not applicability.applies:
            continue

        window_start = max(stay.effective_from, trigger_date)
        window_end = min(stay.effective_to or calculation_date, calculation_date)
        if window_end < window_start:
            continue
        applied.append(stay)
        covered_days.update(range(window_start.toordinal(), window_end.toordinal() + 1))

    return len(covered_days), applied, ambiguous, rule_uncertain
