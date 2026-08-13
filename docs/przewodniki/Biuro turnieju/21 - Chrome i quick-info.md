---
title: Chrome i quick-info
tags: [wyniki, biuro, office]
aliases: [Office chrome, Quick info]
---

# Chrome biura i quick-info

## Cel

Górny pasek operacyjny + baner komunikatu na stronie publicznej.

## Przyciski hero

| Kontrolka | Co robi | Efekt |
|-----------|---------|-------|
| **Powiadomienia o nowych meczach** | Toggle Notification API przeglądarki | Preferencja lokalna |
| **Test powiadomienia** | Próbne powiadomienie | — |
| **Odśwież** | Przeładuj dashboard | `GET …/dashboard` |
| **Dodaj wynik** | Modal wyniku | [[27 - Wprowadzanie i edycja wyniku]] |
| **Wyloguj** | Czyści token i SSE | Powrót do logowania |
| Karty statystyk (Postęp / Zakończone / Pozostało / Drabinka) | Podgląd | Z dashboardu; w deblu te same liczby, tylko konkurent to para |

SSE: `/api/office/{slot}/stream` — odświeża dane na żywo.

## Quick-info (baner publiczny)

| Kontrolka | Co robi | Efekt |
|-----------|---------|-------|
| Textarea wiadomości | Treść banera | — |
| Checkbox **Pokaż na stronie publicznej** | `active` | — |
| **Opublikuj** | Zapis | `PUT …/quick-info` `{message, active}` |
| **Ukryj baner** | `active=false` + zapis | Baner znika z `/` |

## Zakładki

| Zakładka | Notatka |
|----------|---------|
| **Ostatnie mecze** | [[22 - Historia]] |
| **Postęp grup** | [[23 - Postęp]] |
| **Drabinka** | [[24 - Puchar]] |
| **Plan turnieju** | [[25 - Planowanie - grupy]], [[26 - Planowanie - terminarz i autoschedule]], [[28 - Debel w biurze]] |

## E2E

`16_office_login_chrome.spec.mjs` — karty statystyk, zakładki, Odśwież, Wyloguj. `06_quick_info.spec.mjs` — baner. `10_sse_reconnect.spec.mjs` — SSE.

## Powiązane

- [[20 - Logowanie office]]
- [[10 - Strona publiczna - przegląd]]
- [[28 - Debel w biurze]]
