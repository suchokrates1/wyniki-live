---
title: Puchar
tags: [wyniki, biuro, office]
aliases: [Office drabinka, Knockout office, Format Wilno]
---

# Biuro — Faza pucharowa

## Cel

Faza pucharowa: podgląd meczów, wyniki, korekty i zamiana graczy w drabince.

## Jak powstaje drabinka

Drabinka tworzy się sama, gdy kategoria skończy grupy (dla grup w trybie „grupy + puchar”). Format każdej kategorii biuro wybiera i zatwierdza wcześniej, w kroku [[29 - Drabinki (format pucharu)]]; poniższa tabela to formaty domyślne. Wcześniej widać szkic z miejscami typu „1. B2 Men — Grupa A”.

| Kategoria | Format |
|-----------|--------|
| 1 grupa | 3 osoby: finał 1–2; 4+ osób: finał 1–2 i mecz o 3. miejsce 3–4 |
| 2 grupy | Półfinały krzyżowe (1A–2B, 1B–2A), finał, 3. miejsce, mecze o 5. i 7. miejsce |
| 3+ grup (format MŚ Wilno 2026) | **Drabinka główna**: dwóch najlepszych z każdej grupy. Zwycięzcy grup rozstawieni, wolne losy dla najwyżej rozstawionych, drugie miejsca w przeciwnej połówce niż zwycięzca ich grupy (4 grupy: A1–B2, D1–C2, B1–A2, C1–D2; 7 grup: od 1/8). Przegrani grają dalej o miejsca (**o miejsca 5–8**, **9–16**…, **o 5. / 7. miejsce**). **Pocieszenie**: 3., 4. i dalsze miejsca z grup, ta sama budowa. Zawodnicy z jednej grupy nie trafiają na siebie w pierwszym meczu |
| Tylko puchar (np. debel) | Drabinka z listy w kolejności rozstawienia: wolne losy dla najwyżej rozstawionych, finał i mecz o 3. miejsce (dowolna liczba par) |

Placeholdery w meczach, które czekają na wynik: **Zwycięzca: Ćwierćfinał 1**, **Przegrany: Półfinał 2**. Po wpisaniu wyniku zwycięzca i przegrany trafiają od razu do właściwych meczów.

## Elementy UI

| Kontrolka | Co robi | Efekt |
|-----------|---------|-------|
| Liczby (wygenerowane / gotowe / zakończone) | Podsumowanie | — |
| Karty meczów (gracze, wynik, dzień, godzina, kort) | Podgląd; komunikat **Mecz czeka na rozstrzygnięcie wcześniejszej rundy.** albo gotowy / zakończony | Debel: etykiety par |
| **Dodaj wynik** | Modal wyniku — dopiero gdy obaj gracze są znani | `POST …/knockout-matches` |
| **Popraw wynik** | Modal korekty | `PUT …/matches/{id}` |
| **Zamień** → **Tutaj** | Zamiana dwóch graczy w drabince (np. korekta losowania). Tylko w jednej kategorii, zanim którykolwiek z nich zagrał mecz pucharowy | `POST …/knockout/swap` |
| **Anuluj zamianę** | Rezygnacja | — |

## Korekta wyniku a dalsze rundy

- Zmiana samego wyniku (ten sam zwycięzca) — zawsze możliwa.
- Zmiana **zwycięzcy**: nowy zwycięzca i przegrany zastępują poprzednich w następnych meczach i terminarzu.
- Jeśli następny mecz ma już wynik, korekta jest zablokowana z komunikatem **Najpierw popraw wynik meczu …** — poprawiaj od najpóźniejszego meczu wstecz.

## E2E

`07_knockout_office.spec.mjs`, `08_walkover_ko_depth.spec.mjs`, `12_group_play_format.spec.mjs`. `22_lifecycle_wbtc_scale.spec.mjs` — pełny cykl w skali Wilna: 146 meczów pucharowych i deble, rozstawienie z tabel, rozgrywka dzień po dniu, przesunięcia zwycięzców i przegranych, publiczna drabinka. Backend: `test_four_groups_build_vilnius_draw_and_move_winners_and_losers` (drabinka, korekta, zamiana).

## Powiązane

- [[27 - Wprowadzanie i edycja wyniku]]
- [[26 - Planowanie - terminarz i autoschedule]]
- [[12 - Drabinka]] (publiczny podgląd)
- [[28 - Debel w biurze]]
