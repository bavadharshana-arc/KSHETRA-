import unittest
from datetime import date

from legal.enums import EvidenceVerificationStatus, StayScope
from legal.rule_seed_data import RFCTLARR_S19_DECLARATION, RFCTLARR_S25_AWARD
from legal.stays import CourtStayEvent, compute_stay_adjustment, stay_applies_to_clock

CASE = "T-CASE-STAYS"


def _stay(**overrides):
    base = dict(
        stay_id="T-STAY-1",
        case_reference=CASE,
        court="Test Court",
        order_date=date(2024, 2, 1),
        effective_from=date(2024, 2, 1),
        effective_to=date(2024, 3, 2),  # 30 days
        scope=StayScope.PROJECT,
        affected_parcels=(),
        affected_stage=None,
        source_document="T-DOC",
        verification_status=EvidenceVerificationStatus.VERIFIED,
    )
    base.update(overrides)
    return CourtStayEvent(**base)


class StayAppliesTests(unittest.TestCase):
    def test_verified_project_scope_applies_on_express_statutory_rule(self):
        stay = _stay(scope=StayScope.PROJECT)
        applicability = stay_applies_to_clock(stay, RFCTLARR_S19_DECLARATION, "RFCTLARR s.19", None)
        self.assertTrue(applicability.applies)

    def test_unverified_stay_never_applies(self):
        stay = _stay(verification_status=EvidenceVerificationStatus.CLAIMED)
        applicability = stay_applies_to_clock(stay, RFCTLARR_S19_DECLARATION, "RFCTLARR s.19", None)
        self.assertFalse(applicability.applies)

    def test_parcel_scope_matching_parcel_applies(self):
        stay = _stay(scope=StayScope.PARCEL, affected_parcels=("P-1", "P-2"))
        applicability = stay_applies_to_clock(stay, RFCTLARR_S19_DECLARATION, "RFCTLARR s.19", "P-1")
        self.assertTrue(applicability.applies)

    def test_parcel_scope_non_matching_parcel_does_not_apply(self):
        stay = _stay(scope=StayScope.PARCEL, affected_parcels=("P-1",))
        applicability = stay_applies_to_clock(stay, RFCTLARR_S19_DECLARATION, "RFCTLARR s.19", "P-999")
        self.assertFalse(applicability.applies)
        self.assertFalse(applicability.ambiguous_scope)

    def test_parcel_scope_with_no_parcel_list_is_ambiguous(self):
        stay = _stay(scope=StayScope.PARCEL, affected_parcels=())
        applicability = stay_applies_to_clock(stay, RFCTLARR_S19_DECLARATION, "RFCTLARR s.19", "P-1")
        self.assertFalse(applicability.applies)
        self.assertTrue(applicability.ambiguous_scope)

    def test_stage_scope_mismatch_does_not_apply(self):
        stay = _stay(scope=StayScope.STAGE, affected_stage="RFCTLARR s.25")
        applicability = stay_applies_to_clock(stay, RFCTLARR_S19_DECLARATION, "RFCTLARR s.19", None)
        self.assertFalse(applicability.applies)

    def test_case_law_only_rule_never_silently_applies(self):
        """RFCTLARR s.25's stay_definition is case-law-only (permitted=False)
        — a verified, in-scope stay must be flagged rule_uncertain, never
        silently applied and never silently ignored."""
        stay = _stay(scope=StayScope.PROJECT)
        applicability = stay_applies_to_clock(stay, RFCTLARR_S25_AWARD, "RFCTLARR s.25", None)
        self.assertFalse(applicability.applies)
        self.assertTrue(applicability.rule_uncertain)


class ComputeStayAdjustmentTests(unittest.TestCase):
    def test_applied_stay_contributes_days(self):
        stay = _stay(effective_from=date(2024, 2, 1), effective_to=date(2024, 3, 1))
        days, applied, ambiguous, rule_uncertain = compute_stay_adjustment(
            [stay], RFCTLARR_S19_DECLARATION, "RFCTLARR s.19", None,
            trigger_date=date(2024, 1, 1), calculation_date=date(2024, 6, 1),
        )
        self.assertEqual(days, 30)  # Feb 1 - Mar 1 inclusive-of-both-ends day-union = 30 days
        self.assertEqual(len(applied), 1)
        self.assertEqual(ambiguous, [])
        self.assertEqual(rule_uncertain, [])

    def test_non_applying_stay_contributes_no_days(self):
        stay = _stay(scope=StayScope.PARCEL, affected_parcels=("OTHER-PARCEL",))
        days, applied, ambiguous, rule_uncertain = compute_stay_adjustment(
            [stay], RFCTLARR_S19_DECLARATION, "RFCTLARR s.19", "P-1",
            trigger_date=date(2024, 1, 1), calculation_date=date(2024, 6, 1),
        )
        self.assertEqual(days, 0)
        self.assertEqual(applied, [])

    def test_partial_parcel_stay_isolated_to_its_parcel(self):
        stay = _stay(scope=StayScope.PARCEL, affected_parcels=("P-1",),
                     effective_from=date(2024, 2, 1), effective_to=date(2024, 3, 1))
        days_p1, applied_p1, _, _ = compute_stay_adjustment(
            [stay], RFCTLARR_S19_DECLARATION, "RFCTLARR s.19", "P-1",
            trigger_date=date(2024, 1, 1), calculation_date=date(2024, 6, 1),
        )
        days_p2, applied_p2, _, _ = compute_stay_adjustment(
            [stay], RFCTLARR_S19_DECLARATION, "RFCTLARR s.19", "P-2",
            trigger_date=date(2024, 1, 1), calculation_date=date(2024, 6, 1),
        )
        self.assertEqual(days_p1, 30)
        self.assertEqual(len(applied_p1), 1)
        self.assertEqual(days_p2, 0)
        self.assertEqual(applied_p2, [])

    def test_overlapping_stays_not_double_counted(self):
        stay_a = _stay(stay_id="S-A", effective_from=date(2024, 2, 1), effective_to=date(2024, 2, 20))
        stay_b = _stay(stay_id="S-B", effective_from=date(2024, 2, 10), effective_to=date(2024, 3, 1))
        days, applied, _, _ = compute_stay_adjustment(
            [stay_a, stay_b], RFCTLARR_S19_DECLARATION, "RFCTLARR s.19", None,
            trigger_date=date(2024, 1, 1), calculation_date=date(2024, 6, 1),
        )
        # Union of Feb 1 - Mar 1 = 30 days, NOT 20 + 20 = 40.
        self.assertEqual(days, 30)
        self.assertEqual(len(applied), 2)


if __name__ == "__main__":
    unittest.main()
