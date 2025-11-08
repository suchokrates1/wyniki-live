# 🎾 Wyniki Live v2 - Quick Start Guide

## ✅ Co zostało zrobione

### 1. **System Turniejów i Graczy** ✨ NOWE
Admin panel ma teraz 4 zakładki:
- **UNO Throttling** - kontrola zapytań do UNO
- **Korty** - zarządzanie kortami (1-5 automatycznie dodane)
- **Turnieje** - zarządzanie turniejami i graczami
- **Historia** - historia zakończonych meczów

### 2. **Produkcyjne ID Kortów** ✅
System automatycznie tworzy korty 1-5 przy pierwszym uruchomieniu.

### 3. **Routing dla Embed**
Teraz działa:
- `/embed` - podstawowa strona embed
- `/embed/fr/1` - kort 1 w języku francuskim
- `/embed/pl/2` - kort 2 w języku polskim
- `/embed/en/3` - kort 3 w języku angielskim

---

## 📋 Jak używać systemu turniejów

### Krok 1: Utwórz nowy turniej
1. Otwórz http://192.168.31.147:8088/admin
2. Kliknij zakładkę **Turnieje**
3. Wypełnij formularz:
   - Nazwa: `IPC Włochy 2025`
   - Data rozpoczęcia: `2025-01-15`
   - Data zakończenia: `2025-01-22`
4. Kliknij **Utwórz turniej**

### Krok 2: Zaimportuj graczy z pliku
1. W liście turniejów kliknij **📋 Gracze** przy swoim turnieju
2. Rozwiń sekcję **📥 Import graczy z pliku tekstowego**
3. Wklej zawartość pliku `players_import_b1_b4.txt`:
```
Yasser Ait Lahcem B1 ma
Carlos Arbos Jinard B1 fr
Giancarlo Berganti B1 it
...
```
4. Kliknij **Importuj graczy**
5. System automatycznie rozparsuje format: `Imię Nazwisko Kategoria Kraj`

### Krok 3: Ustaw turniej jako aktywny
1. W liście turniejów znajdź swój turniej
2. Kliknij **Ustaw aktywny** w kolumnie Status
3. Turniej będzie podświetlony na zielono z badge'm "Aktywny"

### Krok 4: Weryfikuj API dla wtyczki UNO Picker
Teraz wtyczka UNO Picker może pobierać listę graczy z aktywnego turnieju:

**Endpoint:** `GET /api/players/active`

**Response:**
```json
[
  {
    "name": "Yasser Ait Lahcem",
    "category": "B1",
    "country": "ma"
  },
  {
    "name": "Carlos Arbos Jinard",
    "category": "B1",
    "country": "fr"
  }
]
```

---

## 🔧 Zarządzanie kortami

### Dodaj overlay ID do kortu
1. Zakładka **Korty**
2. W tabeli wpisz **Overlay ID** (np. `court-1-overlay`)
3. Zmiany zapisują się automatycznie po wyjściu z pola

### Test kortu
1. Kliknij przycisk **Test** przy korcie
2. System wyświetli toast z informacją

---

## 📊 API Endpoints

### Turnieje
- `GET /admin/api/tournaments` - lista wszystkich turniejów
- `POST /admin/api/tournaments` - utwórz turniej
  ```json
  {
    "name": "IPC Włochy 2025",
    "start_date": "2025-01-15",
    "end_date": "2025-01-22",
    "active": true
  }
  ```
- `PUT /admin/api/tournaments/{id}` - aktualizuj turniej
- `DELETE /admin/api/tournaments/{id}` - usuń turniej
- `POST /admin/api/tournaments/{id}/activate` - ustaw jako aktywny

### Gracze
- `GET /admin/api/tournaments/{id}/players` - lista graczy turnieju
- `POST /admin/api/tournaments/{id}/players` - dodaj gracza
  ```json
  {
    "name": "Jan Kowalski",
    "category": "B1",
    "country": "pl"
  }
  ```
- `POST /admin/api/tournaments/{id}/players/import` - import z tekstu
  ```json
  {
    "text": "John Doe B1 us\nJane Smith B2 ca"
  }
  ```
- `DELETE /admin/api/tournaments/{id}/players/{player_id}` - usuń gracza

### API Publiczne (dla wtyczki)
- `GET /api/players/active` - gracze z aktywnego turnieju

---

## 🎯 Testowanie

### Test 1: Admin Panel
```powershell
Invoke-WebRequest "http://192.168.31.147:8088/admin" -UseBasicParsing
# Powinno zwrócić 200 i zawierać "Turnieje"
```

### Test 2: API Turniejów
```powershell
Invoke-WebRequest "http://192.168.31.147:8088/admin/api/tournaments" -UseBasicParsing
# Powinno zwrócić [] lub listę turniejów
```

### Test 3: API Graczy
```powershell
Invoke-WebRequest "http://192.168.31.147:8088/api/players/active" -UseBasicParsing
# Powinno zwrócić listę graczy z aktywnego turnieju
```

### Test 4: Embed Routing
```powershell
@('/embed', '/embed/fr/1', '/embed/pl/2', '/embed/en/3') | ForEach-Object {
  $r = Invoke-WebRequest "http://192.168.31.147:8088$_" -UseBasicParsing
  Write-Host "$_ : $($r.StatusCode)"
}
# Wszystkie powinny zwrócić 200
```

---

## 🚀 Deployment

### Pełny deployment z frontendem
```bash
ssh minipc 'cd ~/count && git pull && cd frontend && npm run build && cd .. && docker compose -f docker-compose.test.yml up -d --build'
```

### Tylko restart (bez zmian w kodzie)
```bash
ssh minipc 'cd ~/count && docker compose -f docker-compose.test.yml restart wyniki-test'
```

### Rebuild bez buildu frontendu
```bash
ssh minipc 'cd ~/count && git pull && docker compose -f docker-compose.test.yml up -d --build'
```

---

## 📁 Struktura Plików

```
backend/
  wyniki_v2/
    api/
      admin_tournaments.py    # ✨ NOWE - API turniejów i graczy
    database.py               # ✨ ROZSZERZONE - tournaments, players
    init_state.py            # ✨ ROZSZERZONE - seeding kortów 1-5

frontend/
  admin.html                 # ✨ ROZSZERZONE - zakładka Turnieje
  src/
    admin.js                 # ✨ ROZSZERZONE - logika turniejów

players_import_b1_b4.txt     # Plik z graczami do importu
ROADMAP_v2.md                # ✨ NOWE - propozycje rozwoju
```

---

## 🎨 Features Highlights

### Alpine.js + Tailwind + DaisyUI
- Reaktywny UI bez Vue/React
- Komponenty DaisyUI (buttons, tables, cards, badges)
- Dark mode support
- Toast notifications
- Responsive design

### Baza Danych
- SQLite z relacyjnymi tabelami
- Foreign keys z CASCADE DELETE
- Timestamps (created_at)
- Transakcje ACID

### API Design
- RESTful conventions
- JSON responses
- Error handling z kodami HTTP
- CORS ready

---

## 💡 Propozycje Dalszego Rozwoju

Sprawdź plik **ROADMAP_v2.md** z pełną listą 15 propozycji, w tym:
1. Dashboard ze statystykami i wykresami
2. Scheduler kortów z rezerwacjami
3. Live streaming integration
4. System rankingowy (ELO)
5. Mobile PWA
6. Multi-tenancy (wiele klubów)
7. AI predictions
8. Gamification (achievements, badges)

...i wiele więcej!

---

## 🐛 Troubleshooting

### Admin panel jest pusty
- Sprawdź czy frontend został zbudowany: `cd frontend && npm run build`
- Sprawdź logi: `ssh minipc 'docker logs wyniki-test'`

### API zwraca 404
- Sprawdź czy blueprinty są zarejestrowane w `app_v2.py`
- Zrestartuj kontener: `docker compose -f docker-compose.test.yml restart`

### Gracze nie pojawiają się w wtyczce
- Sprawdź czy turniej jest ustawiony jako aktywny (badge "Aktywny")
- Test API: `curl http://192.168.31.147:8088/api/players/active`

---

## ✅ Checklist

- [x] Admin panel z 4 zakładkami
- [x] System turniejów (CRUD)
- [x] System graczy (CRUD + import)
- [x] API dla wtyczki UNO Picker
- [x] Produkcyjne kort_id (1-5)
- [x] Embed routing z parametrami
- [x] Alpine.js bez podwójnej inicjalizacji
- [x] DaisyUI styling
- [x] Toast notifications
- [x] Responsive design
- [x] Deploy na test server (port 8088)

---

## 📞 Support

Masz pytania? Zobacz:
- `ROADMAP_v2.md` - propozycje rozwoju
- `API.md` - dokumentacja API
- `README_V2.md` - szczegóły implementacji v2

**Test Server:** http://192.168.31.147:8088
**Admin Panel:** http://192.168.31.147:8088/admin
