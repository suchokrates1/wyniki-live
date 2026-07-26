# Court auth grace — plan wyłączenia

## Stan

- Ustawienie: `wyniki.config.Settings.court_auth_grace_until` (domyślnie **2026-08-08 UTC**).
- Logika: `wyniki.services.api_auth.require_court_access` — bez Bearer tokenu, w okresie grace, request umpire przechodzi z warningiem `legacy_unauthed_umpire_request`.
- Po dacie grace: brak tokenu → **401 Court authorization required**.

## Cel

Wymusić autoryzację kortu (PIN → court session token) na wszystkich tableach przed eventem, bez niespodzianki w dniu startu.

## Harmonogram

| Kiedy | Akcja |
|-------|--------|
| T−21 … T−14 | Inwentaryzacja APK na tableach; upewnić się, że build ≥ wersji z Bearer (`CourtSessionStore`) |
| T−14 | Smoke: stary APK (jeśli dostępny) bez tokenu → nadal OK (grace); nowy APK → authorize + match |
| T−10 | Ustawić `COURT_AUTH_GRACE_UNTIL` env (lub rebuild) na datę **T−3 00:00 UTC** jeśli chcesz wcześniejsze twarde cięcie |
| T−7 | Dry-run: tymczasowo `court_auth_grace_until` w przeszłości na **e2e** kontenerze; sprawdzić 401 bez tokenu i OK z PIN |
| T−3 | Grace wyłączone na produkcji (data minęła lub env ustawione wstecz); smoke wszystkich kortów |
| Event | Zero zmian grace; tylko hotfix jeśli stary klient utknie |

## Smoke checklist

1. `POST /api/courts/{id}/authorize` z PIN → token.
2. Create/update/finish match z `Authorization: Bearer …`.
3. Request bez tokenu po wyłączeniu grace → 401.
4. Android: CourtSelection → PIN → PlayerSelection → Match → finish (E2E PIN path + MultiCourt).
5. Logi: brak lawiny `legacy_unauthed_umpire_request` po T−3.

## Rollback

Jeśli dzień eventu ujawni stary build na stole:

1. Tymczasowo podnieść `COURT_AUTH_GRACE_UNTIL` o 48h (env + restart kontenera).
2. Zainstalować golden APK na urządzeniu.
3. Przywrócić grace cutoff.

## Env override

```bash
# docker compose / .env na minipc
COURT_AUTH_GRACE_UNTIL=2026-08-08T00:00:00+00:00
```

Pydantic Settings mapuje pole `court_auth_grace_until` z env (ISO-8601).
