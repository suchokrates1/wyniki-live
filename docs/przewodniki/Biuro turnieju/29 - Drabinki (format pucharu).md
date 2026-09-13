---
title: Drabinki (format pucharu)
tags: [wyniki, biuro, office]
aliases: [Office drabinki, Format drabinki, Krok 2 biura]
---

# Biuro — Drabinki (krok 2)

## Cel

Po utworzeniu grup, a przed terminarzem, biuro decyduje, jak dla każdej kategorii powstanie faza pucharowa: format, mecze o miejsca, pocieszenie i ewentualne ręczne poprawki pierwszej rundy. Podgląd pokazuje dokładnie te mecze, które trafią do terminarza.

## Kiedy

- Krok 2 staje się bieżący, gdy wszyscy zawodnicy są w grupach (krok 1 gotowy). Pasek „Następny krok” prowadzi przyciskiem **Przejdź do drabinek**.
- Krok jest gotowy, gdy wszystkie kategorie są zatwierdzone (kategorie bez fazy pucharowej liczą się same). W widoku Drabinki pasek ma przycisk **Zatwierdź wszystkie**.
- Nic nie jest blokowane: terminarz można układać wcześniej. Zmiana formatu przebudowuje mecze pucharowe kategorii w terminarzu.

## Elementy UI

| Kontrolka | Co robi | Efekt |
|-----------|---------|-------|
| Lista kategorii | Grupy (np. „grup: 4 · 3/3/3/3 os.”), format, liczba meczów, stan: **domyślny**, **zmienione**, **✓ zatwierdzone**, **bez drabinki**, **trwa** | wybór kategorii |
| Karty formatu | **Finał z tabeli** (1 grupa), **Półfinały krzyżowe** (2 grupy), **Drabinka główna** (3+ grup), **Sama drabinka** (kategoria bez grup, np. debel), **Bez drabinki** | Pasujący do liczby grup format jest domyślny; pozostałe są wyłączone |
| **Awansuje z każdej grupy** (1/2/3) | Tylko drabinka główna; nie więcej niż najmniejsza grupa | pozostali trafiają do pocieszenia |
| **Mecze o miejsca**: Wszystkie / Tylko o 3. / Brak | Czy przegrani grają dalej o miejsca 5–8, 9–16… | liczba meczów |
| **Grają drabinkę pocieszenia** | Tylko drabinka główna | osobna drabinka dla dalszych miejsc z grup |
| Podgląd: **Drabinka główna / O miejsca / Pocieszenie** | Rundy z wolnymi losami; ★ = rozstawiony; przed końcem grup pozycje to miejsca z tabel (A1, B2…) | — |
| Kliknięcie dwóch pozycji pierwszej rundy | Zamiana miejsc (także na wolny los); oznaczenie ⇄ | ostrzeżenie **⚠ Meczów graczy z jednej grupy w 1. rundzie** |
| **Przywróć automatyczne (n)** | Cofa wszystkie zamiany | — |
| **Zatwierdź {kategoria}** | Zapisuje format; przy zmianie przebudowuje mecze pucharowe kategorii | `PUT …/knockout-formats/{category_id}` |
| **Zatwierdź wszystkie** (pasek) | Zatwierdza bieżące formaty wszystkich kategorii | `POST …/knockout-formats/confirm-all` |

Niezapisane zmiany są oznaczone **Niezapisane zmiany**; odświeżenie danych w tle ich nie kasuje.

## Blokada

Po pierwszym wyniku meczu pucharowego w kategorii jej format jest zablokowany (stan **trwa**, karty wyłączone, API zwraca 409). Zamiany graczy robi się wtedy w widoku [[24 - Puchar]].

## API

- `GET /api/office/<slot>/knockout-formats` — kategorie z dozwolonymi formatami, zapisanym ustawieniem i podglądem.
- `POST /api/office/<slot>/knockout-formats/preview` `{category_id, config}` — podgląd niezapisanego ustawienia.
- Ustawienia są w `app_settings` pod kluczem `knockout_formats:<tournament_id>`; usuwane razem z turniejem.

## E2E

`25_office_draws.spec.mjs` (domyślny podgląd, mecze o miejsca, pocieszenie, zamiana i ostrzeżenie, odświeżenie w trakcie edycji, zatwierdzenie = liczba meczów w terminarzu, blokada po wyniku), `21_full_tournament_office.spec.mjs` (krok 2 na ścieżce). Backend: `test_knockout_formats.py`.

## Powiązane

- [[25 - Planowanie - grupy]]
- [[26 - Planowanie - terminarz i autoschedule]]
- [[24 - Puchar]]
