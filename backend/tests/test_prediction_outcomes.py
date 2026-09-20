"""
STEP 9B validation: Prediction.model_version persistence and the new
PredictionOutcome append-only table (models.py, schemas.py, crud.py,
routers/prediction_outcomes.py), plus a migration round-trip check.

Persistence-layer assertions (model_version passthrough, CRUD helpers, FK
linkage) run against an ISOLATED in-memory SQLite database -- mirrors
exposure/tests/test_db_crud.py's own pattern, never the real
backend/kshetra.db. Router behavior (status codes, 404s, absence of
PATCH/DELETE) is exercised through fastapi.testclient.TestClient against a
minimal app that mounts only routers/predictions.py and
routers/prediction_outcomes.py, with database.get_db overridden to the test
session -- backend/main.py's full app (ai-model / legal / blockers /
exposure preload) is never imported here, so these tests never depend on the
ML artifacts being present.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from datetime import date

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import crud
import models
from database import Base, get_db
from routers import prediction_outcomes as prediction_outcomes_router
from routers import predictions as predictions_router

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# -----------------------------------------------------------------------------
# Shared fixtures
# -----------------------------------------------------------------------------
def _make_session_factory():
    """A fresh, isolated in-memory SQLite database per test -- `StaticPool`
    keeps the same in-memory connection alive across statements within one
    test (a plain `sqlite:///:memory:` engine would otherwise open a new,
    empty database per connection)."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    # expire_on_commit=False: several tests (e.g. the API test class) build
    # fixture rows in one session, close it, then read plain attributes
    # (like `.id`) off the still-in-Python-memory object from test methods
    # afterward -- the default expire-on-commit behavior would otherwise
    # require a live session to refresh those attributes and raise
    # DetachedInstanceError.
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True, expire_on_commit=False)
    return factory, engine


def _seed_project_and_parcel(db):
    project = models.Project(
        id="proj-test",
        name="Test Corridor",
        code="TC-1",
        department="PWD",
        agency="NHAI",
        total_length_km=10.0,
        project_value_crores=100.0,
        total_parcels=1,
        acquired_parcels=0,
        pending_parcels=1,
        high_risk_parcels=0,
        med_risk_parcels=0,
        low_risk_parcels=1,
        predicted_delay_months=2.0,
        status="On Track",
        current_larr_stage="Notification (Sec 3A/11)",
        corridor_sections=[],
        corridor_path=[],
    )
    db.add(project)

    parcel = models.Parcel(
        id="P-TEST-1",
        survey_number="123/1",
        ulpin="U1",
        project_id="proj-test",
        project_name="Test Corridor",
        owner_name="Owner",
        co_owners=[],
        co_owner_count=0,
        village="V",
        taluk="T",
        district="D",
        area_acres=1.0,
        area_sq_meters=4046.0,
        mutation_status="Done",
        last_mutation_years_ago=1,
        document_status="Clear",
        record_freshness_score=90,
        record_confidence="HIGH",
        court_case=False,
        court_case_status="None",
        ownership_dispute="None",
        acquisition_status="Pending",
        stage="Notification (Sec 3A/11)",
        notification_date="12-Jan-2024",
        compensation_status="Pending",
        estimated_compensation_crores=1.0,
        possession_status="Pending",
        delay_risk_score=50,
        risk_level="medium",
        predicted_delay_months=3.0,
        predicted_delay_range="2-4",
        delay_confidence="MEDIUM",
        top_risk_factor="Litigation",
        ai_explanation="status",
        shap_factors=[],
        risk_factors_list=[],
        recommended_action="Monitor",
        priority="MEDIUM",
        predicted_delay_after_intervention=2.0,
        potential_reduction_months=1.0,
        intervention_status="NOT_STARTED",
        field_verified=False,
        gps_lat=12.9,
        gps_lng=77.6,
        map_coordinates=[],
        center_lat=12.9,
        center_lng=77.6,
        sync_status="synced",
    )
    db.add(parcel)
    db.commit()
    return project, parcel


def _build_prediction(*, parcel_id=None, model_version="lgbm-v1"):
    return models.Prediction(
        project_id="proj-test",
        parcel_id=parcel_id,
        scope="parcel" if parcel_id else "project",
        project_name="Test Corridor",
        generated_at="2026-09-16 10:00 UTC",
        is_real_api_prediction=True,
        prediction_mode="live-model",
        model_input={"parcel_count": 1},
        aggregation_notes=[],
        delay_probability=0.6,
        delay_risk_score=60.0,
        risk_level="medium",
        predicted_delay_range="n/a",
        top_risk_factor="Litigation",
        ai_explanation="status",
        shap_factors=[],
        recommended_action="n/a",
        model_version=model_version,
    )


def _valid_outcome_payload(**overrides):
    payload = {
        "actual_event_occurred": True,
        "actual_duration_months": 5.5,
        "actual_completion_date": "2026-06-01",
        "observed_as_of_date": "2026-09-16",
        "source_type": "FIELD_VERIFICATION",
        "evidence_reference": "site-visit-2026-09-16.pdf",
        "confidence": "PARTIAL",
        "entered_by": "officer-42",
    }
    payload.update(overrides)
    return payload


# -----------------------------------------------------------------------------
# Prediction.model_version
# -----------------------------------------------------------------------------
class PredictionModelVersionTests(unittest.TestCase):
    def setUp(self):
        self.session_factory, self.engine = _make_session_factory()
        self.db = self.session_factory()
        _seed_project_and_parcel(self.db)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_new_prediction_persists_model_version(self):
        row = crud.create_prediction(self.db, _build_prediction(model_version="lgbm-v3.2"))
        fetched = crud.get_prediction(self.db, row.id)
        self.assertEqual(fetched.model_version, "lgbm-v3.2")

    def test_new_demo_fallback_prediction_has_null_model_version(self):
        """Mirrors inference_service.run_prediction()'s demo-fallback meta,
        which always reports model_version=None (no trained artifact)."""
        row = crud.create_prediction(self.db, _build_prediction(model_version=None))
        fetched = crud.get_prediction(self.db, row.id)
        self.assertIsNone(fetched.model_version)

    def test_historical_prediction_without_model_version_column_value_remains_readable(self):
        """Simulates a row inserted before this column existed: written via a
        raw INSERT that never mentions model_version at all (not even NULL
        explicitly), which is exactly what SQLite does for an added nullable
        column on pre-existing rows -- the column defaults to NULL and the
        row is otherwise untouched and fully readable."""
        self.db.execute(
            models.Prediction.__table__.insert().values(
                id="legacy-pred-1",
                project_id="proj-test",
                parcel_id=None,
                scope="project",
                project_name="Test Corridor",
                generated_at="2024-01-01 00:00 UTC",
                is_real_api_prediction=True,
                prediction_mode="live-model",
                api_error=None,
                model_input={"parcel_count": 1},
                sample_coverage=None,
                input_diagnostics=None,
                aggregation_notes=[],
                delay_probability=0.4,
                delay_risk_score=40.0,
                risk_level="low",
                predicted_delay_months=None,
                predicted_delay_range="n/a",
                top_risk_factor="None",
                ai_explanation="legacy row",
                shap_factors=[],
                survival_analysis=None,
                recommended_action="n/a",
                # model_version intentionally omitted -- see docstring.
            )
        )
        self.db.commit()

        fetched = crud.get_prediction(self.db, "legacy-pred-1")
        self.assertIsNotNone(fetched)
        self.assertIsNone(fetched.model_version)
        self.assertEqual(fetched.ai_explanation, "legacy row")
        self.assertEqual(fetched.project_id, "proj-test")


# -----------------------------------------------------------------------------
# PredictionOutcome — CRUD layer
# -----------------------------------------------------------------------------
class PredictionOutcomeCrudTests(unittest.TestCase):
    def setUp(self):
        self.session_factory, self.engine = _make_session_factory()
        self.db = self.session_factory()
        _seed_project_and_parcel(self.db)
        self.prediction = crud.create_prediction(self.db, _build_prediction(parcel_id="P-TEST-1"))

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_create_and_get_round_trip(self):
        obj = models.PredictionOutcome(
            prediction_id=self.prediction.id,
            project_id=self.prediction.project_id,
            parcel_id=self.prediction.parcel_id,
            actual_event_occurred=True,
            observed_as_of_date=date(2026, 9, 16),
            source_type="MANUAL_ENTRY",
            entered_by="officer-1",
        )
        created = crud.create_prediction_outcome(self.db, obj)
        fetched = crud.get_prediction_outcome(self.db, created.id)
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched.prediction_id, self.prediction.id)
        self.assertFalse(fetched.verified)  # default, never fabricated True

    def test_list_scopes_to_the_right_prediction_only(self):
        other_prediction = crud.create_prediction(self.db, _build_prediction(parcel_id=None))

        crud.create_prediction_outcome(
            self.db,
            models.PredictionOutcome(
                prediction_id=self.prediction.id,
                project_id=self.prediction.project_id,
                parcel_id=self.prediction.parcel_id,
                actual_event_occurred=True,
                observed_as_of_date=date(2026, 9, 16),
                source_type="MANUAL_ENTRY",
                entered_by="officer-1",
            ),
        )
        crud.create_prediction_outcome(
            self.db,
            models.PredictionOutcome(
                prediction_id=other_prediction.id,
                project_id=other_prediction.project_id,
                parcel_id=other_prediction.parcel_id,
                actual_event_occurred=False,
                observed_as_of_date=date(2026, 9, 16),
                source_type="MANUAL_ENTRY",
                entered_by="officer-2",
            ),
        )

        results = crud.list_prediction_outcomes(self.db, self.prediction.id)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].prediction_id, self.prediction.id)

    def test_get_missing_outcome_returns_none(self):
        self.assertIsNone(crud.get_prediction_outcome(self.db, "does-not-exist"))

    def test_no_update_or_delete_helper_exists(self):
        """Structural guarantee behind requirement #6 -- append-only means
        these helpers must not exist at all, not merely be unused."""
        self.assertFalse(hasattr(crud, "update_prediction_outcome"))
        self.assertFalse(hasattr(crud, "delete_prediction_outcome"))


# -----------------------------------------------------------------------------
# PredictionOutcome — HTTP API layer
# -----------------------------------------------------------------------------
class PredictionOutcomeApiTests(unittest.TestCase):
    def setUp(self):
        self.session_factory, self.engine = _make_session_factory()

        seed_db = self.session_factory()
        _seed_project_and_parcel(seed_db)
        self.prediction = crud.create_prediction(seed_db, _build_prediction(parcel_id="P-TEST-1"))
        self.project_prediction = crud.create_prediction(seed_db, _build_prediction(parcel_id=None))
        seed_db.close()

        app = FastAPI()
        app.include_router(predictions_router.router)
        app.include_router(prediction_outcomes_router.router)

        def _override_get_db():
            db = self.session_factory()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = _override_get_db
        self.client = TestClient(app)

    def tearDown(self):
        self.engine.dispose()

    def test_valid_outcome_creation(self):
        resp = self.client.post(
            f"/api/predictions/{self.prediction.id}/outcomes",
            json=_valid_outcome_payload(),
        )
        self.assertEqual(resp.status_code, 201, resp.text)
        body = resp.json()
        self.assertEqual(body["prediction_id"], self.prediction.id)
        self.assertFalse(body["verified"])
        self.assertEqual(body["source_type"], "FIELD_VERIFICATION")

    def test_outcome_links_to_correct_prediction(self):
        self.client.post(f"/api/predictions/{self.prediction.id}/outcomes", json=_valid_outcome_payload())
        self.client.post(
            f"/api/predictions/{self.project_prediction.id}/outcomes",
            json=_valid_outcome_payload(entered_by="officer-99"),
        )

        resp = self.client.get(f"/api/predictions/{self.prediction.id}/outcomes")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(len(body), 1)
        self.assertEqual(body[0]["prediction_id"], self.prediction.id)

    def test_project_and_parcel_linkage_matches_referenced_prediction(self):
        resp = self.client.post(
            f"/api/predictions/{self.prediction.id}/outcomes", json=_valid_outcome_payload()
        )
        body = resp.json()
        self.assertEqual(body["project_id"], self.prediction.project_id)
        self.assertEqual(body["parcel_id"], self.prediction.parcel_id)  # "P-TEST-1"

        resp2 = self.client.post(
            f"/api/predictions/{self.project_prediction.id}/outcomes",
            json=_valid_outcome_payload(entered_by="officer-7"),
        )
        body2 = resp2.json()
        self.assertEqual(body2["project_id"], self.project_prediction.project_id)
        self.assertIsNone(body2["parcel_id"])  # project-scoped prediction has no parcel

    def test_invalid_prediction_id_on_create_returns_404(self):
        resp = self.client.post("/api/predictions/does-not-exist/outcomes", json=_valid_outcome_payload())
        self.assertEqual(resp.status_code, 404)

    def test_invalid_prediction_id_on_list_returns_404(self):
        resp = self.client.get("/api/predictions/does-not-exist/outcomes")
        self.assertEqual(resp.status_code, 404)

    def test_invalid_outcome_id_on_get_returns_404(self):
        resp = self.client.get("/api/prediction-outcomes/does-not-exist")
        self.assertEqual(resp.status_code, 404)

    def test_get_single_outcome_by_id(self):
        created = self.client.post(
            f"/api/predictions/{self.prediction.id}/outcomes", json=_valid_outcome_payload()
        ).json()
        resp = self.client.get(f"/api/prediction-outcomes/{created['id']}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["id"], created["id"])

    def test_outcome_cannot_be_updated_or_deleted(self):
        created = self.client.post(
            f"/api/predictions/{self.prediction.id}/outcomes", json=_valid_outcome_payload()
        ).json()

        collection_url = f"/api/predictions/{self.prediction.id}/outcomes"
        item_url = f"/api/prediction-outcomes/{created['id']}"

        self.assertEqual(self.client.patch(item_url, json={"verified": True}).status_code, 405)
        self.assertEqual(self.client.put(item_url, json={"verified": True}).status_code, 405)
        self.assertEqual(self.client.delete(item_url).status_code, 405)
        self.assertEqual(self.client.patch(collection_url, json={}).status_code, 405)
        self.assertEqual(self.client.delete(collection_url).status_code, 405)

        # Confirm the row genuinely never changed.
        resp = self.client.get(item_url)
        self.assertFalse(resp.json()["verified"])

    def test_required_field_missing_returns_422(self):
        payload = _valid_outcome_payload()
        del payload["entered_by"]
        resp = self.client.post(f"/api/predictions/{self.prediction.id}/outcomes", json=payload)
        self.assertEqual(resp.status_code, 422)

    def test_required_observed_as_of_date_missing_returns_422(self):
        payload = _valid_outcome_payload()
        del payload["observed_as_of_date"]
        resp = self.client.post(f"/api/predictions/{self.prediction.id}/outcomes", json=payload)
        self.assertEqual(resp.status_code, 422)

    def test_invalid_source_type_rejected(self):
        payload = _valid_outcome_payload(source_type="NOT_A_REAL_SOURCE")
        resp = self.client.post(f"/api/predictions/{self.prediction.id}/outcomes", json=payload)
        self.assertEqual(resp.status_code, 422)

    def test_invalid_confidence_rejected(self):
        payload = _valid_outcome_payload(confidence="SUPER_SURE")
        resp = self.client.post(f"/api/predictions/{self.prediction.id}/outcomes", json=payload)
        self.assertEqual(resp.status_code, 422)

    def test_verified_defaults_false_when_omitted(self):
        payload = _valid_outcome_payload()
        self.assertNotIn("verified", payload)
        resp = self.client.post(f"/api/predictions/{self.prediction.id}/outcomes", json=payload)
        self.assertEqual(resp.status_code, 201)
        self.assertFalse(resp.json()["verified"])

    def test_caller_may_assert_verified_true_at_creation(self):
        payload = _valid_outcome_payload(verified=True)
        resp = self.client.post(f"/api/predictions/{self.prediction.id}/outcomes", json=payload)
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.json()["verified"])

    def test_client_supplied_project_or_parcel_id_is_ignored_not_trusted(self):
        """schemas.PredictionOutcomeCreate has no project_id/parcel_id
        fields at all, so even a malicious/mistaken client-supplied value is
        simply not a recognized field -- the server always derives linkage
        from the referenced Prediction row (routers/prediction_outcomes.py)."""
        payload = _valid_outcome_payload(project_id="some-other-project", parcel_id="some-other-parcel")
        resp = self.client.post(f"/api/predictions/{self.prediction.id}/outcomes", json=payload)
        self.assertEqual(resp.status_code, 201, resp.text)
        body = resp.json()
        self.assertEqual(body["project_id"], self.prediction.project_id)
        self.assertEqual(body["parcel_id"], self.prediction.parcel_id)


# -----------------------------------------------------------------------------
# Migration round-trip: verifies the real Alembic chain (not a hand-rolled
# create_all) runs cleanly from an empty database up to head, producing both
# the new prediction_outcomes table and predictions.model_version.
# -----------------------------------------------------------------------------
class MigrationRoundTripTests(unittest.TestCase):
    def test_alembic_upgrade_head_from_empty_database(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            db_path = os.path.join(tmp_dir, "migration_check.db")
            db_url = "sqlite:///" + db_path.replace("\\", "/")
            env = dict(os.environ, DATABASE_URL=db_url)

            result = subprocess.run(
                [sys.executable, "-m", "alembic", "upgrade", "head"],
                cwd=BASE_DIR,
                env=env,
                capture_output=True,
                text=True,
                timeout=120,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

            import sqlite3

            con = sqlite3.connect(db_path)
            cur = con.cursor()
            cur.execute("PRAGMA table_info(predictions)")
            pred_columns = {row[1] for row in cur.fetchall()}
            self.assertIn("model_version", pred_columns)

            cur.execute("PRAGMA table_info(prediction_outcomes)")
            outcome_columns = {row[1] for row in cur.fetchall()}
            self.assertEqual(
                outcome_columns,
                {
                    "id",
                    "prediction_id",
                    "project_id",
                    "parcel_id",
                    "actual_event_occurred",
                    "actual_duration_months",
                    "actual_completion_date",
                    "observed_as_of_date",
                    "source_type",
                    "evidence_reference",
                    "verified",
                    "confidence",
                    "entered_by",
                    "created_at",
                },
            )
            con.close()


if __name__ == "__main__":
    unittest.main()
