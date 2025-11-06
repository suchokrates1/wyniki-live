# UNO Player Picker - Chrome Extension v0.3.11

Wtyczka Chrome do wyboru zawodników tenisowych dla UNO Overlays (app.overlays.uno) z integracją API wyniki-live i obsługą meczów deblowych.

## 🎯 Funkcjonalności

- **Pobieranie zawodników z API** - Dynamiczne ładowanie listy graczy z serwera wyniki-live
- **Tryb debla** - Checkbox umożliwiający wybór 2 zawodników dla jednego gracza
- **Formatowanie nazwisk** - W trybie debla: `Nazwisko1/Nazwisko2`
- **Cache API** - 5-minutowy cache dla zmniejszenia obciążenia serwera
- **Wyszukiwanie** - Szybkie filtrowanie po nazwisku lub kodzie kraju
- **Flagi krajów** - Automatyczne ustawianie flag z linkami flagcdn.com

## 📦 Instalacja

### Metoda 1: Tryb developera (Chrome/Edge)

1. Otwórz Chrome/Edge i wejdź na `chrome://extensions/`
2. Włącz **Tryb developera** (prawy górny róg)
3. Kliknij **Załaduj rozpakowane rozszerzenie**
4. Wybierz folder `uno-picker/`

### Metoda 2: Pobierz plik .crx

1. Wejdź na: `https://score.vestmedia.pl/download`
2. Pobierz plik `uno-picker-v0.3.11.crx`
3. Rozpakuj archiwum do folderu
4. Chrome → `chrome://extensions/` → "Załaduj rozpakowane" → wybierz folder

**Uwaga:** Pliki .crx to spakowane archiwa ZIP - trzeba je rozpakować przed instalacją.

## 🔧 Konfiguracja API

Domyślnie wtyczka łączy się z `http://localhost:5001`. Aby zmienić URL:

1. Otwórz `content.js`
2. Zmień linię 7:
   ```javascript
   const API_BASE = 'https://score.vestmedia.pl'; // lub inny URL
   ```

## 🎮 Użytkowanie

1. Otwórz stronę UNO: `https://app.overlays.uno/*`
2. Znajdź sekcję **Player Names** z polami Player A i Player B
3. Kliknij przycisk **"Wybierz A"** lub **"Wybierz B"** (lub kliknij w pole input)
4. Pojawi się popover z:
   - Checkbox **"Tryb debla"** (domyślnie wyłączony)
   - Pole wyszukiwania
   - Lista zawodników z flagami

**Troubleshooting:** Jeśli przyciski nie pojawiają się:
- Sprawdź konsolę przeglądarki (F12) - powinny być logi `[UNO Picker v0.3.11]`
- Odśwież stronę (Ctrl+R) - wtyczka ponawia inicjalizację po 1s i 3s
- Upewnij się że jesteś na stronie `app.overlays.uno/control/*` lub `/output/*`

### Tryb pojedynczy (Singles)
- Kliknij na zawodnika → natychmiastowe wypełnienie pola
- Flaga zostaje ustawiona automatycznie

### Tryb debla (Doubles)
1. Zaznacz checkbox **"Tryb debla (2 zawodników)"**
2. Wybierz pierwszego zawodnika (pojawi się w sekcji "Wybrani")
3. Wybierz drugiego zawodnika
4. Po wyborze 2 graczy pole zostanie wypełnione jako `Nazwisko1/Nazwisko2`
5. Flaga: użyta zostaje flaga pierwszego zawodnika

## 📡 Endpointy API

Wtyczka korzysta z następujących endpointów:

### GET `/api/players`
```json
{
  "players": [
    {
      "name": "Jan Kowalski",
      "flag": "pl",
      "flag_url": "https://flagcdn.com/w80/pl.png"
    }
  ]
}
```

### POST `/api/set_flag`
```json
{
  "player": "A",
  "flag": "pl",
  "flag_url": "https://flagcdn.com/w80/pl.png"
}
```

## 🗂️ Struktura plików

```
uno-picker/
├── manifest.json       # Konfiguracja rozszerzenia Chrome
├── content.js          # Główna logika wtyczki (605 linii)
├── picker.css          # Style popovera
├── README.md           # Ta dokumentacja
└── content.js.backup   # Backup starej wersji
```

## 🆕 Co się zmieniło?

### Wersja 1.0.0 (Przepisana)
- ✅ **Usunięto** `background.js` - nie jest już potrzebny
- ✅ **Usunięto** `injected.js` - brak przechwytywania zapytań UNO
- ✅ **Usunięto** `players.json` - zastąpione API
- ✅ **Dodano** tryb debla z checkboxem
- ✅ **Dodano** wybór 2 zawodników w trybie debla
- ✅ **Dodano** formatowanie nazwisk `Nazwisko1/Nazwisko2`
- ✅ **Dodano** cache API (5 min TTL)
- ✅ **Dodano** obsługę błędów i fallbacki

### Stara wersja (0.0.23)
- Przechwytywała zapytania do UNO API przez `injected.js`
- Używała statycznego pliku `players.json`
- Brak trybu debla
- Brak cache

## 🐛 Troubleshooting

### Wtyczka się nie ładuje
- Sprawdź konsolę Chrome: `Ctrl+Shift+J`
- Upewnij się, że jesteś na stronie `app.overlays.uno`
- Zweryfikuj, że sekcja "Player Names" jest widoczna

### Brak zawodników w liście
- Sprawdź czy API działa: otwórz `http://localhost:5001/api/players` w przeglądarce
- Sprawdź konsolę Chrome dla błędów CORS
- Upewnij się, że backend wyniki-live jest uruchomiony

### Flagi się nie zapisują
- Sprawdź czy endpoint `/api/set_flag` odpowiada poprawnie
- Sprawdź czy backend obsługuje POST na ten endpoint
- Weryfikuj payload w zakładce Network (DevTools)

## 🔐 Uprawnienia

Wtyczka wymaga:
- `storage` - zapisywanie stanu trybu debla
- `https://app.overlays.uno/*` - dostęp do strony UNO
- `http://localhost:*/*` - dostęp do lokalnego API
- `https://score.vestmedia.pl/*` - dostęp do produkcyjnego API

## 📝 Licencja

Część projektu wyniki-live. Użytkowanie wewnętrzne.

## 🤝 Wsparcie

W razie problemów sprawdź logi:
```javascript
// W konsoli Chrome (F12)
// Wszystkie logi wtyczki są prefixowane [UNO Picker]
```

## 🔄 Aktualizacja

Aby zaktualizować wtyczkę:
1. Pobierz nową wersję plików
2. Wejdź na `chrome://extensions/`
3. Kliknij ikonę ⟳ (Reload) przy wtyczce UNO Player Picker
