# EBON — bezpieczny pakiet operacyjno-testowy

Pakiet CLI do przygotowania, walidacji, planowania i symulacji procesu składania wniosków przez uczestniczki naboru.

## Struktura projektu

```
ebon_bezpieczny_pakiet/
├── src/ebon_orchestrator/   # Kod CLI (validate, plan, simulate)
├── data/                    # Szablon CSV uczestniczek
├── config/                  # Przykładowa konfiguracja YAML
├── docs/                    # Runbook, mapa ekranów, rejestr ryzyk, checklista
├── scheduler/               # Przykłady cron i systemd timer
├── tests/                   # Testy jednostkowe
└── sample_output/           # Przykładowe wyniki działania
```

## Szybki start

```bash
cd ebon_bezpieczny_pakiet
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export PYTHONPATH=src

# Walidacja
python -m ebon_orchestrator.cli validate \
  --csv data/participants_template.csv \
  --out sample_output/validate

# Plan działań
python -m ebon_orchestrator.cli plan \
  --csv data/participants_template.csv \
  --start 2026-04-10T16:00:00+02:00 \
  --workers 3 \
  --spacing-sec 2 \
  --out sample_output/plan

# Symulacja ekran po ekranie
python -m ebon_orchestrator.cli simulate \
  --csv data/participants_template.csv \
  --config config/config.example.yaml \
  --out sample_output/simulate
```

## Tryby pracy

| Tryb       | Opis                                                                 |
|------------|----------------------------------------------------------------------|
| `validate` | Sprawdza kompletność i poprawność danych uczestniczek               |
| `plan`     | Generuje harmonogram działań z checklistą operacyjną                |
| `simulate` | Symuluje ścieżkę przez portal ekran po ekranie — bez wysyłania      |

> **Ważne:** Symulacja zatrzymuje się przed wysłaniem wniosku. Każda uczestniczka składa wniosek samodzielnie na swoim koncie.

## Bezpieczeństwo

- Nie przechowuj haseł ani pełnych identyfikatorów w plikach CSV
- Wyniki walidacji i harmonogramy trzymaj w bezpiecznym repozytorium
- Raporty z danymi uczestniczek usuń lub zanonimizuj po zakończeniu naboru
