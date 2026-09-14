"""
Data-access functions over legal/db_models.py, plus translation helpers
between the pure engine's dataclasses (legal/rule_sets.py, events.py,
stays.py, extensions.py, conflicts.py, clock_engine.py) and their ORM rows.

Read-heavy on purpose (Step 6B ships read-only API endpoints). The create_*
functions exist for legal/seed_demo_db.py to call directly — there is no
HTTP write path onto these tables yet.
"""

from __future__ import annotations

from typing import List, Optional

from sqlalchemy.orm import Session

from . import db_models
from .clock_engine import StatutoryClockResult
from .conflicts import EventConflict
from .dates import StatutoryDuration
from .events import AcquisitionEvent
from .extensions import ExtensionEvidence
from .rule_sets import ConsequenceDefinition, ExtensionDefinition, RuleSet, StayDefinition, TriggerDefinition
from .stays import CourtStayEvent


# -----------------------------------------------------------------------------
# Dataclass -> JSON-able dict translation (for RuleSet's nested definitions)
# -----------------------------------------------------------------------------
def _duration_to_dict(d: Optional[StatutoryDuration]) -> Optional[dict]:
    if d is None:
        return None
    return {
        "months": d.months,
        "years": d.years,
        "days": d.days,
        "counting_convention_verified": d.counting_convention_verified,
    }


def _trigger_to_dict(t: TriggerDefinition) -> dict:
    return {"triggering_event_types": list(t.triggering_event_types), "notes": t.notes}


def _extension_def_to_dict(e: Optional[ExtensionDefinition]) -> Optional[dict]:
    if e is None:
        return None
    return {
        "permitted": e.permitted,
        "authority": e.authority,
        "requires_written_reasons": e.requires_written_reasons,
        "requires_publication": e.requires_publication,
        "confidence": e.confidence.value,
        "notes": e.notes,
    }


def _stay_def_to_dict(s: Optional[StayDefinition]) -> Optional[dict]:
    if s is None:
        return None
    return {"permitted": s.permitted, "basis": s.basis, "confidence": s.confidence.value, "notes": s.notes}


def _consequence_def_to_dict(c: ConsequenceDefinition) -> dict:
    return {"description": c.description, "is_acquisition_lapse": c.is_acquisition_lapse}


# -----------------------------------------------------------------------------
# RuleSet
# -----------------------------------------------------------------------------
def create_rule_set(db: Session, rule: RuleSet) -> db_models.RuleSetRecord:
    obj = db_models.RuleSetRecord(
        id=rule.rule_set_id,
        act=rule.act.value,
        section_reference=rule.section_reference,
        jurisdiction=rule.jurisdiction,
        version=rule.version,
        effective_from=rule.effective_from,
        effective_to=rule.effective_to,
        approval_status=rule.approval_status.value,
        source_reference=rule.source_reference,
        source_hash=rule.source_hash,
        trigger_definition=_trigger_to_dict(rule.trigger_definition),
        duration_definition=_duration_to_dict(rule.duration_definition),
        duration_confidence=rule.duration_confidence.value,
        extension_definition=_extension_def_to_dict(rule.extension_definition),
        stay_definition=_stay_def_to_dict(rule.stay_definition),
        consequence_definition=_consequence_def_to_dict(rule.consequence_definition),
        notes=rule.notes,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def upsert_rule_set(db: Session, rule: RuleSet) -> db_models.RuleSetRecord:
    """Idempotent, mirroring backend/seed.py's upsert-by-natural-key
    convention — safe to re-run the seed script repeatedly."""
    existing = db.get(db_models.RuleSetRecord, rule.rule_set_id)
    if existing is None:
        return create_rule_set(db, rule)
    existing.act = rule.act.value
    existing.section_reference = rule.section_reference
    existing.jurisdiction = rule.jurisdiction
    existing.version = rule.version
    existing.effective_from = rule.effective_from
    existing.effective_to = rule.effective_to
    existing.approval_status = rule.approval_status.value
    existing.source_reference = rule.source_reference
    existing.source_hash = rule.source_hash
    existing.trigger_definition = _trigger_to_dict(rule.trigger_definition)
    existing.duration_definition = _duration_to_dict(rule.duration_definition)
    existing.duration_confidence = rule.duration_confidence.value
    existing.extension_definition = _extension_def_to_dict(rule.extension_definition)
    existing.stay_definition = _stay_def_to_dict(rule.stay_definition)
    existing.consequence_definition = _consequence_def_to_dict(rule.consequence_definition)
    existing.notes = rule.notes
    db.commit()
    db.refresh(existing)
    return existing


def get_rule_set(db: Session, rule_set_id: str) -> Optional[db_models.RuleSetRecord]:
    return db.get(db_models.RuleSetRecord, rule_set_id)


def list_rule_sets(
    db: Session,
    act: Optional[str] = None,
    approval_status: Optional[str] = None,
) -> List[db_models.RuleSetRecord]:
    query = db.query(db_models.RuleSetRecord)
    if act is not None:
        query = query.filter(db_models.RuleSetRecord.act == act)
    if approval_status is not None:
        query = query.filter(db_models.RuleSetRecord.approval_status == approval_status)
    return query.order_by(db_models.RuleSetRecord.section_reference).all()


# -----------------------------------------------------------------------------
# AcquisitionEvent — APPEND-ONLY: create + read only.
# -----------------------------------------------------------------------------
def create_acquisition_event(db: Session, event: AcquisitionEvent) -> db_models.AcquisitionEventRecord:
    obj = db_models.AcquisitionEventRecord(
        id=event.event_id,
        case_reference=event.case_reference,
        project_id=event.project_id,
        parcel_id=event.parcel_id,
        event_type=event.event_type,
        applicable_act=event.applicable_act.value,
        event_date=event.event_date,
        publication_date=event.publication_date,
        source_type=event.source_type.value,
        source_reference=event.source_reference,
        source_document_id=event.source_document_id,
        confidence=event.confidence,
        verified=event.verified,
        verification_timestamp=event.verification_timestamp,
        supersedes_event_id=event.supersedes_event_id,
        notes=event.notes,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_acquisition_events(
    db: Session,
    case_reference: Optional[str] = None,
    project_id: Optional[str] = None,
    parcel_id: Optional[str] = None,
    applicable_act: Optional[str] = None,
) -> List[db_models.AcquisitionEventRecord]:
    query = db.query(db_models.AcquisitionEventRecord)
    if case_reference is not None:
        query = query.filter(db_models.AcquisitionEventRecord.case_reference == case_reference)
    if project_id is not None:
        query = query.filter(db_models.AcquisitionEventRecord.project_id == project_id)
    if parcel_id is not None:
        query = query.filter(db_models.AcquisitionEventRecord.parcel_id == parcel_id)
    if applicable_act is not None:
        query = query.filter(db_models.AcquisitionEventRecord.applicable_act == applicable_act)
    return query.order_by(db_models.AcquisitionEventRecord.event_date).all()


# -----------------------------------------------------------------------------
# CourtStayEvent — APPEND-ONLY: create + read only.
# -----------------------------------------------------------------------------
def create_court_stay_event(db: Session, stay: CourtStayEvent) -> db_models.CourtStayEventRecord:
    obj = db_models.CourtStayEventRecord(
        id=stay.stay_id,
        case_reference=stay.case_reference,
        court=stay.court,
        order_date=stay.order_date,
        effective_from=stay.effective_from,
        effective_to=stay.effective_to,
        scope=stay.scope.value,
        affected_parcels=list(stay.affected_parcels),
        affected_stage=stay.affected_stage,
        source_document=stay.source_document,
        verification_status=stay.verification_status.value,
        notes=stay.notes,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_court_stay_events(db: Session, case_reference: Optional[str] = None) -> List[db_models.CourtStayEventRecord]:
    query = db.query(db_models.CourtStayEventRecord)
    if case_reference is not None:
        query = query.filter(db_models.CourtStayEventRecord.case_reference == case_reference)
    return query.order_by(db_models.CourtStayEventRecord.effective_from).all()


# -----------------------------------------------------------------------------
# ExtensionEvidence — APPEND-ONLY: create + read only.
# -----------------------------------------------------------------------------
def create_extension_evidence(db: Session, ext: ExtensionEvidence) -> db_models.ExtensionEvidenceRecord:
    obj = db_models.ExtensionEvidenceRecord(
        id=ext.extension_id,
        case_reference=ext.case_reference,
        rule_set_id=ext.rule_set_id,
        extension_order_id=ext.extension_order_id,
        extension_date=ext.extension_date,
        authority=ext.authority,
        reason=ext.reason,
        source_document=ext.source_document,
        effective_from=ext.effective_from,
        effective_to=ext.effective_to,
        verification_status=ext.verification_status.value,
        notes=ext.notes,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_extension_evidence(db: Session, case_reference: Optional[str] = None) -> List[db_models.ExtensionEvidenceRecord]:
    query = db.query(db_models.ExtensionEvidenceRecord)
    if case_reference is not None:
        query = query.filter(db_models.ExtensionEvidenceRecord.case_reference == case_reference)
    return query.order_by(db_models.ExtensionEvidenceRecord.created_at.desc()).all()


# -----------------------------------------------------------------------------
# EventConflict — APPEND-ONLY: create + read only.
# -----------------------------------------------------------------------------
def create_event_conflict(db: Session, conflict: EventConflict) -> db_models.EventConflictRecord:
    obj = db_models.EventConflictRecord(
        case_reference=conflict.case_reference,
        event_type=conflict.event_type,
        competing_event_ids=list(conflict.competing_event_ids),
        notes=conflict.notes,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_event_conflicts(db: Session, case_reference: Optional[str] = None) -> List[db_models.EventConflictRecord]:
    query = db.query(db_models.EventConflictRecord)
    if case_reference is not None:
        query = query.filter(db_models.EventConflictRecord.case_reference == case_reference)
    return query.order_by(db_models.EventConflictRecord.created_at.desc()).all()


# -----------------------------------------------------------------------------
# StatutoryClock — APPEND-ONLY (mirrors `Prediction`): every computation is a
# new row; no update_*/delete_* helper is defined.
# -----------------------------------------------------------------------------
def create_statutory_clock(
    db: Session, result: StatutoryClockResult, event_conflict_id: Optional[str] = None
) -> db_models.StatutoryClockRecord:
    obj = db_models.StatutoryClockRecord(
        id=result.clock_id,
        case_reference=result.case_reference,
        project_id=result.project_id,
        parcel_id=result.parcel_id,
        applicable_act=result.applicable_act.value,
        section_reference=result.section_reference,
        rule_set_id=result.rule_set_id,
        rule_set_version=result.rule_set_version,
        trigger_event_id=result.trigger_event_id,
        trigger_date=result.trigger_date,
        statutory_period=result.statutory_period,
        computed_deadline=result.computed_deadline,
        extension_status=result.extension_status.value,
        extension_evidence_id=result.extension_evidence_id,
        stay_adjustment_days=result.stay_adjustment_days,
        adjusted_deadline=result.adjusted_deadline,
        calculation_date=result.calculation_date,
        days_elapsed=result.days_elapsed,
        days_remaining=result.days_remaining,
        clock_status=result.clock_status.value,
        consequence_class=result.consequence_class.value,
        calculation_basis=result.calculation_basis,
        source_references=list(result.source_references),
        event_conflict_id=event_conflict_id,
        calculated_at=result.calculated_at,
        calculation_version=result.calculation_version,
        notes=result.notes,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def get_statutory_clock(db: Session, clock_id: str) -> Optional[db_models.StatutoryClockRecord]:
    return db.get(db_models.StatutoryClockRecord, clock_id)


def list_statutory_clocks(
    db: Session,
    project_id: Optional[str] = None,
    parcel_id: Optional[str] = None,
    applicable_act: Optional[str] = None,
    clock_status: Optional[str] = None,
) -> List[db_models.StatutoryClockRecord]:
    query = db.query(db_models.StatutoryClockRecord)
    if project_id is not None:
        query = query.filter(db_models.StatutoryClockRecord.project_id == project_id)
    if parcel_id is not None:
        query = query.filter(db_models.StatutoryClockRecord.parcel_id == parcel_id)
    if applicable_act is not None:
        query = query.filter(db_models.StatutoryClockRecord.applicable_act == applicable_act)
    if clock_status is not None:
        query = query.filter(db_models.StatutoryClockRecord.clock_status == clock_status)
    return query.order_by(db_models.StatutoryClockRecord.created_at.desc()).all()
