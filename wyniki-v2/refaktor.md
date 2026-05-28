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
- [ ] Etap 8: zacząć dzielić stan Alpine na kontrolery widoków po jednej zakładce.
  - [x] Wydzielić mały, bezpieczny kontroler widoku historii jako pierwszy pionowy wycinek.
  - [x] Po pierwszym wycinku uruchomić `npm run check:public` i produkcyjny smoke po deployu.
  - [ ] Wydzielić kolejne kontrolery widoków: live, drabinka, plan, turnieje i zawodnicy.
  - [ ] Po każdym następnym wycinku uruchomić `npm run check:public` i produkcyjny smoke po deployu.

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

## Plan refaktoru aplikacji Android

### Cel

Zmniejszyć ryzyko błędów na korcie przez rozdzielenie ekranu meczu, logiki punktowania, synchronizacji i modeli API. Refaktor ma iść tak samo jak frontend: małymi pionowymi wycinkami, z buildem/testem po każdym kroku i bez przepisywania całej aplikacji naraz.

### Aktualne hotspoty

- `ui/match/MatchActivity.kt`: około 1193 linii; miesza lifecycle, bindingi, obsługę kliknięć, renderowanie scoreboardu, wybór serwującego, animacje, dialogi i nawigację.
- `ui/match/MatchViewModel.kt`: około 1096 linii; miesza reducer meczu, undo, logowanie zdarzeń, synchronizację z backendem, baterię/diagnostykę i komunikaty UI.
- `data/model/MatchState.kt`: około 359 linii; pełni rolę modelu parcelable, modelu domenowego i częściowo silnika punktacji.
- `data/model/Match.kt` oraz modele API są blisko modeli UI/domenowych, co utrudnia bezpieczne zmiany kontraktu backendu.

### Etapy Android

- [x] Android Etap A0: ustalić aktualny punkt odniesienia release.
  - [x] Zbudować czysty release AAB po zmianach: `gradlew clean bundleRelease`.
  - [x] Wrzucić wersję `1.0.0-dev.18` / `versionCode 100018` na tory `internal`, `alpha`, `beta`, `production`.
  - [x] Potwierdzić w Google Play API, że wszystkie tory pokazują `completed` dla `100018`.
- [ ] Android Etap A1: dodać siatkę testów bezpieczeństwa dla logiki meczu.
  - [ ] Testy punktacji: klasyczny gem, deuce/advantage, no-advantage.
  - [ ] Testy setów: krótki set, standardowy set, tie-break przy granicy setu.
  - [ ] Testy super tie-breaka jako decydującego seta.
  - [ ] Testy debla: rotacja serwisu, `currentServer`, `isPlayer1Serving`.
  - [ ] Testy zamiany stron: wybór serwującego po `sidesSwapped` dla singla i debla.
  - [ ] Testy undo: przywrócenie punktów, gemów, setów, serwisu, statystyk i historii setów.
- [ ] Android Etap A2: wydzielić kontrolery/renderery z `MatchActivity` bez zmiany zachowania.
  - [x] `ServerSelectionController`: mapowanie przycisków serwujących przy zamienionych stronach.
  - [x] `ServerSelectionViewBinder`: binding przycisków serwujących i style wyboru.
  - [ ] `ScoreboardRenderer`: nazwy zawodników, sety, punkty, serwis, kolory i tryb singiel/debel.
  - [ ] `ScoringButtonsController`: akcje punktowe, tryb basic/advanced, fault/second serve.
  - [ ] `AnnouncementController`: komunikaty zmiany stron, końca gema/seta/meczu.
  - [ ] `MatchFinishController`: ekran końcowy, powrót do wyboru zawodników, finalizacja meczu.
  - [ ] `MatchActivity` zostaje właścicielem lifecycle, bindingów i obserwatorów, a nie logiki ekranów.
- [ ] Android Etap A3: wydzielić czysty silnik/reducer meczu.
  - [ ] Utworzyć pakiet domenowy, np. `domain/match`.
  - [ ] Przenieść naliczanie punktów, gemów, setów, tie-breaków i super tie-breaków do czystych funkcji/klas.
  - [ ] Przenieść decyzje o zmianie stron i rotacji serwisu do jednej warstwy domenowej.
  - [ ] Zastąpić bezpośrednie mutacje `MatchState` w ViewModelu komendami typu `PointWon`, `Fault`, `Undo`, `StartMatch`.
  - [ ] Zostawić `MatchState` jako kompatybilny model parcelable do czasu zakończenia migracji UI.
- [ ] Android Etap A4: uporządkować synchronizację z backendem.
  - [ ] ViewModel nie powinien wołać Retrofit bezpośrednio; komunikacja idzie przez repozytorium/koordynator sync.
  - [ ] Wydzielić `MatchSyncCoordinator`: create/update/finish, retry, statusy `SYNCING/SYNCED/FAILED/OFFLINE`.
  - [ ] Dopisać testy lub fake repozytorium dla scenariuszy offline i błędów HTTP.
  - [ ] Dopisać jedno miejsce budowania payloadu statystyk i stanu meczu.
- [ ] Android Etap A5: oddzielić DTO API od modeli domenowych i UI.
  - [ ] Modele Retrofit trafiają do `data/api/dto`.
  - [ ] Modele domenowe meczu trafiają do `domain/match/model`.
  - [ ] Mapowanie DTO <-> domena jest jawne i testowane.
  - [ ] `@SerializedName` zostaje przy DTO, nie przy modelach używanych przez UI, jeśli da się to zrobić bez dużej migracji naraz.
- [ ] Android Etap A6: wydzielić diagnostykę i metadane klienta.
  - [ ] Utworzyć `DeviceInfoProvider` dla wersji aplikacji, urządzenia, locale i timezone.
  - [ ] Utrzymać nagłówki audytu w jednym interceptorze, bez rozproszenia po API.
  - [ ] Dodać prosty ekran/sekcję diagnostyczną w ustawieniach: wersja, backend URL, ostatni status sync, ostatni błąd.
  - [ ] Rozważyć przycisk kopiowania diagnostyki dla sędziego/obsługi turnieju.
- [ ] Android Etap A7: uporządkować nawigację i przekazywanie stanu.
  - [ ] Ograniczyć duże obiekty w Intent extras tam, gdzie wystarczy identyfikator i odczyt z repozytorium.
  - [ ] Ujednolicić Result API dla wyboru zawodników, turnieju i powrotu po zakończeniu meczu.
  - [ ] Sprawdzić odtwarzanie po rotacji/ubiciu procesu dla aktywnego meczu.
- [ ] Android Etap A8: release automation.
  - [ ] Skrypt release ma sprawdzać lokalny `versionCode`, istniejące wersje na Play i wymuszać nowy build przed uploadem.
  - [ ] `deploy.py`/narzędzie release powinno obsługiwać `changesNotSentForReview=True` przy commitowaniu editów Google Play.
  - [ ] Dodać czytelny preflight: git status, wersja, rozmiar AAB, tory docelowe, release notes.
  - [ ] Po uploadzie automatycznie uruchamiać `status` i zapisywać wynik w logu release.
- [ ] Android Etap A9: końcowa walidacja i porządki.
  - [ ] `gradlew test`.
  - [ ] `gradlew clean bundleRelease`.
  - [ ] Manualny smoke na urządzeniu/emulatorze: wybór kortu, PIN, wybór zawodników, singiel, debel, tie-break, super tie-break, zakończenie meczu.
  - [ ] Sprawdzenie backendu po utworzeniu meczu: czy zapisują się `client_info`, `client_ip`, `client_country`, `client_user_agent`.
  - [ ] Commit etapami, bez mieszania refaktoru UI, domeny i release automation w jednym commicie.

### Najbliższa kolejność Android

1. Zacząć od `ServerSelectionController`, bo ostatnia poprawka dotyczyła wyboru serwującego przy zamienionych stronach i to jest mały, dobrze izolowany wycinek.
2. Równolegle dopisać testy mapowania serwującego po `sidesSwapped` dla singla i debla, zanim przeniesiemy większą logikę.
3. Dopiero potem ruszyć `ScoreboardRenderer`, bo dotyka wielu elementów UI, ale nie powinien zmieniać reguł meczu.
4. Po ustabilizowaniu UI zacząć `MatchReducer`, najpierw od punktacji i serwisu, potem od setów/tie-breaków, a na końcu od undo.

### Zasady refaktoru Android

- Każdy etap musi przejść przynajmniej `gradlew test` albo, jeśli testów dla wycinka jeszcze nie ma, `gradlew clean bundleRelease`.
- Nie zmieniamy reguł tenisowych przy przenoszeniu kodu; najpierw zachowanie ma być identyczne, dopiero potem można je poprawiać.
- `MatchActivity` ma chudnąć przez delegację do klas z jasną odpowiedzialnością, nie przez dodanie kolejnej warstwy, która dalej zna całą aplikację.
- Nowe DTO i moduły domenowe muszą mieć nazwy odzwierciedlające kontrakt: API, domena albo UI. Nie mieszamy tych ról w jednej klasie.
- Po zmianach release'owych zawsze sprawdzamy status Google Play API, bo Play może przyjąć bundle i odrzucić dopiero finalny commit edita.

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
- Utworzono checkpoint git po etapach 0-7: `1bee72d refactor public frontend modules`.
- Dodano regresję backendową dla `/api/history`: bez `tournament_id` endpoint musi zwracać historię aktywnego publicznego turnieju, a prywatne turnieje pozostają ukryte.
- Dodano `frontend/scripts/validate-i18n.mjs` oraz komendy `npm run test:i18n`, `npm run check:public`, `npm run smoke:production` i `npm run verify:production`.
- Rozpoczęto etap 8: wydzielono `modules/historyView.js` z publicznym stanem i akcjami widoku historii (`history`, sortowanie, pobieranie historii, szczegóły statystyk, etykieta aria historii).
- Dodano operacyjny `scripts/prod_ops_check.sh`: dzienny check publicznej strony, `/api/snapshot` i świeżości backupu NAS po backupie cron.

### 2026-05-28

- Zweryfikowano dotychczasowy plan frontendu: etapy 0-7 są wykonane i mają odpowiadające pliki/moduły w `frontend/src` oraz skrypty w `frontend/scripts`.
- Etap 8 pozostaje częściowy: pierwszy wycinek `modules/historyView.js` jest wykonany i podłączony w `main.js`, a kolejne kontrolery widoków są świadomie zostawione jako następne kroki.
- Uruchomiono `npm run check:public`: walidacja i18n dla 6 języków i build Vite zakończone sukcesem.
- Uruchomiono `npm run smoke:production`: produkcyjny smoke przeszedł dla 6 języków i 6 tras publicznych.
- Dopisano pełny plan refaktoru aplikacji Android z etapami A0-A9.
- Android Etap A0 jest wykonany: release `1.0.0-dev.18` / `versionCode 100018` został zbudowany i potwierdzony na torach `internal`, `alpha`, `beta`, `production`.
- Rozpoczęto Android Etap A2: wydzielono `ServerSelectionController.resolveServerNumber(...)` z `MatchActivity` i dodano testy jednostkowe dla singla/debla z `sidesSwapped`.
- Uruchomiono Android validation: wąski test `ServerSelectionControllerTest`, pełne `gradlew test` oraz `gradlew clean bundleRelease` zakończyły się sukcesem.
- Opublikowano release `1.0.0-dev.19` / `versionCode 100019` na torach `internal`, `alpha`, `beta`, `production` i potwierdzono status Google Play API.
- Kontynuowano Android Etap A2: `ServerSelectionController` buduje teraz testowalny model stanów przycisków, a `ServerSelectionViewBinder` przejął binding listenerów, widoczność, etykiety i style przycisków serwującego.
- Uruchomiono Android validation po drugim wycinku A2: `ServerSelectionControllerTest`, pełne `gradlew test` oraz `gradlew clean bundleRelease` zakończyły się sukcesem.

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