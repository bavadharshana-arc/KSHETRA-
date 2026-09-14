"""
SQLAlchemy ORM models for the blocker engine's persistence layer. Follows
the exact conventions already established in backend/models.py and
backend/legal/db_models.py:
  - Newly-invented entities (no prior ID scheme) keep the server-generated
    ID the pure engine already assigned (`Blocker.blocker_id`,
    `BlockerEvidence.evidence_id`, `ActionRecommendation.action_id`) as
    their String primary key -- mirrors how legal/db_crud.py persists
    `AcquisitionEvent.event_id` etc. verbatim rather than re-generating one.
  - `project_id`/`parcel_id` foreign keys are nullable with
    ondelete="SET NULL" (never CASCADE) -- a project/parcel deletion must
    never destroy blocker history, exactly like legal/db_models.py's own
    AcquisitionEvent/StatutoryClock FKs.
  - `blocker_id` on BlockerEvidenceRecord/BlockerActionRecord is likewise
    nullable + SET NULL: an evidence/action row is a historical record that
    should outlive its parent Blocker row, the same way AuditLog.parcel_id
    outlives a deleted Parcel (backend/models.py).
  - `blockers`/`blocker_evidence` are APPEND-ONLY (mirrors
    StatutoryClockRecord/AcquisitionEventRecord): every evaluation run is a
    new set of rows, tagged with a shared `evaluation_run_id` so "the
    current blocker set for this case" can be queried as "the rows from the
    most recent run" (db_crud.py's `list_blockers(latest_only=True)`).
  - `blocker_actions.status` is the one deliberate deviation: mutable, like
    the existing CaseAction.status (backend/models.py) -- see
    docs/step7a-blocker-engine-audit.md Section Q.3's rationale.

NO `blocker_conflicts` table in this pass: this implementation represents a
conflict as `BlockerRecord.status == 'CONFLICTED'` with its competing
`BlockerEvidenceRecord` rows tagged `relation IN ('SUPPORTS','CONTRADICTS')`
-- fully queryable without a separate table, since nothing in this
implementation constructs a distinct `BlockerConflict` object at the engine
layer. docs/step7a-blocker-engine-audit.md Section Q flagged
`blocker_conflicts` as "the one judgment call reasonable people could make
differently" -- this is that call, made explicitly and reported in the
Step 7B report, not silently dropped.

Does NOT modify backend/models.py, backend/database.py, backend/legal/**,
or any existing table.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import relationship

from database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class BlockerRecord(Base):
    """Persists `blockers.models.Blocker`. APPEND-ONLY."""

    __tablename__ = "blockers"

    id = Column(String, primary_key=True)  # Blocker.blocker_id, e.g. "BLK-<uuid hex>"
    evaluation_run_id = Column(String, nullable=False, index=True)
    case_reference = Column(String, nullable=False, index=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    parcel_id = Column(String, ForeignKey("parcels.id", ondelete="SET NULL"), nullable=True, index=True)
    blocker_type = Column(String, nullable=False, index=True)  # B1 | B2 | B3 | B4
    status = Column(String, nullable=False, index=True)
    severity = Column(String, nullable=False)
    owner_role = Column(String, nullable=False)
    responsible_authority = Column(String, nullable=False)

    affects_clock = Column(Boolean, nullable=False, default=False)
    affected_clock_ids = Column(JSON, nullable=False, default=list)  # list[str]
    affects_possession = Column(Boolean, nullable=False, default=False)
    affects_project = Column(Boolean, nullable=False, default=False)
    downstream_extent = Column(JSON, nullable=False, default=dict)

    is_primary = Column(Boolean, nullable=False, default=False, index=True)
    ranking_basis = Column(JSON, nullable=False, default=dict)

    resolution_status = Column(String, nullable=True)
    resolution_notes = Column(Text, nullable=False, default="")
    resolution_evidence_refs = Column(JSON, nullable=False, default=list)

    engine_version = Column(String, nullable=False, default="")
    calculation_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=False, default="")
    calculated_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False, index=True)

    evidence = relationship("BlockerEvidenceRecord", back_populates="blocker")
    actions = relationship("BlockerActionRecord", back_populates="blocker")


class BlockerEvidenceRecord(Base):
    """Persists `blockers.models.BlockerEvidence`. APPEND-ONLY."""

    __tablename__ = "blocker_evidence"

    id = Column(String, primary_key=True)  # BlockerEvidence.evidence_id, e.g. "BEV-<uuid hex>"
    blocker_id = Column(String, ForeignKey("blockers.id", ondelete="SET NULL"), nullable=True, index=True)
    evidence_type = Column(String, nullable=False)
    source_ref_type = Column(String, nullable=False)
    source_ref_id = Column(String, nullable=False)
    source_type = Column(String, nullable=True)  # legal.enums.SourceType value, or None
    verification_status = Column(String, nullable=False)  # legal.enums.EvidenceVerificationStatus value
    description = Column(Text, nullable=False)
    relation = Column(String, nullable=False, default="SUPPORTS")  # SUPPORTS | CONTRADICTS | AMBIGUOUS
    observed_at = Column(Date, nullable=True)
    recorded_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=False, default="")

    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False, index=True)

    blocker = relationship("BlockerRecord", back_populates="evidence")


class BlockerActionRecord(Base):
    """Persists `blockers.models.ActionRecommendation`. MUTABLE `status`
    (deliberate deviation from append-only -- see this module's docstring
    and docs/step7a-blocker-engine-audit.md Section Q.3), mirroring the
    existing, production `CaseAction.status` PATCH-able pattern
    (backend/models.py / backend/routers/case_actions.py). No PATCH
    endpoint is exposed by this step's router (backend/routers/blockers.py
    is read-only, per the Step 7B brief's "no mutation endpoints unless
    genuinely required" instruction) -- this column is future-facing."""

    __tablename__ = "blocker_actions"

    id = Column(String, primary_key=True)  # ActionRecommendation.action_id, e.g. "ACTREC-<uuid hex>"
    blocker_id = Column(String, ForeignKey("blockers.id", ondelete="SET NULL"), nullable=True, index=True)
    owner_role = Column(String, nullable=False)
    authority = Column(String, nullable=False)
    action_type = Column(String, nullable=False)
    rationale = Column(Text, nullable=False)
    evidence_refs = Column(JSON, nullable=False, default=list)
    priority = Column(String, nullable=False)
    status = Column(String, nullable=False, default="RECOMMENDED")
    precedent_refs = Column(JSON, nullable=False, default=list)

    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)

    blocker = relationship("BlockerRecord", back_populates="actions")
