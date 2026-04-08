"""Walidacja rekordów uczestników przed naborem."""

from __future__ import annotations

import csv
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


REQUIRED_FIELDS = [
    "imie",
    "nazwisko",
    "pesel",
    "email",
    "telefon",
    "adres",
    "kod_pocztowy",
    "miasto",
    "login_portal",
]


@dataclass
class ValidationResult:
    row_index: int
    imie: str
    nazwisko: str
    ok: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "row": self.row_index,
            "imie": self.imie,
            "nazwisko": self.nazwisko,
            "ok": self.ok,
            "errors": self.errors,
            "warnings": self.warnings,
        }


def _validate_pesel(pesel: str) -> bool:
    """Podstawowa walidacja sumy kontrolnej PESEL."""
    if not re.fullmatch(r"\d{11}", pesel):
        return False
    weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3]
    total = sum(int(pesel[i]) * weights[i] for i in range(10))
    check = (10 - (total % 10)) % 10
    return check == int(pesel[10])


def _validate_email(email: str) -> bool:
    pattern = r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$"
    return bool(re.match(pattern, email))


def _validate_phone(phone: str) -> bool:
    cleaned = re.sub(r"[\s\-]", "", phone)
    return bool(re.fullmatch(r"(\+48)?\d{9}", cleaned))


def validate_record(row_index: int, record: dict[str, str]) -> ValidationResult:
    imie = record.get("imie", "").strip()
    nazwisko = record.get("nazwisko", "").strip()
    result = ValidationResult(row_index=row_index, imie=imie, nazwisko=nazwisko, ok=True)

    for field_name in REQUIRED_FIELDS:
        val = record.get(field_name, "").strip()
        if not val:
            result.errors.append(f"Brak wymaganego pola: '{field_name}'")

    pesel = record.get("pesel", "").strip()
    if pesel and not _validate_pesel(pesel):
        result.errors.append(f"Nieprawidłowy PESEL: '{pesel}'")

    email = record.get("email", "").strip()
    if email and not _validate_email(email):
        result.errors.append(f"Nieprawidłowy adres e-mail: '{email}'")

    phone = record.get("telefon", "").strip()
    if phone and not _validate_phone(phone):
        result.warnings.append(f"Podejrzany numer telefonu: '{phone}'")

    login = record.get("login_portal", "").strip()
    if login and not _validate_email(login):
        result.warnings.append(f"Login portalu nie wygląda jak adres e-mail: '{login}'")

    if result.errors:
        result.ok = False

    return result


def validate_csv(csv_path: Path) -> list[ValidationResult]:
    results: list[ValidationResult] = []
    with csv_path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for i, row in enumerate(reader, start=2):
            results.append(validate_record(i, dict(row)))
    return results


def save_validate_report(results: list[ValidationResult], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    summary = {
        "total": len(results),
        "ok": sum(1 for r in results if r.ok),
        "errors": sum(1 for r in results if not r.ok),
        "records": [r.to_dict() for r in results],
    }

    json_path = out_dir / "validate_report.json"
    json_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    csv_path = out_dir / "validate_report.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["row", "imie", "nazwisko", "ok", "errors", "warnings"])
        for r in results:
            writer.writerow([
                r.row_index,
                r.imie,
                r.nazwisko,
                "TAK" if r.ok else "NIE",
                "; ".join(r.errors),
                "; ".join(r.warnings),
            ])

    print(f"[validate] Wyniki zapisano w: {out_dir}")
    print(f"[validate] Razem: {summary['total']} | OK: {summary['ok']} | Błędy: {summary['errors']}")
