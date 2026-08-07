---
title: Korty i PIN
tags: [wyniki, admin, korty]
aliases: [Admin courts, PIN management]
---

# Admin — Korty i PIN

## Cel

Zarządzanie kortami, PIN-ami dla aplikacji sędziowskiej, reset meczów, monitoring baterii/statusu.

## Elementy UI

| Kontrolka | Co robi | API |
|-----------|---------|-----|
| Filtr turniejów | Pokazuje grupy kortów | Client |
| **Wszystkie** / **Wyczyść** | Zaznaczenia pomocnicze | — |
| Pole PIN (4 cyfry) | Zmiana PIN | `PUT /admin/api/courts/{id}/pin` |
| ✏️ / ✓ / ✗ | Edycja ID/nazwy kortu | `PUT /admin/api/courts/{old}` |
| 🔄 Reset meczu | Czyści aktywny mecz na korcie | `POST …/courts/{id}/reset` |
| 🗑 Usuń | Usunięcie kortu | `DELETE …/courts/{id}` |
| **+ Dodaj kort** (ID + PIN) | Nowy kort | `POST /admin/api/courts` |
| Status / bateria | Live | Snapshot + SSE `/api/stream` |

> [!tip] Aplikacja sędziowska
> PIN z tej zakładki jest tym samym, który wpisuje sędzia w aplikacji Blind Tennis Referee (ekran „Autoryzacja kortu” — osobny vault `android-tennis-referee/docs/`).

## Powiązane

- [[30 - Logowanie admin]]
- [[34 - Turnieje i SMTP]]
