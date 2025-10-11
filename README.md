# wyniki-live

## Konfiguracja

1. Skopiuj plik `.env.example` do `.env` i uzupełnij wymagane wartości.
2. W pliku `.env` ustaw co najmniej:
   - `ADMIN_PASSWORD` – hasło potrzebne do zalogowania w panelu administracyjnym.
   - `FLASK_SECRET_KEY` – dowolny sekret używany do podpisywania sesji administracyjnych.
   - `KORT{N}_ID` – identyfikatory kortów używane do komunikacji z Overlays Uno (np. `KORT1_ID`).
   - Pozostałe zmienne (`UNO_BASE`, `UNO_AUTH_BEARER`, `MATCH_HISTORY_SIZE` itd.) są opcjonalne i posiadają wartości domyślne, ale można je dostosować do środowiska wdrożeniowego.

## Panel administracyjny

- Panel dostępny jest pod adresem `/admin` i wymaga zalogowania przy pomocy hasła `ADMIN_PASSWORD`.
- Po zalogowaniu można uzupełniać metadane każdego wpisu historii (`Kategoria`, `Faza rozgrywek`, nazwiska zawodników) oraz usuwać błędne rekordy. Zmiany są zapisywane w bazie danych i natychmiast pojawiają się na stronie głównej.
- W sekcji „Korty” można zarządzać identyfikatorami overlay. Podczas pierwszego uruchomienia wartości z `KORT{N}_ID` są importowane do bazy i od tej pory konfiguracja jest utrzymywana w tabeli `courts`. Dodanie nowego kortu lub edycja istniejącego odświeża konfigurację w działającej aplikacji.

## Dostępność wyników

- Każda karta kortu otrzymuje dynamiczny `aria-label` zbudowany ze zsumowanych wyników meczu. Tekst jest nadpisywany jednocześnie na elemencie `<section>` oraz liście `<dl class="score-list">`, dzięki czemu czytniki ekranu odczytują pełne podsumowanie w momencie przejścia fokusem na kartę – niezależnie od ustawienia opcji „Automatyczny odczyt”.
- Przełącznik „Automatyczny odczyt” jedynie zapisuje preferencję w `localStorage`; ponieważ moduł `announce()` został pozostawiony jako no-op (brak aktywnego regionu live), samo zaznaczenie pola nie zmienia sposobu, w jaki screen reader odczytuje `aria-label`.
