---
title: Planowanie - terminarz i autoschedule
tags: [wyniki, biuro, office, planowanie]
aliases: [Autoschedule, Office schedule, Terminarz]
---

# Terminarz i planer

## Cel

Mecze na kortach i godzinach, na wiele dni, z publikacją dla widzów.

## Układ

Szyna → **Terminarz**: pasek narzędzi u góry, siatka **godzina × kort** dla wybranego dnia, **inspektor** wybranego meczu po prawej, **szuflada** nieprzypisanych meczów na dole.

## Pasek narzędzi

| Kontrolka | Co robi | API |
|-----------|---------|-----|
| Zakładki dni | Wybór dnia siatki | — |
| **Wyczyść dzień** | Zdejmuje z siatki wszystkie mecze dnia do szuflady; rozegrane i trwające zostają | `POST …/schedule/clear-day` |
| **Zakres** | Faza grupowa / pucharowa / wszystko | — |
| **Start (HH:MM)** / **Koniec (HH:MM)** | Okno dnia dla planera | zapis w konfiguracji |
| **Rozstaw ten dzień** | Wybrany dzień: tyle meczów, ile się zmieści; reszta zostaje w szufladzie | `POST …/autoschedule/generate` (`mode=day`) |
| **Rozstaw fazę grupową** / **Rozstaw fazę pucharową** / **Rozstaw cały turniej** | Wszystkie mecze zakresu od startu do końca dnia, dzień po dniu (najpierw pierwsze dni, żeby na końcu był zapas) | `mode=all` |
| **Zatwierdź terminarz** / **Odrzuć propozycję** | Zastosuj / anuluj podgląd | `POST …/autoschedule/apply` |
| **Generuj mecze** | Mecze grupowe z grup (`groups_knockout` / `round_robin`) | `POST …/schedule/generate` |
| **Rewanże…** | Druga runda dla wybranych grup | `POST …/schedule/generate-rematch` |
| **Opublikuj wszystkie** | Modal: wszystkie dni albo jeden dzień; wpisy robocze stają się publiczne | `POST …/schedule/publish` (`day_date` opcjonalnie) |

Nagłówek kolumny kortu: pigułka **B1** oznacza kort specjalny B1 (przypisanie meczów B1). Czas meczu nie jest w nagłówku kortu — ustawia się go przy kategorii (Grupy startowe) i widać go na karcie meczu. To ten czas liczy plan.

## Zasady planera

- Mecze B1 tylko na kortach B1; pozostałe kategorie na wszystkich pozostałych kortach.
- **Nikt nie gra na dwóch kortach naraz.** Para „A / B” blokuje oboje partnerów, więc zawodnik nie dostanie o tej samej godzinie singla i debla.
- Przerwa między meczami zawodnika jest zachowywana, jeśli kort nie musiałby przez nią stać pusty.
- Rundy pucharowe idą od najszerszej: 1/8 → ćwierćfinały i o miejsca 9–16 → półfinały i o miejsca 5–8 → mecze o miejsca, 3. miejsce, finał. Mecz późniejszej fazy zaczyna się po ostatnim meczu wcześniejszej fazy swojej kategorii (także między dniami).
- Rozegrane i trwające mecze zostają na miejscu i blokują swój czas.
- Mecz, który nie mieści się przed końcem dnia, zostaje w szufladzie; kategoria czeka wtedy z kolejnymi rundami do następnego dnia.
- Korty B1 i okno dnia są zapisane dla turnieju; usunięcie turnieju je czyści.

## Siatka i szuflada

| Akcja | Efekt | API |
|-------|-------|-----|
| Przeciągnij mecz na komórkę | Nowy kort / godzina | `POST …/autoschedule/move` |
| Przeciągnij mecz na szufladę | Zdjęcie z siatki | `POST …/autoschedule/unassign` |
| Zakładki kategorii w szufladzie | Filtr szuflady | — |
| **Usuń wszystkie** | Usuwa wszystkie nieprzypisane mecze (ręczne, rewanże i wygenerowane). Nie wracają same — przywraca je **Generuj mecze** | `DELETE …/schedule/unassigned` |

## Inspektor meczu

Klik w blok na siatce.

| Pole / przycisk | Co robi | API |
|-----------------|---------|-----|
| Czas, kort, status, uwagi publiczne / wewnętrzne | Edycja | `PATCH …/schedule/{id}` |
| **Dodaj wynik** | Modal wyniku (mecz pucharowy: dopiero gdy obaj gracze są znani) | [[27 - Wprowadzanie i edycja wyniku]] |
| **Zapisz** / **Usuń** | Zapis / usunięcie wpisu | PATCH / DELETE |

Statusy: **Roboczy** / **Opublikowany** / **W trakcie** / **Zakończony**.

## E2E

`03_schedule_publish`, `05_rematch`, `19_office_autoschedule` — podstawy. `27_publish_modal` — modal **Opublikuj**: jeden dzień albo wszystkie, Anuluj zostawia szkice. `21_full_tournament_office` — dni, szuflada, przeciąganie, **Wyczyść dzień**, **Usuń wszystkie**. `22_lifecycle_wbtc_scale` — skala Wilna: 152 mecze grupowe na 3 dni i 146 pucharowych na 4 dni, bez podwójnych rezerwacji (także singiel + debel).

## Powiązane

- [[25 - Planowanie - grupy]]
- [[24 - Puchar]]
- [[13 - Terminarz]] (publiczny odczyt)
- [[28 - Debel w biurze]]
