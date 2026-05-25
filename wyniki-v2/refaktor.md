# Plan refaktoru publicznego frontendu

## Cel

Ułożyć publiczny frontend tak, żeby rozwój wersji wielojęzycznej, dostępności i widoków turniejowych nie wymagał ciągłego dopisywania logiki do jednego dużego `frontend/src/main.js`.

Najważniejsza zasada: refaktor ma iść małymi krokami, z buildem po każdym etapie. Nie robimy jednego dużego przepisywania aplikacji.

## Aktualny problem

`frontend/src/main.js` pełni jednocześnie role:

- tabeli tłumaczeń,
- routera hashy,
- klienta API,
- magazynu stanu Alpine,
- formatowania dat i wyników,
- generatora tekstów dla czytników ekranu,
- logiki widoków live, drabinki, planu turnieju, historii, turniejów i zawodników.

To utrudnia testowanie i zwiększa ryzyko regresji przy każdej zmianie tłumaczeń lub dostępności.

## Docelowy układ

Proponowany układ katalogów:

```text
frontend/src/
  api/
    publicApi.js
  a11y/
    scoreNarration.js
  i18n/
    translations.js
    translationPatches.js
    index.js
  modules/
    liveScores.js
    bracket.js
    schedule.js
    history.js
    tournaments.js
    players.js
    routing.js
  shared/
    date.js
    text.js
    courtLabels.js
  main.js
```

## Etapy

- [x] Etap 0: spisać plan refaktoru w `refaktor.md`.
- [x] Etap 1: wydzielić czyste helpery tekstowe i narrację wyników dla czytników ekranu.
- [x] Etap 2: wydzielić tłumaczenia do `i18n/` i dodać walidację brakujących kluczy dla `pl/de/en/it/es/fr`.
  - [x] Runtime tłumaczeń poza `main.js`.
  - [x] Metadane obsługiwanych języków i locale poza `main.js`.
  - [x] Dev-only walidacja brakujących kluczy tłumaczeń.
  - [x] Przeniesienie bazowych tabel tłumaczeń z `main.js`.
  - [x] Przeniesienie patchy tłumaczeń z `main.js`.
- [x] Etap 3: wydzielić klienta API publicznego do `api/publicApi.js`.
- [x] Etap 4: wydzielić routing hashy do `modules/routing.js`.
- [x] Etap 5: wydzielić logikę widoków: live, drabinka, plan, historia, turnieje, zawodnicy.
  - [x] Live: wydzielić detekcję tie-breaka, super tie-breaka, punkty i wyniki setów w `modules/liveScores.js`.
  - [x] Plan turnieju: czyste helpery dni, liczników, dat, statusów, sortowania meczów i identyfikatorów DOM w `modules/schedule.js`.
  - [x] Plan turnieju: przenieść grupowanie meczów po kortach/kategoriach do modułu widoku.
  - [x] Drabinka: wydzielić fazy pucharowe, wiersze tabel grup i podium.
  - [x] Drabinka: wydzielić budowanie kategorii i wybór aktywnej kategorii.
  - [x] Zawodnicy: wydzielić filtrowanie, opcje filtrów i pomocniczą logikę profilu.
  - [x] Historia: wydzielić format wyniku, sety, zwycięzcę i wiersze statystyk zakończonych meczów.
  - [x] Turnieje: wydzielić wybór turnieju, reset szczegółów i query dostępu prywatnego.
- [x] Etap 6: dodać automatyczny smoke test przeglądarkowy dla publicznej strony w sześciu językach.
  - [x] Dodać skrypt `npm run smoke:public -- --base-url <url>` oparty o Playwright.
  - [x] Uruchomić smoke test po wdrożeniu aktualnej wersji na produkcji.
- [x] Etap 7: usunąć martwe lub zdublowane helpery i uprościć `main.js` do składania modułów.
  - [x] Przenieść format czasu do `shared/date.js`.
  - [x] Przenieść sortowanie i lokalizację etykiet kortów do `shared/courtLabels.js`.
  - [x] Usunąć martwy adapter `withNoCacheQuery` z `main.js`.
  - [x] Przejrzeć pozostałe adaptery w `main.js` i zostawić tylko te używane przez szablony Alpine.

## Zasady prowadzenia zmian

- Po każdym etapie musi przejść `npm run build` w `frontend/`.
- Po zmianach dotykających produkcji wdrażamy na minipc i robimy smoke test `/` oraz `/api/snapshot`.
- Publiczne `aria-label`, `.sr-only`, tytuły, meta description i widoczne teksty muszą przechodzić przez te same tłumaczenia.
- Nie zmieniamy zachowania API i formatu danych razem z refaktorem UI, chyba że etap tego wyraźnie wymaga.
- Każdy moduł powinien być możliwie czysty: dane wejściowe jako argumenty, bez ukrytego dostępu do globalnego Alpine, jeżeli da się tego uniknąć.

## Pierwszy krok

Etap 1 zaczyna się od wyciągnięcia dwóch bezpiecznych elementów:

- `shared/text.js`: formatowanie placeholderów typu `{name}`.
- `a11y/scoreNarration.js`: składanie wypowiadanych wyników setów, tie-breaków i super tie-breaków.

To jest dobry pierwszy krok, bo ogranicza ryzyko: logika pozostaje czysta, wejścia i wyjścia są tekstowe, a regresję łapie zwykły build Vite oraz test strony z czytnikowymi etykietami.

## Dziennik prac

### 2026-05-25

- Utworzono `shared/text.js` z czystym formatowaniem placeholderów.
- Utworzono `a11y/scoreNarration.js` z narracją setów, tie-breaków i super tie-breaków.
- `main.js` deleguje teraz do modułów a11y zamiast trzymać całą logikę narracji inline.
- Rozpoczęto etap 2 przez wydzielenie `i18n/runtime.js`: merge patchy i lookup tłumaczeń są poza `main.js`, a duże tabele językowe zostają jeszcze w miejscu do kolejnego, osobnego kroku.
- Dodano `i18n/locale.js`: lista wspieranych języków, język domyślny i mapowanie na locale są poza `main.js`.
- Dodano `i18n/validation.js`: w trybie developerskim aplikacja potrafi wypisać brakujące klucze tłumaczeń względem języka bazowego.
- Utworzono `i18n/translations.js`: bazowe tłumaczenia i patch tłumaczeń zostały przeniesione z `main.js` do modułu i18n.
- Utworzono `api/publicApi.js`: publiczne endpointy, no-cache query i JSON fetch są poza `main.js`.
- Utworzono `modules/routing.js`: odczyt i zapis hash routingu są poza `main.js`, a Alpine zostawia tylko delegacje.
- Rozpoczęto etap 5 przez `modules/schedule.js`: czyste helpery planu turnieju są poza `main.js`, a metody Alpine zostały adapterami do modułu.
- Rozszerzono `modules/schedule.js` o grupowanie meczów po kortach/kategoriach, etykiety zakładek planu i wyszukiwanie po treści meczu.
- Utworzono `modules/bracket.js` z czystymi helperami faz pucharowych, podium i wyrównywania tabel grup.
- Rozszerzono `modules/bracket.js` o parsowanie, sortowanie i budowanie kategorii dla aktywnej drabinki oraz drabinki wybranego turnieju.
- Utworzono `modules/players.js` z filtrowaniem zawodników, opcjami filtrów oraz pomocniczą logiką profilu.
- Utworzono `modules/history.js` z formatowaniem wyników historii, wykrywaniem zwycięzcy, setami i wierszami statystyk.
- Utworzono `modules/tournaments.js` z wyborem turnieju, resetem szczegółów i budowaniem query dostępu prywatnego.
- Utworzono `modules/liveScores.js` z detekcją tie-breaków, super tie-breaków, punktami i wynikami setów dla widoku live.
- Dodano skrypt `frontend/scripts/public-smoke.mjs` i komendę `npm run smoke:public -- --base-url <url>` do przeglądarkowego smoke testu publicznych widoków w sześciu językach.
- Lokalny smoke test przeszedł dla 6 języków i 6 publicznych widoków na `vite preview`.
- Wdrożono aktualną wersję na minipc i uruchomiono produkcyjny smoke test `https://score.vestmedia.pl`: 6 języków × 6 widoków, bez błędów runtime.
- Rozpoczęto etap 7: dodano `shared/date.js` i `shared/courtLabels.js`, usunięto nieużywany adapter `withNoCacheQuery` z `main.js`.
- Domknięto etap 7: usunięto nieużywane adaptery drabinki, historii i statystyk z `main.js`, zostawiając adaptery używane przez szablony Alpine lub wewnętrzny przepływ aplikacji.
- Walidacja po etapach: diagnostyka plików bez błędów, `npm run build` przechodzi.

## Porządki na minipc

### 2026-05-25

- Sprawdzono instancje na minipc: aktywny jest jeden kontener wyników `wyniki-tenis-v2` na porcie `8087`; repo produkcyjne to `~/count` z aktywną aplikacją w `~/count/wyniki-v2`.
- Stwierdzono, że codzienny backup cron działał, ale nie wysyłał już świeżych kopii na NAS/GDrive/VPS przez błąd `LOCAL_PRIMARY: nieustawiona zmienna` w `~/backup.sh`.
- Naprawiono `~/backup.sh` na minipc: primary backup trafia teraz przez SSH/rsync na NAS `nas@192.168.31.4:/volume1/Backup/minipc`, a retencje używają zmiennych `RETENTION_*_DAILY` z `backup.conf`.
- Uruchomiono ręcznie backup po poprawce: `2026-05-25` trafił na NAS, pliki critical trafiły na Google Drive i VPS, skrypt zakończył się statusem sukcesu.
- Usunięto z minipc stare katalogi tymczasowe `/tmp/backup-minipc-*`, zwalniając około 3,3 GB.
- Stare ręczne `~/wyniki-backups` przeniesiono przed usunięciem na NAS do `/volume1/Backup/minipc/manual-cleanup-2026-05-25/wyniki-backups`.
- Usunięto nieaktywny katalog `~/count/wyniki-v1` oraz stary katalog hotfix `~/tmp/wyniki-hotfix-20260523`.
- Po sprzątaniu potwierdzono, że na minipc aktywna aplikacja wyników zostaje tylko w `~/count/wyniki-v2`, a jedyny kontener wyników to `wyniki-tenis-v2` na porcie `8087`.