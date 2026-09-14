"""
Evidence-construction helpers + the pure engine's own Parcel-shaped input
contract.

`ParcelEvidenceInput` is deliberately NOT `backend.models.Parcel` (the
SQLAlchemy ORM row) or `src/types/index.ts` `Parcel` -- it is this package's
own minimal, decoupled input shape. Nothing in `blockers/` imports
SQLAlchemy or backend.models; the persistence layer (db_crud.py) is
responsible for mapping a real Parcel row onto this dataclass before calling
detection.py. This keeps the pure engine testable with plain Python objects
and keeps the one-way dependency direction honest (blockers/ never reaches
into backend.models internals it doesn't need).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional

from .enums import EvidenceRelation, EvidenceType, EvidenceVerificationStatus, SourceType


def new_id(prefix: str) -> str:
    """Server-generated identifier for a newly-invented entity (Blocker,
    BlockerEvidence, BlockerConflict, ActionRecommendation) -- mirrors the
    `_uuid_hex()` convention already used by backend/models.py and
    backend/legal/db_models.py for entities with no prior human-readable ID
    scheme to preserve."""
    return f"{prefix}-{uuid.uuid4().hex}"


@dataclass(frozen=True)
class ParcelEvidenceInput:
    """The pure B2/B3/B4 detectors' entire view of one parcel. Every field
    is Optional[...] and defaults to None -- an unpopulated field is real,
    distinguishable information (drives NO_EVIDENCE outcomes), never
    silently coerced to a "clean" default. Field names/domains mirror
    `src/types/index.ts` `Parcel` (see docs/step7a-blocker-engine-audit.md
    Sections D/E/F for the audited domain of each)."""

    case_reference: str
    project_id: Optional[str] = None
    parcel_id: Optional[str] = None
    survey_number: Optional[str] = None
    area_acres: Optional[float] = None

    # --- B2: title & record friction ---
    ownership_dispute: Optional[str] = None  # 'Yes - ...' | 'No'
    document_status: Optional[str] = None  # 'Verified'|'Pending Verification'|'Disputed'|'Missing Documents'
    mutation_status: Optional[str] = None  # 'Up-to-date'|'Pending Verification'|'Disputed'|'Stale'
    record_confidence: Optional[str] = None  # 'Low'|'Medium'|'High'
    encumbrance_status: Optional[str] = None  # 'Clear'|'Encumbered'|'Mortgaged to Co-op Bank'|'Pending Partition'

    # --- B3: contested compensation / R&R ---
    compensation_status: Optional[str] = None  # 'Pending'|'Determined'|'Disbursed 40%'|
    # 'Under Dispute in LA-RA Authority'|'Disbursed 100%'

    # --- B4: possession-blocking encumbrance ---
    possession_status: Optional[str] = None  # 'Pending'|'Partial'|'Complete'|'Not Started'
    field_verified: Optional[bool] = None
    field_verification_notes: Optional[str] = None
    evidence_photo_attached: Optional[bool] = None
    field_verified_at: Optional[str] = None  # display string, per Parcel.fieldVerifiedAt
    environmental_zone: Optional[str] = None  # 'None'|'Buffer Zone'|'CRZ'|'Forest Border'
    water_body_adjacent: Optional[bool] = None

    # --- shared litigation signal (weak; feeds B3 corroboration + B4) ---
    court_case: Optional[bool] = None
    court_case_status: Optional[str] = None  # 'Active - Stay Order'|'Pending Hearing'|'Disposed'|'None'
    interim_injunction: Optional[bool] = None


def source_type_from_calculation_basis(basis: str) -> Optional[SourceType]:
    """`StatutoryClockResult.calculation_basis` is sometimes literally a
    `SourceType` value (clock_engine.py sets it to
    `trigger_event.source_type.value` for CLOCK_CERTAIN/EXTENSION_APPLIED/
    APPARENT_LAPSE results) and sometimes an opaque reason string like
    "RULE_NOT_SUFFICIENTLY_VERIFIED" or "UNRESOLVED_CONFLICT" (for
    CLOCK_UNCERTAIN results, where there is no trustworthy single source to
    name). This never guesses -- it returns None rather than a wrong
    SourceType when `basis` isn't one."""
    try:
        return SourceType(basis)
    except ValueError:
        return None


def clock_evidence(
    *,
    evidence_id: str,
    clock_id: str,
    clock_status: str,
    consequence_class: str,
    days_remaining: Optional[int],
    adjusted_deadline: Optional[date],
    calculation_basis: str,
    notes: str,
) -> "BlockerEvidence":  # noqa: F821 -- imported lazily to avoid a models<->evidence cycle
    """Builds the single BlockerEvidence row backing a B1 blocker,
    citing the StatutoryClock row directly rather than re-deriving anything
    about it."""
    from .models import BlockerEvidence  # local import: models.py doesn't need evidence.py

    source_type = source_type_from_calculation_basis(calculation_basis)
    verification_status = (
        EvidenceVerificationStatus.VERIFIED
        if source_type is not None
        else EvidenceVerificationStatus.UNVERIFIED
    )
    description = (
        f"Statutory clock {clock_id}: status={clock_status}, "
        f"consequence={consequence_class}, "
        f"days_remaining={days_remaining if days_remaining is not None else 'unknown'}, "
        f"adjusted_deadline={adjusted_deadline.isoformat() if adjusted_deadline else 'unknown'}."
    )
    if notes:
        description = f"{description} {notes}"
    return BlockerEvidence(
        evidence_id=evidence_id,
        evidence_type=EvidenceType.STATUTORY_CLOCK,
        source_ref_type="statutory_clocks",
        source_ref_id=clock_id,
        source_type=source_type,
        verification_status=verification_status,
        description=description,
        relation=EvidenceRelation.SUPPORTS,
        observed_at=None,
        recorded_at=None,
        notes=calculation_basis,
    )


def parcel_field_evidence(
    *,
    evidence_id: str,
    parcel_id: Optional[str],
    field_name: str,
    field_value: object,
    description: str,
    relation: "EvidenceRelation" = EvidenceRelation.SUPPORTS,
) -> "BlockerEvidence":  # noqa: F821
    """Generic constructor for evidence sourced from a bare `Parcel` status
    field (ownershipDispute, documentStatus, mutationStatus,
    encumbranceStatus, compensationStatus, possessionStatus,
    courtCaseStatus/interimInjunction). Always tagged
    `SourceType.IMPORTED_SYSTEM` (rank 5 of 8) and
    `EvidenceVerificationStatus.UNVERIFIED` -- per
    docs/step7a-blocker-engine-audit.md Sections D/E/F, these fields carry
    no `source_type`/`verified`/timestamp of their own, so this is an
    honest self-description, not a placeholder to be tightened later
    without a real provenance entity behind it."""
    from .models import BlockerEvidence

    return BlockerEvidence(
        evidence_id=evidence_id,
        evidence_type=EvidenceType.PARCEL_FIELD,
        source_ref_type="parcels",
        source_ref_id=f"{parcel_id or '(unscoped)'}.{field_name}",
        source_type=SourceType.IMPORTED_SYSTEM,
        verification_status=EvidenceVerificationStatus.UNVERIFIED,
        description=description,
        relation=relation,
        observed_at=None,
        recorded_at=None,
        notes=f"{field_name}={field_value!r}",
    )


def field_verification_evidence(
    *,
    evidence_id: str,
    parcel_id: Optional[str],
    notes_text: str,
    photo_attached: Optional[bool],
    verified_at_display: Optional[str],
    description: str,
    relation: "EvidenceRelation" = EvidenceRelation.SUPPORTS,
) -> "BlockerEvidence":  # noqa: F821
    """Field-verification evidence -- the closest thing to real provenance
    on the existing `Parcel` schema (has a verification-style boolean and a
    timestamp): `SourceType.FIELD_VERIFICATION` (rank 4), `VERIFIED`."""
    from .models import BlockerEvidence

    photo_note = " Photographic evidence attached." if photo_attached else ""
    return BlockerEvidence(
        evidence_id=evidence_id,
        evidence_type=EvidenceType.FIELD_VERIFICATION,
        source_ref_type="parcels",
        source_ref_id=f"{parcel_id or '(unscoped)'}.fieldVerificationNotes",
        source_type=SourceType.FIELD_VERIFICATION,
        verification_status=EvidenceVerificationStatus.VERIFIED,
        description=f"{description}{photo_note}",
        relation=relation,
        observed_at=None,
        recorded_at=None,
        notes=f"fieldVerifiedAt={verified_at_display!r}; raw_notes={notes_text!r}",
    )


def court_stay_evidence(
    *,
    evidence_id: str,
    stay: "object",  # legal.stays.CourtStayEvent -- typed loosely to avoid a hard
    # import cycle at module load time; detection.py passes the real type.
    description: str,
    relation: "EvidenceRelation" = EvidenceRelation.SUPPORTS,
) -> "BlockerEvidence":  # noqa: F821
    """Evidence sourced from a real `legal.stays.CourtStayEvent` -- reuses
    that entity's own `verification_status` directly (never re-derives or
    re-verifies it), per docs/step7a-blocker-engine-audit.md Section F's
    recommendation to prefer the legal engine's structured `StayScope` over
    parsing `Parcel.courtRecord` prose."""
    from .models import BlockerEvidence

    return BlockerEvidence(
        evidence_id=evidence_id,
        evidence_type=EvidenceType.COURT_STAY_EVENT,
        source_ref_type="court_stay_events",
        source_ref_id=stay.stay_id,
        source_type=SourceType.COURT_RECORD,
        verification_status=stay.verification_status,
        description=description,
        relation=relation,
        observed_at=stay.order_date,
        recorded_at=None,
        notes=stay.notes,
    )
