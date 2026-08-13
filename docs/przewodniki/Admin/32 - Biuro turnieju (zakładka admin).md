---
title: Biuro turnieju (zakładka admin)
tags: [wyniki, admin, biuro]
aliases: [Admin office tab]
---

# Admin — zakładka Biuro turnieju

## Cel

Uproszczone biuro wbudowane w Admin: wyniki grupowe i korekty, bez pełnego planowania/quick-info.

## Elementy UI

| Kontrolka | Co robi | API |
|-----------|---------|-----|
| Select turnieju | Wybór kontekstu | — |
| **Odśwież** | Dashboard | `GET /admin/api/tournaments/{id}/office` |
| SSE | Live | `…/office/stream` |
| Karty KO | Podsumowanie | Odczyt |
| Formularz wyniku grupowego (grupa, Z1/Z2, WO, sety, STB) | **Dodaj wynik** | `POST …/office/group-matches` — w deblu Z1/Z2 to etykiety par |
| **Wyczyść** | Reset formularza | — |
| Tabela meczów **Edytuj wynik** / **Zapisz korektę** / **Anuluj** | Inline edit | `PUT …/office/matches/{id}` |

> [!info]
> Do pełnego planowania i autoschedule użyj `/office` — [[20 - Logowanie office]].

## Powiązane

- [[27 - Wprowadzanie i edycja wyniku]]
- [[33 - Plan turnieju]]
- [[28 - Debel w biurze]]
