"""Proste testy jednostkowe planera."""

import sys
import os
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from ebon_orchestrator.planner import ActionSlot


def test_slot_to_dict():
    dt = datetime(2026, 4, 10, 16, 0, 0, tzinfo=timezone.utc)
    slot = ActionSlot(1, 1, 2, "Anna", "Kowalska", "anna@portal.pl", dt)
    d = slot.to_dict()
    assert d["slot_id"] == 1
    assert d["worker"] == 1
    assert d["imie"] == "Anna"
    assert "scheduled_at" in d


if __name__ == "__main__":
    test_slot_to_dict()
    print("Testy planera zakończone pomyślnie.")
