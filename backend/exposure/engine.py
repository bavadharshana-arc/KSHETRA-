"""
Top-level orchestrator: takes one case's already-ranked blocker set (plus
scalar prediction/clock/project-scale context) and produces one
`ExposureAssessment`. Callable independently of HTTP and of any database
(mirrors `blockers/engine.py`'s own discipline) -- every argument is a plain
in-memory value; the persistence layer (`db_crud.py`) is the only place that
touches SQLAlchemy or reads real Project/Parcel/Blocker/Prediction/
StatutoryClock rows before calling in here.

Does NOT call `blockers.ranking.rank_blockers` -- this engine trusts the
`primary`/`ranking_basis` fields `blockers/ranking.py` already stamped onto
each `Blocker` (via `blockers/db_crud.py`'s persisted `is_primary` column, or
directly from `blockers.engine.evaluate_case`'s own output for the demo
scenarios) rather than re-deriving primary/secondary a second time -- one
ranking pass, one source of truth, per
docs/step8a-exposure-priority-audit.md's architectural-boundary rule.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Optional, Sequence

from blockers.enums import BlockerStatus
from blockers.models import Blocker

from . import scoring
from .enums import (
    ConfidenceLabel,
    ENGINE_VERSION,
    EXPOSURE_WEIGHTS_VERSION,
    GisDownstreamStatus,
    PRIORITY_WEIGHTS_VERSION,
    STALENESS_POLICY_VERSION,
)
from .models import ComponentTrace, ExposureAssessment

_FALLBACK_OWNER = (
    "Project Director / Planner (no specific blocker identified — manual triage required)"
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_assessment_id() -> str:
    """Server-generated identifier, mirrors `blockers.evidence.new_id`'s own
    convention (no prior human-readable ID scheme to preserve for a newly
    invented entity)."""
    return f"EXP-{uuid.uuid4().hex}"


def assess_case(
    *,
    case_reference: str,
    project_id: Optional[str],
    parcel_id: Optional[str],
    blockers: Sequence[Blocker] = (),
    prediction_id: Optional[str] = None,
    prediction_delay_probability: Optional[float] = None,
    prediction_generated_at: Optional[str] = None,
    prediction_timestamp: Optional[datetime] = None,
    days_remaining: Optional[int] = None,
    clock_status: Optional[str] = None,
    project_value_crores: Optional[float] = None,
    reference_project_values: Sequence[Optional[float]] = (),
    affected_parcel_count: Optional[int] = 1,
    affected_area_acres: Optional[float] = None,
    recommended_action_id: Optional[str] = None,
    calculation_date: date,
    calculated_at: Optional[datetime] = None,
    as_of: Optional[datetime] = None,
    engine_version: str = ENGINE_VERSION,
) -> Optional[ExposureAssessment]:
    """Computes one case's exposure + priority assessment. Returns `None`
    ONLY when there is genuinely no evidence to assess at all -- no blockers,
    no prediction, no clock (docs/step8a-exposure-priority-audit.md Section
    12: 'the only case that is correctly absent from a ranked list is one
    with no evidence to rank at all... a different state from evaluated and
    uncertain'). Every other input combination produces a real, non-crashing
    assessment with an honestly downgraded `confidence_label` rather than a
    suppressed or fabricated result.

    `days_remaining`/`clock_status` are the RAW values from whichever
    `StatutoryClockResult` backs this case's B1 blocker (the caller's
    responsibility to source correctly -- this engine never reads
    `legal.clock_engine` itself). `affected_parcel_count`/
    `affected_area_acres` default to the documented self-parcel-only demo
    values (Section 6) -- real downstream computation is out of scope."""
    calculated_at = calculated_at or _utcnow()
    as_of = as_of or calculated_at

    has_any_evidence = bool(blockers) or prediction_id is not None or days_remaining is not None or clock_status is not None
    if not has_any_evidence:
        return None

    legal_band, legal_ids, conflicted_b1_ids, insufficient_b1_ids = scoring.legal_band_from_blockers(blockers)
    possession_band, possession_ids = scoring.possession_band_from_blockers(blockers)
    downstream_band_value = scoring.downstream_band(affected_parcel_count)
    project_scale_value, project_scale_neutral = scoring.project_scale_band(
        project_value_crores, reference_project_values
    )

    primary_blocker = next((b for b in blockers if b.primary), None)
    if primary_blocker is not None:
        secondary_blockers = [b for b in blockers if b.blocker_id != primary_blocker.blocker_id]
    else:
        secondary_blockers = list(blockers)
    secondary_bonus_value = scoring.secondary_bonus(secondary_blockers)

    exposure_raw, exposure_score, exposure_band = scoring.compute_exposure(
        legal_band=legal_band,
        possession_band=possession_band,
        downstream_band_value=downstream_band_value,
        project_scale_band_value=project_scale_value,
        secondary_bonus_value=secondary_bonus_value,
    )

    urgency_band_value = scoring.urgency_band(days_remaining)
    actionability_band_value = scoring.actionability_band(
        primary_blocker.status if primary_blocker is not None else None
    )
    priority_raw, priority_score, priority_band, band_equiv = scoring.compute_priority(
        exposure_score=exposure_score,
        urgency_band_value=urgency_band_value,
        actionability_band_value=actionability_band_value,
    )

    has_conflicted_blocker = any(b.status == BlockerStatus.CONFLICTED for b in blockers)
    has_insufficient_blocker = any(b.status == BlockerStatus.INSUFFICIENT_EVIDENCE for b in blockers)
    no_confident_primary_but_blockers_exist = bool(blockers) and primary_blocker is None

    prediction_is_stale = scoring.is_stale(prediction_timestamp, as_of)
    blocker_evidence_is_stale = any(scoring.is_stale(b.calculated_at, as_of) for b in blockers)

    confidence_label = scoring.compute_confidence_label(
        has_conflicted_blocker=has_conflicted_blocker,
        has_insufficient_blocker=has_insufficient_blocker,
        no_confident_primary_but_blockers_exist=no_confident_primary_but_blockers_exist,
        clock_status=clock_status,
        legal_band_is_neutral_no_b1=not legal_ids,
        project_scale_is_neutral=project_scale_neutral,
        prediction_is_stale=prediction_is_stale,
        blocker_evidence_is_stale=blocker_evidence_is_stale,
    )

    if primary_blocker is not None:
        owner_role = primary_blocker.owner_role
        responsible_authority = primary_blocker.responsible_authority
    else:
        owner_role = _FALLBACK_OWNER
        responsible_authority = ""

    neutral_substitutions = []
    if not legal_ids:
        neutral_substitutions.append("legal_band: no determinate B1 blocker raised for this case (neutral=1).")
    if project_scale_neutral:
        neutral_substitutions.append(
            "project_scale_band: project_value_crores unknown or comparison set too small (neutral=1)."
        )
    if affected_parcel_count is None:
        neutral_substitutions.append("downstream_band: affected_parcel_count unknown (neutral=1).")

    disclaimers = []
    if primary_blocker is not None and primary_blocker.notes:
        disclaimers.append(primary_blocker.notes)
    for b in blockers:
        if b.blocker_id in legal_ids and (primary_blocker is None or b.blocker_id != primary_blocker.blocker_id):
            if b.notes and b.notes not in disclaimers:
                disclaimers.append(b.notes)

    secondary_blocker_ids = tuple(b.blocker_id for b in secondary_blockers)

    trace = ComponentTrace(
        legal_band=legal_band,
        possession_band=possession_band,
        downstream_band=downstream_band_value,
        project_scale_band=project_scale_value,
        secondary_bonus=secondary_bonus_value,
        exposure_raw=exposure_raw,
        exposure_band_equivalent=band_equiv,
        urgency_band=urgency_band_value,
        actionability_band=actionability_band_value,
        priority_raw=priority_raw,
        weights_version=EXPOSURE_WEIGHTS_VERSION,
        priority_weights_version=PRIORITY_WEIGHTS_VERSION,
        staleness_policy_version=STALENESS_POLICY_VERSION,
        gis_downstream_status=GisDownstreamStatus.NOT_COMPUTED.value,
        days_remaining=days_remaining,
        clock_status=clock_status,
        project_value_crores=project_value_crores,
        project_value_reference_count=len({v for v in reference_project_values if v is not None}),
        affected_parcel_count=affected_parcel_count if affected_parcel_count is not None else 1,
        affected_area_acres=affected_area_acres,
        contributing_b1_blocker_ids=legal_ids,
        contributing_possession_blocker_ids=possession_ids,
        primary_blocker_id=primary_blocker.blocker_id if primary_blocker is not None else None,
        secondary_blocker_ids=secondary_blocker_ids,
        conflicted_blocker_ids=tuple(b.blocker_id for b in blockers if b.status == BlockerStatus.CONFLICTED),
        insufficient_blocker_ids=tuple(
            b.blocker_id for b in blockers if b.status == BlockerStatus.INSUFFICIENT_EVIDENCE
        ),
        owner_role=owner_role,
        responsible_authority=responsible_authority,
        prediction_id=prediction_id,
        prediction_delay_probability=prediction_delay_probability,
        prediction_generated_at=prediction_generated_at,
        prediction_is_stale=prediction_is_stale,
        blocker_evidence_is_stale=blocker_evidence_is_stale,
        neutral_substitutions=tuple(neutral_substitutions),
        disclaimers=tuple(disclaimers),
    )

    notes_parts = list(disclaimers)
    if has_conflicted_blocker:
        notes_parts.append("Unresolved conflicting evidence exists for this case; treat with caution.")
    notes = " | ".join(notes_parts)

    return ExposureAssessment(
        assessment_id=new_assessment_id(),
        case_reference=case_reference,
        project_id=project_id,
        parcel_id=parcel_id,
        prediction_id=prediction_id,
        primary_blocker_id=primary_blocker.blocker_id if primary_blocker is not None else None,
        secondary_blocker_ids=secondary_blocker_ids,
        exposure_score=exposure_score,
        exposure_band=exposure_band,
        priority_score=priority_score,
        priority_band=priority_band,
        confidence_label=confidence_label,
        unresolved_conflict=has_conflicted_blocker,
        component_trace=trace,
        recommended_action_id=recommended_action_id,
        engine_version=engine_version,
        calculation_date=calculation_date,
        notes=notes,
        calculated_at=calculated_at,
    )
