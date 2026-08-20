---
title: Logowanie admin
tags: [wyniki, admin]
aliases: [Admin login, Panel administratora]
---

# Logowanie — Admin

## Cel

Wejście do panelu systemowego (korty, turnieje, gracze globalni, overlay).

## URL

`/admin` (także `/admin/` / `/admin.html`).

## Elementy UI

| Kontrolka | Co robi | Efekt |
|-----------|---------|-------|
| Tytuł **Panel administratora** | — | — |
| Pole **Hasło** + oczko | Hasło z konfiguracji serwera (`ADMIN_PASSWORD`); przycisk pokazuje / ukrywa treść | — |
| **Zaloguj** | Auth | `POST /admin/api/auth` → token `wyniki-admin-token` w sessionStorage |

## Zakładki po zalogowaniu

| Zakładka | Notatka |
|----------|---------|
| **Korty** | [[31 - Korty i PIN]] |
| **Biuro turnieju** | [[32 - Biuro turnieju (zakładka admin)]] |
| **Plan turnieju** | [[33 - Plan turnieju]] |
| **Turnieje** | [[34 - Turnieje i SMTP]] |
| **Zawodnicy** | [[35 - Zawodnicy globalni]] |
| **Gracze turnieju** | [[36 - Gracze turnieju i import]] |
| **Overlay** | [[37 - Overlay designer]] |

> [!warning]
> Admin ≠ Biuro turnieju. Admin zarządza systemem; biuro prowadzi operacje dnia turnieju.

## Powiązane

- [[40 - Role i dostęp]]
- [[20 - Logowanie office]]
