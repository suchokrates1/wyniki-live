# Wyniki Live — Tennis Score Display System

System wyników tenisa na żywo: strona publiczna, biuro turnieju, panel admin oraz API dla aplikacji sędziowskiej.

## Przewodniki UI (Obsidian)

Pełny katalog strony publicznej, biura (`/office`) i admina (`/admin`):

➡️ **[docs/przewodniki/00 - Biuro i strona publiczna.md](docs/przewodniki/00%20-%20Biuro%20i%20strona%20publiczna.md)**

Otwórz folder `docs/przewodniki/` jako vault w Obsidianie.

Cursor My Machines: **minipc-wyniki** (prod) · **dell-wyniki** (test) — [CURSOR.md](CURSOR.md)

## Powierzchnie

| Powierzchnia | URL | Dostęp |
|--------------|-----|--------|
| Publiczna | `/` | Bez logowania (`access_key` dla prywatnych turniejów) |
| Biuro turnieju | `/office` lub `/office/<slot>` | Hasło biura turnieju |
| Admin | `/admin` | Hasło administratora |
| Overlay OBS | `/overlay/<id>` | Bez logowania (layout z Admin) |

Produkcja: https://score.vestmedia.pl / https://blindtennis.app

## Quick links

- **Przewodniki UI:** [docs/przewodniki/](docs/przewodniki/)
- **Aplikacja (kod):** [wyniki-v2/](wyniki-v2/)
- **API:** [API.md](API.md) (uwaga: część historyczna może być nieaktualna — źródło prawdy w kodzie `wyniki-v2`)
- **Cursor / PMA:** [CURSOR.md](CURSOR.md)
- **Deploy techniczny:** `wyniki-v2/docs/` + lokalne runbooki

## Stack

- Backend: Flask + SQLAlchemy (w `wyniki-v2/`)
- Frontend: Vite + Alpine.js + Tailwind / DaisyUI
- Realtime: SSE (`/api/stream`, office stream)
- Deploy: Docker

## Local development

```bash
cd wyniki-v2
pip install -r requirements.txt
# skonfiguruj .env (wzorzec: ../.env.example)
python app.py
```

Frontend (dev): `cd wyniki-v2/frontend && npm install && npm run dev`

## Testing

```bash
cd wyniki-v2   # lub root z pytest według setupu repo
pytest
```

## Struktura

```
wyniki-live/
├── docs/przewodniki/   # Instrukcje Obsidian (UI / użycie)
├── wyniki-v2/          # Aplikacja (Flask + frontend)
├── API.md
└── CURSOR.md
```

## Security (skrót)

- Admin i biuro: Bearer token po haśle (sessionStorage)
- PIN kortu dla aplikacji sędziowskiej
- HTTPS w produkcji (Cloudflare)

## License

Proprietary — all rights reserved.
