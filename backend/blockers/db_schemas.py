"""
Pydantic (v2) Read schemas for the blocker engine's read-only API
(backend/routers/blockers.py). Mirrors backend/legal/db_schemas.py
conventions: `from_attributes=True` so a schema can be built directly from a
db_models.py ORM instance. No Create/Update schemas -- writes happen only
via blockers/db_crud.py (`persist_case_evaluation`,
`evaluate_and_persist_for_parcel`), never through the HTTP API in this step.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class BlockerEvidenceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    blocker_id: Optional[str] = None
    evidence_type: str
    source_ref_type: str
    source_ref_id: str
    source_type: Optional[str] = None
    verification_status: str
    description: str
    relation: str
    observed_at: Optional[date] = None
    recorded_at: Optional[datetime] = None
    notes: str
    created_at: datetime


class BlockerActionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    blocker_id: Optional[str] = None
    owner_role: str
    authority: str
    action_type: str
    rationale: str
    evidence_refs: List[str] = []
    priority: str
    status: str
    precedent_refs: List[str] = []
    created_at: datetime
    updated_at: datetime


class BlockerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    evaluation_run_id: str
    case_reference: str
    project_id: Optional[str] = None
    parcel_id: Optional[str] = None
    blocker_type: str
    status: str
    severity: str
    owner_role: str
    responsible_authority: str
    affects_clock: bool
    affected_clock_ids: List[str] = []
    affects_possession: bool
    affects_project: bool
    downstream_extent: Dict[str, Any] = {}
    is_primary: bool
    ranking_basis: Dict[str, Any] = {}
    resolution_status: Optional[str] = None
    resolution_notes: str
    resolution_evidence_refs: List[str] = []
    engine_version: str
    calculation_date: Optional[date] = None
    notes: str
    calculated_at: Optional[datetime] = None
    created_at: datetime


class BlockerWithEvidenceRead(BlockerRead):
    """Used by GET /api/blockers/{blocker_id} -- includes the evidence and
    action rows inline so a single request renders the full WHY -> EVIDENCE
    -> SOURCE -> CONFIDENCE -> OWNER -> ACTION chain (Step 7A audit
    Section 12)."""

    evidence: List[BlockerEvidenceRead] = []
    actions: List[BlockerActionRead] = []
