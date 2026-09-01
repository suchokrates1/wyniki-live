# Wyniki v2 - Live Tennis Scoreboard

Real-time tennis match scoreboard with admin panel and PIN-based court verification.

## 📖 Documentation

### Przewodniki UI (Obsidian)

Pełny katalog strony publicznej, biura i admina (każdy przycisk / zakładka):

➡️ **[../docs/przewodniki/00 - Biuro i strona publiczna.md](../docs/przewodniki/00%20-%20Biuro%20i%20strona%20publiczna.md)**

Otwórz folder `wyniki-live/docs/przewodniki/` jako vault.

### Techniczne / ops

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
- **Public**: `/` (np. https://score.vestmedia.pl)
- **Tournament Office**: `/office` lub `/office/<slot>`
- **Admin Panel**: `/admin`
- **Umpire PWA**: `/umpire` (tablet Chrome; install notes in [docs/UMPIRE_PWA.md](docs/UMPIRE_PWA.md))
- **Overlay**: `/overlay/<id>`
- **API Base**: `/api`

## 🏗️ Architecture

- **Backend**: Flask 3.0.0 + gunicorn + SQLAlchemy
- **Frontend**: Vite 5.0.8 + Alpine.js 3.13.3 + Tailwind CSS
- **Database**: SQLite
- **Deployment**: Docker on minipc (192.168.31.147:8088)
- **Reverse Proxy**: Traefik on RPI5 → Cloudflare CDN

## 🔑 Features

- Real-time scores (SSE) — public + office
- Tournament office: planning, autoschedule, results, quick-info banner
- Admin: courts/PIN, tournaments, global players, overlay designer
- PIN-based court verification for umpire app
- Multilingual public UI (PL/EN/DE/IT/ES/FR)

## 📝 Recent Changes

- ✅ Removed UNO/overlay_id system
- ✅ Added PIN management to courts
- ✅ Fixed Vite asset routing
- ✅ Migrated from v1 architecture

## 🔒 Security

Sensitive files (credentials, deployment scripts) are excluded from git via `.gitignore`.
See `INFRASTRUCTURE.md` for server access details (local file only).
