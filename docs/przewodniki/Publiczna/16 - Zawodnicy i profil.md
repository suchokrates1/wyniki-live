---
title: Zawodnicy i profil
tags: [wyniki, publiczna]
aliases: [Players public, Player profile]
---

# Zawodnicy i profil

## Cel

Katalog zawodników z filtrami oraz profil kariery (statystyki, medale, historia turniejowa).

## Wejście

Zakładka **Zawodnicy** (`#players`). Profil: `#players/global/{id}` lub `#players/local/{id}`.

## Lista / filtry

| Kontrolka | Co robi | Efekt |
|-----------|---------|-------|
| **Szukaj zawodnika…** | Filtr tekstowy | Lokalnie na liście z `/api/players/all` |
| **Wszyscy** / **Mężczyźni** / **Kobiety** | Filtr płci | — |
| Dropdown krajów | Filtr kraju | — |
| Dropdown kategorii | Filtr B1–… | — |
| Karta zawodnika (W/L) | Otwórz profil | `GET /api/players/{id}/profile` |

## Profil

| Element | Co robi |
|---------|---------|
| **Powrót do listy** | Czyści profil, aktualizuje hash |
| Zdjęcie / flaga / dane | Odczyt |
| Statystyki kariery / medale | Odczyt |
| Nagłówek turnieju (rozwijany) | `toggleProfileTournament` — mecze w turnieju |

## Powiązane

- [[35 - Zawodnicy globalni]] (admin — edycja bazy)
- [[10 - Strona publiczna - przegląd]]
