# Wyniki v2 - Live Tennis Scoreboard

Real-time tennis match scoreboard with admin panel and PIN-based court verification.

## 📖 Documentation

- **[INFRASTRUCTURE.md](INFRASTRUCTURE.md)** ⚠️ Server credentials & SSH access (not in git)
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** - Deployment procedures (not in git)
- **[docs/traefik-optimization-proposal.md](docs/traefik-optimization-proposal.md)** - Reverse proxy setup (not in git)
- **[UMPIRE_API.md](UMPIRE_API.md)** - API endpoints documentation
- **[INTEGRATION.md](INTEGRATION.md)** - Integration guide with Umpire App
- **[docs/ARCHITECTURE_FREEZE_MAY2026.md](docs/ARCHITECTURE_FREEZE_MAY2026.md)** - pre-tournament freeze policy
- **[docs/TOURNAMENT_READINESS_CHECKLIST.md](docs/TOURNAMENT_READINESS_CHECKLIST.md)** - operational checklist before live event
- **[docs/PRODUCTION_RUNBOOK.md](docs/PRODUCTION_RUNBOOK.md)** - backup, smoke, deploy, rollback procedures
- **[CLEANUP_UNO.md](CLEANUP_UNO.md)** - UNO system removal notes

## 🚀 Quick Start

### Development
```bash
# Install dependencies
pip install -r requirements.txt

# Run locally
python app.py
```

### Access Points
- **Public URL**: https://test.vestmedia.pl
- **Admin Panel**: https://test.vestmedia.pl/admin
- **API Base**: https://test.vestmedia.pl/api

## 🏗️ Architecture

- **Backend**: Flask 3.0.0 + gunicorn + SQLAlchemy
- **Frontend**: Vite 5.0.8 + Alpine.js 3.13.3 + Tailwind CSS
- **Database**: SQLite
- **Deployment**: Docker on minipc (192.168.31.147:8088)
- **Reverse Proxy**: Traefik on RPI5 → Cloudflare CDN

## 🔑 Features

- Real-time court status updates (SSE)
- PIN-based court verification system
- Admin panel for court management
- RESTful API for match data
- Responsive design with DaisyUI

## 📝 Recent Changes

- ✅ Removed UNO/overlay_id system
- ✅ Added PIN management to courts
- ✅ Fixed Vite asset routing
- ✅ Migrated from v1 architecture

## 🔒 Security

Sensitive files (credentials, deployment scripts) are excluded from git via `.gitignore`.
See `INFRASTRUCTURE.md` for server access details (local file only).
