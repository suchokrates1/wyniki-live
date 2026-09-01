# Redesign publicznego WWW: turniej jako kontekst

Propozycja, nie wdrożenie. Backend, kontrakt SSE/`/api/snapshot`, Alpine i silnik punktacji zostają. Zmienia się tylko to, jak publiczna strona układa te same dane.

Klikalny podgląd: [redesign-preview.html](./redesign-preview.html).

## Po co to w ogóle

JS publicznego frontu jest już poukładany (`refaktor.md`, etap 8 zamknięty). To, co nadal boli na korcie, to nie brak modułów — to **mapa informacji**.

Dziś użytkownik ma dwie równoległe hierarchie:

```text
Na żywo
  ├─ Wyniki live
  ├─ Drabinka
  ├─ Terminarz
  └─ Historia
Turnieje / Historia          ← w PL przycisk mówi „Historia”, w i18n „Turnieje”
  ├─ Drabinka
  ├─ Terminarz
  └─ Historia meczów
Zawodnicy
```

Drabinka, plan i wyniki istnieją dwa razy. Zakładka nadrzędna „Na żywo” ukrywa terminarza i drabinkę za drugą warstwą kart. Na telefonie znikają dwa rzędy nawigacji, zanim widać wynik. Biuro (`office.html`) i admin żyją w innym świecie wizualnym (DaisyUI z CDN, ciepła paleta, inne radiusy) niż publiczny scoreboard (własny CSS, ciemny header nawet w trybie jasnym).

To nie jest problem „zrób ładniej”. To problem **gdzie kliknąć, gdy mecz właśnie się zaczął**.

## Zasada

**Turniej jest kontekstem, nie zakładką.**

Wybór turnieju siedzi w nagłówku. Pięć widoków operuje na tym samym turnieju:

```text
[ Logo  Turniej ▾  LIVE ]                         [ PL  ☾ ]

  Korty  ·  Terminarz  ·  Drabinka  ·  Wyniki  ·  Zawodnicy
```

Na telefonie ta sama piątka schodzi na dół (strefa kciuka). Żadnej drugiej warstwy zakładek.

| Dziś | Po zmianie |
|------|------------|
| Live / Turnieje / Zawodnicy + 4 karty pod Live | 5 równorzędnych widoków |
| Turniej wybierasz wchodząc w „Turnieje” | Selektor w headerze, aktywny turniej jest domyślny |
| Drabinka live ≠ drabinka historii | Jeden widok, dane zależą od wybranego turnieju |
| Historia live vs historia turnieju | Jeden widok **Wyniki** (zakończone mecze) |
| Header zawsze ciemny | Ciemny scoreboard jest trybem, nie wyjątkiem |

Poza sezonem (brak aktywnego turnieju) **Korty** pokazują pusty stan i kartę nadchodzącego / ostatniego turnieju. Archiwum to ten sam shell z wyłączoną plakietką LIVE.

## Dla kogo

Publiczne WWW jest używane głównie na korcie: telefon w słońcu albo w cieniu, jedna ręka, czasem czytnik ekranu. Kolejność pytań:

1. Co się dzieje **teraz**?
2. Kiedy gram / kiedy gra X?
3. Jak wygląda moja grupa / drabinka?
4. Co się właśnie skończyło?
5. Kim jest zawodnik, którego nie znam?

Dlatego **Korty** są defaultem, a nie „Na żywo → Wyniki live”. Terminarz i drabinka nie mogą być schowane za drugą zakładką.

## Język wizualny

Nie przepisujemy DaisyUI na publiczny WWW i nie dokładamy fontów z Google na stronę wyników (biuro może zostawić Outfit). Publiczny scoreboard zostaje przy `system-ui` i istniejących tokenach, z trzema korektami:

| Token | Propozycja | Skąd |
|-------|------------|------|
| Tło scoreboardu | `#0b0f14` | już `--bg` w dark |
| Akcent LIVE | `#c6e953` (piłka serwisowa) | już SVG serwisu |
| Status OK | `#35c46a` | już `--ok` |
| Akcja / link | `#9ad1ff` | już `--accent` dark |
| Biuro (osobna skóra) | teal `#0f766e` + warm paper | zostaje, ale te same radiusy i 44px hit-area |

Ciemny tryb jest **domyślny na widoku Korty** (kontrast na dworze, telewizor, overlay). Jasny tryb zostaje dla terminarza/archiwum i preferencji systemowej. Nie robimy osobnej skóry „jak ATP” ani „jak FlashScore” — te serwisy są gęste i desktopowe. Tu liczby muszą być czytelne z metra.

Wspólny atom: **wiersz meczu**. Live, wyniki i wiersz terminarza to ten sam układ: zawodnicy po lewej, sety tabular-nums po prawej, kort + kategoria pod spodem. Różni się tylko czy punkty są żywe.

## Routing (stare hashe zostają)

Nie łamiemy zakładek i linków z SMS / biura.

| Hash dziś | Zachowanie po zmianie |
|-----------|------------------------|
| `#` / `#live` / `#live/scores` | widok Korty, aktywny turniej |
| `#live/bracket`, `#drabinka` | widok Drabinka |
| `#live/schedule` | widok Terminarz |
| `#live/history` | widok Wyniki (aktywny turniej) |
| `#tournaments` | ten sam shell, otwarty selektor turnieju albo lista archiwum |
| `#tournaments/{id}/…` | ten sam widok co live, inny `tournament_id` |
| `#players`, `#zawodnicy/…` | bez zmiany znaczenia |

Implementacyjnie: `activeTab` + `liveSubTab` + `historySubTab` składają się do jednego `view`. Stare stany Alpine mapują 1:1, bez drugiego drzewa w `index.html`.

## Czego świadomie nie ruszamy

- API, SSE, snapshot, schemat DB, aplikacja sędziego.
- Alpine, Vite, i18n, testy a11y/smoke.
- Osobny `office.html` / `admin.html` w pierwszym podejściu — tylko wspólne tokeny CSS, gdy już ustabilizuje się publiczny shell.
- DaisyUI na stronie publicznej (zależność jest, ale publiczny CSS jej nie używa; nie mieszamy tego w locie).

To jest zgodne z zamrożeniem architektury: layout i copy są dozwolone, kontrakt punktacji nie.

## Wdrożenie małymi krokami

Jak `refaktor.md`: jeden wycinek, `npm run check:public`, smoke.

1. **Tokeny** — wyciągnąć `:root` / `[data-theme]` z `main.css` do `src/tokens.css`. Zero zmiany wyglądu.
2. **Selektor turnieju w headerze** — aktywny turniej z snapshotu; lista z `/api/tournaments`. Zakładka Turnieje jeszcze zostaje.
3. **Spłaszczenie nawigacji** — pięć przycisków pierwszego rzędu; `liveSubTab` i `historySubTab` znikają z DOM, zostają jako alias stanu. Na `<md` dolny pasek.
4. **Wspólny wiersz meczu** — live karta kortu i historia używają tej samej siatki setów.
5. **Usunąć duplikat widoków** pod Turnieje: `#tournaments/{id}/bracket` renderuje ten sam panel co `#live/bracket` z innym id.
6. **Tokeny do biura** — radius, focus ring, 44px, bez zmiany kompozycji office.

Każdy krok da się wycofać bez migracji danych.

## Ryzyka

- **Głębokie linki i e2e** — hash API musi zostać; zmienia się tylko DOM zakładek. Smoke public + a11y tablist.
- **Dwa źródła turnieju** — snapshot (live) vs lista turniejów. Selektor musi jasno pokazać, który jest aktywny na korcie.
- **A11y** — dziś są zagnieżdżone `role=tablist`. Cel: jeden tablist główny + filtry (kategoria, kort) jako zwykłe toolbar/radiogroup, nie druga warstwa tabów.
- **Pusty stan** — gdy nic nie jest live, Korty nie mogą wyglądać jak awaria. Karta „następny turniej” + skok do terminarza.

## Kryterium „wystarczy”

Redesign jest skończony, gdy na telefonie w 10 sekund widać wynik z kortu 1, a drabinka i plan są jednym tapnięciem, bez drugiej warstwy kart. Nie wtedy, gdy strona „wygląda nowocześnie”.
