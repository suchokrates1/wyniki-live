---
title: Wprowadzanie i edycja wyniku
tags: [wyniki, biuro, office]
aliases: [Add result, Edit match office, Krecz, Walkower]
---

# Wprowadzanie i edycja wyniku (biuro)

## Cel

Ręczne dodanie wyniku (gdy nie idzie z aplikacji sędziowskiej) oraz korekta istniejącego.

## Modal: Nowy wynik

| Pole | Znaczenie |
|------|-----------|
| **Typ meczu** | Grupowy / pucharowy / rewanż |
| **Grupa**, **Zawodnik A / B** albo **Para A / B** | Przy wyniku z paska górnego; z terminarza i drabinki są już wypełnione |
| **Walkower** + **Zwycięzca walkowerem** | Wynik bez gry: zwycięzca 2:0 w setach (4:0, 4:0) |
| **Krecz** + **Kto skreczował** | Mecz przerwany: wpisz sety do chwili przerwania; ostatni, niedokończony set jest zapisany, ale nie liczy się jako wygrany. Zwycięzcą jest przeciwnik |
| Set 1 / Set 2 | Gemy A/B |
| **Tie-break: punkty przegranego** | Przy secie wygranym tie-breakiem (np. 4:3, przegrany TB 5) |
| **Super tie-break** | Trzeci „set” (np. 10:7) — liczy się jako set, gemy STB nie wchodzą do tabeli |
| **Zapisz wynik** | `POST …/group-matches` lub `…/knockout-matches` |

Walkower i krecz wykluczają się nawzajem.

## Tabela grupy

Kolejność: wygrane → różnica setów → różnica gemów. O zwycięzcy decyduje zapisany zwycięzca meczu (walkower, krecz), a nie same gemy.

## Modal: Korekta

**Popraw wynik** (Ostatnie mecze, Drabinka) → sety, TB, STB, a także zmiana na walkower lub krecz → **Zapisz korektę** (`PUT …/matches/{id}`).

W fazie pucharowej zmiana zwycięzcy przesuwa nowych graczy w następnych meczach; jeśli następny mecz ma już wynik, korekta jest zablokowana (**Najpierw popraw wynik meczu …**). Szczegóły: [[24 - Puchar]].

## Skąd otworzyć

- **Dodaj wynik** w pasku górnym
- **Dodaj wynik** w inspektorze meczu w terminarzu — nazwy graczy bierze z aktualnej drabinki; w meczu pucharowym przycisk pokazuje się dopiero, gdy obaj gracze są znani
- **Dodaj wynik** / **Popraw wynik** na karcie w Drabince
- **Popraw wynik** w Ostatnich meczach

W deblu `player1_name` / `player2_name` to etykiety par. 409, gdy slot terminarza ma już mecz.

## E2E

`04_results_crud`, `08_walkover_ko_depth`, `13_office_doubles_result`, `20_office_result_modal_teams`. `21_full_tournament_office` — sety, walkower, debel, STB, korekta. `22_lifecycle_wbtc_scale` — wszystkie rodzaje wyników (sety, TB, STB, krecz, walkower) w oknie i przez API, tabele sprawdzane niezależnym przeliczeniem.

## Powiązane

- [[22 - Historia]]
- [[24 - Puchar]]
- [[26 - Planowanie - terminarz i autoschedule]]
- [[28 - Debel w biurze]]
