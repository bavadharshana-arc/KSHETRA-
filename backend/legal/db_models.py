"""
SQLAlchemy ORM models for the statutory clock engine's persistence layer.

Only imported once the pure engine (dates.py, events.py, conflicts.py,
extensions.py, stays.py, rule_sets.py, clock_engine.py) has been exercised
independently of any database — see this package's Phase-1-first ordering.

Follows the conventions already established in backend/models.py:
  - Catalog-like/business-keyed entities (RuleSet) keep a caller-supplied,
    human-readable String primary key (mirrors Project/Parcel/Alert).
  - Newly-invented entities with no prior ID scheme (AcquisitionEvent,
    CourtStayEvent, ExtensionEvidence, StatutoryClock, EventConflict) use a
    server-generated UUID hex string (mirrors `Prediction`).
  - `created_at`/`updated_at` bookkeeping columns via the same `_utcnow()`
    pattern as models.py.
  - JSON columns for nested/structured data (identical on SQLite/Postgres).

Does NOT modify backend/models.py, backend/database.py, or any existing
table. `project_id`/`parcel_id` foreign keys are nullable with
ondelete="SET NULL" (like AuditLog.parcel_id) so a project/parcel deletion
never destroys legal evidence — these records are historical, append-only.

NO CASE ENTITY: `case_reference` is a plain, unconstrained string column
(not a foreign key), scoped in practice by `project_id` (+ optional
`parcel_id`). See this file's module-level note below and the Step 6B
report's "J. Architectural issue discovered" for why a new canonical `Case`
table was NOT introduced here.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from database import Base

# -----------------------------------------------------------------------------
# NOTE on case_reference / Case entity (Step 6A audit §19; Step 6B brief:
# "If a new canonical Case entity is genuinely required ... STOP and report
# the issue before inventing the schema"):
#
# This implementation does NOT introduce a new `cases` table. `case_reference`
# is a free-text string, and every legal record is additionally scoped by the
# existing `project_id` (+ optional `parcel_id`) foreign keys. This is
# adequate for the prototype's current assumption — one acquisition
# proceeding per project — but will under-represent a project that genuinely
# spans multiple legally distinct acquisition proceedings (e.g. a corridor
# with both a legacy-1894 segment and a fresh-RFCTLARR segment). That
# limitation is reported, not silently designed around; see the Step 6B
# report.
# -----------------------------------------------------------------------------


def _uuid_hex() -> str:
    return uuid.uuid4().hex


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class RuleSetRecord(Base):
    """Persists `legal.rule_sets.RuleSet`. Catalog data: `id` is the
    caller-supplied, human-readable rule_set_id (e.g.
    "rfctlarr-s19-declaration-v1"), matching the seed rows in
    legal/rule_seed_data.py, not a UUID."""

    __tablename__ = "rule_sets"

    id = Column(String, primary_key=True)
    act = Column(String, nullable=False, index=True)
    section_reference = Column(String, nullable=False, index=True)
    jurisdiction = Column(String, nullable=False)
    version = Column(String, nullable=False)
    effective_from = Column(Date, nullable=False)
    effective_to = Column(Date, nullable=True)
    approval_status = Column(String, nullable=False, index=True)
    source_reference = Column(Text, nullable=False)
    source_hash = Column(String, nullable=False)

    trigger_definition = Column(JSON, nullable=False)  # {"triggering_event_types": [...], "notes": ""}
    duration_definition = Column(JSON, nullable=True)  # {"months":..,"years":..,"days":..,...} | null
    duration_confidence = Column(String, nullable=False)
    extension_definition = Column(JSON, nullable=True)
    stay_definition = Column(JSON, nullable=True)
    consequence_definition = Column(JSON, nullable=False)
    notes = Column(Text, nullable=False, default="")

    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)

    clocks = relationship("StatutoryClockRecord", back_populates="rule_set")


class AcquisitionEventRecord(Base):
    """Persists `legal.events.AcquisitionEvent`. APPEND-ONLY: no update_*/
    delete_* helper exists in db_crud.py for this table. A correction is a
    new row with `supersedes_event_id` set."""

    __tablename__ = "acquisition_events"

    id = Column(String, primary_key=True, default=_uuid_hex)
    case_reference = Column(String, nullable=False, index=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    parcel_id = Column(String, ForeignKey("parcels.id", ondelete="SET NULL"), nullable=True, index=True)
    event_type = Column(String, nullable=False, index=True)
    applicable_act = Column(String, nullable=False, index=True)
    event_date = Column(Date, nullable=False)
    publication_date = Column(Date, nullable=True)
    source_type = Column(String, nullable=False)
    source_reference = Column(String, nullable=False)
    source_document_id = Column(String, nullable=True)
    confidence = Column(String, nullable=False)
    verified = Column(Boolean, nullable=False, default=False)
    verification_timestamp = Column(DateTime(timezone=True), nullable=True)
    supersedes_event_id = Column(String, ForeignKey("acquisition_events.id"), nullable=True)
    notes = Column(Text, nullable=False, default="")

    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False, index=True)


class CourtStayEventRecord(Base):
    """Persists `legal.stays.CourtStayEvent`. APPEND-ONLY."""

    __tablename__ = "court_stay_events"

    id = Column(String, primary_key=True, default=_uuid_hex)
    case_reference = Column(String, nullable=False, index=True)
    court = Column(String, nullable=False)
    order_date = Column(Date, nullable=False)
    effective_from = Column(Date, nullable=False)
    effective_to = Column(Date, nullable=True)  # null = ongoing / not yet lifted
    scope = Column(String, nullable=False)  # StayScope
    affected_parcels = Column(JSON, nullable=False, default=list)  # list[str]
    affected_stage = Column(String, nullable=True)
    source_document = Column(String, nullable=True)
    verification_status = Column(String, nullable=False)
    notes = Column(Text, nullable=False, default="")

    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)


class ExtensionEvidenceRecord(Base):
    """Persists `legal.extensions.ExtensionEvidence`. APPEND-ONLY."""

    __tablename__ = "extension_evidence"

    id = Column(String, primary_key=True, default=_uuid_hex)
    case_reference = Column(String, nullable=False, index=True)
    rule_set_id = Column(String, ForeignKey("rule_sets.id"), nullable=False, index=True)
    extension_order_id = Column(String, nullable=True)
    extension_date = Column(Date, nullable=True)
    authority = Column(String, nullable=True)
    reason = Column(Text, nullable=True)
    source_document = Column(String, nullable=True)
    effective_from = Column(Date, nullable=True)
    effective_to = Column(Date, nullable=True)
    verification_status = Column(String, nullable=False)
    notes = Column(Text, nullable=False, default="")

    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)


class EventConflictRecord(Base):
    """Persists `legal.conflicts.EventConflict`. Written whenever a clock
    computation encounters competing AcquisitionEvent records — a queryable
    record of the disagreement, not just a transient computation detail."""

    __tablename__ = "event_conflicts"

    id = Column(String, primary_key=True, default=_uuid_hex)
    case_reference = Column(String, nullable=False, index=True)
    event_type = Column(String, nullable=False)
    competing_event_ids = Column(JSON, nullable=False, default=list)  # list[str]
    notes = Column(Text, nullable=False, default="")

    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    clocks = relationship("StatutoryClockRecord", back_populates="event_conflict")


class StatutoryClockRecord(Base):
    """
    Persists `legal.clock_engine.StatutoryClockResult`. APPEND-ONLY, mirroring
    the existing `Prediction` table's philosophy (backend/models.py) — every
    computation is a new row, forming a history; there is no update path.
    """

    __tablename__ = "statutory_clocks"

    id = Column(String, primary_key=True, default=_uuid_hex)
    case_reference = Column(String, nullable=False, index=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    parcel_id = Column(String, ForeignKey("parcels.id", ondelete="SET NULL"), nullable=True, index=True)
    applicable_act = Column(String, nullable=False, index=True)
    section_reference = Column(String, nullable=False, index=True)
    rule_set_id = Column(String, ForeignKey("rule_sets.id"), nullable=False, index=True)
    rule_set_version = Column(String, nullable=False)

    trigger_event_id = Column(String, ForeignKey("acquisition_events.id"), nullable=True)
    trigger_date = Column(Date, nullable=True)
    statutory_period = Column(String, nullable=False)
    computed_deadline = Column(Date, nullable=True)

    extension_status = Column(String, nullable=False)
    extension_evidence_id = Column(String, ForeignKey("extension_evidence.id"), nullable=True)

    stay_adjustment_days = Column(Integer, nullable=False, default=0)
    adjusted_deadline = Column(Date, nullable=True)

    calculation_date = Column(Date, nullable=False)
    days_elapsed = Column(Integer, nullable=True)
    days_remaining = Column(Integer, nullable=True)

    clock_status = Column(String, nullable=False, index=True)
    consequence_class = Column(String, nullable=False)
    calculation_basis = Column(String, nullable=False)
    source_references = Column(JSON, nullable=False, default=list)  # list[str]

    event_conflict_id = Column(String, ForeignKey("event_conflicts.id"), nullable=True)

    calculated_at = Column(DateTime(timezone=True), nullable=False)
    calculation_version = Column(String, nullable=False)
    notes = Column(Text, nullable=False, default="")

    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False, index=True)

    rule_set = relationship("RuleSetRecord", back_populates="clocks")
    event_conflict = relationship("EventConflictRecord", back_populates="clocks")
