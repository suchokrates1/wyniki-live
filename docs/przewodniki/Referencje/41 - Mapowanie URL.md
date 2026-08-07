---
title: Mapowanie URL
tags: [wyniki, referencja]
aliases: [URL map, Hash routes]
---

# Mapowanie URL

## Strony

| URL | Powierzchnia |
|-----|--------------|
| `/` | Strona publiczna |
| `/office`, `/office/<slot>` | Biuro turnieju |
| `/admin` | Admin |
| `/overlay/<id>`, `/overlay/<slot>/<id>` | Overlay OBS |
| `/embed` | Stub (nieużywać) |

## Hash (publiczna)

| Hash | Widok |
|------|-------|
| `#` / `#live` | Wyniki live |
| `#live/scores` | Wyniki live |
| `#live/bracket` / `#bracket` / `#drabinka` | Drabinka |
| `#live/schedule` | Terminarz |
| `#live/history` | Historia live |
| `#tournaments` | Lista turniejów |
| `#tournaments/<id>/bracket\|schedule\|matches` | Szczegóły |
| `#players` | Zawodnicy |
| `#players/global\|local/<id>` | Profil |

## Query

Zobacz [[18 - Język, motyw, access_key]].

## Powiązane

- [[00 - Biuro i strona publiczna]]
- [[10 - Strona publiczna - przegląd]]
