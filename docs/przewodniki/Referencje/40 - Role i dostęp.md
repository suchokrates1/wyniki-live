---
title: Role i dostęp
tags: [wyniki, referencja, bezpieczeństwo]
aliases: [Auth roles, Dostęp]
---

# Role i dostęp

| Aktor | Jak się loguje | Zakres |
|-------|----------------|--------|
| Gość (publiczna) | Brak | Odczyt `/`, API publiczne; prywatne turnieje z `access_key` |
| Biuro turnieju | Hasło biura → Bearer (`office-token-{slot}`) | `/api/office/{slot}/*` — plan, wyniki, quick-info |
| Admin | `ADMIN_PASSWORD` → Bearer (`wyniki-admin-token`) | `/admin/api/*`, zapis overlay |
| Sędzia (Android) | PIN kortu → sesja kortu | API umpires / mecze — nie jest UI przeglądarki |

Brak wieloużytkownikowego RBAC — rozróżnienie to **admin / office / court / public**.

## Powiązane

- [[20 - Logowanie office]]
- [[30 - Logowanie admin]]
- [[18 - Język, motyw, access_key]]
- [[41 - Mapowanie URL]]
