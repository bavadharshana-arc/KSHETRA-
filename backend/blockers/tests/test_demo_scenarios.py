import unittest

from blockers.demo_scenarios import ALL_DEMO_SCENARIOS, run_scenario
from legal.enums import SourceType


class DemoScenarioCountTests(unittest.TestCase):
    def test_exactly_six_scenarios(self):
        self.assertEqual(len(ALL_DEMO_SCENARIOS), 6)


class DemoScenarioExpectationTests(unittest.TestCase):
    def test_every_scenario_matches_its_documented_expectation(self):
        for scenario in ALL_DEMO_SCENARIOS:
            with self.subTest(scenario=scenario.scenario_id):
                result = run_scenario(scenario)
                raised_types = tuple(sorted(b.blocker_type.value for b in result.blockers))
                expected_types = tuple(sorted(t.value for t in scenario.expected_blocker_types))
                self.assertEqual(
                    raised_types, expected_types, f"{scenario.scenario_id}: unexpected raised blocker types"
                )

                if scenario.expected_primary_type is None:
                    self.assertIsNone(
                        result.ranking.primary_blocker_id, f"{scenario.scenario_id}: expected no primary blocker"
                    )
                else:
                    primary = next(
                        b for b in result.blockers if b.blocker_id == result.ranking.primary_blocker_id
                    )
                    self.assertEqual(primary.blocker_type, scenario.expected_primary_type)
                    self.assertEqual(primary.status, scenario.expected_primary_status)
                    if scenario.expected_owner_role_contains:
                        self.assertIn(scenario.expected_owner_role_contains, primary.owner_role)

                if scenario.expected_action_category:
                    action_types = {a.action_type for a in result.actions}
                    self.assertIn(
                        scenario.expected_action_category,
                        action_types,
                        f"{scenario.scenario_id}: expected an action of type "
                        f"{scenario.expected_action_category!r}, got {action_types}",
                    )


class DemoScenarioSyntheticLabelingTests(unittest.TestCase):
    def test_all_ids_are_obviously_synthetic(self):
        for scenario in ALL_DEMO_SCENARIOS:
            self.assertTrue(scenario.case_reference.startswith("SYN-"))
            for parcel in scenario.parcels:
                if parcel.parcel_id:
                    self.assertTrue(parcel.parcel_id.startswith("SYN-"))

    def test_clock_backed_scenarios_are_synthetic_demo_sourced(self):
        for scenario in ALL_DEMO_SCENARIOS:
            for clock in scenario.clocks:
                # calculation_basis is either a SourceType value (for a certain
                # clock) or an opaque reason string -- when it IS a SourceType,
                # every demo scenario's underlying event must be SYNTHETIC_DEMO.
                if clock.calculation_basis in (s.value for s in SourceType):
                    self.assertEqual(clock.calculation_basis, SourceType.SYNTHETIC_DEMO.value)


class DemoScenarioDeterminismTests(unittest.TestCase):
    def test_repeated_scenario_run_yields_identical_substantive_result(self):
        for scenario in ALL_DEMO_SCENARIOS:
            with self.subTest(scenario=scenario.scenario_id):
                first = run_scenario(scenario)
                second = run_scenario(scenario)
                first_shape = tuple(
                    sorted((b.blocker_type.value, b.status.value, b.severity.value) for b in first.blockers)
                )
                second_shape = tuple(
                    sorted((b.blocker_type.value, b.status.value, b.severity.value) for b in second.blockers)
                )
                self.assertEqual(first_shape, second_shape)
                self.assertEqual(first.ranking.primary_blocker_id is None, second.ranking.primary_blocker_id is None)


if __name__ == "__main__":
    unittest.main()
