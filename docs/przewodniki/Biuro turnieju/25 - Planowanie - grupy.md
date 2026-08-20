---
title: Planowanie - grupy
tags: [wyniki, biuro, office, planowanie]
aliases: [Office groups, Krok 1 grupy]
---

# Planowanie — grupy (krok 1)

## Cel

Kategorie, zawodnicy i przypisanie do grup startowych.

## Wejście

Zakładka **Plan turnieju** → krok **Grupy startowe**. Przycisk **Odśwież plan** → `GET …/planning`.

## Kategorie

| Kontrolka | Co robi | API |
|-----------|---------|-----|
| Presety (np. B1–B4 K/M) | Zaznaczenie + opcjonalny checkbox **Debel** | — |
| Pola kategorii niestandardowej | Nazwa + wskazówki + **Debel** | — |
| **Zatwierdź kategorie** | Potwierdzenie zestawu (`is_doubles` na wpisie) | `POST …/categories/confirm` |
| **Anuluj** | Zamknięcie setupu | — |
| **+ Dodaj kategorię** / **Edytuj** / **Usuń** / **Zapisz** | CRUD | `POST/PATCH/DELETE …/categories` |
| Badge **Debel** na chipie kategorii | Oznaczenie Double | Odczyt |

## Zawodnicy

| Kontrolka | Co robi | API |
|-----------|---------|-----|
| Formularz **+ Dodaj zawodnika** (Imię, Nazwisko, kategoria, płeć, kraj) | Nowy gracz turnieju | `POST …/players` |

## Pary (kategoria Debel)

| Kontrolka | Co robi | API |
|-----------|---------|-----|
| **+ Dodaj drużynę** | Partner 1 + Partner 2. Lista: klasa wzrokowa kategorii (Filtr) albo wszyscy; osoby już w grupach singla są dostępne; para może być K, M albo mix | `POST …/teams` → `display_name` |
| Lista par / **Usuń parę** | CRUD | `DELETE …/teams/{id}` (zablokowane, gdy para jest w grupie) |

## Grupy

| Kontrolka | Co robi | API |
|-----------|---------|-----|
| Chipy dywizji / kategorii | Wybór działu; badge **Debel** | — |
| Licznik grup − / + (1–8) | Liczba grup | — |
| **Przypisz wszystkich** / **Rozdziel automatycznie** | Auto-assign osób | Potem auto-zapis grup |
| **Przypisz wszystkie pary** / **Rozdziel pary** | Auto-assign drużyn | Jak wyżej, przy Double |
| **Wyczyść** | Czyści przypisania | — |
| **Filtr** / **Wszyscy** (domyślnie Filtr) | Pula „Do wylosowania”: tylko klasa wybranej kategorii (np. B1 Women) albo wszyscy nieprzypisani | — |
| Drag & drop graczy **albo par** do grup | Ręczny układ | Auto `PUT …/planning/groups` |
| Dropdown **Tryb rozgrywek** na karcie | `groups_knockout` / `round_robin` / `knockout` | Zapis z grupami; blokada gdy grupa ma mecze |

Kafelek kategorii pokazuje liczbę zawodników **pasujących do klasy** (np. B1 Women), nie wszystkich w turnieju. **Przypisz wszystkich** / **Rozdziel automatycznie** bierze pulę z aktualnego filtra.

Kafelek planu przy Double pokazuje **Pary**, nie zawodników. Szczegóły trybu: [[28 - Debel w biurze]].

## E2E

`02_groups_draw.spec.mjs` — grupy singla. `11_doubles_category_teams.spec.mjs` / `12_group_play_format.spec.mjs` — pary i tryb. `18_office_planning_ui.spec.mjs` — confirm Debel + dodaj parę z UI.

## Powiązane

- [[26 - Planowanie - terminarz i autoschedule]]
- [[36 - Gracze turnieju i import]] (admin — masowy import **osób**; pary składa biuro)
- [[28 - Debel w biurze]]
- [[42 - Debel - plan implementacji]]
