# API Documentation - wyniki-live

## Publiczne Endpointy

### GET `/`
**Opis:** Strona główna z listą wszystkich kortów  
**Response:** HTML

### GET `/embed/<country_code>/<kort_id>`
**Opis:** Widok embedded pojedynczego kortu  
**Parametry:**
- `country_code` - kod kraju (np. "pl", "en", "de")
- `kort_id` - identyfikator kortu

**Response:** HTML

### GET `/static/<path:filename>`
**Opis:** Pliki statyczne (CSS, JS)  
**Response:** File

### GET `/download`
**Opis:** Pobieranie pierwszego pliku .zip z katalogu download/  
**Response:** File (ZIP) lub 404

### GET `/viewers` (alias `/vievers`)
**Opis:** Liczba widzów transmisji YouTube  
**Response:** Plain text (liczba)

### GET `/healthz`
**Opis:** Health check endpoint  
**Response:**
```json
{
  "ok": true,
  "ts": "2025-11-06T12:00:00.000Z"
}
```

---

## API Endpointy

### GET `/api/players`
**Opis:** Lista graczy z flagami  
**Parametry query:**
- `list` (opcjonalny) - filtr po liście (domyślnie wszystkie)

**Response:**
```json
{
  "ok": true,
  "generated_at": "2025-11-06T12:00:00.000Z",
  "count": 5,
  "list": "default",
  "lists": ["default", "juniors"],
  "players": [
    {
      "id": 1,
      "name": "Jan Kowalski",
      "flag": "pl",
      "flagUrl": "https://flagcdn.com/w80/pl.png",
      "list": "default"
    }
  ]
}
```

### POST `/api/set_flag`
**Opis:** Ustawia flagę dla gracza (endpoint dla wtyczki UNO Picker)  
**Auth:** Brak (publiczny endpoint)  
**Content-Type:** `application/json`

**Request Body:**
```json
{
  "player": "A",
  "flag": "pl",
  "flag_url": "https://flagcdn.com/w80/pl.png"
}
```

**Response (sukces):**
```json
{
  "ok": true,
  "player": "A",
  "flag": "pl",
  "flag_url": "https://flagcdn.com/w80/pl.png",
  "message": "Flag set for Player A"
}
```

**Response (błąd):**
```json
{
  "ok": false,
  "error": "Invalid player (must be A or B)"
}
```

**Status codes:**
- `200 OK` - Sukces
- `400 Bad Request` - Nieprawidłowe dane (brak player, nieprawidłowy player, brak flag/flag_url)
- `500 Internal Server Error` - Błąd serwera

**Uwaga:** Endpoint obecnie zwraca sukces bez modyfikacji stanu gry. Flagi są zarządzane po stronie UNO Overlays. W przyszłości może być rozszerzony o integrację z state management.

### GET `/api/snapshot`
**Opis:** Migawka stanu wszystkich kortów  
**Response:**
```json
{
  "ok": true,
  "generated_at": "2025-11-06T12:00:00.000Z",
  "courts": {
    "kort1": {
      "kort_id": "kort1",
      "overlay_visible": true,
      "mode": "normal",
      "serve": "A",
      "current_set": 1,
      "A": {
        "full_name": "Jan Kowalski",
        "surname": "Kowalski",
        "points": "40",
        "set1": 3,
        "set2": 0,
        "flag_url": "https://flagcdn.com/w80/pl.png",
        "flag_code": "pl"
      },
      "B": { /* ... */ }
    }
  }
}
```

### GET `/api/stream`
**Opis:** Server-Sent Events stream ze zmianami stanu  
**Response:** text/event-stream
```
data: {"kort_id": "kort1", "event": "update", ...}

data: {"kort_id": "kort2", "event": "update", ...}
```

### POST `/api/mirror`
**Opis:** Mirror endpoint dla UNO API  
**Body:**
```json
{
  "unoUrl": "https://...",
  "overlay": "abc123",
  "kort": "kort1"
}
```

### POST `/api/local/reflect/<kort_id>`
**Opis:** Lokalny endpoint do aktualizacji stanu kortu  
**Body:** Dane stanu kortu

### POST `/api/uno/exec/<kort_id>`
**Opis:** Wykonanie komendy UNO dla kortu  
**Body:**
```json
{
  "command": "start_timer",
  "value": true
}
```
**Response:**
```json
{
  "ok": true,
  "command": "start_timer",
  "value": true,
  "status_code": 200
}
```

---

## Admin Panel Endpointy

### GET `/admin/`
**Opis:** Panel administratora  
**Auth:** Session cookie  
**Response:** HTML

### POST `/admin/login`
**Opis:** Logowanie do panelu admin  
**Body:**
```json
{
  "password": "admin_password"
}
```
**Response:**
```json
{
  "ok": true
}
```

---

## Admin API Endpointy

### GET `/api/admin/youtube`
**Opis:** Konfiguracja YouTube API  
**Auth:** Session required  
**Response:**
```json
{
  "ok": true,
  "api_key": "AIza...",
  "stream_id": "abc123",
  "viewers": 150,
  "viewers_error": null
}
```

### PUT `/api/admin/youtube`
**Opis:** Aktualizacja konfiguracji YouTube  
**Auth:** Session required  
**Body:**
```json
{
  "api_key": "AIza...",
  "stream_id": "abc123"
}
```

### GET `/api/admin/history`
**Opis:** Lista historii meczów  
**Auth:** Session required

### PUT `/api/admin/history/<entry_id>`
**Opis:** Aktualizacja wpisu historii  
**Auth:** Session required

### DELETE `/api/admin/history/<entry_id>`
**Opis:** Usunięcie wpisu historii  
**Auth:** Session required

### GET `/api/admin/courts`
**Opis:** Lista kortów  
**Auth:** Session required

### POST `/api/admin/courts`
**Opis:** Dodanie kortu  
**Auth:** Session required  
**Body:**
```json
{
  "kort_id": "kort1",
  "overlay_id": "abc123"
}
```

### DELETE `/api/admin/courts/<kort_id>`
**Opis:** Usunięcie kortu  
**Auth:** Session required

### POST `/api/admin/courts/<kort_id>/reset`
**Opis:** Reset stanu kortu  
**Auth:** Session required

### GET `/api/admin/players`
**Opis:** Lista graczy  
**Auth:** Session required  
**Parametry query:**
- `list` (opcjonalny) - filtr po liście

### POST `/api/admin/players`
**Opis:** Dodanie gracza  
**Auth:** Session required  
**Body:**
```json
{
  "name": "Jan Kowalski",
  "list_name": "default",
  "flag_code": "pl",
  "flag_url": "https://flagcdn.com/w80/pl.png"
}
```

### PUT `/api/admin/players/<player_id>`
**Opis:** Aktualizacja gracza  
**Auth:** Session required

### DELETE `/api/admin/players/<player_id>`
**Opis:** Usunięcie gracza  
**Auth:** Session required

### POST `/api/admin/players/import`
**Opis:** Import graczy z pliku JSON  
**Auth:** Session required  
**Body:** FormData z plikiem

### GET `/api/admin/flags`
**Opis:** Lista dostępnych flag krajów  
**Auth:** Session required  
**Response:**
```json
{
  "ok": true,
  "flags": [
    {
      "code": "pl",
      "url": "https://flagcdn.com/w80/pl.png",
      "label": "PL"
    }
  ]
}
```

### GET `/api/admin/system`
**Opis:** Ustawienia systemowe (UNO, plugin, rate limits)  
**Auth:** Session required

### PUT `/api/admin/system`
**Opis:** Aktualizacja ustawień systemowych  
**Auth:** Session required  
**Body:**
```json
{
  "uno_requests_enabled": true,
  "plugin_enabled": false,
  "uno_hourly_limit": 60,
  "uno_hourly_threshold": 0.8,
  "uno_slowdown_factor": 2,
  "uno_slowdown_sleep": 1.0
}
```

---

## Kody błędów

| Kod | Znaczenie |
|-----|-----------|
| 400 | Bad Request - niepoprawne dane |
| 401 | Unauthorized - brak autoryzacji |
| 404 | Not Found - zasób nie istnieje |
| 429 | Too Many Requests - rate limit |
| 503 | Service Unavailable - usługa wyłączona |

---

## Autentykacja

Admin API wymaga sesji. Proces:
1. POST `/admin/login` z hasłem
2. Otrzymanie cookie sesji
3. Używanie cookie w kolejnych żądaniach
