---
title: Turnieje i SMTP
tags: [wyniki, admin, turnieje]
aliases: [Admin tournaments, SMTP]
---

# Admin — Turnieje i SMTP

## Cel

Tworzenie / edycja turniejów, kluczy dostępu, haseł biura, flag oraz ustawień e-mail raportów.

## Formularz utworzenia / edycji

| Pole | Znaczenie |
|------|-----------|
| Nazwa | Nazwa turnieju |
| Daty | Start / koniec |
| Liczba kortów | Ile kortów założyć |
| Miasto / kraj | Lokalizacja |
| Email raportów | Adres raportów |
| Logo (plik) | Logo turnieju |
| **Klucz dostępu** | `access_key` dla prywatnych widoków publicznych |
| **Hasło modułu biura** | Hasło do `/office` |
| Toggle **Publiczny** | Widoczność |
| Toggle **Liczy statystyki** | Statystyki |
| Toggle **Symulacja** | Tryb symulacji (`etap`) |
| Toggle **Turniej aktywny** (edycja) | Aktywacja |
| Kategorie (presety + custom) | **Zatwierdź kategorie**, CRUD |
| **Utwórz turniej** / **Zapisz turniej** | `POST` / `PUT /admin/api/tournaments[/{id}]` |

## Lista turniejów — akcje

| Przycisk | Co robi |
|----------|---------|
| Toggle aktywny | `PUT …/{id}/active` |
| **Biuro** | Skok do zakładki biura dla turnieju |
| **Edytuj** | Formularz edycji |
| **Gracze** | Skok do [[36 - Gracze turnieju i import]] |
| **Usuń** | `DELETE …/{id}` |

## SMTP

| Pole | Znaczenie |
|------|-----------|
| Host, Port, Login, Hasło | Serwer poczty |
| Email / Nazwa nadawcy | From |
| STARTTLS | Toggle |
| **Zapisz SMTP** | `PUT /admin/api/settings/email` |

## Powiązane

- [[18 - Język, motyw, access_key]]
- [[20 - Logowanie office]]
