---
title: Plan turnieju
tags: [wyniki, admin, planowanie]
aliases: [Admin planning]
---

# Admin — Plan turnieju

## Cel

Przypisywanie do grup i zarządzanie terminarzem z poziomu Admin (równolegle do biura, prostszy UI).

## Grupy

| Kontrolka | Co robi | API |
|-----------|---------|-----|
| Select turnieju + **Odśwież** | Ładuje dane | players, groups, schedule, courts |
| Select kategorii + liczba grup | Setup dywizji | — |
| Select grupy przy zawodniku | Przypisanie | — |
| **Zapisz grupy** | Zapis | `PUT …/bracket/groups` |
| **Przypisz wszystkich** / **Rozdziel** / **Wyczyść** | Pomocnicze | — |

## Terminarz

| Kontrolka | Co robi | API |
|-----------|---------|-----|
| **Generuj mecze** | Generacja | `POST …/schedule/generate` |
| Filtry: Dzień / Kategoria / Kort | Widok | Client |
| Formularz nowego wpisu + **Dodaj** | Ręczny mecz | `POST …/schedule` |
| Wiersz **Zapisz** / **Usuń** | Edycja | `PATCH` / `DELETE …/schedule/{id}` |

## Powiązane

- [[25 - Planowanie - grupy]]
- [[26 - Planowanie - terminarz i autoschedule]]
