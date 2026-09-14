import unittest
from datetime import date

from blockers.detection import detect_b4
from blockers.enums import BlockerEvaluationOutcome, BlockerSeverity, BlockerStatus, BlockerType
from blockers.evidence import ParcelEvidenceInput
from legal.enums import EvidenceVerificationStatus, StayScope
from legal.stays import CourtStayEvent

CALC_DATE = date(2024, 6, 1)


def _parcel(**overrides) -> ParcelEvidenceInput:
    base = dict(case_reference="T-CASE-B4", project_id="T-PROJ", parcel_id="T-P-B4")
    base.update(overrides)
    return ParcelEvidenceInput(**base)


def _stay(**overrides) -> CourtStayEvent:
    base = dict(
        stay_id="T-STAY-1",
        case_reference="T-CASE-B4",
        court="Test Court",
        order_date=date(2024, 1, 1),
        effective_from=date(2024, 1, 1),
        effective_to=None,
        scope=StayScope.PARCEL,
        affected_parcels=("T-P-B4",),
        affected_stage=None,
        source_document="T-DOC-1",
        verification_status=EvidenceVerificationStatus.VERIFIED,
        notes="Illustrative/synthetic test record.",
    )
    base.update(overrides)
    return CourtStayEvent(**base)


class B4NoEvidenceTests(unittest.TestCase):
    def test_no_possession_relevant_fields_is_no_evidence(self):
        parcel = _parcel()
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.NO_EVIDENCE)
        self.assertIsNone(result.blocker)

    def test_possession_status_pending_alone_is_no_evidence(self):
        parcel = _parcel(possession_status="Pending")
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.NO_EVIDENCE)
        self.assertIsNone(result.blocker)


class B4CleanTests(unittest.TestCase):
    def test_possession_complete_no_other_signal_is_evidence_of_no_blocker(self):
        parcel = _parcel(possession_status="Complete")
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.EVIDENCE_OF_NO_BLOCKER)
        self.assertIsNone(result.blocker)


class B4UnrelatedLitigationTests(unittest.TestCase):
    def test_disposed_case_is_not_a_possession_blocker(self):
        """A court case that is Disposed, or carries no interim injunction,
        must not be treated as a possession obstruction -- not every
        litigation case is B4."""
        parcel = _parcel(court_case_status="Disposed", interim_injunction=False)
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.NO_EVIDENCE)
        self.assertIsNone(result.blocker)

    def test_active_case_without_injunction_is_not_a_possession_blocker(self):
        parcel = _parcel(court_case_status="Active - Stay Order", interim_injunction=None)
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.NO_EVIDENCE)
        self.assertIsNone(result.blocker)


class B4PhysicalObstructionTests(unittest.TestCase):
    def test_field_verified_obstruction_notes_is_detected(self):
        parcel = _parcel(
            field_verified=True,
            field_verification_notes="Encroachment observed; an unauthorized structure blocks access.",
            evidence_photo_attached=True,
        )
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.DETECTED)
        self.assertEqual(result.blocker.status, BlockerStatus.DETECTED)
        self.assertEqual(result.blocker.blocker_type, BlockerType.B4)
        self.assertEqual(result.blocker.severity, BlockerSeverity.HIGH)
        self.assertIn("Field Team", result.blocker.owner_role)

    def test_field_verified_neutral_notes_raises_no_blocker(self):
        parcel = _parcel(field_verified=True, field_verification_notes="Boundary pillar confirmed; no issues found.")
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.NO_EVIDENCE)


class B4FalsePositiveTextRegressionTests(unittest.TestCase):
    """Step 7B.1 regression: raw substring matching against risk words
    ("occupant"/"structure"/"block"/"obstruction") produced false positives
    on explicit clearance/negation text. These assert the fixed, phrase-level
    negation-then-positive matching behaves correctly."""

    # --- A: explicit negative ---
    def test_a_no_obstruction_remains_raises_no_blocker(self):
        parcel = _parcel(field_verified=True, field_verification_notes="No obstruction remains on the parcel.")
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.NO_EVIDENCE)
        self.assertIsNone(result.blocker)

    # --- B: clearance ---
    def test_b_site_is_clear_raises_no_blocker(self):
        parcel = _parcel(
            field_verified=True, field_verification_notes="Site is clear and possession can proceed."
        )
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.NO_EVIDENCE)
        self.assertIsNone(result.blocker)

    # --- C: vacated occupant ---
    def test_c_occupant_vacated_voluntarily_raises_no_blocker(self):
        parcel = _parcel(field_verified=True, field_verification_notes="Occupant vacated voluntarily.")
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.NO_EVIDENCE)
        self.assertIsNone(result.blocker)

    def test_original_defect_example_no_longer_false_positives(self):
        """The exact sentence from the Step 7B diff review's Critical finding."""
        parcel = _parcel(
            field_verified=True,
            field_verification_notes=(
                "Occupant vacated the site voluntarily; no obstruction remains and possession can "
                "proceed without hindrance."
            ),
        )
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.NO_EVIDENCE)
        self.assertIsNone(result.blocker)

    # --- D: positive obstruction ---
    def test_d_occupant_refuses_to_vacate_is_detected(self):
        parcel = _parcel(
            field_verified=True,
            field_verification_notes="Occupant refuses to vacate and possession cannot proceed.",
        )
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.DETECTED)
        self.assertEqual(result.blocker.status, BlockerStatus.DETECTED)

    # --- E: positive structure ---
    def test_e_existing_structure_prevents_possession_is_detected(self):
        parcel = _parcel(
            field_verified=True, field_verification_notes="Existing structure prevents possession."
        )
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.DETECTED)
        self.assertEqual(result.blocker.status, BlockerStatus.DETECTED)

    # --- F: ambiguous ---
    def test_f_bare_structure_mention_is_conservative_not_confirmed(self):
        parcel = _parcel(field_verified=True, field_verification_notes="Structure observed on parcel.")
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        # Conservative per the safety rule: a bare, consequence-free mention
        # of a risk word is neither a positive obstruction finding nor
        # evidence of clearance -- it must never reach CONFIRMED, and this
        # implementation's conservative choice is to raise no B4 blocker at
        # all from it (falls through to NO_EVIDENCE, matching "prefer ...
        # no B4 detection ... over falsely asserting a possession blocker").
        self.assertNotEqual(result.outcome, BlockerEvaluationOutcome.CONFIRMED)
        if result.blocker is not None:
            self.assertNotEqual(result.blocker.status, BlockerStatus.CONFIRMED)
        else:
            self.assertEqual(result.outcome, BlockerEvaluationOutcome.NO_EVIDENCE)

    # --- additional positive-phrase coverage matching the Step 7B.1 brief's examples ---
    def test_unauthorized_structure_prevents_possession_is_detected(self):
        parcel = _parcel(
            field_verified=True, field_verification_notes="Unauthorized structure prevents possession."
        )
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.DETECTED)

    def test_physical_obstruction_prevents_possession_is_detected(self):
        parcel = _parcel(
            field_verified=True, field_verification_notes="Physical obstruction prevents possession."
        )
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.DETECTED)

    def test_encroachment_blocks_access_is_detected(self):
        parcel = _parcel(field_verified=True, field_verification_notes="Encroachment blocks access.")
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.DETECTED)

    def test_possession_cannot_proceed_due_to_existing_structure_is_detected(self):
        parcel = _parcel(
            field_verified=True,
            field_verification_notes="Possession cannot proceed due to existing structure.",
        )
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.DETECTED)

    def test_no_physical_obstruction_raises_no_blocker(self):
        parcel = _parcel(field_verified=True, field_verification_notes="No physical obstruction observed.")
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.NO_EVIDENCE)

    def test_no_encroachment_raises_no_blocker(self):
        parcel = _parcel(field_verified=True, field_verification_notes="No encroachment on the parcel.")
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.NO_EVIDENCE)

    def test_no_structure_blocking_possession_raises_no_blocker(self):
        parcel = _parcel(
            field_verified=True, field_verification_notes="No structure blocking possession."
        )
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.NO_EVIDENCE)

    def test_no_hindrance_to_possession_raises_no_blocker(self):
        parcel = _parcel(
            field_verified=True, field_verification_notes="No hindrance to possession noted."
        )
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.NO_EVIDENCE)

    # --- G: existing court-stay B4 behavior is unaffected by the text-matching fix ---
    def test_g_verified_parcel_scoped_stay_still_reaches_confirmed_even_with_clearance_wording(self):
        """The text-matching fix touches ONLY the physical-obstruction
        signal. A verified, in-scope CourtStayEvent must still independently
        drive B4 to CONFIRMED regardless of what the (here, clearance-worded
        and therefore non-triggering) field verification notes say."""
        parcel = _parcel(
            field_verified=True,
            field_verification_notes="Occupant vacated voluntarily; no obstruction remains.",
        )
        stay = _stay(scope=StayScope.PARCEL, affected_parcels=("T-P-B4",))
        result = detect_b4(parcel, calculation_date=CALC_DATE, court_stay=stay)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.CONFIRMED)
        self.assertEqual(result.blocker.status, BlockerStatus.CONFIRMED)

    def test_g_bare_court_fields_fallback_still_capped_at_detected(self):
        parcel = _parcel(court_case_status="Active - Stay Order", interim_injunction=True)
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.DETECTED)
        self.assertNotEqual(result.blocker.status, BlockerStatus.CONFIRMED)


class B4ScopedCourtStayTests(unittest.TestCase):
    def test_verified_parcel_scoped_stay_covering_this_parcel_is_confirmed(self):
        parcel = _parcel()
        stay = _stay(scope=StayScope.PARCEL, affected_parcels=("T-P-B4",))
        result = detect_b4(parcel, calculation_date=CALC_DATE, court_stay=stay)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.CONFIRMED)
        self.assertEqual(result.blocker.status, BlockerStatus.CONFIRMED)
        self.assertEqual(result.blocker.severity, BlockerSeverity.HIGH)

    def test_verified_parcel_scoped_stay_not_covering_this_parcel_is_ignored(self):
        parcel = _parcel()
        stay = _stay(scope=StayScope.PARCEL, affected_parcels=("OTHER-PARCEL",))
        result = detect_b4(parcel, calculation_date=CALC_DATE, court_stay=stay)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.NO_EVIDENCE)
        self.assertIsNone(result.blocker)

    def test_unverified_stay_never_reaches_confirmed(self):
        parcel = _parcel()
        stay = _stay(scope=StayScope.PARCEL, verification_status=EvidenceVerificationStatus.CLAIMED)
        result = detect_b4(parcel, calculation_date=CALC_DATE, court_stay=stay)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.NO_EVIDENCE)

    def test_project_scoped_verified_stay_is_confirmed_and_affects_project(self):
        parcel = _parcel()
        stay = _stay(scope=StayScope.PROJECT, affected_parcels=())
        result = detect_b4(parcel, calculation_date=CALC_DATE, court_stay=stay)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.CONFIRMED)
        self.assertEqual(result.blocker.severity, BlockerSeverity.CRITICAL)
        self.assertTrue(result.blocker.affects_project)

    def test_stage_scoped_stay_is_conservatively_not_covered(self):
        parcel = _parcel()
        stay = _stay(scope=StayScope.STAGE, affected_stage="RFCTLARR s.19")
        result = detect_b4(parcel, calculation_date=CALC_DATE, court_stay=stay)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.NO_EVIDENCE)

    def test_bare_court_fields_fallback_never_reach_confirmed(self):
        parcel = _parcel(court_case_status="Active - Stay Order", interim_injunction=True)
        result = detect_b4(parcel, calculation_date=CALC_DATE)  # no real CourtStayEvent supplied
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.DETECTED)
        self.assertNotEqual(result.blocker.status, BlockerStatus.CONFIRMED)


class B4InsufficientEvidenceTests(unittest.TestCase):
    def test_regulatory_precondition_alone_is_suspected_not_detected(self):
        parcel = _parcel(environmental_zone="CRZ")
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertEqual(result.outcome, BlockerEvaluationOutcome.SUSPECTED)
        self.assertEqual(result.blocker.severity, BlockerSeverity.WATCH)


class B4DualOwnerTests(unittest.TestCase):
    def test_physical_and_court_restraint_together_yields_joint_owner(self):
        parcel = _parcel(
            field_verified=True,
            field_verification_notes="Occupant refuses to vacate; structure obstructs the right of way.",
            court_case_status="Active - Stay Order",
            interim_injunction=True,
        )
        result = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertIn("Field Team", result.blocker.owner_role)
        self.assertIn("Legal Desk", result.blocker.owner_role)


class B4DeterminismTests(unittest.TestCase):
    def test_repeated_identical_calculation_yields_identical_result(self):
        parcel = _parcel(field_verified=True, field_verification_notes="Encroachment blocks possession.")
        first = detect_b4(parcel, calculation_date=CALC_DATE)
        second = detect_b4(parcel, calculation_date=CALC_DATE)
        self.assertEqual(first.outcome, second.outcome)
        self.assertEqual(first.blocker.status, second.blocker.status)


if __name__ == "__main__":
    unittest.main()
