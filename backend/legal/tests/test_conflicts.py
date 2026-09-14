import unittest
from datetime import date, datetime, timezone

from legal.conflicts import resolve_trigger_event
from legal.enums import ApplicableAct, EventType, SourceType
from legal.events import AcquisitionEvent

CASE = "T-CASE-CONFLICTS"
EVT = EventType.RFCTLARR_S11_PRELIMINARY_NOTIFICATION.value


def _event(event_id, event_date, source_type, verified, notes=""):
    return AcquisitionEvent(
        event_id=event_id,
        case_reference=CASE,
        project_id="T-PROJ",
        parcel_id=None,
        event_type=EVT,
        applicable_act=ApplicableAct.RFCTLARR,
        event_date=event_date,
        publication_date=event_date,
        source_type=source_type,
        source_reference="T-SRC",
        source_document_id=None,
        confidence="HIGH",
        verified=verified,
        verification_timestamp=datetime(2024, 1, 1, tzinfo=timezone.utc) if verified else None,
        notes=notes,
    )


class NoEventTests(unittest.TestCase):
    def test_no_event_on_record(self):
        resolution = resolve_trigger_event([], EVT, CASE)
        self.assertIsNone(resolution.chosen_event)
        self.assertIsNone(resolution.conflict)
        self.assertFalse(resolution.resolved)


class SingleValueTests(unittest.TestCase):
    def test_single_record_resolves_cleanly(self):
        e = _event("E1", date(2024, 1, 10), SourceType.OFFICIAL_GAZETTE, True)
        resolution = resolve_trigger_event([e], EVT, CASE)
        self.assertEqual(resolution.chosen_event, e)
        self.assertIsNone(resolution.conflict)

    def test_multiple_records_same_date_no_conflict(self):
        e1 = _event("E1", date(2024, 1, 10), SourceType.OFFICIAL_GAZETTE, True)
        e2 = _event("E2", date(2024, 1, 10), SourceType.MANUAL_ENTRY, True)
        resolution = resolve_trigger_event([e1, e2], EVT, CASE)
        self.assertIsNotNone(resolution.chosen_event)
        self.assertIsNone(resolution.conflict)


class ConflictingEvidenceTests(unittest.TestCase):
    def test_higher_authority_wins_when_both_verified(self):
        gazette = _event("E-GAZ", date(2024, 1, 10), SourceType.OFFICIAL_GAZETTE, True)
        manual = _event("E-MAN", date(2024, 1, 12), SourceType.MANUAL_ENTRY, True)
        resolution = resolve_trigger_event([gazette, manual], EVT, CASE)
        self.assertEqual(resolution.chosen_event, gazette)
        self.assertIsNotNone(resolution.conflict)
        # Provenance preservation: BOTH competing records are named in the
        # conflict, never silently dropped.
        self.assertIn("E-GAZ", resolution.conflict.competing_event_ids)
        self.assertIn("E-MAN", resolution.conflict.competing_event_ids)

    def test_gazette_never_overwritten_by_manual_entry(self):
        """Explicit regression for the Step 6A brief's example: a Gazette
        date must never be silently replaced by a manual entry, even if the
        manual entry is 'verified' at the evidence level."""
        gazette = _event("E-GAZ", date(2024, 1, 10), SourceType.OFFICIAL_GAZETTE, False)  # unverified!
        manual = _event("E-MAN", date(2024, 1, 12), SourceType.MANUAL_ENTRY, True)  # verified
        resolution = resolve_trigger_event([gazette, manual], EVT, CASE)
        # A verified lower-authority source is allowed to be CHOSEN over an
        # unverified higher-authority one (per the audit's explicit rule) —
        # but the Gazette record is never deleted/edited; it stays present in
        # the conflict's competing_event_ids for the human record.
        self.assertEqual(resolution.chosen_event, manual)
        self.assertIn("E-GAZ", resolution.conflict.competing_event_ids)

    def test_unverified_higher_authority_beats_unverified_lower(self):
        gazette = _event("E-GAZ", date(2024, 1, 10), SourceType.OFFICIAL_GAZETTE, False)
        manual = _event("E-MAN", date(2024, 1, 12), SourceType.MANUAL_ENTRY, False)
        resolution = resolve_trigger_event([gazette, manual], EVT, CASE)
        self.assertEqual(resolution.chosen_event, gazette)

    def test_tied_top_authority_is_unresolved(self):
        gazette_a = _event("E-GAZ-A", date(2024, 1, 10), SourceType.OFFICIAL_GAZETTE, True)
        gazette_b = _event("E-GAZ-B", date(2024, 1, 12), SourceType.OFFICIAL_GAZETTE, True)
        resolution = resolve_trigger_event([gazette_a, gazette_b], EVT, CASE)
        self.assertIsNone(resolution.chosen_event)
        self.assertIsNotNone(resolution.conflict)
        self.assertIn("E-GAZ-A", resolution.conflict.competing_event_ids)
        self.assertIn("E-GAZ-B", resolution.conflict.competing_event_ids)

    def test_never_averages_or_picks_latest_or_earliest(self):
        gazette_a = _event("E-GAZ-A", date(2024, 1, 10), SourceType.OFFICIAL_GAZETTE, True)
        gazette_b = _event("E-GAZ-B", date(2024, 1, 20), SourceType.OFFICIAL_GAZETTE, True)
        resolution = resolve_trigger_event([gazette_a, gazette_b], EVT, CASE)
        # Neither "latest" (1/20) nor "earliest" (1/10) nor an average (1/15)
        # is silently chosen.
        self.assertIsNone(resolution.chosen_event)


class SupersessionTests(unittest.TestCase):
    def test_superseded_event_excluded_but_not_deleted(self):
        original = _event("E-ORIG", date(2024, 1, 10), SourceType.MANUAL_ENTRY, True)
        correction = AcquisitionEvent(
            event_id="E-CORR",
            case_reference=CASE,
            project_id="T-PROJ",
            parcel_id=None,
            event_type=EVT,
            applicable_act=ApplicableAct.RFCTLARR,
            event_date=date(2024, 1, 12),
            publication_date=date(2024, 1, 12),
            source_type=SourceType.OFFICIAL_GAZETTE,
            source_reference="T-SRC-2",
            source_document_id=None,
            confidence="HIGH",
            verified=True,
            verification_timestamp=datetime(2024, 1, 12, tzinfo=timezone.utc),
            supersedes_event_id="E-ORIG",
        )
        all_events = [original, correction]
        resolution = resolve_trigger_event(all_events, EVT, CASE)
        # The superseded record no longer competes...
        self.assertEqual(resolution.chosen_event, correction)
        self.assertIsNone(resolution.conflict)
        # ...but it still exists, untouched, in the original list (append-only).
        self.assertIn(original, all_events)
        self.assertEqual(original.event_date, date(2024, 1, 10))


if __name__ == "__main__":
    unittest.main()
