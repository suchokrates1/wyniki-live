# wyniki-live

## Konfiguracja

- `HISTORY_DELETE_PASSWORD` – hasło wymagane przy wywołaniu endpointu `https://score.vestmedia.pl/delete` usuwającego ostatni wpis z historii. Endpoint obsługuje logowanie typu HTTP Basic, więc można go wywołać bezpośrednio z przeglądarki (przeglądarka poprosi o hasło).

## Dostępność wyników

- Każda karta kortu otrzymuje dynamiczny `aria-label` zbudowany ze zsumowanych wyników meczu. Tekst jest nadpisywany jednocześnie na elemencie `<section>` oraz liście `<dl class="score-list">`, dzięki czemu czytniki ekranu odczytują pełne podsumowanie w momencie przejścia fokusem na kartę – niezależnie od ustawienia opcji „Automatyczny odczyt”.
- Przełącznik „Automatyczny odczyt” jedynie zapisuje preferencję w `localStorage`; ponieważ moduł `announce()` został pozostawiony jako no-op (brak aktywnego regionu live), samo zaznaczenie pola nie zmienia sposobu, w jaki screen reader odczytuje `aria-label`.
