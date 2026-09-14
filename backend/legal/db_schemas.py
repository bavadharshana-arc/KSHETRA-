"""
Pydantic (v2) Read schemas for the statutory clock engine's read-only API
(backend/routers/legal.py). Mirrors backend/schemas.py conventions:
`from_attributes=True` so a schema can be built directly from a db_models.py
ORM instance.

No Create/Update schemas are defined here on purpose — Step 6B ships
READ-ONLY endpoints only ("Do NOT create automatic recomputation endpoints
yet"); writes happen only via legal/db_crud.py, called directly by
legal/seed_demo_db.py, not through the HTTP API.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class RuleSetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    act: str
    section_reference: str
    jurisdiction: str
    version: str
    effective_from: date
    effective_to: Optional[date] = None
    approval_status: str
    source_reference: str
    source_hash: str
    trigger_definition: Dict[str, Any]
    duration_definition: Optional[Dict[str, Any]] = None
    duration_confidence: str
    extension_definition: Optional[Dict[str, Any]] = None
    stay_definition: Optional[Dict[str, Any]] = None
    consequence_definition: Dict[str, Any]
    notes: str
    created_at: datetime
    updated_at: datetime


class AcquisitionEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    case_reference: str
    project_id: Optional[str] = None
    parcel_id: Optional[str] = None
    event_type: str
    applicable_act: str
    event_date: date
    publication_date: Optional[date] = None
    source_type: str
    source_reference: str
    source_document_id: Optional[str] = None
    confidence: str
    verified: bool
    verification_timestamp: Optional[datetime] = None
    supersedes_event_id: Optional[str] = None
    notes: str
    created_at: datetime


class CourtStayEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    case_reference: str
    court: str
    order_date: date
    effective_from: date
    effective_to: Optional[date] = None
    scope: str
    affected_parcels: List[str] = []
    affected_stage: Optional[str] = None
    source_document: Optional[str] = None
    verification_status: str
    notes: str
    created_at: datetime


class ExtensionEvidenceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    case_reference: str
    rule_set_id: str
    extension_order_id: Optional[str] = None
    extension_date: Optional[date] = None
    authority: Optional[str] = None
    reason: Optional[str] = None
    source_document: Optional[str] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    verification_status: str
    notes: str
    created_at: datetime


class EventConflictRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    case_reference: str
    event_type: str
    competing_event_ids: List[str] = []
    notes: str
    created_at: datetime


class StatutoryClockRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    case_reference: str
    project_id: Optional[str] = None
    parcel_id: Optional[str] = None
    applicable_act: str
    section_reference: str
    rule_set_id: str
    rule_set_version: str
    trigger_event_id: Optional[str] = None
    trigger_date: Optional[date] = None
    statutory_period: str
    computed_deadline: Optional[date] = None
    extension_status: str
    extension_evidence_id: Optional[str] = None
    stay_adjustment_days: int
    adjusted_deadline: Optional[date] = None
    calculation_date: date
    days_elapsed: Optional[int] = None
    days_remaining: Optional[int] = None
    clock_status: str
    consequence_class: str
    calculation_basis: str
    source_references: List[str] = []
    event_conflict_id: Optional[str] = None
    calculated_at: datetime
    calculation_version: str
    notes: str
    created_at: datetime
