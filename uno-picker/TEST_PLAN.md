# 🧪 Test Plan - UNO Player Picker v1.0.0

## Przygotowanie środowiska

### 1. Backend
```bash
cd wyniki-live
python app.py
```
Sprawdź: `http://localhost:5001/api/players` powinien zwrócić JSON

### 2. Wtyczka Chrome
1. Otwórz: `chrome://extensions/`
2. Włącz "Tryb developera"
3. "Załaduj rozpakowane rozszerzenie" → wybierz folder `uno-picker/`
4. Sprawdź status: ✅ Włączone

---

## 🧪 Test Case 1: Instalacja i inicjalizacja

### Kroki:
1. Zainstaluj wtyczkę (patrz wyżej)
2. Otwórz: `https://app.overlays.uno/`
3. Otwórz Console (F12)

### Oczekiwane rezultaty:
- [ ] W konsoli: `[UNO Picker] Inicjalizacja UNO Player Picker v1.0.0`
- [ ] W konsoli: `[UNO Picker] Tryb debla: false`
- [ ] W konsoli: `[UNO Picker] Pobieram graczy z API: http://localhost:5001/api/players`
- [ ] W konsoli: `[UNO Picker] Pobrano graczy: XX` (liczba graczy)

### Kryteria akceptacji:
✅ Brak błędów w konsoli  
✅ Status 200 dla `/api/players` (sprawdź Network tab)

---

## 🧪 Test Case 2: Wykrywanie pól gracza

### Kroki:
1. Na stronie UNO znajdź sekcję "Player Names"
2. Sprawdź czy są pola "Player A" i "Player B"
3. Sprawdź Console

### Oczekiwane rezultaty:
- [ ] W konsoli: `[UNO Picker] Podlaczono picker do Player A`
- [ ] W konsoli: `[UNO Picker] Podlaczono picker do Player B`
- [ ] Przyciski "Wybierz gracza A" i "Wybierz gracza B" są widoczne

### Kryteria akceptacji:
✅ Oba przyciski renderują się obok inputów  
✅ Przyciski mają kolor niebieski (#007bff)  
✅ Hover zmienia kolor na ciemniejszy

---

## 🧪 Test Case 3: Otwieranie popovera

### Kroki:
1. Kliknij przycisk "Wybierz gracza A"
2. Lub: kliknij w pole input Player A
3. Lub: fokus na pole input (Tab)

### Oczekiwane rezultaty:
- [ ] Pojawia się popover z białym tłem i shadowem
- [ ] Checkbox "Tryb debla (2 zawodników)" - niezaznaczony
- [ ] Pole wyszukiwania z placeholderem "Szukaj zawodnika..."
- [ ] Lista graczy z flagami (scroll jeśli >10 graczy)

### Kryteria akceptacji:
✅ Popover pozycjonuje się poniżej inputu  
✅ Focus na polu wyszukiwania  
✅ Lista renderuje wszystkich graczy z API

---

## 🧪 Test Case 4: Wyszukiwanie graczy

### Kroki:
1. Otwórz popover
2. Wpisz fragment nazwiska (np. "kowal")
3. Sprawdź filtrowanie

### Oczekiwane rezultaty:
- [ ] Lista filtruje się na żywo (live filtering)
- [ ] Wyświetla tylko pasujące nazwiska
- [ ] Jeśli brak wyników: "Brak wyników"

### Kryteria akceptacji:
✅ Wyszukiwanie case-insensitive  
✅ Działa dla nazwisk i kodów krajów (np. "pl", "usa")  
✅ Brak opóźnienia (instant)

---

## 🧪 Test Case 5: Wybór gracza (tryb pojedynczy)

### Kroki:
1. Otwórz popover dla Player A
2. Upewnij się, że checkbox "Tryb debla" NIE jest zaznaczony
3. Kliknij na dowolnego gracza (np. "Jan Kowalski")

### Oczekiwane rezultaty:
- [ ] Pole input Player A wypełnia się: "Jan Kowalski"
- [ ] Popover zamyka się automatycznie
- [ ] W konsoli: `[UNO Picker] Wybrano: Jan Kowalski dla gracza A`
- [ ] W konsoli: `[UNO Picker] Flaga ustawiona dla gracza A: pl`

### Kryteria akceptacji:
✅ Natychmiastowe zamknięcie popovera  
✅ Wartość w input jest pełnym nazwiskiem  
✅ Request do `/api/set_flag` w Network tab (status 200)

---

## 🧪 Test Case 6: Tryb debla - włączenie

### Kroki:
1. Otwórz popover dla Player A
2. Zaznacz checkbox "Tryb debla (2 zawodników)"
3. Sprawdź UI

### Oczekiwane rezultaty:
- [ ] Pojawia się sekcja "Wybrani (0/2):"
- [ ] Tekst: "Brak wybranych zawodników"
- [ ] W konsoli: `[UNO Picker] Zapisano tryb debla: true`

### Kryteria akceptacji:
✅ Checkbox jest zaznaczony  
✅ Sekcja "Wybrani" jest widoczna  
✅ Stan zapisuje się w localStorage (sprawdź: DevTools → Application → Local Storage)

---

## 🧪 Test Case 7: Tryb debla - wybór 1. gracza

### Kroki:
1. W trybie debla kliknij na gracza (np. "Jan Kowalski")

### Oczekiwane rezultaty:
- [ ] Gracz pojawia się w sekcji "Wybrani (1/2):"
- [ ] Wyświetla się: flaga + "Jan Kowalski" + przycisk ✕
- [ ] Popover NIE zamyka się
- [ ] Lista graczy pozostaje widoczna

### Kryteria akceptacji:
✅ Wybrany gracz dodany do listy  
✅ Przycisk ✕ działa (usuwa gracza)  
✅ Można nadal wyszukiwać

---

## 🧪 Test Case 8: Tryb debla - wybór 2. gracza

### Kroki:
1. Po wybraniu 1. gracza kliknij na innego (np. "Maria Nowak")

### Oczekiwane rezultaty:
- [ ] Obaj gracze w sekcji "Wybrani (2/2):"
- [ ] Pole input Player A wypełnia się: "Kowalski/Nowak"
- [ ] Popover zamyka się automatycznie
- [ ] W konsoli: `[UNO Picker] Debel: Kowalski/Nowak dla gracza A`

### Kryteria akceptacji:
✅ Format nazwisk: `Nazwisko1/Nazwisko2`  
✅ Flaga ustawiona na pierwszego gracza  
✅ Request do `/api/set_flag` (status 200)

---

## 🧪 Test Case 9: Tryb debla - limit 2 graczy

### Kroki:
1. Wybierz 2 graczy w trybie debla
2. Ponownie otwórz popover dla Player A (zaznacz checkbox)
3. Spróbuj kliknąć 3. gracza

### Oczekiwane rezultaty:
- [ ] Alert: "Możesz wybrać maksymalnie 2 zawodników!"
- [ ] 3. gracz NIE zostaje dodany

### Kryteria akceptacji:
✅ Alert wyświetla się  
✅ Lista pozostaje na 2 graczach

---

## 🧪 Test Case 10: Tryb debla - duplikat

### Kroki:
1. W trybie debla wybierz gracza (np. "Jan Kowalski")
2. Kliknij ponownie tego samego gracza

### Oczekiwane rezultaty:
- [ ] Alert: "Ten zawodnik jest już wybrany!"
- [ ] Gracz NIE jest dodany po raz drugi

### Kryteria akceptacji:
✅ Alert wyświetla się  
✅ Brak duplikatu w liście

---

## 🧪 Test Case 11: Usuwanie wybranych graczy

### Kroki:
1. W trybie debla wybierz 1 lub 2 graczy
2. Kliknij przycisk ✕ przy graczu

### Oczekiwane rezultaty:
- [ ] Gracz znika z listy "Wybrani"
- [ ] Licznik aktualizuje się (np. 2/2 → 1/2)
- [ ] Lista główna pozostaje widoczna

### Kryteria akceptacji:
✅ Gracz usuwany natychmiast  
✅ Można dodać innego gracza w jego miejsce

---

## 🧪 Test Case 12: Zamykanie popovera

### Kroki:
1. Otwórz popover
2. Test 1: Naciśnij ESC
3. Test 2: Kliknij poza popoverem
4. Test 3: Resize okna przeglądarki

### Oczekiwane rezultaty:
- [ ] ESC: popover zamyka się
- [ ] Klik poza: popover zamyka się
- [ ] Resize: popover zamyka się

### Kryteria akceptacji:
✅ Wszystkie 3 metody działają  
✅ Brak błędów w konsoli

---

## 🧪 Test Case 13: Cache API

### Kroki:
1. Otwórz popover (1. raz)
2. Sprawdź Network tab: request do `/api/players`
3. Zamknij popover
4. Otwórz popover ponownie (w ciągu 5 min)

### Oczekiwane rezultaty:
- [ ] 1. otwarcie: request do API
- [ ] W konsoli: `[UNO Picker] Pobrano graczy: XX`
- [ ] 2. otwarcie: BRAK requestu
- [ ] W konsoli: `[UNO Picker] Uzyto cache graczy: XX`

### Kryteria akceptacji:
✅ Cache działa (brak duplikowanych requestów)  
✅ TTL = 5 minut (testuj otwierając po 6 minutach)

---

## 🧪 Test Case 14: Persistence trybu debla

### Kroki:
1. Zaznacz checkbox "Tryb debla"
2. Zamknij popover
3. Odśwież stronę (F5)
4. Otwórz popover ponownie

### Oczekiwane rezultaty:
- [ ] Checkbox "Tryb debla" jest zaznaczony
- [ ] Sekcja "Wybrani" jest widoczna

### Kryteria akceptacji:
✅ Stan zapisuje się w localStorage  
✅ Przetrwa refresh strony

---

## 🧪 Test Case 15: Endpoint `/api/set_flag`

### Kroki:
1. Wybierz gracza z flagą (np. Jan Kowalski, pl)
2. Otwórz DevTools → Network
3. Filtruj: `set_flag`

### Oczekiwane rezultaty:
- [ ] Request: POST `http://localhost:5001/api/set_flag`
- [ ] Payload: `{"player":"A","flag":"pl","flag_url":"..."}`
- [ ] Response: `{"ok":true,"player":"A",...}`
- [ ] Status: 200 OK

### Kryteria akceptacji:
✅ Request wysyłany dla każdego wyboru  
✅ Backend odpowiada poprawnie  
✅ Logi backendu zawierają: `Flag set for Player A: pl`

---

## 🧪 Test Case 16: Błędy API

### Kroki:
1. Zatrzymaj backend (`Ctrl+C`)
2. Otwórz popover

### Oczekiwane rezultaty:
- [ ] Tekst: "Ładowanie zawodników..."
- [ ] W konsoli: `[UNO Picker] Blad pobierania graczy z API: ...`
- [ ] Brak crash wtyczki

### Kryteria akceptacji:
✅ Graceful degradation (brak błędów JS)  
✅ Informacyjny komunikat dla użytkownika

---

## 🧪 Test Case 17: Responsywność UI

### Kroki:
1. Otwórz popover
2. Hover nad graczem z listy
3. Resize okna przeglądarki

### Oczekiwane rezultaty:
- [ ] Hover: tło zmienia się na #f5f5f5
- [ ] Resize: popover zamyka się automatycznie
- [ ] Scroll listy: smooth, bez lagów

### Kryteria akceptacji:
✅ Animacje płynne (60 FPS)  
✅ Popover nie wykracza poza viewport

---

## 📊 Podsumowanie testów

| Test Case | Status | Uwagi |
|-----------|--------|-------|
| TC1: Instalacja | ⬜ | |
| TC2: Wykrywanie pól | ⬜ | |
| TC3: Otwieranie popovera | ⬜ | |
| TC4: Wyszukiwanie | ⬜ | |
| TC5: Wybór pojedynczy | ⬜ | |
| TC6: Tryb debla - włączenie | ⬜ | |
| TC7: Tryb debla - 1. gracz | ⬜ | |
| TC8: Tryb debla - 2. gracz | ⬜ | |
| TC9: Limit 2 graczy | ⬜ | |
| TC10: Duplikat | ⬜ | |
| TC11: Usuwanie | ⬜ | |
| TC12: Zamykanie | ⬜ | |
| TC13: Cache API | ⬜ | |
| TC14: Persistence | ⬜ | |
| TC15: Endpoint set_flag | ⬜ | |
| TC16: Błędy API | ⬜ | |
| TC17: Responsywność | ⬜ | |

**Legenda:** ⬜ Nie testowane | ✅ Passed | ❌ Failed

---

## 🐛 Zgłaszanie bugów

Jeśli test nie przechodzi:
1. Zanotuj numer Test Case
2. Opisz kroki reprodukcji
3. Dołącz screenshot
4. Skopiuj logi z konsoli (prefix: `[UNO Picker]`)
5. Sprawdź Network tab dla błędów API

---

## ✅ Acceptance Criteria (wszystkie TC muszą przejść)

- [ ] Wszystkie 17 test cases zakończone sukcesem
- [ ] Brak błędów w konsoli Chrome
- [ ] Brak błędów 4xx/5xx w Network tab
- [ ] Wtyczka działa na app.overlays.uno
- [ ] Backend odpowiada poprawnie na `/api/players` i `/api/set_flag`
- [ ] Tryb debla formatuje nazwiska poprawnie
- [ ] Cache API działa (TTL 5 min)
- [ ] Persistence stanu (localStorage)

**Tester:** _________________  
**Data:** _________________  
**Wersja wtyczki:** 1.0.0  
**Wersja Chrome:** _________________  
**Status:** ⬜ Passed | ⬜ Failed
