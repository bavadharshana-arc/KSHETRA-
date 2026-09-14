"""
===============================================================================
KSHETRA: Statutory Clock Engine — Demo Seed Script
===============================================================================

Persists:
  1. Every RuleSet in rule_seed_data.ALL_RULE_SETS (upsert-by-id, safe to
     re-run — mirrors backend/seed.py's convention).
  2. The AcquisitionEvent / CourtStayEvent / ExtensionEvidence records behind
     each of the six demo_scenarios.ALL_DEMO_SCENARIOS (skip-if-already-
     present by their fixed synthetic id, since these are meant to be
     immutable evidence — re-running never duplicates them).
  3. Runs each scenario through the real clock_engine.compute_statutory_clock
     and stores the resulting StatutoryClock (+ any EventConflict) — this is
     a genuinely NEW row every run, mirroring the existing `Prediction`
     table's append-only history philosophy, so each clock_id is freshly
     generated rather than reused.

NOT wired into backend/main.py or any router. Run directly:

    python legal/seed_demo_db.py

(from the backend/ directory, or with backend/ on PYTHONPATH).

Every event/stay/extension here carries source_type = SYNTHETIC_DEMO (or, for
CourtStayEvent, a "SYN-"-prefixed source_document) — see
docs/step6a-statutory-clock-audit.md §17 and demo_scenarios.py. NEVER treat
this data as a real government case.
"""

from __future__ import annotations

import os
import sys
import uuid

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # backend/
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from database import Base, SessionLocal, engine  # noqa: E402
import models  # noqa: E402,F401  (registers the six persistence-plan tables on Base.metadata)

from legal import db_crud, db_models  # noqa: E402,F401  (registers the legal tables on Base.metadata)
from legal.clock_engine import compute_statutory_clock  # noqa: E402
from legal.demo_scenarios import ALL_DEMO_SCENARIOS  # noqa: E402
from legal.rule_seed_data import ALL_RULE_SETS  # noqa: E402


def _seed_rule_sets(db) -> None:
    for rule in ALL_RULE_SETS:
        db_crud.upsert_rule_set(db, rule)
    print(f"[legal seed] Upserted {len(ALL_RULE_SETS)} RuleSet row(s), all approval_status="
          "PENDING_LEGAL_REVIEW.")


def _seed_scenario(db, scenario) -> None:
    for event in scenario.events:
        if db.get(db_models.AcquisitionEventRecord, event.event_id) is None:
            db_crud.create_acquisition_event(db, event)
    for stay in scenario.stays:
        if db.get(db_models.CourtStayEventRecord, stay.stay_id) is None:
            db_crud.create_court_stay_event(db, stay)
    if scenario.extension is not None and db.get(db_models.ExtensionEvidenceRecord, scenario.extension.extension_id) is None:
        db_crud.create_extension_evidence(db, scenario.extension)

    result = compute_statutory_clock(
        clock_id=f"{scenario.scenario_id}-{uuid.uuid4().hex[:8]}",
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

    conflict_id = None
    if result.event_conflict is not None:
        conflict_row = db_crud.create_event_conflict(db, result.event_conflict)
        conflict_id = conflict_row.id

    db_crud.create_statutory_clock(db, result, event_conflict_id=conflict_id)

    status_ok = "OK" if result.clock_status == scenario.expected_clock_status else "MISMATCH"
    print(
        f"[legal seed] {scenario.scenario_id}: clock_status={result.clock_status.value} "
        f"(expected {scenario.expected_clock_status.value}) [{status_ok}], "
        f"consequence_class={result.consequence_class.value}"
    )


def main() -> None:
    Base.metadata.create_all(bind=engine, checkfirst=True)
    db = SessionLocal()
    try:
        _seed_rule_sets(db)
        for scenario in ALL_DEMO_SCENARIOS:
            _seed_scenario(db, scenario)
    finally:
        db.close()
    print("[legal seed] Done. Every event/stay/extension seeded above uses source_type = "
          "SYNTHETIC_DEMO - illustrative only, never a real government case.")


if __name__ == "__main__":
    main()
