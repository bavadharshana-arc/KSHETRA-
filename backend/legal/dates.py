"""
Centralized date-calculation utility for the statutory clock engine.

CRITICAL: this module must NEVER be conflated with, or replaced by, the ML
feature layer's elapsed-time math (`notificationAgeMonths()` in
src/services/predictionFeatures.ts), which deliberately uses a 30.4375-day
statistical average per month for feature-vector stability. That
approximation is correct for its own purpose and legally wrong for a
statutory deadline (see docs/step6a-statutory-clock-audit.md §15). Every
function here uses real calendar-month/year arithmetic instead.

Every function takes dates explicitly — nothing here ever reads the wall
clock. The caller (clock_engine.py) always passes an explicit
`calculation_date`, mirroring the project's existing DEMO_ASOF_DATE
reproducibility discipline. Given the same inputs, every function here always
returns the same output.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date
from typing import Optional


class InvalidDateError(ValueError):
    """Raised when a date required for a legal computation is missing,
    malformed, or otherwise cannot support a deterministic calculation. The
    clock engine catches this and turns it into INSUFFICIENT_BASIS /
    CLOCK_UNCERTAIN rather than letting an exception propagate — a missing or
    bad date must degrade the clock's status, never crash the caller."""


def is_leap_year(year: int) -> bool:
    return calendar.isleap(year)


def add_calendar_months(base_date: date, months: int) -> date:
    """
    Adds `months` CALENDAR months to `base_date` — e.g. 19-Jan-2024 + 12
    months = 19-Jan-2025; 31-Jan-2024 + 1 month = 29-Feb-2024 (2024 is a leap
    year; the day is clamped to the target month's actual last day, never
    overflowing into the next month). `months` may be negative.

    This is the calendar-correct arithmetic every RFCTLARR/NH-Act "N months"
    period in docs/step6a-statutory-clock-audit.md §4/§5 actually needs; see
    this module's docstring for why the ML layer's day-average must never be
    substituted here.
    """
    if not isinstance(base_date, date):
        raise InvalidDateError(f"add_calendar_months requires a date, got {type(base_date)!r}")
    if not isinstance(months, int):
        raise InvalidDateError(f"months must be an int, got {type(months)!r}")

    month_index = base_date.month - 1 + months
    year = base_date.year + month_index // 12
    month = month_index % 12 + 1
    last_day_of_target_month = calendar.monthrange(year, month)[1]
    day = min(base_date.day, last_day_of_target_month)
    return date(year, month, day)


def add_calendar_years(base_date: date, years: int) -> date:
    """
    Adds whole calendar years — e.g. the NH Act Section 3D "one year from
    publication of the 3A notification" window. Delegates to
    add_calendar_months so a 29-Feb trigger correctly lands on 28-Feb of a
    non-leap target year rather than raising or silently rolling to 1-Mar.
    """
    return add_calendar_months(base_date, years * 12)


def add_days(base_date: date, days: int) -> date:
    if not isinstance(base_date, date):
        raise InvalidDateError(f"add_days requires a date, got {type(base_date)!r}")
    return date.fromordinal(base_date.toordinal() + days)


def days_between(start: date, end: date) -> int:
    """Signed day count `end - start` (negative if `end` precedes `start`)."""
    if not isinstance(start, date) or not isinstance(end, date):
        raise InvalidDateError("days_between requires two date objects")
    return (end - start).days


@dataclass(frozen=True)
class StatutoryDuration:
    """
    A statutory time period as encoded from a RuleSet's `duration_definition`.
    Exactly the fields actually needed by the Step 6A matrices — kept as three
    independent optional components (not a single unit+value pair) so a period
    with a genuinely undetermined unit can be represented as "nothing set"
    rather than forcing a guess.

    `counting_convention_verified`: whether the exact inclusive/exclusive
    counting of the trigger day itself has been legally confirmed. Defaults to
    False for every rule in this prototype (see
    docs/step6a-statutory-clock-audit.md §15/§25 item 6 — this specific
    nuance was explicitly NOT resolved by the Step 6A audit). The computation
    still proceeds on the ordinary "trigger date + period" convention (the
    trigger day itself is the zero-point, not separately added or subtracted)
    because SOME deterministic, reproducible number is required for the clock
    to be useful at all — but this flag is a standing, queryable signal that
    the exact day has not been legally confirmed, so callers must not present
    `computed_deadline` as beyond-doubt precise while it stays False.
    """

    months: Optional[int] = None
    years: Optional[int] = None
    days: Optional[int] = None
    counting_convention_verified: bool = False

    def is_defined(self) -> bool:
        return self.months is not None or self.years is not None or self.days is not None

    def describe(self) -> str:
        parts = []
        if self.years:
            parts.append(f"{self.years} year(s)")
        if self.months:
            parts.append(f"{self.months} month(s)")
        if self.days:
            parts.append(f"{self.days} day(s)")
        return " + ".join(parts) if parts else "(undefined)"


def compute_deadline(trigger_date: Optional[date], duration: Optional[StatutoryDuration]) -> date:
    """
    trigger_date + duration, applying years then months then days. Raises
    InvalidDateError (never returns a guessed value) if either input is
    missing or the duration has nothing set — the caller must treat that as
    INSUFFICIENT_BASIS, not silently skip the computation.
    """
    if trigger_date is None:
        raise InvalidDateError("trigger_date is required to compute a statutory deadline")
    if duration is None or not duration.is_defined():
        raise InvalidDateError("duration has no months/years/days set")

    result = trigger_date
    if duration.years:
        result = add_calendar_years(result, duration.years)
    if duration.months:
        result = add_calendar_months(result, duration.months)
    if duration.days:
        result = add_days(result, duration.days)
    return result
