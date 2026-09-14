"""
Six ILLUSTRATIVE / SYNTHETIC DEMO scenarios exercising the blocker engine.
Mirrors legal/demo_scenarios.py's discipline: every event/evidence input is
clearly synthetic (obviously-placeholder IDs, `SourceType.SYNTHETIC_DEMO`
where the underlying legal engine is exercised), and this data must NEVER be
presented as a real government case -- see docs/step7a-blocker-engine-audit.md
Section T and [[status-truthfulness]].

Scenario A and E exercise the REAL Step 6B legal engine
(`legal.clock_engine.compute_statutory_clock`) end to end, rather than
fabricating a `StatutoryClockResult` by hand -- this is the most direct proof
that B1 is genuinely compatible with, and never duplicates, the Step 6B
clock engine.

Used by the test suite (tests/test_demo_scenarios.py); not wired to any
database by this module. Deliberately not persisted into the shared
`kshetra.db` by a seed script (unlike legal/seed_demo_db.py): these
scenarios' `parcel_id`s are illustrative-only and do not correspond to real
`parcels` rows, and `blockers.parcel_id` IS a real, FK-enforced column
(unlike legal/db_models.py's nullable-and-permissive event tables) -- writing
them in would violate referential integrity. The real persistence path for
genuine data is `db_crud.evaluate_and_persist_for_parcel`, which reads an
actual `Parcel` row. See docs/step7b-blocker-engine-implementation-report.md
Section N for this deliberate choice.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Dict, Optional, Tuple

from legal.clock_engine import StatutoryClockResult, compute_statutory_clock
from legal.enums import ApplicableAct, EventType, SourceType
from legal.events import AcquisitionEvent
from legal.rule_seed_data import RFCTLARR_S25_AWARD
from legal.demo_scenarios import scenario_5_nhact_approaching_limit
from legal.stays import CourtStayEvent

from .enums import BlockerStatus, BlockerType
from .evidence import ParcelEvidenceInput

_SCENARIO_A = scenario_5_nhact_approaching_limit()


@dataclass(frozen=True)
class DemoScenario:
    scenario_id: str
    title: str
    description: str
    case_reference: str
    calculation_date: date
    clocks: Tuple[StatutoryClockResult, ...]
    parcels: Tuple[ParcelEvidenceInput, ...]
    court_stays_by_parcel_id: Dict[str, CourtStayEvent]
    secondary_ownership_observations: Dict[str, str]  # parcel_id -> secondary observation (B2 conflict input)
    expected_blocker_types: Tuple[BlockerType, ...]
    expected_primary_type: Optional[BlockerType]
    expected_primary_status: Optional[BlockerStatus]
    expected_owner_role_contains: Optional[str]
    expected_action_category: Optional[str]


def _verified_at(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


def scenario_a_b1_statutory_exposure() -> DemoScenario:
    """A -- B1 only, statutory deadline approaching. Reuses Step 6B's own
    demo scenario 5 (NH Act 3A notification, ~10 days left before the 1-year
    3D deadline, no 3D on record) computed through the REAL clock engine."""
    clock = compute_statutory_clock(
        clock_id="SYN-BLK-CLOCK-A",
        case_reference=_SCENARIO_A.case_reference,
        project_id=_SCENARIO_A.project_id,
        parcel_id=_SCENARIO_A.parcel_id,
        rule=_SCENARIO_A.rule,
        events=_SCENARIO_A.events,
        stays=_SCENARIO_A.stays,
        extension=_SCENARIO_A.extension,
        calculation_date=_SCENARIO_A.calculation_date,
        is_legacy_1894=_SCENARIO_A.is_legacy_1894,
    )
    return DemoScenario(
        scenario_id="blk-demo-a-b1-statutory-exposure",
        title="B1 -- statutory clock exposure",
        description=(
            "A verified NH Act 3A notification with ~10 days left before the 1-year 3D declaration "
            "deadline and no 3D on record (Step 6B demo scenario 5, computed through the real clock "
            "engine). No title/compensation/possession evidence on file. ILLUSTRATIVE / SYNTHETIC DEMO."
        ),
        case_reference=_SCENARIO_A.case_reference,
        calculation_date=_SCENARIO_A.calculation_date,
        clocks=(clock,),
        parcels=(),
        court_stays_by_parcel_id={},
        secondary_ownership_observations={},
        expected_blocker_types=(BlockerType.B1,),
        expected_primary_type=BlockerType.B1,
        expected_primary_status=BlockerStatus.DETECTED,
        expected_owner_role_contains="Collector",
        expected_action_category="Expedite Statutory Milestone",
    )


def scenario_b_b2_record_friction() -> DemoScenario:
    """B -- B2 possible record friction. Deliberately does NOT reach
    CONFIRMED -- demonstrates Data Gap row B2-1
    (docs/step7a-blocker-engine-audit.md Section U): no provenance-carrying
    title evidence entity exists yet, so three independently-agreeing bare
    Parcel fields cap out at DETECTED."""
    case_ref = "SYN-CASE-BLK-002"
    parcel = ParcelEvidenceInput(
        case_reference=case_ref,
        project_id=None,
        parcel_id="SYN-P-BLK-002",
        survey_number="SYN-SY-002/1",
        area_acres=1.2,
        ownership_dispute="Yes - Partition Suit",
        document_status="Disputed",
        mutation_status="Disputed",
        record_confidence="Medium",
        encumbrance_status=None,
    )
    return DemoScenario(
        scenario_id="blk-demo-b-b2-record-friction",
        title="B2 -- possible record friction (not verified title conflict)",
        description=(
            "ownershipDispute='Yes - Partition Suit', documentStatus='Disputed', "
            "mutationStatus='Disputed' all on record for one synthetic parcel -- three independent "
            "existing fields agreeing. Deliberately stops at DETECTED, not CONFIRMED, per Data Gap "
            "row B2-1. ILLUSTRATIVE / SYNTHETIC DEMO."
        ),
        case_reference=case_ref,
        calculation_date=date(2024, 6, 1),
        clocks=(),
        parcels=(parcel,),
        court_stays_by_parcel_id={},
        secondary_ownership_observations={},
        expected_blocker_types=(BlockerType.B2,),
        expected_primary_type=BlockerType.B2,
        expected_primary_status=BlockerStatus.DETECTED,
        expected_owner_role_contains="Revenue",
        expected_action_category="Legal Verification",
    )


def scenario_c_b3_compensation_dispute() -> DemoScenario:
    """C -- B3 contested compensation."""
    case_ref = "SYN-CASE-BLK-003"
    parcel = ParcelEvidenceInput(
        case_reference=case_ref,
        project_id=None,
        parcel_id="SYN-P-BLK-003",
        survey_number="SYN-SY-003/1",
        area_acres=0.8,
        compensation_status="Under Dispute in LA-RA Authority",
        court_case=True,
        court_case_status="Active - Stay Order",
        interim_injunction=None,
    )
    return DemoScenario(
        scenario_id="blk-demo-c-b3-compensation-dispute",
        title="B3 -- contested compensation",
        description=(
            "compensationStatus='Under Dispute in LA-RA Authority' with a corroborating active court "
            "case on record. ILLUSTRATIVE / SYNTHETIC DEMO."
        ),
        case_reference=case_ref,
        calculation_date=date(2024, 6, 1),
        clocks=(),
        parcels=(parcel,),
        court_stays_by_parcel_id={},
        secondary_ownership_observations={},
        expected_blocker_types=(BlockerType.B3,),
        expected_primary_type=BlockerType.B3,
        expected_primary_status=BlockerStatus.DETECTED,
        expected_owner_role_contains="Compensation Authority",
        expected_action_category="Collector Hearing",
    )


def scenario_d_b4_possession_obstruction() -> DemoScenario:
    """D -- B4 possession obstruction. Owner is deliberately NOT
    single-valued: evidence spans both a field finding and a court
    restraint (docs/step7a-blocker-engine-audit.md Section F)."""
    case_ref = "SYN-CASE-BLK-004"
    parcel = ParcelEvidenceInput(
        case_reference=case_ref,
        project_id=None,
        parcel_id="SYN-P-BLK-004",
        survey_number="SYN-SY-004/1",
        area_acres=0.5,
        possession_status="Pending",
        field_verified=True,
        field_verification_notes=(
            "Field survey observed an unauthorized structure/encroachment near the boundary pillar; "
            "possession cannot currently be effected."
        ),
        evidence_photo_attached=True,
        field_verified_at="12-Jan-2024",
        court_case_status="Active - Stay Order",
        interim_injunction=True,
    )
    return DemoScenario(
        scenario_id="blk-demo-d-b4-possession-obstruction",
        title="B4 -- possession-blocking encumbrance",
        description=(
            "Field-verified physical obstruction (photo attached) plus an active court case with an "
            "interim injunction -- evidence spans two owner candidates (field team + legal desk). "
            "ILLUSTRATIVE / SYNTHETIC DEMO."
        ),
        case_reference=case_ref,
        calculation_date=date(2024, 6, 1),
        clocks=(),
        parcels=(parcel,),
        court_stays_by_parcel_id={},
        secondary_ownership_observations={},
        expected_blocker_types=(BlockerType.B4,),
        expected_primary_type=BlockerType.B4,
        expected_primary_status=BlockerStatus.DETECTED,
        expected_owner_role_contains="Field Team",
        expected_action_category="Field Geo-Survey",
    )


def scenario_e_multiple_blockers() -> DemoScenario:
    """E -- multiple blockers, one primary + secondaries, ranking computed
    transparently (not type-ordered). A real RFCTLARR S.25 clock is driven
    to APPARENT_LAPSE (no extension claimed at all -> EXTENSION_UNKNOWN ->
    the deadline-passed-with-no-extension branch) so B1 reaches CONFIRMED/
    CRITICAL -- which legitimately outranks the two DETECTED/HIGH B2/B3
    blockers on BOTH severity and confidence, proving the ranking is
    evidence-driven rather than a hardcoded B1>B2>B3>B4."""
    case_ref = "SYN-CASE-BLK-005"
    trigger_date = date(2022, 1, 1)
    declaration_event = AcquisitionEvent(
        event_id="SYN-BLK-EVT-005-S19",
        case_reference=case_ref,
        project_id=None,
        parcel_id=None,
        event_type=EventType.RFCTLARR_S19_DECLARATION.value,
        applicable_act=ApplicableAct.RFCTLARR,
        event_date=trigger_date,
        publication_date=trigger_date,
        source_type=SourceType.SYNTHETIC_DEMO,
        source_reference="SYN-BLK-GAZ-2022-0050",
        source_document_id=None,
        confidence="HIGH",
        verified=True,
        verification_timestamp=_verified_at(trigger_date),
        notes="Illustrative/synthetic demo record.",
    )
    calculation_date = date(2024, 6, 1)  # ~2.4 years after a 12-month S.25 award deadline; no extension claimed
    clock = compute_statutory_clock(
        clock_id="SYN-BLK-CLOCK-E",
        case_reference=case_ref,
        project_id=None,
        parcel_id=None,
        rule=RFCTLARR_S25_AWARD,
        events=[declaration_event],
        stays=[],
        extension=None,
        calculation_date=calculation_date,
    )

    parcel = ParcelEvidenceInput(
        case_reference=case_ref,
        project_id=None,
        parcel_id="SYN-P-BLK-005",
        survey_number="SYN-SY-005/1",
        area_acres=2.0,
        ownership_dispute="Yes - Boundary Dispute",
        document_status="Disputed",
        mutation_status=None,
        record_confidence="Medium",
        encumbrance_status=None,
        compensation_status="Under Dispute in LA-RA Authority",
        court_case=None,
    )
    return DemoScenario(
        scenario_id="blk-demo-e-multiple-blockers",
        title="Multiple blockers -- one primary + secondaries",
        description=(
            "A real RFCTLARR S.25 clock resolves to APPARENT_LAPSE (B1 CONFIRMED/CRITICAL) on the same "
            "case as a parcel carrying both title-friction (B2 DETECTED/HIGH) and compensation-dispute "
            "(B3 DETECTED/HIGH) evidence. B1 legitimately ranks primary on severity AND confidence, not "
            "blocker-type order. ILLUSTRATIVE / SYNTHETIC DEMO."
        ),
        case_reference=case_ref,
        calculation_date=calculation_date,
        clocks=(clock,),
        parcels=(parcel,),
        court_stays_by_parcel_id={},
        secondary_ownership_observations={},
        expected_blocker_types=(BlockerType.B1, BlockerType.B2, BlockerType.B3),
        expected_primary_type=BlockerType.B1,
        expected_primary_status=BlockerStatus.CONFIRMED,
        expected_owner_role_contains="Collector",
        expected_action_category="Collector Hearing",
    )


def scenario_f_conflicting_insufficient_evidence() -> DemoScenario:
    """F -- conflicting / insufficient evidence, on two distinct synthetic
    parcels within the same case: one parcel demonstrates
    INSUFFICIENT_EVIDENCE (all fields present but ambiguous, e.g. 'Pending
    Verification'), the other demonstrates CONFLICTED (two independently-
    obtained, same-authority-tier ownership readings disagree). Primary
    selection is expected to be withheld -- see ranking.py's explicit
    "no confidently primary blocker" behavior."""
    case_ref = "SYN-CASE-BLK-006"
    insufficient_parcel = ParcelEvidenceInput(
        case_reference=case_ref,
        project_id=None,
        parcel_id="SYN-P-BLK-006-A",
        survey_number="SYN-SY-006A/1",
        area_acres=1.0,
        ownership_dispute="No",
        document_status="Pending Verification",
        mutation_status="Pending Verification",
        record_confidence="Low",
        encumbrance_status="Clear",
    )
    conflicted_parcel = ParcelEvidenceInput(
        case_reference=case_ref,
        project_id=None,
        parcel_id="SYN-P-BLK-006-B",
        survey_number="SYN-SY-006B/1",
        area_acres=1.0,
        ownership_dispute="No",
        document_status=None,
        mutation_status=None,
        record_confidence="Medium",
        encumbrance_status=None,
    )
    return DemoScenario(
        scenario_id="blk-demo-f-conflicting-insufficient-evidence",
        title="Conflicting / insufficient evidence -- no confident primary",
        description=(
            "Parcel A: all title/record fields present but ambiguous (Pending Verification), "
            "recordConfidence Low -> B2 INSUFFICIENT_EVIDENCE. Parcel B: primary record says "
            "ownershipDispute='No' but an independently-obtained secondary observation disagrees "
            "(same authority tier, neither preferred) -> B2 CONFLICTED. No blocker is eligible for "
            "primary; the engine reports this explicitly rather than guessing. "
            "ILLUSTRATIVE / SYNTHETIC DEMO."
        ),
        case_reference=case_ref,
        calculation_date=date(2024, 6, 1),
        clocks=(),
        parcels=(insufficient_parcel, conflicted_parcel),
        court_stays_by_parcel_id={},
        secondary_ownership_observations={"SYN-P-BLK-006-B": "Yes - Boundary Dispute"},
        expected_blocker_types=(BlockerType.B2, BlockerType.B2),
        expected_primary_type=None,
        expected_primary_status=None,
        expected_owner_role_contains=None,
        expected_action_category="Legal Verification",
    )


def run_scenario(scenario: DemoScenario):
    """Runs one DemoScenario through the real `engine.evaluate_case`
    orchestrator. Imported lazily to avoid a demo_scenarios<->engine import
    cycle at module load time (engine.py does not depend on demo_scenarios.py)."""
    from .engine import evaluate_case

    return evaluate_case(
        case_reference=scenario.case_reference,
        calculation_date=scenario.calculation_date,
        clocks=scenario.clocks,
        parcels=scenario.parcels,
        court_stays_by_parcel_id=scenario.court_stays_by_parcel_id,
        secondary_ownership_observations=scenario.secondary_ownership_observations,
    )


ALL_DEMO_SCENARIOS = (
    scenario_a_b1_statutory_exposure(),
    scenario_b_b2_record_friction(),
    scenario_c_b3_compensation_dispute(),
    scenario_d_b4_possession_obstruction(),
    scenario_e_multiple_blockers(),
    scenario_f_conflicting_insufficient_evidence(),
)
