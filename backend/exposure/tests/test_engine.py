"""
Engine-level (orchestration) tests: uncertainty cap, missing data, no
hardcoded B1>B2>B3>B4 priority, double-count protection, conflicted/
insufficient evidence, no statutory clock, apparent lapse, extension
unverified, self-parcel downstream, owner/action propagation, component
trace, reproducibility, 0-100 bounds.
"""

from __future__ import annotations

import unittest
from datetime import date, datetime, timezone

from blockers.enums import BlockerSeverity, BlockerStatus, BlockerType
from blockers.models import Blocker, DownstreamExtent

from exposure import engine
from exposure.enums import ConfidenceLabel, ExposureBand, PriorityBand

_CALC_DATE = date(2026, 9, 15)
_CALC_AT = datetime(2026, 9, 15, tzinfo=timezone.utc)


def _blocker(
    *,
    blocker_id,
    blocker_type,
    status,
    severity,
    affects_possession=False,
    primary=False,
    owner_role="Owner X",
    responsible_authority="Authority X",
    notes="",
    calculated_at=_CALC_AT,
    affected_clock_ids=(),
) -> Blocker:
    return Blocker(
        blocker_id=blocker_id,
        case_reference="CASE-1",
        project_id="PROJ-1",
        parcel_id="PARCEL-1",
        blocker_type=blocker_type,
        status=status,
        severity=severity,
        owner_role=owner_role,
        responsible_authority=responsible_authority,
        evidence=(),
        affects_possession=affects_possession,
        affected_clock_ids=affected_clock_ids,
        downstream_extent=DownstreamExtent(affected_parcel_count=1),
        primary=primary,
        notes=notes,
        calculated_at=calculated_at,
    )


class NoEvidenceTests(unittest.TestCase):
    def test_returns_none_when_genuinely_no_evidence(self):
        """§12: 'the only case correctly absent from a ranked list is one
        with no evidence to rank at all.'"""
        result = engine.assess_case(
            case_reference="CASE-EMPTY",
            project_id="PROJ-1",
            parcel_id="PARCEL-1",
            blockers=(),
            calculation_date=_CALC_DATE,
            calculated_at=_CALC_AT,
        )
        self.assertIsNone(result)

    def test_prediction_alone_is_evidence_enough(self):
        result = engine.assess_case(
            case_reference="CASE-PRED-ONLY",
            project_id="PROJ-1",
            parcel_id="PARCEL-1",
            blockers=(),
            prediction_id="PRED-1",
            prediction_delay_probability=0.8,
            calculation_date=_CALC_DATE,
            calculated_at=_CALC_AT,
        )
        self.assertIsNotNone(result)


class UncertaintyCapTests(unittest.TestCase):
    def test_clock_uncertain_never_reaches_critical(self):
        """Test 3 (audit §20): a CLOCK_UNCERTAIN-backed case never reaches
        exposure_band=CRITICAL regardless of every other input being maxed."""
        b1_suspected = _blocker(
            blocker_id="BLK-B1",
            blocker_type=BlockerType.B1,
            status=BlockerStatus.SUSPECTED,
            severity=BlockerSeverity.WATCH,
            primary=True,
        )
        b4_confirmed = _blocker(
            blocker_id="BLK-B4",
            blocker_type=BlockerType.B4,
            status=BlockerStatus.CONFIRMED,
            severity=BlockerSeverity.CRITICAL,
            affects_possession=True,
        )
        result = engine.assess_case(
            case_reference="CASE-UNCERTAIN",
            project_id="PROJ-1",
            parcel_id="PARCEL-1",
            blockers=(b1_suspected, b4_confirmed),
            days_remaining=1,
            clock_status="CLOCK_UNCERTAIN",
            project_value_crores=1_000_000.0,
            reference_project_values=[1.0, 2.0, 3.0, 1_000_000.0],
            calculation_date=_CALC_DATE,
            calculated_at=_CALC_AT,
        )
        self.assertIsNotNone(result)
        self.assertNotEqual(result.exposure_band, ExposureBand.CRITICAL)
        self.assertEqual(result.confidence_label, ConfidenceLabel.NEEDS_VERIFICATION)


class MissingDataTests(unittest.TestCase):
    def test_missing_downstream_and_project_scale_is_non_crashing(self):
        """Test 4 (audit §20): a case with no downstream/no project-
        criticality data produces a valid, non-crashing, non-zero, non-max
        score with confidence_label downgraded (not suppressed)."""
        b2 = _blocker(
            blocker_id="BLK-B2", blocker_type=BlockerType.B2, status=BlockerStatus.DETECTED, severity=BlockerSeverity.MODERATE, primary=True
        )
        result = engine.assess_case(
            case_reference="CASE-MISSING",
            project_id="PROJ-1",
            parcel_id="PARCEL-1",
            blockers=(b2,),
            project_value_crores=None,
            reference_project_values=(),
            affected_parcel_count=None,
            calculation_date=_CALC_DATE,
            calculated_at=_CALC_AT,
        )
        self.assertIsNotNone(result)
        self.assertGreater(result.exposure_score, 0.0)
        self.assertLess(result.exposure_score, 100.0)
        self.assertNotEqual(result.confidence_label, ConfidenceLabel.VERIFIED)
        self.assertIn(
            "downstream_band: affected_parcel_count unknown (neutral=1).",
            result.component_trace.neutral_substitutions,
        )


class NoHardcodedBlockerOrderTests(unittest.TestCase):
    def test_b4_can_outrank_b1_as_actionability_driver(self):
        """No hardcoded B1 > B2 > B3 > B4: whichever blocker is flagged
        `.primary` (by blockers/ranking.py, upstream) drives actionability,
        never blocker_type identity."""
        b1_suspected = _blocker(
            blocker_id="BLK-B1", blocker_type=BlockerType.B1, status=BlockerStatus.SUSPECTED, severity=BlockerSeverity.WATCH
        )
        b4_confirmed_primary = _blocker(
            blocker_id="BLK-B4",
            blocker_type=BlockerType.B4,
            status=BlockerStatus.CONFIRMED,
            severity=BlockerSeverity.CRITICAL,
            affects_possession=True,
            primary=True,
        )
        result = engine.assess_case(
            case_reference="CASE-B4-PRIMARY",
            project_id="PROJ-1",
            parcel_id="PARCEL-1",
            blockers=(b1_suspected, b4_confirmed_primary),
            calculation_date=_CALC_DATE,
            calculated_at=_CALC_AT,
        )
        self.assertEqual(result.primary_blocker_id, "BLK-B4")
        self.assertEqual(result.component_trace.actionability_band, 4)  # driven by B4, not B1

    def test_b1_can_be_primary_over_b4(self):
        b1_confirmed_primary = _blocker(
            blocker_id="BLK-B1",
            blocker_type=BlockerType.B1,
            status=BlockerStatus.CONFIRMED,
            severity=BlockerSeverity.CRITICAL,
            primary=True,
        )
        b4_suspected = _blocker(
            blocker_id="BLK-B4", blocker_type=BlockerType.B4, status=BlockerStatus.SUSPECTED, severity=BlockerSeverity.WATCH
        )
        result = engine.assess_case(
            case_reference="CASE-B1-PRIMARY",
            project_id="PROJ-1",
            parcel_id="PARCEL-1",
            blockers=(b1_confirmed_primary, b4_suspected),
            calculation_date=_CALC_DATE,
            calculated_at=_CALC_AT,
        )
        self.assertEqual(result.primary_blocker_id, "BLK-B1")


class DoubleCountingTests(unittest.TestCase):
    def test_b2_b3_severity_alone_does_not_inflate_exposure_like_legal_or_possession(self):
        """A lone B2/B3 blocker (no B1, no possession flag) can only ever
        move exposure through `secondary_bonus`/neutral bands -- never
        through `legal_band` or `possession_band`, which are reserved for
        B1/possession-flagged evidence respectively."""
        b2_critical = _blocker(
            blocker_id="BLK-B2", blocker_type=BlockerType.B2, status=BlockerStatus.DETECTED, severity=BlockerSeverity.CRITICAL, primary=True
        )
        result = engine.assess_case(
            case_reference="CASE-B2-ONLY",
            project_id="PROJ-1",
            parcel_id="PARCEL-1",
            blockers=(b2_critical,),
            calculation_date=_CALC_DATE,
            calculated_at=_CALC_AT,
        )
        # legal_band and possession_band both stay at the documented neutral
        # value -- B2's CRITICAL severity never leaks into either term.
        self.assertEqual(result.component_trace.legal_band, 1.0)
        self.assertEqual(result.component_trace.possession_band, 1.0)


class ConflictedInsufficientEvidenceTests(unittest.TestCase):
    def test_conflicted_blocker_sets_unresolved_conflict_flag(self):
        conflicted = _blocker(
            blocker_id="BLK-CONFLICT", blocker_type=BlockerType.B2, status=BlockerStatus.CONFLICTED, severity=BlockerSeverity.HIGH
        )
        result = engine.assess_case(
            case_reference="CASE-CONFLICT",
            project_id="PROJ-1",
            parcel_id="PARCEL-1",
            blockers=(conflicted,),
            calculation_date=_CALC_DATE,
            calculated_at=_CALC_AT,
        )
        self.assertTrue(result.unresolved_conflict)
        self.assertEqual(result.confidence_label, ConfidenceLabel.INSUFFICIENT)  # conflicted + no confident primary

    def test_insufficient_evidence_never_silently_invisible(self):
        insufficient = _blocker(
            blocker_id="BLK-INSUFF",
            blocker_type=BlockerType.B3,
            status=BlockerStatus.INSUFFICIENT_EVIDENCE,
            severity=BlockerSeverity.INFORMATIONAL,
        )
        result = engine.assess_case(
            case_reference="CASE-INSUFFICIENT",
            project_id="PROJ-1",
            parcel_id="PARCEL-1",
            blockers=(insufficient,),
            calculation_date=_CALC_DATE,
            calculated_at=_CALC_AT,
        )
        self.assertIsNotNone(result)
        self.assertIn("BLK-INSUFF", result.component_trace.insufficient_blocker_ids)
        self.assertEqual(result.confidence_label, ConfidenceLabel.INSUFFICIENT)


class NoStatutoryClockTests(unittest.TestCase):
    def test_no_clock_is_neutral_and_downgrades_confidence(self):
        """Edge case #1 (audit §18): no statutory clock -> legal_band/
        urgency_band neutral; confidence downgraded; case still ranked."""
        b4 = _blocker(
            blocker_id="BLK-B4", blocker_type=BlockerType.B4, status=BlockerStatus.DETECTED, severity=BlockerSeverity.HIGH,
            affects_possession=True, primary=True,
        )
        result = engine.assess_case(
            case_reference="CASE-NO-CLOCK",
            project_id="PROJ-1",
            parcel_id="PARCEL-1",
            blockers=(b4,),
            days_remaining=None,
            clock_status=None,
            calculation_date=_CALC_DATE,
            calculated_at=_CALC_AT,
        )
        self.assertEqual(result.component_trace.legal_band, 1.0)
        self.assertEqual(result.component_trace.urgency_band, 1)
        self.assertNotEqual(result.confidence_label, ConfidenceLabel.VERIFIED)
        self.assertIsNotNone(result.exposure_score)  # still ranked


class ApparentLapseTests(unittest.TestCase):
    def test_apparent_lapse_disclaimer_carried_verbatim(self):
        """§7/§18 edge case #3: the B1 CONFIRMED-apparent-lapse disclaimer
        must be carried verbatim, never paraphrased into a confirmed lapse."""
        disclaimer = (
            "CONFIRMED here means KSHETRA confirms its deterministic evidence indicates an apparent "
            "lapse -- this is NOT a determination that the acquisition has legally lapsed."
        )
        b1 = _blocker(
            blocker_id="BLK-B1",
            blocker_type=BlockerType.B1,
            status=BlockerStatus.CONFIRMED,
            severity=BlockerSeverity.CRITICAL,
            primary=True,
            notes=disclaimer,
        )
        result = engine.assess_case(
            case_reference="CASE-LAPSE",
            project_id="PROJ-1",
            parcel_id="PARCEL-1",
            blockers=(b1,),
            calculation_date=_CALC_DATE,
            calculated_at=_CALC_AT,
        )
        self.assertIn(disclaimer, result.notes)
        self.assertIn(disclaimer, result.component_trace.disclaimers)


class ExtensionUnverifiedTests(unittest.TestCase):
    def test_extension_unverified_downgrades_to_partial(self):
        b1 = _blocker(
            blocker_id="BLK-B1", blocker_type=BlockerType.B1, status=BlockerStatus.DETECTED, severity=BlockerSeverity.HIGH, primary=True
        )
        result = engine.assess_case(
            case_reference="CASE-EXT-UNVERIFIED",
            project_id="PROJ-1",
            parcel_id="PARCEL-1",
            blockers=(b1,),
            clock_status="EXTENSION_UNVERIFIED",
            days_remaining=5,
            project_value_crores=300.0,
            reference_project_values=[50.0, 120.0, 300.0, 900.0],
            calculation_date=_CALC_DATE,
            calculated_at=_CALC_AT,
        )
        self.assertEqual(result.confidence_label, ConfidenceLabel.PARTIAL)


class SelfParcelDownstreamTests(unittest.TestCase):
    def test_self_parcel_default_never_claims_corridor_wide(self):
        result = engine.assess_case(
            case_reference="CASE-SELF",
            project_id="PROJ-1",
            parcel_id="PARCEL-1",
            blockers=(),
            prediction_id="PRED-1",
            affected_parcel_count=1,
            affected_area_acres=2.5,
            calculation_date=_CALC_DATE,
            calculated_at=_CALC_AT,
        )
        self.assertEqual(result.component_trace.affected_parcel_count, 1)
        self.assertEqual(result.component_trace.affected_area_acres, 2.5)
        self.assertEqual(result.component_trace.gis_downstream_status, "NOT_COMPUTED")
        self.assertEqual(result.component_trace.downstream_band, 1.0)


class OwnerActionPropagationTests(unittest.TestCase):
    def test_owner_propagates_from_primary_blocker(self):
        b1 = _blocker(
            blocker_id="BLK-B1",
            blocker_type=BlockerType.B1,
            status=BlockerStatus.DETECTED,
            severity=BlockerSeverity.HIGH,
            primary=True,
            owner_role="Collector / CALA / LAO",
            responsible_authority="Collector / Competent Authority",
        )
        result = engine.assess_case(
            case_reference="CASE-OWNER",
            project_id="PROJ-1",
            parcel_id="PARCEL-1",
            blockers=(b1,),
            calculation_date=_CALC_DATE,
            calculated_at=_CALC_AT,
        )
        self.assertEqual(result.component_trace.owner_role, "Collector / CALA / LAO")
        self.assertEqual(result.component_trace.responsible_authority, "Collector / Competent Authority")

    def test_owner_fallback_when_no_primary_blocker(self):
        result = engine.assess_case(
            case_reference="CASE-NO-PRIMARY",
            project_id="PROJ-1",
            parcel_id="PARCEL-1",
            blockers=(),
            prediction_id="PRED-1",
            calculation_date=_CALC_DATE,
            calculated_at=_CALC_AT,
        )
        self.assertIn("manual triage required", result.component_trace.owner_role)
        self.assertIsNone(result.recommended_action_id)

    def test_recommended_action_id_passthrough(self):
        b1 = _blocker(
            blocker_id="BLK-B1", blocker_type=BlockerType.B1, status=BlockerStatus.DETECTED, severity=BlockerSeverity.HIGH, primary=True
        )
        result = engine.assess_case(
            case_reference="CASE-ACTION",
            project_id="PROJ-1",
            parcel_id="PARCEL-1",
            blockers=(b1,),
            recommended_action_id="ACTREC-XYZ",
            calculation_date=_CALC_DATE,
            calculated_at=_CALC_AT,
        )
        self.assertEqual(result.recommended_action_id, "ACTREC-XYZ")


class ComponentTraceTests(unittest.TestCase):
    def test_trace_is_never_opaque(self):
        b1 = _blocker(
            blocker_id="BLK-B1", blocker_type=BlockerType.B1, status=BlockerStatus.DETECTED, severity=BlockerSeverity.HIGH, primary=True
        )
        result = engine.assess_case(
            case_reference="CASE-TRACE",
            project_id="PROJ-1",
            parcel_id="PARCEL-1",
            blockers=(b1,),
            days_remaining=10,
            clock_status="CLOCK_CERTAIN",
            calculation_date=_CALC_DATE,
            calculated_at=_CALC_AT,
        )
        trace = result.component_trace
        for field_name in (
            "legal_band", "possession_band", "downstream_band", "project_scale_band", "secondary_bonus",
            "urgency_band", "actionability_band", "weights_version", "priority_weights_version",
            "staleness_policy_version", "primary_blocker_id", "owner_role",
        ):
            self.assertTrue(hasattr(trace, field_name))
        self.assertEqual(trace.primary_blocker_id, "BLK-B1")


class ReproducibilityTests(unittest.TestCase):
    def test_identical_inputs_produce_identical_scores(self):
        """Test 11 (audit §20): running the assessment twice on identical
        input state yields an identical exposure_score/priority_score/band."""
        def _build():
            b1 = _blocker(
                blocker_id="BLK-B1", blocker_type=BlockerType.B1, status=BlockerStatus.DETECTED, severity=BlockerSeverity.HIGH, primary=True
            )
            b3 = _blocker(
                blocker_id="BLK-B3", blocker_type=BlockerType.B3, status=BlockerStatus.DETECTED, severity=BlockerSeverity.HIGH,
                affects_possession=True,
            )
            return engine.assess_case(
                case_reference="CASE-REPRO",
                project_id="PROJ-1",
                parcel_id="PARCEL-1",
                blockers=(b1, b3),
                days_remaining=20,
                clock_status="CLOCK_CERTAIN",
                project_value_crores=300.0,
                reference_project_values=[50.0, 120.0, 300.0, 900.0],
                calculation_date=_CALC_DATE,
                calculated_at=_CALC_AT,
            )

        result_1 = _build()
        result_2 = _build()
        self.assertEqual(result_1.exposure_score, result_2.exposure_score)
        self.assertEqual(result_1.exposure_band, result_2.exposure_band)
        self.assertEqual(result_1.priority_score, result_2.priority_score)
        self.assertEqual(result_1.priority_band, result_2.priority_band)
        self.assertEqual(result_1.confidence_label, result_2.confidence_label)


class ExposureScoreBoundsTests(unittest.TestCase):
    def test_scores_always_within_0_100(self):
        b1 = _blocker(
            blocker_id="BLK-B1", blocker_type=BlockerType.B1, status=BlockerStatus.CONFIRMED, severity=BlockerSeverity.CRITICAL, primary=True
        )
        b4 = _blocker(
            blocker_id="BLK-B4", blocker_type=BlockerType.B4, status=BlockerStatus.CONFIRMED, severity=BlockerSeverity.CRITICAL,
            affects_possession=True,
        )
        result = engine.assess_case(
            case_reference="CASE-EXTREME",
            project_id="PROJ-1",
            parcel_id="PARCEL-1",
            blockers=(b1, b4),
            days_remaining=1,
            clock_status="APPARENT_LAPSE",
            project_value_crores=1e9,
            reference_project_values=[1.0, 2.0, 3.0, 1e9],
            calculation_date=_CALC_DATE,
            calculated_at=_CALC_AT,
        )
        self.assertGreaterEqual(result.exposure_score, 0.0)
        self.assertLessEqual(result.exposure_score, 100.0)
        self.assertGreaterEqual(result.priority_score, 0.0)
        self.assertLessEqual(result.priority_score, 100.0)


if __name__ == "__main__":
    unittest.main()
