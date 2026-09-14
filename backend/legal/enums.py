"""
Shared vocabularies for the statutory clock engine. All plain `str` Enums so
they serialize as their literal values in JSON / DB text columns without a
custom encoder, and so tests can assert exact status strings per the Step 6B
brief ("For every test, assert the exact status").
"""

from __future__ import annotations

from enum import Enum


class ApplicableAct(str, Enum):
    """The three statutory families this engine keeps structurally separate.
    Never merged, never inferred from event shape — always supplied by case
    intake. See docs/step6a-statutory-clock-audit.md §1/§6."""

    RFCTLARR = "RFCTLARR"
    NH_ACT_1956 = "NH_ACT_1956"
    LA_ACT_1894 = "LA_ACT_1894"


class SourceType(str, Enum):
    OFFICIAL_GAZETTE = "OFFICIAL_GAZETTE"
    COURT_RECORD = "COURT_RECORD"
    GOVERNMENT_PORTAL = "GOVERNMENT_PORTAL"
    REGISTERED_RECORD = "REGISTERED_RECORD"
    FIELD_VERIFICATION = "FIELD_VERIFICATION"
    IMPORTED_SYSTEM = "IMPORTED_SYSTEM"
    MANUAL_ENTRY = "MANUAL_ENTRY"
    SYNTHETIC_DEMO = "SYNTHETIC_DEMO"


# Authority ranking used by conflicts.py's deterministic conflict resolution.
# Lower number = higher authority. Per docs/step6a-statutory-clock-audit.md §9:
# Official Gazette > Court Record > Government Portal > Registered Record >
# Field Verification > Imported System > Manual Entry > Synthetic Demo.
SOURCE_AUTHORITY_RANK = {
    SourceType.OFFICIAL_GAZETTE: 0,
    SourceType.COURT_RECORD: 1,
    SourceType.GOVERNMENT_PORTAL: 2,
    SourceType.REGISTERED_RECORD: 3,
    SourceType.FIELD_VERIFICATION: 4,
    SourceType.IMPORTED_SYSTEM: 5,
    SourceType.MANUAL_ENTRY: 6,
    SourceType.SYNTHETIC_DEMO: 7,
}


class RuleApprovalStatus(str, Enum):
    """Governance status of a RuleSet row — "has a human legal reviewer
    signed off on using this rule for a real determination." Per the Step 6B
    brief, every rule created from the Step 6A audit defaults to, and in this
    implementation universally remains, PENDING_LEGAL_REVIEW — see
    rule_seed_data.py's module docstring for why none are APPROVED yet."""

    DRAFT = "DRAFT"
    PENDING_LEGAL_REVIEW = "PENDING_LEGAL_REVIEW"
    APPROVED = "APPROVED"
    SUPERSEDED = "SUPERSEDED"


class LegalConfidence(str, Enum):
    """Fine-grained sourcing-quality marker for ONE SPECIFIC sub-part of a
    RuleSet (its duration, its extension mechanism, or its stay treatment) —
    deliberately independent of the RuleSet's own `approval_status`.

    This is what lets a single RuleSet correctly represent "the 12-month
    duration for this section was verbatim-confirmed against a primary-source
    reproduction (VERIFIED), but whether a court stay may pause it rests on
    contested case law, not express statutory text (UNVERIFIED)" — exactly
    the RFCTLARR Section 25 situation documented in
    docs/step6a-statutory-clock-audit.md §4. Only VERIFIED sub-parts may ever
    back a CLOCK_CERTAIN result or an applied stay/extension; everything else
    forces the clock engine toward CLOCK_UNCERTAIN / EXTENSION_UNVERIFIED
    rather than a fabricated deterministic result.
    """

    VERIFIED = "VERIFIED"
    PENDING_LEGAL_REVIEW = "PENDING_LEGAL_REVIEW"
    UNVERIFIED = "UNVERIFIED"
    NOT_APPLICABLE = "NOT_APPLICABLE"


class ClockStatus(str, Enum):
    """The six clock-status states from the Step 6A/6B brief. Exact
    transition rules live in clock_engine.py."""

    INSUFFICIENT_BASIS = "INSUFFICIENT_BASIS"
    CLOCK_CERTAIN = "CLOCK_CERTAIN"
    CLOCK_UNCERTAIN = "CLOCK_UNCERTAIN"
    EXTENSION_UNVERIFIED = "EXTENSION_UNVERIFIED"
    APPARENT_LAPSE = "APPARENT_LAPSE"
    LEGACY_1894 = "LEGACY_1894"


class ConsequenceClass(str, Enum):
    """What a clock's state means for a human reader, kept deliberately
    SEPARATE from `clock_status` (an evidentiary/computational state) so a
    high-severity clock_status can never silently read as a certified legal
    conclusion. See docs/step6a-statutory-clock-audit.md §12/§19."""

    PROCESS_DELAY = "PROCESS_DELAY"
    CLOCK_AT_RISK = "CLOCK_AT_RISK"
    CLOCK_EXPIRED = "CLOCK_EXPIRED"
    APPARENT_LAPSE = "APPARENT_LAPSE"
    LEGAL_STATUS_REQUIRES_VERIFICATION = "LEGAL_STATUS_REQUIRES_VERIFICATION"


class ExtensionStatus(str, Enum):
    EXTENSION_UNKNOWN = "EXTENSION_UNKNOWN"
    EXTENSION_CLAIMED = "EXTENSION_CLAIMED"
    EXTENSION_VERIFIED = "EXTENSION_VERIFIED"
    EXTENSION_REJECTED = "EXTENSION_REJECTED"


class EvidenceVerificationStatus(str, Enum):
    """Shared verification-state shape for individual pieces of case
    evidence — used by both ExtensionEvidence and CourtStayEvent, since both
    are "a claim that needs checking before it can affect a clock."""

    CLAIMED = "CLAIMED"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"
    UNVERIFIED = "UNVERIFIED"


class StayScope(str, Enum):
    PARCEL = "PARCEL"
    STAGE = "STAGE"
    PROJECT = "PROJECT"


class EventType(str, Enum):
    """Act-qualified acquisition-event types. Deliberately NOT a generic
    "NOTIFICATION"/"DECLARATION" type shared across Acts, and NEVER a paired
    label like the existing (UI-only) `LarrStage` value `'Declaration (Sec
    3D/19)'` — see docs/step6a-statutory-clock-audit.md §2/§7 and the Step 6B
    brief's explicit "Do NOT use ... inside the legal engine" instruction.
    """

    # --- RFCTLARR, 2013 ---
    RFCTLARR_S11_PRELIMINARY_NOTIFICATION = "RFCTLARR_S11_PRELIMINARY_NOTIFICATION"
    RFCTLARR_S15_OBJECTIONS_FILED = "RFCTLARR_S15_OBJECTIONS_FILED"
    RFCTLARR_S15_OBJECTIONS_DECIDED = "RFCTLARR_S15_OBJECTIONS_DECIDED"
    RFCTLARR_S19_DECLARATION = "RFCTLARR_S19_DECLARATION"
    RFCTLARR_S25_AWARD = "RFCTLARR_S25_AWARD"
    # The pre-2014 (Land Acquisition Act, 1894) award date that RFCTLARR
    # Section 24 routes on — deliberately its own event type, never conflated
    # with RFCTLARR_S25_AWARD (a different Act, different legal consequence).
    LA1894_S11_AWARD = "LA1894_S11_AWARD"
    RFCTLARR_S14_SIA_EXPERT_GROUP_VIEWS = "RFCTLARR_S14_SIA_EXPERT_GROUP_VIEWS"

    # --- National Highways Act, 1956 ---
    NHACT_3A_NOTIFICATION = "NHACT_3A_NOTIFICATION"
    NHACT_3C_OBJECTION = "NHACT_3C_OBJECTION"
    NHACT_3D_DECLARATION = "NHACT_3D_DECLARATION"
    NHACT_3E_POSSESSION_NOTICE = "NHACT_3E_POSSESSION_NOTICE"

    # --- Shared / cross-Act evidentiary events ---
    COMPENSATION_PAID_OR_TENDERED = "COMPENSATION_PAID_OR_TENDERED"
    POSSESSION_TAKEN = "POSSESSION_TAKEN"
    WITHDRAWAL = "WITHDRAWAL"
    CORRECTION_REPUBLICATION = "CORRECTION_REPUBLICATION"
