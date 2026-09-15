"""
Eight ILLUSTRATIVE / SYNTHETIC DEMO scenarios exercising the exposure/
priority engine end to end. Mirrors `blockers/demo_scenarios.py`'s own
discipline: every clock/parcel input is clearly synthetic
(obviously-placeholder IDs), and this data must NEVER be presented as a real
government case -- see [[status-truthfulness]].

Every scenario runs the REAL, UNMODIFIED blocker engine
(`blockers.engine.evaluate_case`) over hand-built `StatutoryClockResult`/
`ParcelEvidenceInput` inputs -- this package never fabricates a `Blocker` row
directly, so every scenario is proof that exposure builds on top of the
existing B1-B4 engine rather than re-implementing any part of it. The
resulting ranked blocker set is then fed into `exposure.engine.assess_case`
exactly as the persistence layer (`db_crud.py`) would for a real case.

Not persisted into `kshetra.db` by this module (same reasoning as
`blockers/demo_scenarios.py`'s own module docstring: these `parcel_id`s are
illustrative-only and would violate the real, FK-enforced `parcels` table).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Optional, Sequence, Tuple

from blockers.engine import evaluate_case
from blockers.evidence import ParcelEvidenceInput
from blockers.models import Blocker
from legal.clock_engine import StatutoryClockResult
from legal.enums import ApplicableAct, ClockStatus, ConsequenceClass, ExtensionStatus

from .engine import assess_case
from .enums import ConfidenceLabel, ExposureBand, PriorityBand
from .models import ExposureAssessment

_CALC_DATE = date(2026, 9, 15)  # fixed "as of" date -- deterministic, never wall-clock
_CALC_AT = datetime(2026, 9, 15, 12, 0, 0, tzinfo=timezone.utc)


def _clock(
    *,
    clock_id: str,
    case_reference: str,
    project_id: Optional[str],
    parcel_id: Optional[str],
    days_remaining: Optional[int],
    clock_status: ClockStatus,
    consequence_class: ConsequenceClass,
    calculation_basis: str = "SYNTHETIC_DEMO",
    extension_status: ExtensionStatus = ExtensionStatus.EXTENSION_UNKNOWN,
    notes: str = "",
) -> StatutoryClockResult:
    return StatutoryClockResult(
        clock_id=clock_id,
        case_reference=case_reference,
        project_id=project_id,
        parcel_id=parcel_id,
        applicable_act=ApplicableAct.RFCTLARR,
        section_reference="RFCTLARR_S25_AWARD",
        rule_set_id="RS-DEMO",
        rule_set_version="1.0.0",
        trigger_event_id="EVT-DEMO",
        trigger_date=date(2025, 1, 1),
        statutory_period="12 months",
        computed_deadline=date(2026, 1, 1),
        extension_status=extension_status,
        extension_evidence_id=None,
        stay_adjustment_days=0,
        adjusted_deadline=date(2026, 1, 1),
        calculation_date=_CALC_DATE,
        days_elapsed=365,
        days_remaining=days_remaining,
        clock_status=clock_status,
        consequence_class=consequence_class,
        calculation_basis=calculation_basis,
        source_references=["SYN-DEMO-REF"],
        calculated_at=_CALC_AT,
        calculation_version="kshetra-legal-clock-engine-1.0.0",
        notes=notes,
    )


def _parcel(
    *,
    case_reference: str,
    project_id: Optional[str],
    parcel_id: Optional[str],
    area_acres: float = 2.0,
    **kwargs,
) -> ParcelEvidenceInput:
    return ParcelEvidenceInput(
        case_reference=case_reference, project_id=project_id, parcel_id=parcel_id, area_acres=area_acres, **kwargs
    )


@dataclass(frozen=True)
class DemoScenario:
    scenario_id: str
    title: str
    description: str
    blockers: Tuple[Blocker, ...]
    assessment: Optional[ExposureAssessment]
    expected_exposure_band: Optional[ExposureBand]
    expected_priority_band: Optional[PriorityBand]
    expected_confidence_label: Optional[ConfidenceLabel]


def _run(
    *,
    scenario_id: str,
    title: str,
    description: str,
    case_reference: str,
    project_id: Optional[str],
    parcel_id: Optional[str],
    clocks: Sequence[StatutoryClockResult] = (),
    parcels: Sequence[ParcelEvidenceInput] = (),
    court_stays_by_parcel_id: Optional[dict] = None,
    prediction_id: Optional[str] = None,
    prediction_delay_probability: Optional[float] = None,
    prediction_generated_at: Optional[str] = None,
    prediction_timestamp: Optional[datetime] = None,
    days_remaining: Optional[int] = None,
    clock_status: Optional[str] = None,
    project_value_crores: Optional[float] = None,
    reference_project_values: Sequence[Optional[float]] = (50.0, 120.0, 300.0, 900.0),
    affected_parcel_count: Optional[int] = 1,
    affected_area_acres: Optional[float] = None,
    expected_exposure_band: Optional[ExposureBand] = None,
    expected_priority_band: Optional[PriorityBand] = None,
    expected_confidence_label: Optional[ConfidenceLabel] = None,
) -> DemoScenario:
    case_result = evaluate_case(
        case_reference=case_reference,
        calculation_date=_CALC_DATE,
        clocks=clocks,
        parcels=parcels,
        court_stays_by_parcel_id=court_stays_by_parcel_id,
    )

    # If the caller didn't override days_remaining/clock_status explicitly,
    # derive them from the case's own clock(s), mirroring how the real
    # persistence layer (db_crud.py) sources this from `legal_db_crud`.
    if days_remaining is None and clocks:
        days_remaining = clocks[0].days_remaining
    if clock_status is None and clocks:
        clock_status = clocks[0].clock_status.value

    assessment = assess_case(
        case_reference=case_reference,
        project_id=project_id,
        parcel_id=parcel_id,
        blockers=case_result.blockers,
        prediction_id=prediction_id,
        prediction_delay_probability=prediction_delay_probability,
        prediction_generated_at=prediction_generated_at,
        prediction_timestamp=prediction_timestamp,
        days_remaining=days_remaining,
        clock_status=clock_status,
        project_value_crores=project_value_crores,
        reference_project_values=reference_project_values,
        affected_parcel_count=affected_parcel_count,
        affected_area_acres=affected_area_acres,
        calculation_date=_CALC_DATE,
        calculated_at=_CALC_AT,
    )
    return DemoScenario(
        scenario_id=scenario_id,
        title=title,
        description=description,
        blockers=case_result.blockers,
        assessment=assessment,
        expected_exposure_band=expected_exposure_band,
        expected_priority_band=expected_priority_band,
        expected_confidence_label=expected_confidence_label,
    )


def scenario_1_high_exposure_urgent_clock() -> DemoScenario:
    """1 -- High exposure + urgent clock: CLOCK_AT_RISK, 10 days remaining
    (B1 DETECTED/HIGH, primary) PLUS a bare court restraint (B4 DETECTED/
    MODERATE, secondary, affects_possession=True) on a large project --
    combines an independently-ticking clock with a possession blocker."""
    clock = _clock(
        clock_id="SYN-EXP-CLOCK-1",
        case_reference="SYN-EXP-CASE-1",
        project_id="SYN-EXP-PROJ-1",
        parcel_id="SYN-EXP-PARCEL-1",
        days_remaining=10,
        clock_status=ClockStatus.CLOCK_CERTAIN,
        consequence_class=ConsequenceClass.CLOCK_AT_RISK,
    )
    parcel = _parcel(
        case_reference="SYN-EXP-CASE-1",
        project_id="SYN-EXP-PROJ-1",
        parcel_id="SYN-EXP-PARCEL-1",
        court_case=True,
        court_case_status="Active - Stay Order",
        interim_injunction=True,
    )
    return _run(
        scenario_id="1",
        title="High exposure + urgent statutory clock",
        description="B1 DETECTED/HIGH (primary, 10 days remaining) + bare-court-restraint B4 DETECTED/MODERATE (secondary, possession-blocking), large project value.",
        case_reference="SYN-EXP-CASE-1",
        project_id="SYN-EXP-PROJ-1",
        parcel_id="SYN-EXP-PARCEL-1",
        clocks=(clock,),
        parcels=(parcel,),
        project_value_crores=900.0,
        expected_exposure_band=ExposureBand.HIGH,
        expected_priority_band=PriorityBand.ACT_NOW,
        expected_confidence_label=ConfidenceLabel.VERIFIED,
    )


def scenario_2_moderate_exposure() -> DemoScenario:
    """2 -- Moderate exposure: B2 title-friction only (DETECTED/MODERATE via
    two buckets), no clock issue, mid-sized project."""
    parcel = _parcel(
        case_reference="SYN-EXP-CASE-2",
        project_id="SYN-EXP-PROJ-2",
        parcel_id="SYN-EXP-PARCEL-2",
        ownership_dispute="Yes - Sibling Dispute",
        document_status="Disputed",
        mutation_status="Up-to-date",
        record_confidence="Medium",
        encumbrance_status="Clear",
        compensation_status="Disbursed 100%",
        possession_status="Complete",
    )
    return _run(
        scenario_id="2",
        title="Moderate exposure",
        description="B2 DETECTED/HIGH title friction only, no clock issue, mid project value.",
        case_reference="SYN-EXP-CASE-2",
        project_id="SYN-EXP-PROJ-2",
        parcel_id="SYN-EXP-PARCEL-2",
        parcels=(parcel,),
        project_value_crores=120.0,
        expected_exposure_band=ExposureBand.MODERATE,
        expected_priority_band=PriorityBand.MONITOR,
        expected_confidence_label=ConfidenceLabel.PARTIAL,
    )


def scenario_3_possession_blocking_b4() -> DemoScenario:
    """3 -- Possession-blocking B4: field-verified physical obstruction,
    CONFIRMED-tier evidence pattern. Expect possession_band at maximum."""
    parcel = _parcel(
        case_reference="SYN-EXP-CASE-3",
        project_id="SYN-EXP-PROJ-3",
        parcel_id="SYN-EXP-PARCEL-3",
        field_verified=True,
        field_verification_notes="Occupant refuses to vacate the structure; possession cannot be effected.",
        evidence_photo_attached=True,
        field_verified_at="2026-08-01",
        possession_status="Pending",
    )
    return _run(
        scenario_id="3",
        title="Possession-blocking B4",
        description="Physical obstruction DETECTED/HIGH, affects_possession=True.",
        case_reference="SYN-EXP-CASE-3",
        project_id="SYN-EXP-PROJ-3",
        parcel_id="SYN-EXP-PARCEL-3",
        parcels=(parcel,),
        project_value_crores=300.0,
        expected_exposure_band=ExposureBand.MODERATE,
        expected_priority_band=PriorityBand.SOON,
        expected_confidence_label=ConfidenceLabel.PARTIAL,
    )


def scenario_4_uncertain_statutory_clock() -> DemoScenario:
    """4 -- Uncertain statutory clock: CLOCK_UNCERTAIN caps B1 at
    SUSPECTED/WATCH (inherited, never re-elevated). Expect confidence
    NEEDS_VERIFICATION and exposure never reaching CRITICAL."""
    clock = _clock(
        clock_id="SYN-EXP-CLOCK-4",
        case_reference="SYN-EXP-CASE-4",
        project_id="SYN-EXP-PROJ-4",
        parcel_id="SYN-EXP-PARCEL-4",
        days_remaining=5,
        clock_status=ClockStatus.CLOCK_UNCERTAIN,
        consequence_class=ConsequenceClass.LEGAL_STATUS_REQUIRES_VERIFICATION,
    )
    return _run(
        scenario_id="4",
        title="Uncertain statutory clock",
        description="CLOCK_UNCERTAIN -> B1 SUSPECTED/WATCH; confidence downgraded, never re-elevated.",
        case_reference="SYN-EXP-CASE-4",
        project_id="SYN-EXP-PROJ-4",
        parcel_id="SYN-EXP-PARCEL-4",
        clocks=(clock,),
        project_value_crores=900.0,
        expected_exposure_band=ExposureBand.MODERATE,
        expected_priority_band=PriorityBand.SOON,
        expected_confidence_label=ConfidenceLabel.NEEDS_VERIFICATION,
    )


def scenario_5_multiple_blockers() -> DemoScenario:
    """5 -- Multiple blockers: B1 DETECTED/HIGH (primary) + B3 DETECTED/HIGH
    (secondary, independent evidence) -- bounded secondary bonus."""
    clock = _clock(
        clock_id="SYN-EXP-CLOCK-5",
        case_reference="SYN-EXP-CASE-5",
        project_id="SYN-EXP-PROJ-5",
        parcel_id="SYN-EXP-PARCEL-5",
        days_remaining=20,
        clock_status=ClockStatus.CLOCK_CERTAIN,
        consequence_class=ConsequenceClass.CLOCK_AT_RISK,
    )
    parcel = _parcel(
        case_reference="SYN-EXP-CASE-5",
        project_id="SYN-EXP-PROJ-5",
        parcel_id="SYN-EXP-PARCEL-5",
        compensation_status="Under Dispute in LA-RA Authority",
    )
    return _run(
        scenario_id="5",
        title="Multiple blockers (B1 + B3)",
        description="B1 DETECTED/HIGH primary, B3 DETECTED/HIGH secondary -- capped secondary bonus.",
        case_reference="SYN-EXP-CASE-5",
        project_id="SYN-EXP-PROJ-5",
        parcel_id="SYN-EXP-PARCEL-5",
        clocks=(clock,),
        parcels=(parcel,),
        project_value_crores=300.0,
        expected_exposure_band=ExposureBand.HIGH,
        expected_priority_band=PriorityBand.SOON,
        expected_confidence_label=ConfidenceLabel.VERIFIED,
    )


def scenario_6_missing_gis_downstream() -> DemoScenario:
    """6 -- Missing GIS/downstream data: `affected_parcel_count` genuinely
    unknown (not even the self-parcel default), on top of a plain B2 signal.
    Expect the neutral (not zero, not max) downstream_band and a recorded
    neutral substitution."""
    parcel = _parcel(
        case_reference="SYN-EXP-CASE-6",
        project_id="SYN-EXP-PROJ-6",
        parcel_id="SYN-EXP-PARCEL-6",
        mutation_status="Disputed",
        ownership_dispute="No",
        document_status="Verified",
        record_confidence="Medium",
        encumbrance_status="Clear",
    )
    return _run(
        scenario_id="6",
        title="Missing GIS/downstream data",
        description="affected_parcel_count is None -- downstream_band falls back to the documented neutral value.",
        case_reference="SYN-EXP-CASE-6",
        project_id="SYN-EXP-PROJ-6",
        parcel_id="SYN-EXP-PARCEL-6",
        parcels=(parcel,),
        project_value_crores=None,
        affected_parcel_count=None,
        expected_exposure_band=ExposureBand.LOW,
        expected_priority_band=PriorityBand.MONITOR,
        expected_confidence_label=ConfidenceLabel.NEEDS_VERIFICATION,
    )


def scenario_7_high_prediction_low_consequence() -> DemoScenario:
    """7 -- High ML prediction probability, but no deterministic blocker/
    clock consequence at all (all axes clean). Demonstrates Prediction !=
    Exposure: a high `delay_probability` alone never inflates the exposure
    score."""
    parcel = _parcel(
        case_reference="SYN-EXP-CASE-7",
        project_id="SYN-EXP-PROJ-7",
        parcel_id="SYN-EXP-PARCEL-7",
        ownership_dispute="No",
        document_status="Verified",
        mutation_status="Up-to-date",
        record_confidence="High",
        encumbrance_status="Clear",
        compensation_status="Disbursed 100%",
        possession_status="Complete",
    )
    return _run(
        scenario_id="7",
        title="High prediction probability, low consequence",
        description="delay_probability=0.91 but every blocker axis reads clean -- exposure stays low.",
        case_reference="SYN-EXP-CASE-7",
        project_id="SYN-EXP-PROJ-7",
        parcel_id="SYN-EXP-PARCEL-7",
        parcels=(parcel,),
        prediction_id="SYN-PRED-7",
        prediction_delay_probability=0.91,
        prediction_generated_at="2026-09-01T00:00",
        prediction_timestamp=_CALC_AT,
        project_value_crores=40.0,
        expected_exposure_band=ExposureBand.LOW,
        expected_priority_band=PriorityBand.MONITOR,
        expected_confidence_label=ConfidenceLabel.PARTIAL,
    )


def scenario_8_low_prediction_high_consequence() -> DemoScenario:
    """8 -- Low ML prediction probability, but a CONFIRMED apparent-lapse B1
    (CRITICAL) plus a verified project-scoped court restraint (B4 CONFIRMED/
    CRITICAL). Demonstrates the reverse: a low `delay_probability` never
    buries a genuinely severe legal/possession consequence."""
    from legal.stays import CourtStayEvent
    from legal.enums import EvidenceVerificationStatus, StayScope

    clock = _clock(
        clock_id="SYN-EXP-CLOCK-8",
        case_reference="SYN-EXP-CASE-8",
        project_id="SYN-EXP-PROJ-8",
        parcel_id="SYN-EXP-PARCEL-8",
        days_remaining=-30,
        clock_status=ClockStatus.APPARENT_LAPSE,
        consequence_class=ConsequenceClass.APPARENT_LAPSE,
        notes=(
            "CONFIRMED here means KSHETRA confirms its deterministic evidence indicates an apparent "
            "lapse -- this is NOT a determination that the acquisition has legally lapsed."
        ),
    )
    parcel = _parcel(
        case_reference="SYN-EXP-CASE-8",
        project_id="SYN-EXP-PROJ-8",
        parcel_id="SYN-EXP-PARCEL-8",
        court_case=True,
        court_case_status="Active - Stay Order",
        interim_injunction=True,
    )
    stay = CourtStayEvent(
        stay_id="SYN-STAY-8",
        case_reference="SYN-EXP-CASE-8",
        court="Synthetic Demo High Court",
        order_date=date(2026, 6, 1),
        effective_from=date(2026, 6, 1),
        effective_to=None,
        scope=StayScope.PROJECT,
        affected_parcels=(),
        affected_stage=None,
        source_document=None,
        verification_status=EvidenceVerificationStatus.VERIFIED,
        notes="Synthetic demo project-wide stay.",
    )
    return _run(
        scenario_id="8",
        title="Low prediction probability, high consequence",
        description="delay_probability=0.12 but CONFIRMED APPARENT_LAPSE B1 + CONFIRMED project-wide B4 stay.",
        case_reference="SYN-EXP-CASE-8",
        project_id="SYN-EXP-PROJ-8",
        parcel_id="SYN-EXP-PARCEL-8",
        clocks=(clock,),
        parcels=(parcel,),
        court_stays_by_parcel_id={"SYN-EXP-PARCEL-8": stay},
        prediction_id="SYN-PRED-8",
        prediction_delay_probability=0.12,
        prediction_generated_at="2026-09-01T00:00",
        prediction_timestamp=_CALC_AT,
        project_value_crores=900.0,
        expected_exposure_band=ExposureBand.CRITICAL,
        expected_priority_band=PriorityBand.ACT_NOW,
        expected_confidence_label=ConfidenceLabel.VERIFIED,
    )


ALL_SCENARIOS = (
    scenario_1_high_exposure_urgent_clock,
    scenario_2_moderate_exposure,
    scenario_3_possession_blocking_b4,
    scenario_4_uncertain_statutory_clock,
    scenario_5_multiple_blockers,
    scenario_6_missing_gis_downstream,
    scenario_7_high_prediction_low_consequence,
    scenario_8_low_prediction_high_consequence,
)
