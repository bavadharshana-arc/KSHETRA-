"""
Data-access functions over exposure/db_models.py, plus the adapter that lets
the live database feed the pure engine:

    blockers.db_models.BlockerRecord -> blockers.models.Blocker

`assess_and_persist_for_case` is the one function in this package that
touches a real database AND runs the pure engine end to end -- mirrors
`blockers.db_crud.evaluate_and_persist_for_parcel`'s exact discipline: called
from a script or test, never from `backend/routers/exposure.py`, which stays
strictly read-only.

Reuses existing read-only interfaces verbatim, never re-implements them:
  - `blockers.db_crud.list_blockers` for the case's raised blocker set.
  - `blockers.db_crud.list_blocker_actions` for the primary blocker's
    already-persisted `ActionRecommendation` id (Section 13/14: "No new
    action-selection algorithm").
  - `legal.db_crud.get_statutory_clock` for the B1-linked clock's raw
    `days_remaining`/`clock_status` (never recomputes a deadline).
  - `crud.latest_project_prediction`/`crud.latest_parcel_prediction`
    (`backend/crud.py`, read-only import) for the case's most recent ML
    prediction reference.
"""

from __future__ import annotations

import dataclasses
from datetime import date
from typing import List, Optional, Sequence

from sqlalchemy.orm import Session

from blockers import db_crud as blockers_db_crud
from blockers.enums import BlockerSeverity, BlockerStatus, BlockerType
from blockers.models import Blocker, DownstreamExtent
from legal import db_crud as legal_db_crud

from . import db_models, engine, scoring
from .models import ComponentTrace, ExposureAssessment

# -----------------------------------------------------------------------------
# Band rank dicts for `min_band` filtering -- plain dicts, independently
# testable, mirror `blockers.enums.BLOCKER_SEVERITY_RANK`'s own convention.
# -----------------------------------------------------------------------------
_EXPOSURE_BAND_RANK = {"LOW": 0, "MODERATE": 1, "HIGH": 2, "CRITICAL": 3}
_PRIORITY_BAND_RANK = {"WATCH": 0, "MONITOR": 1, "SOON": 2, "ACT_NOW": 3}


# -----------------------------------------------------------------------------
# Adapter: ORM row -> pure engine input type
# -----------------------------------------------------------------------------
def _blocker_from_record(record: "object") -> Blocker:
    """Reconstructs the exact pure `Blocker` dataclass the blocker engine
    produced, from its persisted row -- mirrors
    `blockers.db_crud.clock_result_from_record`'s own adapter pattern
    exactly (reuse the existing dataclass verbatim rather than inventing a
    second, parallel view type). `evidence` is intentionally left empty here
    -- exposure scoring never reads per-evidence detail (only
    severity/status/affects_possession/downstream_extent/owner/notes), and
    the full evidence trail stays independently queryable via
    `GET /api/blockers/{id}/evidence`."""
    de = record.downstream_extent or {}
    return Blocker(
        blocker_id=record.id,
        case_reference=record.case_reference,
        project_id=record.project_id,
        parcel_id=record.parcel_id,
        blocker_type=BlockerType(record.blocker_type),
        status=BlockerStatus(record.status),
        severity=BlockerSeverity(record.severity),
        owner_role=record.owner_role,
        responsible_authority=record.responsible_authority,
        evidence=(),
        affects_clock=record.affects_clock,
        affected_clock_ids=tuple(record.affected_clock_ids or []),
        affects_possession=record.affects_possession,
        affects_project=record.affects_project,
        downstream_extent=DownstreamExtent(
            affected_parcel_ids=tuple(de.get("affected_parcel_ids") or ()),
            affected_parcel_count=de.get("affected_parcel_count"),
            affected_area_acres=de.get("affected_area_acres"),
            contiguous_segment_ref=de.get("contiguous_segment_ref"),
            critical_path_impact=de.get("critical_path_impact"),
        ),
        primary=bool(record.is_primary),
        ranking_basis=record.ranking_basis or {},
        resolution_status=BlockerStatus(record.resolution_status) if record.resolution_status else None,
        resolution_notes=record.resolution_notes or "",
        resolution_evidence_refs=tuple(record.resolution_evidence_refs or ()),
        engine_version=record.engine_version or "",
        calculation_date=record.calculation_date,
        notes=record.notes or "",
        calculated_at=record.calculated_at,
    )


# -----------------------------------------------------------------------------
# Dataclass -> ORM row translation (writes)
# -----------------------------------------------------------------------------
def _component_trace_to_dict(trace: ComponentTrace) -> dict:
    return {
        "legal_band": trace.legal_band,
        "possession_band": trace.possession_band,
        "downstream_band": trace.downstream_band,
        "project_scale_band": trace.project_scale_band,
        "secondary_bonus": trace.secondary_bonus,
        "exposure_raw": trace.exposure_raw,
        "exposure_band_equivalent": trace.exposure_band_equivalent,
        "urgency_band": trace.urgency_band,
        "actionability_band": trace.actionability_band,
        "priority_raw": trace.priority_raw,
        "weights_version": trace.weights_version,
        "priority_weights_version": trace.priority_weights_version,
        "staleness_policy_version": trace.staleness_policy_version,
        "gis_downstream_status": trace.gis_downstream_status,
        "days_remaining": trace.days_remaining,
        "clock_status": trace.clock_status,
        "project_value_crores": trace.project_value_crores,
        "project_value_reference_count": trace.project_value_reference_count,
        "affected_parcel_count": trace.affected_parcel_count,
        "affected_area_acres": trace.affected_area_acres,
        "contributing_b1_blocker_ids": list(trace.contributing_b1_blocker_ids),
        "contributing_possession_blocker_ids": list(trace.contributing_possession_blocker_ids),
        "primary_blocker_id": trace.primary_blocker_id,
        "secondary_blocker_ids": list(trace.secondary_blocker_ids),
        "conflicted_blocker_ids": list(trace.conflicted_blocker_ids),
        "insufficient_blocker_ids": list(trace.insufficient_blocker_ids),
        "owner_role": trace.owner_role,
        "responsible_authority": trace.responsible_authority,
        "prediction_id": trace.prediction_id,
        "prediction_delay_probability": trace.prediction_delay_probability,
        "prediction_generated_at": trace.prediction_generated_at,
        "prediction_is_stale": trace.prediction_is_stale,
        "blocker_evidence_is_stale": trace.blocker_evidence_is_stale,
        "neutral_substitutions": list(trace.neutral_substitutions),
        "disclaimers": list(trace.disclaimers),
        "gis_downstream_note": (
            "True point-on-polyline downstream/corridor computation is NOT implemented in this "
            "prototype (docs/step8a-exposure-priority-audit.md Sections 1/6) -- affected_parcel_count/"
            "affected_area_acres above reflect the self-parcel-only demo default, never a corridor-wide "
            "figure."
        ),
    }


def create_exposure_assessment(db: Session, assessment: ExposureAssessment) -> db_models.ExposureAssessmentRecord:
    obj = db_models.ExposureAssessmentRecord(
        id=assessment.assessment_id,
        case_reference=assessment.case_reference,
        project_id=assessment.project_id,
        parcel_id=assessment.parcel_id,
        prediction_id=assessment.prediction_id,
        primary_blocker_id=assessment.primary_blocker_id,
        secondary_blocker_ids=list(assessment.secondary_blocker_ids),
        exposure_score=assessment.exposure_score,
        exposure_band=assessment.exposure_band.value,
        priority_score=assessment.priority_score,
        priority_band=assessment.priority_band.value,
        confidence_label=assessment.confidence_label.value,
        unresolved_conflict=assessment.unresolved_conflict,
        component_trace=_component_trace_to_dict(assessment.component_trace),
        recommended_action_id=assessment.recommended_action_id,
        engine_version=assessment.engine_version,
        calculation_date=assessment.calculation_date,
        notes=assessment.notes,
        calculated_at=assessment.calculated_at,
    )
    db.add(obj)
    return obj


def persist_case_assessment(db: Session, assessment: ExposureAssessment) -> db_models.ExposureAssessmentRecord:
    """APPEND-ONLY write: every call inserts a new row, never updates an
    existing one -- mirrors `blockers.db_crud.persist_case_evaluation`."""
    obj = create_exposure_assessment(db, assessment)
    db.commit()
    db.refresh(obj)
    return obj


# -----------------------------------------------------------------------------
# Live evaluation entrypoint -- callable independently of HTTP
# -----------------------------------------------------------------------------
def assess_and_persist_for_case(
    db: Session,
    *,
    project_id: Optional[str] = None,
    parcel_id: Optional[str] = None,
    calculation_date: Optional[date] = None,
    persist: bool = True,
) -> Optional[ExposureAssessment]:
    """Loads the real Project/Parcel/Blocker/Prediction/StatutoryClock rows
    for one case and runs the full pure exposure engine, persisting the
    result by default. Raises `ValueError` if the referenced project/parcel
    does not exist. Never called from `backend/routers/exposure.py`
    (read-only) -- intended for a seed script, an admin task, or a test."""
    import crud as core_crud  # backend/crud.py, flat-import convention, READ-ONLY use
    import models as core_models  # backend/models.py, flat-import convention

    if parcel_id is not None:
        parcel_row = db.query(core_models.Parcel).filter(core_models.Parcel.id == parcel_id).first()
        if parcel_row is None:
            raise ValueError(f"Parcel '{parcel_id}' not found.")
        resolved_project_id = parcel_row.project_id
        affected_area_acres = parcel_row.area_acres
        affected_parcel_count: Optional[int] = 1  # self-parcel only, Section 6
    elif project_id is not None:
        resolved_project_id = project_id
        affected_area_acres = None
        affected_parcel_count = None  # no single parcel to be "self" for a project-wide case
    else:
        raise ValueError("Either project_id or parcel_id must be supplied.")

    project_row = db.query(core_models.Project).filter(core_models.Project.id == resolved_project_id).first()
    if project_row is None:
        raise ValueError(f"Project '{resolved_project_id}' not found.")

    case_reference = resolved_project_id  # same one-project-one-case convention blockers/db_crud.py already uses
    calc_date = calculation_date or date.today()

    # Every blocker on record for the project (both parcel-scoped and
    # project-scoped, e.g. a project-wide B1 clock), then narrowed in Python
    # to this case's relevant scope -- `blockers_db_crud.list_blockers`
    # itself is never modified, only consumed.
    all_project_blockers = blockers_db_crud.list_blockers(db, project_id=resolved_project_id, latest_only=True)
    if parcel_id is not None:
        blocker_records = [r for r in all_project_blockers if r.parcel_id in (None, parcel_id)]
    else:
        blocker_records = list(all_project_blockers)
    pure_blockers = tuple(_blocker_from_record(r) for r in blocker_records)

    # The B1-linked clock's RAW days_remaining/clock_status (Section 7/11):
    # never recomputed, read directly off the same clock backing whichever
    # B1 blocker drives `legal_band`.
    legal_band, legal_ids, _conflicted, _insufficient = scoring.legal_band_from_blockers(pure_blockers)
    days_remaining = None
    clock_status = None
    if legal_ids:
        governing_id = sorted(legal_ids)[0]
        governing = next(b for b in pure_blockers if b.blocker_id == governing_id)
        if governing.affected_clock_ids:
            clock_record = legal_db_crud.get_statutory_clock(db, governing.affected_clock_ids[0])
            if clock_record is not None:
                days_remaining = clock_record.days_remaining
                clock_status = clock_record.clock_status

    if parcel_id is not None:
        prediction_row = core_crud.latest_parcel_prediction(db, parcel_id)
    else:
        prediction_row = core_crud.latest_project_prediction(db, resolved_project_id)
    prediction_id = prediction_row.id if prediction_row is not None else None
    prediction_probability = prediction_row.delay_probability if prediction_row is not None else None
    prediction_generated_at = prediction_row.generated_at if prediction_row is not None else None
    prediction_timestamp = prediction_row.created_at if prediction_row is not None else None

    reference_values = [v for (v,) in db.query(core_models.Project.project_value_crores).all()]

    assessment = engine.assess_case(
        case_reference=case_reference,
        project_id=resolved_project_id,
        parcel_id=parcel_id,
        blockers=pure_blockers,
        prediction_id=prediction_id,
        prediction_delay_probability=prediction_probability,
        prediction_generated_at=prediction_generated_at,
        prediction_timestamp=prediction_timestamp,
        days_remaining=days_remaining,
        clock_status=clock_status,
        project_value_crores=project_row.project_value_crores,
        reference_project_values=reference_values,
        affected_parcel_count=affected_parcel_count,
        affected_area_acres=affected_area_acres,
        calculation_date=calc_date,
    )
    if assessment is None:
        return None

    # No new action-selection algorithm (Section 13/14): reference the
    # primary blocker's own already-persisted ActionRecommendation id.
    if assessment.primary_blocker_id is not None:
        actions = blockers_db_crud.list_blocker_actions(db, assessment.primary_blocker_id)
        if actions:
            most_recent = max(actions, key=lambda a: a.created_at)
            assessment = dataclasses.replace(assessment, recommended_action_id=most_recent.id)

    if persist:
        persist_case_assessment(db, assessment)
    return assessment


# -----------------------------------------------------------------------------
# Reads
# -----------------------------------------------------------------------------
def get_exposure_assessment(db: Session, assessment_id: str) -> Optional[db_models.ExposureAssessmentRecord]:
    return db.query(db_models.ExposureAssessmentRecord).filter(db_models.ExposureAssessmentRecord.id == assessment_id).first()


def list_exposure_assessments(
    db: Session,
    *,
    project_id: Optional[str] = None,
    parcel_id: Optional[str] = None,
    case_reference: Optional[str] = None,
    min_band: Optional[str] = None,
    latest_only: bool = True,
) -> List[db_models.ExposureAssessmentRecord]:
    """`latest_only=True` (the default) keeps only the most recent row per
    (case_reference, project_id, parcel_id) -- exposure assessments are
    append-only, one full row per computation run (no `evaluation_run_id`
    grouping needed, unlike `blockers.db_crud.list_blockers`, since one row
    already IS one complete run's result here). `min_band` filters on
    `exposure_band`. Deterministic ordering: `created_at` desc,
    `case_reference` asc tie-break -- never a raw row id (Section 17).

    Step 8C-B.5 fix: grouping used to be keyed on `case_reference` ALONE.
    Because every real-parcel assessment shares `case_reference ==
    project_id` (`assess_and_persist_for_case`'s own documented
    one-project-one-case convention), that single-key grouping silently
    collapsed every parcel of a project down to whichever one was computed
    most recently -- e.g. a project-scoped query returned only ONE parcel's
    assessment instead of every assessed parcel's own current one.
    Including `project_id`/`parcel_id` (already-existing, already-indexed
    columns on every row -- not a change to what `case_reference` itself
    means or holds) in the grouping key restores "one current result per
    parcel" while an already-parcel-filtered query behaves exactly as
    before. Rows with no project/parcel at all
    (`project_id IS NULL AND parcel_id IS NULL`) still group by
    `case_reference` alone, unaffected by this change."""
    query = db.query(db_models.ExposureAssessmentRecord)
    if project_id is not None:
        query = query.filter(db_models.ExposureAssessmentRecord.project_id == project_id)
    if parcel_id is not None:
        query = query.filter(db_models.ExposureAssessmentRecord.parcel_id == parcel_id)
    if case_reference is not None:
        query = query.filter(db_models.ExposureAssessmentRecord.case_reference == case_reference)
    results = query.order_by(db_models.ExposureAssessmentRecord.created_at.desc()).all()

    if latest_only and results:
        def _group_key(row: db_models.ExposureAssessmentRecord) -> tuple:
            return (row.case_reference, row.project_id, row.parcel_id)

        latest_by_group: dict = {}
        for row in results:
            key = _group_key(row)
            current = latest_by_group.get(key)
            if current is None or row.created_at > current.created_at:
                latest_by_group[key] = row
        results = list(latest_by_group.values())

    if min_band is not None:
        threshold = _EXPOSURE_BAND_RANK[min_band]
        results = [r for r in results if _EXPOSURE_BAND_RANK[r.exposure_band] >= threshold]

    results.sort(key=lambda r: (-r.created_at.timestamp(), r.case_reference))
    return results


def get_latest_project_assessment(db: Session, project_id: str) -> Optional[db_models.ExposureAssessmentRecord]:
    """Returns the project's OWN project-scoped assessment
    (`parcel_id IS NULL`) only -- Step 8C-B.5 fix. Before this fix, this
    returned `results[0]` of whatever `list_exposure_assessments` gave back,
    which (after that function's own grouping fix) can now legitimately be
    several different parcels' assessments -- silently returning one of them
    here would falsely present one arbitrary parcel's own result as "the
    project's". There is no engine-defined operation that combines several
    parcels' scores into one project-level score (never invented here --
    averaging/summing is explicitly out of scope), so when no genuine
    project-scoped assessment has been computed, this honestly returns
    `None`. Callers wanting the full ranked set across a project's parcels
    should use `list_exposure_assessments(project_id=...)` or
    `priority_queue(project_id=...)` instead."""
    results = list_exposure_assessments(db, project_id=project_id, latest_only=True)
    project_level = [r for r in results if r.parcel_id is None]
    return project_level[0] if project_level else None


def get_latest_parcel_assessment(db: Session, parcel_id: str) -> Optional[db_models.ExposureAssessmentRecord]:
    results = list_exposure_assessments(db, parcel_id=parcel_id, latest_only=True)
    return results[0] if results else None


def priority_queue(
    db: Session,
    *,
    project_id: Optional[str] = None,
    limit: Optional[int] = None,
    min_band: Optional[str] = None,
) -> List[db_models.ExposureAssessmentRecord]:
    """`GET /api/exposure/priority-queue`'s backing query -- the single most
    important read this design adds (Section 16): "what should I act on
    first," across cases, not just "how exposed is this one case." Ordered
    by `priority_score` desc; ties broken by `case_reference` ASC (a stable
    business identifier), NEVER by the server-generated `id` -- the same
    input state always produces the same ranking (Section 17)."""
    results = list_exposure_assessments(db, project_id=project_id, latest_only=True)
    if min_band is not None:
        threshold = _PRIORITY_BAND_RANK[min_band]
        results = [r for r in results if _PRIORITY_BAND_RANK[r.priority_band] >= threshold]
    results.sort(key=lambda r: (-r.priority_score, r.case_reference))
    if limit is not None:
        results = results[:limit]
    return results
