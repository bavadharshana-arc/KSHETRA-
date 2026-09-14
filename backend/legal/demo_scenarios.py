"""
Six ILLUSTRATIVE / SYNTHETIC DEMO scenarios exercising the clock engine.

Every AcquisitionEvent / CourtStayEvent / ExtensionEvidence built here uses
`source_type = SYNTHETIC_DEMO`. Gazette numbers, case references and dates
are fictional and shaped to be obviously placeholder data (e.g.
"SYN-GAZ-2024-0001"). NEVER present this data, or output computed from it, as
an actual government case — see docs/step6a-statutory-clock-audit.md §17 and
[[status-truthfulness]].

Used by both the test suite (test_clock_engine.py) and the optional DB seed
script (seed_demo_db.py), so the two can never silently drift apart.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import List, Optional

from .enums import ApplicableAct, ClockStatus, EventType, EvidenceVerificationStatus, SourceType, StayScope
from .events import AcquisitionEvent
from .extensions import ExtensionEvidence
from .rule_seed_data import (
    NHACT_3D_DECLARATION,
    RFCTLARR_S19_DECLARATION,
    RFCTLARR_S24_2_LEGACY_LAPSE_TEST,
    RFCTLARR_S25_AWARD,
)
from .rule_sets import RuleSet
from .stays import CourtStayEvent


@dataclass(frozen=True)
class DemoScenario:
    scenario_id: str
    title: str
    description: str
    case_reference: str
    project_id: Optional[str]
    parcel_id: Optional[str]
    rule: RuleSet
    events: List[AcquisitionEvent]
    stays: List[CourtStayEvent]
    extension: Optional[ExtensionEvidence]
    calculation_date: date
    is_legacy_1894: bool
    expected_clock_status: ClockStatus


def _verified_at(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


def scenario_1_rfctlarr_certain() -> DemoScenario:
    """RFCTLARR — a clean, single-source, verified S.11 notification well
    inside the S.19 12-month declaration window."""
    case_ref = "SYN-CASE-RFCTLARR-001"
    trigger_date = date(2024, 1, 10)
    event = AcquisitionEvent(
        event_id="SYN-EVT-001-S11",
        case_reference=case_ref,
        project_id=None,  # illustrative only: no fabricated FK to a nonexistent project row
        parcel_id=None,
        event_type=EventType.RFCTLARR_S11_PRELIMINARY_NOTIFICATION.value,
        applicable_act=ApplicableAct.RFCTLARR,
        event_date=trigger_date,
        publication_date=trigger_date,
        source_type=SourceType.SYNTHETIC_DEMO,
        source_reference="SYN-GAZ-2024-0001",
        source_document_id=None,
        confidence="HIGH",
        verified=True,
        verification_timestamp=_verified_at(trigger_date),
        notes="Illustrative/synthetic demo record.",
    )
    return DemoScenario(
        scenario_id="demo-1-rfctlarr-certain",
        title="RFCTLARR — certain clock",
        description="A single, verified, Gazette-style S.11 notification comfortably inside the "
        "S.19 12-month declaration window. ILLUSTRATIVE / SYNTHETIC DEMO.",
        case_reference=case_ref,
        project_id=None,  # illustrative only: no fabricated FK to a nonexistent project row
        parcel_id=None,
        rule=RFCTLARR_S19_DECLARATION,
        events=[event],
        stays=[],
        extension=None,
        calculation_date=date(2024, 4, 1),
        is_legacy_1894=False,
        expected_clock_status=ClockStatus.CLOCK_CERTAIN,
    )


def scenario_2_rfctlarr_extension_unverified() -> DemoScenario:
    """RFCTLARR — the S.25 award deadline has passed and an extension has
    been claimed, but the claim itself is not yet verified."""
    case_ref = "SYN-CASE-RFCTLARR-002"
    trigger_date = date(2023, 1, 1)
    event = AcquisitionEvent(
        event_id="SYN-EVT-002-S19",
        case_reference=case_ref,
        project_id=None,  # illustrative only: no fabricated FK to a nonexistent project row
        parcel_id=None,
        event_type=EventType.RFCTLARR_S19_DECLARATION.value,
        applicable_act=ApplicableAct.RFCTLARR,
        event_date=trigger_date,
        publication_date=trigger_date,
        source_type=SourceType.SYNTHETIC_DEMO,
        source_reference="SYN-GAZ-2023-0044",
        source_document_id=None,
        confidence="HIGH",
        verified=True,
        verification_timestamp=_verified_at(trigger_date),
    )
    extension = ExtensionEvidence(
        extension_id="SYN-EXT-002",
        case_reference=case_ref,
        rule_set_id=RFCTLARR_S25_AWARD.rule_set_id,
        extension_order_id="SYN-ORD-2024-011",
        extension_date=date(2024, 1, 5),
        authority="Appropriate Government (synthetic)",
        reason="Illustrative reason only.",
        source_document=None,
        effective_from=date(2024, 1, 5),
        effective_to=date(2024, 7, 5),
        verification_status=EvidenceVerificationStatus.CLAIMED,
        notes="Claimed but not yet checked against a written-reasons/web-publication record.",
    )
    return DemoScenario(
        scenario_id="demo-2-rfctlarr-extension-unverified",
        title="RFCTLARR — extension claimed but unverified",
        description="The S.25 12-month award deadline (from a 1-Jan-2023 declaration) has passed; "
        "an extension has been claimed but not verified. ILLUSTRATIVE / SYNTHETIC DEMO.",
        case_reference=case_ref,
        project_id=None,  # illustrative only: no fabricated FK to a nonexistent project row
        parcel_id=None,
        rule=RFCTLARR_S25_AWARD,
        events=[event],
        stays=[],
        extension=extension,
        calculation_date=date(2024, 3, 1),
        is_legacy_1894=False,
        expected_clock_status=ClockStatus.EXTENSION_UNVERIFIED,
    )


def scenario_3_rfctlarr_conflicting_evidence() -> DemoScenario:
    """RFCTLARR — two Gazette-sourced S.11 notification records for the same
    case disagree on the date; neither is individually more authoritative."""
    case_ref = "SYN-CASE-RFCTLARR-003"
    event_a = AcquisitionEvent(
        event_id="SYN-EVT-003-S11-A",
        case_reference=case_ref,
        project_id=None,  # illustrative only: no fabricated FK to a nonexistent project row
        parcel_id=None,
        event_type=EventType.RFCTLARR_S11_PRELIMINARY_NOTIFICATION.value,
        applicable_act=ApplicableAct.RFCTLARR,
        event_date=date(2024, 1, 10),
        publication_date=date(2024, 1, 10),
        source_type=SourceType.SYNTHETIC_DEMO,
        source_reference="SYN-GAZ-2024-0090-A",
        source_document_id=None,
        confidence="MEDIUM",
        verified=True,
        verification_timestamp=_verified_at(date(2024, 1, 10)),
    )
    event_b = AcquisitionEvent(
        event_id="SYN-EVT-003-S11-B",
        case_reference=case_ref,
        project_id=None,  # illustrative only: no fabricated FK to a nonexistent project row
        parcel_id=None,
        event_type=EventType.RFCTLARR_S11_PRELIMINARY_NOTIFICATION.value,
        applicable_act=ApplicableAct.RFCTLARR,
        event_date=date(2024, 1, 12),
        publication_date=date(2024, 1, 12),
        source_type=SourceType.SYNTHETIC_DEMO,
        source_reference="SYN-GAZ-2024-0090-B",
        source_document_id=None,
        confidence="MEDIUM",
        verified=True,
        verification_timestamp=_verified_at(date(2024, 1, 12)),
    )
    return DemoScenario(
        scenario_id="demo-3-rfctlarr-conflicting-evidence",
        title="RFCTLARR — conflicting evidence",
        description="Two same-authority-tier, differently-dated S.11 notification records for one "
        "case; the engine preserves both and reports CLOCK_UNCERTAIN rather than guessing. "
        "ILLUSTRATIVE / SYNTHETIC DEMO.",
        case_reference=case_ref,
        project_id=None,  # illustrative only: no fabricated FK to a nonexistent project row
        parcel_id=None,
        rule=RFCTLARR_S19_DECLARATION,
        events=[event_a, event_b],
        stays=[],
        extension=None,
        calculation_date=date(2024, 6, 1),
        is_legacy_1894=False,
        expected_clock_status=ClockStatus.CLOCK_UNCERTAIN,
    )


def scenario_4_nhact_valid_3a_3d_sequence() -> DemoScenario:
    """NH Act — a verified 3A notification, well inside the 1-year window to
    3D (a companion 3D event may be added by the DB seed layer; the pure
    clock here concerns the 3A->3D deadline itself)."""
    case_ref = "SYN-CASE-NHACT-004"
    trigger_date = date(2023, 2, 1)
    event = AcquisitionEvent(
        event_id="SYN-EVT-004-3A",
        case_reference=case_ref,
        project_id=None,  # illustrative only: no fabricated FK to a nonexistent project row
        parcel_id=None,
        event_type=EventType.NHACT_3A_NOTIFICATION.value,
        applicable_act=ApplicableAct.NH_ACT_1956,
        event_date=trigger_date,
        publication_date=trigger_date,
        source_type=SourceType.SYNTHETIC_DEMO,
        source_reference="SYN-SO-2023-0012",
        source_document_id=None,
        confidence="HIGH",
        verified=True,
        verification_timestamp=_verified_at(trigger_date),
    )
    return DemoScenario(
        scenario_id="demo-4-nhact-valid-3a-3d-sequence",
        title="NH Act — valid 3A -> 3D sequence",
        description="A verified 3A notification comfortably inside the 1-year window to 3D. "
        "ILLUSTRATIVE / SYNTHETIC DEMO.",
        case_reference=case_ref,
        project_id=None,  # illustrative only: no fabricated FK to a nonexistent project row
        parcel_id=None,
        rule=NHACT_3D_DECLARATION,
        events=[event],
        stays=[],
        extension=None,
        calculation_date=date(2023, 11, 15),
        is_legacy_1894=False,
        expected_clock_status=ClockStatus.CLOCK_CERTAIN,
    )


def scenario_5_nhact_approaching_limit() -> DemoScenario:
    """NH Act — a verified 3A notification with only days left before the
    1-year 3D declaration limit, and NO 3D on record yet."""
    case_ref = "SYN-CASE-NHACT-005"
    trigger_date = date(2023, 1, 15)
    event = AcquisitionEvent(
        event_id="SYN-EVT-005-3A",
        case_reference=case_ref,
        project_id=None,  # illustrative only: no fabricated FK to a nonexistent project row
        parcel_id=None,
        event_type=EventType.NHACT_3A_NOTIFICATION.value,
        applicable_act=ApplicableAct.NH_ACT_1956,
        event_date=trigger_date,
        publication_date=trigger_date,
        source_type=SourceType.SYNTHETIC_DEMO,
        source_reference="SYN-SO-2023-0004",
        source_document_id=None,
        confidence="HIGH",
        verified=True,
        verification_timestamp=_verified_at(trigger_date),
    )
    return DemoScenario(
        scenario_id="demo-5-nhact-approaching-limit",
        title="NH Act — 3A approaching statutory limit",
        description="A verified 3A notification with ~10 days left before the 1-year 3D deadline "
        "and no 3D on record; note NH Act 3D has no identified extension mechanism (see "
        "rule_seed_data.py NHACT_3D_DECLARATION). ILLUSTRATIVE / SYNTHETIC DEMO.",
        case_reference=case_ref,
        project_id=None,  # illustrative only: no fabricated FK to a nonexistent project row
        parcel_id=None,
        rule=NHACT_3D_DECLARATION,
        events=[event],
        stays=[],
        extension=None,
        calculation_date=date(2024, 1, 5),
        is_legacy_1894=False,
        expected_clock_status=ClockStatus.CLOCK_CERTAIN,  # still certain; consequence_class=CLOCK_AT_RISK
    )


def scenario_6_legacy_1894_uncertain() -> DemoScenario:
    """Legacy 1894 — a pre-2014 award, past the 5-year mark, with a verified
    but PROJECT-scoped court stay whose applicability to the S.24(2) test is
    itself legally unresolved (see RFCTLARR_S24_2_LEGACY_LAPSE_TEST's
    stay_definition). Deliberately does NOT resolve to a confident
    APPARENT_LAPSE."""
    case_ref = "SYN-CASE-LEGACY-006"
    trigger_date = date(2005, 3, 1)
    event = AcquisitionEvent(
        event_id="SYN-EVT-006-LA1894-AWARD",
        case_reference=case_ref,
        project_id=None,  # illustrative only: no fabricated FK to a nonexistent project row
        parcel_id=None,
        event_type=EventType.LA1894_S11_AWARD.value,
        applicable_act=ApplicableAct.LA_ACT_1894,
        event_date=trigger_date,
        publication_date=trigger_date,
        source_type=SourceType.SYNTHETIC_DEMO,
        source_reference="SYN-1894-AWARD-2005-017",
        source_document_id=None,
        confidence="MEDIUM",
        verified=True,
        verification_timestamp=_verified_at(trigger_date),
    )
    stay = CourtStayEvent(
        stay_id="SYN-STAY-006",
        case_reference=case_ref,
        court="Synthetic High Court (illustrative)",
        order_date=date(2010, 4, 1),
        effective_from=date(2010, 4, 1),
        effective_to=None,  # ongoing
        scope=StayScope.PROJECT,
        affected_parcels=(),
        affected_stage=None,
        source_document="SYN-COURT-ORDER-2010-004",
        verification_status=EvidenceVerificationStatus.VERIFIED,
        notes="Illustrative/synthetic demo record.",
    )
    return DemoScenario(
        scenario_id="demo-6-legacy-1894-uncertain",
        title="Legacy 1894 — uncertain legal state",
        description="A pre-2014 Land Acquisition Act, 1894 award, now well past the 5-year S.24(2) "
        "mark, with a verified, in-scope court stay whose effect on this specific rule is legally "
        "unresolved (case-law only, no express statutory stay-exclusion) and a duration whose "
        "governing interpretation was itself overruled once already (Indore Development Authority "
        "v. Manoharlal, 2020). Resolves to LEGACY_1894 (case routing) with consequence_class = "
        "LEGAL_STATUS_REQUIRES_VERIFICATION — never a confident APPARENT_LAPSE. "
        "ILLUSTRATIVE / SYNTHETIC DEMO.",
        case_reference=case_ref,
        project_id=None,  # illustrative only: no fabricated FK to a nonexistent project row
        parcel_id=None,
        rule=RFCTLARR_S24_2_LEGACY_LAPSE_TEST,
        events=[event],
        stays=[stay],
        extension=None,
        calculation_date=date(2024, 6, 1),
        is_legacy_1894=True,
        expected_clock_status=ClockStatus.LEGACY_1894,
    )


ALL_DEMO_SCENARIOS = (
    scenario_1_rfctlarr_certain(),
    scenario_2_rfctlarr_extension_unverified(),
    scenario_3_rfctlarr_conflicting_evidence(),
    scenario_4_nhact_valid_3a_3d_sequence(),
    scenario_5_nhact_approaching_limit(),
    scenario_6_legacy_1894_uncertain(),
)
