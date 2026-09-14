import unittest
from datetime import date

from blockers.detection import detect_b3
from blockers.enums import BlockerEvaluationOutcome, BlockerSeverity, BlockerStatus, BlockerType
from blockers.evidence import ParcelEvidenceInput

CALC_DATE = date(2024, 6, 1)


def _parcel(**overrides) -> ParcelEvidenceInput:
    base = dict(case_reference="T-CASE-B3", project_id="T-PROJ", parcel_id="T-P-B3")
    base.update(overrides)
    return ParcelEvidenceInput(**base)


class B3NoEvidenceTests(unittest.TestCase):
    def test_unpopulated_compensation_status_is_no_evidence(self):
        parcel = _parcel()
        result = detect_b3(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.NO_EVIDENCE)
        self.assertIsNone(result.blocker)


class B3PendingIsNotAutomaticallyDisputeTests(unittest.TestCase):
    def test_pending_alone_is_not_treated_as_b3_evidence(self):
        """Anti-pattern guard: compensation_pending_pct > 0 (or
        compensationStatus == 'Pending') must NEVER automatically prove a
        legal compensation dispute."""
        parcel = _parcel(compensation_status="Pending")
        result = detect_b3(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.NO_EVIDENCE)
        self.assertIsNone(result.blocker)

    def test_pending_with_independent_active_litigation_is_only_suspected(self):
        parcel = _parcel(
            compensation_status="Pending",
            court_case=True,
            court_case_status="Active - Stay Order",
        )
        result = detect_b3(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.SUSPECTED)
        self.assertEqual(result.blocker.status, BlockerStatus.SUSPECTED)


class B3CleanTests(unittest.TestCase):
    def test_determined_is_evidence_of_no_blocker(self):
        parcel = _parcel(compensation_status="Determined")
        result = detect_b3(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.EVIDENCE_OF_NO_BLOCKER)
        self.assertIsNone(result.blocker)

    def test_disbursed_100pct_is_evidence_of_no_blocker(self):
        parcel = _parcel(compensation_status="Disbursed 100%")
        result = detect_b3(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.EVIDENCE_OF_NO_BLOCKER)
        self.assertIsNone(result.blocker)


class B3InsufficientEvidenceTests(unittest.TestCase):
    def test_partial_disbursement_is_insufficient_evidence(self):
        parcel = _parcel(compensation_status="Disbursed 40%")
        result = detect_b3(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.INSUFFICIENT_EVIDENCE)
        self.assertIsNotNone(result.blocker)
        self.assertEqual(result.blocker.status, BlockerStatus.INSUFFICIENT_EVIDENCE)


class B3CompensationDisputeTests(unittest.TestCase):
    def test_under_dispute_is_detected(self):
        parcel = _parcel(compensation_status="Under Dispute in LA-RA Authority")
        result = detect_b3(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.DETECTED)
        self.assertEqual(result.blocker.status, BlockerStatus.DETECTED)
        self.assertEqual(result.blocker.blocker_type, BlockerType.B3)
        self.assertEqual(result.blocker.severity, BlockerSeverity.HIGH)
        self.assertEqual(result.blocker.owner_role, "Compensation Authority / LARR Authority")
        self.assertTrue(result.blocker.affects_possession)  # S.38 interface hook, §L/E

    def test_under_dispute_with_litigation_adds_corroborating_evidence(self):
        parcel = _parcel(
            compensation_status="Under Dispute in LA-RA Authority",
            court_case=True,
            court_case_status="Pending Hearing",
        )
        result = detect_b3(parcel, calculation_date=CALC_DATE)
        self.assertEqual(len(result.blocker.evidence), 2)


class B3NoFalseConfirmationTests(unittest.TestCase):
    def test_confirmed_is_never_reached(self):
        parcel = _parcel(
            compensation_status="Under Dispute in LA-RA Authority",
            court_case=True,
            court_case_status="Active - Stay Order",
        )
        result = detect_b3(parcel, calculation_date=CALC_DATE)
        self.assertNotEqual(result.outcome, BlockerEvaluationOutcome.CONFIRMED)
        self.assertNotEqual(result.blocker.status, BlockerStatus.CONFIRMED)


class B3DeterminismTests(unittest.TestCase):
    def test_repeated_identical_calculation_yields_identical_result(self):
        parcel = _parcel(compensation_status="Under Dispute in LA-RA Authority")
        first = detect_b3(parcel, calculation_date=CALC_DATE)
        second = detect_b3(parcel, calculation_date=CALC_DATE)
        self.assertEqual(first.outcome, second.outcome)
        self.assertEqual(first.blocker.status, second.blocker.status)


if __name__ == "__main__":
    unittest.main()
