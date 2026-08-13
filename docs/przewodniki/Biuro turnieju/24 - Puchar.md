---
title: Puchar
tags: [wyniki, biuro, office]
aliases: [Office drabinka, Knockout office]
---

# Biuro — Drabinka (Puchar)

## Cel

Operacje na slotach pucharowych: podgląd gotowości, dodawanie i korekta wyników KO.

## Elementy UI

| Kontrolka | Co robi | Efekt |
|-----------|---------|-------|
| Statystyki (wygenerowane / gotowe / zakończone) | Pille podsumowania | — |
| Karty slotów KO (gracze, wynik, kort, termin) | Podgląd | Debel: etykiety par, ZWSP po `/` |
| **Dodaj wynik** | Modal wyniku KO | `POST …/knockout-matches` — strony to pary, gdy slot debla |
| **Popraw wynik** | Modal korekty | `PUT …/matches/{id}` |

Pusta drabinka: komunikat że puchar nie został jeszcze wygenerowany. Generator KO **pomija** grupy `round_robin`; grupy `knockout` nie mają fazy `Grupowa`.

## E2E

`07_knockout_office.spec.mjs` — zakładka dostępna. `08_walkover_ko_depth.spec.mjs` — walkower KO. `12_group_play_format.spec.mjs` — drzewo po dwóch groups+KO.

## Powiązane

- [[27 - Wprowadzanie i edycja wyniku]]
- [[12 - Drabinka]] (publiczny podgląd)
- [[28 - Debel w biurze]]
- [[42 - Debel - plan implementacji]] (tryb na grupie: tylko puchar / tylko RR / grupy+puchar)
