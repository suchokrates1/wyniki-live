---
title: Planowanie - terminarz i autoschedule
tags: [wyniki, biuro, office, planowanie]
aliases: [Autoschedule, Office schedule]
---

# Planowanie — terminarz i autoschedule (krok 2)

## Cel

Generowanie meczów, publikacja, automatyczne / ręczne układanie na kortach.

## Generowanie i publikacja

| Kontrolka | Co robi | API |
|-----------|---------|-----|
| **Generuj mecze** | RR z grup `groups_knockout` / `round_robin`; **pomija** `knockout` | `POST …/schedule/generate` |
| **Generuj rewanże** | Rewanże dla wybranych grup (nie dla KO-only) | `POST …/schedule/generate-rematch` |
| **Opublikuj wszystkie** | Publikacja draftów | `POST …/schedule/publish` |
| Chipy dnia | Filtr dnia | — |

## Autoschedule

| Kontrolka | Co robi | API |
|-----------|---------|-----|
| **Zakres** (Faza grupowa / pucharowa / Wszystko) | Scope propozycji | — |
| **Start (HH:MM)** | Godzina startu | — |
| Checkboxy **Korty B1 (specjalne)** | Oznaczenie kortów | `PUT …/autoschedule/config` |
| **Generuj propozycję** | Podgląd układu | `POST …/autoschedule/generate` |
| **Zatwierdź terminarz** | Zastosuj | `POST …/autoschedule/apply` |
| **Odrzuć propozycję** | Anuluj podgląd | Client |
| DnD między kolumnami kortów | Przesuń mecz | `POST …/autoschedule/move` |
| Drop do nieprzypisanych | Odłącz od kortu | `POST …/autoschedule/unassign` |
| **Usuń wszystkie** (unassigned) | Czyść pulę | `DELETE …/schedule/unassigned` |

## Karty meczów (rozwinięcie)

| Pole / przycisk | Co robi | API |
|-----------------|---------|-----|
| Czas, kort, status, uwagi | Edycja | `PATCH …/schedule/{id}` |
| **Dodaj wynik** | Modal wyniku | [[27 - Wprowadzanie i edycja wyniku]] |
| **Zapisz** | Zapis karty | PATCH |
| **Usuń** / × | Usunięcie wpisu | `DELETE …/schedule/{id}` |

Statusy: **Roboczy** / **Opublikowany** / **W trakcie** / **Zakończony**.

## Ręczny wpis

Formularz **+ Dodaj ręczny wpis**: data, czas, kort, kategoria, faza, status, **gracze albo pary** (dropdown zależy od `is_doubles` kategorii), uwagi → **Dodaj** (`POST …/schedule`).

Karty i kolumny kortów pokazują `formatCompetitorName` — długie `"A / B"` łamią się po separatorze.

## E2E

`03_schedule_publish.spec.mjs` — tablica po publikacji. `05_rematch.spec.mjs` — rewanże. `19_office_autoschedule.spec.mjs` — zakres, start, **Generuj propozycję**. `11` / `14` — etykiety par w terminarzu.

## Powiązane

- [[25 - Planowanie - grupy]]
- [[13 - Terminarz]] (publiczny odczyt)
- [[28 - Debel w biurze]]
