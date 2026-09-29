# Backlog — wyniki-live + aplikacja sędziego

## [P0] Zdalne sterowanie tabletem sędziego z reżyserki

**Status:** zrobione i zweryfikowane 2026-09-17 — Dell `:18087` PWA umpire-live 10/10 (Bramki 6, 6b, 6c) + Android `DirectorControlE2ETest` 2/2 (emulator → e2e). Reżyserka pcha kort, nazwiska, wynik i `MatchConfig` na tablecie/PWA bez restartu. Patch zasad scala się z zapisanym configiem (nie nadpisuje `stats_mode` BASIC na ADVANCED).  
**Źródło:** IBTA Vilnius 2026, kort 2, 28.08.2026  
**Repo:** `wyniki-live` (admin + API) + `android-tennis-referee`

### Po co

Z reżyserki nie da się poprawić tabletu, gdy sędzia źle wybierze kort albo nazwisko. Dwa telefony pisały na ten sam `t31-2` (Justyna–Webeck i González–Schmidt). Przeniesienie meczu w bazie/overlayu nic nie daje, dopóki apka trzyma stary `court_id`. Sędzia nie mógł przełączyć kortu PIN-em w trakcie.

### Co ma powstać

Z poziomu **admina / reżyserki**, na żywo, bez restartu meczu na tablecie:

- zmiana **kortu** (apkę przerzuca na inny `kort_id`, token/PIN, overlay)
- zmiana **nazwisk** (singiel/debel)
- zmiana **wyniku** (sety, gemy, punkty, TB/STB)
- zmiana **zasad** (`MatchConfig`: sety do wygranej, gemy na set, no-ad, TB)
- **instant push** na aplikację sędziego w momencie kliknięcia — nie po restarcie apki, nie po następnym PUT

Stan tabletu = to, co reżyserka właśnie zatwierdziła. Overlay, baza i apka mają ten sam mecz.

Plan PWA sędziego 1:1 (osobny produkt, Etap 6 = ten P0): vault Vest Media `notes/areas/vest-media/PWA-sedzia-plan-wdrozenia.md`. Ten backlog zostaje listą incydentów, nie drugim planem wdrożenia.

### Jak nie robić

Nie wystarczy SQL + overlay RAM. Eventy z telefonu nadpiszą kort i nazwiska, dopóki `MatchState.courtId` / para zostaną na urządzeniu.

### Trigger z Vilnius

González–Schmidt przeniesiony na kort 8 w bazie i overlayu; tablet nadal autoryzowany na kort 2.

---

## [P1] Domykanie meczu po stronie serwera

**Status:** zrobione i zweryfikowane 2026-09-17 — unit + live PUT na Dell `:18087` (Bramka P1): wynik spełniający `sets_to_win` kończy mecz bez `POST /finish`.  
**Źródło:** ten sam dzień, kort 16 (Malicki–Dutra 4:2 4:2)

Przy create zapisujemy `MatchConfig`. Przy PUT, gdy `player1_sets`/`player2_sets` spełniają `sets_to_win` — ten sam tor co `POST /finish` (historia, overlay, e-mail, drabinka). Ponowny `/finish` jest idempotentny. `/finish` zostaje na krecz / W/O / test. Outbox PWA: 403/404 drop.

---

## [investigate] Listy rozwijane w Chrome na iOS (public)

**Status:** fix wdrożony 2026-09-29 (CSS scroll-margin + focus scrollIntoView + lang-select `appearance: auto` na mobile); e2e public-mobile OK. Ręczny smoke iPhone Chrome/Safari po deployu.  
**Źródło:** RAKIETY ATNiS VII 2026-09-26/27 — feedback userów (niespójny)

### Co było na public

- Historia / filtry graczy: natywne `<select class="player-dropdown">`
- Język: `<select class="lang-select">` + nakładka kodu
- Live korty: przyciski (bez zmian)

### Fix

- `mobile.css`: `scroll-margin` na selectach względem tab-bara; `lang-select` z native appearance na ≤640px
- `main.js`: przy focus/pointerdown — `scrollIntoView({ block: 'center' })` na mobile
- e2e: select nie nachodzi na `.tab-bar`; lang hit-target ≥ 44px

---

## [P2] Public PWA (blindtennis.app)

**Status:** v1–v4 wdrożone na prod (v1 2026-09-29, v2–v4 2026-09-30) · otwarte zostaje v5  
**Zakres:** tylko public (`/`), nie office/admin/umpire

### v1 — Shell + install — DONE

Manifest (`/site.webmanifest`) + `site-sw.js` (precache shell/assets, `/api/` bez SW), ikony PNG, rejestracja w `main.js`, e2e public-mobile.

**Poprawka 2026-09-30:** `site-sw` i `umpire-sw` obie rejestrowały się na scope `/`, więc trzymała się tylko jedna, a każda kasowała przy aktywacji cudze cache — otwarcie strony publicznej zdejmowało offline'owy shell PWA sędziego i odwrotnie. Sędzia rejestruje się teraz na `/umpire`, manifest zgodny, każdy worker kasuje tylko własny prefiks. Outbox był bezpieczny (IndexedDB). Zweryfikowane na prodzie: dwie rejestracje obok siebie, oba cache żyją.

### v2 — Offline ostatni snapshot — DONE

Snapshot w `localStorage` (`modules/offlineSnapshot.js`), banner „Brak sieci · dane z HH:MM”. SW nadal nie dotyka `/api/` — zamiast po cichu cache'ować żywy wynik, mówimy wprost, z której godziny są dane. Wygasa po 12 h; pusty snapshot nie nadpisuje dobrego. Zweryfikowane na tescie symulacją padającego `fetch`.

### v3 — Update UX SW — DONE

`site-sw` nie woła już `skipWaiting()` przy instalacji, więc nowy shell nie podmienia działającego w trakcie wizyty. Toast „Nowa wersja · Odśwież” → `SKIP_WAITING` → reload na `controllerchange`. Przetestowane pełnym cyklem na tescie.

### v4 — Hint A2HS iOS — DONE

Zamykalny banner tylko dla Safari na iOS (Chrome/Firefox na iOS nie potrafią instalować, więc są wykluczone). Nie pokazuje się, dopóki wisi banner zgody — jedna prośba naraz.

### v5 — Web Push (~3–5 dni) — OTWARTE

VAPID + subscribe; default: start meczu na wybranym korcie; iOS tylko po A2HS (16.4+).

Czego wymaga, zanim się zacznie: para kluczy VAPID (prywatny **nie** do repo — do env prod jak `SECRET_KEY`), zależność `pywebpush` w obrazie, tabela subskrypcji w bazie, endpointy subscribe/unsubscribe, wyzwalacz przy starcie meczu i obsługa `push` / `notificationclick` w `site-sw.js`. To jedyny punkt roadmapy dokładający zależność backendową i sekret.

### Poza roadmapą

Periodic Background Sync, PWA biura, install gate jak umpire.

---

## [P2] Panic button sędziego → WhatsApp (WAHA)

**Status:** todo  
**Źródło:** RAKIETY ATNiS VII — ops / bezpieczeństwo turnieju  
**Repo:** `wyniki-live` (admin + API) + `android-tennis-referee` (+ PWA sędziego jeśli aktywna)  
**Infra:** WAHA na minipc (`tenis_waha`)

### Po co

Sędzia musi szybko wezwać reżyserię / organizatora bez szukania telefonu (awaria sprzętu, konflikt, medyczny, chaos na korcie).

### Co ma powstać

- przycisk panic na **każdym ekranie** apki sędziego (np. prawy górny róg), z potwierdzeniem żeby uniknąć przypadków
- wysyłka powiadomienia WhatsApp do skonfigurowanych numerów (startowo: Dawid + Kamil) przez WAHA
- treść: turniej, kort, mecz/zawodnicy jeśli znane, timestamp, ewentualnie notatka sędziego
- w **adminie**: lista numerów / odbiorców panic (CRUD), ewentualnie włącz/wyłącz per turniej
- rate-limit / cooldown żeby nie spamować WA

### Jak nie robić

Nie hardcodować numerów w apce. Nie omijać WAHA (jeden kanał ops jak reszta alertów infra).
