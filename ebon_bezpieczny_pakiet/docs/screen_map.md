# Mapa ekranów portalu — ścieżka aplikacyjna

Poniżej przedstawiono kolejność ekranów symulowanych przez tryb `simulate`.

```
┌──────────────────────────────────────────────────────────────┐
│  1. logowanie                                                │
│     URL: /logowanie                                          │
│     Akcja: Wpisanie loginu i hasła przez uczestniczkę        │
└──────────────────┬───────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────┐
│  2. strona_glowna                                            │
│     URL: /                                                   │
│     Akcja: Przejście do sekcji Rekrutacja                    │
└──────────────────┬───────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────┐
│  3. rekrutacja_lista                                         │
│     URL: /rekrutacja                                         │
│     Akcja: Wybór odpowiedniego naboru z listy                │
└──────────────────┬───────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────┐
│  4. wybor_naboru                                             │
│     URL: /rekrutacja/{id}                                    │
│     Akcja: Potwierdzenie wyboru naboru, start formularza     │
└──────────────────┬───────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────┐
│  5. formularz_dane_osobowe                                   │
│     URL: /formularz/dane-osobowe                             │
│     Akcja: Wypełnienie danych osobowych                      │
└──────────────────┬───────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────┐
│  6. formularz_dokumenty                                      │
│     URL: /formularz/dokumenty                                │
│     Akcja: Dodanie wymaganych dokumentów/załączników         │
└──────────────────┬───────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────┐
│  7. formularz_oswiadczenia                                   │
│     URL: /formularz/oswiadczenia                             │
│     Akcja: Zaznaczenie wymaganych oświadczeń                 │
└──────────────────┬───────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────┐
│  8. podglad_wniosku                                          │
│     URL: /formularz/podglad                                  │
│     Akcja: Sprawdzenie kompletności wniosku                  │
└──────────────────┬───────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────┐
│  ⚑  WYMAGANE_RECZNE_WYSLANIE                                 │
│     Symulacja ZATRZYMUJE SIĘ tutaj.                          │
│     Uczestniczka samodzielnie klika "Wyślij wniosek".        │
└──────────────────────────────────────────────────────────────┘
```

> **Ważne:** Tryb `simulate` nigdy nie klika przycisku wysyłania wniosku.
> Ostateczna decyzja o złożeniu wniosku należy zawsze do uczestniczki.
