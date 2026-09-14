"""
AcquisitionEvent — the provenance-carrying, append-only event record the rest
of the engine is built on. See docs/step6a-statutory-clock-audit.md §7/§8.

Pure Python, no database dependency (that's db_models.py). Events are plain
immutable dataclasses; "append-only" is enforced by convention here (nothing
in this module mutates an existing event) and by the database layer's CRUD
surface (db_crud.py exposes no update/delete for this table).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional

from .enums import ApplicableAct, SourceType


@dataclass(frozen=True)
class AcquisitionEvent:
    event_id: str
    case_reference: str
    project_id: Optional[str]
    parcel_id: Optional[str]
    event_type: str  # an EventType value, kept as str for forward-compatibility
    applicable_act: ApplicableAct
    event_date: date
    publication_date: Optional[date]
    source_type: SourceType
    source_reference: str
    source_document_id: Optional[str]
    confidence: str  # 'HIGH' | 'MEDIUM' | 'LOW'
    verified: bool
    verification_timestamp: Optional[datetime]
    supersedes_event_id: Optional[str] = None
    notes: str = ""

    def __post_init__(self) -> None:
        if self.event_date is None:
            raise ValueError(f"AcquisitionEvent {self.event_id}: event_date is required")


def active_events(events: "list[AcquisitionEvent]") -> "list[AcquisitionEvent]":
    """
    Events not superseded by a later correction. Superseding NEVER deletes or
    mutates the original record (§8 of the audit: "corrections create new
    records; do not overwrite historical evidence") — this just filters which
    records are eligible to drive a *current* computation; the superseded
    record remains queryable for history/audit purposes by any caller that
    wants the full list.
    """
    superseded_ids = {e.supersedes_event_id for e in events if e.supersedes_event_id}
    return [e for e in events if e.event_id not in superseded_ids]
