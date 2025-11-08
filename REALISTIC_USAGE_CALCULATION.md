# 📊 REALISTYCZNE ZUŻYCIE API - Obliczenia na turniej 9.11.2025

**Założenia:**
- Turniej: 9:00 - 18:00 (9 godzin)
- 4 korty aktywne
- Optymalizowane interwały (15s punkty, 60s nazwiska)

---

## ⏱️ RZECZYWISTY RYTM MECZÓW

### Typowy mecz turniejowy:

**Czas trwania:**
- Krótki mecz (2 sety): 45-60 min
- Średni mecz (3 sety, bez TB): 60-80 min  
- Długi mecz (3 sety + tiebreak): 80-120 min
- **ŚREDNIA: 70 minut (1h 10min)**

**Przerwy między meczami:**
- Zmiana graczy na korcie: 5 min
- Rozgrzewka: 5 min
- Przygotowanie (sprzęt, wynik zerowany): 5 min
- **ŚREDNIA PRZERWA: 15 minut**

**Pełny cykl mecz + przerwa:**
```
70 min (mecz) + 15 min (przerwa) = 85 minut ≈ 1.4 godziny
```

---

## 🎾 FAZY MECZU I POLLING

### 1. PRZERWA (15 min) - Kort pusty lub rozgrzewka

**Co pollujemy:**
- `GetNamePlayerA`: co 60s = 1 raz na 15min
- `GetNamePlayerB`: co 60s = 1 raz na 15min
- `GetTieBreakVisibility`: co 300s = 0 razy (300s = 5min, więc max 3 razy w 15min)

**Punkty NIE są pollowane** - precondition wykrywa że kort pusty (`"-" vs "-"`)

**Zapytania w przerwie:**
```
15 minut / 60s = 0.25 razy → zaokrąglamy w górę
GetNameA: 1 zapytanie
GetNameB: 1 zapytanie  
GetTieBreakVis: 1 zapytanie
RAZEM: 3 zapytania na 15 min przerwy
```

### 2. MECZ (70 min) - Aktywna gra

**Pollujemy wszystko:**

#### Zawsze wykonywane:
- `GetPointsPlayerA`: co 15s = 4 razy/min = 280 razy w 70min
- `GetPointsPlayerB`: co 15s = 4 razy/min = 280 razy w 70min
- `GetNamePlayerA`: co 60s = 1 raz/min = 70 razy w 70min
- `GetNamePlayerB`: co 60s = 1 raz/min = 70 razy w 70min
- `GetTieBreakVisibility`: co 300s = 0.2 razy/min = 14 razy w 70min

**Subtotal zawsze:** 280 + 280 + 70 + 70 + 14 = **714 zapytań**

#### Warunkowe (z preconditions):

**GetCurrentSetPlayerA/B** - tylko przy 40/ADV:
- W gemie: ~8 punktów
- Przy 40: ~2 punkty (40-0, 40-15, 40-30, 40-40)
- Prawdopodobieństwo 40: 25% czasu gemu
- Gem trwa: ~5 min średnio
- 70 min meczu = 14 gemów
- 14 gemów × 25% × 5min = 17.5 min przy 40
- GetCurrentSet: co 15s = 4 razy/min
- **17.5 min × 4 = 70 zapytań GetCurrentSet (A+B)**

**GetSet1PlayerA/B** - tylko gdy games >= 3:
- Od 3:0 do końca seta (~15-25 min na set)
- 2 sety średnio = 35 min z games >= 3
- GetSet1: co 15s = 4 razy/min
- **35 min × 4 × 2 graczy = 280 zapytań**

**GetSet2PlayerA/B** - tylko gdy drugi set i games >= 3:
- Jeśli 3 sety: drugi i trzeci set, ~30 min z games >= 3
- Prawdopodobieństwo 3 setów: ~40%
- **30 min × 4 × 2 graczy × 40% = 96 zapytań**

**Tiebreak (jeśli występuje):**
- Prawdopodobieństwo TB: ~20% meczów, 1 TB per mecz
- TB trwa: ~8 min
- W trybie TB:
  - `GetTieBreakPlayerA`: co 12s = 5 razy/min
  - `GetTieBreakPlayerB`: co 12s = 5 razy/min
  - `GetTieBreakVisibility`: co 90s = 0.67 razy/min
- **8 min × (5+5+0.67) = 85 zapytań**
- Ale tylko 20% meczów: **85 × 0.2 = 17 zapytań średnio**

**Subtotal warunkowe:** 70 + 280 + 96 + 17 = **463 zapytania**

### TOTAL na 1 mecz (70 min):
```
Zawsze:      714 zapytań
Warunkowe:   463 zapytania
RAZEM:     1,177 zapytań na mecz
```

---

## 📐 OBLICZENIA NA 1 KORT

### Cykl mecz + przerwa (85 min):

```
Mecz (70 min):     1,177 zapytań
Przerwa (15 min):      3 zapytania
RAZEM:             1,180 zapytań na cykl 85 min
```

### Zapytania na godzinę (1 kort):

```
60 minut / 85 minut = 0.706 cyklu/h
1,180 zapytań × 0.706 = 833 zapytań/h
```

### Turniej 9:00-18:00 (9h, 1 kort):

```
833 zapytań/h × 9h = 7,497 zapytań
```

---

## 🎯 OBLICZENIA NA 4 KORTY

### Idealny scenariusz (wszystkie korty aktywne cały czas):

```
833 zapytań/h × 4 korty = 3,332 zapytań/h
3,332 × 9h = 29,988 zapytań ✅
```

**Margin:** 50,000 - 29,988 = **20,012 zapasowych (40% bufora!)** ✅✅

### Realistyczny scenariusz (nie wszystkie korty cały czas):

**Rozkład aktywności kortów:**
- 9:00-9:30: Setup, kort 1-2 zaczynają (2 korty)
- 9:30-12:00: Peak hours, wszystkie 4 korty (2.5h)
- 12:00-13:00: Lunch break, 2 korty aktywne (1h)
- 13:00-17:00: Peak hours, wszystkie 4 korty (4h)
- 17:00-18:00: Finały, 2 korty aktywne (1h)

**Obliczenia:**
```
Setup (0.5h):       833 × 2 korty =    833 zapytań
Peak AM (2.5h):     833 × 4 korty = 8,330 zapytań  
Lunch (1h):         833 × 2 korty =   833 zapytań
Peak PM (4h):       833 × 4 korty = 13,328 zapytań
Finały (1h):        833 × 2 korty =   833 zapytań
RAZEM:                              24,157 zapytań ✅
```

**Margin:** 50,000 - 24,157 = **25,843 zapasowych (52% bufora!)** ✅✅✅

### Pesymistyczny scenariusz (wszystkie korty, długie mecze):

**Założenia:**
- Wszystkie mecze długie (90 min zamiast 70 min)
- Wszystkie korty aktywne przez 9h
- Więcej tiebreakow (40% zamiast 20%)

**Długi mecz (90 min):**
```
Zawsze:      714 × (90/70) = 918 zapytań
Warunkowe:   463 × (90/70) × 1.5 (więcej TB) = 890 zapytań
RAZEM:     1,808 zapytań na mecz
```

**Cykl 90min mecz + 15min przerwa = 105min:**
```
1,808 + 3 = 1,811 zapytań na cykl
60/105 = 0.571 cykli/h
1,811 × 0.571 = 1,034 zapytań/h per kort
```

**4 korty × 9h:**
```
1,034 × 4 × 9 = 37,224 zapytań ✅
```

**Margin:** 50,000 - 37,224 = **12,776 zapasowych (26% bufora)** ✅

---

## 📊 PORÓWNANIE SCENARIUSZY

| Scenariusz | Zapytania | Buffer | Status |
|------------|-----------|--------|--------|
| **Idealny (4 korty, średnie mecze)** | 29,988 | 40% | ✅✅ Bardzo bezpieczne |
| **Realistyczny (zmienne obciążenie)** | 24,157 | 52% | ✅✅✅ Super bezpieczne |
| **Pesymistyczny (długie mecze)** | 37,224 | 26% | ✅ Bezpieczne |
| **Worst case (wszystko max)** | 43,200 | 14% | ⚠️ Akceptowalne |

---

## 🎯 WNIOSKI

### ✅ Jesteśmy BARDZO bezpieczni!

**Poprzednie (błędne) obliczenia:**
- Zakładały ciągły polling przez 9h bez przerw
- Nie uwzględniały przestojów między meczami
- Rezultat: 43,200 zapytań (86% limitu)

**Rzeczywiste zużycie:**
- Uwzględnia przerwy 15min (tylko 3 zapytania!)
- Uwzględnia zmienne obciążenie kortów
- Uwzględnia preconditions (40/ADV, games >= 3)
- **Rezultat: 24,000-30,000 zapytań (48-60% limitu)** ✅

### 📈 Faktyczny buffer:

```
Najbardziej prawdopodobne: 24,157 zapytań
Limit:                     50,000 zapytań
Buffer:                    25,843 zapytań (52%)
```

**To oznacza że możesz:**
- Grać 17 godzin zamiast 9h
- Albo mieć 8 kortów zamiast 4
- Albo mieć zapas na nieprzewidziane

### 🎉 Nie musisz się martwić!

Nawet w pesymistycznym scenariuszu (wszystkie korty, długie mecze, dużo tiebreakow):
- 37,224 zapytań
- 26% bufora
- Nadal bezpieczne!

---

## 🔍 SZCZEGÓŁOWA SYMULACJA - Przykładowy dzień

### Kort 1:
```
09:00-10:10  Mecz 1 (70min)      1,177 zapytań
10:10-10:25  Przerwa (15min)         3 zapytania
10:25-11:35  Mecz 2 (70min)      1,177 zapytań
11:35-11:50  Przerwa (15min)         3 zapytania
11:50-13:00  Mecz 3 (70min)      1,177 zapytań
13:00-13:30  Lunch (30min)           6 zapytań
13:30-14:40  Mecz 4 (70min)      1,177 zapytań
14:40-14:55  Przerwa (15min)         3 zapytania
14:55-16:05  Mecz 5 (70min)      1,177 zapytań
16:05-16:20  Przerwa (15min)         3 zapytania
16:20-17:30  Mecz 6 (70min)      1,177 zapytań
17:30-18:00  Finał (30min-start) 588 zapytań
TOTAL:                           7,668 zapytań
```

### 4 korty × 7,668 = 30,672 zapytań

**To jest bardzo realistyczny scenariusz!**

- 6 meczów na kort = 24 mecze dziennie
- Średnio 70 min na mecz
- 15 min przerwy
- Lunch break 30 min

**Result: 30,672 zapytań (61% limitu)** ✅✅

---

## ✅ FINALNA REKOMENDACJA

### Optymalizacja była NADMIERNA 😄

Mogliśmy zostać przy:
- GetPoints: **12s** zamiast 15s
- GetName: **45s** zamiast 60s

I nadal byłoby bezpiecznie (~35,000 zapytań, 30% buffer).

### ALE to dobrze!

- Mamy 52% bufora na nieprzewidziane
- System jest super responsywny
- Nie ma ryzyka wyczerpania limitu
- Możesz dodać więcej kortów w przyszłości

### Monitoring jutro:

Sprawdź o **14:00** (połowa turnieju):
- Powinno być: ~12,000-15,000 zapytań
- Jeśli jest > 20,000: coś poszło nie tak
- Jeśli jest < 15,000: wszystko SUPER ✅

---

## 🎊 PODSUMOWANIE

**POPRZEDNIE OBLICZENIA (teoretyczne):**
```
7,200 zapytań/h × 9h = 64,800 ❌ BŁĘDNE (zakładały ciągły polling)
4,800 zapytań/h × 9h = 43,200 ✅ Po optymalizacji, ale nadal zakładały ciągły polling
```

**RZECZYWISTE OBLICZENIA (z przerwami):**
```
Idealny:        29,988 zapytań (40% buffer) ✅✅
Realistyczny:   24,157 zapytań (52% buffer) ✅✅✅
Pesymistyczny:  37,224 zapytań (26% buffer) ✅
```

**KONKLUZJA:**
Jesteś absolutnie bezpieczny. Limit 50k wystarczy na **17 godzin** turnieju lub **8 kortów** przez 9h!

**Powodzenia jutro! 🎾🏆**
