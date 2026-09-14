"""
KSHETRA: B1-B4 Blocker Engine (Step 7B).

Implements the design approved in docs/step7a-blocker-engine-audit.md. A
deterministic, provenance-preserving evidence-resolution layer that sits
between the Step 6B statutory clock engine (backend/legal/) and any future
Exposure/Priority Engine or ML feature schema.

Package layout (pure logic first, persistence/HTTP layered on top, mirroring
backend/legal/'s own Phase-1-first ordering):

    enums.py           Blocker-specific vocabularies. Reuses legal.enums.SourceType
                        and SOURCE_AUTHORITY_RANK unmodified -- no competing
                        source hierarchy is defined here.
    models.py           Pure, frozen dataclasses: Blocker, BlockerEvidence,
                        BlockerConflict, DownstreamExtent, BlockerEvaluation.
    evidence.py         Evidence-construction and evidence-quality helpers.
    detection.py         detect_b1 / detect_b2 / detect_b3 / detect_b4 -- pure
                        functions, no database, no HTTP, no ML.
    ranking.py           Deterministic primary/secondary/most-actionable ranking.
    actions.py           Structured (non-LLM, non-precedent) ActionRecommendation
                        construction.
    engine.py           Orchestrates detection + ranking + actions for one case.
    demo_scenarios.py    Six ILLUSTRATIVE / SYNTHETIC DEMO scenarios (mirrors
                        legal/demo_scenarios.py's discipline).
    db_models.py/db_schemas.py/db_crud.py   Persistence layer, additive only.
    tests/               unittest suite (project convention -- no pytest).

Hard boundaries enforced throughout this package (see docs/step7a-blocker-engine-audit.md
Section L, X, Y):
  - This package may *read* backend/legal/ (via legal.db_crud read functions and
    legal.clock_engine.StatutoryClockResult) but backend/legal/ never imports
    this package. One-way dependency, never reversed.
  - This package never computes a statutory deadline, never writes to
    acquisition_events / court_stay_events / extension_evidence / statutory_clocks.
  - This package is never imported by ai-model/**, backend/inference_service.py,
    or src/services/predictionFeatures.ts, and never imports them.
  - No LLM-generated text anywhere in this package.
"""
