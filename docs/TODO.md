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
