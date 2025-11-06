# 📋 CHANGELOG - UNO Player Picker

## [0.3.11] - 2025-11-06 (Release)

### 🚨 CRITICAL FIX
- **Naprawiono wykrywanie inputów Player A/B** - Wtyczka teraz poprawnie znajduje pola na stronie UNO
- Przywrócono metodę TreeWalker do wyszukiwania sekcji "Player Names"
- Naprawiono inicjalizację UI (ready handler + MutationObserver)
- Dodano wielokrotne próby inicjalizacji (0ms, 1000ms, 3000ms)

### ✨ Release Notes
- **Dostępność:** Wtyczka dostępna do pobrania na `https://score.vestmedia.pl/download`
- **Plik:** `uno-picker-v0.3.11.crx` (23.4 KB) - **PRAWDZIWY CRX z podpisem cyfrowym**
- **Format:** CRX3 (magic bytes: `43 72 32 34` = "Cr24"), podpisany kluczem `uno-name-flag-picker.pem`
- **Instalacja:** Przeciągnij plik `.crx` na `edge://extensions/` lub rozpakuj i załaduj jako rozpakowane
- **Wsparcie:** Edge Canary na tabletach (Pointer Events + Touch Events)
- **content.js:** 12.7 KB (minified)

### 🔧 Zmiany techniczne
- Przepisany `content.js` (~550 LOC) z poprawnym wykrywaniem DOM
- Selektor: TreeWalker + NodeFilter.SHOW_TEXT dla "Player Names"
- API integration: `https://score.vestmedia.pl/api/players`
- Tryb debla z formatowaniem nazwisk
- Cache API (5 min TTL)

## [1.0.0] - 2024 (Wersja deweloperska)

### ✨ Nowe funkcje
- **Integracja z API wyniki-live** - Dynamiczne pobieranie zawodników z `/api/players`
- **Tryb debla (Doubles)** - Checkbox umożliwiający wybór 2 graczy dla jednego pola
- **Formatowanie nazwisk debla** - Automatyczne skracanie do `Nazwisko1/Nazwisko2`
- **Cache API** - 5-minutowy cache dla zmniejszenia obciążenia serwera
- **Lista wybranych** - Podgląd wybranych graczy w trybie debla z możliwością usunięcia
- **Endpoint `/api/set_flag`** - Nowy endpoint backendu do ustawiania flag

### 🔧 Usprawnienia
- **Uproszczona architektura** - Usunięto zbędne pliki (background.js, injected.js)
- **Inline styles** - Wszystkie style w JavaScript, CSS opcjonalny
- **Lepsza obsługa błędów** - Fallbacki i informacyjne komunikaty
- **Responsywny UI** - Lepsze pozycjonowanie popovera
- **Szybsze wyszukiwanie** - Optymalizacja filtrowania listy

### 🗑️ Usunięte
- `background.js` - nie był potrzebny dla tej funkcjonalności
- `injected.js` - usunięto przechwytywanie zapytań UNO API
- `players.json` - zastąpione dynamicznym API
- Wszystkie funkcje związane z modyfikacją requestów UNO

### 📝 Dokumentacja
- `README.md` - Kompletna dokumentacja funkcjonalności
- `INSTALLATION.md` - Szczegółowa instrukcja instalacji
- `CHANGELOG.md` - Ten plik

### 🐛 Poprawki
- Naprawiono problem z duplikującymi się przyciskami
- Poprawiono pozycjonowanie popovera przy scrollu
- Naprawiono zamykanie popovera przy kliknięciu poza nim

### 🔒 Bezpieczeństwo
- Usunięto Manifest v3 service worker (nie był używany)
- Ograniczono `host_permissions` tylko do niezbędnych domen
- Usunięto `web_accessible_resources` (nie są już potrzebne)

---

## [0.0.23] - Stara wersja (Archiwum)

### Funkcjonalność (zachowana w content.js.backup)
- Statyczna lista graczy z `players.json`
- Przechwytywanie zapytań UNO przez `injected.js`
- Podstawowy picker bez trybu debla
- Service worker w `background.js`

### Pliki (usunięte w v1.0.0)
```
background.js       ❌ Usunięty
injected.js         ❌ Usunięty  
players.json        ❌ Usunięty
content.js          ✅ Przepisany (backup: content.js.backup)
manifest.json       ✅ Uproszczony
picker.css          ✅ Zachowany (opcjonalny)
```

---

## 📊 Porównanie wersji

| Funkcja                    | v0.0.23 | v1.0.0 |
|----------------------------|---------|--------|
| Pobieranie z API           | ❌      | ✅     |
| Statyczny players.json     | ✅      | ❌     |
| Tryb debla                 | ❌      | ✅     |
| Formatowanie nazwisk debla | ❌      | ✅     |
| Przechwytywanie UNO API    | ✅      | ❌     |
| Cache API                  | ❌      | ✅     |
| Liczba plików              | 6       | 3      |
| Linie kodu (content.js)    | ~1178   | 605    |
| Service worker             | ✅      | ❌     |

---

## 🔄 Migracja z v0.0.23 do v1.0.0

### Co się zmienia?
1. **Źródło danych**: `players.json` → `/api/players`
2. **Tryb pracy**: Pasywny → Aktywny (API calls)
3. **Manifest**: v3 z service worker → v3 bez service worker

### Wymagania
- Backend wyniki-live musi być uruchomiony
- Endpoint `/api/players` musi zwracać listę graczy
- (Opcjonalnie) Endpoint `/api/set_flag` dla flag

### Kroki migracji
1. Backup starej wersji (już wykonany jako `content.js.backup`)
2. Usuń starą wtyczkę z Chrome
3. Załaduj nową wersję z folderu `uno-picker/`
4. Sprawdź konfigurację `API_BASE` w `content.js` (linia 7)
5. Test działania na `app.overlays.uno`

---

## 🚀 Roadmap (przyszłe wersje)

### v1.1.0 (planowane)
- [ ] Pamięć ostatnio wybranych graczy
- [ ] Historie wyboru dla szybkiego dostępu
- [ ] Drag & drop w trybie debla
- [ ] Dark mode zgodny z UNO UI

### v1.2.0 (planowane)
- [ ] Wsparcie dla więcej niż 2 graczy (miksy)
- [ ] Grupowanie graczy po krajach
- [ ] Statystyki użycia (najczęściej wybierani)
- [ ] Eksport/import ustawień

### v2.0.0 (w przyszłości)
- [ ] Integracja z rankingami ATP/WTA
- [ ] Automatyczne sugerowanie par deblowych
- [ ] Wsparcie dla turniejów (listy startowe)
- [ ] Multi-język (EN, PL, ES, FR)

---

## 📞 Zgłaszanie problemów

Znalazłeś bug lub masz pomysł na funkcję?

1. Sprawdź istniejące issues w projekcie
2. Opisz problem/pomysł szczegółowo
3. Dołącz logi z konsoli (prefix: `[UNO Picker]`)
4. Podaj wersję Chrome i OS

---

**Wersja bieżąca:** 1.0.0  
**Data ostatniej aktualizacji:** 2024  
**Autor:** Projekt wyniki-live
