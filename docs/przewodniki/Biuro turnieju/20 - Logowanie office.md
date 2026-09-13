---
title: Logowanie office
tags: [wyniki, biuro, office]
aliases: [Office login, Biuro turnieju login]
---

# Logowanie — Biuro turnieju

## Cel

Wybór turnieju i wejście do panelu operatorskiego.

## URL

`/office`. Stare linki `/office/<numer>` nadal działają: otwierają ten turniej i zamieniają adres na `/office`. Numer (slot) to tylko miejsce turnieju na liście w danej chwili — nie trzeba go znać.

## Elementy UI (przed logowaniem)

| Kontrolka | Co robi | Efekt |
|-----------|---------|-------|
| Select języka | i18n biura (`pl/de/en/it/es/fr/lt`) | Osobny od publicznej; `?lang=lt` ustawia **Lietuvių** |
| Lista **Turniej** | Wybór turnieju (nazwa i daty) | `GET /api/office/tournaments`; wybór jest zapamiętany w przeglądarce |
| Karta **Wybrany turniej** | Nazwa, daty, aktywny / symulacja | — |
| Pole **Hasło modułu biura** + oczko | Hasło; przycisk pokazuje / ukrywa treść | Ustawiane przy tworzeniu turnieju w Admin |
| **Wejdź do biura** | Logowanie | `POST /api/office/{slot}/auth` → token w `sessionStorage` (osobny dla każdego turnieju) |

> [!warning] Hasło
> To nie jest hasło Admina. Każdy turniej ma własne hasło biura.

## Sesja

- Sesja biura trwa 7 dni (`OFFICE_SESSION_TTL_HOURS`, domyślnie 168 h). Po wygaśnięciu biuro wraca do logowania z komunikatem **Sesja biura wygasła**.
- Token jest związany z turniejem, nie z numerem. Gdy na liście pojawi się lub zniknie inny turniej i numer się przesunie, biuro samo przechodzi na nowy numer (odnawia strumień SSE) — bez wylogowania.
- Zmiana turnieju na liście wylogowuje z poprzedniego.

## Po zalogowaniu

Przejście do układu biura — [[21 - Chrome i quick-info]].

Błędne hasło zostawia ekran logowania i komunikat **Błędne hasło biura.**

## E2E

`16_office_login_chrome.spec.mjs` — `/office/<n>` → `/office`, lista i zapamiętany turniej, zły login, wygasła sesja. `15_lang_lt.spec.mjs` — `?lang=lt`.

## Powiązane

- [[21 - Chrome i quick-info]]
- [[28 - Debel w biurze]]
- [[40 - Role i dostęp]]
- [[34 - Turnieje i SMTP]]
