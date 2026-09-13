---
title: Planowanie - grupy
tags: [wyniki, biuro, office, planowanie]
aliases: [Office groups, Grupy startowe]
---

# Grupy startowe

## Cel

Kategorie, zawodnicy, pary i przypisanie do grup.

## Wejście

Szyna → **Grupy startowe**. Zmiany zapisują się automatycznie (`PUT …/planning/groups`).

## Kategorie

| Kontrolka | Co robi | API |
|-----------|---------|-----|
| Presety (B1–B4 K/M) + checkbox **Debel** | Zaznaczenie zestawu | — |
| Pole kategorii niestandardowej (np. B2 Mixed, B3/4 Mixed) | Nazwa + wskazówki + **Debel** | — |
| **Zatwierdź kategorie** / **Anuluj** | Potwierdzenie zestawu | `POST …/categories/confirm` |
| **+ Dodaj kategorię** / **Edytuj** / **Usuń** / **Zapisz** | CRUD | `POST/PATCH/DELETE …/categories` |

## Zawodnicy

**+ Dodaj zawodnika** (imię, nazwisko, klasa B1–B4, płeć, kraj) → `POST …/players`.

## Pary (kategoria Debel)

| Kontrolka | Co robi | API |
|-----------|---------|-----|
| **+ Dodaj drużynę** | Partner 1 + Partner 2. Deblowcy to ci sami zawodnicy co w singlu — lista obejmuje osoby już rozlosowane w grupach singla. Para: K, M albo mix | `POST …/teams` → `display_name` |
| **Usuń parę** | Usunięcie (zablokowane, gdy para jest w grupie) | `DELETE …/teams/{id}` |

> [!info] Singiel i debel
> Zawodnik z pary nadal musi mieć grupę w swojej kategorii singlowej. Etap grup jest „gotowy” dopiero, gdy wszyscy zawodnicy kategorii singlowych są rozlosowani — także ci, którzy grają w deblu.

## Grupy

| Kontrolka | Co robi |
|-----------|---------|
| Kafelki kategorii | Wybór kategorii; liczba zawodników pasujących do klasy; badge **Debel** |
| **Liczba grup** − / + (1–8) | Ile grup w kategorii. Wybrana liczba nie resetuje się przy odświeżeniu danych |
| **Przypisz wszystkich** / **Rozdziel automatycznie** | Losowanie osób z puli **Do wylosowania** |
| **Przypisz wszystkie pary** / **Rozdziel pary automatycznie** | To samo dla par |
| **Wyczyść** | Czyści przypisania |
| **Filtr** / **Wszyscy** | Pula: tylko klasa wybranej kategorii albo wszyscy nieprzypisani |
| Przeciąganie graczy / par do grup | Ręczny układ |
| **Tryb rozgrywek** na karcie grupy | **Grupy + puchar** / **Tylko każdy z każdym** / **Tylko puchar**; blokada, gdy grupa ma mecze |

Pojedyncza grupa zapisana jako „B1 Mężczyźni — Grupa A” (np. z importu) zachowuje tę nazwę — w biurze i w adminie.

## Zmiana składu grup w trakcie

Zapis grup **nie kasuje terminarza**:

- grupa o tej samej nazwie zachowuje swoje id,
- mecze par, które nadal są w tej samej grupie, zostają z godziną, kortem i notatkami,
- rozegrane mecze zostają i liczą się do postępu grupy,
- znikają tylko nierozegrane mecze par, które przestały istnieć; nowe pary dostają nowe wpisy w szufladzie terminarza.

## E2E

`02_groups_draw.spec.mjs` — grupy singla. `11_doubles_category_teams.spec.mjs`, `12_group_play_format.spec.mjs` — pary i tryb. `18_office_planning_ui.spec.mjs`, `21_full_tournament_office.spec.mjs` — kategorie, zawodnicy, pary i losowanie z UI. Backend: `test_saving_groups_keeps_planned_slots_and_played_matches_of_unchanged_pairs`.

## Powiązane

- [[26 - Planowanie - terminarz i autoschedule]]
- [[36 - Gracze turnieju i import]] (admin — masowy import osób; pary składa biuro)
- [[28 - Debel w biurze]]
