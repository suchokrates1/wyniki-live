# Cursor My Machines — wyniki-live

Dwa workery My Machines dla tego samego repo (`suchokrates1/wyniki-live`). **Prod zostaje na minipc. Test jest na Dellu.**

| Worker | Host | Katalog | Stack |
|--------|------|---------|-------|
| **minipc-wyniki** | minipc (GMKtec) | `~/count` | prod `wyniki-tenis-v2` :8087 · https://score.vestmedia.pl · https://blindtennis.app |
| **dell-wyniki** | dell (OptiPlex 3060) | `~/wyniki-live` | test `wyniki-tenis-test` :18088 · https://test.blindtennis.app |

Inny worker na minipc (inne repo): **minipc** → `infrastructure` (Traefik, vault, Docker).

---

## Który worker?

| Zadanie | Worker |
|---------|--------|
| Live, logi prod, deploy na minipc | **minipc-wyniki** |
| Test na Dellu, `test.blindtennis.app`, `docker-compose.test.yml` | **dell-wyniki** |
| Traefik / vault / HA | **minipc** (repo infrastructure) |

Nie restartuj `wyniki-tenis-v2` z workera Dell. Nie używaj `docker-compose.test.yml` na minipc.

---

## Instalacja workera (jednorazowo)

### minipc — prod

```bash
agent login   # jeśli jeszcze nie
sudo cp deploy/cursor-worker-wyniki.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cursor-worker-wyniki.service
```

```bash
systemctl status cursor-worker-wyniki
agent worker start --debug --worker-dir ~/count --name minipc-wyniki
```

### dell — test

Na Dellu checkout jest w `~/wyniki-live` (nie `~/count`). Logowanie: to samo konto Cursor co na minipc (`~/.config/cursor/auth.json`).

```bash
curl https://cursor.com/install -fsS | bash
# skopiuj ~/.config/cursor/auth.json z minipc, chmod 600
sudo cp deploy/cursor-worker-dell-wyniki.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cursor-worker-dell-wyniki.service
```

```bash
ssh dell 'hostname && systemctl is-active cursor-worker-dell-wyniki'
ssh dell 'systemctl status cursor-worker-dell-wyniki --no-pager'
```

Po starcie: https://cursor.com/agents — środowisko **minipc-wyniki** albo **dell-wyniki**.
Worker Dell: https://cursor.com/agents#workerId=b2ff3121-b66a-43bb-b004-58a6f2f56a60

---

## PMA z telefonu

### iPhone (aplikacja Cursor)

1. Zainstaluj **Cursor** z App Store (iOS **26+**).
2. Zaloguj się tym samym kontem co `agent login` na minipc/dell.
3. **Privacy Mode** włączony (nie Legacy).
4. Nowy agent → repo **wyniki-live** → branch **main**.
5. Środowisko: **minipc-wyniki** (prod) albo **dell-wyniki** (test).
6. Zadanie, np. `Sprawdź health wyniki-tenis-test na Dellu`.

### Android (brak natywnej apki — PWA)

Oficjalnie **nie ma** apki Cursor na Androida (planowana, bez daty).

1. Otwórz **Chrome** na telefonie.
2. Wejdź na https://cursor.com/agents i zaloguj się.
3. Menu Chrome → **Dodaj do ekranu głównego** (PWA).
4. Nowy agent → repo **wyniki-live** → branch **main**.
5. W dropdownie środowiska wybierz **minipc-wyniki** albo **dell-wyniki**.
6. Wyślij zadanie.

**Wymagania:** plan z Cloud Agents, GitHub podłączony na cursor.com, host workera online.

### Alternatywy z Androida

- **Slack**: `@Cursor worker=dell-wyniki <zadanie>` albo `worker=minipc-wyniki`
- **GitHub**: `@cursoragent worker=dell-wyniki <zadanie>` na issue/PR w wyniki-live

---

## Przykładowe zadania

Prod (`minipc-wyniki`):

```
Zrestartuj wyniki-tenis-v2 i pokaż ostatnie 50 linii logów
Sprawdź dlaczego /api/stream nie aktualizuje kortu 3
git pull, docker compose build wyniki, docker compose up -d wyniki
```

Test (`dell-wyniki`):

```
Pokaż status i logi wyniki-tenis-test
curl -sS http://127.0.0.1:18088/health
cd ~/wyniki-live/wyniki-v2 && docker compose -f docker-compose.test.yml ps
```

---

## Zarządzanie

```bash
# minipc
journalctl -u cursor-worker-wyniki -f
sudo systemctl restart cursor-worker-wyniki

# dell
ssh dell 'journalctl -u cursor-worker-dell-wyniki -f'
ssh dell 'sudo systemctl restart cursor-worker-dell-wyniki'
```

Więcej o workerach: `~/cursor-worker/README.md` · `infrastructure/servers.md`
