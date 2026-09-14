"""
RuleSet model + a small in-memory registry/loader.

APPLICATION CODE MUST NOT CONTAIN HARD-CODED LEGAL CONSTANTS (Step 6A audit
§14 / Step 6B brief). clock_engine.py never has a literal "12" or "60" in it
anywhere — every duration, trigger, extension and stay rule is read from a
RuleSet instance, and the concrete RuleSet rows live only in
rule_seed_data.py, one file whose entire job is to be the single place legal
constants are declared and cited.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import date
from typing import Dict, List, Optional, Tuple

from .dates import StatutoryDuration
from .enums import ApplicableAct, LegalConfidence, RuleApprovalStatus


def compute_source_hash(text: str) -> str:
    """Short, stable hash of a rule's cited source text/citation, so a later
    re-verification pass can detect whether the text this RuleSet was built
    from has since been revisited. Not a cryptographic integrity guarantee —
    just a change-detection fingerprint."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


@dataclass(frozen=True)
class TriggerDefinition:
    """Which AcquisitionEvent type(s) can start this clock. A list (not a
    single value) because, in principle, more than one event subtype could
    satisfy the same trigger concept; every rule in rule_seed_data.py
    currently uses exactly one."""

    triggering_event_types: Tuple[str, ...]
    notes: str = ""


@dataclass(frozen=True)
class ExtensionDefinition:
    """
    Whether/how this rule's deadline can be extended.

    `permitted=True` requires the Step 6A audit to have found EXPRESS
    statutory text for the mechanism (e.g. RFCTLARR S.19/S.25's "appropriate
    Government... may extend... reasons recorded in writing... published").

    `permitted=False` with `confidence != VERIFIED` represents an
    ABSENCE-OF-EVIDENCE finding (e.g. NH Act 3D — no mechanism was found in
    the sources reviewed), NOT a confirmed legal impossibility. The engine
    (extensions.py) treats this case conservatively: a claimed extension
    against such a rule is neither auto-verified nor auto-rejected — it stays
    open (EXTENSION_CLAIMED -> clock status EXTENSION_UNVERIFIED) pending
    actual legal review, per the Step 6B brief's explicit instruction not to
    assert "extensions are legally impossible."

    `permitted=False` with `confidence == VERIFIED` would mean a mechanism's
    absence was POSITIVELY, authoritatively confirmed (e.g. an express "no
    extension shall be granted" clause) — no rule in this pass reaches that
    bar; it is modeled for completeness/future use.
    """

    permitted: bool
    authority: Optional[str] = None
    requires_written_reasons: bool = False
    requires_publication: bool = False
    confidence: LegalConfidence = LegalConfidence.PENDING_LEGAL_REVIEW
    notes: str = ""


@dataclass(frozen=True)
class StayDefinition:
    """
    Whether/how a VERIFIED, in-scope CourtStayEvent may pause this rule's
    clock. `basis` distinguishes EXPRESS statutory stay-exclusion text
    (RFCTLARR S.19(7); NH Act 3D(3)) from case-law-only reasoning (RFCTLARR
    S.25; RFCTLARR S.24(2)) — the Step 6A audit found the latter category's
    exact scope contested, so those rules deliberately carry
    `permitted=False, confidence=UNVERIFIED` here: the engine (stays.py) will
    never silently exclude a stay period for them. A stay that is otherwise
    verified and in-scope for such a rule is instead surfaced as a
    rule-uncertain signal that forces CLOCK_UNCERTAIN, rather than either
    (a) silently applying a contested legal position, or (b) silently
    ignoring a stay a court plainly issued.
    """

    permitted: bool
    basis: str = ""  # e.g. "express_statutory_text" | "case_law_only" | "not_established"
    confidence: LegalConfidence = LegalConfidence.PENDING_LEGAL_REVIEW
    notes: str = ""


@dataclass(frozen=True)
class ConsequenceDefinition:
    """
    What happens if the clock's deadline passes with no verified extension.
    `description` preserves the Act's OWN wording (never normalized into one
    generic "lapse" string — RFCTLARR S.19 says "deemed to have been
    rescinded", RFCTLARR S.25 says "shall lapse", NH Act 3D says "cease[s] to
    have effect": three different legal outcomes).

    `is_acquisition_lapse` gates whether an expired instance of this rule may
    ever be reported with `consequence_class = APPARENT_LAPSE` at all — a
    possession-readiness precondition (e.g. RFCTLARR S.38) or a purely
    procedural window (e.g. RFCTLARR S.15's 60-day objection period) is NOT
    an acquisition-lapse consequence and must never be labelled as if it
    were (Step 6A audit §12/§19). clock_engine.py derives the actual
    ConsequenceClass to report from this single flag — APPARENT_LAPSE when
    True, CLOCK_EXPIRED when False — so there is exactly one place that
    mapping happens.
    """

    description: str
    is_acquisition_lapse: bool


@dataclass(frozen=True)
class RuleSet:
    rule_set_id: str
    act: ApplicableAct
    section_reference: str  # e.g. "RFCTLARR s.25" — never a paired "3D/19" label
    jurisdiction: str  # e.g. "IN" for the central Act, no state-Rules refinement in this pass
    version: str
    effective_from: date
    effective_to: Optional[date]
    approval_status: RuleApprovalStatus
    source_reference: str
    source_hash: str
    trigger_definition: TriggerDefinition
    duration_definition: Optional[StatutoryDuration]
    extension_definition: Optional[ExtensionDefinition]
    stay_definition: Optional[StayDefinition]
    consequence_definition: ConsequenceDefinition
    # Sourcing-quality marker for `duration_definition` specifically — see
    # LegalConfidence's docstring. This, NOT `approval_status`, is what gates
    # whether the engine may ever report CLOCK_CERTAIN for this rule: every
    # rule in this prototype has approval_status=PENDING_LEGAL_REVIEW (no
    # rule has been through an actual human legal sign-off yet), which is a
    # GOVERNANCE fact ("not yet cleared for a real decision"), not a claim
    # that the underlying arithmetic is untrustworthy. duration_confidence
    # captures the latter, narrower question: "was this specific number
    # verbatim-confirmed against a primary-source reproduction of the
    # statute." See clock_engine.py `RuleSet.is_duration_sufficiently_verified`.
    duration_confidence: LegalConfidence = LegalConfidence.PENDING_LEGAL_REVIEW
    notes: str = ""

    def is_duration_sufficiently_verified(self) -> bool:
        return (
            self.duration_definition is not None
            and self.duration_definition.is_defined()
            and self.duration_confidence == LegalConfidence.VERIFIED
        )


class RuleSetRegistry:
    """Small in-memory loader/lookup over a fixed list of RuleSet rows (the
    ones in rule_seed_data.py). A DB-backed loader (db_crud.py) builds the
    same shape from persisted rows once the database layer exists — this
    class has no database dependency at all, so the pure engine can be
    exercised/tested without one."""

    def __init__(self, rule_sets: List[RuleSet]):
        self._by_id: Dict[str, RuleSet] = {rs.rule_set_id: rs for rs in rule_sets}
        self._by_key: Dict[Tuple[ApplicableAct, str, str], List[RuleSet]] = {}
        for rs in rule_sets:
            key = (rs.act, rs.section_reference, rs.jurisdiction)
            self._by_key.setdefault(key, []).append(rs)

    def get(self, rule_set_id: str) -> Optional[RuleSet]:
        return self._by_id.get(rule_set_id)

    def effective_rule(
        self,
        act: ApplicableAct,
        section_reference: str,
        jurisdiction: str,
        as_of: date,
    ) -> Optional[RuleSet]:
        """The RuleSet version effective as of `as_of`, or None. Never
        implicitly falls back to a SUPERSEDED row — only a version whose
        [effective_from, effective_to] window actually covers `as_of`."""
        candidates = self._by_key.get((act, section_reference, jurisdiction), [])
        matches = [
            rs
            for rs in candidates
            if rs.effective_from <= as_of and (rs.effective_to is None or as_of <= rs.effective_to)
        ]
        matches.sort(key=lambda rs: rs.effective_from, reverse=True)
        return matches[0] if matches else None

    def all(self) -> List[RuleSet]:
        return list(self._by_id.values())
