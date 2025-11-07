# wyniki-live

System do wyświetlania wyników tenisowych na żywo z integracją UNO API, panelem administracyjnym i wsparciem dla wielu języków.

## ✨ Funkcje

- 🎾 **Wyświetlanie wyników na żywo** - Real-time scores dla wielu kortów
- 🌍 **Wielojęzyczność** - PL, EN, DE, IT, ES
- 👨‍💼 **Panel administratora** - Zarządzanie historią, kortami, graczami
- 🚀 **UNO API Integration** - Polling, rate limiting, activity tracking
- 🏁 **195+ flag krajów** - Predefiniowany katalog flag dla wszystkich graczy
- ♿ **Accessibility** - ARIA labels, screen reader support
- 📺 **YouTube viewers** - Integracja z YouTube API
- 🐳 **Docker ready** - Gotowa konteneryzacja

## 📋 Wymagania

- Python 3.10+
- Flask 3.0+
- SQLite3
- (Opcjonalnie) Docker & Docker Compose

## 🚀 Szybki start

### Instalacja lokalna

1. **Sklonuj repozytorium:**
   ```bash
   git clone https://github.com/suchokrates1/wyniki-live.git
   cd wyniki-live
   ```

2. **Zainstaluj zależności:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Skonfiguruj środowisko:**
   ```bash
   cp .env.example .env
   # Edytuj .env i uzupełnij wymagane wartości
   ```

4. **Uruchom aplikację:**
   ```bash
   python app.py
   ```

5. **Otwórz w przeglądarce:**
   ```
   http://localhost:5000
   ```

### Docker

```bash
docker-compose up -d
```

## ⚙️ Konfiguracja

- `ADMIN_PASSWORD` – hasło umożliwiające zalogowanie do panelu administracyjnego. Po uwierzytelnieniu administrator może edytować oraz usuwać rekordy historii poprzez interfejs webowy lub dedykowane endpointy API. Gdy zmienna nie jest ustawiona, panel `/admin` pozostaje dostępny, ale wyświetla informację o konieczności konfiguracji zamiast błędu 404.

Aby rozpocząć konfigurację środowiska:

1. Skopiuj plik przykładowy: `cp .env.example .env`.
2. Uzupełnij wartości zmiennych środowiskowych w `.env` zgodnie z potrzebami instalacji.

Zobacz `.env.example` dla pełnej listy dostępnych opcji konfiguracji.

## Usuwanie wpisów z historii

Publiczny endpoint `/delete` został usunięty. Aby skasować wpis z historii należy:

1. Zalogować się w panelu `/admin` używając hasła administratora.
2. Skorzystać z przycisku „Usuń” przy wybranym rekordzie lub wysłać żądanie `DELETE /api/admin/history/<id>` z aktywną sesją administracyjną.

Żądania API bez poprawnej sesji otrzymają odpowiedź `401 Unauthorized`, a próba usunięcia nieistniejącego rekordu zakończy się statusem `404 Not Found`.

## Pliki do pobrania

- Endpoint `/download` udostępnia pierwszy (alfabetycznie) archiwalny plik `.zip` znajdujący się w katalogu `download/`. Jeśli katalog jest pusty lub zawiera wyłącznie pliki o innych rozszerzeniach, żądanie zwróci `404 Not Found`.

## ♿ Dostępność

- Każda karta kortu otrzymuje dynamiczny `aria-label` zbudowany ze zsumowanych wyników meczu. Tekst jest nadpisywany jednocześnie na elemencie `<section>` oraz liście `<dl class="score-list">`, dzięki czemu czytniki ekranu odczytują pełne podsumowanie w momencie przejścia fokusem na kartę – niezależnie od ustawienia opcji „Automatyczny odczyt".
- Przełącznik „Automatyczny odczyt" jedynie zapisuje preferencję w `localStorage`; ponieważ moduł `announce()` został pozostawiony jako no-op (brak aktywnego regionu live), samo zaznaczenie pola nie zmienia sposobu, w jaki screen reader odczytuje `aria-label`.

## 📚 Dokumentacja

- **[API.md](API.md)** - Kompletna dokumentacja API endpoints
- **[.cursorrules](.cursorrules)** - Informacje architektoniczne dla AI (wzorce kodowania, kluczowe decyzje)

## 🧪 Testowanie

```bash
# Uruchom testy
pytest

# Z pokryciem kodu
pytest --cov=wyniki --cov-report=html

# Testy konkretnego modułu
pytest tests/test_match_time.py
```

## 🛠️ Development

### Instalacja narzędzi developerskich

```bash
pip install -r requirements-dev.txt
```

### Code Quality Tools

```bash
# Type checking
mypy wyniki/

# Code formatting
black wyniki/ tests/

# Import sorting
isort wyniki/ tests/

# Linting
flake8 wyniki/ tests/

# Security checks
bandit -r wyniki/
```

### Pre-commit hooks

```bash
# Zainstaluj pre-commit hooks
pre-commit install

# Uruchom manualnie
pre-commit run --all-files
```

## 🧩 UNO Player Picker - Wtyczka Chrome v0.3.11

Projekt zawiera wtyczkę Chrome do integracji z UNO Overlays:

### Funkcje wtyczki
- 🎯 **Dynamiczne pobieranie graczy** - Integracja z `/api/players`
- 🎾 **Tryb debla** - Wybór 2 zawodników z formatowaniem `Nazwisko1/Nazwisko2`
- 🏴 **Automatyczne flagi** - Ustawianie flag przez API
- 🔍 **Wyszukiwanie** - Szybkie filtrowanie listy
- 💾 **Cache** - 5-minutowy cache dla optymalizacji

### Pobierz wtyczkę

**Bezpośredni link:** `https://score.vestmedia.pl/download`

Plik: `uno-picker-v0.3.11.crx` (17.8 KB)  
**Wsparcie:** Edge Canary na tabletach ✅

### Instalacja wtyczki

```bash
# Metoda 1: Z repozytorium (dev)
1. Wejdź na chrome://extensions/
2. Włącz "Tryb developera"
3. Kliknij "Załaduj rozpakowane rozszerzenie"
4. Wybierz folder: wyniki-live/uno-picker/

# Metoda 2: Z pliku .crx (production)
1. Pobierz: https://score.vestmedia.pl/download
2. Rozpakuj uno-picker-v0.3.11.crx (to archiwum ZIP)
3. Chrome → chrome://extensions/ → "Załaduj rozpakowane"
4. Wybierz rozpakowany folder
```

### Dokumentacja wtyczki
- **[uno-picker/README.md](uno-picker/README.md)** - Pełna dokumentacja funkcji
- **[uno-picker/INSTALLATION.md](uno-picker/INSTALLATION.md)** - Szczegółowa instrukcja instalacji
- **[uno-picker/CHANGELOG.md](uno-picker/CHANGELOG.md)** - Historia zmian

### Wymagania
- Backend wyniki-live uruchomiony (API dostępne)
- Chrome/Edge 88+ (Manifest v3)
- Dostęp do `app.overlays.uno`

Szczegóły: Zobacz [uno-picker/README.md](uno-picker/README.md)

## 🏗️ Architektura

```
wyniki-live/
├── app.py                 # Entrypoint aplikacji
├── wyniki/                # Główny pakiet
│   ├── __init__.py
│   ├── web.py            # Flask app factory
│   ├── routes.py         # Wszystkie endpointy (1850+ LOC)
│   ├── database.py       # Warstwa dostępu do SQLite
│   ├── state.py          # Zarządzanie stanem, SSE, UNO API
│   ├── query_system.py   # System zapytań
│   ├── poller.py         # UNO API poller
│   ├── config.py         # Konfiguracja
│   └── utils.py          # Funkcje pomocnicze
├── static/
│   ├── js/
│   │   ├── app.js        # Główna aplikacja (lista kortów)
│   │   ├── admin.js      # Panel administratora
│   │   ├── embed.js      # Widok embedded
│   │   ├── common.js     # Współdzielone funkcje
│   │   └── translations.js
│   └── styles.css
├── tests/                # Testy jednostkowe
├── uno-picker/           # Wtyczka Chrome (v1.0.0)
│   ├── manifest.json     # Konfiguracja Manifest v3
│   ├── content.js        # Główna logika (605 LOC)
│   ├── picker.css        # Style popovera
│   ├── README.md         # Dokumentacja wtyczki
│   ├── INSTALLATION.md   # Instrukcja instalacji
│   └── CHANGELOG.md      # Historia zmian
├── download/             # Pliki do pobrania (.zip, .crx)
└── docker-compose.yml    # Orchestracja

```

## 🔐 Bezpieczeństwo

- Hasła przechowywane jako zmienne środowiskowe
- Session-based authentication dla admin panel
- HMAC comparison dla weryfikacji hasła
- Rate limiting dla UNO API
- Input sanitization i validation

## 🌟 Kluczowe Funkcje

**Ultra-Smart Hierarchical Polling** (60% redukcja zapytań vs naive approach):
- Tier 1: Punkty zawsze co 10s
- Tier 2: Gemy tylko przy 40/ADV
- Tier 3: Sety tylko gdy gemy ≥ 3
- Tie-break mode: Dedykowany polling z obsługą przewagi 2 punktów

**Capacity**: 4 korty równocześnie (70% limitu dziennego API)

**Testy**: 11/11 passing - scenariusze realistyczne + edge cases

---

## 📄 Licencja

[Dodaj licencję tutaj]

## 👥 Autorzy

- [@suchokrates1](https://github.com/suchokrates1)

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## 📧 Kontakt

W razie pytań lub problemów, otwórz issue na GitHubie.
