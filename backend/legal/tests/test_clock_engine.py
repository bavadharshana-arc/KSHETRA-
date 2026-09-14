import dataclasses
import unittest
from datetime import date, datetime, timezone

from legal.clock_engine import compute_statutory_clock
from legal.demo_scenarios import ALL_DEMO_SCENARIOS
from legal.enums import (
    ApplicableAct,
    ClockStatus,
    ConsequenceClass,
    EventType,
    EvidenceVerificationStatus,
    ExtensionStatus,
    SourceType,
    StayScope,
)
from legal.events import AcquisitionEvent
from legal.extensions import ExtensionEvidence
from legal.rule_seed_data import (
    ALL_RULE_SETS,
    NHACT_3C_OBJECTION_WINDOW,
    NHACT_3D_DECLARATION,
    RFCTLARR_S15_OBJECTION_WINDOW,
    RFCTLARR_S19_DECLARATION,
    RFCTLARR_S24_2_LEGACY_LAPSE_TEST,
    RFCTLARR_S25_AWARD,
)
from legal.stays import CourtStayEvent

CASE = "T-CASE-ENGINE"


def _event(event_type, applicable_act, event_date, source_type=SourceType.SYNTHETIC_DEMO, verified=True):
    return AcquisitionEvent(
        event_id=f"T-EVT-{event_type}-{event_date.isoformat()}",
        case_reference=CASE,
        project_id="T-PROJ",
        parcel_id=None,
        event_type=event_type,
        applicable_act=applicable_act,
        event_date=event_date,
        publication_date=event_date,
        source_type=source_type,
        source_reference="T-SRC",
        source_document_id=None,
        confidence="HIGH",
        verified=verified,
        verification_timestamp=datetime(event_date.year, event_date.month, event_date.day, tzinfo=timezone.utc)
        if verified
        else None,
    )


class MissingTriggerTests(unittest.TestCase):
    def test_no_events_at_all_is_insufficient_basis(self):
        result = compute_statutory_clock(
            clock_id="C-1",
            case_reference=CASE,
            project_id="T-PROJ",
            parcel_id=None,
            rule=RFCTLARR_S19_DECLARATION,
            events=[],
            calculation_date=date(2024, 6, 1),
        )
        self.assertEqual(result.clock_status, ClockStatus.INSUFFICIENT_BASIS)
        self.assertIsNone(result.trigger_date)
        self.assertIsNone(result.computed_deadline)

    def test_events_of_a_different_type_are_still_insufficient_basis(self):
        wrong_event = _event(
            EventType.NHACT_3A_NOTIFICATION.value, ApplicableAct.NH_ACT_1956, date(2024, 1, 1)
        )
        result = compute_statutory_clock(
            clock_id="C-2",
            case_reference=CASE,
            project_id="T-PROJ",
            parcel_id=None,
            rule=RFCTLARR_S19_DECLARATION,
            events=[wrong_event],
            calculation_date=date(2024, 6, 1),
        )
        self.assertEqual(result.clock_status, ClockStatus.INSUFFICIENT_BASIS)


class CertainClockTests(unittest.TestCase):
    def test_clean_case_is_certain_and_on_track(self):
        e = _event(EventType.RFCTLARR_S11_PRELIMINARY_NOTIFICATION.value, ApplicableAct.RFCTLARR, date(2024, 1, 10))
        result = compute_statutory_clock(
            clock_id="C-3",
            case_reference=CASE,
            project_id="T-PROJ",
            parcel_id=None,
            rule=RFCTLARR_S19_DECLARATION,
            events=[e],
            calculation_date=date(2024, 2, 1),
        )
        self.assertEqual(result.clock_status, ClockStatus.CLOCK_CERTAIN)
        self.assertEqual(result.computed_deadline, date(2025, 1, 10))
        self.assertEqual(result.consequence_class, ConsequenceClass.PROCESS_DELAY)
        self.assertGreater(result.days_remaining, 30)

    def test_near_deadline_is_certain_but_at_risk(self):
        e = _event(EventType.RFCTLARR_S11_PRELIMINARY_NOTIFICATION.value, ApplicableAct.RFCTLARR, date(2024, 1, 10))
        result = compute_statutory_clock(
            clock_id="C-4",
            case_reference=CASE,
            project_id="T-PROJ",
            parcel_id=None,
            rule=RFCTLARR_S19_DECLARATION,
            events=[e],
            calculation_date=date(2024, 12, 20),  # 21 days before 2025-01-10
        )
        self.assertEqual(result.clock_status, ClockStatus.CLOCK_CERTAIN)
        self.assertEqual(result.consequence_class, ConsequenceClass.CLOCK_AT_RISK)


class ApparentLapseTests(unittest.TestCase):
    def test_expired_lapse_rule_with_no_extension_is_apparent_lapse(self):
        e = _event(EventType.RFCTLARR_S11_PRELIMINARY_NOTIFICATION.value, ApplicableAct.RFCTLARR, date(2020, 1, 1))
        result = compute_statutory_clock(
            clock_id="C-5",
            case_reference=CASE,
            project_id="T-PROJ",
            parcel_id=None,
            rule=RFCTLARR_S19_DECLARATION,
            events=[e],
            calculation_date=date(2022, 1, 1),
        )
        self.assertEqual(result.clock_status, ClockStatus.APPARENT_LAPSE)
        self.assertEqual(result.consequence_class, ConsequenceClass.APPARENT_LAPSE)
        # APPARENT_LAPSE must never read as a final legal adjudication — the
        # notes must carry the Step 6B brief's exact caveat.
        self.assertIn("subject to authoritative/legal verification", result.notes)
        self.assertIn("NOT a determination", result.notes)

    def test_expired_non_lapse_rule_is_clock_expired_not_apparent_lapse(self):
        """RFCTLARR S.15's 60-day objection window is NOT an acquisition-
        lapse consequence — an expired instance must be reported as
        CLOCK_EXPIRED at the consequence level, even though clock_status
        itself still literally reaches APPARENT_LAPSE per the state
        machine's flat transition rule."""
        e = _event(EventType.RFCTLARR_S11_PRELIMINARY_NOTIFICATION.value, ApplicableAct.RFCTLARR, date(2024, 1, 1))
        result = compute_statutory_clock(
            clock_id="C-6",
            case_reference=CASE,
            project_id="T-PROJ",
            parcel_id=None,
            rule=RFCTLARR_S15_OBJECTION_WINDOW,
            events=[e],
            calculation_date=date(2024, 6, 1),
        )
        self.assertEqual(result.clock_status, ClockStatus.APPARENT_LAPSE)
        self.assertEqual(result.consequence_class, ConsequenceClass.CLOCK_EXPIRED)


class ExtensionTests(unittest.TestCase):
    def test_verified_extension_covering_calculation_date_is_certain(self):
        e = _event(EventType.RFCTLARR_S19_DECLARATION.value, ApplicableAct.RFCTLARR, date(2023, 1, 1))
        ext = ExtensionEvidence(
            extension_id="T-EXT-OK",
            case_reference=CASE,
            rule_set_id=RFCTLARR_S25_AWARD.rule_set_id,
            extension_order_id="T-ORD",
            extension_date=date(2024, 1, 2),
            authority="Appropriate Government",
            reason="test",
            source_document="T-DOC",
            effective_from=date(2024, 1, 2),
            effective_to=date(2024, 9, 1),
            verification_status=EvidenceVerificationStatus.VERIFIED,
        )
        result = compute_statutory_clock(
            clock_id="C-7",
            case_reference=CASE,
            project_id="T-PROJ",
            parcel_id=None,
            rule=RFCTLARR_S25_AWARD,
            events=[e],
            extension=ext,
            calculation_date=date(2024, 3, 1),
        )
        self.assertEqual(result.clock_status, ClockStatus.CLOCK_CERTAIN)
        self.assertEqual(result.extension_status, ExtensionStatus.EXTENSION_VERIFIED)
        self.assertEqual(result.adjusted_deadline, date(2024, 9, 1))

    def test_claimed_unverified_extension_is_extension_unverified(self):
        e = _event(EventType.RFCTLARR_S19_DECLARATION.value, ApplicableAct.RFCTLARR, date(2023, 1, 1))
        ext = ExtensionEvidence(
            extension_id="T-EXT-CLAIMED",
            case_reference=CASE,
            rule_set_id=RFCTLARR_S25_AWARD.rule_set_id,
            extension_order_id=None,
            extension_date=date(2024, 1, 2),
            authority="Appropriate Government",
            reason="test",
            source_document=None,
            effective_from=date(2024, 1, 2),
            effective_to=date(2024, 9, 1),
            verification_status=EvidenceVerificationStatus.CLAIMED,
        )
        result = compute_statutory_clock(
            clock_id="C-8",
            case_reference=CASE,
            project_id="T-PROJ",
            parcel_id=None,
            rule=RFCTLARR_S25_AWARD,
            events=[e],
            extension=ext,
            calculation_date=date(2024, 3, 1),
        )
        self.assertEqual(result.clock_status, ClockStatus.EXTENSION_UNVERIFIED)


class StayAffectingClockTests(unittest.TestCase):
    def test_verified_stay_on_express_statutory_rule_pushes_deadline_out(self):
        e = _event(EventType.RFCTLARR_S11_PRELIMINARY_NOTIFICATION.value, ApplicableAct.RFCTLARR, date(2024, 1, 10))
        stay = CourtStayEvent(
            stay_id="T-STAY",
            case_reference=CASE,
            court="Test Court",
            order_date=date(2024, 3, 1),
            effective_from=date(2024, 3, 1),
            effective_to=date(2024, 4, 1),  # 32 days
            scope=StayScope.PROJECT,
            affected_parcels=(),
            affected_stage=None,
            source_document="T-DOC",
            verification_status=EvidenceVerificationStatus.VERIFIED,
        )
        without_stay = compute_statutory_clock(
            clock_id="C-9a", case_reference=CASE, project_id="T-PROJ", parcel_id=None,
            rule=RFCTLARR_S19_DECLARATION, events=[e], calculation_date=date(2024, 6, 1),
        )
        with_stay = compute_statutory_clock(
            clock_id="C-9b", case_reference=CASE, project_id="T-PROJ", parcel_id=None,
            rule=RFCTLARR_S19_DECLARATION, events=[e], stays=[stay], calculation_date=date(2024, 6, 1),
        )
        self.assertGreater(with_stay.adjusted_deadline, without_stay.adjusted_deadline)
        self.assertEqual(with_stay.stay_adjustment_days, 32)

    def test_verified_stay_outside_scope_does_not_affect_clock(self):
        e = _event(EventType.RFCTLARR_S11_PRELIMINARY_NOTIFICATION.value, ApplicableAct.RFCTLARR, date(2024, 1, 10))
        stay = CourtStayEvent(
            stay_id="T-STAY-2",
            case_reference=CASE,
            court="Test Court",
            order_date=date(2024, 3, 1),
            effective_from=date(2024, 3, 1),
            effective_to=date(2024, 4, 1),
            scope=StayScope.STAGE,
            affected_parcels=(),
            affected_stage="RFCTLARR s.25",  # a different clock's section
            source_document="T-DOC",
            verification_status=EvidenceVerificationStatus.VERIFIED,
        )
        result = compute_statutory_clock(
            clock_id="C-10", case_reference=CASE, project_id="T-PROJ", parcel_id=None,
            rule=RFCTLARR_S19_DECLARATION, events=[e], stays=[stay], calculation_date=date(2024, 6, 1),
        )
        self.assertEqual(result.stay_adjustment_days, 0)
        self.assertEqual(result.computed_deadline, result.adjusted_deadline)

    def test_rule_uncertain_stay_forces_clock_uncertain(self):
        e = _event(EventType.RFCTLARR_S19_DECLARATION.value, ApplicableAct.RFCTLARR, date(2023, 1, 1))
        stay = CourtStayEvent(
            stay_id="T-STAY-3",
            case_reference=CASE,
            court="Test Court",
            order_date=date(2023, 3, 1),
            effective_from=date(2023, 3, 1),
            effective_to=date(2023, 4, 1),
            scope=StayScope.PROJECT,
            affected_parcels=(),
            affected_stage=None,
            source_document="T-DOC",
            verification_status=EvidenceVerificationStatus.VERIFIED,
        )
        result = compute_statutory_clock(
            clock_id="C-11", case_reference=CASE, project_id="T-PROJ", parcel_id=None,
            rule=RFCTLARR_S25_AWARD,  # case-law-only stay treatment
            events=[e], stays=[stay], calculation_date=date(2024, 3, 1),
        )
        self.assertEqual(result.clock_status, ClockStatus.CLOCK_UNCERTAIN)
        self.assertEqual(result.calculation_basis, "STAY_TREATMENT_NOT_SUFFICIENTLY_VERIFIED")


class RuleFamilySeparationTests(unittest.TestCase):
    def test_rfctlarr_and_nh_act_never_share_section_reference(self):
        rfctlarr_refs = {rs.section_reference for rs in ALL_RULE_SETS if rs.act == ApplicableAct.RFCTLARR}
        nhact_refs = {rs.section_reference for rs in ALL_RULE_SETS if rs.act == ApplicableAct.NH_ACT_1956}
        self.assertTrue(rfctlarr_refs)
        self.assertTrue(nhact_refs)
        self.assertEqual(rfctlarr_refs & nhact_refs, set())

    def test_rfctlarr_and_nh_act_never_share_trigger_event_types(self):
        rfctlarr_events = set()
        nhact_events = set()
        for rs in ALL_RULE_SETS:
            if rs.act == ApplicableAct.RFCTLARR:
                rfctlarr_events.update(rs.trigger_definition.triggering_event_types)
            elif rs.act == ApplicableAct.NH_ACT_1956:
                nhact_events.update(rs.trigger_definition.triggering_event_types)
        self.assertEqual(rfctlarr_events & nhact_events, set())

    def test_no_paired_section_labels_anywhere_in_rule_seed_data(self):
        """Explicit regression for the Step 6B brief's instruction not to
        use a paired label like 'Declaration (Sec 3D/19)' in the legal
        engine."""
        for rs in ALL_RULE_SETS:
            self.assertNotIn("/", rs.section_reference)

    def test_nh_act_clock_never_computed_from_rfctlarr_event(self):
        rfctlarr_event = _event(
            EventType.RFCTLARR_S11_PRELIMINARY_NOTIFICATION.value, ApplicableAct.RFCTLARR, date(2024, 1, 1)
        )
        result = compute_statutory_clock(
            clock_id="C-12", case_reference=CASE, project_id="T-PROJ", parcel_id=None,
            rule=NHACT_3D_DECLARATION, events=[rfctlarr_event], calculation_date=date(2024, 6, 1),
        )
        self.assertEqual(result.clock_status, ClockStatus.INSUFFICIENT_BASIS)

    def test_nh_act_3c_object_window_separate_from_3d(self):
        e = _event(EventType.NHACT_3A_NOTIFICATION.value, ApplicableAct.NH_ACT_1956, date(2024, 1, 1))
        objection = compute_statutory_clock(
            clock_id="C-13a", case_reference=CASE, project_id="T-PROJ", parcel_id=None,
            rule=NHACT_3C_OBJECTION_WINDOW, events=[e], calculation_date=date(2024, 1, 10),
        )
        declaration = compute_statutory_clock(
            clock_id="C-13b", case_reference=CASE, project_id="T-PROJ", parcel_id=None,
            rule=NHACT_3D_DECLARATION, events=[e], calculation_date=date(2024, 1, 10),
        )
        self.assertNotEqual(objection.computed_deadline, declaration.computed_deadline)
        self.assertEqual(objection.computed_deadline, date(2024, 1, 22))  # 21 days
        self.assertEqual(declaration.computed_deadline, date(2025, 1, 1))  # 1 year


class Legacy1894Tests(unittest.TestCase):
    def test_legacy_flag_overrides_status(self):
        e = _event(EventType.LA1894_S11_AWARD.value, ApplicableAct.LA_ACT_1894, date(2005, 1, 1))
        result = compute_statutory_clock(
            clock_id="C-14", case_reference=CASE, project_id="T-PROJ", parcel_id=None,
            rule=RFCTLARR_S24_2_LEGACY_LAPSE_TEST, events=[e], calculation_date=date(2024, 1, 1),
            is_legacy_1894=True,
        )
        self.assertEqual(result.clock_status, ClockStatus.LEGACY_1894)
        # The underlying uncertainty is still visible via consequence_class,
        # never silently converted into a confident modern determination.
        self.assertEqual(result.consequence_class, ConsequenceClass.LEGAL_STATUS_REQUIRES_VERIFICATION)

    def test_legacy_flag_does_not_override_insufficient_basis(self):
        result = compute_statutory_clock(
            clock_id="C-15", case_reference=CASE, project_id="T-PROJ", parcel_id=None,
            rule=RFCTLARR_S24_2_LEGACY_LAPSE_TEST, events=[], calculation_date=date(2024, 1, 1),
            is_legacy_1894=True,
        )
        self.assertEqual(result.clock_status, ClockStatus.INSUFFICIENT_BASIS)

    def test_s24_2_never_reaches_certain(self):
        """Section 6A audit rule: S.24(2)'s interpretation rests on
        unresolved case law -> this rule must never produce CLOCK_CERTAIN,
        regardless of how clean the case-level dates are."""
        e = _event(EventType.LA1894_S11_AWARD.value, ApplicableAct.LA_ACT_1894, date(2000, 1, 1))
        result = compute_statutory_clock(
            clock_id="C-16", case_reference=CASE, project_id="T-PROJ", parcel_id=None,
            rule=RFCTLARR_S24_2_LEGACY_LAPSE_TEST, events=[e], calculation_date=date(2001, 1, 1),
            is_legacy_1894=False,  # even without the legacy flag
        )
        self.assertNotEqual(result.clock_status, ClockStatus.CLOCK_CERTAIN)
        self.assertEqual(result.clock_status, ClockStatus.CLOCK_UNCERTAIN)


class ClockUncertainTests(unittest.TestCase):
    def test_conflicting_trigger_evidence_is_uncertain(self):
        e1 = _event(EventType.RFCTLARR_S11_PRELIMINARY_NOTIFICATION.value, ApplicableAct.RFCTLARR, date(2024, 1, 10), SourceType.OFFICIAL_GAZETTE)
        e2 = dataclasses.replace(e1, event_id="T-EVT-DUP", event_date=date(2024, 1, 12))
        result = compute_statutory_clock(
            clock_id="C-17", case_reference=CASE, project_id="T-PROJ", parcel_id=None,
            rule=RFCTLARR_S19_DECLARATION, events=[e1, e2], calculation_date=date(2024, 6, 1),
        )
        self.assertEqual(result.clock_status, ClockStatus.CLOCK_UNCERTAIN)
        self.assertIsNotNone(result.event_conflict)


class DeterminismTests(unittest.TestCase):
    def test_repeated_calculation_is_identical(self):
        e = _event(EventType.RFCTLARR_S11_PRELIMINARY_NOTIFICATION.value, ApplicableAct.RFCTLARR, date(2024, 1, 10))
        results = [
            compute_statutory_clock(
                clock_id="C-18", case_reference=CASE, project_id="T-PROJ", parcel_id=None,
                rule=RFCTLARR_S19_DECLARATION, events=[e], calculation_date=date(2024, 6, 1),
            )
            for _ in range(10)
        ]
        # calculated_at (wall-clock insert time) legitimately varies; every
        # other field must be identical across repeated calls given
        # identical inputs. StatutoryClockResult contains list fields, so
        # equality is checked pairwise (dataclass __eq__) rather than via a
        # set (which would require every field to be hashable).
        stripped = [dataclasses.replace(r, calculated_at=None) for r in results]
        for other in stripped[1:]:
            self.assertEqual(other, stripped[0])


class DemoScenarioTests(unittest.TestCase):
    """Runs every ILLUSTRATIVE / SYNTHETIC DEMO scenario through the real
    engine and asserts the exact clock_status each is designed to
    demonstrate."""

    def test_all_demo_scenarios_produce_their_expected_status(self):
        for scenario in ALL_DEMO_SCENARIOS:
            with self.subTest(scenario=scenario.scenario_id):
                result = compute_statutory_clock(
                    clock_id=f"CLOCK-{scenario.scenario_id}",
                    case_reference=scenario.case_reference,
                    project_id=scenario.project_id,
                    parcel_id=scenario.parcel_id,
                    rule=scenario.rule,
                    events=scenario.events,
                    stays=scenario.stays,
                    extension=scenario.extension,
                    calculation_date=scenario.calculation_date,
                    is_legacy_1894=scenario.is_legacy_1894,
                )
                self.assertEqual(result.clock_status, scenario.expected_clock_status)

    def test_all_demo_events_are_synthetic_demo_sourced(self):
        for scenario in ALL_DEMO_SCENARIOS:
            for event in scenario.events:
                self.assertEqual(event.source_type, SourceType.SYNTHETIC_DEMO)
            for stay in scenario.stays:
                # CourtStayEvent has no source_type field of its own (it
                # carries source_document instead); verification_status is
                # checked elsewhere. Nothing here claims real government
                # provenance for demo stays.
                self.assertTrue(stay.source_document is None or stay.source_document.startswith("SYN-"))


if __name__ == "__main__":
    unittest.main()
