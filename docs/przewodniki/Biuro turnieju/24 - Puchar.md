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
| Statystyki (wygenerowane / gotowe / zakończone) | Podsumowanie | — |
| Karty slotów KO (gracze, wynik, kort, termin) | Podgląd | — |
| **Dodaj wynik** | Modal wyniku KO | `POST …/knockout-matches` |
| **Popraw wynik** | Modal korekty | `PUT …/matches/{id}` |

## Powiązane

- [[27 - Wprowadzanie i edycja wyniku]]
- [[12 - Drabinka]] (publiczny podgląd)
