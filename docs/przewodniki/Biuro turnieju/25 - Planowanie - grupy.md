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
| Presety (np. B1–B4 K/M) | Zaznaczenie | — |
| Pola kategorii niestandardowej | Nazwa + wskazówki | — |
| **Zatwierdź kategorie** | Potwierdzenie zestawu | `POST …/categories/confirm` |
| **Anuluj** | Zamknięcie setupu | — |
| **+ Dodaj kategorię** / **Edytuj** / **Usuń** / **Zapisz** | CRUD | `POST/PATCH/DELETE …/categories` |

## Zawodnicy

| Kontrolka | Co robi | API |
|-----------|---------|-----|
| Formularz **+ Dodaj zawodnika** (Imię, Nazwisko, kategoria, płeć, kraj) | Nowy gracz turnieju | `POST …/players` |

## Grupy

| Kontrolka | Co robi | API |
|-----------|---------|-----|
| Chipy dywizji / kategorii | Wybór działu | — |
| Licznik grup − / + (1–8) | Liczba grup | — |
| **Przypisz wszystkich** / **Rozdziel automatycznie** | Auto-assign | Potem auto-zapis grup |
| **Wyczyść** | Czyści przypisania | — |
| Drag & drop graczy do grup | Ręczny układ | Auto `PUT …/planning/groups` |

## Powiązane

- [[26 - Planowanie - terminarz i autoschedule]]
- [[36 - Gracze turnieju i import]] (admin — masowy import)
