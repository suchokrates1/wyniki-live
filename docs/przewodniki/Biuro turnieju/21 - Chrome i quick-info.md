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

Sekcja **Przygotowanie i rozgrywki** to numerowane kroki turnieju (gotowe zostają na szynie, wyszarzone, z ✓; bieżący jest podświetlony):

| Krok | Notatka |
|------|---------|
| **1. Grupy startowe** | [[25 - Planowanie - grupy]], [[28 - Debel w biurze]] |
| **2. Forma rozgrywek** | [[29 - Drabinki (format pucharu)]] |
| **3. Terminarz** | [[26 - Planowanie - terminarz i autoschedule]] |
| **4. Faza grupowa** | [[23 - Postęp]] |
| **5. Faza pucharowa** | [[24 - Puchar]] |

Sekcja **Zawsze pod ręką** (z przyciskiem **Przewodnik** — klikany samouczek, [[19 - Przewodnik krok po kroku]]):

| Widok | Notatka |
|-------|---------|
| **Ostatnie mecze** | [[22 - Historia]] |
| **Komunikat dla zawodników** | niżej |

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

## Komunikat dla zawodników (baner publiczny)

| Kontrolka | Co robi | Efekt |
|-----------|---------|-------|
| Pole **Treść komunikatu turniejowego** | Treść banera | — |
| Checkbox **Pokaż na stronie publicznej** | `active` | — |
| **Opublikuj** | Zapis | `PUT …/quick-info` `{message, active}` |
| **Ukryj baner** | `active=false` + zapis | Baner znika z `/` |

## Uwagi do meczów w terminarzu

Druga sekcja widoku **Komunikat dla zawodników**: jedna uwaga publiczna dla wielu meczów naraz. W Terminarzu przycisk **Uwagi…** otwiera ją z dniem, który jest na siatce.

| Kontrolka | Co robi |
|-----------|---------|
| **Dzień** / **Faza** (Wszystkie, Grupowa, Pucharowa) / **Tylko nierozegrane mecze** | Zawężają mecze (domyślnie tylko nierozegrane) |
| **Korty**, **Kategorie** | Wybór kilku; **Wszystkie** czyści wybór |
| **Co zrobić**: Zastąp / Dopisz / Wyczyść | Nadpisuje uwagę, dopisuje ją po „ · ” (bez powtórzeń) albo usuwa |
| Podsumowanie + **Pokaż mecze** | Ile meczów pasuje i ile ma już własną uwagę; lista z obecnymi uwagami |
| **Zapisz uwagi (N)** / **Wyczyść uwagi (N)** | `POST …/schedule/notes` (podgląd: `POST …/schedule/notes/preview`) |

Uwagę widać na karcie meczu w terminarzu („Uwagi: …”) i w publicznym terminarzu. Pojedynczy mecz zmienia się w inspektorze. Nowe mecze nie dostają już żadnej domyślnej uwagi.

## E2E

`16_office_login_chrome.spec.mjs` — liczby, sześć widoków, Odśwież, Wyloguj. `06_quick_info.spec.mjs` — baner. `10_sse_reconnect.spec.mjs` — SSE.

## Powiązane

- [[20 - Logowanie office]]
- [[10 - Strona publiczna - przegląd]]
- [[28 - Debel w biurze]]
