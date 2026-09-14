"""
Top-level orchestrator: runs every applicable detector for one case, ranks
the raised blockers, and attaches structured action recommendations.

Callable independently of HTTP and of any database (Step 7B brief Section
14: "The engine itself should be callable independently of HTTP.") -- every
argument is a plain in-memory value (a `StatutoryClockResult`,
`ParcelEvidenceInput`, `CourtStayEvent`); the persistence layer
(db_crud.py) is the only place that touches SQLAlchemy or reads real
Parcel/StatutoryClock rows before calling in here.
"""

from __future__ import annotations

from datetime import date
from typing import Dict, Optional, Sequence

from legal.clock_engine import StatutoryClockResult
from legal.stays import CourtStayEvent

from .actions import recommend_action
from .detection import ENGINE_VERSION, detect_b1, detect_b2, detect_b3, detect_b4
from .evidence import ParcelEvidenceInput
from .models import CaseEvaluationResult
from .ranking import rank_blockers


def evaluate_case(
    *,
    case_reference: str,
    calculation_date: date,
    clocks: Sequence[StatutoryClockResult] = (),
    parcels: Sequence[ParcelEvidenceInput] = (),
    court_stays_by_parcel_id: Optional[Dict[str, CourtStayEvent]] = None,
    secondary_ownership_observations: Optional[Dict[str, str]] = None,
    engine_version: str = ENGINE_VERSION,
) -> CaseEvaluationResult:
    """Runs B1 for every supplied clock (a case may have more than one
    statutory clock -- e.g. an S.19 declaration clock and an S.25 award
    clock -- each yields its own B1 evaluation, per
    docs/step7a-blocker-engine-audit.md Section C) and B2/B3/B4 for every
    supplied parcel, then ranks the union of raised blockers and attaches
    one ActionRecommendation per raised blocker (see actions.recommend_action
    for the RESOLVED-only exception)."""
    stays_by_parcel = court_stays_by_parcel_id or {}
    secondary_ownership = secondary_ownership_observations or {}
    evaluations = []

    for clock in clocks:
        evaluations.append(detect_b1(clock, engine_version=engine_version))

    for parcel in parcels:
        secondary_obs = secondary_ownership.get(parcel.parcel_id) if parcel.parcel_id else None
        evaluations.append(
            detect_b2(
                parcel,
                calculation_date=calculation_date,
                engine_version=engine_version,
                secondary_ownership_observation=secondary_obs,
            )
        )
        evaluations.append(
            detect_b3(parcel, calculation_date=calculation_date, engine_version=engine_version)
        )
        stay = stays_by_parcel.get(parcel.parcel_id) if parcel.parcel_id else None
        evaluations.append(
            detect_b4(
                parcel,
                calculation_date=calculation_date,
                engine_version=engine_version,
                court_stay=stay,
            )
        )

    raised_blockers = tuple(e.blocker for e in evaluations if e.blocker is not None)
    ranked_blockers, ranking = rank_blockers(raised_blockers)
    actions = tuple(
        action for action in (recommend_action(blocker) for blocker in ranked_blockers) if action is not None
    )

    return CaseEvaluationResult(
        case_reference=case_reference,
        blockers=ranked_blockers,
        ranking=ranking,
        actions=actions,
        evaluations=tuple(evaluations),
    )


def evaluate_single_parcel(
    *,
    case_reference: str,
    calculation_date: date,
    clock: Optional[StatutoryClockResult] = None,
    parcel: Optional[ParcelEvidenceInput] = None,
    court_stay: Optional[CourtStayEvent] = None,
    engine_version: str = ENGINE_VERSION,
) -> CaseEvaluationResult:
    """Convenience wrapper over `evaluate_case` for the common one-clock,
    one-parcel case (used by the demo scenarios and most tests)."""
    return evaluate_case(
        case_reference=case_reference,
        calculation_date=calculation_date,
        clocks=(clock,) if clock is not None else (),
        parcels=(parcel,) if parcel is not None else (),
        court_stays_by_parcel_id=(
            {parcel.parcel_id: court_stay} if (parcel is not None and parcel.parcel_id and court_stay is not None) else None
        ),
        engine_version=engine_version,
    )
