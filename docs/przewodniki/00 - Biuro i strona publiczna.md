---
title: Biuro i strona publiczna
tags: [wyniki, moc, biuro, publiczna]
aliases: [MOC Wyniki, score.vestmedia.pl przewodnik]
---

# Biuro i strona publiczna — Wyniki Live

> [!info] Vault Obsidian
> Otwórz folder `wyniki-live/docs/przewodniki/` jako vault **albo** dodaj go do wspólnego vaultu. Wikilinki działają w obrębie jednego vaultu.
>
> Deploy / API / runbooki techniczne leżą w `wyniki-v2/docs/` i `API.md` — ten zestaw opisuje **UI i użycie**, nie infrastrukturę.

Trzy powierzchnie produktu web:

| Powierzchnia | URL (produkcja) | Hasło |
|--------------|-----------------|-------|
| Strona publiczna | `/` (np. blindtennis.app / score.vestmedia.pl) | Brak (opcjonalnie `access_key`) |
| Biuro turnieju | `/office` lub `/office/<slot>` | Hasło biura turnieju |
| Admin | `/admin` | Hasło administratora |
| Overlay OBS | `/overlay/<id>` lub `/overlay/<slot>/<id>` | Brak (tylko podgląd) |

## Publiczna

- [[10 - Strona publiczna - przegląd]]
- [[11 - Na żywo - korty]]
- [[12 - Drabinka]]
- [[13 - Terminarz]]
- [[14 - Historia meczów]]
- [[15 - Lista turniejów]]
- [[16 - Zawodnicy i profil]]
- [[17 - Overlay OBS]]
- [[18 - Język, motyw, access_key]]

## Biuro turnieju (`/office`)

- [[20 - Logowanie office]]
- [[21 - Chrome i quick-info]]
- [[22 - Historia]]
- [[23 - Postęp]]
- [[24 - Puchar]]
- [[25 - Planowanie - grupy]]
- [[26 - Planowanie - terminarz i autoschedule]]
- [[27 - Wprowadzanie i edycja wyniku]]

## Admin (`/admin`)

- [[30 - Logowanie admin]]
- [[31 - Korty i PIN]]
- [[32 - Biuro turnieju (zakładka admin)]]
- [[33 - Plan turnieju]]
- [[34 - Turnieje i SMTP]]
- [[35 - Zawodnicy globalni]]
- [[36 - Gracze turnieju i import]]
- [[37 - Overlay designer]]

## Referencje

- [[40 - Role i dostęp]]
- [[41 - Mapowanie URL]]
- [[42 - Debel - plan implementacji]] (debel, tryb na grupie, litewski)
