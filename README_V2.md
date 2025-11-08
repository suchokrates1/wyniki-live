# Wyniki Live v2.0 🎾

Modern, refactored version of the tennis live scores application.

## ✨ What's New in v2

### Frontend
- 🎨 **Alpine.js** - Lightweight reactive framework
- 💅 **Tailwind CSS + DaisyUI** - Modern design system
- 📦 **Vite** - Fast build tool
- 🌓 **Better dark mode** - Smooth theme switching
- ⚡ **Optimized bundle** - Smaller, faster loading

### Backend  
- 🔒 **Pydantic models** - Type safety and validation
- 📊 **Structured logging** - JSON logs with structlog
- 📈 **Prometheus metrics** - Built-in monitoring
- 🏗️ **Modular architecture** - Clean code organization
- ✅ **Health checks** - Better reliability

### Architecture
```
wyniki-live/
├── frontend/              # Alpine.js + Tailwind
│   ├── src/
│   │   ├── components/
│   │   ├── composables/   # Reusable logic
│   │   └── main.js
│   ├── index.html
│   └── package.json
│
├── backend/
│   └── wyniki_v2/
│       ├── api/           # Grouped endpoints
│       ├── models/        # Pydantic models
│       ├── services/      # Business logic
│       └── database/      # DB layer
│
├── static_v2/             # Built frontend (generated)
└── docker-compose.test.yml
```

## 🚀 Quick Start

### Option 1: Automated Build & Deploy

**Windows (PowerShell):**
```powershell
.\build-and-deploy.ps1
```

**Linux/Mac (Bash):**
```bash
chmod +x build-and-deploy.sh
./build-and-deploy.sh
```

This will:
1. Install Node.js dependencies
2. Build frontend with Vite
3. Build Docker image
4. Start container on port 8088
5. Run health checks

### Option 2: Manual Steps

**1. Build Frontend:**
```bash
cd frontend
npm install
npm run build
cd ..
```

**2. Build and Run Docker:**
```bash
docker-compose -f docker-compose.test.yml up --build -d
```

**3. Verify:**
```bash
curl http://localhost:8088/health
```

## 🔧 Development

### Frontend Development Server

```bash
cd frontend
npm run dev
```

This starts Vite dev server with:
- Hot Module Replacement (HMR)
- Proxy to backend API
- Port: 5173

### Backend Development

```bash
cd backend
pip install -r requirements.txt
python app_v2.py
```

## 🏥 Health Check

```bash
curl http://localhost:8088/health
```

Response:
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "components": {
    "database": "ok",
    "poller": "ok"
  }
}
```

## 📊 Monitoring

Prometheus metrics available at:
```
http://localhost:8088/metrics
```

Metrics include:
- Request count
- Request latency
- HTTP status codes
- Custom application metrics

## 🎨 Tailwind CSS Customization

Edit `frontend/tailwind.config.js`:

```javascript
theme: {
  extend: {
    colors: {
      'tennis-green': {
        500: '#22c55e',
        // ... your custom colors
      }
    }
  }
}
```

## 🐳 Docker Commands

```bash
# View logs
docker-compose -f docker-compose.test.yml logs -f

# Stop
docker-compose -f docker-compose.test.yml down

# Restart
docker-compose -f docker-compose.test.yml restart

# Rebuild
docker-compose -f docker-compose.test.yml up --build -d
```

## 🌐 Access Points

- **Main App:** http://localhost:8088
- **Admin Panel:** http://localhost:8088/admin
- **API:** http://localhost:8088/api/snapshot
- **Health:** http://localhost:8088/health
- **Metrics:** http://localhost:8088/metrics

## 🔐 Environment Variables

Create `.env` file:

```bash
# Flask
SECRET_KEY=your-secret-key
FLASK_ENV=production
DEBUG=false

# Server
PORT=8088

# Database
DATABASE_PATH=/data/wyniki_test.sqlite3

# Admin
ADMIN_PASSWORD=your-admin-password

# UNO API
UNO_RATE_LIMIT_HOURLY=600
UNO_REQUESTS_ENABLED=true

# Logging
LOG_LEVEL=INFO
LOG_FORMAT=json
```

## 📝 Differences from v1

| Feature | v1 | v2 |
|---------|----|----|
| Frontend | Vanilla JS | Alpine.js |
| Styling | Custom CSS | Tailwind + DaisyUI |
| Build Tool | None | Vite |
| Bundle Size | ~150KB | ~80KB |
| Backend Structure | Monolithic | Modular |
| Type Safety | None | Pydantic |
| Logging | Print statements | Structured JSON |
| Monitoring | None | Prometheus |
| Health Checks | No | Yes |
| Port | 8087 | 8088 |

## 🧪 Testing

```bash
# Backend tests
cd backend
pytest

# Frontend tests (if configured)
cd frontend
npm test
```

## 📚 Additional Documentation

- **API Documentation:** See backend/wyniki_v2/api/
- **Component Docs:** See frontend/src/components/
- **Deployment Guide:** See DEPLOYMENT.md (TBD)

## 🐛 Troubleshooting

**Frontend not building?**
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run build
```

**Docker image not starting?**
```bash
docker-compose -f docker-compose.test.yml logs wyniki-test
```

**Port 8088 already in use?**
Edit `docker-compose.test.yml`:
```yaml
ports:
  - "8089:8088"  # Change external port
```

## 📄 License

Same as v1

## 👥 Contributors

- Original v1 by suchokrates1
- v2 refactoring with AI assistance

---

**Status:** ⚠️ Work in Progress - Some features from v1 still being migrated
