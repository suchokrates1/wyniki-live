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
| Overlay | Nazwa, przypisanie turnieju, **Autoukrywanie** (na dowolnym overlayu chowa puste korty; wracają przy nazwiskach) |
| Siatka górna | Włącz, kolumny 3/4, marginesy, odstęp, **Rezerwuj miejsce pod 2. set** |
| Szablony | `{kort} focus`, 3/4 korty góra, Wszystkie góra, Główny+Stats, Broadcast |
| Kopiuj układ do… | Inny preset |
| Align / distribute / same size / snap / center / duplicate | Layout tools |
| **Magnetyczny snap**, **Zachowaj proporcje** | Toggle |
| Element | X/Y/W/H (label nad inputem), strefa (Swobodny / Górny pasek), widoczny, **Logo w SB** |
| Kort | Tło SB, napis (tekst/pozycja/odstęp/rozmiar/tło) |
| Stats | Kort źródłowy, tryb Uproszczone / Zaawansowane |
| Logo turnieju | Upload + crop (**Zapisz** / **Anuluj**, zoom) → `/api/overlay/logo` |
| **Watermark TV** | On/off, pozycja (4 rogi), rozmiar, przezroczystość — logo w rogu obrazu |
| Fallback nazwy turnieju | Tekst zapasowy |
| Lista URL do OBS | Kopiowanie |

### Siatka górna — rezerwacja 2. seta

Gdy włączone **Rezerwuj miejsce pod 2. set** (domyślnie):
- OBS i podgląd zawsze pokazują **≥2 kolumny setów** (nie rosną przy przejściu 1→2)
- wysokość slotów top-bara jest wyliczana z napisu + scoreboardu w stanie rozwiniętym
- elementy mają stałe `h`, więc nie nachodzą na siebie ani na główny kort

### Watermark vs Logo w SB

| | Logo w SB | Watermark TV |
|--|-----------|--------------|
| Gdzie | Obok tabeli wyniku danego kortu | Róg całego obrazu 1920×1080 |
| Źródło | Logo turnieju (upload) | **Vest Media** (`/vest-media-logo.png`, asset z vestmedia.pl) |
| Cel | Branding przy scoreboardzie | Jak logo stacji TV |
| Kontrola | Toggle „Logo w SB” na elemencie kortu | Logo turnieju → Watermark TV |

## Powiązane

- [[17 - Overlay OBS]] (viewer bez kontrolek)
- [[31 - Korty i PIN]]
