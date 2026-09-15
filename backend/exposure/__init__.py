"""
KSHETRA: Exposure & Priority Engine (Step 8B).

Pure aggregation/scoring layer over the already-deterministic Step 6B
statutory clock engine (`backend/legal/`) and Step 7B blocker engine
(`backend/blockers/`). See docs/step8a-exposure-priority-audit.md for the
full design this package implements verbatim.

Dependency direction (never reversed, mirrors legal -> blockers -> exposure):

    legal  ->  blockers  ->  exposure

This package:
  - NEVER recomputes a statutory deadline (imports `legal.enums`/
    `legal.clock_engine` types read-only, never `legal.dates`/`legal.rule_sets`
    arithmetic).
  - NEVER re-detects B1-B4 (imports `blockers.models`/`blockers.enums`/
    `blockers.ranking` outputs read-only, never `blockers.detection`).
  - NEVER double-counts B2/B3 severity as an exposure-magnitude term (see
    `scoring.py`'s module docstring and docs/step8a-exposure-priority-audit.md
    Section 5).
  - NEVER imports ai-model/**, inference_service.py, or any ML code.

Sub-modules (mirrors `backend/blockers/`'s own layout):
  enums.py         -- ExposureBand/PriorityBand/ConfidenceLabel + version tags
  models.py        -- frozen dataclasses (ComponentTrace, ExposureAssessment)
  scoring.py        -- pure §9/§10/§11 formulas
  engine.py         -- orchestrator: one case's blockers+prediction+clock -> ExposureAssessment
  demo_scenarios.py -- deterministic in-memory demo scenarios
  db_models.py       -- SQLAlchemy ORM (`exposure_assessments`, append-only)
  db_schemas.py      -- Pydantic read schemas
  db_crud.py         -- persistence + read queries + live evaluation entrypoint
  tests/             -- unittest suite
"""
