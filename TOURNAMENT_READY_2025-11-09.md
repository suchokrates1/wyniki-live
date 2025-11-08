# 🎾 TURNIEJ SOBOTA 09.11.2025 - Quick Reference

**Godziny:** 9:00 - 18:00 (9 godzin)  
**Deployment:** 21:17 (sobota wieczór)  
**Status:** ✅ Optymalizacja wdrożona

---

## ✅ CO ZOSTAŁO ZMIENIONE

### Interwały pollingu UNO API:

| Komenda | PRZED | PO | Redukcja |
|---------|-------|-----|----------|
| **GetPointsPlayerA/B** | 10s | **15s** | -33% |
| **GetNamePlayerA/B** | 30s | **60s** | -50% |
| **GetCurrentSet** | 10s | **15s** | -33% |
| **GetSet1/GetSet2** | 10s | **15s** | -33% |
| **GetTieBreakVisibility** | 180s | **300s** | -40% |
| **GetTieBreakPlayerA/B** (w tiebreaku) | 10s | **12s** | -17% |

### Wpływ na UX:

- ⏱️ **Opóźnienie wyników:** 15s zamiast 10s (akceptowalne)
- 👥 **Nazwiska:** 60s refresh (w praktyce nie widoczne - zmieniają się rzadko)
- 🎯 **Punkty krytyczne:** Nadal szybkie dzięki preconditions (40/ADV)
- 🏆 **Tiebreak:** 12s refresh (wciąż dynamiczne)

---

## 📊 PRZEWIDYWANE ZUŻYCIE

### Obliczenia:

```
PRZED optymalizacją:
- 30 zapytań/min per kort
- 4 korty × 30 = 120 zapytań/min
- 120 × 60 = 7,200 zapytań/h
- 7,200 × 9h = 64,800 zapytań ❌ PRZEKROCZENIE O 29%

PO optymalizacji:
- 20 zapytań/min per kort
- 4 korty × 20 = 80 zapytań/min  
- 80 × 60 = 4,800 zapytań/h
- 4,800 × 9h = 43,200 zapytań ✅ W LIMICIE (86% wykorzystania)
```

### Safety margin:

```
Limit:           50,000
Przewidywane:    43,200
Zapas:           6,800 (13.6%)
```

**Bezpieczny czas gry:** do **10.4 godziny** działania

---

## 🔍 MONITORING

### Kluczowe endpointy:

1. **Produkcja:** http://192.168.31.147:8087
2. **Test/v2:** http://192.168.31.147:8088
3. **Publiczny:** https://score.vestmedia.pl

### Sprawdzanie limitu:

```bash
# Z logów kontenera
ssh minipc "docker logs wyniki-tenis 2>&1 | grep 'RATE LIMIT' | tail -5"

# Powinno pokazać:
# RATE LIMIT kort=X: XXXXX/50000 remaining
```

### Alarm triggers:

- 🟢 **< 40,000 (80%):** OK, w planie
- 🟡 **40,000-45,000 (80-90%):** Monitoruj
- 🟠 **45,000-48,000 (90-96%):** Uwaga, blisko limitu
- 🔴 **> 48,000 (96%+):** Krytyczne, ryzyko wyczerpania

---

## 🚨 PLAN AWARYJNY

### Jeśli limit się zbliża do wyczerpania (> 45,000):

**Opcja 1: Dalsze zwiększenie interwałów (5 min roboty)**

```python
# W wyniki/query_system.py zmienić:
GetPointsPlayerA: 15.0 → 20.0  # -25% dodatkowej redukcji
GetNamePlayerA: 60.0 → 120.0   # Nazwiska co 2 minuty
```

Deploy:
```bash
ssh minipc "cd /home/suchokrates1/count && docker compose restart wyniki"
```

**Opcja 2: Wyłączyć 1-2 nieaktywne korty**

Jeśli kort jest pusty/nieużywany - wyłączyć polling:
```bash
# W admin panelu usunąć overlay_id dla pustego kortu
```

**Opcja 3: Manual fallback**

- Używać picker extension do manualnego wprowadzania
- Wyłączyć polling dla kortów które są offline

---

## 📈 CO OBSERWOWAĆ PODCZAS TURNIEJU

### Rano (9:00-10:00):

- ✅ Sprawdzić czy limit zresetował się o północy
- ✅ Pierwszy mecz - sprawdzić czy polling działa
- ✅ Monitorować zużycie pierwszej godziny

### W trakcie (10:00-17:00):

- 🔄 Co godzinę sprawdzać remaining limit
- 📊 Obserwować rate: powinno być ~4,800/h
- ⚠️ Alert jeśli przekracza 5,500/h

### Popołudnie (17:00-18:00):

- 📈 Finalny count - powinno być ~43,000
- ✅ Potwierdzić że zostaje buffer 6,000-7,000
- 📝 Zapisać dane do raportu

---

## 🎯 SUCCESS CRITERIA

### ✅ Turniej uznajemy za sukces jeśli:

1. **Limit nie przekroczony:** < 50,000 zapytań o 18:00
2. **Buffer zachowany:** Minimum 5% zapasu (2,500 req)
3. **UX akceptowalny:** Gracze/widzowie nie zgłaszają opóźnień
4. **Brak uno_disabled:** System nie przełącza się w tryb awaryjny

### 📊 Dane do zebrania:

- [ ] Faktyczne zużycie po 1h (powinno być ~4,800)
- [ ] Faktyczne zużycie o 14:00 (połowa, ~21,600)
- [ ] Finalne zużycie o 18:00 (cel: 43,200)
- [ ] Liczba aktywnych kortów w peak hours
- [ ] Feedback graczy nt. opóźnień wyników

---

## 📞 KONTAKTY

**W razie problemów:**

- GitHub: https://github.com/suchokrates1/wyniki-live
- Commit z optymalizacją: `e6988b6`
- Dokumentacja: `FINAL_UNO_ANALYSIS.md`

**Szybkie komendy:**

```bash
# Restart produkcji
ssh minipc "cd /home/suchokrates1/count && docker compose restart wyniki"

# Logi real-time
ssh minipc "docker logs -f wyniki-tenis"

# Status limitu
ssh minipc "docker logs wyniki-tenis 2>&1 | grep 'RATE LIMIT' | tail -1"
```

---

## 🎬 NASTĘPNE KROKI (po turnieju)

1. **Analiza danych:** Porównać przewidywania z rzeczywistością
2. **Cache nazwisk:** Implementować jeśli limit był bliski
3. **Email do UNO:** Zapytać o zwiększenie limitu dla turniejów
4. **Dokumentacja:** Zaktualizować best practices

---

**Powodzenia! 🎾🏆**

*Deployment time: 2025-11-08 21:17*  
*Next monitoring: 2025-11-09 09:00 (start turnieju)*
