"""Proste testy jednostkowe walidatora."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from ebon_orchestrator.validator import _validate_pesel, _validate_email, _validate_phone, validate_record


def test_valid_pesel():
    assert _validate_pesel("90010112345") is False
    assert _validate_pesel("abcdefghijk") is False


def test_email():
    assert _validate_email("test@example.com") is True
    assert _validate_email("not-an-email") is False
    assert _validate_email("user@domain.pl") is True


def test_phone():
    assert _validate_phone("+48600000001") is True
    assert _validate_phone("600000001") is True
    assert _validate_phone("123") is False


def test_missing_fields():
    record = {"imie": "Anna", "nazwisko": "Kowalska"}
    result = validate_record(2, record)
    assert result.ok is False
    assert any("pesel" in e for e in result.errors)


def test_ok_record():
    record = {
        "imie": "Anna",
        "nazwisko": "Testowa",
        "pesel": "02070803628",
        "email": "anna@test.pl",
        "telefon": "+48600000001",
        "adres": "ul. Testowa 1",
        "kod_pocztowy": "00-001",
        "miasto": "Warszawa",
        "login_portal": "anna@test.pl",
    }
    result = validate_record(2, record)
    assert result.ok is True


if __name__ == "__main__":
    test_email()
    test_phone()
    test_missing_fields()
    test_ok_record()
    print("Wszystkie testy zakończone pomyślnie.")
