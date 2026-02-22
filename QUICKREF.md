# Quick Reference - Personal Notes

## 🔑 Access

```bash
# SSH to minipc (backend)
ssh -i C:\Users\sucho\.ssh\wyniki_minipc suchokrates1@100.110.194.46
cd ~/count

# SSH to RPI (Traefik + Cloudflare Tunnel)
ssh -i C:\Users\sucho\.ssh\wyniki_rpi suchokrates1@100.66.220.72
cd ~/traefik

# Network: RPI ↔ minipc (local 192.168.31.x)
# Cloudflare → cloudflared (RPI) → Traefik (RPI) → Flask (minipc:8087)
```

## 🚀 Deploy

```bash
# Standard
cd ~/count && git pull && docker compose build wyniki && docker compose up -d wyniki

# Full rebuild
cd ~/count && git pull && docker compose build --no-cache wyniki && docker compose up -d wyniki

# Quick restart
docker compose restart wyniki
```

## 🐳 Containers

- **wyniki-tenis** (main app)
- **wyniki-rtmp** (streaming)

```bash
# Status
docker ps | grep wyniki

# Logs
docker compose logs -f wyniki
docker compose logs --tail=100 wyniki

# Shell
docker exec -it wyniki-tenis bash
```

## 🌐 URLs

- https://score.vestmedia.pl
- https://score.vestmedia.pl/admin
- https://score.vestmedia.pl/stream1-4
- https://score.vestmedia.pl/hls/stream1/live.m3u8

## 📁 Paths

```
Local: C:\Users\sucho\Wyniki\wyniki-live\
Server: /home/suchokrates1/count/
SSH Key: C:\Users\sucho\.ssh\wyniki_minipc
```

## 🎥 Streaming

```
RTMP: rtmp://100.110.194.46/live
Keys: stream1, stream2, stream3, stream4
```

## ⚡ Common Commands

```bash
# One-line deploy from Windows
ssh -i C:\Users\sucho\.ssh\wyniki_minipc suchokrates1@100.110.194.46 "cd ~/count && git pull && docker compose build wyniki && docker compose up -d wyniki"

# Check stream
curl -I https://score.vestmedia.pl/hls/stream1/live.m3u8

# Container health
docker inspect --format='{{.State.Health.Status}}' wyniki-tenis

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
- Stream players at /stream1-4 use HLS proxy through Flask
- nginx-rtmp runs on port 8089 internally
- Main app on port 8087, proxied by Traefik
