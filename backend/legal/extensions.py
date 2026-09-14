"""
ExtensionEvidence + extension-status evaluation. See
docs/step6a-statutory-clock-audit.md §10.

An extension NEVER changes a computed deadline just because a date was
entered somewhere. It requires: (1) the applicable RuleSet to actually permit
extension for this section, and (2) a specific ExtensionEvidence record whose
own verification_status is VERIFIED. Anything short of that produces
EXTENSION_CLAIMED (or EXTENSION_UNKNOWN if nothing was claimed at all), never
a silently-moved deadline.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional

from .enums import EvidenceVerificationStatus, ExtensionStatus, LegalConfidence
from .rule_sets import RuleSet


@dataclass(frozen=True)
class ExtensionEvidence:
    extension_id: str
    case_reference: str
    rule_set_id: str  # which RuleSet's clock this extension claims to extend
    extension_order_id: Optional[str]
    extension_date: Optional[date]
    authority: Optional[str]
    reason: Optional[str]
    source_document: Optional[str]
    effective_from: Optional[date]
    effective_to: Optional[date]
    verification_status: EvidenceVerificationStatus
    notes: str = ""


def evaluate_extension_status(
    rule: RuleSet, extension: Optional[ExtensionEvidence]
) -> ExtensionStatus:
    """
    Determines the ExtensionStatus for a clock:
      - No claim at all                                    -> EXTENSION_UNKNOWN
      - The specific claim was itself marked REJECTED        -> EXTENSION_REJECTED
      - The rule's extension mechanism was POSITIVELY confirmed
        absent (permitted=False AND confidence=VERIFIED)     -> EXTENSION_REJECTED
        (no rule in rule_seed_data.py currently reaches this bar — see
        ExtensionDefinition's docstring)
      - The mechanism is confirmed to exist (permitted=True) AND the
        evidence itself is VERIFIED                          -> EXTENSION_VERIFIED
      - Everything else (including: mechanism's existence is itself
        unresolved/unverified, e.g. NH Act 3D) -> EXTENSION_CLAIMED, which
        the clock engine maps to the conservative EXTENSION_UNVERIFIED clock
        status rather than a confident grant or a confident refusal.
    """
    if extension is None:
        return ExtensionStatus.EXTENSION_UNKNOWN

    if extension.verification_status == EvidenceVerificationStatus.REJECTED:
        return ExtensionStatus.EXTENSION_REJECTED

    mechanism_confirmed_absent = (
        rule.extension_definition is not None
        and not rule.extension_definition.permitted
        and rule.extension_definition.confidence == LegalConfidence.VERIFIED
    )
    if mechanism_confirmed_absent:
        return ExtensionStatus.EXTENSION_REJECTED

    mechanism_confirmed_present = (
        rule.extension_definition is not None and rule.extension_definition.permitted
    )
    if mechanism_confirmed_present and extension.verification_status == EvidenceVerificationStatus.VERIFIED:
        return ExtensionStatus.EXTENSION_VERIFIED

    return ExtensionStatus.EXTENSION_CLAIMED


def extension_covers_date(extension: ExtensionEvidence, on_date: date) -> bool:
    """Whether `on_date` falls inside the extension's own effective window.
    An open-ended bound (None) does not restrict that side."""
    if extension.effective_from is not None and on_date < extension.effective_from:
        return False
    if extension.effective_to is not None and on_date > extension.effective_to:
        return False
    return True
