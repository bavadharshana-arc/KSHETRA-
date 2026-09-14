import unittest
from datetime import date, datetime, timezone

from blockers.detection import detect_b1
from blockers.enums import BlockerEvaluationOutcome, BlockerSeverity, BlockerStatus, BlockerType
from legal.clock_engine import StatutoryClockResult
from legal.enums import ApplicableAct, ClockStatus, ConsequenceClass, ExtensionStatus, SourceType


def _clock(
    *,
    clock_status: ClockStatus,
    consequence_class: ConsequenceClass,
    days_remaining=None,
    calculation_basis=SourceType.SYNTHETIC_DEMO.value,
    case_reference="T-CASE-B1",
    project_id="T-PROJ",
    parcel_id=None,
    clock_id="T-CLOCK-B1-1",
    notes="",
) -> StatutoryClockResult:
    return StatutoryClockResult(
        clock_id=clock_id,
        case_reference=case_reference,
        project_id=project_id,
        parcel_id=parcel_id,
        applicable_act=ApplicableAct.RFCTLARR,
        section_reference="RFCTLARR s.19",
        rule_set_id="rfctlarr-s19-declaration-v1",
        rule_set_version="v1",
        trigger_event_id="T-EVT-1",
        trigger_date=date(2024, 1, 1),
        statutory_period="12 months from declaration",
        computed_deadline=date(2025, 1, 1),
        extension_status=ExtensionStatus.EXTENSION_UNKNOWN,
        extension_evidence_id=None,
        stay_adjustment_days=0,
        adjusted_deadline=date(2025, 1, 1),
        calculation_date=date(2024, 12, 20),
        days_elapsed=354,
        days_remaining=days_remaining,
        clock_status=clock_status,
        consequence_class=consequence_class,
        calculation_basis=calculation_basis,
        source_references=["T-EVT-1"],
        calculated_at=datetime(2024, 12, 20, tzinfo=timezone.utc),
        calculation_version="test-1.0.0",
        event_conflict=None,
        notes=notes,
    )


class B1CleanTests(unittest.TestCase):
    def test_certain_process_delay_raises_no_blocker(self):
        clock = _clock(
            clock_status=ClockStatus.CLOCK_CERTAIN,
            consequence_class=ConsequenceClass.PROCESS_DELAY,
            days_remaining=200,
        )
        result = detect_b1(clock)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.EVIDENCE_OF_NO_BLOCKER)
        self.assertIsNone(result.blocker)


class B1ApproachingCertainClockTests(unittest.TestCase):
    def test_clock_at_risk_close_deadline_is_high_severity(self):
        clock = _clock(
            clock_status=ClockStatus.CLOCK_CERTAIN,
            consequence_class=ConsequenceClass.CLOCK_AT_RISK,
            days_remaining=10,
        )
        result = detect_b1(clock)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.DETECTED)
        self.assertIsNotNone(result.blocker)
        self.assertEqual(result.blocker.status, BlockerStatus.DETECTED)
        self.assertEqual(result.blocker.severity, BlockerSeverity.HIGH)
        self.assertEqual(result.blocker.blocker_type, BlockerType.B1)
        self.assertTrue(result.blocker.affects_clock)
        self.assertEqual(result.blocker.affected_clock_ids, (clock.clock_id,))
        self.assertEqual(result.blocker.owner_role, "Collector / CALA / LAO")

    def test_clock_at_risk_further_deadline_is_moderate_severity(self):
        clock = _clock(
            clock_status=ClockStatus.CLOCK_CERTAIN,
            consequence_class=ConsequenceClass.CLOCK_AT_RISK,
            days_remaining=28,
        )
        result = detect_b1(clock)
        self.assertEqual(result.blocker.severity, BlockerSeverity.MODERATE)


class B1UncertainClockTests(unittest.TestCase):
    def test_clock_uncertain_is_hard_capped_at_suspected(self):
        clock = _clock(
            clock_status=ClockStatus.CLOCK_UNCERTAIN,
            consequence_class=ConsequenceClass.LEGAL_STATUS_REQUIRES_VERIFICATION,
            calculation_basis="UNRESOLVED_CONFLICT",
        )
        result = detect_b1(clock)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.SUSPECTED)
        self.assertEqual(result.blocker.status, BlockerStatus.SUSPECTED)
        # Never HIGH/CRITICAL -- uncertainty must never masquerade as a confirmed finding.
        self.assertIn(result.blocker.severity, (BlockerSeverity.WATCH, BlockerSeverity.INFORMATIONAL))


class B1InsufficientBasisTests(unittest.TestCase):
    def test_insufficient_basis_is_insufficient_evidence_never_absent(self):
        clock = _clock(
            clock_status=ClockStatus.INSUFFICIENT_BASIS,
            consequence_class=ConsequenceClass.LEGAL_STATUS_REQUIRES_VERIFICATION,
            days_remaining=None,
            calculation_basis="NONE",
        )
        result = detect_b1(clock)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.INSUFFICIENT_EVIDENCE)
        self.assertIsNotNone(result.blocker)
        self.assertEqual(result.blocker.status, BlockerStatus.INSUFFICIENT_EVIDENCE)


class B1ApparentLapseTests(unittest.TestCase):
    def test_apparent_lapse_acquisition_lapse_is_confirmed_critical(self):
        clock = _clock(
            clock_status=ClockStatus.APPARENT_LAPSE,
            consequence_class=ConsequenceClass.APPARENT_LAPSE,
            days_remaining=-100,
        )
        result = detect_b1(clock)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.CONFIRMED)
        self.assertEqual(result.blocker.status, BlockerStatus.CONFIRMED)
        self.assertEqual(result.blocker.severity, BlockerSeverity.CRITICAL)
        # The boundary rule: CONFIRMED must never read as a legal-lapse determination.
        self.assertIn("NOT a determination", result.blocker.notes)

    def test_apparent_lapse_non_acquisition_lapse_is_detected_not_confirmed(self):
        clock = _clock(
            clock_status=ClockStatus.APPARENT_LAPSE,
            consequence_class=ConsequenceClass.CLOCK_EXPIRED,
            days_remaining=-30,
        )
        result = detect_b1(clock)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.DETECTED)
        self.assertEqual(result.blocker.status, BlockerStatus.DETECTED)
        self.assertNotEqual(result.blocker.status, BlockerStatus.CONFIRMED)


class B1ExtensionUnverifiedTests(unittest.TestCase):
    def test_extension_unverified_is_detected_high_severity(self):
        clock = _clock(
            clock_status=ClockStatus.EXTENSION_UNVERIFIED,
            consequence_class=ConsequenceClass.LEGAL_STATUS_REQUIRES_VERIFICATION,
            days_remaining=-10,
        )
        result = detect_b1(clock)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.DETECTED)
        self.assertEqual(result.blocker.severity, BlockerSeverity.HIGH)


class B1Legacy1894Tests(unittest.TestCase):
    def test_legacy_1894_requires_verification_is_insufficient_evidence(self):
        clock = _clock(
            clock_status=ClockStatus.LEGACY_1894,
            consequence_class=ConsequenceClass.LEGAL_STATUS_REQUIRES_VERIFICATION,
        )
        result = detect_b1(clock)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.INSUFFICIENT_EVIDENCE)

    def test_legacy_1894_other_consequence_is_suspected_never_confirmed(self):
        clock = _clock(
            clock_status=ClockStatus.LEGACY_1894,
            consequence_class=ConsequenceClass.CLOCK_EXPIRED,
        )
        result = detect_b1(clock)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.SUSPECTED)
        self.assertNotEqual(result.blocker.status, BlockerStatus.CONFIRMED)


class B1DeterminismTests(unittest.TestCase):
    def test_repeated_identical_calculation_yields_identical_result(self):
        clock = _clock(
            clock_status=ClockStatus.CLOCK_CERTAIN,
            consequence_class=ConsequenceClass.CLOCK_AT_RISK,
            days_remaining=5,
        )
        first = detect_b1(clock)
        second = detect_b1(clock)
        self.assertEqual(first.outcome, second.outcome)
        self.assertEqual(first.blocker.status, second.blocker.status)
        self.assertEqual(first.blocker.severity, second.blocker.severity)
        self.assertEqual(first.blocker.blocker_type, second.blocker.blocker_type)
        self.assertEqual(first.blocker.affected_clock_ids, second.blocker.affected_clock_ids)


if __name__ == "__main__":
    unittest.main()
