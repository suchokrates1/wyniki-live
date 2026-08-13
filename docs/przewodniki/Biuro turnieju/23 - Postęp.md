---
title: Postęp
tags: [wyniki, biuro, office]
aliases: [Postęp grup, Office progress]
---

# Biuro — Postęp grup

## Cel

Read-only podgląd postępu w grupach (ile zaplanowano / zrobiono / zostało).

## Elementy UI

| Element | Znaczenie | Szczegół |
|---------|-----------|----------|
| Karty per grupa | Plan / Gotowe / Zostało | `expected_matches` / `finished_matches` / `remaining_matches` |
| Nagłówek składu | **Zawodnicy** albo **Pary** | `officeGroupIsDoubles` — para ma `team_id` |
| Chipy składu | Imiona osób albo etykiety `"A / B"` | Odczyt |

`play_format` zmienia, kiedy grupa jest **complete**: RR-only po meczach grupowych; tylko puchar po drabince; grupy+puchar po RR **i** drabince tej grupy.

Brak przycisków edycji — operacje w [[25 - Planowanie - grupy]] i wynikach.

## E2E

`17_office_progress.spec.mjs` — karty Plan/Gotowe/Zostało + chipy par.

## Powiązane

- [[22 - Historia]]
- [[25 - Planowanie - grupy]]
- [[28 - Debel w biurze]]
