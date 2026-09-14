import unittest
from datetime import date, datetime, timezone

from blockers.enums import BlockerSeverity, BlockerStatus, BlockerType
from blockers.models import Blocker, DownstreamExtent
from blockers.ranking import rank_blockers


def _blocker(
    blocker_id: str,
    blocker_type: BlockerType,
    status: BlockerStatus,
    severity: BlockerSeverity,
    *,
    affected_parcel_count=None,
    owner_role="Some Authority",
) -> Blocker:
    return Blocker(
        blocker_id=blocker_id,
        case_reference="T-CASE-RANK",
        project_id="T-PROJ",
        parcel_id="T-P-RANK",
        blocker_type=blocker_type,
        status=status,
        severity=severity,
        owner_role=owner_role,
        responsible_authority="Some Authority Office",
        evidence=(),
        downstream_extent=DownstreamExtent(affected_parcel_count=affected_parcel_count),
        calculation_date=date(2024, 6, 1),
        calculated_at=datetime(2024, 6, 1, tzinfo=timezone.utc),
    )


class RankingSeverityFirstTests(unittest.TestCase):
    def test_higher_severity_wins_regardless_of_blocker_type(self):
        low_severity_b1 = _blocker("BLK-1", BlockerType.B1, BlockerStatus.DETECTED, BlockerSeverity.MODERATE)
        high_severity_b3 = _blocker("BLK-2", BlockerType.B3, BlockerStatus.DETECTED, BlockerSeverity.CRITICAL)
        ranked, result = rank_blockers((low_severity_b1, high_severity_b3))
        self.assertEqual(result.primary_blocker_id, "BLK-2")
        self.assertEqual(result.secondary_blocker_ids, ("BLK-1",))

    def test_never_hardcoded_b1_over_b2(self):
        """The explicit anti-requirement: B2 with higher severity/confidence
        must outrank B1 with lower severity/confidence."""
        weak_b1 = _blocker("BLK-1", BlockerType.B1, BlockerStatus.SUSPECTED, BlockerSeverity.WATCH)
        strong_b2 = _blocker("BLK-2", BlockerType.B2, BlockerStatus.CONFIRMED, BlockerSeverity.CRITICAL)
        _, result = rank_blockers((weak_b1, strong_b2))
        self.assertEqual(result.primary_blocker_id, "BLK-2")


class RankingConfidenceTiebreakTests(unittest.TestCase):
    def test_confirmed_beats_detected_at_equal_severity(self):
        detected = _blocker("BLK-1", BlockerType.B2, BlockerStatus.DETECTED, BlockerSeverity.HIGH)
        confirmed = _blocker("BLK-2", BlockerType.B4, BlockerStatus.CONFIRMED, BlockerSeverity.HIGH)
        _, result = rank_blockers((detected, confirmed))
        self.assertEqual(result.primary_blocker_id, "BLK-2")


class RankingIneligibleStatusesTests(unittest.TestCase):
    def test_conflicted_never_selected_as_primary_even_with_critical_severity(self):
        conflicted = _blocker("BLK-1", BlockerType.B2, BlockerStatus.CONFLICTED, BlockerSeverity.CRITICAL)
        weak_detected = _blocker("BLK-2", BlockerType.B3, BlockerStatus.DETECTED, BlockerSeverity.INFORMATIONAL)
        _, result = rank_blockers((conflicted, weak_detected))
        self.assertEqual(result.primary_blocker_id, "BLK-2")

    def test_only_conflicted_and_insufficient_yields_no_primary(self):
        conflicted = _blocker("BLK-1", BlockerType.B2, BlockerStatus.CONFLICTED, BlockerSeverity.HIGH)
        insufficient = _blocker("BLK-2", BlockerType.B3, BlockerStatus.INSUFFICIENT_EVIDENCE, BlockerSeverity.HIGH)
        _, result = rank_blockers((conflicted, insufficient))
        self.assertIsNone(result.primary_blocker_id)
        self.assertTrue(result.note)  # explanatory note is present, never a silent None

    def test_empty_input_yields_no_primary(self):
        _, result = rank_blockers(())
        self.assertIsNone(result.primary_blocker_id)
        self.assertEqual(result.ordered_blocker_ids, ())


class RankingDownstreamExtentTiebreakTests(unittest.TestCase):
    def test_larger_extent_wins_at_equal_severity_and_confidence(self):
        small = _blocker("BLK-1", BlockerType.B2, BlockerStatus.DETECTED, BlockerSeverity.HIGH, affected_parcel_count=1)
        large = _blocker("BLK-2", BlockerType.B3, BlockerStatus.DETECTED, BlockerSeverity.HIGH, affected_parcel_count=5)
        _, result = rank_blockers((small, large))
        self.assertEqual(result.primary_blocker_id, "BLK-2")

    def test_unknown_extent_does_not_crash_and_ranks_below_known_extent(self):
        unknown = _blocker("BLK-1", BlockerType.B1, BlockerStatus.DETECTED, BlockerSeverity.HIGH, affected_parcel_count=None)
        known = _blocker("BLK-2", BlockerType.B2, BlockerStatus.DETECTED, BlockerSeverity.HIGH, affected_parcel_count=2)
        _, result = rank_blockers((unknown, known))
        self.assertEqual(result.primary_blocker_id, "BLK-2")


class RankingMostActionableTests(unittest.TestCase):
    def test_most_actionable_is_none_when_it_equals_primary(self):
        only = _blocker("BLK-1", BlockerType.B1, BlockerStatus.DETECTED, BlockerSeverity.HIGH)
        _, result = rank_blockers((only,))
        self.assertEqual(result.primary_blocker_id, "BLK-1")
        self.assertIsNone(result.most_actionable_blocker_id)

    def test_most_actionable_can_differ_from_primary(self):
        # SUSPECTED is primary-eligible but NOT actionable (_is_actionable
        # requires CONFIRMED/DETECTED) -- its higher severity still wins
        # primary, while the lower-severity DETECTED blocker is the one
        # surfaced as most-actionable, demonstrating the two are genuinely
        # independent rankings, never silently substituted for each other.
        high_severity_suspected = _blocker(
            "BLK-1", BlockerType.B2, BlockerStatus.SUSPECTED, BlockerSeverity.CRITICAL
        )
        lower_severity_detected = _blocker("BLK-2", BlockerType.B3, BlockerStatus.DETECTED, BlockerSeverity.MODERATE)
        _, result = rank_blockers((high_severity_suspected, lower_severity_detected))
        self.assertEqual(result.primary_blocker_id, "BLK-1")
        self.assertEqual(result.most_actionable_blocker_id, "BLK-2")


class RankingPrimaryFlagAttachmentTests(unittest.TestCase):
    def test_primary_flag_and_ranking_basis_are_attached_to_returned_blockers(self):
        a = _blocker("BLK-1", BlockerType.B1, BlockerStatus.DETECTED, BlockerSeverity.HIGH)
        b = _blocker("BLK-2", BlockerType.B2, BlockerStatus.DETECTED, BlockerSeverity.MODERATE)
        updated, result = rank_blockers((a, b))
        by_id = {blk.blocker_id: blk for blk in updated}
        self.assertTrue(by_id["BLK-1"].primary)
        self.assertFalse(by_id["BLK-2"].primary)
        self.assertIn("severity_rank", by_id["BLK-1"].ranking_basis)


class RankingDeterminismTests(unittest.TestCase):
    def test_repeated_ranking_of_identical_input_is_identical(self):
        a = _blocker("BLK-1", BlockerType.B1, BlockerStatus.DETECTED, BlockerSeverity.HIGH, affected_parcel_count=1)
        b = _blocker("BLK-2", BlockerType.B2, BlockerStatus.DETECTED, BlockerSeverity.HIGH, affected_parcel_count=1)
        c = _blocker("BLK-3", BlockerType.B3, BlockerStatus.SUSPECTED, BlockerSeverity.WATCH)
        first_updated, first_result = rank_blockers((a, b, c))
        second_updated, second_result = rank_blockers((a, b, c))
        self.assertEqual(first_result, second_result)
        self.assertEqual(
            [blk.primary for blk in first_updated], [blk.primary for blk in second_updated]
        )


if __name__ == "__main__":
    unittest.main()
