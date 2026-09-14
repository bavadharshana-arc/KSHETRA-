"""
===============================================================================
KSHETRA: Deterministic Statutory Clock Engine (Step 6B, Phase 1)
===============================================================================

Design baseline: docs/step6a-statutory-clock-audit.md (Step 6A audit/design —
read that document for the legal sourcing behind every rule in
`rule_seed_data.py` and the state-machine rules in `clock_engine.py`).

This package is a SELF-CONTAINED, pure-Python legal computation engine. It
answers only "what does KSHETRA's deterministic evidence show about a
statutory clock" — it never predicts anything and never touches the ML layer.

Independence (enforced by convention, not a runtime check): this package does
not import, and must never be imported by:
  - ai-model/**, backend/inference_service.py, backend/main.py's /predict path
  - src/services/predictionFeatures.ts (or any predictionFeatures.py — none
    exists in this repo; see docs/step6a-statutory-clock-audit.md §23)
  - src/context/AppContext.tsx or any frontend component

Sub-modules:
  enums.py          - shared vocabularies (ApplicableAct, SourceType, statuses)
  dates.py           - calendar-correct date arithmetic (NOT the ML feature
                       layer's 30.4375-day/month approximation)
  events.py          - AcquisitionEvent (append-only, provenance-carrying)
  conflicts.py       - deterministic conflict resolution between competing
                       AcquisitionEvent records
  extensions.py      - ExtensionEvidence + extension-status evaluation
  stays.py           - CourtStayEvent + stay-applicability evaluation
  rule_sets.py        - RuleSet model + a small in-memory registry/loader
  rule_seed_data.py   - the actual RuleSet rows derived from the Step 6A
                       audit, EVERY ONE loaded as approval_status =
                       PENDING_LEGAL_REVIEW (see that module's docstring)
  clock_engine.py     - the clock-status state machine + StatutoryClock
                       computation that ties all of the above together
  demo_scenarios.py   - six illustrative/synthetic demo cases (source_type =
                       SYNTHETIC_DEMO throughout), used by both the test
                       suite and the optional DB seed script
  db_models.py        - SQLAlchemy ORM tables (only imported once the pure
                       engine above is exercised/tested independently of any
                       database)
  db_schemas.py       - Pydantic Read schemas for the read-only API
  db_crud.py          - thin data-access helpers over db_models.py
  seed_demo_db.py      - persists demo_scenarios.py into the database and
                       computes+stores their clocks (run directly, like
                       backend/seed.py)

Nothing in this package is wired into backend/main.py's existing /, /health,
or /predict endpoints. See backend/routers/legal.py for the new, separate,
read-only /api/legal/* routes.
"""
