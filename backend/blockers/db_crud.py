"""
Data-access functions over blockers/db_models.py, plus translation helpers
between the pure engine's dataclasses (blockers/models.py) and their ORM
rows, plus the adapters that let the live database feed the pure engine:

    legal.db_models.StatutoryClockRecord  -> legal.clock_engine.StatutoryClockResult
    models.Parcel (backend/models.py)     -> blockers.evidence.ParcelEvidenceInput

`evaluate_and_persist_for_parcel` is the one function in this package that
touches a real database AND runs the pure engine end to end -- it is the
concrete fulfillment of the Step 7B brief's "the engine itself should be
callable independently of HTTP" (Section 14): it is called from a script or
test, never from backend/routers/blockers.py, which stays strictly
read-only.
"""

from __future__ import annotations

from datetime import date
from typing import List, Optional

from sqlalchemy.orm import Session

from legal import db_crud as legal_db_crud
from legal import db_models as legal_db_models
from legal.clock_engine import StatutoryClockResult
from legal.enums import ApplicableAct, ClockStatus, ConsequenceClass, ExtensionStatus

from . import db_models
from .engine import evaluate_case
from .evidence import ParcelEvidenceInput, new_id
from .models import ActionRecommendation, Blocker, BlockerEvidence, CaseEvaluationResult


# -----------------------------------------------------------------------------
# Adapters: ORM rows -> pure engine input types
# -----------------------------------------------------------------------------
def clock_result_from_record(record: legal_db_models.StatutoryClockRecord) -> StatutoryClockResult:
    """Reconstructs the exact pure `StatutoryClockResult` dataclass Step 6B's
    own engine produced, from its persisted row. Reuses that dataclass
    verbatim (imported from `legal.clock_engine`) rather than inventing a
    second, parallel "clock view" type -- see
    docs/step7a-blocker-engine-audit.md Section L's one-way-dependency rule."""
    return StatutoryClockResult(
        clock_id=record.id,
        case_reference=record.case_reference,
        project_id=record.project_id,
        parcel_id=record.parcel_id,
        applicable_act=ApplicableAct(record.applicable_act),
        section_reference=record.section_reference,
        rule_set_id=record.rule_set_id,
        rule_set_version=record.rule_set_version,
        trigger_event_id=record.trigger_event_id,
        trigger_date=record.trigger_date,
        statutory_period=record.statutory_period,
        computed_deadline=record.computed_deadline,
        extension_status=ExtensionStatus(record.extension_status),
        extension_evidence_id=record.extension_evidence_id,
        stay_adjustment_days=record.stay_adjustment_days,
        adjusted_deadline=record.adjusted_deadline,
        calculation_date=record.calculation_date,
        days_elapsed=record.days_elapsed,
        days_remaining=record.days_remaining,
        clock_status=ClockStatus(record.clock_status),
        consequence_class=ConsequenceClass(record.consequence_class),
        calculation_basis=record.calculation_basis,
        source_references=list(record.source_references or []),
        calculated_at=record.calculated_at,
        calculation_version=record.calculation_version,
        event_conflict=None,  # not needed for B1's purposes; the conflict record is independently queryable
        notes=record.notes,
    )


def parcel_evidence_input_from_orm(parcel: "object") -> ParcelEvidenceInput:
    """Maps a real `models.Parcel` (backend/models.py) ORM row onto the pure
    engine's own input contract. `case_reference` is set to `project_id` --
    per docs/step7a-blocker-engine-audit.md Section Q ("No Case entity..."),
    this prototype's scoping assumption is one acquisition proceeding per
    project, exactly mirroring legal/db_models.py's own documented
    rationale for the same choice."""
    revenue = parcel.revenue_record or {}
    gis = parcel.gis_record or {}
    court = parcel.court_record or {}
    return ParcelEvidenceInput(
        case_reference=parcel.project_id,
        project_id=parcel.project_id,
        parcel_id=parcel.id,
        survey_number=parcel.survey_number,
        area_acres=parcel.area_acres,
        ownership_dispute=parcel.ownership_dispute,
        document_status=parcel.document_status,
        mutation_status=parcel.mutation_status,
        record_confidence=parcel.record_confidence,
        encumbrance_status=revenue.get("encumbranceStatus"),
        compensation_status=parcel.compensation_status,
        possession_status=parcel.possession_status,
        field_verified=parcel.field_verified,
        field_verification_notes=parcel.field_verification_notes,
        evidence_photo_attached=parcel.evidence_photo_attached,
        field_verified_at=parcel.field_verified_at,
        environmental_zone=gis.get("environmentalZone"),
        water_body_adjacent=gis.get("waterBodyAdjacent"),
        court_case=parcel.court_case,
        court_case_status=parcel.court_case_status,
        interim_injunction=court.get("interimInjunction"),
    )


# -----------------------------------------------------------------------------
# Dataclass -> ORM row translation (writes)
# -----------------------------------------------------------------------------
def _downstream_extent_to_dict(extent) -> dict:
    return {
        "affected_parcel_ids": list(extent.affected_parcel_ids),
        "affected_parcel_count": extent.affected_parcel_count,
        "affected_area_acres": extent.affected_area_acres,
        "contiguous_segment_ref": extent.contiguous_segment_ref,
        "critical_path_impact": extent.critical_path_impact,
    }


def create_blocker(db: Session, blocker: Blocker, evaluation_run_id: str) -> db_models.BlockerRecord:
    obj = db_models.BlockerRecord(
        id=blocker.blocker_id,
        evaluation_run_id=evaluation_run_id,
        case_reference=blocker.case_reference,
        project_id=blocker.project_id,
        parcel_id=blocker.parcel_id,
        blocker_type=blocker.blocker_type.value,
        status=blocker.status.value,
        severity=blocker.severity.value,
        owner_role=blocker.owner_role,
        responsible_authority=blocker.responsible_authority,
        affects_clock=blocker.affects_clock,
        affected_clock_ids=list(blocker.affected_clock_ids),
        affects_possession=blocker.affects_possession,
        affects_project=blocker.affects_project,
        downstream_extent=_downstream_extent_to_dict(blocker.downstream_extent),
        is_primary=blocker.primary,
        ranking_basis=blocker.ranking_basis,
        resolution_status=blocker.resolution_status.value if blocker.resolution_status else None,
        resolution_notes=blocker.resolution_notes,
        resolution_evidence_refs=list(blocker.resolution_evidence_refs),
        engine_version=blocker.engine_version,
        calculation_date=blocker.calculation_date,
        notes=blocker.notes,
        calculated_at=blocker.calculated_at,
    )
    db.add(obj)
    return obj


def create_blocker_evidence(db: Session, evidence: BlockerEvidence, blocker_id: str) -> db_models.BlockerEvidenceRecord:
    obj = db_models.BlockerEvidenceRecord(
        id=evidence.evidence_id,
        blocker_id=blocker_id,
        evidence_type=evidence.evidence_type.value,
        source_ref_type=evidence.source_ref_type,
        source_ref_id=evidence.source_ref_id,
        source_type=evidence.source_type.value if evidence.source_type is not None else None,
        verification_status=evidence.verification_status.value,
        description=evidence.description,
        relation=evidence.relation.value,
        observed_at=evidence.observed_at,
        recorded_at=evidence.recorded_at,
        notes=evidence.notes,
    )
    db.add(obj)
    return obj


def create_blocker_action(db: Session, action: ActionRecommendation) -> db_models.BlockerActionRecord:
    obj = db_models.BlockerActionRecord(
        id=action.action_id,
        blocker_id=action.blocker_id,
        owner_role=action.owner_role,
        authority=action.authority,
        action_type=action.action_type,
        rationale=action.rationale,
        evidence_refs=list(action.evidence_refs),
        priority=action.priority,
        status=action.status,
        precedent_refs=list(action.precedent_refs),
        created_at=action.created_at,
    )
    db.add(obj)
    return obj


def persist_case_evaluation(db: Session, result: CaseEvaluationResult) -> List[db_models.BlockerRecord]:
    """Persists every raised blocker (with its evidence) and every action
    recommendation from one `engine.evaluate_case` result, all tagged with
    one freshly-generated `evaluation_run_id` so `list_blockers(...,
    latest_only=True)` can later identify "the current blocker set for this
    case" without ambiguity across append-only history."""
    run_id = new_id("BLKRUN")
    created: List[db_models.BlockerRecord] = []
    for blocker in result.blockers:
        obj = create_blocker(db, blocker, run_id)
        created.append(obj)
        for evidence in blocker.evidence:
            create_blocker_evidence(db, evidence, blocker.blocker_id)
    for action in result.actions:
        create_blocker_action(db, action)
    db.commit()
    for obj in created:
        db.refresh(obj)
    return created


# -----------------------------------------------------------------------------
# Live evaluation entrypoint -- callable independently of HTTP (Step 7B brief §14)
# -----------------------------------------------------------------------------
def evaluate_and_persist_for_parcel(
    db: Session, parcel_id: str, calculation_date: date, *, persist: bool = True
) -> CaseEvaluationResult:
    """Loads the real `Parcel` row and every `StatutoryClock` on record for
    it, runs the full pure blocker engine, and (by default) persists the
    result. Raises `ValueError` if the parcel does not exist. Never called
    from backend/routers/blockers.py (read-only) -- intended for a seed
    script, an admin task, or a test/notebook."""
    import models as core_models  # backend/models.py, flat-import convention

    parcel_row = db.query(core_models.Parcel).filter(core_models.Parcel.id == parcel_id).first()
    if parcel_row is None:
        raise ValueError(f"Parcel '{parcel_id}' not found.")

    parcel_input = parcel_evidence_input_from_orm(parcel_row)
    clock_records = legal_db_crud.list_statutory_clocks(db, parcel_id=parcel_id)
    clocks = [clock_result_from_record(rec) for rec in clock_records]

    result = evaluate_case(
        case_reference=parcel_input.case_reference,
        calculation_date=calculation_date,
        clocks=clocks,
        parcels=[parcel_input],
    )
    if persist:
        persist_case_evaluation(db, result)
    return result


# -----------------------------------------------------------------------------
# Reads
# -----------------------------------------------------------------------------
def get_blocker(db: Session, blocker_id: str) -> Optional[db_models.BlockerRecord]:
    return db.query(db_models.BlockerRecord).filter(db_models.BlockerRecord.id == blocker_id).first()


def list_blockers(
    db: Session,
    *,
    project_id: Optional[str] = None,
    parcel_id: Optional[str] = None,
    blocker_type: Optional[str] = None,
    status: Optional[str] = None,
    latest_only: bool = True,
) -> List[db_models.BlockerRecord]:
    """`latest_only=True` (the default) scopes results to each
    `case_reference`'s most recent `evaluation_run_id` -- blockers are
    append-only, so without this a project/parcel with several historical
    evaluation runs would return every past run's rows undifferentiated."""
    query = db.query(db_models.BlockerRecord)
    if project_id is not None:
        query = query.filter(db_models.BlockerRecord.project_id == project_id)
    if parcel_id is not None:
        query = query.filter(db_models.BlockerRecord.parcel_id == parcel_id)
    if blocker_type is not None:
        query = query.filter(db_models.BlockerRecord.blocker_type == blocker_type)
    if status is not None:
        query = query.filter(db_models.BlockerRecord.status == status)
    results = query.order_by(db_models.BlockerRecord.created_at.desc()).all()

    if not latest_only or not results:
        return results

    latest_run_by_case: dict = {}
    for row in results:
        current = latest_run_by_case.get(row.case_reference)
        if current is None or row.created_at > current[0]:
            latest_run_by_case[row.case_reference] = (row.created_at, row.evaluation_run_id)
    return [row for row in results if latest_run_by_case[row.case_reference][1] == row.evaluation_run_id]


def get_primary_blocker(
    db: Session, *, project_id: Optional[str] = None, parcel_id: Optional[str] = None
) -> Optional[db_models.BlockerRecord]:
    for row in list_blockers(db, project_id=project_id, parcel_id=parcel_id, latest_only=True):
        if row.is_primary:
            return row
    return None


def list_blocker_evidence(db: Session, blocker_id: str) -> List[db_models.BlockerEvidenceRecord]:
    return (
        db.query(db_models.BlockerEvidenceRecord)
        .filter(db_models.BlockerEvidenceRecord.blocker_id == blocker_id)
        .all()
    )


def list_blocker_actions(db: Session, blocker_id: str) -> List[db_models.BlockerActionRecord]:
    return (
        db.query(db_models.BlockerActionRecord)
        .filter(db_models.BlockerActionRecord.blocker_id == blocker_id)
        .all()
    )
