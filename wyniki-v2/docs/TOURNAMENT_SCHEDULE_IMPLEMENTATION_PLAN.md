# Plan wdrozenia modulu terminarza turnieju

## Cel

Dodac nowy modul publiczny dla turnieju na zywo: plan dnia / terminarz. Modul ma pokazywac mecze podzielone na dni i kategorie, z data, orientacyjna godzina i przypisanym kortem. Ten sam obszar danych ma byc edytowany w panelu organizacyjnym, razem z ukladem grup i przygotowaniem drabinki.

Biuro zawodow nie musi spelniac wymagan dostepnosci WCAG, ale publiczny terminarz musi byc w pelni czytelny dla osob niewidomych i slabowidzacych.

## Status wdrozenia

Stan na 2026-05-19:

- fundament danych `tournament_schedule` jest wdrozony,
- publiczne API i publiczny widok `Terminarz` sa wdrozone,
- modul biura ma zakladke `Plan turnieju`, ktora pozwala konfigurowac grupy startowe A/B/C oraz dodawac, edytowac, generowac i usuwac wpisy terminarza,
- panel admina ma zakladke `Plan turnieju`, ktora laczy konfiguracje grup A/B/C z edytorem terminarza,
- testy lifecycle obejmuja zapis grup w adminie i biurze, generowanie wpisow harmonogramu, reczne wpisy biura, publiczny `access_key`, sortowanie wpisow i powiazanie harmonogramu z wynikami.

## Stan obecny

### Publiczny live

- `frontend/index.html` ma gotowa strukture zakladek glownej strony oraz podzakladek `live`.
- `frontend/src/main.js` obsluguje juz routing hash dla `live`, `tournaments` i `players`.
- Publiczna strona ma dobre podstawy dostepnosci: `skip-link`, `sr-only`, `aria-live`, tablisty oraz tabele dla drabinki.
- Publiczne API turniejowe istnieje w `wyniki/api/brackets.py` i wystawia juz dane dla:
  - listy turniejow,
  - drabinki,
  - historii meczow.

### Biuro / admin

- `wyniki/api/office.py` wystawia osobny modul biura turnieju oparty o `slot` i uwierzytelnianie haslem biura.
- `wyniki/api/admin_tournaments.py` buduje `office dashboard`, ktory zawiera postep grup i historie / wyniki meczow.
- `frontend/admin.html` i `frontend/src/admin.js` maja zakladke `Plan turnieju` z konfiguracja grup i terminarza.
- `frontend/office.html` i `frontend/src/office.js` maja analogiczny, autoryzowany moduł dla biura zawodow, dzialajacy bez dostepu do panelu admina.
- Backend korzysta ze wspolnych funkcji `fetch_bracket_groups()`, `save_bracket_groups()`, `fetch_tournament_schedule()` i `upsert_tournament_schedule_entries()` w adminie oraz w office.

### Model danych

- `wyniki/db_models.py` oraz `wyniki/database.py` traktuja `matches` jako zapis rzeczywistego meczu lub wyniku, a nie planu.
- `matches` ma pola wyniku, fazy, grupy i statusu, ale nie ma pol harmonogramu.
- `get_full_bracket()` w `wyniki/database.py` buduje kategorie i grupy na podstawie nazw grup oraz zakonczonych meczow.

## Decyzja architektoniczna

### Nie rozszerzac `matches` jako jedynego zrodla terminarza

`matches` przechowuje stan operacyjny i wynikowy. Terminarz jest planem i musi obslugiwac przypadki:

- mecz zaplanowany, ale jeszcze nieutworzony w `matches`,
- przesuniecie godziny bez zmiany wyniku,
- odwolywanie lub przeniesienie meczu,
- kilka rewizji planu przed rozpoczeciem gry,
- jeden slot planu powiazany dopiero pozniej z realnym `Match.id`.

Z tego powodu najlepszym rozwiazaniem jest osobna tabela planistyczna, powiazana z turniejem, grupa, kortem i opcjonalnie z realnym meczem.

## Proponowany model danych

### Nowa tabela `tournament_schedule`

Minimalny zakres:

- `id`
- `tournament_id`
- `day_date` - data dnia harmonogramu, format `YYYY-MM-DD`
- `category_name` - nazwa kategorii widoczna publicznie
- `bracket_group_id` - opcjonalnie dla fazy grupowej
- `phase` - np. `Grupowa`, `Pucharowa`, `B1 Kobiety - Polfinal`, `Final`
- `court_id` - przypisany kort
- `court_label` - opcjonalny cache etykiety kortu do prezentacji
- `scheduled_time` - orientacyjna godzina `HH:MM`
- `estimated_start_at` - opcjonalny pelny znacznik czasu, jesli zechcemy liczyc opoznienia
- `sort_order` - jawna kolejnosc w ramach dnia / kortu
- `player1_name`
- `player2_name`
- `status` - `draft`, `scheduled`, `in_progress`, `completed`, `cancelled`, `moved`
- `source_type` - `group`, `knockout`, `manual`
- `source_ref_id` - opcjonalnie id grupy / slotu / innego obiektu zrodlowego
- `match_id` - opcjonalne powiazanie z `matches.id`, gdy mecz zostanie uruchomiony
- `notes_public` - opcjonalna notatka widoczna publicznie, np. `godzina orientacyjna`
- `notes_internal` - opcjonalna notatka tylko dla biura
- `created_at`
- `updated_at`

### Powody dla osobnej tabeli

- Nie mieszamy planu i wyniku.
- Mozemy publikowac terminarz przed rozpoczeciem meczow.
- Mozemy miec kilka wpisow dla tego samego kortu i dnia bez tworzenia sztucznych rekordow `matches`.
- Mozemy bezpiecznie synchronizowac plan z biurem, a realny wynik dalej pozostaje w obecnym modelu.

## Integracja z istniejaca domena turniejowa

### Z grupami

Harmonogram powinien korzystac z tego samego slownika grup, co `fetch_bracket_groups()` i `save_bracket_groups()`.

Zalecenie:

- jesli wpis terminarza dotyczy meczu grupowego, zapisujemy `bracket_group_id`,
- kategorie publiczne wyprowadzamy z nazwy grupy tym samym sposobem, ktory juz dzis obsluguje drabinka,
- mozliwy jest tryb `Generuj mecze grupowe do terminarza`, ktory tworzy zestaw wszystkich par dla grupy, ale nie oznacza ich jeszcze jako zakonczone.

### Z drabinka pucharowa

Na start nie trzeba generowac automatycznie wszystkich meczow pucharowych do planu. Wystarczy:

- dodac mozliwosc recznego tworzenia wpisu `Pucharowa`,
- zostawic miejsce pod etap 2, w ktorym po wygenerowaniu drabinki da sie dodac do terminarza sloty pucharowe jednym kliknieciem.

### Z realnym meczem na korcie

Kiedy mecz zacznie byc rozgrywany z aplikacji sedziowskiej lub zostanie dopisany wynik przez biuro:

- jesli `match_id` nie jest jeszcze ustawione, backend powinien probowac dopiac harmonogram do realnego meczu po:
  - `tournament_id`,
  - fazie,
  - grupie,
  - parze zawodnikow,
  - oknie czasowym.
- po dopieciu zmieniamy `status` wpisu terminarza na `in_progress` albo `completed`.

## Backend: plan zmian

### 1. Baza i migracje

Pliki:

- `wyniki/database.py`
- `wyniki/db_models.py`

Zakres:

- dodac SQL tworzenia tabeli `tournament_schedule`,
- dodac migracje `ALTER TABLE` dla ewentualnych przyszlych pol,
- dodac model SQLAlchemy `TournamentSchedule`,
- dodac indeksy co najmniej dla:
  - `(tournament_id, day_date, sort_order)`,
  - `(tournament_id, court_id, day_date, scheduled_time)`,
  - `(match_id)`.

### 2. Funkcje dostepowe w `database.py`

Dodac funkcje:

- `fetch_tournament_schedule(tournament_id, public_only=False)`
- `upsert_tournament_schedule_entries(tournament_id, entries)`
- `update_tournament_schedule_entry(tournament_id, schedule_id, payload)`
- `delete_tournament_schedule_entry(tournament_id, schedule_id)`
- `link_schedule_to_match(tournament_id, match_id, ...)`
- `build_public_schedule_payload(tournament_id)`

Wazne: payload publiczny powinien byc juz zgrupowany po dniach i kategoriach, bo frontend live jest lekki i obecnie preferuje gotowe struktury.

### 3. Publiczne API

Najlepszy punkt rozszerzenia: `wyniki/api/brackets.py`.

Dodac endpointy:

- `GET /api/tournament/<tid>/schedule`
- opcjonalnie `GET /api/tournament/schedule?tournament_id=...` dla aktywnego turnieju na glownej zakladce live

Wymagania:

- respektowanie `is_public` i `access_key`, tak samo jak przy drabince i historii,
- brak danych wewnetrznych biura,
- stabilny kontrakt JSON do uzycia przez `main.js`.

Proponowany ksztalt payloadu:

```json
{
  "tournament": {"id": 12, "name": "Blind Cup 2026"},
  "days": [
    {
      "date": "2026-05-21",
      "label": "Czwartek, 21.05.2026",
      "categories": [
        {
          "name": "B1 Kobiety",
          "matches": [
            {
              "id": 101,
              "time": "10:00",
              "court_id": "court-2",
              "court_name": "Kort 2",
              "phase": "Grupowa",
              "group_name": "B1 Kobiety - Grupa A",
              "player1_name": "Anna A1",
              "player2_name": "Anna A2",
              "status": "scheduled",
              "notes_public": "Godzina orientacyjna"
            }
          ]
        }
      ]
    }
  ]
}
```

### 4. API admin / biura

Najlepszy punkt rozszerzenia: nowy plik `wyniki/api/admin_schedule.py` oraz lekkie rozszerzenie `wyniki/api/office.py`.

Admin:

- `GET /admin/api/tournaments/<tid>/schedule`
- `POST /admin/api/tournaments/<tid>/schedule`
- `PUT /admin/api/tournaments/<tid>/schedule/<schedule_id>`
- `DELETE /admin/api/tournaments/<tid>/schedule/<schedule_id>`
- opcjonalnie `POST /admin/api/tournaments/<tid>/schedule/generate-group-round-robin`

Office:

- nie dublowac logiki,
- `office.py` powinno raczej korzystac z tych samych funkcji bazowych,
- `GET /api/office/<slot>/planning` zwraca zawodnikow, grupy, terminarz, korty i dashboard,
- `PUT /api/office/<slot>/planning/groups` zapisuje grupy z poziomu biura,
- `POST /api/office/<slot>/schedule` dodaje lub aktualizuje reczne wpisy terminarza,
- `DELETE /api/office/<slot>/schedule/<schedule_id>` usuwa wpis terminarza,
- edycja w biurze pozostaje ograniczona tokenem biura danego slotu.

## Frontend: plan zmian

### Publiczna strona live

Pliki:

- `frontend/src/main.js`
- `frontend/index.html`
- `frontend/src/main.css`

Zmiany:

- dodac nowa podzakladke `schedule` obok `scores`, `bracket`, `history`,
- rozszerzyc routing hash o `#live/schedule`,
- dodac translacje dla:
  - planu dnia,
  - dni,
  - kategorii,
  - kortu,
  - statusu,
  - komunikatow pustego stanu,
  - etykiet dostepnosci.
- dodac `fetchSchedule()` analogicznie do `fetchBracket()` i `fetchTournamentHistory()`.

### Uklad publiczny

Najbezpieczniejszy dla dostepnosci i utrzymania jest uklad:

- sekcja dnia,
- wewnatrz lista kategorii,
- wewnatrz kategoria jako tabela albo lista kart z silna struktura semantyczna.

Rekomendacja:

- desktop: tabela harmonogramu,
- mobile: ten sam DOM, ale wizualnie przechodzacy w karty przez CSS,
- nie budowac skomplikowanego drag-and-drop ani osi czasu po stronie publicznej.

### Panel admina

Pliki:

- `frontend/src/admin.js`
- `frontend/admin.html`

Rekomendacja UX:

- nie rozszerzac obecnej zakladki `Biuro turnieju` o wszystko,
- dodac nowa zakladke robocza `Plan turnieju` albo `Ustawienia turnieju`,
- w tej zakladce pokazac workflow:
  1. wybierz turniej,
  2. przygotuj grupy,
  3. wygeneruj lub dopisz mecze do terminarza,
  4. przypisz korty i godziny,
  5. opublikuj.

To jest lepsze niz wrzucenie terminarza do obecnego `office dashboard`, bo obecne biuro jest zaprojektowane pod szybkie wyniki, a nie pod planowanie calego dnia.

## Konfiguracja grup w UI

Backend ma API dla grup i drabinki, a panel admina udostepnia zakladke `Plan turnieju`, ktora zapisuje `bracket_groups` przez endpoint `admin/api/tournaments/<tid>/bracket/groups`.

To oznacza, ze najrozsadniejsza droga wdrozenia jest wspolny modul organizacyjny:

- `Grupy`,
- `Terminarz`,
- `Drabinka`.

W praktyce:

- harmonogram nie powinien byc wdrazany jako osobny, izolowany panel,
- jeden obszar `Plan turnieju` traktuje grupy jako pierwszy krok, a terminarz jako drugi.

## Dostepnosc publicznego terminarza

### Wymagania niefunkcjonalne

Publiczny terminarz ma byc w pelni uzywalny dla:

- czytnikow ekranu,
- osob slabowidzacych,
- klawiatury bez myszy,
- wysokiego powiekszenia i reflow mobilnego.

### Konkretne zasady implementacyjne

1. Uzyc prawidlowej semantyki dokumentu.

- naglowki `h2` dla dnia,
- `h3` dla kategorii,
- `table` z `caption`, `thead`, `tbody` jesli uklad jest tabelaryczny,
- `time datetime="..."` dla dat i godzin.

2. Nie polegac na kolorze.

- statusy musza miec tekst, nie tylko kolor,
- przyklad: `Planowany`, `W toku`, `Zakonczony`, `Przeniesiony`.

3. Zapewnic pelna obsluge klawiatura.

- kolejnosc fokusu zgodna z ukladem dnia,
- brak komponentow wymagajacych hover,
- wyrazny focus ring.

4. Dodac warstwe opisowa dla czytnikow ekranu.

- `aria-label` dla linkow i przyciskow,
- zwięzly opis meczu, np. `Czwartek 21 maja, godzina 10:00, Kort 2, B1 Kobiety, Anna A1 kontra Anna A2, faza grupowa`.

5. Powiadamiac o zmianach planu.

- jesli terminarz bedzie odswiezany dynamicznie, dodac osobny region `aria-live="polite"`,
- nie oglaszac calej strony przy kazdej zmianie, tylko krotki komunikat o zmianie wpisu.

6. Zapewnic czytelnosc wizualna.

- wysoki kontrast,
- duze odstępy wierszy,
- brak scisnietych chipow jako jedynego nosnika informacji,
- dobra obsluga trybu jasnego i ciemnego.

7. Dodac szybkie przejscia.

- skip-link do `Plan dnia`,
- opcjonalna nawigacja po dniach jako lista linkow.

### Kryteria akceptacji dostepnosci

- caly terminarz da sie przeczytac i przejsc sama klawiatura,
- NVDA / VoiceOver czytaja strukture dnia, kategorii, godziny, kortu i zawodnikow bez utraty kontekstu,
- przy powiekszeniu 200 procent nic sie nie naklada ani nie ucina,
- zmiana statusu meczu jest anonsowana, ale nie zalewa czytnika ekranu.

## Kolejnosc wdrozenia

### Etap 1. Fundament danych

- dodac tabele i model `tournament_schedule`,
- dodac funkcje bazowe CRUD,
- dodac testy migracyjne i test kasowania turnieju razem z harmonogramem.

### Etap 2. Publiczne API i odczyt

- dodac endpoint publiczny `/api/tournament/<tid>/schedule`,
- dodac testy widocznosci dla turniejow publicznych i prywatnych,
- zachowac obecne reguly `access_key`.

### Etap 3. Widok publiczny

- dodac zakladke `Plan dnia` w `live`,
- dodac hash routing,
- wdrozyc semantyczny widok tabelaryczny i test reczny dostepnosci.

### Etap 4. Adminowy edytor terminarza

- dodac zakladke organizacyjna w adminie,
- CRUD wpisow harmonogramu,
- filtrowanie po dniu, kategorii i korcie,
- szybkie przepinanie meczow miedzy kortami.

### Etap 5. Integracja z grupami

- zrobic ekran grup korzystajacy z istniejacego backend API,
- dodac akcje `generuj mecze grupowe do terminarza`,
- pilnowac spojnosc nazw kategorii i grup.

### Etap 6. Powiazanie z realnym meczem

- automatycznie dopinac `match_id` po starcie lub zapisaniu wyniku,
- odswiezac status wpisu terminarza,
- wyswietlac w publicznym widoku, ze mecz jest juz `na zywo` albo `zakonczony`.

## Testy

Najlepsze miejsce startu: `test_tournament_lifecycle.py`, bo juz obejmuje:

- cykl zycia turnieju,
- publiczne API turniejowe,
- grupy i drabinki,
- office dashboard.

Dodac testy dla:

- tworzenia i pobierania harmonogramu,
- filtrowania publicznego / prywatnego,
- kolejnosci dni i godzin,
- powiazania harmonogramu z grupa,
- dopiecia `match_id` po zapisaniu wyniku,
- usuniecia harmonogramu przy kasowaniu turnieju.

## Rekomendacja koncowa

Wdrozyc funkcje jako osobny modul danych `tournament_schedule`, ale produktowo pokazac go jako czesc jednego workflow przygotowania turnieju:

- grupy,
- terminarz,
- wyniki i drabinka.

To minimalizuje ryzyko architektoniczne, wykorzystuje juz istniejace API i zachowuje czysty podzial miedzy planem a rzeczywistym przebiegiem meczow.