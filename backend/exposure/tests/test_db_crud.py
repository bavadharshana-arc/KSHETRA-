"""
Persistence-layer tests over an ISOLATED in-memory SQLite database (never the
real backend/kshetra.db) -- covers append-only persistence, JSON component-
trace round-tripping, `latest_only` dedup, `min_band` filtering, and the
priority queue's deterministic tie-breaking (Section 17: never a raw row id).

Mirrors the fact that `backend/blockers/tests/` and `backend/legal/tests/`
never stand up a real database either -- but the exposure persistence layer
(`db_crud.py`) is genuinely SQL-query-shaped (dedup/sort/filter over rows),
so its own correctness is only meaningfully testable against a real, if
disposable, SQLAlchemy session.
"""

from __future__ import annotations

import unittest
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Import order matters only for registering every ORM class on the shared
# `Base.metadata` before `create_all` -- mirrors migrations/env.py's own
# import list exactly (models, legal, blockers, exposure).
from database import Base
import models as core_models  # noqa: F401
from legal import db_models as legal_db_models  # noqa: F401
from blockers import db_models as blockers_db_models  # noqa: F401
from exposure import db_models as exposure_db_models

from exposure import db_crud, engine

_CALC_DATE = date(2026, 9, 15)
_CALC_AT = datetime(2026, 9, 15, tzinfo=timezone.utc)


def _make_session():
    """A fresh, isolated in-memory SQLite database per test -- `StaticPool`
    keeps the same in-memory connection alive across statements within one
    test (a plain `sqlite:///:memory:` engine would otherwise open a new,
    empty database per connection). Returns (session, engine) so callers can
    dispose the engine on teardown and avoid ResourceWarnings."""
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(test_engine)
    session_factory = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)
    return session_factory(), test_engine


def _build_assessment(case_reference="CASE-X", **overrides):
    kwargs = dict(
        case_reference=case_reference,
        project_id=None,
        parcel_id=None,
        blockers=(),
        prediction_id="PRED-1",
        prediction_delay_probability=0.5,
        calculation_date=_CALC_DATE,
        calculated_at=_CALC_AT,
    )
    kwargs.update(overrides)
    return engine.assess_case(**kwargs)


def _insert_raw(
    db,
    *,
    id_,
    case_reference,
    priority_score,
    priority_band,
    exposure_score=40.0,
    exposure_band="MODERATE",
    project_id=None,
    created_at=None,
):
    """Directly constructs a minimal `ExposureAssessmentRecord` for tests
    that only care about ordering/filtering, not the full scoring pipeline."""
    row = exposure_db_models.ExposureAssessmentRecord(
        id=id_,
        case_reference=case_reference,
        project_id=project_id,
        exposure_score=exposure_score,
        exposure_band=exposure_band,
        priority_score=priority_score,
        priority_band=priority_band,
        confidence_label="VERIFIED",
        unresolved_conflict=False,
        component_trace={},
        engine_version="test",
        calculation_date=_CALC_DATE,
        notes="",
        calculated_at=_CALC_AT,
    )
    db.add(row)
    db.commit()
    if created_at is not None:
        row.created_at = created_at
        db.commit()
    return row


class PersistenceRoundTripTests(unittest.TestCase):
    def setUp(self):
        self.db, self._engine = _make_session()

    def tearDown(self):
        self.db.close()
        self._engine.dispose()

    def test_persist_and_get_round_trip(self):
        assessment = _build_assessment()
        record = db_crud.persist_case_assessment(self.db, assessment)
        fetched = db_crud.get_exposure_assessment(self.db, record.id)
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched.id, assessment.assessment_id)
        self.assertEqual(fetched.exposure_score, assessment.exposure_score)
        self.assertEqual(fetched.exposure_band, assessment.exposure_band.value)
        self.assertEqual(fetched.priority_band, assessment.priority_band.value)
        # Component trace round-trips faithfully through JSON.
        self.assertEqual(fetched.component_trace["weights_version"], assessment.component_trace.weights_version)
        self.assertEqual(
            fetched.component_trace["staleness_policy_version"], assessment.component_trace.staleness_policy_version
        )
        self.assertIn("gis_downstream_note", fetched.component_trace)

    def test_get_missing_assessment_returns_none(self):
        self.assertIsNone(db_crud.get_exposure_assessment(self.db, "EXP-does-not-exist"))

    def test_append_only_never_overwrites(self):
        """Section 15: every recomputation is a NEW row, never an update."""
        a1 = _build_assessment(case_reference="CASE-APPEND", prediction_delay_probability=0.3)
        a2 = _build_assessment(case_reference="CASE-APPEND", prediction_delay_probability=0.9)
        db_crud.persist_case_assessment(self.db, a1)
        db_crud.persist_case_assessment(self.db, a2)
        all_rows = (
            self.db.query(exposure_db_models.ExposureAssessmentRecord)
            .filter_by(case_reference="CASE-APPEND")
            .all()
        )
        self.assertEqual(len(all_rows), 2)
        self.assertNotEqual(a1.assessment_id, a2.assessment_id)


class LatestOnlyTests(unittest.TestCase):
    def setUp(self):
        self.db, self._engine = _make_session()

    def tearDown(self):
        self.db.close()
        self._engine.dispose()

    def test_latest_only_keeps_most_recent_row_per_case(self):
        older = _insert_raw(
            self.db, id_="EXP-OLD", case_reference="CASE-LATEST", priority_score=10.0, priority_band="WATCH",
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        newer = _insert_raw(
            self.db, id_="EXP-NEW", case_reference="CASE-LATEST", priority_score=90.0, priority_band="ACT_NOW",
            created_at=datetime(2026, 9, 1, tzinfo=timezone.utc),
        )
        results = db_crud.list_exposure_assessments(self.db, case_reference="CASE-LATEST", latest_only=True)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].id, "EXP-NEW")

    def test_latest_only_false_returns_full_history(self):
        _insert_raw(
            self.db, id_="EXP-A", case_reference="CASE-HIST", priority_score=10.0, priority_band="WATCH",
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        _insert_raw(
            self.db, id_="EXP-B", case_reference="CASE-HIST", priority_score=90.0, priority_band="ACT_NOW",
            created_at=datetime(2026, 9, 1, tzinfo=timezone.utc),
        )
        results = db_crud.list_exposure_assessments(self.db, case_reference="CASE-HIST", latest_only=False)
        self.assertEqual(len(results), 2)


class MinBandFilterTests(unittest.TestCase):
    def setUp(self):
        self.db, self._engine = _make_session()

    def tearDown(self):
        self.db.close()
        self._engine.dispose()

    def test_min_band_filters_exposure_list(self):
        _insert_raw(self.db, id_="EXP-LOW", case_reference="CASE-LOW", priority_score=10.0, priority_band="WATCH", exposure_band="LOW")
        _insert_raw(self.db, id_="EXP-CRIT", case_reference="CASE-CRIT", priority_score=90.0, priority_band="ACT_NOW", exposure_band="CRITICAL")
        results = db_crud.list_exposure_assessments(self.db, min_band="HIGH")
        ids = {r.id for r in results}
        self.assertIn("EXP-CRIT", ids)
        self.assertNotIn("EXP-LOW", ids)

    def test_min_band_filters_priority_queue(self):
        _insert_raw(self.db, id_="EXP-WATCH", case_reference="CASE-A", priority_score=5.0, priority_band="WATCH")
        _insert_raw(self.db, id_="EXP-ACT", case_reference="CASE-B", priority_score=95.0, priority_band="ACT_NOW")
        results = db_crud.priority_queue(self.db, min_band="ACT_NOW")
        ids = {r.id for r in results}
        self.assertIn("EXP-ACT", ids)
        self.assertNotIn("EXP-WATCH", ids)


class PriorityQueueTieBreakTests(unittest.TestCase):
    """Test 9 (audit §20): two cases with identical priority_score resolve
    via a documented, stable tiebreak (`case_reference` ascending) --
    reproducible across repeated runs, never the server-generated row id."""

    def setUp(self):
        self.db, self._engine = _make_session()

    def tearDown(self):
        self.db.close()
        self._engine.dispose()

    def test_tie_broken_by_case_reference_ascending_not_by_id(self):
        # Deliberately give the ALPHABETICALLY LATER case_reference the
        # LEXICALLY SMALLER id, so a (wrong) id-based tiebreak would sort
        # these in the opposite order from a correct case_reference-based one.
        _insert_raw(self.db, id_="EXP-ZZZZZZ", case_reference="CASE-AAA", priority_score=60.0, priority_band="SOON")
        _insert_raw(self.db, id_="EXP-AAAAAA", case_reference="CASE-BBB", priority_score=60.0, priority_band="SOON")
        results = db_crud.priority_queue(self.db)
        self.assertEqual([r.case_reference for r in results], ["CASE-AAA", "CASE-BBB"])

    def test_reproducible_across_repeated_calls(self):
        _insert_raw(self.db, id_="EXP-1", case_reference="CASE-M", priority_score=60.0, priority_band="SOON")
        _insert_raw(self.db, id_="EXP-2", case_reference="CASE-N", priority_score=60.0, priority_band="SOON")
        _insert_raw(self.db, id_="EXP-3", case_reference="CASE-Z", priority_score=90.0, priority_band="ACT_NOW")
        first = [r.id for r in db_crud.priority_queue(self.db)]
        second = [r.id for r in db_crud.priority_queue(self.db)]
        third = [r.id for r in db_crud.priority_queue(self.db)]
        self.assertEqual(first, second)
        self.assertEqual(second, third)
        self.assertEqual(first[0], "EXP-3")  # highest priority_score first

    def test_ordered_by_priority_score_descending(self):
        _insert_raw(self.db, id_="EXP-LOW", case_reference="CASE-1", priority_score=20.0, priority_band="MONITOR")
        _insert_raw(self.db, id_="EXP-HIGH", case_reference="CASE-2", priority_score=80.0, priority_band="ACT_NOW")
        _insert_raw(self.db, id_="EXP-MID", case_reference="CASE-3", priority_score=50.0, priority_band="SOON")
        results = db_crud.priority_queue(self.db)
        self.assertEqual([r.id for r in results], ["EXP-HIGH", "EXP-MID", "EXP-LOW"])

    def test_limit_applied_after_ordering(self):
        _insert_raw(self.db, id_="EXP-A", case_reference="CASE-A", priority_score=20.0, priority_band="MONITOR")
        _insert_raw(self.db, id_="EXP-B", case_reference="CASE-B", priority_score=80.0, priority_band="ACT_NOW")
        _insert_raw(self.db, id_="EXP-C", case_reference="CASE-C", priority_score=50.0, priority_band="SOON")
        results = db_crud.priority_queue(self.db, limit=2)
        self.assertEqual([r.id for r in results], ["EXP-B", "EXP-C"])


class LatestProjectParcelLookupTests(unittest.TestCase):
    def setUp(self):
        self.db, self._engine = _make_session()

    def tearDown(self):
        self.db.close()
        self._engine.dispose()

    def test_get_latest_project_assessment_none_when_absent(self):
        self.assertIsNone(db_crud.get_latest_project_assessment(self.db, "PROJ-NOPE"))

    def test_get_latest_project_assessment_returns_most_recent(self):
        older = exposure_db_models.ExposureAssessmentRecord(
            id="EXP-OLD-P", case_reference="CASE-P", project_id="PROJ-1",
            exposure_score=10.0, exposure_band="LOW", priority_score=10.0, priority_band="WATCH",
            confidence_label="VERIFIED", unresolved_conflict=False, component_trace={},
            engine_version="test", calculation_date=_CALC_DATE, notes="", calculated_at=_CALC_AT,
        )
        self.db.add(older)
        self.db.commit()
        older.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
        self.db.commit()

        newer = exposure_db_models.ExposureAssessmentRecord(
            id="EXP-NEW-P", case_reference="CASE-P", project_id="PROJ-1",
            exposure_score=80.0, exposure_band="HIGH", priority_score=80.0, priority_band="ACT_NOW",
            confidence_label="VERIFIED", unresolved_conflict=False, component_trace={},
            engine_version="test", calculation_date=_CALC_DATE, notes="", calculated_at=_CALC_AT,
        )
        self.db.add(newer)
        self.db.commit()
        newer.created_at = datetime(2026, 9, 1, tzinfo=timezone.utc)
        self.db.commit()

        result = db_crud.get_latest_project_assessment(self.db, "PROJ-1")
        self.assertEqual(result.id, "EXP-NEW-P")


if __name__ == "__main__":
    unittest.main()
