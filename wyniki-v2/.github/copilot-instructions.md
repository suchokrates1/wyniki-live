# Copilot Instructions - Wyniki Live Scoring System

> ⚠️ **WAŻNE:** Pełna dokumentacja infrastruktury (serwery, deployment, API tokens, konfiguracja) znajduje się w:
> `C:\Users\sucho\.config\infrastructure\INFRASTRUCTURE.md`

This is a Flask-based live tennis scoring backend for the Vest Tennis platform.

## 🏗 Architecture Overview

```
wyniki-v2/
├── app.py                    # Flask app factory with gevent monkey-patching
├── wyniki/
│   ├── config.py             # Pydantic Settings configuration
│   ├── database.py           # SQLAlchemy setup
│   ├── api/                  # Flask Blueprints
│   │   ├── courts.py         # Public court/snapshot endpoints
│   │   ├── admin.py          # Admin operations
│   │   ├── stream.py         # Server-Sent Events
│   │   ├── umpire_api.py     # Mobile app integration
│   │   └── health.py         # Health checks
│   └── services/
│       ├── court_manager.py  # Court state CRUD
│       ├── match_engine.py   # Tennis scoring logic
│       ├── event_broker.py   # SSE distribution
│       └── history_manager.py# Match history
├── frontend/                 # Vue.js + Vite dashboard
└── Dockerfile                # Production deployment
```

## 🔧 Technology Stack

| Component | Technology |
|-----------|------------|
| Framework | Flask 3.0.0 |
| ORM | Flask-SQLAlchemy 3.1.1 |
| Server | Gunicorn 21.2.0 + Gevent 24.2.1 |
| Config | Pydantic-Settings 2.1.0 |
| Logging | Structlog 24.1.0 |
| Metrics | Prometheus Flask Exporter |
| Frontend | Vite + Vue.js + Tailwind CSS |

## 🎾 Tennis Scoring Engine

### Point Sequence
```python
POINT_SEQUENCE = ["0", "15", "30", "40", "ADV"]
```

### State Structure
```python
{
    "A": {"surname": "Player A", "sets": 0, "games": 0, "points": "0"},
    "B": {"surname": "Player B", "sets": 0, "games": 0, "points": "0"},
    "match_time": {
        "seconds": 0,
        "running": True,
        "started_ts": "2024-01-01T12:00:00Z"
    },
    "match_status": {"active": True}
}
```

### Key Functions in `match_engine.py`
- `ensure_match_struct()` - Initialize match_time/match_status
- `maybe_start_match()` - Auto-start when players assigned
- `update_match_timer()` - Calculate elapsed time
- `stop_match_timer()` - Finalize match

## 📡 API Endpoints

### Public
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/snapshot` | GET | All courts current state |
| `/api/history` | GET | Completed matches |
| `/api/stream` | GET | SSE real-time updates |

### Umpire (Mobile App)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/courts` | GET | List courts |
| `/api/players` | GET | List players |
| `/api/courts/<id>/authorize` | POST | PIN authentication |
| `/api/courts/<id>/state` | PUT | Update match state |
| `/api/courts/<id>/finish` | POST | End match |

### Admin
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/admin/courts` | GET/POST | Manage courts |
| `/admin/players` | GET/POST | Manage players |
| `/admin/reset` | POST | Reset court state |

## 💻 Coding Standards

### Flask Patterns
```python
# Blueprint registration pattern
from flask import Blueprint, jsonify

blueprint = Blueprint('name', __name__, url_prefix='/api')

@blueprint.route('/endpoint')
def handler():
    return jsonify({"data": result})
```

### Configuration
```python
# Always use Pydantic Settings
from wyniki.config import settings, logger

# Access config
db_path = settings.database_path
logger.info("Message", key="value")
```

### Thread Safety
```python
from wyniki.services.court_manager import STATE_LOCK

with STATE_LOCK:
    # Modify shared state
    pass
```

### Logging
```python
from wyniki.config import logger

# Use structlog, never print()
logger.info("Action completed", court_id=1, player="John")
logger.error("Failed operation", error=str(e))
```

## 🧪 Testing

```bash
# Run all tests
pytest

# With verbose output
pytest -v

# Specific module
pytest wyniki/services/test_match_engine.py
```

## 🚀 Development

### Local Setup
```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows

# Install dependencies
pip install -r requirements.txt

# Run development server
python app.py
```

### Environment Variables
Create `.env` file:
```env
FLASK_ENV=development
DEBUG=true
DATABASE_PATH=/data/wyniki.sqlite3
ADMIN_PASSWORD=your-password
LOG_LEVEL=DEBUG
LOG_FORMAT=console
```

### Docker
```bash
docker build -t wyniki-v2 .
docker run -p 8088:8088 -v ./data:/data wyniki-v2
```

## 🔌 Frontend Integration

### SSE Streaming
```javascript
// frontend/src/composables/useSSE.js
const eventSource = new EventSource('/api/stream');
eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    // Update court state
};
```

### Court Data Fetching
```javascript
// frontend/src/composables/useCourtData.js
const response = await fetch('/api/snapshot');
const { courts } = await response.json();
```

## 📝 Common Tasks

### Adding a new endpoint
1. Create/modify Blueprint in `wyniki/api/`
2. Register in `app.py` if new Blueprint
3. Add tests in `wyniki/api/test_*.py`

### Modifying scoring logic
1. Update `wyniki/services/match_engine.py`
2. Ensure thread-safe state modifications
3. Broadcast changes via `event_broker`

### Adding configuration option
1. Add field to `Settings` class in `config.py`
2. Set default value with type annotation
3. Document in `.env.example`
