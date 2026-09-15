"""
Pydantic (v2) Read schemas for the exposure/priority engine's read-only API
(backend/routers/exposure.py). Mirrors backend/blockers/db_schemas.py
conventions: `from_attributes=True` so a schema can be built directly from a
db_models.py ORM instance. No Create/Update schemas -- writes happen only via
exposure/db_crud.py (`persist_case_assessment`, `assess_and_persist_for_case`),
never through the HTTP API in this step.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class ExposureAssessmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    case_reference: str
    project_id: Optional[str] = None
    parcel_id: Optional[str] = None

    prediction_id: Optional[str] = None
    primary_blocker_id: Optional[str] = None
    secondary_blocker_ids: List[str] = []

    exposure_score: float
    exposure_band: str
    priority_score: float
    priority_band: str
    confidence_label: str
    unresolved_conflict: bool

    component_trace: Dict[str, Any] = {}
    recommended_action_id: Optional[str] = None

    engine_version: str
    calculation_date: Optional[date] = None
    notes: str
    calculated_at: Optional[datetime] = None
    created_at: datetime


class ExposureAssessmentWithContextRead(ExposureAssessmentRead):
    """Used by `GET /api/exposure/{assessment_id}` and the priority queue --
    inlines the primary blocker's owner/action summary (mirroring how
    `GET /api/blockers/{id}` already inlines evidence/actions,
    docs/step8a-exposure-priority-audit.md Section 16), read verbatim from
    the primary blocker's own already-persisted fields -- never a new
    owner-assignment computation."""

    owner_role: Optional[str] = None
    responsible_authority: Optional[str] = None
    recommended_action_type: Optional[str] = None
    recommended_action_rationale: Optional[str] = None
