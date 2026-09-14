"""
Pure, frozen dataclasses for the blocker engine. No SQLAlchemy, no FastAPI,
no ML import anywhere in this module -- these types are constructed and
consumed entirely in-memory by detection.py/ranking.py/actions.py/engine.py,
and independently unit-testable without a database (mirrors legal/events.py,
legal/stays.py, legal/extensions.py's own no-database discipline).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Dict, Optional, Tuple

from .enums import (
    BlockerEvaluationOutcome,
    BlockerSeverity,
    BlockerStatus,
    BlockerType,
    ConflictResolutionStatus,
    EvidenceRelation,
    EvidenceType,
    EvidenceVerificationStatus,
    SourceType,
)


@dataclass(frozen=True)
class BlockerEvidence:
    """One evidence row supporting (or contradicting) a blocker. See
    docs/step7a-blocker-engine-audit.md Section H. Does not carry its own
    `blocker_id` -- it is always constructed nested inside a `Blocker`
    instance (a frozen tuple); the persistence layer (db_crud.py) is
    responsible for stamping `blocker_id` onto the flattened DB row."""

    evidence_id: str
    evidence_type: EvidenceType
    source_ref_type: str  # e.g. "statutory_clocks", "parcels"
    source_ref_id: str  # e.g. a clock_id, or "P-0245.ownershipDispute"
    source_type: Optional[SourceType]  # None only when a clock's underlying
    # trigger-event source_type could not be recovered from calculation_basis
    verification_status: EvidenceVerificationStatus
    description: str
    relation: EvidenceRelation = EvidenceRelation.SUPPORTS
    observed_at: Optional[date] = None
    recorded_at: Optional[datetime] = None
    notes: str = ""


@dataclass(frozen=True)
class DownstreamExtent:
    """Possession-impact hook fields the blocker engine EXPOSES but does not
    compute beyond what is trivially available today (parcel area/count via
    the existing Parcel/Project tables). See
    docs/step7a-blocker-engine-audit.md Section M. `contiguous_segment_ref`
    and `critical_path_impact` are left None/unset by this engine --
    populating them is explicitly future (Exposure Engine) work."""

    affected_parcel_ids: Tuple[str, ...] = ()
    affected_parcel_count: Optional[int] = None
    affected_area_acres: Optional[float] = None
    contiguous_segment_ref: Optional[str] = None
    critical_path_impact: Optional[bool] = None


@dataclass(frozen=True)
class Blocker:
    """One blocker detection/evaluation result. APPEND-ONLY by convention
    (mirrors legal.clock_engine.StatutoryClockResult / db_models.py's
    StatutoryClockRecord): every evaluation run produces a new Blocker
    instance; nothing in this module mutates an existing one. `primary` and
    `ranking_basis` are set by ranking.py's pass over a case's full blocker
    set, not by the individual detector, and are attached via
    `dataclasses.replace` (see ranking.py)."""

    blocker_id: str
    case_reference: str
    project_id: Optional[str]
    parcel_id: Optional[str]
    blocker_type: BlockerType
    status: BlockerStatus
    severity: BlockerSeverity
    owner_role: str
    responsible_authority: str
    evidence: Tuple[BlockerEvidence, ...]
    affects_clock: bool = False
    affected_clock_ids: Tuple[str, ...] = ()
    affects_possession: bool = False
    affects_project: bool = False
    downstream_extent: DownstreamExtent = field(default_factory=DownstreamExtent)
    primary: bool = False
    ranking_basis: Dict[str, Any] = field(default_factory=dict)
    resolution_status: Optional[BlockerStatus] = None
    resolution_notes: str = ""
    resolution_evidence_refs: Tuple[str, ...] = ()
    engine_version: str = ""
    calculation_date: Optional[date] = None
    notes: str = ""
    calculated_at: Optional[datetime] = None


@dataclass(frozen=True)
class BlockerEvaluation:
    """The full return value of every detect_b1/b2/b3/b4 function. ALWAYS
    returned (never None) so a clean/insufficient outcome is just as
    testable and inspectable as a raised one -- see
    docs/step7a-blocker-engine-audit.md Section G. `blocker` is populated
    iff `outcome` is a member of `enums.RAISED_EVALUATION_OUTCOMES`."""

    outcome: BlockerEvaluationOutcome
    blocker: Optional[Blocker]
    reason: str = ""


@dataclass(frozen=True)
class BlockerConflict:
    """Mirrors legal.conflicts.EventConflict's shape for a blocker-evidence
    disagreement. See docs/step7a-blocker-engine-audit.md Sections I/Q.4."""

    conflict_id: str
    case_reference: str
    blocker_type: BlockerType
    competing_evidence_ids: Tuple[str, ...]
    resolution_status: ConflictResolutionStatus = ConflictResolutionStatus.UNRESOLVED
    notes: str = ""


@dataclass(frozen=True)
class ActionRecommendation:
    """Structured owner/action output. Deliberately NOT freeform/LLM
    prose -- `action_type` is a controlled vocabulary (superset-compatible
    with the existing, production `CaseAction.actionType` union, per
    docs/step7a-blocker-engine-audit.md Section K), and `rationale` always
    cites specific `evidence_refs` rather than being generated text.
    `precedent_refs` is always empty in this implementation -- precedent
    retrieval is explicitly out of scope (Step 7B brief §12)."""

    action_id: str
    blocker_id: str
    owner_role: str
    authority: str
    action_type: str
    rationale: str
    evidence_refs: Tuple[str, ...]
    priority: str  # 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
    status: str = "RECOMMENDED"
    precedent_refs: Tuple[str, ...] = ()
    created_at: Optional[datetime] = None


@dataclass(frozen=True)
class RankingResult:
    """Output of ranking.py's deterministic pass over one case's blocker
    set. See docs/step7a-blocker-engine-audit.md Section J -- "most severe"
    (`primary_blocker_id`) is kept explicitly separate from "most
    actionable" (`most_actionable_blocker_id`), never silently merged."""

    ordered_blocker_ids: Tuple[str, ...]
    primary_blocker_id: Optional[str]
    secondary_blocker_ids: Tuple[str, ...]
    most_actionable_blocker_id: Optional[str]
    note: str = ""


@dataclass(frozen=True)
class CaseEvaluationResult:
    """Top-level output of engine.py's `evaluate_case` orchestrator: every
    raised blocker for the case, the ranking outcome, and one
    ActionRecommendation per actionable blocker."""

    case_reference: str
    blockers: Tuple[Blocker, ...]
    ranking: RankingResult
    actions: Tuple[ActionRecommendation, ...]
    evaluations: Tuple[BlockerEvaluation, ...]  # includes non-raised outcomes too
