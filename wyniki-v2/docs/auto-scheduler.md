# Auto-rozmieszczanie meczów (autoscheduler)

Cel: biuro turnieju nie układa godzin ręcznie. System proponuje terminarz (korty + godziny),
który zatwierdza się na interaktywnej tablicy z przeciąganiem meczów. Edycja w trakcie turnieju
działa tak samo (drag & drop z kaskadą godzin).

## Źródło prawdy: III Mistrzostwa Polski (tournament_id = 25)

Zmierzone na realnych danych (`tournament_schedule` + `match_statistics.match_duration_ms`):

- 4 korty, każdy dedykowany jednej kategorii (pasmu B):
  - kort 1 → B4 (M+K)
  - kort 2 → B3 (M+K)
  - kort 3 → B2 (M+K)
  - kort 4 → **B1 (M+K)** — kort specjalny, „przygotowany inaczej"
- Długość slotu (gap między kolejnymi meczami na korcie):
  - B2/B3/B4 → **60 min**
  - **B1 → 75 min** (dłuższe mecze; finały B1 realnie ~67–70 min)
- Start: dzień grupowy 09:30, dzień pucharowy 09:00.
- Czasy realnych meczów (mediana): grupowe ~35 min, półfinały ~30–60, finały ~50–100.
  Slot = czas meczu + bufor (rozgrzewka, zmiana, opóźnienia) ⇒ 60/75 min.

## Model konfiguracji (per turniej)

Przechowywany w `app_settings` jako JSON pod kluczem `autoscheduler:{tournament_id}`:

```json
{
  "start_time": "09:30",
  "b1_court_id": "t25-4",
  "category_courts": { "B1": "t25-4", "B2": "t25-3", "B3": "t25-2", "B4": "t25-1" },
  "slot_minutes": { "B1": 75, "default": 60 },
  "rest_slots": 1
}
```

- `start_time`, `b1_court_id` — pytane od użytkownika przy generowaniu.
- `category_courts` — przypisanie kategorii do kortu; pozostałe korty wypełniane po kolei.
- `slot_minutes` — długość slotu na kategorię (B1 dłuższy), `default` dla reszty.
- `rest_slots` — ile slotów odpoczynku minimum między meczami tego samego zawodnika.

## Algorytm (pure function, `services/auto_scheduler.py`)

Wejście: lista meczów (`category`, `gender`, `phase`, `group`, gracze, `source`, `id`), konfiguracja,
data dnia. Wyjście: lista placementów `{schedule_id|key, court_id, day_date, scheduled_time}`.

1. Przypisz każdy mecz do kortu wg `category_courts` (kategoria = pasmo B z `category_name`).
2. W obrębie kortu uporządkuj mecze: najpierw faza grupowa (kolejność round-robin metodą okręgu,
   minimalizując sąsiednie mecze tego samego zawodnika), potem pucharowe wg rundy
   (ćwierć → półfinał → o miejsca → finał).
3. Układaj sekwencyjnie od `start_time`, krok = `slot_minutes[kategoria]` (lub `default`).
4. Twardy warunek odpoczynku: jeśli zawodnik gra w slocie t, nie może grać w t+1..t+rest_slots
   na tym samym korcie ⇒ przesuń mecz w kolejce (swap z następnym).
5. Wynik to PROPOZYCJA — zapisywana jako `status='planned'` dopiero po zatwierdzeniu.

## API (blueprint office, prefix `/api/office/<slot>`)

- `GET  /autoschedule/config` — zwraca konfigurację + dostępne korty + wykryte kategorie.
- `PUT  /autoschedule/config` — zapis konfiguracji.
- `POST /autoschedule/generate` — body: `{start_time, b1_court_id, day_date?}`; zwraca propozycję
  (placementy nałożone na aktualne wpisy terminarza), NIE zapisuje statusu publikacji.
- `POST /autoschedule/apply` — zapisuje placementy (czas/kort) do `tournament_schedule`.
- `POST /autoschedule/move` — body: `{schedule_id, court_id, scheduled_time}`; przesuwa jeden mecz
  i kaskadowo przelicza godziny kolejnych meczów na docelowym (i źródłowym) korcie.

## Frontend: interaktywna tablica

Zakładka „Autorozmieszczanie" w `/office`: kolumny = korty, wiersze = godziny (sloty).
Karta meczu przeciągana (HTML5 drag & drop) między kortami/slotami; po upuszczeniu wywołanie
`/autoschedule/move`, które zwraca przeliczony terminarz. Przycisk „Zatwierdź" → `/autoschedule/apply`.

## Etapy wdrożenia

1. (✓) Pomiar III MP, design.
2. Moduł `auto_scheduler.py` + testy jednostkowe (pure, bez DB).
3. Persystencja konfiguracji + helpery placementu w `database.py`.
4. Endpointy w `api/office.py`.
5. Tablica drag & drop w `office.html` / `office.js`.
6. Testy integracyjne, build, deploy.
