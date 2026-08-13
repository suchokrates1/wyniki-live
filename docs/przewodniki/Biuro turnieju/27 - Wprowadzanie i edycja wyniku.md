---
title: Wprowadzanie i edycja wyniku
tags: [wyniki, biuro, office]
aliases: [Add result, Edit match office]
---

# Wprowadzanie i edycja wyniku (biuro)

## Cel

Ręczne dodanie wyniku (gdy nie idzie z aplikacji sędziowskiej) oraz korekta istniejącego.

## Modal: Nowy wynik

| Pole | Znaczenie |
|------|-----------|
| **Typ meczu** | Grupowy vs pucharowy vs rewanż |
| **Grupa** | Przy typie grupowym |
| **Faza pucharowa** | Search + datalist slotów KO |
| **Walkower** + zwycięzca | WO zamiast setów (zwycięzca = osoba albo para) |
| **Zawodnik A / B** albo **Para A / B** | Singiel: osoby. Debel: `officeFormUsesTeams` → pary z `display_name` |
| Set 1 / Set 2 / Super tie-break | Pary liczb |
| **Anuluj** / **Zamknij** | Zamknięcie |
| **Zapisz wynik** | `POST …/group-matches` lub `…/knockout-matches` |

## Modal: Korekta

| Pole | Znaczenie |
|------|-----------|
| Sety A/B + STB | Poprawka |
| **Zapisz korektę** | `PUT …/matches/{id}` |

## Skąd otworzyć

- Przycisk **Dodaj wynik** w chrome
- **Popraw wynik** w Historii / Drabince
- **Dodaj wynik** na karcie terminarza

W deblu `player1_name` / `player2_name` w payloadzie to kanoniczne etykiety par. 409, gdy slot terminarza ma już mecz.

## E2E

`04_results_crud.spec.mjs` — modal singla (sety + korekta). `08_walkover_ko_depth.spec.mjs` — walkower KO. `13_office_doubles_result.spec.mjs` — WO + korekta API na parach. `20_office_result_modal_teams.spec.mjs` — UI **Para A / Para B**.

## Powiązane

- [[22 - Historia]]
- [[24 - Puchar]]
- [[26 - Planowanie - terminarz i autoschedule]]
- [[28 - Debel w biurze]]
- [[42 - Debel - plan implementacji]]
