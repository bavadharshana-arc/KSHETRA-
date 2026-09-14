import unittest
from datetime import date

from legal.enums import EvidenceVerificationStatus, ExtensionStatus
from legal.extensions import ExtensionEvidence, evaluate_extension_status, extension_covers_date
from legal.rule_seed_data import NHACT_3D_DECLARATION, RFCTLARR_S25_AWARD

CASE = "T-CASE-EXT"


def _ext(rule_set_id, status, **overrides):
    base = dict(
        extension_id="T-EXT-1",
        case_reference=CASE,
        rule_set_id=rule_set_id,
        extension_order_id="T-ORD-1",
        extension_date=date(2024, 1, 5),
        authority="Test Authority",
        reason="test",
        source_document="T-DOC",
        effective_from=date(2024, 1, 5),
        effective_to=date(2024, 7, 5),
        verification_status=status,
    )
    base.update(overrides)
    return ExtensionEvidence(**base)


class EvaluateExtensionStatusTests(unittest.TestCase):
    def test_no_claim_is_unknown(self):
        self.assertEqual(
            evaluate_extension_status(RFCTLARR_S25_AWARD, None), ExtensionStatus.EXTENSION_UNKNOWN
        )

    def test_verified_claim_on_confirmed_mechanism_is_verified(self):
        ext = _ext(RFCTLARR_S25_AWARD.rule_set_id, EvidenceVerificationStatus.VERIFIED)
        self.assertEqual(
            evaluate_extension_status(RFCTLARR_S25_AWARD, ext), ExtensionStatus.EXTENSION_VERIFIED
        )

    def test_claimed_not_yet_verified_stays_claimed(self):
        ext = _ext(RFCTLARR_S25_AWARD.rule_set_id, EvidenceVerificationStatus.CLAIMED)
        self.assertEqual(
            evaluate_extension_status(RFCTLARR_S25_AWARD, ext), ExtensionStatus.EXTENSION_CLAIMED
        )

    def test_explicitly_rejected_claim(self):
        ext = _ext(RFCTLARR_S25_AWARD.rule_set_id, EvidenceVerificationStatus.REJECTED)
        self.assertEqual(
            evaluate_extension_status(RFCTLARR_S25_AWARD, ext), ExtensionStatus.EXTENSION_REJECTED
        )

    def test_claim_against_a_rule_with_no_confirmed_mechanism_stays_claimed_not_rejected(self):
        """NH Act 3D: absence of an identified extension mechanism must NOT
        be treated as a confirmed legal impossibility. Even a VERIFIED piece
        of evidence cannot become EXTENSION_VERIFIED here, but it must also
        not be auto-REJECTED — it stays CLAIMED (-> EXTENSION_UNVERIFIED at
        the clock-status level)."""
        ext = _ext(NHACT_3D_DECLARATION.rule_set_id, EvidenceVerificationStatus.VERIFIED)
        self.assertEqual(
            evaluate_extension_status(NHACT_3D_DECLARATION, ext), ExtensionStatus.EXTENSION_CLAIMED
        )


class ExtensionCoversDateTests(unittest.TestCase):
    def test_within_window(self):
        ext = _ext(RFCTLARR_S25_AWARD.rule_set_id, EvidenceVerificationStatus.VERIFIED)
        self.assertTrue(extension_covers_date(ext, date(2024, 3, 1)))

    def test_before_window(self):
        ext = _ext(RFCTLARR_S25_AWARD.rule_set_id, EvidenceVerificationStatus.VERIFIED)
        self.assertFalse(extension_covers_date(ext, date(2023, 12, 1)))

    def test_after_window(self):
        ext = _ext(RFCTLARR_S25_AWARD.rule_set_id, EvidenceVerificationStatus.VERIFIED)
        self.assertFalse(extension_covers_date(ext, date(2024, 8, 1)))

    def test_open_ended_window(self):
        ext = _ext(RFCTLARR_S25_AWARD.rule_set_id, EvidenceVerificationStatus.VERIFIED, effective_to=None)
        self.assertTrue(extension_covers_date(ext, date(2030, 1, 1)))


if __name__ == "__main__":
    unittest.main()
