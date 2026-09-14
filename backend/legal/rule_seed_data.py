"""
Concrete RuleSet rows derived from the Step 6A audit
(docs/step6a-statutory-clock-audit.md §4/§5). This is the ONLY module in this
package that contains legal constants — every number here is cited back to
that audit document, which in turn cites its primary/secondary sources.

===============================================================================
LEGAL SAFETY: WHY EVERY RULE BELOW IS approval_status = PENDING_LEGAL_REVIEW
===============================================================================
The Step 6B brief requires: "Do not mark them APPROVED unless the
implementation is simply encoding a directly verified statutory provision."
The Step 6A audit's own §3 records that India Code itself (the authoritative
primary source) returned HTTP 403 on every fetch attempt in that environment;
every rule below was instead sourced via indiankanoon.org's verbatim
Gazette-sourced reproductions, cross-corroborated where possible, but NEVER
independently checked against India Code or a subscription legal database
(Manupatra/SCC Online) as the Step 6A audit's own §25 item 11 explicitly
flags. No rule in this file has therefore been "directly verified" in the
strict sense the brief requires for APPROVED status — EVERY row here is
approval_status = PENDING_LEGAL_REVIEW, with no exception, until a qualified
human legal reviewer signs off (at which point `approved_by` would be set and
`approval_status` moved to APPROVED as a separate, deliberate action — not
something this codebase does to itself).

`duration_confidence` (a narrower, per-rule field — see RuleSet's docstring)
DOES vary rule-to-rule, based on how well-sourced each specific number was
within the Step 6A audit:
  - VERIFIED    = verbatim-confirmed via a direct primary-source-reproduction
                  extraction (indiankanoon.org), often cross-corroborated by
                  a second independent extraction.
  - UNVERIFIED  = the audit could only source this number via paraphrase, or
                  flagged it as resting on contested/unsettled case law.
This is what actually gates whether the engine may ever report
CLOCK_CERTAIN for a given rule (see clock_engine.py) — NOT approval_status,
which stays PENDING_LEGAL_REVIEW across the board as a separate governance
signal (see rule_sets.py `RuleSet` docstring for why these are kept distinct).
===============================================================================
"""

from __future__ import annotations

from datetime import date

from .dates import StatutoryDuration
from .enums import ApplicableAct, EventType, LegalConfidence, RuleApprovalStatus
from .rule_sets import (
    ConsequenceDefinition,
    ExtensionDefinition,
    RuleSet,
    StayDefinition,
    TriggerDefinition,
    compute_source_hash,
)

JURISDICTION_CENTRAL = "IN"  # central Act, no state-Rules refinement in this pass (audit §25 item 10)

# RFCTLARR Act, 2013 commenced 1 January 2014.
RFCTLARR_EFFECTIVE_FROM = date(2014, 1, 1)

# NH Act Chapter II-A (Sections 3A-3J) was inserted by the National Highways
# Laws (Amendment) Act, 1997 (Act 68 of 1997). The exact commencement
# notification date was NOT independently verified in the Step 6A audit pass;
# 1 Jan 1998 is used as a conservative placeholder and is itself one more
# reason every NH-Act rule below stays PENDING_LEGAL_REVIEW.
NHACT_3A_3J_EFFECTIVE_FROM = date(1998, 1, 1)


def _source(text: str) -> str:
    return text


# -----------------------------------------------------------------------------
# RFCTLARR, 2013
# -----------------------------------------------------------------------------

RFCTLARR_S15_OBJECTION_WINDOW = RuleSet(
    rule_set_id="rfctlarr-s15-objection-window-v1",
    act=ApplicableAct.RFCTLARR,
    section_reference="RFCTLARR s.15",
    jurisdiction=JURISDICTION_CENTRAL,
    version="v1",
    effective_from=RFCTLARR_EFFECTIVE_FROM,
    effective_to=None,
    approval_status=RuleApprovalStatus.PENDING_LEGAL_REVIEW,
    source_reference=_source(
        "RFCTLARR Act 2013 s.15 (Hearing of objections); verbatim-corroborated via "
        "aaptaxlaw.com's bare-act reproduction, cross-checked against indiankanoon.org. "
        "See docs/step6a-statutory-clock-audit.md §4."
    ),
    source_hash=compute_source_hash("RFCTLARR s.15"),
    trigger_definition=TriggerDefinition(
        triggering_event_types=(EventType.RFCTLARR_S11_PRELIMINARY_NOTIFICATION.value,),
        notes="Objection window opens on publication of the s.11 preliminary notification.",
    ),
    duration_definition=StatutoryDuration(days=60, counting_convention_verified=False),
    duration_confidence=LegalConfidence.VERIFIED,
    extension_definition=ExtensionDefinition(
        permitted=False,
        confidence=LegalConfidence.UNVERIFIED,
        notes="No extension mechanism for the s.15 objection window was found in the Step 6A audit "
        "sources — absence of evidence, not a confirmed impossibility.",
    ),
    stay_definition=StayDefinition(
        permitted=False,
        basis="not_established",
        confidence=LegalConfidence.UNVERIFIED,
        notes="Stay treatment for this specific window was not investigated in the Step 6A audit.",
    ),
    consequence_definition=ConsequenceDefinition(
        description=(
            "Objections not filed within 60 days of the s.11 preliminary notification cannot be "
            "raised under s.15; this closes a procedural window, it does not lapse the acquisition."
        ),
        is_acquisition_lapse=False,
    ),
    notes="Step 6A audit §4 classification: PROCEDURAL DEADLINE.",
)


RFCTLARR_S19_DECLARATION = RuleSet(
    rule_set_id="rfctlarr-s19-declaration-v1",
    act=ApplicableAct.RFCTLARR,
    section_reference="RFCTLARR s.19",
    jurisdiction=JURISDICTION_CENTRAL,
    version="v1",
    effective_from=RFCTLARR_EFFECTIVE_FROM,
    effective_to=None,
    approval_status=RuleApprovalStatus.PENDING_LEGAL_REVIEW,
    source_reference=_source(
        "RFCTLARR Act 2013 s.19(7) (Publication of declaration and summary of R&R); verbatim-"
        "extracted via indiankanoon.org (docs/step6a-statutory-clock-audit.md §4 row S.19): "
        "'Where no declaration is made under sub-section (1) within twelve months from the date of "
        "preliminary notification, then such notification shall be deemed to have been rescinded.' "
        "Stay-exclusion proviso verbatim-extracted from the same source: 'any period or periods "
        "during which the proceedings for the acquisition of the land were held up on account of "
        "any stay or injunction by the order of any Court shall be excluded.'"
    ),
    source_hash=compute_source_hash("RFCTLARR s.19(7)"),
    trigger_definition=TriggerDefinition(
        triggering_event_types=(EventType.RFCTLARR_S11_PRELIMINARY_NOTIFICATION.value,),
    ),
    duration_definition=StatutoryDuration(months=12, counting_convention_verified=False),
    duration_confidence=LegalConfidence.VERIFIED,
    extension_definition=ExtensionDefinition(
        permitted=True,
        authority="appropriate Government",
        requires_written_reasons=True,
        requires_publication=True,
        confidence=LegalConfidence.VERIFIED,
        notes="Mechanism's existence verbatim-confirmed; a SPECIFIC claimed extension instance still "
        "requires its own ExtensionEvidence.verification_status = VERIFIED before it may move a "
        "deadline (see extensions.py).",
    ),
    stay_definition=StayDefinition(
        permitted=True,
        basis="express_statutory_text",
        confidence=LegalConfidence.VERIFIED,
        notes="s.19(7)'s stay-exclusion proviso is express statutory text, verbatim-confirmed.",
    ),
    consequence_definition=ConsequenceDefinition(
        description="The s.11 preliminary notification 'shall be deemed to have been rescinded.'",
        is_acquisition_lapse=True,
    ),
    notes="Step 6A audit §4 classification: ACQUISITION-LAPSE CLOCK, High confidence.",
)


RFCTLARR_S25_AWARD = RuleSet(
    rule_set_id="rfctlarr-s25-award-v1",
    act=ApplicableAct.RFCTLARR,
    section_reference="RFCTLARR s.25",
    jurisdiction=JURISDICTION_CENTRAL,
    version="v1",
    effective_from=RFCTLARR_EFFECTIVE_FROM,
    effective_to=None,
    approval_status=RuleApprovalStatus.PENDING_LEGAL_REVIEW,
    source_reference=_source(
        "RFCTLARR Act 2013 s.25 (Period within which an award shall be made); verbatim-extracted "
        "via indiankanoon.org (docs/step6a-statutory-clock-audit.md §4 row S.25): 'The Collector "
        "shall make an award within a period of twelve months from the date of publication of the "
        "declaration under section 19 and if no award is made within that period, the entire "
        "proceedings for the acquisition of the land shall lapse.' No stay-exclusion proviso appears "
        "in the verbatim s.25 text itself; a stay-exclusion is applied only by case-law analogy "
        "(unconfirmed scope) — see stay_definition below."
    ),
    source_hash=compute_source_hash("RFCTLARR s.25"),
    trigger_definition=TriggerDefinition(
        triggering_event_types=(EventType.RFCTLARR_S19_DECLARATION.value,),
    ),
    duration_definition=StatutoryDuration(months=12, counting_convention_verified=False),
    duration_confidence=LegalConfidence.VERIFIED,
    extension_definition=ExtensionDefinition(
        permitted=True,
        authority="appropriate Government",
        requires_written_reasons=True,
        requires_publication=True,
        confidence=LegalConfidence.VERIFIED,
        notes="Same mechanism/shape as s.19's extension power, verbatim-confirmed.",
    ),
    stay_definition=StayDefinition(
        permitted=False,
        basis="case_law_only",
        confidence=LegalConfidence.UNVERIFIED,
        notes="Step 6A audit found NO express statutory stay-exclusion proviso in s.25's bare text; "
        "case-law commentary suggests a stay-exclusion is applied by analogy, but its exact scope was "
        "not confirmed as settled. This engine therefore NEVER silently excludes a stay period for "
        "this rule — a verified, in-scope stay instead forces CLOCK_UNCERTAIN (see stays.py).",
    ),
    consequence_definition=ConsequenceDefinition(
        description="'The entire proceedings for the acquisition of the land shall lapse.'",
        is_acquisition_lapse=True,
    ),
    notes="Step 6A audit §4 classification: ACQUISITION-LAPSE CLOCK, High confidence on duration/"
    "consequence/extension; the stay treatment is deliberately kept unresolved (see stay_definition).",
)


RFCTLARR_S24_2_LEGACY_LAPSE_TEST = RuleSet(
    rule_set_id="rfctlarr-s24-2-legacy-lapse-test-v1",
    # `act` = RFCTLARR because s.24(2) is itself a RFCTLARR Act provision (a
    # transitional rule ABOUT 1894 proceedings, not a rule belonging to the
    # 1894 Act itself). The case this rule applies to is routed as
    # LEGACY_1894 via the `is_legacy_1894` flag passed into
    # compute_statutory_clock, and its trigger event type
    # (LA1894_S11_AWARD) is its own distinct, Act-qualified event type —
    # see enums.py.
    act=ApplicableAct.RFCTLARR,
    section_reference="RFCTLARR s.24(2)",
    jurisdiction=JURISDICTION_CENTRAL,
    version="v1",
    effective_from=RFCTLARR_EFFECTIVE_FROM,
    effective_to=None,
    approval_status=RuleApprovalStatus.PENDING_LEGAL_REVIEW,
    source_reference=_source(
        "RFCTLARR Act 2013 s.24(2) (transitional provision for legacy Land Acquisition Act, 1894 "
        "proceedings); Constitution Bench interpretation in Indore Development Authority v. "
        "Manoharlal & Ors., (2020) 8 SCC 129 (decided 6 March 2020), overruling Pune Municipal "
        "Corporation v. Harakchand Misirimal Solanki, (2014) 3 SCC 183. See "
        "docs/step6a-statutory-clock-audit.md §4 row S.24(2), §6, and §25 item 1."
    ),
    source_hash=compute_source_hash("RFCTLARR s.24(2)"),
    trigger_definition=TriggerDefinition(
        triggering_event_types=(EventType.LA1894_S11_AWARD.value,),
        notes="Triggered by the pre-2014 Land Acquisition Act, 1894 s.11 award date, NOT any "
        "RFCTLARR-side notification (a legacy case may never have had one).",
    ),
    duration_definition=StatutoryDuration(years=5, counting_convention_verified=False),
    # Deliberately UNVERIFIED, not merely PENDING_LEGAL_REVIEW: the Step 6B brief is explicit that
    # "Where Section 24(2) interpretation depends on unresolved case law: CLOCK_UNCERTAIN is
    # preferable to a fabricated deterministic result." Setting this to anything but UNVERIFIED
    # would let is_duration_sufficiently_verified() return True and risk a confident APPARENT_LAPSE
    # this codebase has no business asserting. This is an intentional, permanent choice for this
    # rule, not a placeholder to "fix" later without a legal reviewer's explicit sign-off.
    duration_confidence=LegalConfidence.UNVERIFIED,
    extension_definition=None,
    stay_definition=StayDefinition(
        permitted=False,
        basis="case_law_only",
        confidence=LegalConfidence.UNVERIFIED,
        notes="No express stay-exclusion proviso in s.24(2)'s bare text; Indore Development "
        "Authority applied an 'impossibility' exception judicially, but its scope across fact "
        "patterns is contested. Never silently applied by this engine.",
    ),
    consequence_definition=ConsequenceDefinition(
        description=(
            "Deemed lapse of the 1894 proceedings if, per the Constitution Bench's disjunctive "
            "reading of 'or', either possession has not been taken OR compensation has not been "
            "paid — subject to a majority-compensation proviso this engine does not yet evaluate."
        ),
        is_acquisition_lapse=True,
    ),
    notes="Always resolves to CLOCK_UNCERTAIN in this engine via duration_confidence=UNVERIFIED "
    "(see clock_engine.py's rule-confidence gate) — by design, per the Step 6B brief.",
)


RFCTLARR_S14_SIA_REPORT_LAPSE = RuleSet(
    rule_set_id="rfctlarr-s14-sia-report-lapse-v1",
    act=ApplicableAct.RFCTLARR,
    section_reference="RFCTLARR s.14",
    jurisdiction=JURISDICTION_CENTRAL,
    version="v1",
    effective_from=RFCTLARR_EFFECTIVE_FROM,
    effective_to=None,
    approval_status=RuleApprovalStatus.PENDING_LEGAL_REVIEW,
    source_reference=_source(
        "RFCTLARR Act 2013 s.14 (SIA report lapse if no s.11 notification follows); sourced only "
        "via secondary paraphrase in the Step 6A audit, NOT independently verbatim-confirmed. See "
        "docs/step6a-statutory-clock-audit.md §4 row S.14 and §25 item 3."
    ),
    source_hash=compute_source_hash("RFCTLARR s.14"),
    trigger_definition=TriggerDefinition(
        triggering_event_types=(EventType.RFCTLARR_S14_SIA_EXPERT_GROUP_VIEWS.value,),
    ),
    duration_definition=StatutoryDuration(months=12, counting_convention_verified=False),
    # UNVERIFIED: paraphrase-sourced only, per the audit — never eligible for CLOCK_CERTAIN.
    duration_confidence=LegalConfidence.UNVERIFIED,
    extension_definition=None,
    stay_definition=None,
    consequence_definition=ConsequenceDefinition(
        description="SIA report 'deemed to have lapsed'; a fresh SIA must be conducted.",
        is_acquisition_lapse=False,
    ),
    notes="Feeds a fresh-SIA requirement, not an acquisition lapse. Included for completeness; "
    "always CLOCK_UNCERTAIN pending verbatim confirmation.",
)


# -----------------------------------------------------------------------------
# National Highways Act, 1956 — a completely separate rule family. No section
# reference or event type here is ever paired with an RFCTLARR one.
# -----------------------------------------------------------------------------

NHACT_3C_OBJECTION_WINDOW = RuleSet(
    rule_set_id="nhact-3c-objection-window-v1",
    act=ApplicableAct.NH_ACT_1956,
    section_reference="NH Act s.3C",
    jurisdiction=JURISDICTION_CENTRAL,
    version="v1",
    effective_from=NHACT_3A_3J_EFFECTIVE_FROM,
    effective_to=None,
    approval_status=RuleApprovalStatus.PENDING_LEGAL_REVIEW,
    source_reference=_source(
        "National Highways Act 1956 s.3C (Hearing of objections); verbatim-extracted via "
        "indiankanoon.org (docs/step6a-statutory-clock-audit.md §5 row 3C): objection window is "
        "'within twenty-one days from the date of publication of the notification' — materially "
        "shorter than RFCTLARR's 60 days; never treated as equivalent."
    ),
    source_hash=compute_source_hash("NH Act s.3C"),
    trigger_definition=TriggerDefinition(
        triggering_event_types=(EventType.NHACT_3A_NOTIFICATION.value,),
    ),
    duration_definition=StatutoryDuration(days=21, counting_convention_verified=False),
    duration_confidence=LegalConfidence.VERIFIED,
    extension_definition=ExtensionDefinition(
        permitted=False,
        confidence=LegalConfidence.UNVERIFIED,
        notes="No extension mechanism found in the sources reviewed for the 3C window.",
    ),
    stay_definition=StayDefinition(
        permitted=False,
        basis="not_established",
        confidence=LegalConfidence.UNVERIFIED,
    ),
    consequence_definition=ConsequenceDefinition(
        description="Objection window closes; the competent authority's order allowing/disallowing "
        "objections is stated to be final. Not an acquisition-lapse consequence.",
        is_acquisition_lapse=False,
    ),
    notes="Step 6A audit §5 classification: PROCEDURAL DEADLINE, High confidence on duration.",
)


NHACT_3D_DECLARATION = RuleSet(
    rule_set_id="nhact-3d-declaration-v1",
    act=ApplicableAct.NH_ACT_1956,
    section_reference="NH Act s.3D",
    jurisdiction=JURISDICTION_CENTRAL,
    version="v1",
    effective_from=NHACT_3A_3J_EFFECTIVE_FROM,
    effective_to=None,
    approval_status=RuleApprovalStatus.PENDING_LEGAL_REVIEW,
    source_reference=_source(
        "National Highways Act 1956 s.3D (Declaration of acquisition); verbatim-extracted via "
        "indiankanoon.org (docs/step6a-statutory-clock-audit.md §5 row 3D): 'Where a notification "
        "has been published under sub-section (1) of section 3A ... but no declaration under "
        "sub-section (1) has been published within a period of one year from the date of "
        "publication of that notification, the said notification shall cease to have any effect.' "
        "Stay-exclusion: 'the period or periods during which any action or proceedings to be taken "
        "in pursuance of the notification issued under sub-section (1) of section 3A is stayed by "
        "an order of a court shall be excluded.'"
    ),
    source_hash=compute_source_hash("NH Act s.3D"),
    trigger_definition=TriggerDefinition(
        triggering_event_types=(EventType.NHACT_3A_NOTIFICATION.value,),
    ),
    duration_definition=StatutoryDuration(years=1, counting_convention_verified=False),
    duration_confidence=LegalConfidence.VERIFIED,
    # No extension mechanism was found for 3D in the Step 6A audit — this is an ABSENCE-OF-EVIDENCE
    # finding (permitted=False, confidence=UNVERIFIED), deliberately NOT a confirmed impossibility.
    # See ExtensionDefinition's docstring and extensions.py for how a claimed extension against this
    # specific rule is handled (never auto-rejected, never auto-granted).
    extension_definition=ExtensionDefinition(
        permitted=False,
        confidence=LegalConfidence.UNVERIFIED,
        notes="Step 6A audit §5/§25 item 4: absence of an extension mechanism across every source "
        "reviewed, NOT an explicit 'no extension' statutory clause. Treat as unresolved, not "
        "impossible — see docs/step6a-statutory-clock-audit.md.",
    ),
    stay_definition=StayDefinition(
        permitted=True,
        basis="express_statutory_text",
        confidence=LegalConfidence.VERIFIED,
        notes="3D(3)'s stay-exclusion is express statutory text, verbatim-confirmed.",
    ),
    consequence_definition=ConsequenceDefinition(
        description="'The said notification shall cease to have any effect.'",
        is_acquisition_lapse=True,
    ),
    notes="Step 6A audit §5 classification: ACQUISITION-LAPSE CLOCK, High confidence on duration/"
    "consequence/stay-exclusion. Sharp contrast with RFCTLARR s.19/s.25: NO identified extension "
    "mechanism at all — never assume this clock can be extended.",
)


NHACT_3E_POSSESSION_NOTICE = RuleSet(
    rule_set_id="nhact-3e-possession-notice-v1",
    act=ApplicableAct.NH_ACT_1956,
    section_reference="NH Act s.3E",
    jurisdiction=JURISDICTION_CENTRAL,
    version="v1",
    effective_from=NHACT_3A_3J_EFFECTIVE_FROM,
    effective_to=None,
    approval_status=RuleApprovalStatus.PENDING_LEGAL_REVIEW,
    source_reference=_source(
        "National Highways Act 1956 s.3E (Power to take possession); summarized (not independently "
        "double-verified against a second primary source) in docs/step6a-statutory-clock-audit.md "
        "§5 row 3E: possession requires land vested under s.3D AND compensation deposited under "
        "s.3H; the competent authority's surrender notice gives 'sixty days'."
    ),
    source_hash=compute_source_hash("NH Act s.3E"),
    trigger_definition=TriggerDefinition(
        triggering_event_types=(EventType.NHACT_3E_POSSESSION_NOTICE.value,),
        notes="Triggered by the possession-surrender notice itself (a s.3E notice event), not s.3D — "
        "s.3D vesting and s.3H deposit are preconditions to issuing this notice, not this clock's "
        "own trigger date.",
    ),
    duration_definition=StatutoryDuration(days=60, counting_convention_verified=False),
    # UNVERIFIED: the 3E text was summarized, not independently cross-checked against a second
    # primary source the way s.3C/s.3D were — kept conservative per the audit's own confidence note.
    duration_confidence=LegalConfidence.UNVERIFIED,
    extension_definition=ExtensionDefinition(
        permitted=False,
        confidence=LegalConfidence.UNVERIFIED,
        notes="Not established in the Step 6A audit pass.",
    ),
    stay_definition=StayDefinition(
        permitted=False,
        basis="not_established",
        confidence=LegalConfidence.UNVERIFIED,
    ),
    consequence_definition=ConsequenceDefinition(
        description="Non-compliance lets the competent authority apply to the Commissioner of "
        "Police / District Collector to enforce surrender. A possession-readiness precondition, "
        "not an acquisition-lapse consequence.",
        is_acquisition_lapse=False,
    ),
    notes="Step 6A audit §5 classification: POSSESSION READINESS CLOCK, Medium confidence. Always "
    "CLOCK_UNCERTAIN in this engine pending a second-source verification pass.",
)


ALL_RULE_SETS = (
    RFCTLARR_S15_OBJECTION_WINDOW,
    RFCTLARR_S19_DECLARATION,
    RFCTLARR_S25_AWARD,
    RFCTLARR_S24_2_LEGACY_LAPSE_TEST,
    RFCTLARR_S14_SIA_REPORT_LAPSE,
    NHACT_3C_OBJECTION_WINDOW,
    NHACT_3D_DECLARATION,
    NHACT_3E_POSSESSION_NOTICE,
)
