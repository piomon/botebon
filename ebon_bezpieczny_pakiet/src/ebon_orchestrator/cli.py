"""CLI — punkt wejścia dla trybów: validate, plan, simulate."""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path


def cmd_validate(args: argparse.Namespace) -> None:
    from .validator import validate_csv, save_validate_report

    csv_path = Path(args.csv)
    out_dir = Path(args.out)

    if not csv_path.exists():
        print(f"[validate] BŁĄD: plik CSV nie istnieje: {csv_path}", file=sys.stderr)
        sys.exit(1)

    results = validate_csv(csv_path)
    save_validate_report(results, out_dir)

    has_errors = any(not r.ok for r in results)
    sys.exit(1 if has_errors else 0)


def cmd_plan(args: argparse.Namespace) -> None:
    from .planner import build_plan, save_plan

    csv_path = Path(args.csv)
    out_dir = Path(args.out)

    if not csv_path.exists():
        print(f"[plan] BŁĄD: plik CSV nie istnieje: {csv_path}", file=sys.stderr)
        sys.exit(1)

    try:
        start_dt = datetime.fromisoformat(args.start)
    except ValueError:
        print(f"[plan] BŁĄD: nieprawidłowy format daty/godziny: {args.start}", file=sys.stderr)
        print("[plan] Użyj formatu ISO 8601, np.: 2026-04-10T16:00:00+02:00", file=sys.stderr)
        sys.exit(1)

    slots = build_plan(
        csv_path=csv_path,
        start_dt=start_dt,
        workers=args.workers,
        spacing_sec=args.spacing_sec,
    )
    save_plan(slots, out_dir)


def cmd_simulate(args: argparse.Namespace) -> None:
    from .simulator import run_simulation

    csv_path = Path(args.csv)
    config_path = Path(args.config)
    out_dir = Path(args.out)

    if not csv_path.exists():
        print(f"[simulate] BŁĄD: plik CSV nie istnieje: {csv_path}", file=sys.stderr)
        sys.exit(1)

    run_simulation(csv_path=csv_path, config_path=config_path, out_dir=out_dir)


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="ebon_orchestrator",
        description="EBON — bezpieczny pakiet operacyjno-testowy",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    p_validate = subparsers.add_parser("validate", help="Walidacja rekordów uczestników")
    p_validate.add_argument("--csv", required=True, help="Ścieżka do pliku CSV z uczestnikami")
    p_validate.add_argument("--out", required=True, help="Katalog wyjściowy dla raportów")
    p_validate.set_defaults(func=cmd_validate)

    p_plan = subparsers.add_parser("plan", help="Generowanie planu działań i harmonogramu")
    p_plan.add_argument("--csv", required=True, help="Ścieżka do pliku CSV z uczestnikami")
    p_plan.add_argument("--start", required=True, help="Czas startu w formacie ISO 8601 (np. 2026-04-10T16:00:00+02:00)")
    p_plan.add_argument("--workers", type=int, default=3, help="Liczba pracowników (domyślnie 3)")
    p_plan.add_argument("--spacing-sec", type=int, default=2, dest="spacing_sec", help="Odstęp między slotami w sekundach (domyślnie 2)")
    p_plan.add_argument("--out", required=True, help="Katalog wyjściowy dla planu")
    p_plan.set_defaults(func=cmd_plan)

    p_simulate = subparsers.add_parser("simulate", help="Symulacja ścieżki aplikacyjnej ekran po ekranie")
    p_simulate.add_argument("--csv", required=True, help="Ścieżka do pliku CSV z uczestnikami")
    p_simulate.add_argument("--config", required=True, help="Ścieżka do pliku konfiguracyjnego YAML")
    p_simulate.add_argument("--out", required=True, help="Katalog wyjściowy dla raportów symulacji")
    p_simulate.set_defaults(func=cmd_simulate)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
