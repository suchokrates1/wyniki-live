# 📦 Instalacja wtyczki UNO Player Picker

## Szybka instalacja (Chrome/Edge)

### Krok 1: Włącz tryb developera
1. Otwórz przeglądarkę Chrome lub Edge
2. Wpisz w pasek adresu: `chrome://extensions/`
3. W prawym górnym rogu włącz przełącznik **"Tryb developera"** (Developer mode)

### Krok 2: Załaduj wtyczkę
1. Kliknij przycisk **"Załaduj rozpakowane rozszerzenie"** (Load unpacked)
2. Przejdź do folderu: `wyniki-live/uno-picker/`
3. Kliknij **"Wybierz folder"** (Select folder)

### Krok 3: Sprawdź instalację
- Wtyczka powinna pojawić się na liście jako **"UNO Player Picker v1.0.0"**
- Status: ✅ Włączone (Enabled)
- Uprawnienia: 
  - ✅ Dostęp do danych z app.overlays.uno
  - ✅ Dostęp do localhost
  - ✅ Magazyn lokalny (storage)

## ✅ Test działania

1. Uruchom backend wyniki-live:
   ```bash
   cd wyniki-live
   python app.py
   ```

2. Otwórz w przeglądarce: `https://app.overlays.uno/`

3. Znajdź sekcję **Player Names** z polami "Player A" i "Player B"

4. Kliknij w pole input lub przycisk **"Wybierz gracza A"**

5. Powinien pojawić się popover z:
   - ✅ Checkbox "Tryb debla (2 zawodników)"
   - ✅ Pole wyszukiwania
   - ✅ Lista zawodników z flagami

## 🔧 Konfiguracja URL API

Jeśli backend działa na innym porcie niż `5001`:

1. Otwórz plik: `uno-picker/content.js`
2. Zmień linię 7:
   ```javascript
   const API_BASE = 'http://localhost:5001'; // <- twój port
   ```
3. Zapisz plik
4. Wróć do `chrome://extensions/`
5. Kliknij ikonę ⟳ (Reload) przy wtyczce

## 🐛 Troubleshooting

### Problem: Wtyczka nie pojawia się na liście
**Rozwiązanie:** 
- Sprawdź czy wybrałeś folder `uno-picker/` (nie główny folder `wyniki-live/`)
- Upewnij się, że w folderze jest plik `manifest.json`

### Problem: Błąd "Manifest version not supported"
**Rozwiązanie:**
- Używasz Chrome w wersji 88+ lub Edge 88+
- Starsze przeglądarki nie wspierają Manifest v3

### Problem: Brak zawodników w liście
**Rozwiązanie:**
1. Sprawdź czy backend działa:
   - Otwórz: `http://localhost:5001/api/players`
   - Powinien zwrócić JSON z listą graczy

2. Sprawdź konsolę przeglądarki (F12):
   - Szukaj błędów typu CORS
   - Szukaj prefiksu `[UNO Picker]`

3. Jeśli błąd CORS, dodaj do `app.py`:
   ```python
   from flask_cors import CORS
   CORS(app)
   ```

### Problem: Przyciski "Wybierz gracza" nie pojawiają się
**Rozwiązanie:**
- Upewnij się, że jesteś na stronie `app.overlays.uno`
- Sprawdź czy sekcja "Player Names" jest widoczna
- Odśwież stronę (Ctrl+Shift+R)

## 📝 Logi debugowania

Aby zobaczyć logi wtyczki:
1. Naciśnij `F12` (DevTools)
2. Przejdź do zakładki **Console**
3. Filtruj po: `[UNO Picker]`

Przykładowe logi:
```
[UNO Picker] Inicjalizacja UNO Player Picker v1.0.0
[UNO Picker] Tryb debla: false
[UNO Picker] Pobieram graczy z API: http://localhost:5001/api/players
[UNO Picker] Pobrano graczy: 65
[UNO Picker] Podlaczono picker do Player A
[UNO Picker] Podlaczono picker do Player B
```

## 🔄 Aktualizacja wtyczki

Gdy pobierzesz nową wersję:
1. Wejdź na `chrome://extensions/`
2. Znajdź **UNO Player Picker**
3. Kliknij ikonę ⟳ (Reload)

## 📞 Wsparcie

W razie problemów sprawdź:
- `uno-picker/README.md` - pełna dokumentacja
- Console (F12) - błędy JavaScript
- Network (F12) - błędy API
- `app.py` logs - błędy backendu
