# wyniki-live

## Konfiguracja

- `ADMIN_PASSWORD` – hasło umożliwiające zalogowanie do panelu administracyjnego. Po uwierzytelnieniu administrator może edytować oraz usuwać rekordy historii poprzez interfejs webowy lub dedykowane endpointy API.

Aby rozpocząć konfigurację środowiska:

1. Skopiuj plik przykładowy: `cp .env.example .env`.
2. Uzupełnij wartości zmiennych środowiskowych w `.env` zgodnie z potrzebami instalacji.

## Usuwanie wpisów z historii

Publiczny endpoint `/delete` został usunięty. Aby skasować wpis z historii należy:

1. Zalogować się w panelu `/admin` używając hasła administratora.
2. Skorzystać z przycisku „Usuń” przy wybranym rekordzie lub wysłać żądanie `DELETE /api/admin/history/<id>` z aktywną sesją administracyjną.

Żądania API bez poprawnej sesji otrzymają odpowiedź `401 Unauthorized`, a próba usunięcia nieistniejącego rekordu zakończy się statusem `404 Not Found`.

## Dostępność wyników

- Każda karta kortu otrzymuje dynamiczny `aria-label` zbudowany ze zsumowanych wyników meczu. Tekst jest nadpisywany jednocześnie na elemencie `<section>` oraz liście `<dl class="score-list">`, dzięki czemu czytniki ekranu odczytują pełne podsumowanie w momencie przejścia fokusem na kartę – niezależnie od ustawienia opcji „Automatyczny odczyt”.
- Przełącznik „Automatyczny odczyt” jedynie zapisuje preferencję w `localStorage`; ponieważ moduł `announce()` został pozostawiony jako no-op (brak aktywnego regionu live), samo zaznaczenie pola nie zmienia sposobu, w jaki screen reader odczytuje `aria-label`.
