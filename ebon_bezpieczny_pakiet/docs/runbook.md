# EBON — Runbook operacyjny

## Cel

Pakiet EBON służy do przygotowania, walidacji i planowania procesu składania wniosków przez uczestniczki naboru. Każda uczestniczka składa wniosek samodzielnie na swoim własnym koncie portalu. Pakiet **nie** automatyzuje logowania ani wysyłania wniosków — końcowy krok wymaga ręcznego potwierdzenia przez uczestniczkę.

---

## Harmonogram działań (przykład: start naboru 10.04.2026 godz. 16:00)

| Czas        | Działanie                                                     |
|-------------|---------------------------------------------------------------|
| D-1         | Zebranie danych uczestniczek, wypełnienie CSV                 |
| D-1         | `validate` — pierwsza walidacja danych                        |
| D-1         | Przekazanie checklist uczestniczkom                           |
| 10.04 15:00 | `validate` — ponowna walidacja (60 min przed startem)         |
| 10.04 15:55 | `plan` — generowanie harmonogramu i kolejności działań        |
| 10.04 16:00 | START NABORU — każda uczestniczka loguje się i składa wniosek |
| Po złożeniu | Zapis zrzutu ekranu, godziny, statusu                         |

---

## Kroki szczegółowe

### 1. Przygotowanie danych

- Wypełnij `data/participants_template.csv` danymi uczestniczek.
- **Nie przechowuj haseł ani pełnych danych wrażliwych w plikach CSV.**
- Każda uczestniczka zna swój login i hasło do portalu — nie jest potrzebne ich udostępnianie w pliku.

### 2. Walidacja

```bash
python -m ebon_orchestrator.cli validate \
  --csv data/participants_template.csv \
  --out sample_output/validate
```

- Sprawdza kompletność pól, format PESEL, e-mail, telefon.
- Generuje `validate_report.json` i `validate_report.csv`.
- Kod wyjścia `0` = brak błędów, `1` = są błędy.

### 3. Planowanie

```bash
python -m ebon_orchestrator.cli plan \
  --csv data/participants_template.csv \
  --start 2026-04-10T16:00:00+02:00 \
  --workers 3 \
  --spacing-sec 2 \
  --out sample_output/plan
```

- Generuje `plan.json`, `plan.csv`, `checklist.md`.
- Harmonogram rozdziela uczestniczki na sloty robocze.

### 4. Symulacja

```bash
python -m ebon_orchestrator.cli simulate \
  --csv data/participants_template.csv \
  --config config/config.example.yaml \
  --out sample_output/simulate
```

- Symuluje przejście przez ekrany portalu ekran po ekranie.
- **Zatrzymuje się przed wysłaniem** — wymagane ręczne działanie uczestniczki.
- Generuje `simulate_report.json` i `simulate_report.csv`.

### 5. Dzień naboru

- Każda uczestniczka loguje się na swoje konto portalu.
- Przechodzi przez formularz zgodnie z instrukcją.
- **Samodzielnie zatwierdza i wysyła wniosek.**
- Zapisuje zrzut ekranu potwierdzenia ze statusem i godziną.

---

## Bezpieczeństwo danych

- Nie przechowuj haseł w plikach konfiguracyjnych ani CSV.
- Wyniki walidacji i plany przechowuj w bezpiecznym repozytorium z kontrolą dostępu.
- Raporty z danymi uczestniczek usuń po zakończeniu naboru lub zanonimizuj.
