"""
Runs all 8 demo scenarios (docs/step8a-exposure-priority-audit.md's required
demo coverage) end to end through the REAL blocker engine + exposure engine,
asserting each against its own hand-verified expected band/label. See
exposure/demo_scenarios.py's module docstring.
"""

from __future__ import annotations

import unittest

from exposure import demo_scenarios as ds


class DemoScenarioTests(unittest.TestCase):
    def test_all_scenarios_produce_an_assessment(self):
        for factory in ds.ALL_SCENARIOS:
            scenario = factory()
            with self.subTest(scenario=scenario.scenario_id):
                self.assertIsNotNone(scenario.assessment, f"scenario {scenario.scenario_id} returned no assessment")

    def test_all_scenarios_match_expected_bands_and_confidence(self):
        for factory in ds.ALL_SCENARIOS:
            scenario = factory()
            assessment = scenario.assessment
            with self.subTest(scenario=scenario.scenario_id):
                if scenario.expected_exposure_band is not None:
                    self.assertEqual(assessment.exposure_band, scenario.expected_exposure_band)
                if scenario.expected_priority_band is not None:
                    self.assertEqual(assessment.priority_band, scenario.expected_priority_band)
                if scenario.expected_confidence_label is not None:
                    self.assertEqual(assessment.confidence_label, scenario.expected_confidence_label)

    def test_scenario_1_high_exposure_urgent_clock(self):
        scenario = ds.scenario_1_high_exposure_urgent_clock()
        a = scenario.assessment
        self.assertEqual(a.component_trace.urgency_band, 4)
        self.assertGreaterEqual(a.exposure_score, 50.0)

    def test_scenario_3_possession_blocking_b4(self):
        scenario = ds.scenario_3_possession_blocking_b4()
        a = scenario.assessment
        self.assertEqual(a.component_trace.possession_band, 4.0)

    def test_scenario_4_uncertain_clock_never_critical(self):
        scenario = ds.scenario_4_uncertain_statutory_clock()
        a = scenario.assessment
        self.assertNotEqual(a.exposure_band.value, "CRITICAL")
        self.assertEqual(a.confidence_label.value, "NEEDS_VERIFICATION")

    def test_scenario_5_multiple_blockers_has_secondary_bonus(self):
        scenario = ds.scenario_5_multiple_blockers()
        a = scenario.assessment
        self.assertGreater(a.component_trace.secondary_bonus, 0.0)
        self.assertLessEqual(a.component_trace.secondary_bonus, 0.5)

    def test_scenario_6_missing_gis_records_neutral_substitution(self):
        scenario = ds.scenario_6_missing_gis_downstream()
        a = scenario.assessment
        self.assertIn(
            "downstream_band: affected_parcel_count unknown (neutral=1).",
            a.component_trace.neutral_substitutions,
        )

    def test_scenario_7_prediction_never_drives_exposure(self):
        """Prediction != Exposure: a high delay_probability alone must never
        push exposure into HIGH/CRITICAL by itself."""
        scenario = ds.scenario_7_high_prediction_low_consequence()
        a = scenario.assessment
        self.assertEqual(a.component_trace.prediction_delay_probability, 0.91)
        self.assertIn(a.exposure_band.value, ("LOW", "MODERATE"))

    def test_scenario_8_low_prediction_high_consequence_not_buried(self):
        """Prediction != Exposure, the other direction: a low delay_probability
        must never suppress a genuinely severe legal/possession consequence."""
        scenario = ds.scenario_8_low_prediction_high_consequence()
        a = scenario.assessment
        self.assertEqual(a.component_trace.prediction_delay_probability, 0.12)
        self.assertEqual(a.exposure_band.value, "CRITICAL")

    def test_scenario_ids_are_unique(self):
        ids = [factory().scenario_id for factory in ds.ALL_SCENARIOS]
        self.assertEqual(len(ids), len(set(ids)))

    def test_at_least_eight_scenarios(self):
        self.assertGreaterEqual(len(ds.ALL_SCENARIOS), 8)


if __name__ == "__main__":
    unittest.main()
