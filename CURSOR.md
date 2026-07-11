# Cursor My Machines — wyniki-live

Zdalny agent Cursor na minipc w katalogu tego repo (`~/count`).

| Parametr | Wartość |
|----------|---------|
| Worker | **minipc-wyniki** |
| Repo | `suchokrates1/wyniki-live` |
| Host | minipc (GMKtec) |
| Kontener prod | `wyniki-tenis-v2` (port 8087) |
| Live | https://score.vestmedia.pl · https://blindtennis.app |

Inny worker na tej samej maszynie: **minipc** → repo `infrastructure` (Traefik, vault, Docker).

---

## Instalacja workera (minipc, jednorazowo)

```bash
agent login   # jeśli jeszcze nie
sudo cp deploy/cursor-worker-wyniki.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cursor-worker-wyniki.service
```

Sprawdzenie:

```bash
systemctl status cursor-worker-wyniki
agent worker debug --worker-dir ~/count --name minipc-wyniki
```

Bezpośredni link (po starcie): https://cursor.com/agents — wybierz worker **minipc-wyniki**.

---

## PMA z telefonu

### iPhone (aplikacja Cursor)

1. Zainstaluj **Cursor** z App Store (iOS **26+**).
2. Zaloguj się tym samym kontem co `agent login` na minipc.
3. **Privacy Mode** włączony (nie Legacy).
4. Nowy agent → repo **wyniki-live** → branch **main**.
5. Środowisko: **minipc-wyniki** (My Machines).
6. Zadanie, np. `Sprawdź logi wyniki-tenis-v2 i napraw SSE na korcie 2`.

### Android (brak natywnej apki — PWA)

Oficjalnie **nie ma** apki Cursor na Androida (planowana, bez daty).

1. Otwórz **Chrome** na telefonie.
2. Wejdź na https://cursor.com/agents i zaloguj się.
3. Menu Chrome → **Dodaj do ekranu głównego** (PWA).
4. Nowy agent → repo **wyniki-live** → branch **main**.
5. W dropdownie środowiska wybierz **minipc-wyniki**.
6. Wyślij zadanie — agent działa na minipc w `~/count`.

**Wymagania:** plan z Cloud Agents, GitHub podłączony na cursor.com, minipc online.

### Alternatywy z Androida

- **Slack**: `@Cursor worker=minipc-wyniki <zadanie>` (jeśli skonfigurowane)
- **GitHub**: `@cursor` / `@cursoragent` na PR/issue w repo wyniki-live

---

## Przykładowe zadania dla agenta

```
Zrestartuj wyniki-tenis-v2 i pokaż ostatnie 50 linii logów
Uruchom pytest w wyniki-v2 i napraw failing testy
Sprawdź dlaczego /api/stream nie aktualizuje kortu 3
git pull, docker compose build wyniki, docker compose up -d wyniki
```

---

## Zarządzanie

```bash
journalctl -u cursor-worker-wyniki -f
sudo systemctl restart cursor-worker-wyniki
```

Więcej o workerach na minipc: `~/cursor-worker/README.md` · `infrastructure/servers.md`
