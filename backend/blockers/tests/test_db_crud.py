"""
Persistence-layer tests over an ISOLATED in-memory SQLite database (never the
real backend/kshetra.db) -- covers `list_blockers`'s `latest_only` grouping
and `get_primary_blocker`'s project/parcel scoping.

Mirrors `exposure/tests/test_db_crud.py`'s own precedent and rationale: the
rest of `backend/blockers/tests/` exercises the pure engine (no database),
but `db_crud.py`'s query logic is genuinely SQL-shaped and only meaningfully
testable against a real, if disposable, SQLAlchemy session.

Step 8C-B.5: added specifically to cover the multi-parcel-per-project
aggregation bug (`list_blockers(project_id=..., latest_only=True)` used to
collapse every parcel's own blockers down to whichever one had the single
most-recently-computed `evaluation_run_id`, because grouping was keyed on
`case_reference` alone and every real parcel evaluation shares
`case_reference == project_id`) -- this file did not exist before that fix,
so the bug had zero regression coverage until now.
"""

from __future__ import annotations

import unittest
from datetime import date, datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Import order matters only for registering every ORM class on the shared
# `Base.metadata` before `create_all` -- mirrors migrations/env.py's own
# import list exactly (models, legal, blockers, exposure).
from database import Base
import models as core_models  # noqa: F401
from legal import db_models as legal_db_models  # noqa: F401
from blockers import db_crud, db_models
from exposure import db_models as exposure_db_models  # noqa: F401

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


def _insert_raw(
    db,
    *,
    id_,
    evaluation_run_id,
    case_reference,
    blocker_type="B2",
    status="SUSPECTED",
    severity="HIGH",
    project_id=None,
    parcel_id=None,
    is_primary=False,
    created_at=None,
):
    """Directly constructs a minimal `BlockerRecord` for tests that only
    care about ordering/grouping/filtering, not the full detection
    pipeline."""
    row = db_models.BlockerRecord(
        id=id_,
        evaluation_run_id=evaluation_run_id,
        case_reference=case_reference,
        project_id=project_id,
        parcel_id=parcel_id,
        blocker_type=blocker_type,
        status=status,
        severity=severity,
        owner_role="Revenue / Registration authority",
        responsible_authority="Revenue Department (Tahsildar) / Sub-Registrar Office",
        is_primary=is_primary,
        engine_version="test",
        calculation_date=_CALC_DATE,
        calculated_at=_CALC_AT,
    )
    db.add(row)
    db.commit()
    if created_at is not None:
        row.created_at = created_at
        db.commit()
    return row


class MultiParcelProjectAggregationTests(unittest.TestCase):
    """The exact Step 8C-B.5 regression scenario: several parcels of one
    project, each evaluated independently (its own `evaluation_run_id`),
    all sharing `case_reference == project_id`."""

    def setUp(self):
        self.db, self._engine = _make_session()

    def tearDown(self):
        self.db.close()
        self._engine.dispose()

    def test_project_scoped_query_returns_every_parcels_own_latest_run(self):
        _insert_raw(
            self.db, id_="BLK-P1", evaluation_run_id="RUN-1", case_reference="PROJ-X",
            project_id="PROJ-X", parcel_id="P-1",
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        _insert_raw(
            self.db, id_="BLK-P2", evaluation_run_id="RUN-2", case_reference="PROJ-X",
            project_id="PROJ-X", parcel_id="P-2",
            created_at=datetime(2026, 2, 1, tzinfo=timezone.utc),
        )
        _insert_raw(
            self.db, id_="BLK-P3", evaluation_run_id="RUN-3", case_reference="PROJ-X",
            project_id="PROJ-X", parcel_id="P-3",
            created_at=datetime(2026, 3, 1, tzinfo=timezone.utc),  # the most recent of the three
        )

        results = db_crud.list_blockers(self.db, project_id="PROJ-X", latest_only=True)
        self.assertEqual({r.id for r in results}, {"BLK-P1", "BLK-P2", "BLK-P3"})

    def test_a_rerun_for_one_parcel_only_supersedes_that_parcels_own_prior_run(self):
        _insert_raw(
            self.db, id_="BLK-P1-OLD", evaluation_run_id="RUN-1-OLD", case_reference="PROJ-Y",
            project_id="PROJ-Y", parcel_id="P-1",
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        _insert_raw(
            self.db, id_="BLK-P1-NEW", evaluation_run_id="RUN-1-NEW", case_reference="PROJ-Y",
            project_id="PROJ-Y", parcel_id="P-1",
            created_at=datetime(2026, 2, 1, tzinfo=timezone.utc),
        )
        _insert_raw(
            self.db, id_="BLK-P2", evaluation_run_id="RUN-2", case_reference="PROJ-Y",
            project_id="PROJ-Y", parcel_id="P-2",
            created_at=datetime(2026, 1, 15, tzinfo=timezone.utc),
        )

        results = db_crud.list_blockers(self.db, project_id="PROJ-Y", latest_only=True)
        self.assertEqual({r.id for r in results}, {"BLK-P1-NEW", "BLK-P2"})

    def test_one_run_with_multiple_blocker_rows_for_the_same_parcel_all_survive(self):
        """A single evaluation run legitimately raises several blockers
        (e.g. B2 + B3 + B4) for one parcel -- all rows share one
        evaluation_run_id and must all be kept, not just one."""
        _insert_raw(
            self.db, id_="BLK-P1-B2", evaluation_run_id="RUN-1", case_reference="PROJ-Z",
            project_id="PROJ-Z", parcel_id="P-1", blocker_type="B2",
        )
        _insert_raw(
            self.db, id_="BLK-P1-B3", evaluation_run_id="RUN-1", case_reference="PROJ-Z",
            project_id="PROJ-Z", parcel_id="P-1", blocker_type="B3",
        )
        results = db_crud.list_blockers(self.db, project_id="PROJ-Z", latest_only=True)
        self.assertEqual({r.id for r in results}, {"BLK-P1-B2", "BLK-P1-B3"})

    def test_parcel_scoped_query_is_unaffected_by_the_fix(self):
        _insert_raw(
            self.db, id_="BLK-P1", evaluation_run_id="RUN-1", case_reference="PROJ-W",
            project_id="PROJ-W", parcel_id="P-1",
        )
        _insert_raw(
            self.db, id_="BLK-P2", evaluation_run_id="RUN-2", case_reference="PROJ-W",
            project_id="PROJ-W", parcel_id="P-2",
        )
        results = db_crud.list_blockers(self.db, parcel_id="P-1", latest_only=True)
        self.assertEqual([r.id for r in results], ["BLK-P1"])

    def test_synthetic_unlinked_rows_still_group_by_case_reference_alone(self):
        """Rows with no project/parcel at all (project_id=None,
        parcel_id=None -- e.g. the fully-synthetic legal demo scenarios)
        must behave exactly as before this fix."""
        _insert_raw(
            self.db, id_="BLK-OLD", evaluation_run_id="RUN-OLD", case_reference="SYN-CASE-1",
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        _insert_raw(
            self.db, id_="BLK-NEW", evaluation_run_id="RUN-NEW", case_reference="SYN-CASE-1",
            created_at=datetime(2026, 2, 1, tzinfo=timezone.utc),
        )
        results = db_crud.list_blockers(self.db, latest_only=True)
        self.assertEqual([r.id for r in results], ["BLK-NEW"])


class GetPrimaryBlockerProjectScopeTests(unittest.TestCase):
    def setUp(self):
        self.db, self._engine = _make_session()

    def tearDown(self):
        self.db.close()
        self._engine.dispose()

    def test_project_only_query_ignores_a_parcels_own_primary(self):
        """Several independently-evaluated parcels can each carry their OWN
        is_primary=True blocker. A project_id-only lookup (no parcel_id)
        must never surface one arbitrary parcel's primary as "the
        project's" -- it should only ever return a genuinely project
        -scoped (parcel_id IS NULL) primary blocker, or None."""
        _insert_raw(
            self.db, id_="BLK-P1", evaluation_run_id="RUN-1", case_reference="PROJ-A",
            project_id="PROJ-A", parcel_id="P-1", is_primary=True,
        )
        _insert_raw(
            self.db, id_="BLK-P2", evaluation_run_id="RUN-2", case_reference="PROJ-A",
            project_id="PROJ-A", parcel_id="P-2", is_primary=True,
        )
        self.assertIsNone(db_crud.get_primary_blocker(self.db, project_id="PROJ-A"))

    def test_project_only_query_finds_a_genuine_project_scoped_primary(self):
        _insert_raw(
            self.db, id_="BLK-P1", evaluation_run_id="RUN-1", case_reference="PROJ-B",
            project_id="PROJ-B", parcel_id="P-1", is_primary=True,
        )
        _insert_raw(
            self.db, id_="BLK-PROJ", evaluation_run_id="RUN-2", case_reference="PROJ-B",
            project_id="PROJ-B", parcel_id=None, is_primary=True,
        )
        result = db_crud.get_primary_blocker(self.db, project_id="PROJ-B")
        self.assertEqual(result.id, "BLK-PROJ")

    def test_parcel_scoped_query_returns_that_parcels_own_primary_unaffected(self):
        _insert_raw(
            self.db, id_="BLK-P1", evaluation_run_id="RUN-1", case_reference="PROJ-C",
            project_id="PROJ-C", parcel_id="P-1", is_primary=True,
        )
        result = db_crud.get_primary_blocker(self.db, parcel_id="P-1")
        self.assertEqual(result.id, "BLK-P1")


if __name__ == "__main__":
    unittest.main()
