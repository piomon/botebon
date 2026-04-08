# Rejestr ryzyk — EBON

| ID  | Ryzyko                                        | Prawdopodobieństwo | Wpływ   | Mitygacja                                               |
|-----|-----------------------------------------------|--------------------|---------|---------------------------------------------------------|
| R01 | Portal niedostępny w momencie startu naboru   | Średnie            | Wysoki  | Monitorować dostępność 30 min przed startem             |
| R02 | Błędy w danych uczestniczek (CSV)             | Niskie             | Wysoki  | Uruchomić `validate` dzień wcześniej i 60 min przed    |
| R03 | Problemy z logowaniem do portalu              | Niskie             | Wysoki  | Każda uczestniczka testuje login dzień przed naborem    |
| R04 | Formularz portalu zmienia się między testami  | Niskie             | Średni  | Uruchomić `simulate` jak najbliżej daty naboru          |
| R05 | Przeciążenie portalu w chwili startu          | Średnie            | Średni  | Rozłożyć zgłoszenia w czasie — plan ze `spacing-sec`   |
| R06 | Utrata połączenia z Internetem                | Niskie             | Wysoki  | Przygotować rezerwowe łącze (hotspot)                   |
| R07 | Wyciek danych uczestniczek                    | Niskie             | Wysoki  | Nie przechowywać haseł w CSV; szyfrowane repo           |
| R08 | Uczestniczka nie wysyła wniosku na czas       | Niskie             | Wysoki  | Dedykowana asystentka monitoruje każde zgłoszenie       |
