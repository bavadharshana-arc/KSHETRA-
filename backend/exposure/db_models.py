"""
SQLAlchemy ORM model for the exposure/priority engine's persistence layer.
Follows the exact conventions already established in `backend/models.py`,
`backend/legal/db_models.py`, and `backend/blockers/db_models.py`:

  - The newly-invented entity keeps the server-generated ID the pure engine
    already assigned (`ExposureAssessment.assessment_id`, e.g.
    "EXP-<uuid hex>") as its String primary key.
  - `project_id`/`parcel_id` foreign keys are nullable with
    ondelete="SET NULL" (never CASCADE) -- a project/parcel deletion must
    never destroy exposure history, exactly like `blockers.db_models`'s own
    `BlockerRecord` FKs.
  - `primary_blocker_id` is likewise nullable + SET NULL -- an exposure
    assessment is a historical record that should outlive the specific
    blocker row it cited, the same way `BlockerActionRecord.blocker_id`
    outlives a deleted `Blocker`.
  - `prediction_id` is a REFERENCE only (plain String, not FK-enforced) --
    per docs/step8a-exposure-priority-audit.md Section 15: predictions are
    queried via the existing `crud.latest_project_prediction`/
    `latest_parcel_prediction` pattern, no new join needed, and a
    `Prediction` row is never deleted in this codebase, so there is nothing
    to protect against here beyond what plain-string honesty already gives.
  - `exposure_assessments` is APPEND-ONLY (mirrors `StatutoryClockRecord`/
    `BlockerRecord`): every computation run is a new row; "current" = latest
    `created_at` per `case_reference` (`db_crud.py`'s own
    `latest_only` query, mirroring `blockers/db_crud.py`'s pattern exactly).

Exactly ONE new table -- no separate `priority_assessments`/
`possession_impacts` table, per docs/step8a-exposure-priority-audit.md
Section 15's own reasoning (mirrors Step 7A's decision to avoid a
`blocker_conflicts` table).

Does NOT modify `backend/models.py`, `backend/database.py`,
`backend/legal/**`, `backend/blockers/**`, or any existing table.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, JSON, String, Text
from sqlalchemy.orm import relationship

from database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ExposureAssessmentRecord(Base):
    """Persists `exposure.models.ExposureAssessment`. APPEND-ONLY."""

    __tablename__ = "exposure_assessments"

    id = Column(String, primary_key=True)  # ExposureAssessment.assessment_id, e.g. "EXP-<uuid hex>"
    case_reference = Column(String, nullable=False, index=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    parcel_id = Column(String, ForeignKey("parcels.id", ondelete="SET NULL"), nullable=True, index=True)

    prediction_id = Column(String, nullable=True, index=True)  # reference only, not FK-enforced (see module docstring)
    primary_blocker_id = Column(String, ForeignKey("blockers.id", ondelete="SET NULL"), nullable=True, index=True)
    secondary_blocker_ids = Column(JSON, nullable=False, default=list)  # list[str]

    exposure_score = Column(Float, nullable=False)
    exposure_band = Column(String, nullable=False, index=True)  # LOW | MODERATE | HIGH | CRITICAL
    priority_score = Column(Float, nullable=False)
    priority_band = Column(String, nullable=False, index=True)  # WATCH | MONITOR | SOON | ACT_NOW
    confidence_label = Column(String, nullable=False)  # VERIFIED | PARTIAL | NEEDS_VERIFICATION | INSUFFICIENT
    unresolved_conflict = Column(Boolean, nullable=False, default=False)

    component_trace = Column(JSON, nullable=False, default=dict)
    recommended_action_id = Column(
        String, ForeignKey("blocker_actions.id", ondelete="SET NULL"), nullable=True, index=True
    )

    engine_version = Column(String, nullable=False, default="")
    calculation_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=False, default="")
    calculated_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False, index=True)

    project = relationship("Project")
    parcel = relationship("Parcel")
    primary_blocker = relationship("BlockerRecord", foreign_keys=[primary_blocker_id])
    recommended_action = relationship("BlockerActionRecord", foreign_keys=[recommended_action_id])
