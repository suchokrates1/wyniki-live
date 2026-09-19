---
title: Na żywo - korty
tags: [wyniki, publiczna, live]
aliases: [Wyniki live, Live scores]
---

# Na żywo — korty

## Cel

Podgląd aktualnych meczów na kortach w czasie rzeczywistym (SSE).

## Wejście

Zakładka **Na żywo** → podzakładka **Wyniki live** (`#live` / `#live/scores`).

## Elementy UI

| Element | Co robi | Efekt |
|---------|---------|-------|
| Podnav: **Wyniki live** / **Drabinka** / **Terminarz** / **Historia** | Zmiana widoku | Hash routing |
| Karty kortów | Wynik: flagi (w deblu też flaga partnera, gdy narodowość inna), piłka serwisu, punkty, sety, TB/STB, zegar | Tylko odczyt; nazwy z `/` nie są obcinane do jednego nazwiska |
| Nazwa kortu + ikona Play | Gdy biuro/admin wpisze URL transmisji na **dzisiejszy** dzień i ten kort | Otwiera stream w nowej karcie; link sam się podmienia o północy (Europe/Warsaw) |
| Stan pusty **Brak aktywnych kortów** | Info | — |
| Linki SR `#kort-{id}` | Skok do kortu | A11y |

Brak przycisków akcji na kartach — widok read-only.

## Dane

- `GET /api/snapshot` + SSE `/api/stream`
- `watch_url` na korcie = URL z siatki dzień × kort na datę dzisiejszą (Warszawa), albo wspólny URL dnia gdy włączono jeden stream na wszystkie korty

## Powiązane

- [[12 - Drabinka]]
- [[13 - Terminarz]]
- [[14 - Historia meczów]]
