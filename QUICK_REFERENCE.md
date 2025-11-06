# Quick Reference - wyniki-live

Szybki przewodnik po projekcie po refaktoryzacji.

---

## 🚀 Szybki start

```bash
# Klonowanie i instalacja
git clone https://github.com/suchokrates1/wyniki-live.git
cd wyniki-live
pip install -r requirements.txt

# Konfiguracja
cp .env.example .env
# Edytuj .env: ustaw ADMIN_PASSWORD, SECRET_KEY, OVERLAY_BASE

# Uruchomienie
python app.py
# Aplikacja dostępna na http://localhost:5000
```

---

## 📚 Dokumentacja

| Plik | Opis |
|------|------|
| **README.md** | Główna dokumentacja projektu |
| **API.md** | Kompletna dokumentacja API endpoints |
| **REFACTORING_REPORT.md** | Pełny raport refaktoryzacji |
| **CHANGELOG_REFACTORING.md** | Podsumowanie zmian |
| **IMPROVEMENTS_COMPLETED.md** | Lista wykonanych ulepszeń |
| **.env.example** | Przykładowa konfiguracja środowiska |

---

## 🛠️ Najważniejsze komendy

### Development

```bash
# Instalacja dev dependencies
pip install -r requirements-dev.txt

# Pre-commit hooks
pre-commit install
pre-commit run --all-files

# Type checking
mypy wyniki/

# Formatowanie
black wyniki/ tests/
isort wyniki/ tests/

# Linting
flake8 wyniki/ tests/

# Security
bandit -r wyniki/
```

### Testing

```bash
# Wszystkie testy
pytest

# Z coverage
pytest --cov=wyniki --cov-report=html

# Konkretny test
pytest tests/test_match_time.py -v
```

### Docker

```bash
# Uruchomienie
docker-compose up -d

# Zatrzymanie
docker-compose down

# Logi
docker-compose logs -f

# Rebuild
docker-compose up -d --build
```

---

## 📁 Struktura projektu

```
wyniki-live/
├── app.py                    # Entrypoint
├── wyniki/                   # Główny pakiet
│   ├── routes.py            # API endpoints (1800+ LOC)
│   ├── database.py          # SQLite layer
│   ├── state.py             # State management, SSE, UNO
│   ├── utils.py             # Helper functions
│   ├── config.py            # Configuration
│   ├── poller.py            # UNO poller
│   └── query_system.py      # Query system
├── static/js/               # Frontend
│   ├── app.js              # Main app
│   ├── admin.js            # Admin panel
│   ├── embed.js            # Embed view
│   ├── common.js           # Shared functions
│   └── translations.js     # i18n
├── tests/                   # Unit tests
└── download/                # Downloads (.zip, .crx)
```

---

## 🔑 Kluczowe endpointy

### Publiczne
- `GET /` - Strona główna
- `GET /embed/<country>/<kort_id>` - Embed view
- `GET /api/players` - Lista graczy z flagami
- `GET /api/snapshot` - Stan wszystkich kortów
- `GET /api/stream` - SSE stream

### Admin
- `GET /admin/` - Panel administratora
- `POST /admin/login` - Logowanie
- `GET /api/admin/flags` - **NOWE!** 195+ flag krajów
- `GET /api/admin/players` - Zarządzanie graczami
- `GET /api/admin/system` - Ustawienia UNO

---

## 🆕 Nowe funkcje po refaktoryzacji

### 1. Katalog flag (195+ krajów)
```python
# W routes.py
DEFAULT_FLAGS_CATALOG = {
    "pl": "https://flagcdn.com/w80/pl.png",
    "de": "https://flagcdn.com/w80/de.png",
    "us": "https://flagcdn.com/w80/us.png",
    # ... 195+ krajów
}
```

### 2. Helper funkcje API responses
```python
from wyniki.utils import error_response, success_response

# Błąd
return jsonify(error_response(
    "Invalid payload", 
    error_type="invalid-payload"
)), 400

# Sukces
return jsonify(success_response(
    {"player": player_data},
    "Player created successfully"
))
```

### 3. Type hints
```python
def _require_admin_session_json() -> Optional[Tuple[Response, int]]:
    # ...
```

---

## ⚙️ Zmienne środowiskowe (najważniejsze)

```bash
# Wymagane
ADMIN_PASSWORD=your_password
SECRET_KEY=random_secret
OVERLAY_BASE=https://your-uno-url.com

# UNO API limity
UNO_HOURLY_LIMIT_PER_COURT=60
UNO_HOURLY_SLOWDOWN_THRESHOLD=0.8

# Opcjonalne
PORT=5000
DB_PATH=./wyniki.db
MATCH_HISTORY_SIZE=100
```

Zobacz `.env.example` dla pełnej listy.

---

## 🧪 Checklist testów

Po zmianach sprawdź:

- [ ] Aplikacja uruchamia się bez błędów
- [ ] Panel admin - logowanie działa
- [ ] Panel admin - autocomplete flag (195+ krajów)
- [ ] Dodawanie gracza z flagą
- [ ] API `/api/admin/flags` - zwraca pełną listę
- [ ] Embed view - flagi wyświetlają się

---

## 🐛 Troubleshooting

### Problem: Błąd importu Flask
```bash
pip install -r requirements.txt
```

### Problem: Brak flagi kraju w adminie
1. Sprawdź `/api/admin/flags` - powinno zwrócić 195+ flag
2. Sprawdź konsole JS - czy są błędy?
3. Flag code musi być 2-literowy (lowercase): "pl", "de", "us"

### Problem: UNO API nie działa
1. Sprawdź `OVERLAY_BASE` w `.env`
2. Sprawdź logi aplikacji
3. Panel admin → System → UNO status

---

## 📊 Code quality metrics

```bash
# Type coverage
mypy wyniki/ --strict

# Test coverage
pytest --cov=wyniki --cov-report=term-missing

# Complexity
flake8 wyniki/ --max-complexity=10

# Security
bandit -r wyniki/ -ll
```

---

## 🔄 Workflow

### Dodanie nowej funkcji

1. **Branch**
   ```bash
   git checkout -b feature/nazwa-funkcji
   ```

2. **Develop**
   - Dodaj kod
   - Dodaj testy
   - Dodaj type hints

3. **Quality checks**
   ```bash
   black wyniki/ tests/
   isort wyniki/ tests/
   flake8 wyniki/ tests/
   mypy wyniki/
   pytest
   ```

4. **Commit**
   ```bash
   git add .
   git commit -m "feat: opis funkcji"
   ```

5. **Push & PR**
   ```bash
   git push origin feature/nazwa-funkcji
   ```

---

## 📞 Wsparcie

- **Issues:** https://github.com/suchokrates1/wyniki-live/issues
- **Dokumentacja:** Zobacz pliki .md w repozytorium
- **Logi:** Sprawdź `gunicorn.log` lub output terminala

---

**Ostatnia aktualizacja:** 6 listopada 2025  
**Wersja:** po refaktoryzacji + wszystkie ulepszenia
