---
title: Chrome i quick-info
tags: [wyniki, biuro, office]
aliases: [Office chrome, Quick info, Kort]
---

# Układ biura („Kort”) i komunikat dla widzów

## Cel

Stały układ operatora: szyna widoków po lewej, pasek górny z liczbami i akcjami, widok roboczy.

## Szyna (lewa)

Wąska szyna z ikonami; po najechaniu (lub przejściu klawiaturą) rozwija się z nazwami. Po kliknięciu zwija się z powrotem.

| Widok | Notatka |
|-------|---------|
| **Terminarz** | [[26 - Planowanie - terminarz i autoschedule]] |
| **Grupy startowe** | [[25 - Planowanie - grupy]], [[28 - Debel w biurze]] |
| **Postęp grup** | [[23 - Postęp]] |
| **Drabinka** | [[24 - Puchar]] |
| **Ostatnie mecze** | [[22 - Historia]] |
| **Komunikat dla widzów** | niżej |

Na dole szyny: język, **Powiadomienia o nowych meczach** (Notification API), **Test powiadomienia**, **Wyloguj**.

## Pasek górny

| Element | Co robi | Efekt |
|---------|---------|-------|
| Nazwa turnieju + tytuł widoku | Odczyt | — |
| Liczby: Postęp / Zakończone mecze / Pozostało / Drabinka | Podgląd | Z dashboardu; w deblu konkurent to para |
| Licznik **W trakcie** | Mecze na kortach | — |
| **Odśwież** | Przeładuj dashboard | `GET …/dashboard` |
| **Dodaj wynik** | Modal wyniku | [[27 - Wprowadzanie i edycja wyniku]] |

SSE: `/api/office/{slot}/stream` — dane odświeżają się na żywo. Starsza, wolniejsza odpowiedź nie nadpisuje nowszej (np. tuż po zapisaniu wyniku).

## Komunikat dla widzów (baner publiczny)

| Kontrolka | Co robi | Efekt |
|-----------|---------|-------|
| Pole **Treść komunikatu turniejowego** | Treść banera | — |
| Checkbox **Pokaż na stronie publicznej** | `active` | — |
| **Opublikuj** | Zapis | `PUT …/quick-info` `{message, active}` |
| **Ukryj baner** | `active=false` + zapis | Baner znika z `/` |

## E2E

`16_office_login_chrome.spec.mjs` — liczby, sześć widoków, Odśwież, Wyloguj. `06_quick_info.spec.mjs` — baner. `10_sse_reconnect.spec.mjs` — SSE.

## Powiązane

- [[20 - Logowanie office]]
- [[10 - Strona publiczna - przegląd]]
- [[28 - Debel w biurze]]
