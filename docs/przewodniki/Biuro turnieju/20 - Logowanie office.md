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
| Select języka | i18n biura (`pl/de/en/it/es/fr/lt`) | Osobny od publicznej; `?lang=lt` ustawia **Lietuvių** |
| Chip **Biuro slot {n}** | Info | — |
| Meta turnieju (nazwa, daty, aktywny / symulacja) | Z API | `GET /api/office/{slot}/meta` |
| Pole **Hasło modułu biura** + oczko | Hasło; przycisk pokazuje / ukrywa treść | Ustawiane przy tworzeniu turnieju w Admin |
| **Wejdź do biura** | Auth | `POST /api/office/{slot}/auth` → token w `sessionStorage` |

> [!warning] Hasło
> To nie jest hasło Admina. Każdy turniej ma własne hasło biura.

## Po zalogowaniu

Przejście do chrome i zakładek — [[21 - Chrome i quick-info]].

Błędne hasło zostawia ekran logowania i komunikat **Błędne hasło biura.** (`authError`). Token po sukcesie: `sessionStorage`.

## E2E

`16_office_login_chrome.spec.mjs` — meta slotu, zły login, język, wejście. `15_lang_lt.spec.mjs` — `?lang=lt` na `/office/{slot}`.

## Powiązane

- [[21 - Chrome i quick-info]]
- [[28 - Debel w biurze]]
- [[40 - Role i dostęp]]
- [[34 - Turnieje i SMTP]]
