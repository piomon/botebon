"""Symulacja ścieżki aplikacyjnej ekran po ekranie (bez automatycznego wysyłania)."""

from __future__ import annotations

import csv
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCREEN_FLOW = [
    "logowanie",
    "strona_glowna",
    "rekrutacja_lista",
    "wybor_naboru",
    "formularz_dane_osobowe",
    "formularz_dokumenty",
    "formularz_oswiadczenia",
    "podglad_wniosku",
    "WYMAGANE_RECZNE_WYSLANIE",
]


class SimulationStep:
    def __init__(self, screen: str, status: str, message: str, elapsed_ms: int) -> None:
        self.screen = screen
        self.status = status
        self.message = message
        self.elapsed_ms = elapsed_ms

    def to_dict(self) -> dict[str, Any]:
        return {
            "screen": self.screen,
            "status": self.status,
            "message": self.message,
            "elapsed_ms": self.elapsed_ms,
        }


class ParticipantSimulation:
    def __init__(self, row: int, imie: str, nazwisko: str, login_portal: str) -> None:
        self.row = row
        self.imie = imie
        self.nazwisko = nazwisko
        self.login_portal = login_portal
        self.steps: list[SimulationStep] = []
        self.started_at: str = ""
        self.finished_at: str = ""
        self.final_status: str = "not_started"

    def to_dict(self) -> dict[str, Any]:
        return {
            "row": self.row,
            "imie": self.imie,
            "nazwisko": self.nazwisko,
            "login_portal": self.login_portal,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "final_status": self.final_status,
            "steps": [s.to_dict() for s in self.steps],
        }


def simulate_participant(record: dict[str, str], row: int, base_url: str) -> ParticipantSimulation:
    sim = ParticipantSimulation(
        row=row,
        imie=record.get("imie", "").strip(),
        nazwisko=record.get("nazwisko", "").strip(),
        login_portal=record.get("login_portal", "").strip(),
    )
    sim.started_at = datetime.now(tz=timezone.utc).isoformat()

    for screen in SCREEN_FLOW:
        t0 = time.monotonic()
        time.sleep(0.05)
        elapsed = int((time.monotonic() - t0) * 1000)

        if screen == "WYMAGANE_RECZNE_WYSLANIE":
            sim.steps.append(SimulationStep(
                screen=screen,
                status="STOP",
                message="Symulacja zakończona. Wymagane ręczne potwierdzenie i wysłanie przez uczestniczkę.",
                elapsed_ms=elapsed,
            ))
            sim.final_status = "awaiting_manual_submit"
        elif screen == "logowanie":
            sim.steps.append(SimulationStep(
                screen=screen,
                status="ok",
                message=f"Ekran logowania dostępny pod {base_url}/logowanie",
                elapsed_ms=elapsed,
            ))
        else:
            sim.steps.append(SimulationStep(
                screen=screen,
                status="ok",
                message=f"Ekran '{screen}' — symulacja przejścia OK",
                elapsed_ms=elapsed,
            ))

    sim.finished_at = datetime.now(tz=timezone.utc).isoformat()
    if sim.final_status == "not_started":
        sim.final_status = "completed"
    return sim


def run_simulation(csv_path: Path, config_path: Path, out_dir: Path) -> None:
    import yaml  # type: ignore[import-untyped]

    config: dict[str, Any] = {}
    if config_path.exists():
        with config_path.open(encoding="utf-8") as fh:
            config = yaml.safe_load(fh) or {}

    base_url = config.get("portal", {}).get("base_url", "https://portal.przyklad.pl")

    records: list[dict[str, str]] = []
    with csv_path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for i, row in enumerate(reader, start=2):
            records.append({"_row": str(i), **dict(row)})

    results: list[dict[str, Any]] = []
    for record in records:
        row_num = int(record["_row"])
        print(f"[simulate] Uczestniczka {record.get('imie','')} {record.get('nazwisko','')} (wiersz {row_num}) ...")
        sim = simulate_participant(record, row_num, base_url)
        results.append(sim.to_dict())
        for step in sim.steps:
            icon = "✓" if step.status == "ok" else "⚑"
            print(f"  {icon} [{step.screen}] {step.message}")

    out_dir.mkdir(parents=True, exist_ok=True)

    report = {
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        "base_url": base_url,
        "total": len(results),
        "simulations": results,
    }

    json_path = out_dir / "simulate_report.json"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    csv_path_out = out_dir / "simulate_report.csv"
    with csv_path_out.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["row", "imie", "nazwisko", "login_portal", "final_status", "steps_count", "started_at", "finished_at"])
        for r in results:
            writer.writerow([
                r["row"],
                r["imie"],
                r["nazwisko"],
                r["login_portal"],
                r["final_status"],
                len(r["steps"]),
                r["started_at"],
                r["finished_at"],
            ])

    print(f"\n[simulate] Raport zapisano w: {out_dir}")
    print(f"[simulate] Łącznie uczestniczek: {len(results)}")
    awaiting = sum(1 for r in results if r["final_status"] == "awaiting_manual_submit")
    print(f"[simulate] Oczekuje na ręczne wysłanie: {awaiting}")
