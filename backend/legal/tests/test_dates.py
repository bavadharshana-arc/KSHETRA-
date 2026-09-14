import unittest
from datetime import date

from legal.dates import (
    InvalidDateError,
    StatutoryDuration,
    add_calendar_months,
    add_calendar_years,
    compute_deadline,
    days_between,
    is_leap_year,
)


class CalendarMonthArithmeticTests(unittest.TestCase):
    def test_ordinary_month_addition(self):
        self.assertEqual(add_calendar_months(date(2024, 1, 19), 12), date(2025, 1, 19))

    def test_month_end_overflow_clamped_not_rolled(self):
        # 31-Jan + 1 month must land on the last day of February, never roll
        # into March.
        self.assertEqual(add_calendar_months(date(2024, 1, 31), 1), date(2024, 2, 29))  # 2024 leap
        self.assertEqual(add_calendar_months(date(2023, 1, 31), 1), date(2023, 2, 28))  # not leap

    def test_leap_year_handling(self):
        self.assertTrue(is_leap_year(2024))
        self.assertFalse(is_leap_year(2023))
        self.assertEqual(add_calendar_years(date(2024, 2, 29), 1), date(2025, 2, 28))

    def test_negative_months(self):
        self.assertEqual(add_calendar_months(date(2024, 1, 15), -1), date(2023, 12, 15))

    def test_year_crossing(self):
        self.assertEqual(add_calendar_months(date(2023, 11, 1), 3), date(2024, 2, 1))

    def test_not_the_ml_feature_layer_approximation(self):
        # The statutory 12-month computation must NOT match a 30.4375-day/
        # month approximation over a period where the two diverge (e.g. a
        # base date late in a 31-day month).
        approx_days = round(12 * 30.4375)
        approx_result = date.fromordinal(date(2024, 1, 31).toordinal() + approx_days)
        calendar_result = add_calendar_months(date(2024, 1, 31), 12)
        self.assertNotEqual(approx_result, calendar_result)
        self.assertEqual(calendar_result, date(2025, 1, 31))


class InvalidInputTests(unittest.TestCase):
    def test_missing_base_date_raises(self):
        with self.assertRaises(InvalidDateError):
            add_calendar_months(None, 12)  # type: ignore[arg-type]

    def test_compute_deadline_requires_trigger_date(self):
        with self.assertRaises(InvalidDateError):
            compute_deadline(None, StatutoryDuration(months=12))

    def test_compute_deadline_requires_defined_duration(self):
        with self.assertRaises(InvalidDateError):
            compute_deadline(date(2024, 1, 1), StatutoryDuration())

    def test_future_dates_are_supported_not_rejected(self):
        # A trigger date after the calculation date is unusual but must not
        # crash — days_between simply returns a negative count.
        self.assertEqual(days_between(date(2030, 1, 1), date(2024, 1, 1)), -2192)


class ComputeDeadlineTests(unittest.TestCase):
    def test_months_and_stability(self):
        deadline = compute_deadline(date(2024, 1, 10), StatutoryDuration(months=12))
        self.assertEqual(deadline, date(2025, 1, 10))

    def test_years(self):
        deadline = compute_deadline(date(2023, 2, 1), StatutoryDuration(years=1))
        self.assertEqual(deadline, date(2024, 2, 1))

    def test_days(self):
        deadline = compute_deadline(date(2024, 1, 10), StatutoryDuration(days=60))
        self.assertEqual(deadline, date(2024, 3, 10))

    def test_reproducible_repeated_calculation(self):
        results = {compute_deadline(date(2024, 1, 10), StatutoryDuration(months=12)) for _ in range(20)}
        self.assertEqual(len(results), 1)


if __name__ == "__main__":
    unittest.main()
