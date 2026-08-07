---
title: Język, motyw, access_key
tags: [wyniki, publiczna, ustawienia]
aliases: [Query params public]
---

# Język, motyw, access_key

## Parametry URL (publiczne)

| Parametr | Aliasy | Efekt |
|----------|--------|-------|
| `lang` | — | Język UI (`pl/de/en/it/es/fr`), zapis w localStorage |
| `tournament_id` | `tid` | Otwórz szczegóły turnieju (gdy brak hasha) |
| `access_key` | `key` | Klucz do prywatnych turniejów (history/bracket/schedule/info) |
| `etap` | `stage` | Etap symulacji (z turniejami typu simulation) |

## Motyw

Przełącznik ☀️/🌙 w nagłówku → `localStorage.theme` (jasny/ciemny). Nie wymaga logowania.

## Jak użyć access_key

1. Admin tworzy turniej z **Kluczem dostępu** ([[34 - Turnieje i SMTP]]).
2. Udostępniasz link np. `https://…/?tid=123&access_key=SEKRET#tournaments/123/bracket`.
3. Publiczna strona dołącza klucz do requestów API turnieju.

## Powiązane

- [[10 - Strona publiczna - przegląd]]
- [[40 - Role i dostęp]]
