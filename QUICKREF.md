# Quick Reference - Personal Notes

## 🔑 Access

```bash
# SSH to minipc (backend)
ssh -i C:\Users\sucho\.ssh\wyniki_minipc suchokrates1@100.110.194.46
cd ~/count/wyniki-v2

# SSH to RPI (Traefik + Cloudflare Tunnel)
ssh -i C:\Users\sucho\.ssh\wyniki_rpi suchokrates1@100.66.220.72
cd ~/traefik

# Network: RPI ↔ minipc (local 192.168.31.x)
# Cloudflare → cloudflared (RPI) → Traefik (RPI) → Flask (minipc:8087)
```

## 🚀 Deploy

```bash
# Standard
cd ~/count/wyniki-v2 && git pull && docker compose build wyniki && docker compose up -d wyniki

# Full rebuild
cd ~/count/wyniki-v2 && git pull && docker compose build --no-cache wyniki && docker compose up -d wyniki

# Quick restart
docker compose restart wyniki
```

## 🐳 Containers

- **wyniki-tenis-v2** (main app)

```bash
# Status
docker ps | grep wyniki

# Logs
docker compose logs -f wyniki
docker compose logs --tail=100 wyniki

# Shell
docker exec -it wyniki-tenis-v2 bash
```

## 🌐 URLs

- https://score.vestmedia.pl
- https://blindtennis.app
- https://blindtennis.app/admin
- https://blindtennis.app/office

## 📁 Paths

```
Local: C:\Users\sucho\Wyniki\wyniki-live\
Server: /home/suchokrates1/count/wyniki-v2/
SSH Key: C:\Users\sucho\.ssh\wyniki_minipc
```

## ⚡ Common Commands

```bash
# One-line deploy from Windows
ssh -i C:\Users\sucho\.ssh\wyniki_minipc suchokrates1@100.110.194.46 "cd ~/count/wyniki-v2 && git pull && docker compose build wyniki && docker compose up -d wyniki"

# Container health
docker inspect --format='{{.State.Health.Status}}' wyniki-tenis-v2

# Cleanup orphans
docker compose up -d --remove-orphans
```

## 🧩 Chrome Extension (uno-picker)

**Tworzenie .crx:**

```bash
# Klucz PEM w głównym katalogu projektu (git-ignored)

# Pakowanie z kluczem:
chrome --pack-extension=./uno-picker --pack-extension-key=./uno-picker.pem

# Wynik: uno-picker.crx
```

**Workflow aktualizacji:**

1. Zmodyfikuj kod w `uno-picker/`
2. Zaktualizuj wersję w `manifest.json`
3. Spakuj do .crx z kluczem PEM
4. Przenieś .crx do `download/`
5. Usuń starą wersję z `download/`
6. Commit + push

**Uwaga:** Klucz PEM trzymaj poza repo (security). W repo trzymaj tylko .crx w `download/`.

## 📝 Notes

- Always use git workflow for deployment
- Docker rebuild required after file changes
- Main app on port 8087, proxied by Traefik
