# Umpire App API Integration

This document describes the REST API endpoints used by the Android Umpire App to synchronize match data with the wyniki-v2 backend.

## Base URL

All endpoints are prefixed with `/api`

## Endpoints

### 1. Get Available Courts

**GET** `/api/courts`

Returns list of available courts for the app.

**Response:**
```json
{
  "courts": [
    {
      "id": "1",
      "name": "Court 1",
      "overlay_id": "overlay1"
    }
  ]
}
```

### 2. Get Players

**GET** `/api/players`

Returns list of players from the active tournament.

**Response:**
```json
{
  "players": [
    {
      "id": "123",
      "surname": "Kowalski",
      "full_name": "Jan Kowalski",
      "country_code": "PL",
      "flag_url": null
    }
  ]
}
```

### 3. Add New Player

**POST** `/api/players`

Adds a new player to the active tournament.

**Request Body:**
```json
{
  "surname": "Nowak",
  "country_code": "PL",
  "category": "Open"
}
```

**Response:**
```json
{
  "id": "124",
  "surname": "Nowak",
  "full_name": "Nowak",
  "country_code": "PL",
  "flag_url": null
}
```

### 4. Authorize Court

**POST** `/api/courts/<court_id>/authorize`

Verifies court PIN for access control.

**Request Body:**
```json
{
  "pin": "1234"
}
```

**Response:**
```json
{
  "authorized": true,
  "court_id": "1",
  "court_name": "Court 1"
}
```

### 5. Create Match

**POST** `/api/matches`

Creates a new match on the server.

**Request Body:**
```json
{
  "court_id": "1",
  "player1_name": "Kowalski",
  "player2_name": "Nowak",
  "status": "in_progress",
  "score": {
    "player1_sets": 1,
    "player2_sets": 0,
    "player1_games": 3,
    "player2_games": 2,
    "player1_points": 30,
    "player2_points": 15,
    "sets_history": [
      {
        "player1_games": 6,
        "player2_games": 4
      }
    ]
  }
}
```

**Response:**
```json
{
  "id": 1,
  "court_id": "1",
  "player1_name": "Kowalski",
  "player2_name": "Nowak",
  "status": "in_progress",
  "created_at": "2025-11-25T10:30:00",
  "updated_at": "2025-11-25T10:30:00"
}
```

### 6. Get Match Details

**GET** `/api/matches/<match_id>`

Retrieves match details by ID.

**Response:**
```json
{
  "id": 1,
  "court_id": "1",
  "player1_name": "Kowalski",
  "player2_name": "Nowak",
  "status": "in_progress",
  "player1_sets": 1,
  "player2_sets": 0,
  "player1_games": 3,
  "player2_games": 2,
  "player1_points": 30,
  "player2_points": 15,
  "sets_history": "[{\"player1_games\":6,\"player2_games\":4}]",
  "created_at": "2025-11-25T10:30:00",
  "updated_at": "2025-11-25T10:35:00"
}
```

### 7. Update Match Score

**PUT** `/api/matches/<match_id>`

Updates match score and state. This triggers real-time updates to scoreboards via SSE.

**Request Body:**
```json
{
  "status": "in_progress",
  "score": {
    "player1_sets": 1,
    "player2_sets": 1,
    "player1_games": 2,
    "player2_games": 3,
    "player1_points": 40,
    "player2_points": 30,
    "sets_history": [
      {
        "player1_games": 6,
        "player2_games": 4
      },
      {
        "player1_games": 3,
        "player2_games": 6
      }
    ]
  }
}
```

**Response:**
```json
{
  "id": 1,
  "status": "success",
  "message": "Match updated and broadcasted to scoreboards"
}
```

### 8. Finish Match

**POST** `/api/matches/<match_id>/finish`

Marks match as finished.

**Response:**
```json
{
  "id": 1,
  "status": "finished",
  "message": "Match finished successfully"
}
```

### 9. Send Match Statistics

**POST** `/api/match-statistics`

Sends detailed match statistics after match completion.

**Request Body:**
```json
{
  "match_id": 1,
  "player1_stats": {
    "aces": 5,
    "double_faults": 2,
    "winners": 12,
    "forced_errors": 8,
    "unforced_errors": 15,
    "first_serve_in": 35,
    "first_serve_total": 50,
    "first_serve_won": 28,
    "second_serve_won": 10
  },
  "player2_stats": {
    "aces": 3,
    "double_faults": 4,
    "winners": 10,
    "forced_errors": 9,
    "unforced_errors": 18,
    "first_serve_in": 32,
    "first_serve_total": 48,
    "first_serve_won": 25,
    "second_serve_won": 8
  },
  "match_duration_ms": 5400000,
  "winner": "player1"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Statistics saved successfully"
}
```

### 10. Log Match Event

**POST** `/api/match-events`

Logs match events for analytics.

**Request Body:**
```json
{
  "match_id": 1,
  "event_type": "point_won",
  "player": "A",
  "timestamp": "2025-11-25T10:45:32",
  "details": {
    "score_before": "30-15",
    "score_after": "40-15"
  }
}
```

**Response:**
```json
{
  "status": "success",
  "event_id": 456
}
```

## Real-time Updates

When a match score is updated via `PUT /api/matches/<match_id>`, the backend:

1. Saves the match data to the database
2. Updates the in-memory court state
3. Broadcasts the update via Server-Sent Events (SSE) to all connected overlay clients
4. Overlay clients receive the update and refresh the scoreboard in real-time

## Data Flow

```
Umpire App (Android)
    ↓
REST API (Flask)
    ↓
SQLAlchemy + SQLite Database
    ↓
Court State Manager (in-memory)
    ↓
Event Broker (SSE)
    ↓
Overlay Clients (Browser)
```

## Score Structure

The score object follows this structure:

```json
{
  "player1_sets": 0,      // Number of sets won
  "player2_sets": 0,
  "player1_games": 0,     // Games in current set
  "player2_games": 0,
  "player1_points": 0,    // Points in current game (0, 15, 30, 40)
  "player2_points": 0,
  "sets_history": [       // Completed sets
    {
      "player1_games": 6,
      "player2_games": 4
    }
  ]
}
```

## Authentication

Currently, only court PIN authorization is implemented. Future versions may include:
- JWT tokens
- API keys
- OAuth2

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200 OK` - Success
- `201 Created` - Resource created
- `400 Bad Request` - Invalid input
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

Error responses include a JSON body:

```json
{
  "error": "Description of the error"
}
```

## Testing

To test the API endpoints, you can use curl:

```bash
# Get courts
curl http://localhost:5000/api/courts

# Create match
curl -X POST http://localhost:5000/api/matches \
  -H "Content-Type: application/json" \
  -d '{"court_id":"1","player1_name":"Test A","player2_name":"Test B","status":"in_progress","score":{"player1_sets":0,"player2_sets":0,"player1_games":0,"player2_games":0,"player1_points":0,"player2_points":0,"sets_history":[]}}'

# Update match
curl -X PUT http://localhost:5000/api/matches/1 \
  -H "Content-Type: application/json" \
  -d '{"score":{"player1_sets":0,"player2_sets":0,"player1_games":0,"player2_games":0,"player1_points":15,"player2_points":0,"sets_history":[]}}'
```

## Database Schema

### Match Table
- `id` (INTEGER, PK)
- `court_id` (TEXT)
- `player1_name` (TEXT)
- `player2_name` (TEXT)
- `status` (TEXT) - "in_progress", "finished"
- `player1_sets`, `player2_sets` (INTEGER)
- `player1_games`, `player2_games` (INTEGER)
- `player1_points`, `player2_points` (INTEGER)
- `sets_history` (TEXT, JSON)
- `created_at`, `updated_at` (TEXT, ISO 8601)

### MatchStatistics Table
- `id` (INTEGER, PK)
- `match_id` (INTEGER, FK)
- `player1_aces`, `player1_double_faults`, etc. (INTEGER)
- `player2_aces`, `player2_double_faults`, etc. (INTEGER)
- `match_duration_ms` (INTEGER)
- `winner` (TEXT)
- `created_at` (TEXT, ISO 8601)

### Player Table
- `id` (INTEGER, PK)
- `tournament_id` (INTEGER, FK)
- `name` (TEXT)
- `country` (TEXT)
- `category` (TEXT)

### Tournament Table
- `id` (INTEGER, PK)
- `name` (TEXT)
- `active` (BOOLEAN)
- `start_date`, `end_date` (TEXT)
