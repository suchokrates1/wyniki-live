---
title: Historia
tags: [wyniki, biuro, office]
aliases: [Office historia, Ostatnie mecze]
---

# Biuro — Ostatnie mecze (Historia)

## Cel

Podgląd zakończonych meczów i szybka korekta wyniku.

## Elementy UI

| Kontrolka | Co robi | Efekt |
|-----------|---------|-------|
| Karty meczów (scoreboard) | Podgląd | Z dashboardu; debel: `formatCompetitorName` łamie `"A / B"` |
| **Popraw wynik** | Otwiera modal korekty | [[27 - Wprowadzanie i edycja wyniku]] |
| Sidebar: chipy ukończenia grup | Progress grup | Odczyt; kompletność RR vs puchar zależy od `play_format` |

## E2E

`04_results_crud.spec.mjs` — dodaj + popraw (singiel). `13_office_doubles_result.spec.mjs` — historia par po walkowerze i korekcie.

## Powiązane

- [[21 - Chrome i quick-info]]
- [[27 - Wprowadzanie i edycja wyniku]]
- [[28 - Debel w biurze]]
