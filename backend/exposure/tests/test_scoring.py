"""
Pure §9/§10/§11 formula tests. Mirrors backend/blockers/tests/'s own
unittest, hand-computed-expected-value conventions.
"""

from __future__ import annotations

import unittest
from datetime import date, datetime, timezone

from blockers.enums import BlockerSeverity, BlockerStatus, BlockerType
from blockers.models import Blocker, DownstreamExtent

from exposure import scoring
from exposure.enums import ConfidenceLabel, ExposureBand, PriorityBand


def _blocker(
    *,
    blocker_id="BLK-1",
    blocker_type=BlockerType.B1,
    status=BlockerStatus.DETECTED,
    severity=BlockerSeverity.HIGH,
    affects_possession=False,
    primary=False,
    calculated_at=None,
) -> Blocker:
    return Blocker(
        blocker_id=blocker_id,
        case_reference="CASE-1",
        project_id="PROJ-1",
        parcel_id="PARCEL-1",
        blocker_type=blocker_type,
        status=status,
        severity=severity,
        owner_role="Some Owner",
        responsible_authority="Some Authority",
        evidence=(),
        affects_possession=affects_possession,
        downstream_extent=DownstreamExtent(affected_parcel_count=1),
        primary=primary,
        calculated_at=calculated_at,
    )


class ConfidenceDiscountTests(unittest.TestCase):
    def test_confirmed_detected_suspected_discounts(self):
        self.assertAlmostEqual(scoring.confidence_discount(BlockerStatus.CONFIRMED), 1.0)
        self.assertAlmostEqual(scoring.confidence_discount(BlockerStatus.DETECTED), 2 / 3)
        self.assertAlmostEqual(scoring.confidence_discount(BlockerStatus.SUSPECTED), 1 / 3)

    def test_conflicted_and_insufficient_discount_to_zero(self):
        self.assertEqual(scoring.confidence_discount(BlockerStatus.CONFLICTED), 0.0)
        self.assertEqual(scoring.confidence_discount(BlockerStatus.INSUFFICIENT_EVIDENCE), 0.0)
        self.assertEqual(scoring.confidence_discount(BlockerStatus.RESOLVED), 0.0)


class LegalBandTests(unittest.TestCase):
    def test_no_b1_blocker_is_neutral(self):
        blockers = (_blocker(blocker_type=BlockerType.B2, severity=BlockerSeverity.CRITICAL),)
        band, ids, conflicted, insufficient = scoring.legal_band_from_blockers(blockers)
        self.assertEqual(band, scoring.NEUTRAL_BAND)
        self.assertEqual(ids, ())

    def test_confidence_gating_confirmed_outranks_suspected_same_severity(self):
        """Test 12 (audit §20): a CONFIRMED B1 outranks a SUSPECTED B1 of
        otherwise-identical severity."""
        confirmed = (_blocker(status=BlockerStatus.CONFIRMED, severity=BlockerSeverity.HIGH),)
        suspected = (_blocker(status=BlockerStatus.SUSPECTED, severity=BlockerSeverity.HIGH),)
        band_confirmed, _, _, _ = scoring.legal_band_from_blockers(confirmed)
        band_suspected, _, _, _ = scoring.legal_band_from_blockers(suspected)
        self.assertGreater(band_confirmed, band_suspected)

    def test_multiple_b1_blockers_take_the_worst(self):
        weak = _blocker(blocker_id="BLK-WEAK", status=BlockerStatus.SUSPECTED, severity=BlockerSeverity.WATCH)
        strong = _blocker(blocker_id="BLK-STRONG", status=BlockerStatus.CONFIRMED, severity=BlockerSeverity.CRITICAL)
        band, ids, _, _ = scoring.legal_band_from_blockers((weak, strong))
        self.assertAlmostEqual(band, scoring.severity_rank(BlockerSeverity.CRITICAL) * 1.0)
        self.assertEqual(ids, ("BLK-STRONG",))

    def test_conflicted_and_insufficient_b1_reported_but_not_positive(self):
        conflicted = _blocker(status=BlockerStatus.CONFLICTED, severity=BlockerSeverity.CRITICAL)
        insufficient = _blocker(
            blocker_id="BLK-2", status=BlockerStatus.INSUFFICIENT_EVIDENCE, severity=BlockerSeverity.CRITICAL
        )
        band, ids, conflicted_ids, insufficient_ids = scoring.legal_band_from_blockers((conflicted, insufficient))
        self.assertEqual(band, scoring.NEUTRAL_BAND)
        self.assertEqual(ids, ())
        self.assertEqual(conflicted_ids, ("BLK-1",))
        self.assertEqual(insufficient_ids, ("BLK-2",))


class PossessionBandTests(unittest.TestCase):
    def test_confirmed_possession_blocker_reaches_max(self):
        """Test 7 (audit §20): B4 CONFIRMED possession-blocked case's
        possession_band is provably at maximum versus an otherwise-identical
        case with no B4 raised."""
        blocked = (_blocker(blocker_type=BlockerType.B4, status=BlockerStatus.CONFIRMED, affects_possession=True),)
        not_blocked = (_blocker(blocker_type=BlockerType.B1, affects_possession=False),)
        band_blocked, ids = scoring.possession_band_from_blockers(blocked)
        band_not_blocked, _ = scoring.possession_band_from_blockers(not_blocked)
        self.assertEqual(band_blocked, 4.0)
        self.assertEqual(ids, ("BLK-1",))
        self.assertEqual(band_not_blocked, scoring.NEUTRAL_BAND)

    def test_suspected_possession_signal_does_not_count(self):
        suspected = (_blocker(blocker_type=BlockerType.B4, status=BlockerStatus.SUSPECTED, affects_possession=True),)
        band, ids = scoring.possession_band_from_blockers(suspected)
        self.assertEqual(band, scoring.NEUTRAL_BAND)
        self.assertEqual(ids, ())

    def test_b2_b3_severity_never_used_as_possession_multiplier(self):
        """Double-count guard: possession_band never reads severity at all --
        a CRITICAL-severity B3 contributes the same possession_band as a
        WATCH-severity one, as long as both are DETECTED+affects_possession."""
        low_sev = (
            _blocker(
                blocker_type=BlockerType.B3,
                status=BlockerStatus.DETECTED,
                severity=BlockerSeverity.WATCH,
                affects_possession=True,
            ),
        )
        high_sev = (
            _blocker(
                blocker_type=BlockerType.B3,
                status=BlockerStatus.DETECTED,
                severity=BlockerSeverity.CRITICAL,
                affects_possession=True,
            ),
        )
        band_low, _ = scoring.possession_band_from_blockers(low_sev)
        band_high, _ = scoring.possession_band_from_blockers(high_sev)
        self.assertEqual(band_low, band_high)


class DownstreamBandTests(unittest.TestCase):
    def test_self_parcel_default_is_one(self):
        """Section 6: today's demo default is always self-only (band=1)."""
        self.assertEqual(scoring.downstream_band(1), 1.0)

    def test_none_is_neutral_not_zero(self):
        self.assertEqual(scoring.downstream_band(None), scoring.NEUTRAL_BAND)

    def test_bounded_at_four(self):
        self.assertEqual(scoring.downstream_band(999), 4.0)


class ProjectScaleBandTests(unittest.TestCase):
    def test_missing_value_is_neutral(self):
        band, neutral = scoring.project_scale_band(None, [10.0, 20.0, 30.0, 40.0])
        self.assertEqual(band, scoring.NEUTRAL_BAND)
        self.assertTrue(neutral)

    def test_insufficient_reference_set_is_neutral(self):
        band, neutral = scoring.project_scale_band(500.0, [10.0, 20.0])
        self.assertEqual(band, scoring.NEUTRAL_BAND)
        self.assertTrue(neutral)

    def test_bounded_by_quartile_not_raw_value(self):
        """Test 8 (audit §20): two cases differing only in project_value_crores
        rank differently, but boundedly (never exceeding band 4)."""
        refs = [10.0, 20.0, 30.0, 40.0]
        band_small, _ = scoring.project_scale_band(10.0, refs)
        band_huge, _ = scoring.project_scale_band(1_000_000.0, refs)
        self.assertGreater(band_huge, band_small)
        self.assertLessEqual(band_huge, 4.0)
        self.assertGreaterEqual(band_small, 1.0)


class SecondaryBonusTests(unittest.TestCase):
    def test_no_secondary_blockers_zero_bonus(self):
        self.assertEqual(scoring.secondary_bonus(()), 0.0)

    def test_bounded_combination(self):
        """Test 5 (audit §20): B1+B2+B3 all DETECTED scores higher than B1
        DETECTED alone, but by no more than the documented cap (0.5)."""
        secondaries = (
            _blocker(blocker_id="S1", blocker_type=BlockerType.B2, status=BlockerStatus.DETECTED, severity=BlockerSeverity.HIGH),
            _blocker(blocker_id="S2", blocker_type=BlockerType.B3, status=BlockerStatus.DETECTED, severity=BlockerSeverity.HIGH),
        )
        bonus = scoring.secondary_bonus(secondaries)
        self.assertGreater(bonus, 0.0)
        self.assertLessEqual(bonus, 0.5)

    def test_many_weak_secondaries_cannot_exceed_cap(self):
        weak_secondaries = tuple(
            _blocker(blocker_id=f"WEAK-{i}", status=BlockerStatus.SUSPECTED, severity=BlockerSeverity.CRITICAL)
            for i in range(20)
        )
        bonus = scoring.secondary_bonus(weak_secondaries)
        self.assertLessEqual(bonus, 0.5)

    def test_conflicted_secondary_contributes_nothing(self):
        secondaries = (_blocker(status=BlockerStatus.CONFLICTED, severity=BlockerSeverity.CRITICAL),)
        self.assertEqual(scoring.secondary_bonus(secondaries), 0.0)


class ExposureFormulaTests(unittest.TestCase):
    def test_monotonicity_legal_band(self):
        """Test 1 (audit §20): increasing legal_band alone never decreases
        exposure_score."""
        _, low_score, _ = scoring.compute_exposure(
            legal_band=0, possession_band=1, downstream_band_value=1, project_scale_band_value=1, secondary_bonus_value=0
        )
        _, high_score, _ = scoring.compute_exposure(
            legal_band=4, possession_band=1, downstream_band_value=1, project_scale_band_value=1, secondary_bonus_value=0
        )
        self.assertGreaterEqual(high_score, low_score)

    def test_monotonicity_all_axes(self):
        bands = [0, 1, 2, 3, 4]
        prev_score = -1.0
        for b in bands:
            _, score, _ = scoring.compute_exposure(
                legal_band=b, possession_band=b, downstream_band_value=b, project_scale_band_value=b, secondary_bonus_value=0
            )
            self.assertGreaterEqual(score, prev_score)
            prev_score = score

    def test_bounds_0_to_100(self):
        _, min_score, _ = scoring.compute_exposure(
            legal_band=0, possession_band=0, downstream_band_value=0, project_scale_band_value=0, secondary_bonus_value=0
        )
        _, max_score, _ = scoring.compute_exposure(
            legal_band=4, possession_band=4, downstream_band_value=4, project_scale_band_value=4, secondary_bonus_value=0.5
        )
        self.assertGreaterEqual(min_score, 0.0)
        self.assertLessEqual(max_score, 100.0)
        self.assertEqual(max_score, 100.0)
        self.assertEqual(min_score, 0.0)

    def test_band_boundaries(self):
        self.assertEqual(scoring.exposure_band_for_score(75.0), ExposureBand.CRITICAL)
        self.assertEqual(scoring.exposure_band_for_score(74.99), ExposureBand.HIGH)
        self.assertEqual(scoring.exposure_band_for_score(50.0), ExposureBand.HIGH)
        self.assertEqual(scoring.exposure_band_for_score(49.99), ExposureBand.MODERATE)
        self.assertEqual(scoring.exposure_band_for_score(25.0), ExposureBand.MODERATE)
        self.assertEqual(scoring.exposure_band_for_score(24.99), ExposureBand.LOW)
        self.assertEqual(scoring.exposure_band_for_score(0.0), ExposureBand.LOW)


class PriorityFormulaTests(unittest.TestCase):
    def test_monotonicity_urgency(self):
        """Priority monotonicity: increasing urgency_band alone never
        decreases priority_score."""
        prev = -1.0
        for u in (1, 2, 3, 4):
            _, score, _, _ = scoring.compute_priority(exposure_score=50.0, urgency_band_value=u, actionability_band_value=1)
            self.assertGreaterEqual(score, prev)
            prev = score

    def test_bounds_0_to_100(self):
        _, min_score, _, _ = scoring.compute_priority(exposure_score=0.0, urgency_band_value=1, actionability_band_value=1)
        _, max_score, _, _ = scoring.compute_priority(exposure_score=100.0, urgency_band_value=4, actionability_band_value=4)
        self.assertGreaterEqual(min_score, 0.0)
        self.assertLessEqual(max_score, 100.0)
        self.assertEqual(max_score, 100.0)

    def test_band_boundaries(self):
        self.assertEqual(scoring.priority_band_for_score(75.0), PriorityBand.ACT_NOW)
        self.assertEqual(scoring.priority_band_for_score(74.99), PriorityBand.SOON)
        self.assertEqual(scoring.priority_band_for_score(50.0), PriorityBand.SOON)
        self.assertEqual(scoring.priority_band_for_score(49.99), PriorityBand.MONITOR)
        self.assertEqual(scoring.priority_band_for_score(25.0), PriorityBand.MONITOR)
        self.assertEqual(scoring.priority_band_for_score(24.99), PriorityBand.WATCH)

    def test_urgency_worked_example(self):
        """Test 6 (audit §20/§11's own worked example): a small-exposure case
        with a genuinely urgent clock (<=14 days -> urgency_band=4, per the
        exact §11 threshold table) outranks a large-exposure case with a
        distant/no clock (18 months -> urgency_band=1) under the default
        weights -- the brief's own 'huge exposure far out vs. small exposure
        imminent' example, achievable because urgency and exposure carry
        equal weight (v1=v2=0.4)."""
        # 10-day case: modest exposure (~band 2 equivalent -> exposure_score ~50)
        _, urgent_score, urgent_band, _ = scoring.compute_priority(
            exposure_score=50.0, urgency_band_value=scoring.urgency_band(10), actionability_band_value=4
        )
        # 18-month case: large exposure (~band 4 -> exposure_score 100), but no urgency
        _, distant_score, distant_band, _ = scoring.compute_priority(
            exposure_score=100.0, urgency_band_value=scoring.urgency_band(18 * 30), actionability_band_value=4
        )
        self.assertEqual(scoring.urgency_band(10), 4)
        self.assertEqual(scoring.urgency_band(18 * 30), 1)
        self.assertGreater(urgent_score, distant_score)


class UrgencyActionabilityTests(unittest.TestCase):
    def test_urgency_thresholds(self):
        self.assertEqual(scoring.urgency_band(14), 4)
        self.assertEqual(scoring.urgency_band(15), 3)
        self.assertEqual(scoring.urgency_band(30), 3)
        self.assertEqual(scoring.urgency_band(31), 2)
        self.assertEqual(scoring.urgency_band(90), 2)
        self.assertEqual(scoring.urgency_band(91), 1)
        self.assertEqual(scoring.urgency_band(None), 1)
        self.assertEqual(scoring.urgency_band(-5), 4)  # already overdue is at least as urgent

    def test_actionability_thresholds(self):
        self.assertEqual(scoring.actionability_band(BlockerStatus.CONFIRMED), 4)
        self.assertEqual(scoring.actionability_band(BlockerStatus.DETECTED), 4)
        self.assertEqual(scoring.actionability_band(BlockerStatus.SUSPECTED), 1)
        self.assertEqual(scoring.actionability_band(BlockerStatus.CONFLICTED), 1)
        self.assertEqual(scoring.actionability_band(BlockerStatus.INSUFFICIENT_EVIDENCE), 1)
        self.assertEqual(scoring.actionability_band(None), 1)


class StalenessTests(unittest.TestCase):
    def test_missing_timestamp_never_stale(self):
        self.assertFalse(scoring.is_stale(None, datetime(2026, 1, 1, tzinfo=timezone.utc)))

    def test_stale_beyond_threshold(self):
        old = datetime(2025, 1, 1, tzinfo=timezone.utc)
        now = datetime(2026, 6, 1, tzinfo=timezone.utc)
        self.assertTrue(scoring.is_stale(old, now, threshold_days=90))

    def test_not_stale_within_threshold(self):
        recent = datetime(2026, 5, 20, tzinfo=timezone.utc)
        now = datetime(2026, 6, 1, tzinfo=timezone.utc)
        self.assertFalse(scoring.is_stale(recent, now, threshold_days=90))

    def test_naive_and_aware_datetimes_never_crash(self):
        """Regression: SQLite's DateTime(timezone=True) columns round-trip as
        naive datetimes (SQLite has no native timestamp type), while the
        in-memory engine's own _utcnow() is timezone-aware. Any naive/aware
        combination must compare without raising, and naive values are
        trusted as already-UTC."""
        naive_old = datetime(2025, 1, 1)  # no tzinfo, as a DB round-trip would produce
        aware_now = datetime(2026, 6, 1, tzinfo=timezone.utc)
        self.assertTrue(scoring.is_stale(naive_old, aware_now, threshold_days=90))

        aware_old = datetime(2025, 1, 1, tzinfo=timezone.utc)
        naive_now = datetime(2026, 6, 1)
        self.assertTrue(scoring.is_stale(aware_old, naive_now, threshold_days=90))

        naive_recent = datetime(2026, 5, 20)
        naive_now2 = datetime(2026, 6, 1)
        self.assertFalse(scoring.is_stale(naive_recent, naive_now2, threshold_days=90))


class ConfidenceLabelTests(unittest.TestCase):
    def test_default_verified(self):
        label = scoring.compute_confidence_label(
            has_conflicted_blocker=False,
            has_insufficient_blocker=False,
            no_confident_primary_but_blockers_exist=False,
            clock_status=None,
            legal_band_is_neutral_no_b1=False,
            project_scale_is_neutral=False,
            prediction_is_stale=False,
            blocker_evidence_is_stale=False,
        )
        self.assertEqual(label, ConfidenceLabel.VERIFIED)

    def test_conflicted_forces_needs_verification(self):
        label = scoring.compute_confidence_label(
            has_conflicted_blocker=True,
            has_insufficient_blocker=False,
            no_confident_primary_but_blockers_exist=False,
            clock_status=None,
            legal_band_is_neutral_no_b1=False,
            project_scale_is_neutral=False,
            prediction_is_stale=False,
            blocker_evidence_is_stale=False,
        )
        self.assertEqual(label, ConfidenceLabel.NEEDS_VERIFICATION)

    def test_no_confident_primary_forces_insufficient(self):
        label = scoring.compute_confidence_label(
            has_conflicted_blocker=False,
            has_insufficient_blocker=True,
            no_confident_primary_but_blockers_exist=True,
            clock_status=None,
            legal_band_is_neutral_no_b1=False,
            project_scale_is_neutral=False,
            prediction_is_stale=False,
            blocker_evidence_is_stale=False,
        )
        self.assertEqual(label, ConfidenceLabel.INSUFFICIENT)

    def test_clock_uncertain_forces_needs_verification(self):
        label = scoring.compute_confidence_label(
            has_conflicted_blocker=False,
            has_insufficient_blocker=False,
            no_confident_primary_but_blockers_exist=False,
            clock_status="CLOCK_UNCERTAIN",
            legal_band_is_neutral_no_b1=False,
            project_scale_is_neutral=False,
            prediction_is_stale=False,
            blocker_evidence_is_stale=False,
        )
        self.assertEqual(label, ConfidenceLabel.NEEDS_VERIFICATION)

    def test_extension_unverified_forces_partial(self):
        label = scoring.compute_confidence_label(
            has_conflicted_blocker=False,
            has_insufficient_blocker=False,
            no_confident_primary_but_blockers_exist=False,
            clock_status="EXTENSION_UNVERIFIED",
            legal_band_is_neutral_no_b1=False,
            project_scale_is_neutral=False,
            prediction_is_stale=False,
            blocker_evidence_is_stale=False,
        )
        self.assertEqual(label, ConfidenceLabel.PARTIAL)

    def test_two_missing_notches_downgrade_two_steps(self):
        label = scoring.compute_confidence_label(
            has_conflicted_blocker=False,
            has_insufficient_blocker=False,
            no_confident_primary_but_blockers_exist=False,
            clock_status=None,
            legal_band_is_neutral_no_b1=True,
            project_scale_is_neutral=True,
            prediction_is_stale=False,
            blocker_evidence_is_stale=False,
        )
        self.assertEqual(label, ConfidenceLabel.NEEDS_VERIFICATION)

    def test_stale_evidence_downgrades_one_notch(self):
        label = scoring.compute_confidence_label(
            has_conflicted_blocker=False,
            has_insufficient_blocker=False,
            no_confident_primary_but_blockers_exist=False,
            clock_status=None,
            legal_band_is_neutral_no_b1=False,
            project_scale_is_neutral=False,
            prediction_is_stale=True,
            blocker_evidence_is_stale=False,
        )
        self.assertEqual(label, ConfidenceLabel.PARTIAL)

    def test_never_upgrades_past_verified(self):
        from exposure.enums import downgrade_confidence

        self.assertEqual(downgrade_confidence(ConfidenceLabel.VERIFIED, 0), ConfidenceLabel.VERIFIED)
        self.assertEqual(downgrade_confidence(ConfidenceLabel.VERIFIED, -5), ConfidenceLabel.VERIFIED)

    def test_downgrade_clamps_at_insufficient(self):
        from exposure.enums import downgrade_confidence

        self.assertEqual(downgrade_confidence(ConfidenceLabel.VERIFIED, 99), ConfidenceLabel.INSUFFICIENT)


if __name__ == "__main__":
    unittest.main()
