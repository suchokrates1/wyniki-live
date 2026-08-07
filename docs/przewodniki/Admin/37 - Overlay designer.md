---
title: Overlay designer
tags: [wyniki, admin, overlay]
aliases: [Admin overlay, Overlay settings]
---

# Admin — Overlay designer

## Cel

Projektowanie layoutów scoreboardu do OBS: elementy kortów/statystyk, siatka, logo, URL-e.

## Toolbar presetów

| Kontrolka | Co robi | API |
|-----------|---------|-----|
| Zakładki presetów | Przełącz overlay | — |
| **+ Nowy** / **Usuń** | CRUD presetu | Settings PUT / `DELETE /api/overlay/overlays/{id}` |
| **Demo dane** | Wypełnij demo | `POST /admin/api/demo` |
| **Pokaż w overlay** | Wypchnij demo | `POST /admin/api/demo/overlay` |
| **× Wyczyść** | Usuń demo | `DELETE /admin/api/demo` |
| 📋 Kopiuj URL | Schowek `/overlay/{slot}/{id}` | — |

Zmiany właściwości → autosave `PUT /api/overlay/settings` (z Bearer admin).

## Canvas 16:9

| Kontrolka | Co robi |
|-----------|---------|
| **+ Kort** / **+ Statystyki** | Dodaj element (wybór kortu) |
| Drag / resize | Pozycja i rozmiar |
| Strzałki klawiatury | Nudge 1px (Shift = 10px) |

## Właściwości

| Sekcja | Pola / akcje |
|--------|----------------|
| Overlay | Nazwa, przypisanie turnieju, **Autoukrywanie** |
| Siatka górna | Włącz, kolumny 3/4, marginesy, odstęp |
| Szablony | `{kort} focus`, 3/4 korty góra, Wszystkie góra, Główny+Stats, Broadcast |
| Kopiuj układ do… | Inny preset |
| Align / distribute / same size / snap / center / duplicate | Layout tools |
| **Magnetyczny snap**, **Zachowaj proporcje** | Toggle |
| Element | X/Y/W/H, strefa (Swobodny / Górny pasek), widoczny, logo |
| Kort | Tło SB, napis (tekst/pozycja/odstęp/rozmiar/tło) |
| Stats | Kort źródłowy, tryb Uproszczone / Zaawansowane |
| Logo turnieju | Upload + crop (**Zapisz** / **Anuluj**, zoom) → `/api/overlay/logo` |
| Fallback nazwy turnieju | Tekst zapasowy |
| Lista URL do OBS | Kopiowanie |

## Powiązane

- [[17 - Overlay OBS]] (viewer bez kontrolek)
- [[31 - Korty i PIN]]
