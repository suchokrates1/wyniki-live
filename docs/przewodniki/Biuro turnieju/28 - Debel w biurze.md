---
title: Debel w biurze
tags: [wyniki, biuro, office, debel]
aliases: [Office doubles, Pary w biurze]
---

# Debel w biurze

Nowe funkcje kategorii **Double**: konkurentem jest **para** (`"Imię Nazwisko / Imię Nazwisko"`), nie pojedynczy zawodnik. Osoby zostają w `players`; para to rekord `tournament_teams`.

## Gdzie w UI

| Miejsce | Co widać / co robić |
|---------|---------------------|
| Krok 1 — kategorie | Checkbox **Debel** przy presecie i kategorii niestandardowej; po zatwierdzeniu badge **Debel** |
| Krok 1 — pary | **+ Dodaj drużynę**: Partner 1 + Partner 2 → kanoniczna etykieta; **Usuń parę** (gdy para nie jest w grupie) |
| Krok 1 — grupy | DnD **par** (nie osób); licznik **Pary**; **Przypisz wszystkie pary** / **Rozdziel pary** |
| Karta grupy | Dropdown **Tryb rozgrywek**: grupy+puchar / tylko każdy z każdym / tylko puchar |
| Krok 2 — terminarz | Dropdown stron meczu listuje pary; karty i autoschedule łamią długie `"A / B"` |
| Modal wyniku | Etykiety **Para A / Para B**; walkower i korekta na `display_name` pary |
| Historia / Postęp / Drabinka | Scoreboard i chipy składu pokazują pary; postęp: nagłówek **Pary** zamiast **Zawodnicy** |
| Język | Select **Lietuvių**, `?lang=lt`; terminy tenisowe, nie surowe klucze |

## Tryb na grupie (`play_format`)

| Wartość | PL | RR (`Grupowa`) | Puchar |
|---------|----|----------------|--------|
| `groups_knockout` (default nowej grupy) | Grupy + puchar | tak | po kompletnej grupie / krzyż 1A–2B gdy dwie grupy w kubełku |
| `round_robin` | Tylko każdy z każdym | tak | **nie** — grupa nie czeka na puchar i go nie dostaje |
| `knockout` | Tylko puchar | **nie** | drabinka z puli par (2/4/8) |

Dwie grupy `groups_knockout` w tej samej kategorii → krzyżowy półfinał. Grupa RR-only nie blokuje pucharu sąsiada. Dropdown blokuje się, gdy grupa ma już mecze.

## E2E

| Moduł | Zakres |
|-------|--------|
| `11_doubles_category_teams` | 4 pary, RR, publiczny `"A / B"`, badge Debel |
| `12_group_play_format` | trzy tryby, KO-only bez RR, dwie groups+KO → drzewo |
| `13_office_doubles_result` | walkower + korekta + standings par |
| `16_office_login_chrome` | logowanie, chrome, wylogowanie ([[20]], [[21]]) |
| `17_office_progress` | postęp grup, chipy par ([[23]]) |
| `18_office_planning_ui` | confirm Debel, dodaj zawodników/parę z UI ([[25]]) |
| `19_office_autoschedule` | krok 2: generuj / publikuj / propozycja ([[26]]) |
| `20_office_result_modal_teams` | modal **Para A/B** z UI ([[27]]) |
| `14_public_doubles_display` | publiczny terminarz/drabinka |
| `15_lang_lt` | `?lang=lt` |

Uruchomienie na Dell: `python3 scripts/e2e_tournament/run.py office` → `http://127.0.0.1:18087` (nie `test.blindtennis.app`).

## Powiązane

- [[25 - Planowanie - grupy]]
- [[26 - Planowanie - terminarz i autoschedule]]
- [[27 - Wprowadzanie i edycja wyniku]]
- [[12 - Drabinka]]
- [[13 - Terminarz]]
- [[42 - Debel - plan implementacji]]
