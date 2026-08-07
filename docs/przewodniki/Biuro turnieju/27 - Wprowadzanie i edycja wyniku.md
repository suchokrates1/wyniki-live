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
| **Typ meczu** | Grupowy vs pucharowy |
| **Grupa** | Przy typie grupowym |
| **Faza pucharowa** | Search + datalist slotów KO |
| **Walkower** + zwycięzca | WO zamiast setów |
| **Zawodnik A / B** | Wybór graczy |
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

## Powiązane

- [[22 - Historia]]
- [[24 - Puchar]]
- [[26 - Planowanie - terminarz i autoschedule]]
