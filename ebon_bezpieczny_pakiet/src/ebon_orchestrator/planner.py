"""Planowanie kolejności działań na określoną godzinę startu."""

from __future__ import annotations

import csv
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


class ActionSlot:
    def __init__(
        self,
        slot_id: int,
        worker: int,
        participant_row: int,
        imie: str,
        nazwisko: str,
        login_portal: str,
        scheduled_at: datetime,
    ) -> None:
        self.slot_id = slot_id
        self.worker = worker
        self.participant_row = participant_row
        self.imie = imie
        self.nazwisko = nazwisko
        self.login_portal = login_portal
        self.scheduled_at = scheduled_at

    def to_dict(self) -> dict[str, Any]:
        return {
            "slot_id": self.slot_id,
            "worker": self.worker,
            "participant_row": self.participant_row,
            "imie": self.imie,
            "nazwisko": self.nazwisko,
            "login_portal": self.login_portal,
            "scheduled_at": self.scheduled_at.isoformat(),
        }


def build_plan(
    csv_path: Path,
    start_dt: datetime,
    workers: int,
    spacing_sec: int,
) -> list[ActionSlot]:
    records: list[dict[str, str]] = []
    with csv_path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for i, row in enumerate(reader, start=2):
            records.append({"_row": str(i), **dict(row)})

    slots: list[ActionSlot] = []
    for idx, record in enumerate(records):
        worker = (idx % workers) + 1
        delay_sec = (idx // workers) * spacing_sec
        scheduled_at = start_dt + timedelta(seconds=delay_sec)
        slots.append(
            ActionSlot(
                slot_id=idx + 1,
                worker=worker,
                participant_row=int(record["_row"]),
                imie=record.get("imie", "").strip(),
                nazwisko=record.get("nazwisko", "").strip(),
                login_portal=record.get("login_portal", "").strip(),
                scheduled_at=scheduled_at,
            )
        )
    return slots


def save_plan(slots: list[ActionSlot], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    plan_data = {
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        "total_slots": len(slots),
        "slots": [s.to_dict() for s in slots],
    }

    json_path = out_dir / "plan.json"
    json_path.write_text(json.dumps(plan_data, ensure_ascii=False, indent=2), encoding="utf-8")

    csv_path = out_dir / "plan.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["slot_id", "worker", "participant_row", "imie", "nazwisko", "login_portal", "scheduled_at"])
        for s in slots:
            writer.writerow([
                s.slot_id,
                s.worker,
                s.participant_row,
                s.imie,
                s.nazwisko,
                s.login_portal,
                s.scheduled_at.isoformat(),
            ])

    checklist_path = out_dir / "checklist.md"
    lines = [
        "# Checklista operacyjna — plan działań\n",
        f"Wygenerowano: {plan_data['generated_at']}\n",
        f"Łącznie slotów: {len(slots)}\n\n",
        "## Harmonogram\n\n",
        "| Slot | Pracownik | Uczestniczka | Login | Godzina |\n",
        "|------|-----------|-------------|-------|--------|\n",
    ]
    for s in slots:
        lines.append(
            f"| {s.slot_id} | W{s.worker} | {s.imie} {s.nazwisko} | {s.login_portal} | {s.scheduled_at.strftime('%H:%M:%S')} |\n"
        )
    lines += [
        "\n## Checklista przed startem\n\n",
        "- [ ] Dane zwalidowane (`validate`)\n",
        "- [ ] Konfiguracja portalu sprawdzona\n",
        "- [ ] Każda uczestniczka zalogowana na swoje konto\n",
        "- [ ] Połączenie z Internetem stabilne\n",
        "- [ ] Harmonogram rozesłany do zespołu\n",
        "- [ ] Zrzuty ekranu po każdym złożeniu wniosku\n",
    ]
    checklist_path.write_text("".join(lines), encoding="utf-8")

    print(f"[plan] Zapisano {len(slots)} slotów w: {out_dir}")
    for s in slots:
        print(f"  Slot {s.slot_id:>3} | W{s.worker} | {s.imie} {s.nazwisko:20} | {s.scheduled_at.strftime('%H:%M:%S')}")
