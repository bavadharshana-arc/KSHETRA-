import unittest
from datetime import date

from blockers.detection import detect_b2
from blockers.enums import BlockerEvaluationOutcome, BlockerSeverity, BlockerStatus, BlockerType
from blockers.evidence import ParcelEvidenceInput

CALC_DATE = date(2024, 6, 1)


def _parcel(**overrides) -> ParcelEvidenceInput:
    base = dict(case_reference="T-CASE-B2", project_id="T-PROJ", parcel_id="T-P-B2")
    base.update(overrides)
    return ParcelEvidenceInput(**base)


class B2NoEvidenceTests(unittest.TestCase):
    def test_no_fields_populated_is_no_evidence(self):
        parcel = _parcel()
        result = detect_b2(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.NO_EVIDENCE)
        self.assertIsNone(result.blocker)


class B2CleanTests(unittest.TestCase):
    def test_all_clean_fields_is_evidence_of_no_blocker(self):
        parcel = _parcel(
            ownership_dispute="No",
            document_status="Verified",
            mutation_status="Up-to-date",
            encumbrance_status="Clear",
            record_confidence="High",
        )
        result = detect_b2(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.EVIDENCE_OF_NO_BLOCKER)
        self.assertIsNone(result.blocker)

    def test_clean_fields_but_low_record_confidence_downgrades_to_insufficient(self):
        parcel = _parcel(
            ownership_dispute="No",
            document_status="Verified",
            mutation_status="Up-to-date",
            encumbrance_status="Clear",
            record_confidence="Low",
        )
        result = detect_b2(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.INSUFFICIENT_EVIDENCE)
        self.assertIsNotNone(result.blocker)
        self.assertEqual(result.blocker.status, BlockerStatus.INSUFFICIENT_EVIDENCE)


class B2InsufficientEvidenceTests(unittest.TestCase):
    def test_ambiguous_pending_verification_fields_is_insufficient(self):
        parcel = _parcel(
            ownership_dispute="No",
            document_status="Pending Verification",
            mutation_status="Pending Verification",
            encumbrance_status="Clear",
            record_confidence="Low",
        )
        result = detect_b2(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.INSUFFICIENT_EVIDENCE)
        self.assertIsNotNone(result.blocker)
        self.assertEqual(result.blocker.status, BlockerStatus.INSUFFICIENT_EVIDENCE)


class B2DetectedTitleFrictionTests(unittest.TestCase):
    def test_single_qualifying_signal_is_suspected_not_detected(self):
        parcel = _parcel(ownership_dispute="Yes - Boundary Dispute", record_confidence="Medium")
        result = detect_b2(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.SUSPECTED)
        self.assertEqual(result.blocker.status, BlockerStatus.SUSPECTED)

    def test_multiple_independent_signals_is_detected(self):
        parcel = _parcel(
            ownership_dispute="Yes - Partition Suit",
            document_status="Disputed",
            mutation_status="Disputed",
            record_confidence="Medium",
        )
        result = detect_b2(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.DETECTED)
        self.assertEqual(result.blocker.status, BlockerStatus.DETECTED)
        self.assertEqual(result.blocker.blocker_type, BlockerType.B2)
        self.assertEqual(result.blocker.severity, BlockerSeverity.HIGH)
        self.assertEqual(result.blocker.owner_role, "Revenue / Registration authority")
        self.assertEqual(len(result.blocker.evidence), 3)

    def test_low_record_confidence_downgrades_multi_signal_from_detected_to_suspected(self):
        parcel = _parcel(
            ownership_dispute="Yes - Partition Suit",
            document_status="Disputed",
            mutation_status="Disputed",
            record_confidence="Low",
        )
        result = detect_b2(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.SUSPECTED)

    def test_ownership_dispute_and_pending_partition_are_not_double_counted(self):
        """Two fields describing the same underlying partition fact must
        fold into ONE bucket, not inflate confidence to DETECTED."""
        parcel = _parcel(
            ownership_dispute="Yes - Partition Suit",
            encumbrance_status="Pending Partition",
            record_confidence="Medium",
        )
        result = detect_b2(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.SUSPECTED)
        self.assertEqual(len(result.blocker.evidence), 1)


class B2NoFalseConfirmationTests(unittest.TestCase):
    def test_confirmed_is_never_reached_from_bare_parcel_fields(self):
        """Data Gap row B2-1: no provenance-carrying title evidence entity
        exists yet, so B2 must never reach CONFIRMED off bare Parcel status
        fields, no matter how many qualifying signals agree."""
        parcel = _parcel(
            ownership_dispute="Yes - Partition Suit",
            document_status="Missing Documents",
            mutation_status="Stale",
            encumbrance_status="Encumbered",
            record_confidence="High",
        )
        result = detect_b2(parcel, calculation_date=CALC_DATE)
        self.assertNotEqual(result.outcome, BlockerEvaluationOutcome.CONFIRMED)
        self.assertNotEqual(result.blocker.status, BlockerStatus.CONFIRMED)


class B2ConflictingEvidenceTests(unittest.TestCase):
    def test_disagreeing_same_tier_sources_is_conflicted(self):
        parcel = _parcel(ownership_dispute="No", record_confidence="Medium")
        result = detect_b2(
            parcel, calculation_date=CALC_DATE, secondary_ownership_observation="Yes - Boundary Dispute"
        )
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.CONFLICTED)
        self.assertIsNotNone(result.blocker)
        self.assertEqual(result.blocker.status, BlockerStatus.CONFLICTED)
        # Both competing readings must be preserved, never one silently dropped.
        self.assertEqual(len(result.blocker.evidence), 2)

    def test_agreeing_secondary_observation_does_not_force_conflict(self):
        parcel = _parcel(ownership_dispute="No", record_confidence="Medium")
        result = detect_b2(parcel, calculation_date=CALC_DATE, secondary_ownership_observation="No")
        self.assertNotEqual(result.outcome, BlockerEvaluationOutcome.CONFLICTED)


class B2DeterminismTests(unittest.TestCase):
    def test_repeated_identical_calculation_yields_identical_result(self):
        parcel = _parcel(ownership_dispute="Yes - Partition Suit", document_status="Disputed", record_confidence="Medium")
        first = detect_b2(parcel, calculation_date=CALC_DATE)
        second = detect_b2(parcel, calculation_date=CALC_DATE)
        self.assertEqual(first.outcome, second.outcome)
        self.assertEqual(first.blocker.status, second.blocker.status)
        self.assertEqual(first.blocker.severity, second.blocker.severity)


if __name__ == "__main__":
    unittest.main()
