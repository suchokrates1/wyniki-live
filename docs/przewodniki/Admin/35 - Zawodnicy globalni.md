---
title: Zawodnicy globalni
tags: [wyniki, admin, zawodnicy]
aliases: [Global players]
---

# Admin — Zawodnicy (globalni)

## Cel

Globalna baza zawodników (wieloturniejowa): CRUD, zdjęcia, migracja, dodawanie do turnieju.

## Elementy UI

| Kontrolka | Co robi | API |
|-----------|---------|-----|
| Filtry: Szukaj / Płeć / Kategoria / Kraj / **Wyczyść** | Lista | `GET /admin/api/global-players?…` |
| **Migruj istniejących** | Import z lokalnych do globalnych | `POST …/global-players/migrate` |
| Formularz dodania (Imię, Nazwisko*, Płeć, DOB, Kat, Kraj, Notatki) **Dodaj** | Nowy | `POST …/global-players` |
| ✏️ / ✓ / ✗ | Edycja wiersza | `PUT …/{id}` |
| 🗑 | Usunięcie | `DELETE …/{id}` |
| Upload zdjęcia / X | Foto | `POST` / `DELETE …/{id}/photo` |
| **+🏆** do wybranego turnieju | Powiązanie | `POST …/tournaments/{tid}/add-global` |

## Powiązane

- [[16 - Zawodnicy i profil]] (publiczny odczyt)
- [[36 - Gracze turnieju i import]]
