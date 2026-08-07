---
title: Overlay OBS
tags: [wyniki, publiczna, overlay]
aliases: [OBS overlay, Tennis Score Overlay]
---

# Overlay OBS

## Cel

Przezroczysty layout 1920×1080 do OBS / transmisji. **Brak kontrolek** — tylko podgląd skonfigurowany w Admin.

## URL

| Ścieżka | Znaczenie |
|---------|-----------|
| `/overlay/{overlayId}` | Preset po ID |
| `/overlay/{slot}/{overlayId}` | Slot turnieju aktywnego + preset |

URL kopiujesz z [[37 - Overlay designer]].

## Zachowanie

| Aspekt | Opis |
|--------|------|
| Dane | Snapshot + SSE + ustawienia overlay (poll) |
| Autoukrywanie | Gdy włączone i brak aktywnych meczów — layout znika |
| Skala | Dopasowanie do viewportu |

> [!note] Embed
> Ścieżka `/embed` istnieje jako stub i nie jest pełną funkcją — nie używaj w produkcji.

## Powiązane

- [[37 - Overlay designer]]
- [[11 - Na żywo - korty]]
