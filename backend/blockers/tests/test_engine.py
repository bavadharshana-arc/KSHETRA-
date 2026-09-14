import unittest
from datetime import date, datetime, timezone

from blockers.engine import evaluate_case, evaluate_single_parcel
from blockers.enums import BlockerStatus, BlockerType, EvidenceVerificationStatus
from blockers.evidence import ParcelEvidenceInput
from legal.clock_engine import StatutoryClockResult
from legal.enums import ApplicableAct, ClockStatus, ConsequenceClass, ExtensionStatus, SourceType


def _clock(**overrides) -> StatutoryClockResult:
    base = dict(
        clock_id="T-CLOCK-ENGINE-1",
        case_reference="T-CASE-ENGINE",
        project_id="T-PROJ",
        parcel_id=None,
        applicable_act=ApplicableAct.RFCTLARR,
        section_reference="RFCTLARR s.19",
        rule_set_id="rfctlarr-s19-declaration-v1",
        rule_set_version="v1",
        trigger_event_id="T-EVT-1",
        trigger_date=date(2024, 1, 1),
        statutory_period="12 months",
        computed_deadline=date(2025, 1, 1),
        extension_status=ExtensionStatus.EXTENSION_UNKNOWN,
        extension_evidence_id=None,
        stay_adjustment_days=0,
        adjusted_deadline=date(2025, 1, 1),
        calculation_date=date(2024, 12, 20),
        days_elapsed=354,
        days_remaining=10,
        clock_status=ClockStatus.CLOCK_CERTAIN,
        consequence_class=ConsequenceClass.CLOCK_AT_RISK,
        calculation_basis=SourceType.SYNTHETIC_DEMO.value,
        source_references=["T-EVT-1"],
        calculated_at=datetime(2024, 12, 20, tzinfo=timezone.utc),
        calculation_version="test-1.0.0",
        event_conflict=None,
        notes="",
    )
    base.update(overrides)
    return StatutoryClockResult(**base)


class EngineMultipleBlockersTests(unittest.TestCase):
    def test_case_with_clock_and_disputed_parcel_raises_b1_and_b2(self):
        clock = _clock()
        parcel = ParcelEvidenceInput(
            case_reference="T-CASE-ENGINE",
            project_id="T-PROJ",
            parcel_id="T-P-ENGINE",
            ownership_dispute="Yes - Partition Suit",
            document_status="Disputed",
            record_confidence="Medium",
        )
        result = evaluate_case(
            case_reference="T-CASE-ENGINE",
            calculation_date=date(2024, 12, 20),
            clocks=(clock,),
            parcels=(parcel,),
        )
        raised_types = {b.blocker_type for b in result.blockers}
        self.assertEqual(raised_types, {BlockerType.B1, BlockerType.B2})
        self.assertIsNotNone(result.ranking.primary_blocker_id)
        # Every raised blocker has a corresponding action recommendation.
        self.assertEqual(len(result.actions), len(result.blockers))


class EngineProjectVsParcelScopeTests(unittest.TestCase):
    def test_project_level_clock_has_no_parcel_scope(self):
        clock = _clock(parcel_id=None)
        result = evaluate_case(case_reference="T-CASE-ENGINE", calculation_date=date(2024, 12, 20), clocks=(clock,))
        self.assertEqual(len(result.blockers), 1)
        self.assertIsNone(result.blockers[0].parcel_id)
        self.assertTrue(result.blockers[0].affects_project)

    def test_parcel_scoped_blocker_reports_its_own_parcel(self):
        parcel = ParcelEvidenceInput(
            case_reference="T-CASE-ENGINE",
            parcel_id="T-P-ENGINE",
            compensation_status="Under Dispute in LA-RA Authority",
        )
        result = evaluate_case(case_reference="T-CASE-ENGINE", calculation_date=date(2024, 6, 1), parcels=(parcel,))
        self.assertEqual(len(result.blockers), 1)
        self.assertEqual(result.blockers[0].parcel_id, "T-P-ENGINE")
        self.assertFalse(result.blockers[0].affects_project)


class EngineMissingEvidenceTests(unittest.TestCase):
    def test_no_clocks_and_no_parcels_raises_nothing(self):
        result = evaluate_case(case_reference="T-CASE-EMPTY", calculation_date=date(2024, 6, 1))
        self.assertEqual(result.blockers, ())
        self.assertIsNone(result.ranking.primary_blocker_id)
        self.assertEqual(result.actions, ())

    def test_empty_parcel_raises_no_blockers_but_records_evaluations(self):
        parcel = ParcelEvidenceInput(case_reference="T-CASE-EMPTY", parcel_id="T-P-EMPTY")
        result = evaluate_case(case_reference="T-CASE-EMPTY", calculation_date=date(2024, 6, 1), parcels=(parcel,))
        self.assertEqual(result.blockers, ())
        # B2, B3, B4 were each evaluated (and found no evidence), not silently skipped.
        self.assertEqual(len(result.evaluations), 3)


class EngineProvenancePreservationTests(unittest.TestCase):
    def test_every_blocker_carries_at_least_one_evidence_row(self):
        clock = _clock()
        result = evaluate_case(case_reference="T-CASE-ENGINE", calculation_date=date(2024, 12, 20), clocks=(clock,))
        for blocker in result.blockers:
            self.assertGreater(len(blocker.evidence), 0)
            for ev in blocker.evidence:
                self.assertTrue(ev.description)
                self.assertIsInstance(ev.verification_status, EvidenceVerificationStatus)


class EngineSingleParcelConvenienceTests(unittest.TestCase):
    def test_evaluate_single_parcel_matches_evaluate_case(self):
        parcel = ParcelEvidenceInput(
            case_reference="T-CASE-SINGLE",
            parcel_id="T-P-SINGLE",
            possession_status="Complete",
        )
        result = evaluate_single_parcel(
            case_reference="T-CASE-SINGLE", calculation_date=date(2024, 6, 1), parcel=parcel
        )
        self.assertEqual(result.blockers, ())


if __name__ == "__main__":
    unittest.main()
