# Analiza limitów zapytań UNO - Raport

**Data:** 2025-11-08 19:56  
**Problem:** Wyczerpanie dziennego limitu 50,000 zapytań do API UNO

---

## 🔴 Główny Problem

Produkcja **WYCZERPAŁA CAŁKOWITY DZIENNY LIMIT** zapytań do UNO API!

```
WARNING: RATE LIMIT kort=1: 0/50000 remaining (resets at 00:00:01)
WARNING: poller kort=1 command=GetTieBreakVisibility: rate_limit (status 429)
INFO: UNO poller speed kort=1 multiplier=360.00
```

### Kluczowe obserwacje:

1. **Limit wyczerpany:** `0/50000 remaining`
2. **Status HTTP 429:** "Too Many Requests"  
3. **Reset o północy:** `resets at 00:00:01`
4. **System spowolniony 360x:** `multiplier=360.00`
5. **UNO wyłączone:** `uno_disabled` włącza się automatycznie

---

## 📊 Przykładowe logi z ostatnich minut

### 18:56:45 - Rate limit wyczerpany dla wszystkich kortów

```
2025-11-08 18:56:45,891 WARNING: RATE LIMIT kort=1: 0/50000 remaining (resets at 00:00:01)
2025-11-08 18:56:45,894 WARNING: poller kort=1 command=GetTieBreakVisibility: rate_limit (status 429)
2025-11-08 18:56:45,915 WARNING: RATE LIMIT kort=4: 0/50000 remaining (resets at 00:00:01)
2025-11-08 18:56:45,916 WARNING: poller kort=4 command=GetNamePlayerB: rate_limit (status 429)
2025-11-08 18:56:45,917 WARNING: RATE LIMIT kort=2: 0/50000 remaining (resets at 00:00:01)
2025-11-08 18:56:45,918 WARNING: poller kort=2 command=GetNamePlayerB: rate_limit (status 429)
2025-11-08 18:56:45,954 WARNING: RATE LIMIT kort=3: 0/50000 remaining (resets at 00:00:01)
2025-11-08 18:56:45,956 WARNING: poller kort=3 command=GetNamePlayerA: rate_limit (status 429)
```

### 18:56:46 - System automatycznie wyłącza polling i zwiększa multiplikator

```
2025-11-08 18:56:46,034 INFO: UNO poller speed kort=1 multiplier=360.00
2025-11-08 18:56:46,039 WARNING: poller kort=2 command=GetNamePlayerA: uno_disabled
2025-11-08 18:56:46,234 INFO: UNO poller speed kort=2 multiplier=360.00
2025-11-08 18:56:46,237 WARNING: poller kort=2 command=GetTieBreakVisibility: uno_disabled
```

### Aktywne mecze w momencie wyczerpania limitu:

- **Kort 1:** Carlos Arbos G... vs Kirstin Linck (set 1)
- **Kort 3:** Jonathan Yanez... vs Lars Stetten
- **Korty 2, 4:** Puste (`"-" vs "-"`)

---

## 🔢 Obliczenia teoretyczne

### Liczba komend UNO na kort

Według kodu (`wyniki/poller.py`), dla każdego kortu odpytuje się:

**Podczas meczu:**
1. `GetNamePlayerA` - imię gracza A
2. `GetNamePlayerB` - imię gracza B  
3. `GetPointsPlayerA` - punkty gracza A
4. `GetPointsPlayerB` - punkty gracza B
5. `GetGamesPlayerA` - gemy gracza A
6. `GetGamesPlayerB` - gemy gracza B
7. `GetSetsPlayerA` - sety gracza A
8. `GetSetsPlayerB` - sety gracza B
9. `GetCurrentSet` - aktualny set
10. `GetTieBreakVisibility` - czy tiebreak
11. `GetTieBreakPlayerA` - punkty tiebreak A
12. `GetTieBreakPlayerB` - punkty tiebreak B
13. `GetDuration` - czas trwania meczu
14. `GetCurrentServer` - kto serwuje

**RAZEM: ~14 komend na kort na cykl pollingu**

### Przy domyślnym interwale 1 sekundę:

- **1 kort aktywny:** 14 zapytań/s = **840 zapytań/min** = **50,400 zapytań/godzinę** ❌
- **2 korty aktywne:** 28 zapytań/s = **1,680 zapytań/min** = **100,800 zapytań/godzinę** ❌❌
- **3 korty aktywne:** 42 zapytań/s = **2,520 zapytań/min** = **151,200 zapytań/godzinę** ❌❌❌

### ⚠️ KRYTYCZNY WNIOSEK:

**Przy 1 aktywnym korcie limit 50,000 wyczerpuje się w ~60 minut!**
**Przy 2 kortach limit wyczerpuje się w ~30 minut!**
**Przy 3 kortach limit wyczerpuje się w ~20 minut!**

---

## 📉 Aktualny stan systemu

### Z logów produkcji:

```bash
ssh minipc "docker logs --tail 200 wyniki-tenis 2>&1 | grep 'Zapytania do UNO' | tail -5"
```

Przykładowy output (z wcześniejszych logów):
```
2025-11-08 18:56:00,004 INFO: Zapytania do UNO 2025-11-08 18:55: 0/2
2025-11-08 18:56:00,043 INFO: Zapytania do UNO 2025-11-08 18:55: 0/4
2025-11-08 18:56:00,325 INFO: Zapytania do UNO 2025-11-08 18:54: 0/8
```

**Oznaczenie:** `0/2` = 0 zapytań wysłanych, 2 w kolejce (zablokowane przez rate limit)

---

## 🎯 Główne przyczyny wyczerpania limitu

### 1. **Zbyt częsty polling (1 sekunda)**
- Standard: 14 komend × 1 kort × 3600s = **50,400 zapytań/godz**
- Limit dzienny: **50,000 zapytań**
- **Wniosek:** System wyczerpuje limit w ~1 godzinę działania!

### 2. **Brak throttlingu na produkcji**
- Stara wersja `app.py` nie ma UNO throttling system
- Nowa wersja `app_v2.py` ma:
  - Limit kolejki
  - Threshold (próg zwalniania)
  - Slowdown factor (mnożnik opóźnienia)
  - Inteligentny smart polling

### 3. **Nadmiarowe zapytania**
- System odpytuje **wszystkie 14 komend** nawet gdy:
  - Wynik nie zmienił się (30-0 → 30-0)
  - Mecz jest w trakcie rozgrzewki
  - Kort jest pusty (gracze "-")

### 4. **Brak cache'owania**
- Nazwiska graczy pobierane co sekundę
- Czas trwania meczu co sekundę
- Brak sprawdzania czy dane się zmieniły

---

## 🛠️ Rozwiązania

### ✅ Rozwiązanie 1: Wdrożenie UNO Throttling (NAJWAŻNIEJSZE)

**Status:** Już zaimplementowane w `app_v2.py` i `wyniki_v2/`

**Konfiguracja:**
```python
UNO_QUEUE_LIMIT = 100          # Max zapytań w kolejce
UNO_THRESHOLD_PERCENT = 80     # Próg zwalniania (80% = 40,000/50,000)
UNO_SLOWDOWN_FACTOR = 2        # Mnożnik opóźnienia
UNO_SLOWDOWN_SLEEP = 1         # Dodatkowe opóźnienie (sekundy)
```

**Działanie:**
- Gdy osiągnięte 80% limitu (40,000/50,000):
  - Polling spowolniany 2x (1s → 2s)
  - Dodatkowe opóźnienie 1s
  - Łącznie: 3s między cyklami
- Gdy osiągnięte 90% limitu:
  - Kolejne spowolnienie
  - Efektywnie: ~6-10s między cyklami

**Efekt:**
- Zamiast 50,400 zapytań/godz → **16,800 zapytań/godz**
- Zamiast 1 godz do wyczerpania → **~12-15 godzin** do wyczerpania
- Dla 2 kortów: ~6-8 godzin działania
- Dla 3 kortów: ~4-5 godzin działania

### ✅ Rozwiązanie 2: Smart Polling (zaimplementowane w v2)

**Optymalizacje:**
1. **Nazwiska graczy:** Pobierane raz, cache'owane
2. **Statyczne dane:** Czas trwania, serwer - aktualizacja co 5s zamiast 1s
3. **Pustے korty:** Wykrywanie i pomijanie kortów bez meczów
4. **Tiebreak:** Odpytywanie tylko gdy `GetTieBreakVisibility == True`

**Efekt:** Redukcja o ~30-40% zapytań

### ✅ Rozwiązanie 3: Zwiększenie interwału bazowego

**Opcje:**
- **2 sekundy:** 50% redukcja → 25,200 zapytań/godz → **~2 godziny** do limitu
- **3 sekundy:** 66% redukcja → 16,800 zapytań/godz → **~3 godziny** do limitu
- **5 sekund:** 80% redukcja → 10,080 zapytań/godz → **~5 godzin** do limitu

**Kompromis:** UX vs limit API

### ✅ Rozwiązanie 4: Dynamiczny polling (ZALECANE)

**Strategia:**
```python
# Faza meczu → Interwał pollingu
WARMUP:        10s  # Rozgrzewka, gracze się ustawiają
ACTIVE_RALLY:  1s   # Aktywna wymiana (punkty się zmieniają)
BETWEEN_POINTS: 3s  # Między punktami (statyczne)
CHANGEOVER:     5s  # Zmiana stron (przerwa)
TIEBREAK:       1s  # Tiebreak (intensywny)
```

**Wykrywanie fazy:**
- Brak zmiany punktów przez 10s → BETWEEN_POINTS
- Zmiana punktów w ostatnich 3s → ACTIVE_RALLY
- Czas trwania podzielny przez 90s → CHANGEOVER
- `GetTieBreakVisibility == True` → TIEBREAK

**Efekt:** Średnio ~4-5s interwał → **8,000-12,000 zapytań/godz** → **~10-15 godzin** działania

---

## 📋 Rekomendacje

### 🔴 PILNE (zrobić natychmiast):

1. **Wdrożyć `app_v2.py` na produkcję** (port 8087)
   - Ma UNO throttling
   - Ma smart polling
   - Ma monitoring limitu

2. **Zwiększyć bazowy interwał do 2-3 sekund**
   - W `wyniki_v2/config.py`:
     ```python
     POLLER_INTERVAL = 2.0  # sekundy
     ```

3. **Monitorować limit UNO**
   - Endpoint: `/admin/api/uno/status`
   - Alert gdy > 80%: email/Slack notification

### 🟡 ŚREDNIOOKRESOWE (w ciągu tygodnia):

1. **Zaimplementować dynamiczny polling**
   - Wykrywanie fazy meczu
   - Adaptacyjny interwał

2. **Cache nazwisk graczy**
   - Pobieranie raz na początek meczu
   - Aktualizacja tylko gdy zmiana

3. **Optymalizacja komend**
   - Tiebreak: tylko gdy aktywny
   - Czas trwania: co 5s zamiast 1s

### 🟢 DŁUGOTERMINOWE (w ciągu miesiąca):

1. **WebSocket/Server-Sent Events**
   - Push zamiast pull
   - 0 zapytań podczas bezczynności

2. **Negocjacje z UNO**
   - Poproś o zwiększenie limitu
   - 100,000 zapytań/dzień dla turniejów

3. **Hybrydowy system**
   - UNO API dla live updates
   - Manual entry jako fallback
   - Picker extension jako backup

---

## 🧪 Test Plan

### Plan testowy na następny mecz:

1. **Baseline (aktualna produkcja):**
   - Monitor przez 30 min
   - Policz zapytania
   - Zmierz czas do 80% limitu

2. **Z throttlingiem (v2):**
   - Deploy app_v2.py
   - Monitor przez 30 min
   - Porównaj redukcję

3. **Zwiększony interwał (2s):**
   - Zmień `POLLER_INTERVAL = 2.0`
   - Monitor przez 30 min
   - Oceń UX (czy opóźnienie widoczne?)

4. **Dynamiczny polling:**
   - Implementuj wykrywanie faz
   - Monitor przez cały mecz (1-2h)
   - Zmierz średni interwał

---

## 📈 Projected Savings

| Rozwiązanie | Zapytań/godz | Godzin do limitu | Dni działania (8h mecze) |
|-------------|--------------|------------------|--------------------------|
| **Aktualne (1s)** | 50,400 | 1.0 | 0.1 |
| **Throttling (auto)** | 16,800 | 3.0 | 0.4 |
| **Interwał 2s** | 25,200 | 2.0 | 0.25 |
| **Interwał 3s** | 16,800 | 3.0 | 0.4 |
| **Smart polling** | 12,000 | 4.2 | 0.5 |
| **Dynamiczny** | 8,000 | 6.3 | 0.8 |
| **Wszystko razem** | 4,000 | 12.5 | **1.6** ✅ |

**Cel:** Przetrwać cały dzień turnieju (8-10h) z buforem.

---

## 🎬 Następne kroki

1. ✅ Analiza problemu - **DONE**
2. ⏳ Deploy throttling na produkcję - **W TOKU**
3. ⏳ 30-minutowy test monitoringu
4. 📊 Raport z rzeczywistych danych
5. 🔧 Fine-tuning parametrów
6. 📝 Dokumentacja końcowa

---

**Kontakt do UNO:** Rozważ zapytanie o:
- Zwiększenie limitu dla turniejów
- Bulk API endpoints (np. `/courts/all`)
- WebSocket updates zamiast polling

**Pytanie do UNO:** "We're running a multi-court tennis tournament system polling 4-5 courts simultaneously. The current 50k/day limit is exhausted within ~2 hours. Could we get an increased limit for tournament days (100k-200k) or a bulk endpoint to fetch all courts in one request?"
