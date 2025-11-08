# 🚀 Quick Start Guide - Nowe funkcje UI

## 🎯 Główne nowości

### 1. **Dashboard Kortów** 📊
- **Gdzie**: Panel admin → sekcja na górze (zaraz po logowaniu)
- **Co**: Grid 2x2 z kartami kortów, live updates co 2s
- **Jak używać**:
  - Kliknij kartę kortu → otwiera szczegóły
  - Przycisk "👁️ Zobacz" → nowa karta z scoreboard
  - Przycisk "🔄 Reset" → reset kortu (modal confirmation)
  - Auto-refresh automatyczny

### 2. **Dark Mode** 🌙
- **Gdzie**: Prawy górny róg (okrągły przycisk)
- **Jak używać**:
  - Kliknij przycisk → przełącza tryb
  - Ikona: 🌙 (light mode) / ☀️ (dark mode)
  - Wybór zapamiętany w localStorage
  - Auto-detect preferencji systemu

### 3. **Keyboard Shortcuts** ⌨️
- **Skróty**:
  - `Ctrl+1` → Otwórz kort 1
  - `Ctrl+2` → Otwórz kort 2
  - `Ctrl+3` → Otwórz kort 3
  - `Ctrl+4` → Otwórz kort 4
  - `Ctrl+D` → Scroll do dashboardu
  - `?` → Pokaż pomoc
- **Tip**: Naciśnij `?` aby zobaczyć wszystkie skróty

### 4. **Search & Sort Graczy** 🔍
- **Gdzie**: Panel admin → Listy zawodników → nad tabelą
- **Search**:
  - Wpisz imię/nazwisko/listę/grupę
  - Real-time filtering
  - Pokazuje licznik (X/Y graczy)
- **Filter**:
  - Dropdown grup (B1-B4)
  - Przycisk "Wyczyść filtry"
- **Sort**:
  - Kliknij nagłówek kolumny (Imię/Lista/Grupa)
  - Toggle ↑ / ↓

### 5. **Toast Notifications** 🔔
- **Gdzie**: Prawy górny róg (automatyczne)
- **Typy**:
  - ✓ Sukces (zielony)
  - ✕ Błąd (czerwony)
  - ⚠ Ostrzeżenie (pomarańczowy)
  - ℹ Info (niebieski)
- **Funkcje**:
  - Auto-hide po 5s
  - Przycisk × do ręcznego zamknięcia
  - Progress bar

### 6. **Modal Dialogs** ✨
- **Gdzie**: Reset kortu, Usuwanie rekordów
- **Funkcje**:
  - Ładny design zamiast `alert()`
  - ESC → anuluj
  - Kliknięcie poza → anuluj
  - Danger mode (czerwony) dla destrukcyjnych akcji

---

## 🎨 Wizualne zmiany

### Toggle Switch
- Checkbox → nowoczesny switch (prawo-lewo)
- "Wysyłaj zapytania do UNO"
- "Używaj wtyczki"

### Tooltips
- Hover na przyciskach → krótki opis
- Wszystkie główne akcje mają tooltips

---

## 🐛 Naprawa błędów

### 1. Podwójne logi
- **Było**: `skip reason=disabled` + `uno_disabled`
- **Teraz**: Tylko jedno ostrzeżenie

### 2. Rate limit timestamp
- **Było**: Unix timestamp (1762560001)
- **Teraz**: Czytelny czas (17:15:08)

### 3. Skrócone logi stanu
- **Było**: `A=Jan Kowalski flag=pl pts=40 sets=(2,2)...`
- **Teraz**: `kort=3 | J. Kowalski 2-2 vs ...`

---

## 📱 Mobile Support

Wszystkie nowe funkcje są **responsive**:
- Dashboard: 1 kolumna na mobile
- Search/Filter: full-width
- Modały: przyciski stack vertical
- Tooltips: touch-friendly

---

## ⚙️ Konfiguracja

### Dark Mode
- Auto-detect: `@media (prefers-color-scheme: dark)`
- Override: localStorage `theme` = `"light"` | `"dark"`

### Dashboard Refresh
- Default: co 2 sekundy
- Można zmienić w `admin.js` line ~1877: `setInterval(..., 2000)`

### Toast Duration
- Default: 5000ms (5s)
- Można zmienić: `showToast('success', 'Title', 'Message', 8000)` ← 8s

---

## 🔧 Dla developerów

### Nowe pliki
```
static/toast.css           # Style toastów
static/modal.css           # Style modali
static/js/toast.js         # Logika toastów
static/js/modal.js         # Logika modali
```

### Zmodyfikowane pliki
```
admin.html                 # Dodano sekcje, tooltips, scripts
static/styles.css          # Dark mode, dashboard, search, tooltips
static/js/admin.js         # Dashboard, dark mode, shortcuts, search/sort
wyniki/routes.py           # Usunięto redundantny log
wyniki/poller.py           # Format czasu w rate limit
wyniki/state.py            # Skrócony log_state_summary
wyniki/database.py         # Fix sqlite3.Row.get()
```

### API (JavaScript)
```javascript
// Toast
showToast('success', 'Title', 'Message', duration);
dismissToast(toastId);
dismissAllToasts();

// Modal
const confirmed = await showConfirmDialog('Title', 'Message', options);

// Dark Mode (auto)
localStorage.getItem('theme'); // "light" | "dark" | null
```

---

## 🚀 Deployment

### 1. Przygotowanie
```bash
# Sprawdź logi
docker-compose logs -f --tail=50

# Backup (jeśli potrzeba)
docker-compose exec web python -c "import shutil; shutil.copy('wyniki_archive.sqlite3', 'wyniki_backup.sqlite3')"
```

### 2. Deploy
```bash
# Restart
docker-compose restart

# Lub full rebuild
docker-compose down
docker-compose up -d --build
```

### 3. Test
1. Otwórz: http://score.vestmedia.pl/admin/
2. Sprawdź dashboard (auto-refresh)
3. Przełącz dark mode
4. Naciśnij `?` (keyboard shortcuts)
5. Wyszukaj gracza
6. Zresetuj kort (modal)

---

## 📚 Dokumentacja

- **CHANGELOG_UI.md** - pełna lista zmian
- **ULEPSZENIA.md** - propozycje przyszłych funkcji (50+)
- **API.md** - dokumentacja API

---

## 💡 Tips & Tricks

### Szybka nawigacja
1. `Ctrl+D` → Dashboard
2. `Ctrl+1-4` → Otwórz kort
3. `?` → Pomoc

### Praca z graczami
1. Wpisz nazwę w search → instant filter
2. Kliknij nagłówek → sort
3. Wybierz grupę → filter
4. "Wyczyść filtry" → reset

### Dashboard workflow
1. Zobacz wszystkie korty na jednym ekranie
2. Kliknij "Zobacz" → nowa karta
3. Kliknij "Reset" → modal → potwierdź

---

## 🎯 Co dalej?

### Następne funkcje (TODO):
1. Historia meczy z filtrowaniem
2. Match timeline
3. Status bar (sticky)
4. Statystyki graczy
5. Notifications (email/push)

Zobacz **ULEPSZENIA.md** dla pełnej listy!

---

## 🙏 Feedback

Masz pomysł? Znalazłeś bug?
- Dodaj w **ULEPSZENIA.md**
- Lub napisz issue na GitHub

---

**Enjoy the new UI! 🎉**
