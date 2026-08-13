# Test environment — dell / test.blindtennis.app

Isolated copy of Wyniki Live for feature work (doubles office and related). Production on minipc (`wyniki-tenis-v2`, `blindtennis.app` / `score.vestmedia.pl`) is never used by this compose.

## Identity

| | Test | Production |
|---|---|---|
| Host | `dell` (`ssh dell`) | `minipc` |
| URL | https://test.blindtennis.app | https://blindtennis.app |
| Path | `~/wyniki-live/wyniki-v2` | `~/count/wyniki-v2` |
| Compose | `docker-compose.test.yml` | `docker-compose.yml` |
| Container | `wyniki-tenis-test` | `wyniki-tenis-v2` |
| Image | `wyniki-test:latest` | `count-wyniki-v2:latest` |
| Volume | `wyniki-test_wyniki_test_data` (empty SQLite) | `count_wyniki_data` |
| Host port | `18088` | `8087` |
| Traefik | `dell-local`, Host(`test.blindtennis.app`) | minipc, Host(score / blindtennis.app) |
| Overlays | none | prod `KORT*_ID` |

Secrets live only in `~/wyniki-live/wyniki-v2/.env.test` (`chmod 600`). Do not copy prod `.env`.

## E2E tournament stack (port 18087)

Isolated throwaway DB for `npm run e2e:tournament` / `python scripts/e2e_tournament/run.py`. Do **not** point this at minipc or at `test.blindtennis.app`.

| | E2E | Feature test | Production |
|---|---|---|---|
| Host | `dell` | `dell` | `minipc` |
| URL | `http://192.168.31.10:18087` (LAN) / `http://127.0.0.1:18087` | https://test.blindtennis.app | https://blindtennis.app |
| Compose | `docker-compose.e2e.yml` | `docker-compose.test.yml` | `docker-compose.yml` |
| Container | `wyniki-tenis-e2e` | `wyniki-tenis-test` | `wyniki-tenis-v2` |
| Volume | `wyniki-e2e_wyniki_e2e_data` | `wyniki-test_wyniki_test_data` | `count_wyniki_data` |
| Admin password | `e2e-admin` (`.env.e2e`) | `.env.test` | prod `.env` |

Dell has no host Node. Office Playwright runs in `mcr.microsoft.com/playwright` (`run.py office` detects this).

```bash
hostname   # must print dell
cd ~/wyniki-live/wyniki-v2
python3 scripts/e2e_tournament/run.py up
curl -fsS http://127.0.0.1:18087/health
python3 scripts/e2e_tournament/run.py office
# optional: python3 scripts/e2e_tournament/run.py down
```

From Windows against Dell:

```powershell
$env:E2E_BASE_URL = 'http://192.168.31.10:18087'
$env:E2E_ADMIN_PASSWORD = 'e2e-admin'
```

Android espresso (Etap 7, emulator) uses the same LAN URL, not minipc `:18087`.

## Deploy / update

From a machine with GitHub access (after pushing the feature branch):

```powershell
ssh dell "hostname && cd ~/wyniki-live && git fetch origin && git checkout feature/doubles-office && git pull --ff-only origin feature/doubles-office"
ssh dell "cd ~/wyniki-live/wyniki-v2 && docker compose -f docker-compose.test.yml --env-file .env.test up -d --build"
ssh dell "python3 ~/traefik/generate_peer_forwards.py --force-sync"
```

First-time only: clone `git@github.com:suchokrates1/wyniki-live.git` into `~/wyniki-live`, copy `.env.test.example` → `.env.test`, fill `SECRET_KEY` and `ADMIN_PASSWORD`.

## Health

```powershell
ssh dell "docker ps --filter name=wyniki-tenis-test --format '{{.Names}} {{.Status}}'"
ssh dell "curl -fsS http://127.0.0.1:18088/health"
curl -fsS https://test.blindtennis.app/health
curl -fsS https://blindtennis.app/health
```

Prod `/health` must still succeed after every test deploy.

## DNS / mesh

DNS: proxied CNAME `*.blindtennis.app` → the same Cloudflare tunnel as apex (added 2026-08-13; previously this zone had only apex/`www`/`ftp`). Mesh Traefik: `traefik-peer-watcher` on dell picks up `dell-local` labels automatically.

Tunnel ingress is remotely managed (token tunnel). API tokens on disk cannot read public hostnames (401). Empirically a hostname with DNS to the tunnel reaches Traefik (HTTP 404 without a router, not Cloudflare 1033).
