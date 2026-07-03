# Wyniki Live - Tennis Score Display System

Live tennis scoring system with UNO API integration, admin panel, multilingual support, and tournament office workflow.

## 🎯 Quick Links

- **📖 [Deployment Guide](DEPLOYMENT.md)** - SSH access, deployment, troubleshooting
- **🌐 Live Site**: https://score.vestmedia.pl / https://blindtennis.app
- **🏢 Tournament Office**: https://blindtennis.app/office
- **📚 [API Documentation](API.md)** - Complete API reference

## ✨ Features

- 🎾 **Real-time Scores** - Live updates for 4 courts
- 🌍 **Multilingual** - PL, EN, DE, IT, ES, FR
- 👨‍💼 **Admin Panel** - Match history, court management, player database
- 🚀 **UNO API Integration** - Smart polling with rate limiting
- 🏁 **195+ Country Flags** - Complete flag database
- 🐳 **Docker Ready** - Production-ready containerization

## 🏗️ Architecture

### Stack
- **Backend**: Flask 3.0 + Python 3.11
- **Database**: SQLite3
- **Proxy**: Cloudflare + Traefik
- **Deployment**: Docker Compose

### Services
- **wyniki-tenis-v2** - Main Flask app (port 8087)

## 🚀 Quick Start

### Local Development

```bash
# Clone repository
git clone https://github.com/suchokrates1/wyniki-live.git
cd wyniki-live

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Run locally
python app.py
```

Open http://localhost:5000 in your browser.

### Docker Deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for complete deployment guide.

```bash
# Quick deployment to server
ssh -i ~/.ssh/wyniki_minipc suchokrates1@100.110.194.46 \
  "cd ~/count && git pull && docker compose build wyniki && docker compose up -d wyniki"
```

## 📡 API Endpoints

### Public
- `GET /` - Main scoreboard
- `GET /office` - Tournament office
- `GET /admin` - Admin panel
- `GET /api/snapshot` - Current match data
- `GET /api/stream` - SSE live updates

### Admin (requires authentication)
- `POST /admin/login` - Admin login
- `GET /admin` - Admin panel
- `GET /api/admin/history` - Match history
- `POST /api/admin/history` - Create history entry
- `PUT /api/admin/history/<id>` - Update entry
- `DELETE /api/admin/history/<id>` - Delete entry

See **[API.md](API.md)** for complete API documentation.

## ⚙️ Configuration

Key environment variables in `.env`:

```bash
# UNO API Configuration
UNO_BASE=https://app.overlays.uno/apiv2/controlapps
KORT1_ID=your_court1_id
KORT2_ID=your_court2_id
KORT3_ID=your_court3_id
KORT4_ID=your_court4_id
UNO_AUTH_BEARER=your_bearer_token

# Rate Limiting
RPM_PER_COURT=55  # Requests per minute per court
BURST=8           # Burst allowance

# Admin Panel
ADMIN_PASSWORD=your_secure_password

# Domain
PUBLIC_HOST=score.vestmedia.pl
PUBLIC_HOST_ALT=blindtennis.app
```

See `.env.example` for all configuration options.

## 🧪 Testing

```bash
# Run all tests
pytest

# With coverage report
pytest --cov=wyniki --cov-report=html

# Specific test file
pytest tests/test_match_time.py

# Watch mode
pytest-watch
```

## 🛠️ Development Tools

```bash
# Install dev dependencies
pip install -r requirements-dev.txt

# Type checking
mypy wyniki/

# Code formatting
black wyniki/ tests/

# Linting
flake8 wyniki/

# Security scan
bandit -r wyniki/

# Pre-commit hooks
pre-commit install
pre-commit run --all-files
```

## 📁 Project Structure

```
wyniki-live/
├── wyniki-v2/             # Current application (Flask + Vite frontend)
│   ├── app.py             # Flask application entry point
│   ├── wyniki/            # Backend package
│   ├── frontend/          # HTML/JS sources
│   └── docker-compose.yml # Container orchestration
├── tests/                 # Test suite
└── requirements.txt       # Python dependencies
```

## 🔐 Security

- Admin panel protected by password authentication
- Session-based authentication for admin API
- HTTPS-only in production (enforced by Cloudflare)
- Rate limiting on UNO API requests
- CORS configured for public API endpoints

## 📄 License

This project is proprietary software. All rights reserved.

## 🤝 Support

For deployment issues, see [DEPLOYMENT.md](DEPLOYMENT.md).

For API questions, see [API.md](API.md).
