---
title: Gracze turnieju i import
tags: [wyniki, admin, zawodnicy, import]
aliases: [Tournament players, Import graczy]
---

# Admin — Gracze turnieju i import

## Cel

Lista graczy konkretnego turnieju, dodawanie pojedyncze oraz masowy import z tekstu.

## Elementy UI

| Kontrolka | Co robi | API |
|-----------|---------|-----|
| Select turnieju | Kontekst | `GET …/tournaments/{id}/players` |
| Formularz: Imię, Nazwisko, Kategoria, Płeć (K/M), Kraj → **Dodaj gracza** | Pojedynczy | `POST …/players` |
| Textarea importu → **Analizuj i pokaż podsumowanie** | Parsowanie | `POST …/players/parse-import` |
| Modal: edycja wierszy / **Usuń** / **Zatwierdź import** / **Anuluj** | Bulk | `POST …/players/bulk` |
| Edycja / usuwanie wiersza | CRUD | `PUT` / `DELETE …/players/{id}` |

> [!tip]
> Import wspiera asystowane rozpoznawanie (m.in. flagi). Przed **Zatwierdź import** sprawdź podgląd wierszy.

Import CSV zostaje na **osobach**. Pary składa biuro / plan admina w kategorii Debel — [[28 - Debel w biurze]].

## Powiązane

- [[25 - Planowanie - grupy]]
- [[35 - Zawodnicy globalni]]
- [[28 - Debel w biurze]]
