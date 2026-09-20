"""
===============================================================================
KSHETRA: Legal / Blocker / Exposure — Real-Data Case Engine Runner (Step 8C-B.3)
===============================================================================

Runs the EXISTING, unmodified Blocker engine (backend/blockers/) and Exposure
& Priority engine (backend/exposure/) against the EXISTING seeded demo
Project/Parcel rows (backend/seed.py), persisting results ONLY through the
existing, unmodified persistence functions
(`blockers.db_crud.evaluate_and_persist_for_parcel`,
`exposure.db_crud.assess_and_persist_for_case`). This script contains NO
scoring logic, NO detection logic, and NO fabricated data of any kind — every
number/status it causes to be written to the database is a genuine output of
the real engines running against the real, already-seeded Parcel fields
(ownership_dispute, document_status, compensation_status, court_case_status,
possession_status, field_verified*, etc. — backend/seed.py, mirrors
src/data/mockData.ts).

NOT wired into backend/main.py or any router (same discipline as
legal/seed_demo_db.py and backend/seed.py). Run directly, from the backend/
directory so its flat-import siblings (database, models, crud) resolve:

    python seed_case_engines.py [--force]

--force re-runs the engines even if a result already exists for a parcel
(each run still APPENDS a new row/evaluation_run_id — see "Idempotency"
below). Without --force, a parcel already carrying a persisted result is
left untouched.

-------------------------------------------------------------------------------
WHY LEGAL CLOCKS ARE DELIBERATELY NOT TOUCHED BY THIS SCRIPT
-------------------------------------------------------------------------------
The statutory clock engine (backend/legal/) requires a real `AcquisitionEvent`
row (event_type, applicable_act, event_date, source_type, confidence,
verified) to compute a `StatutoryClock`. Direct inspection of the current
database (see the Step 8C-B.3 report) confirms:
  - The 7 existing `acquisition_events` rows are ALL synthetic demo-scenario
    events (`SYN-EVT-*`) with `project_id=None, parcel_id=None` — none
    reference the real seeded project/parcels.
  - `models.Parcel`/`models.Project` carry no `applicable_act` column and no
    structured legal-event log — only a free-text `stage` (LarrStage) field,
    which `legal/enums.py`'s own `EventType` docstring explicitly forbids
    using inside the legal engine ("NEVER a paired label like the existing
    (UI-only) LarrStage value... Do NOT use ... inside the legal engine").
  - `Parcel.notification_date` is a real, non-fabricated field, but turning
    it into an `AcquisitionEvent` would require GUESSING which Act applies
    (RFCTLARR vs. NH_ACT_1956 vs. LA_ACT_1894) — a legal determination this
    script has no legitimate basis to make up.

Per the task's own instruction ("If a legal clock cannot legitimately be
associated with an existing demo parcel/project under the current engine
design, leave it unlinked and report that limitation"), this script does
NOT create any AcquisitionEvent or StatutoryClock row, and does NOT attach
the 6 existing synthetic clocks to any real parcel. Verdict for every real
parcel/project: NOT COMPUTABLE FROM CURRENT DEMO DATA.

Because no real StatutoryClock exists for any real parcel, no B1 blocker
("statutory-clock exposure") can be legitimately raised either — B1 is
raised only from a supplied `StatutoryClockResult`
(blockers/engine.py:evaluate_case). This script supplies zero clocks, so B1
is correctly and honestly absent from every real parcel's blocker set. B2
(title/record friction), B3 (contested compensation), and B4
(possession-blocking encumbrance) all read directly from already-seeded,
real `Parcel` fields and ARE computed.

-------------------------------------------------------------------------------
WHY BLOCKERS AND EXPOSURE ARE COMPUTED PER-PARCEL, NOT AS ONE PROJECT-WIDE RUN
-------------------------------------------------------------------------------
`blockers.db_crud.evaluate_and_persist_for_parcel` (used here, unmodified) is
called once per parcel rather than bundling all 8 parcels into a single
`blockers.engine.evaluate_case(...)` call, because `blockers.ranking.py`
picks exactly ONE case-wide "primary" blocker across whatever set of
blockers a single `evaluate_case` call is given. Bundling all 8 parcels into
one call would make `blockers.ranking.py` select a single global primary
blocker belonging to only ONE of the 8 parcels — leaving the other 7
parcels' OWN real, raised blockers marked `is_primary=False` even when they
are the clear worst finding for THAT parcel. Since
`exposure.engine.assess_case` reads `owner_role`/`actionability_band`/
`confidence_label` off whichever blocker has `is_primary=True` in the
blocker set it is given, that would make 7 of 8 parcels' exposure
assessments show a fabricated-looking "no confident primary blocker /
INSUFFICIENT confidence / manual triage required" outcome despite having
real, confident evidence — an actively misleading result, not merely an
incomplete one. Running one independent evaluation per parcel lets each
parcel's own blocker set be ranked on its own merits, which is the input
`exposure.db_crud.assess_and_persist_for_case` is designed to consume
correctly (it already filters to `parcel_id in (None, parcel_id)` before
calling the engine).

-------------------------------------------------------------------------------
IDEMPOTENCY
-------------------------------------------------------------------------------
Blockers and exposure assessments are, by design, APPEND-ONLY tables
(mirroring `StatutoryClockRecord`/`Prediction`'s own precedent — see
`blockers/db_crud.py`'s and `exposure/db_crud.py`'s own module docstrings).
This script achieves TRUE idempotency (zero new rows on a repeat run) by
checking, before computing anything for a given parcel, whether a result
ALREADY exists for it (`list_blockers(parcel_id=..., latest_only=True)` /
`list_exposure_assessments(parcel_id=..., latest_only=True)`) and skipping
if so. Pass --force to intentionally compute a fresh, additional
(non-destructive — the previous rows are never deleted) run on top of an
existing one, using the exact same append-only/`latest_only` semantics the
rest of the codebase already relies on.

-------------------------------------------------------------------------------
KNOWN, PRE-EXISTING LIMITATION (not introduced by this script; not fixed by
it, since fixing it would require editing a protected engine file)
-------------------------------------------------------------------------------
`blockers.db_crud.evaluate_and_persist_for_parcel` and
`exposure.db_crud.assess_and_persist_for_case` both hardcode
`case_reference = <the parcel's project_id>` regardless of which parcel is
being evaluated (backend/blockers/db_crud.py:86,
backend/exposure/db_crud.py:218 — both unmodified). `list_blockers`/
`list_exposure_assessments`'s `latest_only=True` default groups purely by
`case_reference` when no `parcel_id` filter is supplied. The practical
consequence, once this script has run for more than one parcel of the same
project:
  - `GET /api/parcels/{parcel_id}/blockers` and
    `GET /api/parcels/{parcel_id}/exposure` (both parcel-filtered) are
    CORRECT for every parcel — the SQL filter narrows to that parcel's own
    rows before any `case_reference` grouping happens.
  - `GET /api/blockers`, `GET /api/projects/{project_id}/blockers`,
    `GET /api/exposure`, `GET /api/projects/{project_id}/exposure/latest`,
    and `GET /api/exposure/priority-queue` (none of which filter by
    `parcel_id`) will each collapse to the single MOST RECENTLY COMPUTED
    parcel's row/run, since every parcel of this project shares one
    `case_reference`. This is a genuine, structural property of the
    existing engines' data model, not a bug this script introduces, and not
    something this script works around (that would require changing
    `case_reference` semantics inside a protected file). Reported in full
    in the Step 8C-B.3 report; this script processes parcels in a fixed,
    deterministic order (sorted by parcel id) so which parcel "wins" this
    collapse is at least reproducible across runs.

No project-level exposure assessment (`assess_and_persist_for_case(...,
parcel_id=None)`) is computed by this script, for the same reason: it would
read `list_blockers(project_id=..., latest_only=True)` with no parcel
filter, which (per the limitation above) only sees the single
most-recently-computed parcel's blockers — producing a result that LOOKS
like a genuine project-wide aggregate but is actually driven by one
arbitrary parcel. That would be a misleading artifact, not an honest
computation, so it is deliberately not produced.
"""

from __future__ import annotations

import argparse
from datetime import date
from typing import Dict, List, Tuple

from database import SessionLocal
from models import Parcel, Project

from blockers import db_crud as blockers_db_crud
from exposure import db_crud as exposure_db_crud

TABLES_TO_COUNT = (
    "projects",
    "parcels",
    "predictions",
    "acquisition_events",
    "statutory_clocks",
    "blockers",
    "blocker_evidence",
    "blocker_actions",
    "exposure_assessments",
)


def table_counts(db) -> Dict[str, int]:
    """Raw row counts via the existing SQLAlchemy engine/connection — read
    -only, no new tables/columns, matches the exact table names already
    defined in models.py / legal/db_models.py / blockers/db_models.py /
    exposure/db_models.py."""
    from sqlalchemy import text

    counts: Dict[str, int] = {}
    for table in TABLES_TO_COUNT:
        counts[table] = db.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar_one()
    return counts


def print_counts(label: str, counts: Dict[str, int]) -> None:
    print(f"\n{label}:")
    for table in TABLES_TO_COUNT:
        print(f"  {table:22s} {counts[table]}")


def run_blockers_for_parcel(db, parcel_id: str, calculation_date: date, force: bool) -> str:
    """Returns 'computed', 'skipped-existing', or 'error:<message>'.
    Uses ONLY blockers.db_crud.evaluate_and_persist_for_parcel (unmodified)
    for the actual computation/persistence."""
    existing = blockers_db_crud.list_blockers(db, parcel_id=parcel_id, latest_only=True)
    if existing and not force:
        return "skipped-existing"
    try:
        blockers_db_crud.evaluate_and_persist_for_parcel(db, parcel_id, calculation_date)
        return "computed"
    except ValueError as exc:  # parcel not found -- should not happen, we sourced the id from the DB itself
        return f"error:{exc}"


def run_exposure_for_parcel(db, parcel_id: str, calculation_date: date, force: bool) -> str:
    """Returns 'computed', 'skipped-existing', 'not-computable' (the engine's
    own `assess_case` returned None -- no evidence at all), or
    'error:<message>'. Uses ONLY exposure.db_crud.assess_and_persist_for_case
    (unmodified) for the actual computation/persistence."""
    existing = exposure_db_crud.list_exposure_assessments(db, parcel_id=parcel_id, latest_only=True)
    if existing and not force:
        return "skipped-existing"
    try:
        result = exposure_db_crud.assess_and_persist_for_case(
            db, parcel_id=parcel_id, calculation_date=calculation_date
        )
        return "computed" if result is not None else "not-computable"
    except ValueError as exc:  # parcel/project not found -- should not happen
        return f"error:{exc}"


def run(*, force: bool = False) -> None:
    db = SessionLocal()
    try:
        before = table_counts(db)
        print_counts("BEFORE", before)

        # A/B/C: identify the existing seeded demo project(s) and parcels —
        # queried from the database, never hardcoded, so this script stays
        # correct if the seed data ever changes.
        projects: List[Project] = db.query(Project).order_by(Project.id).all()
        print(f"\nFound {len(projects)} project(s): {[p.id for p in projects]}")

        calc_date = date.today()
        blocker_results: List[Tuple[str, str]] = []
        exposure_results: List[Tuple[str, str]] = []

        for project in projects:
            parcels: List[Parcel] = (
                db.query(Parcel).filter(Parcel.project_id == project.id).order_by(Parcel.id).all()
            )
            print(f"\nProject {project.id} ({project.name}): {len(parcels)} parcel(s) — {[p.id for p in parcels]}")

            # E: Legal Clock engine — deliberately not run. See the module
            # docstring's "WHY LEGAL CLOCKS ARE DELIBERATELY NOT TOUCHED"
            # section. No AcquisitionEvent/StatutoryClock row is created for
            # this project or any of its parcels.
            print(
                f"  Statutory Clock for {project.id}: NOT COMPUTABLE FROM CURRENT DEMO DATA "
                f"(no AcquisitionEvent basis exists for this project/its parcels — see module docstring)."
            )

            # F/G/H/I: Blocker engine, then Exposure engine, INTERLEAVED
            # per parcel (blockers[parcel] immediately followed by
            # exposure[parcel], before moving to the next parcel) —
            # deliberately NOT two separate passes (all blockers, then all
            # exposure). `exposure.db_crud.assess_and_persist_for_case`
            # internally calls `blockers_db_crud.list_blockers(project_id=...,
            # latest_only=True)` — a PROJECT-scoped, not parcel-scoped, query
            # — and `latest_only` collapses to whichever evaluation_run_id is
            # the single most recent for this project's shared
            # `case_reference` (see the module docstring's "KNOWN, PRE
            # -EXISTING LIMITATION" section). If all 8 parcels' blockers were
            # computed first and only then all 8 exposures, every exposure
            # computation except the LAST parcel's would see an empty/wrong
            # blocker set (whichever parcel's run happened to be most
            # recent) and incorrectly report "not computable". Interleaving
            # keeps each parcel's own blocker run the most recent one at the
            # exact moment its own exposure is computed, which is what
            # makes `assess_and_persist_for_case` see that parcel's real,
            # correctly-ranked blockers rather than another parcel's.
            for parcel in parcels:
                b_outcome = run_blockers_for_parcel(db, parcel.id, calc_date, force)
                blocker_results.append((parcel.id, b_outcome))
                print(f"  Blockers  [{parcel.id}]: {b_outcome}")

                e_outcome = run_exposure_for_parcel(db, parcel.id, calc_date, force)
                exposure_results.append((parcel.id, e_outcome))
                print(f"  Exposure  [{parcel.id}]: {e_outcome}")

        after = table_counts(db)
        print_counts("AFTER", after)

        print("\nDelta:")
        for table in TABLES_TO_COUNT:
            delta = after[table] - before[table]
            print(f"  {table:22s} {'+' if delta >= 0 else ''}{delta}")

        print("\nBlocker outcomes:", blocker_results)
        print("Exposure outcomes:", exposure_results)
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-run the engines even if a result already exists for a parcel (still append-only; previous rows are never deleted or overwritten).",
    )
    args = parser.parse_args()
    run(force=args.force)
