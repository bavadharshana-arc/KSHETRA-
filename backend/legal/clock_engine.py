"""
The clock-status state machine + StatutoryClock computation. This is where
every other pure module in this package (dates, events, conflicts,
extensions, stays, rule_sets) is tied together into one deterministic result.

See docs/step6a-statutory-clock-audit.md §12/§13/§14 for the design this
implements, and the Step 6B brief's "CLOCK STATES" section for the exact
transition rules encoded below.

No hard-coded legal constants appear anywhere in this file — every duration,
trigger, extension and stay rule is read from the `RuleSet` passed in.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import List, Optional

from .conflicts import EventConflict, resolve_trigger_event
from .dates import InvalidDateError, compute_deadline, days_between
from .enums import ApplicableAct, ClockStatus, ConsequenceClass, ExtensionStatus
from .events import AcquisitionEvent
from .extensions import ExtensionEvidence, evaluate_extension_status, extension_covers_date
from .rule_sets import RuleSet
from .stays import CourtStayEvent, compute_stay_adjustment

CALCULATION_VERSION = "kshetra-legal-clock-engine-1.0.0"


@dataclass(frozen=True)
class StatutoryClockResult:
    clock_id: str
    case_reference: str
    project_id: Optional[str]
    parcel_id: Optional[str]
    applicable_act: ApplicableAct
    section_reference: str
    rule_set_id: str
    rule_set_version: str
    trigger_event_id: Optional[str]
    trigger_date: Optional[date]
    statutory_period: str
    computed_deadline: Optional[date]
    extension_status: ExtensionStatus
    extension_evidence_id: Optional[str]
    stay_adjustment_days: int
    adjusted_deadline: Optional[date]
    calculation_date: date
    days_elapsed: Optional[int]
    days_remaining: Optional[int]
    clock_status: ClockStatus
    consequence_class: ConsequenceClass
    calculation_basis: str
    source_references: List[str]
    calculated_at: datetime
    calculation_version: str
    event_conflict: Optional[EventConflict] = None
    notes: str = ""


def _describe_period(rule: RuleSet) -> str:
    trigger_desc = " or ".join(rule.trigger_definition.triggering_event_types)
    duration_desc = rule.duration_definition.describe() if rule.duration_definition else "(undefined)"
    return f"{duration_desc} from {trigger_desc}"


def compute_statutory_clock(
    *,
    clock_id: str,
    case_reference: str,
    project_id: Optional[str],
    parcel_id: Optional[str],
    rule: RuleSet,
    events: List[AcquisitionEvent],
    stays: Optional[List[CourtStayEvent]] = None,
    extension: Optional[ExtensionEvidence] = None,
    calculation_date: date,
    is_legacy_1894: bool = False,
) -> StatutoryClockResult:
    """
    Computes one StatutoryClock. Never raises for ordinary "the evidence
    isn't good enough" situations — those become INSUFFICIENT_BASIS /
    CLOCK_UNCERTAIN results, not exceptions. `calculation_date` is always
    explicit; nothing in this function reads the wall clock, so the same
    inputs always produce the same result.
    """
    stays = stays or []
    period_description = _describe_period(rule)
    calculated_at = datetime.now(timezone.utc)

    def result(**overrides) -> StatutoryClockResult:
        base = dict(
            clock_id=clock_id,
            case_reference=case_reference,
            project_id=project_id,
            parcel_id=parcel_id,
            applicable_act=rule.act,
            section_reference=rule.section_reference,
            rule_set_id=rule.rule_set_id,
            rule_set_version=rule.version,
            trigger_event_id=None,
            trigger_date=None,
            statutory_period=period_description,
            computed_deadline=None,
            extension_status=ExtensionStatus.EXTENSION_UNKNOWN,
            extension_evidence_id=None,
            stay_adjustment_days=0,
            adjusted_deadline=None,
            calculation_date=calculation_date,
            days_elapsed=None,
            days_remaining=None,
            clock_status=ClockStatus.INSUFFICIENT_BASIS,
            consequence_class=ConsequenceClass.LEGAL_STATUS_REQUIRES_VERIFICATION,
            calculation_basis="NONE",
            source_references=[],
            calculated_at=calculated_at,
            calculation_version=CALCULATION_VERSION,
            event_conflict=None,
            notes="",
        )
        base.update(overrides)
        # Legacy 1894 routing takes priority over every other status EXCEPT
        # INSUFFICIENT_BASIS (a legacy case with literally no trigger evidence
        # still has nothing to route -- see docs/step6a-statutory-clock-audit.md
        # §6, and this module's own "legacy override" note below).
        if is_legacy_1894 and base["clock_status"] != ClockStatus.INSUFFICIENT_BASIS:
            base["clock_status"] = ClockStatus.LEGACY_1894
        return StatutoryClockResult(**base)

    # ---- 1. Resolve the trigger event ------------------------------------
    if not rule.trigger_definition.triggering_event_types:
        return result(notes="RuleSet has no trigger_definition; cannot compute a clock.")

    resolution = None
    for event_type in rule.trigger_definition.triggering_event_types:
        candidate = resolve_trigger_event(events, event_type, case_reference)
        if candidate.chosen_event is not None or candidate.conflict is not None:
            resolution = candidate
            break

    if resolution is None:
        return result(notes="No AcquisitionEvent on record for this rule's trigger type(s).")

    if resolution.chosen_event is None:
        # Unresolved conflict among competing trigger-date records.
        return result(
            clock_status=ClockStatus.CLOCK_UNCERTAIN,
            consequence_class=ConsequenceClass.LEGAL_STATUS_REQUIRES_VERIFICATION,
            calculation_basis="UNRESOLVED_CONFLICT",
            event_conflict=resolution.conflict,
            notes="Conflicting trigger-event evidence could not be resolved deterministically.",
        )

    trigger_event = resolution.chosen_event
    trigger_date = trigger_event.event_date
    source_refs = [trigger_event.event_id]

    # ---- 2. Rule-level duration confidence gate --------------------------
    if rule.duration_definition is None or not rule.duration_definition.is_defined():
        return result(
            trigger_event_id=trigger_event.event_id,
            trigger_date=trigger_date,
            days_elapsed=days_between(trigger_date, calculation_date),
            clock_status=ClockStatus.CLOCK_UNCERTAIN,
            consequence_class=ConsequenceClass.LEGAL_STATUS_REQUIRES_VERIFICATION,
            calculation_basis="RULE_DURATION_NOT_DEFINED",
            source_references=source_refs,
            event_conflict=resolution.conflict,
            notes="RuleSet has no computable duration_definition (Step 6A audit flagged this rule's "
            "duration as not sufficiently established from primary sources).",
        )

    try:
        computed_deadline = compute_deadline(trigger_date, rule.duration_definition)
    except InvalidDateError as exc:
        return result(
            trigger_event_id=trigger_event.event_id,
            trigger_date=trigger_date,
            notes=f"Deadline computation failed: {exc}",
        )

    # ---- 3. Court-stay adjustment -----------------------------------------
    stay_days, applied_stays, ambiguous_stays, rule_uncertain_stays = compute_stay_adjustment(
        stays, rule, rule.section_reference, parcel_id, trigger_date, calculation_date
    )
    source_refs.extend(s.stay_id for s in applied_stays)
    adjusted_deadline = (
        date.fromordinal(computed_deadline.toordinal() + stay_days) if stay_days else computed_deadline
    )

    # ---- 4. Extension ------------------------------------------------------
    extension_status = evaluate_extension_status(rule, extension)
    extension_applies = (
        extension_status == ExtensionStatus.EXTENSION_VERIFIED
        and extension is not None
        and extension_covers_date(extension, calculation_date)
    )
    if extension_applies:
        # An extension that names an explicit new end date moves the deadline
        # to that date (never earlier than what was already computed); one
        # with no explicit new end date is evidence the mechanism was used
        # but doesn't itself specify a number, so the deadline is left as
        # computed (stay-adjusted) rather than guessed.
        if extension.effective_to is not None and extension.effective_to > adjusted_deadline:
            adjusted_deadline = extension.effective_to
        source_refs.append(extension.extension_id)

    days_elapsed = days_between(trigger_date, calculation_date)
    days_remaining = days_between(calculation_date, adjusted_deadline)

    # ---- 5. Determine clock_status -----------------------------------------
    rule_duration_trustworthy = rule.is_duration_sufficiently_verified()
    has_rule_uncertain_stay = len(rule_uncertain_stays) > 0
    has_ambiguous_stay = len(ambiguous_stays) > 0

    if has_ambiguous_stay:
        status_ = ClockStatus.CLOCK_UNCERTAIN
        consequence = ConsequenceClass.LEGAL_STATUS_REQUIRES_VERIFICATION
        basis = "AMBIGUOUS_STAY_SCOPE"
        notes = "A verified court stay's scope could not be established (ambiguous PARCEL/STAGE data)."
    elif has_rule_uncertain_stay:
        status_ = ClockStatus.CLOCK_UNCERTAIN
        consequence = ConsequenceClass.LEGAL_STATUS_REQUIRES_VERIFICATION
        basis = "STAY_TREATMENT_NOT_SUFFICIENTLY_VERIFIED"
        notes = (
            "A verified, in-scope court stay exists, but whether it may legally pause this specific "
            "clock rests on case law the Step 6A audit could not confirm as settled — the stay is "
            "neither applied nor ignored; the clock is reported as uncertain pending legal review."
        )
    elif not rule_duration_trustworthy:
        status_ = ClockStatus.CLOCK_UNCERTAIN
        consequence = ConsequenceClass.LEGAL_STATUS_REQUIRES_VERIFICATION
        basis = "RULE_NOT_SUFFICIENTLY_VERIFIED"
        notes = "This RuleSet's duration was not verbatim-confirmed against a primary source in the Step 6A audit."
    elif calculation_date <= adjusted_deadline:
        status_ = ClockStatus.CLOCK_CERTAIN
        consequence = (
            ConsequenceClass.CLOCK_AT_RISK if days_remaining is not None and days_remaining <= 30
            else ConsequenceClass.PROCESS_DELAY
        )
        basis = trigger_event.source_type.value
        notes = ""
    elif extension_applies:
        status_ = ClockStatus.CLOCK_CERTAIN
        consequence = ConsequenceClass.PROCESS_DELAY
        basis = trigger_event.source_type.value
        notes = "Deadline passed under the original computation but a verified extension covers the calculation date."
    elif extension_status == ExtensionStatus.EXTENSION_CLAIMED:
        status_ = ClockStatus.EXTENSION_UNVERIFIED
        consequence = ConsequenceClass.LEGAL_STATUS_REQUIRES_VERIFICATION
        basis = trigger_event.source_type.value
        notes = "Deadline passed; an extension has been claimed but is not yet verified."
    else:
        status_ = ClockStatus.APPARENT_LAPSE
        consequence = (
            ConsequenceClass.APPARENT_LAPSE
            if rule.consequence_definition.is_acquisition_lapse
            else ConsequenceClass.CLOCK_EXPIRED
        )
        basis = trigger_event.source_type.value
        notes = (
            "KSHETRA's deterministic evidence indicates the relevant statutory period appears to have "
            "been exceeded, subject to authoritative/legal verification. This is NOT a determination "
            "that the acquisition has legally lapsed."
            if consequence == ConsequenceClass.APPARENT_LAPSE
            else "Deadline passed for a non-acquisition-lapse rule (e.g. a procedural window or a "
            "possession-readiness precondition); this does not by itself mean any acquisition lapsed."
        )

    return result(
        trigger_event_id=trigger_event.event_id,
        trigger_date=trigger_date,
        computed_deadline=computed_deadline,
        extension_status=extension_status,
        extension_evidence_id=extension.extension_id if extension is not None else None,
        stay_adjustment_days=stay_days,
        adjusted_deadline=adjusted_deadline,
        days_elapsed=days_elapsed,
        days_remaining=days_remaining,
        clock_status=status_,
        consequence_class=consequence,
        calculation_basis=basis,
        source_references=source_refs,
        event_conflict=resolution.conflict,
        notes=notes,
    )
