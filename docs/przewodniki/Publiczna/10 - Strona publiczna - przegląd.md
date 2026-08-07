---
title: Strona publiczna - przegląd
tags: [wyniki, publiczna]
aliases: [Public site, Wyniki tenisowe]
---

# Strona publiczna — przegląd

## Cel

Podgląd wyników na żywo, drabinki, terminarza, historii turniejów i profili zawodników — bez logowania.

## Chrome (zawsze)

| Element | Co robi | Efekt |
|---------|---------|-------|
| Tytuł **Wyniki tenisowe** | Brand | — |
| Badge **LIVE** | Pokazuje się przy aktywnym korcie | Ze snapshotu |
| Select języka | PL/DE/EN/IT/ES/FR | `?lang=` + localStorage |
| Przełącznik motywu ☀️/🌙 | Jasny / ciemny | `localStorage.theme` |
| Baner quick-info | Komunikat z biura | Gdy biuro opublikuje |
| Skip link | Skok do `#main` | A11y |
| Stopka „Ostatnie odświeżenie” | Czas odświeżenia | — |

## Główne zakładki

| Zakładka | Hash | Notatka |
|----------|------|---------|
| **Na żywo** | `#live` | [[11 - Na żywo - korty]] (+ sub: drabinka, terminarz, historia) |
| **Turnieje** | `#tournaments` | [[15 - Lista turniejów]] |
| **Zawodnicy** | `#players` | [[16 - Zawodnicy i profil]] |

## Jak użyć

1. Otwórz stronę główną.
2. Wybierz język i ewentualnie tryb ciemny — [[18 - Język, motyw, access_key]].
3. Na żywo: śledź korty / drabinkę / plan.
4. Turnieje: archiwum i szczegóły.
5. Zawodnicy: wyszukiwarka i profile.

## Powiązane

- [[00 - Biuro i strona publiczna]]
- [[41 - Mapowanie URL]]
