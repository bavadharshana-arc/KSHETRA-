"""
Pure, frozen dataclasses for the exposure/priority engine. No SQLAlchemy, no
FastAPI, no ML import anywhere in this module -- mirrors
`blockers/models.py`'s own no-database discipline. Constructed and consumed
entirely in-memory by scoring.py/engine.py, independently unit-testable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Dict, Optional, Tuple

from .enums import ConfidenceLabel, ExposureBand, PriorityBand


@dataclass(frozen=True)
class ComponentTrace:
    """Transparent breakdown behind one `ExposureAssessment`. Every band and
    every neutral substitution is recorded here so "why did this score occur"
    is always answerable (docs/step8a-exposure-priority-audit.md Section 14)
    -- never an opaque single number."""

    legal_band: float
    possession_band: float
    downstream_band: float
    project_scale_band: float
    secondary_bonus: float
    exposure_raw: float
    exposure_band_equivalent: int  # 0-4, reused (not re-derived) by priority

    urgency_band: int
    actionability_band: int
    priority_raw: float

    weights_version: str
    priority_weights_version: str
    staleness_policy_version: str
    gis_downstream_status: str  # GisDownstreamStatus value

    days_remaining: Optional[int]
    clock_status: Optional[str]
    project_value_crores: Optional[float]
    project_value_reference_count: int
    affected_parcel_count: int
    affected_area_acres: Optional[float]

    contributing_b1_blocker_ids: Tuple[str, ...]
    contributing_possession_blocker_ids: Tuple[str, ...]
    primary_blocker_id: Optional[str]
    secondary_blocker_ids: Tuple[str, ...]
    conflicted_blocker_ids: Tuple[str, ...]
    insufficient_blocker_ids: Tuple[str, ...]

    owner_role: str
    responsible_authority: str

    prediction_id: Optional[str]
    prediction_delay_probability: Optional[float]
    prediction_generated_at: Optional[str]
    prediction_is_stale: bool
    blocker_evidence_is_stale: bool

    neutral_substitutions: Tuple[str, ...] = ()
    disclaimers: Tuple[str, ...] = ()
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ExposureAssessment:
    """One append-only exposure/priority computation for one case. Mirrors
    `blockers.models.Blocker`'s append-only, server-generated-id discipline.
    `assessment_id` is stamped by the pure engine (not the DB layer) so it is
    stable and inspectable even before persistence, exactly like
    `Blocker.blocker_id`."""

    assessment_id: str
    case_reference: str
    project_id: Optional[str]
    parcel_id: Optional[str]

    prediction_id: Optional[str]
    primary_blocker_id: Optional[str]
    secondary_blocker_ids: Tuple[str, ...]

    exposure_score: float
    exposure_band: ExposureBand
    priority_score: float
    priority_band: PriorityBand
    confidence_label: ConfidenceLabel
    unresolved_conflict: bool

    component_trace: ComponentTrace
    recommended_action_id: Optional[str]

    engine_version: str
    calculation_date: date
    notes: str
    calculated_at: datetime
