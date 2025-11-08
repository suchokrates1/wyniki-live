# 🎾 Realistic Load Test - Instrukcja

Ten test symuluje 4 korty tenisowe z pełną progresją meczów, sprawdza efektywność pollowania i poprawność przetwarzania danych.

## Wymagania

- Python 3.7+
- Działające środowisko wyniki-live
- Porty 8080 (app) i 5001 (mock UNO) wolne

## Uruchomienie testu

### Krok 1: Uruchom Mock UNO API Server

W **pierwszym terminalu**:

```bash
python mock_uno_server.py
```

Powinieneś zobaczyć:
```
🎾 Mock UNO API Server starting on http://localhost:5001
Stats available at: http://localhost:5001/stats
```

### Krok 2: Uruchom wyniki-live

W **drugim terminalu**:

```bash
python app.py
```

Powinieneś zobaczyć:
```
INFO: Starting wyniki server on port 8080
* Running on http://127.0.0.1:8080
```

### Krok 3: Uruchom test obciążeniowy

W **trzecim terminalu**:

```bash
python realistic_load_test.py
```

Test będzie działał przez **5 minut** i wyświetli:
- ✅ Status konfiguracji kortów
- 🎾 Rozpoczęcie meczów
- ⏱️  Regularneaktualizacje co 15s
- 📊 Statystyki zapytań
- 🔬 Analiza efektywności pollowania

## Co test sprawdza?

### 1. Konfiguracja (Setup)
- ✅ Czy korty można skonfigurować z UNO API URLs
- ✅ Czy komunikacja z mock UNO działa

### 2. Rozpoczęcie meczów
- 🎾 Ustawienie nazw graczy (4 mecze):
  - Kort 1: Rafael Nadal vs Novak Djokovic
  - Kort 2: Roger Federer vs Andy Murray
  - Kort 3: Carlos Alcaraz vs Daniil Medvedev
  - Kort 4: Iga Swiatek vs Aryna Sabalenka
- ✅ Aktywacja overlayów (start meczy)

### 3. Progresja meczu
- 📈 Mock UNO symuluje realistyczną progresję punktów:
  - 0 → 15 → 30 → 40 → gem
  - Deucy (40-40 → ADV → gem lub deuce)
  - Sety (6-4, 7-6, etc.)
- ⏰ Punkty zmieniają się co **10 sekund** (zgodnie z POINT_INTERVAL_IN_MATCH)

### 4. Weryfikacja danych
- ✅ Czy snapshot zawiera dane kortów?
- ✅ Czy punkty są obecne (A.points, B.points)?
- ✅ Czy nazwy graczy są poprawne?
- ✅ Czy overlay_visible == true?

### 5. Analiza zapytań (Request Analysis)
Mock UNO API liczy wszystkie zapytania:

**Oczekiwane wartości** (dla 5-minutowego testu):
- `GetPointsPlayerA/B`: ~60 zapytań (co 10s × 2 graczy × 5 min)
- `GetNamePlayerA/B`: ~15 zapytań (co 20s)
- `GetTieBreakVisibility`: ~2 zapytania (co 180s)
- `GetCurrentSetPlayerA/B`: zależne od punktów 40/ADV
- `GetSet1/2PlayerA/B`: tylko gdy games >= 3

### 6. Efektywność (Efficiency)
Test porównuje:
- **Faktyczne zapytania** vs **Oczekiwane zapytania**
- **Requests/second** (powinno być niskie, ~0.5-1 RPS)
- **Throttling effectiveness** (czy 10s interval działa?)

## Narzędzia pomocnicze

### Inspekcja snapshot (w trakcie testu)

```bash
python inspect_snapshot.py
```

Pokazuje **dokładnie** co jest w snapshot:
- Nazwy graczy
- Punkty (A.points, B.points)
- Gemy (current_games)
- Sety (set1, set2)
- Tie-break (jeśli aktywny)

### Statystyki Mock UNO

Otwórz w przeglądarce:
```
http://localhost:5001/stats
```

Zobaczysz:
```json
{
  "total_requests": 480,
  "duration_seconds": 300.5,
  "requests_per_second": 1.6,
  "by_court": {
    "test-overlay-001": {
      "GetPointsPlayerA": 30,
      "GetPointsPlayerB": 30,
      "GetNamePlayerA": 15,
      ...
    }
  },
  "courts_state": {
    "test-overlay-001": {
      "visible": true,
      "points": "30-15",
      "games": "3-2",
      "set1": "0-0"
    }
  }
}
```

## Interpretacja wyników

### ✅ Test PASSED jeśli:
- Wszystkie 4 korty zostały skonfigurowane
- Mecze startują poprawnie
- Punkty są w snapshot (nie null/undefined)
- `GetPointsPlayerA/B` ~60 razy (nie 300+!)
- Brak błędów w logach
- `Errors: 0`

### ⚠️  Sprawdź to jeśli:
- `GetPointsPlayerA/B` > 100 → **za częste pollowanie** (throttle nie działa)
- `GetNamePlayerA/B` > 50 → **name spamming** (powielane nazwy)
- `A.points = null` → **points nie docierają do frontendu**
- `Errors > 0` → **problemy z komunikacją**

### 🔬 Efektywność:
```
Points requests: 60
Expected (~10s interval): 60
Efficiency: 100% ← IDEALNE
```

Jeśli efficiency < 80% → za dużo zapytań (throttle słaby)
Jeśli efficiency > 120% → za mało zapytań (coś blokuje)

## Reset testu

Jeśli chcesz powtórzyć test:

```bash
# Zresetuj mock UNO stats
curl http://localhost:5001/reset

# Uruchom test ponownie
python realistic_load_test.py
```

## Szybki test (30 sekund)

Zmień w `realistic_load_test.py`:

```python
TEST_DURATION_MINUTES = 0.5  # 30 seconds
```

Przydatne do szybkiej weryfikacji po zmianach.

## Troubleshooting

### App nie startuje
```bash
# Sprawdź czy port 8080 jest wolny
netstat -ano | findstr :8080

# Zabij proces jeśli zajęty
taskkill /PID <PID> /F
```

### Mock UNO nie odpowiada
```bash
# Sprawdź czy działa
curl http://localhost:5001/stats

# Jeśli nie, zrestartuj:
# Ctrl+C w terminalu mock_uno_server.py
python mock_uno_server.py
```

### Brak danych w snapshot
```bash
# Sprawdź logi app.py
# Powinny być linie:
#   "INFO: uno kort=1 remote=GetPointsPlayerA"
#   "INFO: uno state kort=1 | Rafael ... pts=15 vs ..."
```

## Przykładowy output testu

```
================================================================================
🚀 WYNIKI-LIVE REALISTIC LOAD TEST
================================================================================

[02:40:00.123] INFO: 🔄 Mock server reset
[02:40:00.456] INFO: 🔧 Setting up courts...
[02:40:00.789] INFO: ✅ Court 1 configured with mock UNO API
[02:40:01.012] INFO: ✅ Court 2 configured with mock UNO API
[02:40:01.234] INFO: ✅ Court 3 configured with mock UNO API
[02:40:01.456] INFO: ✅ Court 4 configured with mock UNO API
[02:40:02.000] INFO: 🎾 Starting match on Court 1: Rafael Nadal vs Novak Djokovic
[02:40:02.500] INFO: ✅ Match started on Court 1
...
[02:45:00.000] INFO: ✅ Test completed!

================================================================================
📊 TEST STATISTICS
================================================================================

⏱️  Test Duration: 300.00 seconds (5.00 minutes)

📡 Mock UNO API Requests:
   Total Requests: 480
   Requests/Second: 1.60

🎾 Requests by Court:
   Court 1 - Total: 120 requests
      GetPointsPlayerA: 30
      GetPointsPlayerB: 30
      GetNamePlayerA: 15
      GetNamePlayerB: 15
      GetTieBreakVisibility: 2

❌ Errors: 0

================================================================================
🔬 EFFICIENCY ANALYSIS
================================================================================

Court 1:
  Points requests: 60
  Expected (~10s interval): 60
  Efficiency: 100.0% (lower is better, means less spam)

✅ Wszystko działa poprawnie!
```

## Co dalej?

Po zakończeniu testu:
1. Sprawdź **efficiency** - powinna być 90-110%
2. Zobacz **statystyki** w mock UNO
3. **Inspe ktuj snapshot** - czy punkty są obecne?
4. Przejrzyj **logi app.py** - czy są błędy?

Jeśli wszystko działa:
- ✅ Throttling 10s działa
- ✅ Points są pollowane prawidłowo
- ✅ Dane trafiają do snapshot
- ✅ Ready for production!
