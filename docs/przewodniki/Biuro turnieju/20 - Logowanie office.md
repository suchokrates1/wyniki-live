---
title: Logowanie office
tags: [wyniki, biuro, office]
aliases: [Office login, Biuro turnieju login]
---

# Logowanie — Biuro turnieju

## Cel

Wejście do panelu operatorskiego turnieju przypisanego do slotu.

## URL

`/office` lub `/office/<slot>` (domyślnie slot 1).

## Elementy UI (przed logowaniem)

| Kontrolka | Co robi | Efekt |
|-----------|---------|-------|
| Select języka | i18n biura | Osobny od publicznej strony |
| Chip **Biuro slot {n}** | Info | — |
| Meta turnieju (nazwa, daty, aktywny / symulacja) | Z API | `GET /api/office/{slot}/meta` |
| Pole **Hasło modułu biura** | Hasło | Ustawiane przy tworzeniu turnieju w Admin |
| **Wejdź do biura** | Auth | `POST /api/office/{slot}/auth` → token w `sessionStorage` |

> [!warning] Hasło
> To nie jest hasło Admina. Każdy turniej ma własne hasło biura.

## Po zalogowaniu

Przejście do chrome i zakładek — [[21 - Chrome i quick-info]].

## Powiązane

- [[40 - Role i dostęp]]
- [[34 - Turnieje i SMTP]]
