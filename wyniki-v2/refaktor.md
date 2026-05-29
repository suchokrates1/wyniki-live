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
    liveCourtView.js
    liveRuntimeView.js
    bracket.js
    bracketView.js
    schedule.js
    scheduleView.js
    history.js
    historyView.js
    tournaments.js
    tournamentsView.js
    players.js
    playersView.js
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
  - [x] Dodać smoke test biura zawodów na slocie symulacyjnym: `npm run smoke:office:production`.
- [x] Etap 7: usunąć martwe lub zdublowane helpery i uprościć `main.js` do składania modułów.
  - [x] Przenieść format czasu do `shared/date.js`.
  - [x] Przenieść sortowanie i lokalizację etykiet kortów do `shared/courtLabels.js`.
  - [x] Usunąć martwy adapter `withNoCacheQuery` z `main.js`.
  - [x] Przejrzeć pozostałe adaptery w `main.js` i zostawić tylko te używane przez szablony Alpine.
- [x] Etap 8: zacząć dzielić stan Alpine na kontrolery widoków po jednej zakładce.
  - [x] Wydzielić mały, bezpieczny kontroler widoku historii jako pierwszy pionowy wycinek.
  - [x] Po pierwszym wycinku uruchomić `npm run check:public` i produkcyjny smoke po deployu.
  - [x] Wydzielić kontroler widoku zawodników do `modules/playersView.js`.
  - [x] Wydzielić kontroler widoku turniejów do `modules/tournamentsView.js`.
  - [x] Wydzielić kontroler planu turnieju do `modules/scheduleView.js`.
  - [x] Wydzielić kontroler drabinki do `modules/bracketView.js`.
  - [x] Wydzielić adapter widoku live-score/kortów do `modules/liveCourtView.js`.
  - [x] Wydzielić ostatni shell live: snapshot startowy, SSE i animacje DOM do `modules/liveRuntimeView.js`.
  - [x] Po zakończeniu Etapu 8 uruchomić produkcyjny smoke po deployu.

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

- `ui/match/MatchActivity.kt`: po etapie A2 około 241 linii; zostały lifecycle, inicjalizacja bindingów, obserwatory i delegacje do kontrolerów/renderów.
- `ui/match/MatchViewModel.kt`: po etapach A3/A4 około 485 linii; nadal orkiestruje ekran meczu i komunikaty UI, ale logika punktowania, postępu meczu, undo oraz sync/backend są już wydzielane do klas domenowych i koordynatora.
- `data/model/MatchState.kt`: około 359 linii; pełni rolę modelu parcelable, modelu domenowego i częściowo silnika punktacji.
- `data/model/Match.kt` oraz modele API są blisko modeli UI/domenowych, co utrudnia bezpieczne zmiany kontraktu backendu.

### Etapy Android

- [x] Android Etap A0: ustalić aktualny punkt odniesienia release.
  - [x] Zbudować czysty release AAB po zmianach: `gradlew clean bundleRelease`.
  - [x] Wrzucić wersję `1.0.0-dev.18` / `versionCode 100018` na tory `internal`, `alpha`, `beta`, `production`.
  - [x] Potwierdzić w Google Play API, że wszystkie tory pokazują `completed` dla `100018`.
- [x] Android Etap A1: dodać siatkę testów bezpieczeństwa dla logiki meczu.
  - [x] Testy punktacji: klasyczny gem, deuce/advantage, no-advantage.
  - [x] Testy setów: krótki set, standardowy set, tie-break przy granicy setu.
  - [x] Testy super tie-breaka jako decydującego seta.
  - [x] Testy debla: rotacja serwisu, `currentServer`, `isPlayer1Serving`.
  - [x] Testy zamiany stron: wybór serwującego po `sidesSwapped` dla singla i debla.
  - [x] Testy undo: przywrócenie punktów, gemów, setów, serwisu, statystyk i historii setów.
- [x] Android Etap A2: wydzielić kontrolery/renderery z `MatchActivity` bez zmiany zachowania.
  - [x] `ServerSelectionController`: mapowanie przycisków serwujących przy zamienionych stronach.
  - [x] `ServerSelectionViewBinder`: binding przycisków serwujących i style wyboru.
  - [x] `ScoreboardRenderer`: nazwy zawodników, flagi, ikony serwisu, sety, punkty, metadane meczu i tryb tie-break/super tie-break.
  - [x] `ScoringButtonsController`: akcje punktowe, tryb basic/advanced, fault/second serve.
  - [x] `AnnouncementController`: komunikaty zmiany stron, tie-breaka, super tie-breaka i deciding point.
  - [x] `MatchFinishController`: ekran końcowy, powrót do wyboru zawodników, finalizacja meczu.
  - [x] `CourtSideNamesRenderer`: nazwy zawodników po lewej/prawej stronie kortu w widokach serwisu, wymiany, basic scoring i wyboru serwującego.
  - [x] `MatchViewSwitcher`: przełączanie widoków i animacje ekranów punktowania.
  - [x] `MatchDialogsController`: dialog wyjścia, undo, zakończenia meczu i ostrzeżenia drabinki.
  - [x] `MatchTimerRenderer` oraz `MatchToolbarRenderer`: timer meczu i status synchronizacji.
  - [x] `CourtSideSwapAnimator`: animacja zamiany stron w wyborze serwującego.
  - [x] `MatchActivity` zostaje właścicielem lifecycle, bindingów i obserwatorów, a nie logiki ekranów.
- [x] Android Etap A3: wydzielić czysty silnik/reducer meczu.
  - [x] Utworzyć pakiet domenowy, np. `domain/match`.
  - [x] Przenieść naliczanie punktów, gemów, setów, tie-breaków i super tie-breaków do czystych funkcji/klas.
  - [x] Przenieść decyzje o zmianie stron i rotacji serwisu do jednej warstwy domenowej.
  - [x] Wydzielić `StartMatch` jako pierwszy jawny reducer komendy startu meczu.
  - [x] Wydzielić `MatchActionReducer` dla komend akcji punktowych: `Ace`, `Fault`, `FootFault`, `BallInPlay`, `Winner`, `ForcedError`, `UnforcedError`, `BasicWin`, `BasicFault`.
  - [x] Wydzielić `MatchUndoManager` dla tworzenia snapshotów undo, limitu historii i cofania ostatniej akcji.
  - [x] Domknąć spójny model komend dla pozostałych operacji (`PointWon`, `StartMatch`, ręczna zmiana stron) i ograniczyć bezpośrednie mutacje `MatchState` w ViewModelu do wywołań reducerów.
  - [x] Zostawić `MatchState` jako kompatybilny model parcelable do czasu zakończenia migracji UI.
- [x] Android Etap A4: uporządkować synchronizację z backendem.
  - [x] ViewModel nie powinien wołać Retrofit bezpośrednio; komunikacja idzie przez repozytorium/koordynator sync.
  - [x] Wydzielić `MatchSyncCoordinator`: create/update/finish, retry, statusy `SYNCING/SYNCED/FAILED/OFFLINE`.
  - [x] Dopisać testy lub fake repozytorium dla scenariuszy offline i błędów HTTP.
  - [x] Dopisać jedno miejsce budowania payloadu statystyk i stanu meczu.
- [x] Android Etap A5: oddzielić DTO API od modeli domenowych i UI.
  - [x] Modele Retrofit trafiają do `data/api/dto`.
  - [x] Modele domenowe meczu trafiają do `domain/match/model`.
  - [x] Pierwszy krok: `MatchApiPayloadFactory` jawnie mapuje `MatchState` na payload meczu i statystyk, z testami.
  - [x] Pierwszy pion DTO: `MatchDto`, `ScoreDto`, `SetScoreDto` i `MatchStatusDto` obsługują create/update/get/finish meczu przez Retrofit, a `TennisRepository` mapuje je jawnie do starego modelu `Match`.
  - [x] Mapowanie DTO <-> domena jest w pełni jawne i testowane.
  - [x] `@SerializedName` zostaje przy DTO, nie przy modelach używanych przez UI, jeśli da się to zrobić bez dużej migracji naraz.
- [x] Android Etap A6: wydzielić diagnostykę i metadane klienta.
  - [x] Pierwszy krok: `DeviceBatteryInfoProvider` odkleja odczyt baterii od `MatchViewModel` i dostarcza `MatchBatteryInfo` do syncu.
  - [x] Utworzyć `DeviceInfoProvider` dla wersji aplikacji, urządzenia, locale i timezone.
  - [x] Utrzymać nagłówki audytu w jednym interceptorze, bez rozproszenia po API.
  - [x] Dodać prosty ekran/sekcję diagnostyczną w ustawieniach: wersja, backend URL, ostatni status sync, ostatni błąd.
  - [x] Rozważyć przycisk kopiowania diagnostyki dla sędziego/obsługi turnieju.
- [x] Android Etap A7: uporządkować nawigację i przekazywanie stanu.
  - [x] Ograniczyć duże obiekty w Intent extras tam, gdzie wystarczy identyfikator i odczyt z repozytorium.
  - [x] Ujednolicić Result API dla wyboru zawodników, turnieju i powrotu po zakończeniu meczu.
  - [x] Sprawdzić odtwarzanie po rotacji/ubiciu procesu dla aktywnego meczu.
- [x] Android Etap A8: release automation.
  - [x] Skrypt release ma sprawdzać lokalny `versionCode`, istniejące wersje na Play i wymuszać nowy build przed uploadem.
  - [x] `deploy.py`/narzędzie release powinno obsługiwać `changesNotSentForReview=True` przy commitowaniu editów Google Play.
  - [x] Dodać czytelny preflight: git status, wersja, rozmiar AAB, tory docelowe, release notes.
  - [x] Po uploadzie automatycznie uruchamiać `status` i zapisywać wynik w logu release.
- [ ] Android Etap A9: końcowa walidacja i porządki.
  - [x] `gradlew test`.
  - [x] `gradlew clean bundleRelease`.
  - [ ] Manualny smoke na urządzeniu/emulatorze: wybór kortu, PIN, wybór zawodników, singiel, debel, tie-break, super tie-break, zakończenie meczu.
    - [x] Sprawdzone `adb devices`: brak aktywnie podłączonego urządzenia.
    - [x] Dostępny AVD do uruchomienia kolejnego smoke: `Medium_Phone_API_36.1`.
  - [x] Sprawdzenie backendu po utworzeniu meczu: czy zapisują się `client_info`, `client_ip`, `client_country`, `client_user_agent`.
  - [ ] Commit etapami, bez mieszania refaktoru UI, domeny i release automation w jednym commicie.

### Najbliższa kolejność Android

1. Dokończyć A9: manualny smoke na uruchomionym emulatorze/urządzeniu albo jawne oznaczenie blokera sprzętowego.
2. Po manualnym smoke przygotować commity etapami: osobno domena/UI Android, osobno release automation i dokumentacja.

### Zasady refaktoru Android

- Każdy etap musi przejść przynajmniej `gradlew test` albo, jeśli testów dla wycinka jeszcze nie ma, `gradlew clean bundleRelease`.
- Nie zmieniamy reguł tenisowych przy przenoszeniu kodu; najpierw zachowanie ma być identyczne, dopiero potem można je poprawiać.
- `MatchActivity` ma chudnąć przez delegację do klas z jasną odpowiedzialnością, nie przez dodanie kolejnej warstwy, która dalej zna całą aplikację.
- Nowe DTO i moduły domenowe muszą mieć nazwy odzwierciedlające kontrakt: API, domena albo UI. Nie mieszamy tych ról w jednej klasie.
- Po zmianach release'owych zawsze sprawdzamy status Google Play API, bo Play może przyjąć bundle i odrzucić dopiero finalny commit edita.

## Plan naprawy lifecycle meczu

### Cel

Jeden mecz ma mieć jedną tożsamość od wyboru w aplikacji Android, przez live scoring, terminarz, drabinkę, statystyki i historię. `matches.id` pozostaje kanonicznym rekordem rozegranego meczu, a `tournament_schedule` i `match_history` są projekcjami/linkami do niego, nie osobnymi źródłami prawdy.

### Problemy do usunięcia

- Android tworzy `MatchState` bez `tournament_id`, `schedule_id`, `bracket_group_id`, `phase` i stabilnego identyfikatora klienta.
- `POST /api/matches` tworzy nowy rekord przy każdym wywołaniu, więc powtórzenie requestu lub utrata `matchId` w Androidzie może zdublować mecz.
- Terminarz jest linkowany po parze nazw, fazie i grupie; przy duplikatach nazw lub powtórzonej parze może zostać podpięty zły slot.
- Eventy live szukają aktywnego meczu po korcie, a nie po `match_id`.
- Mobilne zakończenie meczu dopisuje historię przez insert, a office robi upsert po `match_id`.
- Brakuje jawnego modelu wyniku specjalnego: test, krecz i walkower.

### Docelowy kontrakt

- `client_match_uuid`: generowany w Androidzie przy utworzeniu `MatchState`, wysyłany w create/update/event/finish; backend używa go do idempotencji `POST /matches`.
- `schedule_id`: opcjonalny identyfikator planowanego slotu; po dodaniu wyboru meczu z terminarza Android będzie przekazywał go przy starcie.
- `match_id`: po pierwszej synchronizacji staje się podstawowym identyfikatorem eventów, statystyk, historii i drabinki.
- `finish_reason`: `normal`, `test`, `retirement`, `walkover`.
- `winner_name`, `injured_player_name`, `result_note`: pola wyniku specjalnego zapisywane w `matches`, `match_history` i drabince pucharowej.

### Etapy lifecycle

- [x] L1: dodać stabilny `client_match_uuid` i idempotentne tworzenie meczu w backendzie.
- [x] L2: dodać jawny kontrakt zakończenia meczu (`finish_reason`, zwycięzca, kontuzjowany zawodnik, notatka wyniku) w Androidzie i backendzie.
- [x] L3: ujednolicić mobilną historię z office: upsert `match_history` po `match_id`, bez duplikatów przy ponownym finish.
- [x] L4: testowe zakończenie meczu nie może wpływać na historię, terminarz, drabinkę, statystyki ani generowanie pucharówki.
- [x] L5: krecz zapisuje ostatni wynik, zwycięzcę i kontuzjowanego zawodnika oraz przekazuje tę informację do historii i drabinki.
- [x] L6: walkower zapisuje wynik 4:0, 4:0, zwycięzcę i notatkę wyniku w historii/drabince.
- [x] L7: eventy live mają nieść `match_id`/`client_match_uuid`, a backend używa ich przed fallbackiem po korcie.
- [x] L8: linkowanie terminarza nie może nadpisywać slotu przypiętego do innego meczu; jawny `schedule_id` ma mieć priorytet nad heurystyką po nazwach.
  - [x] Nie nadpisujemy slotu przypiętego do innego `match_id`.
  - [x] Jawny `schedule_id` z Androida ma pierwszeństwo przed heurystyką po nazwach.
- [x] L9: dodać wybór meczu z terminarza w Androidzie przed wyborem zawodników albo jako domyślną sugestię po wyborze kortu.

### Testy wymagane dla lifecycle

- Backend: idempotencja `POST /api/matches` po `client_match_uuid`.
- Backend: `finish_reason=test` kończy rekord testowy bez historii, statystyk, terminarza i drabinki.
- Backend: `finish_reason=retirement` zapisuje ostatni wynik, zwycięzcę, kontuzjowanego zawodnika i historię bez duplikatów.
- Backend: `finish_reason=walkover` zapisuje 4:0, 4:0 oraz wynik specjalny w historii i drabince.
- Backend: `link_schedule_to_match` nie nadpisuje istniejącego `match_id` innym meczem.
- Android: payload create/update/event/finish zawiera `client_match_uuid` i `match_id` tam, gdzie jest dostępny.
- Android: wybór test/krecz/walkower ustawia właściwy request finish, a test pomija lokalną historię i statystyki.

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
- Kontynuowano Android Etap A2: wydzielono `ScoreboardRenderer`, który przejął renderowanie nazw, flag, ikon serwisu, punktów, setów, metadanych meczu, aktywnego seta oraz trybu tie-break/super tie-break.
- Uruchomiono Android validation po `ScoreboardRenderer`: `compileDebugKotlin`, pełne `gradlew test` oraz `gradlew clean bundleRelease` zakończyły się sukcesem.
- Kontynuowano Android Etap A2: wydzielono `ScoringButtonsController`, który przejął listenery i renderowanie przycisków serwisu, wymiany oraz trybu basic scoring.
- Kontynuowano Android Etap A2: wydzielono `AnnouncementController` dla komunikatów zmiany stron, tie-breaka, super tie-breaka i deciding point.
- Kontynuowano Android Etap A2: wydzielono `MatchFinishController` dla ekranu końcowego, statystyk meczu i przejścia do następnego meczu.
- Kontynuowano Android Etap A2: wydzielono `CourtSideNamesRenderer` dla nazw zawodników po lewej/prawej stronie kortu w widokach punktowania i wyboru serwującego.
- Uruchomiono Android validation po kolejnym batchu A2: `compileDebugKotlin`, pełne `gradlew test` oraz `gradlew clean bundleRelease` zakończyły się sukcesem; `MatchActivity` ma teraz 489 linii.
- Domknięto Android Etap A1: rozszerzono `MatchStateTest` o klasyczny gem, deuce/advantage, no-advantage, krótkie i standardowe sety, granice tie-breaka, super tie-breaka i warunek końca meczu.
- Domknięto Android Etap A1: dodano `DoublesServeRotation` z testami kolejności 1 -> 2 -> 3 -> 4, `currentServer` i `isPlayer1Serving`, a `MatchViewModel` używa tej samej klasy.
- Domknięto Android Etap A1: dodano `MatchUndoRestorer` z testem przywracania punktów, gemów, setów, serwisu, flag trybu, statystyk i historii setów; `MatchViewModel.undoLastAction()` deleguje do tej klasy.
- Domknięto Android Etap A2: wydzielono `MatchViewSwitcher`, `MatchDialogsController`, `MatchTimerRenderer`, `MatchToolbarRenderer` i `CourtSideSwapAnimator`; `MatchActivity` ma teraz 241 linii i odpowiada głównie za lifecycle, bindingi, obserwatory i delegowanie.
- Uruchomiono Android validation po etapach A1+A2: wąskie testy `DoublesServeRotationTest`, `MatchStateTest`, `MatchUndoRestorerTest`, pełne `gradlew test` oraz `compileDebugKotlin` zakończyły się sukcesem.
- Rozpoczęto Android Etap A3: utworzono pakiet `domain/match`.
- Przeniesiono rotację serwisu w deblu do `domain/match/DoublesServeRotation` i zachowano testy kolejności serwisu.
- Utworzono `MatchPointReducer`: naliczanie pojedynczego punktu, zmiana serwisu w tie-breaku/super tie-breaku i zmiana stron co 6 punktów są poza `MatchViewModel`.
- Utworzono `MatchProgressReducer`: naliczanie gemów, setów, tie-breaków, super tie-breaków, końca meczu i efektów `game/set/sync/finalize/announcement` jest poza `MatchViewModel`.
- Przeniesiono `MatchUndoRestorer` do `domain/match`, żeby undo było częścią domenowej warstwy meczu, a nie pakietu UI.
- Utworzono `MatchStartReducer`: wybór pierwszego serwującego, początek meczu, obsługa `manualStartTime` i ustawienie `isPlayer1Serving` są poza `MatchViewModel`.
- Uruchomiono Android validation po pierwszym batchu A3: testy `pl.vestmedia.tennisreferee.domain.match.*`, pełne `gradlew test`, `compileDebugKotlin` oraz `gradlew clean bundleRelease` zakończyły się sukcesem; `MatchViewModel` ma teraz około 869 linii.
- Kontynuowano Android Etap A3: dodano `MatchActionReducer` i testy dla komend akcji punktowych, dzięki czemu obsługa asa, błędów serwisowych, winnerów, błędów wymiany oraz trybu basic nie jest już ręcznie mutowana w handlerach ViewModelu.
- Rozpoczęto Android Etap A4: dodano `MatchEventFactory` jako jedno miejsce składania payloadu `MatchEvent` z wyniku, statystyk, graczy, baterii i timestampu; dodano testy singla i debla.
- Wydzielono `MatchSyncCoordinator`, który przejął create/update/finish, retry, statusy sync, eventy końca meczu, wysyłkę statystyk i lokalny zapis historii. `MatchViewModel` ma teraz około 485 linii i nie wykonuje bezpośrednich wywołań Retrofit.
- Uruchomiono Android validation po batchu A3/A4: `MatchEventFactoryTest`, testy `pl.vestmedia.tennisreferee.domain.match.*` oraz `compileDebugKotlin` zakończyły się sukcesem.
- Kontynuowano A4: wprowadzono porty `MatchApiClient`, `MatchHistorySaver`, `RetryDelay` i `MatchSyncLogger`, dzięki czemu `MatchSyncCoordinator` ma testy retry, HTTP 400/500, trybu offline, bracket warning i finalizacji meczu bez zależności od Android `Log` ani Room.
- Rozpoczęto A5: przeniesiono mapowanie `MatchState -> Match` i `MatchState -> MatchStatisticsRequest` do `data/api/MatchApiPayloadFactory`, usuwając API payload building z `MatchState`; dodano testy singla, debla, statusu meczu i statystyk.
- Kontynuowano A3: dodano `MatchUndoManager` dla snapshotów undo, przycinania historii i cofania ostatniej akcji; `MatchViewModel` przestał ręcznie budować `MatchAction`.
- Kontynuowano A6: dodano `DeviceBatteryInfoProvider`, a `MatchViewModel` nie odczytuje już baterii przez `IntentFilter` bezpośrednio.
- Uporządkowano typy UI meczu: `MatchView`, `SyncStatus` i `BracketWarningEvent` są w `MatchUiState`, nie na końcu `MatchViewModel`; `MatchViewModel` ma teraz około 420 linii.
- Uruchomiono Android validation po kolejnym batchu A3/A4/A5/A6: testy `MatchSyncCoordinatorTest`, `MatchApiPayloadFactoryTest`, `MatchUndoManagerTest`, `MatchUndoRestorerTest`, `MatchActionReducerTest` oraz `compileDebugKotlin` zakończyły się sukcesem.

### 2026-05-29

- Rozpoczęto pionową naprawę lifecycle meczu: `matches.id` zostaje kanonicznym rekordem, a `tournament_schedule` i `match_history` są linkami/projekcjami po `match_id`.
- Backend: dodano `client_match_uuid` w `matches`, idempotentne `POST /api/matches`, przenoszenie UUID przez update/event/finish oraz indeks po UUID klienta.
- Backend: dodano kontrakt zakończenia `finish_reason=normal/test/retirement/walkover`, `winner_name`, `injured_player_name`, `result_note` w `matches`, `match_history` i drabince pucharowej.
- Backend: mobilny finish robi upsert historii po `match_id`; ponowny finish nie tworzy duplikatu historii ani nie dubluje wyniku kreczu.
- Backend: `finish_reason=test` kończy rekord testowy bez historii, statystyk, terminarza, drabinki i generowania pucharówki.
- Backend: krecz zapisuje ostatni wynik, zwycięzcę i kontuzjowanego zawodnika; walkower zapisuje 4:0, 4:0 i notatkę `Walkower`.
- Backend: `link_schedule_to_match` nie nadpisuje slotu przypiętego do innego meczu; jawny `schedule_id` z Androida ma pierwszeństwo przed heurystyką po nazwach.
- Backend: dodano `GET /api/courts/{kort_id}/suggested-match`, który wybiera najbliższy niepodpięty mecz z terminarza po wybranym korcie i aktualnej godzinie aplikacji.
- Android: `MatchState` generuje `clientMatchUuid`, payloady create/update/event/finish przenoszą identyfikatory meczu, a finish request obsługuje normalny koniec, test, krecz i walkower.
- Android: `MatchState` i payload `Match` przenoszą `scheduleId`, a ekran wyboru zawodników pokazuje sugestię meczu z terminarza po wyborze kortu.
- Android: sugestię można zaakceptować jednym przyciskiem albo ukryć i ręcznie wybrać/dodać zawodników; ręczny wybór nie wysyła `scheduleId`.
- Android: dialog zakończenia meczu pyta o powód; dla kreczu wybiera kontuzjowanego zawodnika, dla walkowera zwycięzcę; test pomija statystyki i lokalną historię.
- Walidacja backendu: `..\.venv\Scripts\python.exe -m pytest -q test_tournament_lifecycle.py` zakończone sukcesem, 36 testów zielonych.
- Walidacja Androida: `gradlew test` zakończone sukcesem; zielone były też testy `MatchFinishOutcomeApplierTest`, `MatchApiPayloadFactoryTest`, `MatchEventFactoryTest`, `MatchSyncCoordinatorTest` i `ScheduleSuggestionSelectorTest`.
- Biuro zawodów: dashboard pokazuje teraz wygenerowane sloty pucharowe z drabinki (`progress.knockout`), standalone office potrafi dopisać wynik z takiego slotu i podpiąć go do terminarza, historii oraz awansu drabinki; panel admina dostał podgląd tej samej sekcji.
- Walidacja biura pucharowego: `..\.venv\Scripts\python.exe -m pytest test_tournament_lifecycle.py -q` zakończone sukcesem, 37 testów zielonych; `npm run build` w `frontend/` przechodzi.
- Dodano produkcyjny smoke biura zawodów `frontend/scripts/office-smoke.mjs`; `npm run smoke:office:production` loguje slot symulacyjny i sprawdza dashboard oraz zakładkę `Drabinka`.
- Kontynuowano Etap 8 frontendu: wydzielono `modules/playersView.js` i `modules/tournamentsView.js`, dzięki czemu `main.js` nie trzyma już stanu i akcji zakładek zawodników oraz turniejów.
- Walidacja po wycinkach Etapu 8: `npm run check:public` zakończone sukcesem po `playersView` oraz po `tournamentsView`.
- Kontynuowano Etap 8 frontendu: wydzielono `modules/scheduleView.js`, `modules/bracketView.js` i `modules/liveCourtView.js`; `main.js` składa teraz kontrolery widoków, a w samym pliku zostały głównie init, hash routing, snapshot startowy, SSE i animacje DOM.
- Walidacja po kolejnych wycinkach Etapu 8: `npm run check:public` zakończone sukcesem po `scheduleView`, po `bracketView` i po `liveCourtView`.
- Domknięto ostatni shell live Etapu 8: `modules/liveRuntimeView.js` przejął snapshot startowy, SSE i animacje DOM; `main.js` pozostał plikiem kompozycji aplikacji, routingu, tłumaczeń i wspólnych adapterów aria wyników.
- Poprawiono odczyt wpisów terminarza dla czytników ekranu: `scheduleMatchAria()` zaczyna od pary zawodników, potem podaje nazwę kortu bez podwójnego prefiksu, samą godzinę, kategorię, fazę, uwagi i status, żeby najważniejsze informacje były na początku komunikatu bez powtarzania daty widocznej w nagłówku dnia.
- Walidacja po `liveRuntimeView` i zmianie aria terminarza: `npm run check:public` zakończone sukcesem.
- Kontynuowano Android Etap A6: wydzielono `DeviceInfoProvider`, `ClientMetadata` i `ClientMetadataInterceptor`, więc nagłówki audytu `X-TennisReferee-*` są budowane w jednym miejscu zamiast inline w `RetrofitClient`.
- Walidacja A6/backend audit: `gradlew testDebugUnitTest --tests "pl.vestmedia.tennisreferee.data.api.ClientMetadataTest"`, `gradlew compileDebugKotlin` oraz `pytest test_tournament_lifecycle.py -q -k "audit"` zakończone sukcesem.
- Kontynuowano Android Etap A5: dodano `data/api/dto/MatchDto.kt` z `MatchDto`, `ScoreDto`, `SetScoreDto`, `MatchStatusDto` oraz mapperami `toDto()/toModel()`. `TennisApiService`, `MatchSyncPorts`, `MatchApiPayloadFactory` i `TennisRepository` używają teraz DTO dla create/update/get/finish meczu, pozostawiając UI na dotychczasowym modelu.
- Walidacja A5 DTO: `gradlew testDebugUnitTest --tests "pl.vestmedia.tennisreferee.data.api.MatchApiPayloadFactoryTest" --tests "pl.vestmedia.tennisreferee.ui.match.MatchSyncCoordinatorTest"` oraz `gradlew compileDebugKotlin` zakończone sukcesem.
- Domknięto Android Etap A5: wszystkie typy używane bezpośrednio przez `TennisApiService` są w `data/api/dto`, modele meczu przeniesiono do `domain/match/model`, a `@SerializedName` usunięto ze starych modeli UI/domeny. Dodano `ApiDtoMappingTest` dla jawnych mapperów DTO <-> model.
- Domknięto Android Etap A6: ustawienia pokazują diagnostykę klienta (wersja aplikacji, backend URL, urządzenie, locale, timezone, ostatni status sync, ostatni błąd), `MatchSyncCoordinator` emituje status/błąd do `SyncDiagnosticsStore`, a przycisk kopiuje stabilny tekst diagnostyczny dla obsługi.
- Walidacja A5/A6 po domknięciu: `gradlew testDebugUnitTest --tests "pl.vestmedia.tennisreferee.data.api.ApiDtoMappingTest" --tests "pl.vestmedia.tennisreferee.data.api.MatchApiPayloadFactoryTest" --tests "pl.vestmedia.tennisreferee.data.api.ClientMetadataTest" --tests "pl.vestmedia.tennisreferee.data.model.MatchEventFactoryTest" --tests "pl.vestmedia.tennisreferee.ui.match.MatchSyncCoordinatorTest" --tests "pl.vestmedia.tennisreferee.ui.settings.SettingsDiagnosticsFormatterTest"` zakończone sukcesem.
- Domknięto Android Etap A7: `PlayerSelectionActivity` zapisuje świeżo utworzony `MatchState` w `ActiveMatchStore` pod `clientMatchUuid`, a `MatchActivity` dostaje w `Intent` tylko UUID i potrafi odtworzyć aktywny mecz ze store po odtworzeniu procesu; pozostawiono legacy fallback dla starego `EXTRA_MATCH_STATE`.
- Domknięto Result API A7: powrót po zakończonym meczu działa przez `ActivityResultContracts.StartActivityForResult`, przyciski następnego meczu zwracają akcję do istniejącego `PlayerSelectionActivity`, a wymuszona zmiana turnieju z menu kortów wraca wynikiem zamiast budować nowy stack aktywności.
- Domknięto Android Etap A8: `deploy.py upload` wymusza czysty build przed wysyłką, sprawdza zajęty `versionCode` na torach Google Play, drukuje preflight (`git status`, wersja, AAB, tory, release notes), commituje z `changesNotSentForReview=True`, pobiera status po publikacji i zapisuje log w `release_logs/`. Uzupełniono też `DEPLOYMENT.md`.
- Walidacja A7/A8: `gradlew compileDebugKotlin`, pełne `gradlew test`, `python -m py_compile deploy.py` i `python deploy.py --help` zakończone sukcesem; `git diff --check` dla repo Androida nie wykazał błędów whitespace poza istniejącym ostrzeżeniem LF/CRLF dla `Player.kt`.
- Naprawiono ostrzeżenie LF/CRLF dla `Player.kt` przez wąski `.gitattributes` w repo Androida; `git diff --check` nie raportuje już ostrzeżeń line-ending.
- Potwierdzono kontrakt pełnych nazw zawodników dla Androida: produkcyjne `/api/players` zwraca `first_name`, `last_name`, `full_name` i `name`, `PlayerDto` mapuje `firstName/lastName`, a `PlayerAdapter` wyświetla `player.getFullName()`. Dodano regresję `playerDtoMapsFirstAndLastNameForSelectionFullName`.
- Domknięto produkcyjną walidację frontendowego Etapu 8: po podniesieniu konfigurowalnego timeoutu nawigacji w `public-smoke.mjs`, `npm run smoke:production` przeszedł dla 6 języków i 6 publicznych tras.
- Audyt gotowości całego planu: frontend publiczny Etapy 0-8 są zamknięte, lifecycle L1-L9 jest zamknięty, Android A0-A2 i A4-A8 są zamknięte; do pełnej gotowości pozostają Android A3 (ostatni porządek modelu komend/mutacji `MatchState`) oraz A9 (finalny `bundleRelease`, manualny smoke i commit/deployment hygiene).
- Domknięto Android Etap A3: `StartMatch`, `PointWon` i ręczna zmiana stron przechodzą przez `MatchCommand`/`MatchActionReducer`, a `MatchViewModel` nie woła już bezpośrednio `MatchStartReducer`, `MatchPointReducer` ani nie mutuje `sidesSwapped`.
- Walidacja A3/A9: testy `MatchActionReducerTest` i `MatchStartReducerTest`, `compileDebugKotlin`, pełne `gradlew test` oraz backendowy audit `pytest -q test_tournament_lifecycle.py -k "audit"` zakończyły się sukcesem.
- Walidacja A9: `gradlew clean bundleRelease` zakończyło się utworzeniem `app-release.aab` (`3 883 288` bajtów, `2026-05-29 21:02`). `adb devices` nie pokazał aktywnego urządzenia; dostępny jest AVD `Medium_Phone_API_36.1`, więc manualny smoke pozostaje do wykonania po uruchomieniu emulatora albo podłączeniu urządzenia.

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