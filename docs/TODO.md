# Backlog — wyniki-live + aplikacja sędziego

## [P0] Zdalne sterowanie tabletem sędziego z reżyserki

**Status:** w toku (kanał komend + panel Korty + apka stosuje court/nazwiska/wynik/zasady)  
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

**Status:** do zrobienia  
**Źródło:** ten sam dzień, kort 16 (Malicki–Dutra 4:2 4:2)

Apka ma `MatchConfig`, ale nie wysyła formatu przy create. Overlay gasi mecz (`MATCH_FINISHED`), baza czeka na `POST /matches/{id}/finish`. Finish potrafi iść na stare ID z outboxa (403 w kółko).

Przy create zapisać format. Przy PUT/secie, gdy wynik spełnia format — ten sam tor co `/finish` (idempotentnie). `/finish` zostaje na krecz / W/O / test. Outbox: 403/404 drop; tylko bieżące `clientMatchUuid`.
