"""
Structured owner/action recommendation construction. See
docs/step7a-blocker-engine-audit.md Section K.

NOT an LLM. NOT case-specific generated prose pretending to be official
government instructions. `action_type` is drawn from a small, fixed
vocabulary that is a SUPERSET of the existing, production
`CaseAction.actionType` union (`src/types/index.ts` line 350: 'Legal
Verification' | 'Fast-Track Compensation' | 'Lok Adalat Settlement' | 'Joint
Mutation Camp' | 'Field Geo-Survey' | 'Collector Hearing') plus exactly one
new value this design's B1 needed and none of the six covered
("Expedite Statutory Milestone") -- so a recommendation can later be
promoted 1:1 into a real `CaseAction` without inventing an incompatible
second taxonomy. `rationale` always quotes the blocker's own evidence
descriptions; nothing here is generated text.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from .enums import BlockerSeverity, BlockerStatus, BlockerType
from .evidence import new_id
from .models import ActionRecommendation, Blocker

_SEVERITY_TO_PRIORITY = {
    BlockerSeverity.CRITICAL: "CRITICAL",
    BlockerSeverity.HIGH: "HIGH",
    BlockerSeverity.MODERATE: "MEDIUM",
    BlockerSeverity.WATCH: "MEDIUM",
    BlockerSeverity.INFORMATIONAL: "LOW",
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _substantive_action_type(blocker: Blocker) -> str:
    if blocker.blocker_type == BlockerType.B1:
        return "Collector Hearing" if blocker.severity == BlockerSeverity.CRITICAL else "Expedite Statutory Milestone"
    if blocker.blocker_type == BlockerType.B2:
        return "Legal Verification"
    if blocker.blocker_type == BlockerType.B3:
        return "Collector Hearing"
    if blocker.blocker_type == BlockerType.B4:
        return "Field Geo-Survey" if "Field Team" in blocker.owner_role else "Legal Verification"
    return "Legal Verification"  # defensive fallback, unreachable for a closed BlockerType


def _verification_action_type(blocker: Blocker) -> str:
    if blocker.blocker_type == BlockerType.B4 and "Environmental" in blocker.owner_role:
        return "Field Geo-Survey"
    return "Legal Verification"


def recommend_action(
    blocker: Blocker, *, created_at: Optional[datetime] = None
) -> Optional[ActionRecommendation]:
    """Returns None only for `BlockerStatus.RESOLVED` (nothing left to act
    on). Every other raised status gets a recommendation -- a lighter-weight
    "verify the evidence" recommendation for SUSPECTED/INSUFFICIENT_EVIDENCE/
    CONFLICTED, a substantive remediation recommendation for
    CONFIRMED/DETECTED. This matches
    docs/step7a-blocker-engine-audit.md Scenario F's expectation: even "no
    confidently primary blocker" cases still surface a concrete next step
    ("verify records before any blocker determination is made")."""
    if blocker.status == BlockerStatus.RESOLVED:
        return None

    evidence_refs = tuple(e.evidence_id for e in blocker.evidence)
    evidence_summary = "; ".join(e.description for e in blocker.evidence) or "No evidence on record."
    scope = f"parcel {blocker.parcel_id}" if blocker.parcel_id else f"project {blocker.project_id or '(unscoped)'}"

    if blocker.status in (BlockerStatus.CONFIRMED, BlockerStatus.DETECTED):
        priority = _SEVERITY_TO_PRIORITY.get(blocker.severity, "MEDIUM")
        action_type = _substantive_action_type(blocker)
        rationale = (
            f"{blocker.blocker_type.value} {blocker.status.value.lower()} for case "
            f"{blocker.case_reference} ({scope}). Evidence: {evidence_summary}"
        )
    elif blocker.status == BlockerStatus.SUSPECTED:
        priority = "MEDIUM"
        action_type = _verification_action_type(blocker)
        rationale = (
            f"{blocker.blocker_type.value} suspected but not confirmed for case {blocker.case_reference} "
            f"({scope}); verify the underlying evidence before treating this as an established blocker. "
            f"Evidence: {evidence_summary}"
        )
    else:  # INSUFFICIENT_EVIDENCE, CONFLICTED
        action_type = "Legal Verification"
        if blocker.status == BlockerStatus.CONFLICTED:
            priority = "MEDIUM"
            rationale = (
                f"Evidence conflicts for this {blocker.blocker_type.value} evaluation on case "
                f"{blocker.case_reference} ({scope}); resolve the conflict before any blocker "
                f"determination is made. Evidence: {evidence_summary}"
            )
        else:
            priority = "LOW"
            rationale = (
                f"Evidence is insufficient to confirm or clear a {blocker.blocker_type.value} "
                f"determination for case {blocker.case_reference} ({scope}); verify records. "
                f"Evidence: {evidence_summary}"
            )

    return ActionRecommendation(
        action_id=new_id("ACTREC"),
        blocker_id=blocker.blocker_id,
        owner_role=blocker.owner_role,
        authority=blocker.responsible_authority,
        action_type=action_type,
        rationale=rationale,
        evidence_refs=evidence_refs,
        priority=priority,
        status="RECOMMENDED",
        precedent_refs=(),  # precedent retrieval is explicitly out of scope (Step 7B brief §12)
        created_at=created_at or _utcnow(),
    )
