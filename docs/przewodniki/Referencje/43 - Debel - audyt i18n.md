---
title: Debel - audyt i18n
tags: [wyniki, i18n, debel, litewski, audyt]
aliases: [Doubles i18n audit, Litewski terminy]
---

# Debel — audyt i18n (Etap 6)

Przegląd DE/EN/IT/ES/FR + nowy pakiet **LT** na żywych ekranach (publiczna: live / drabinka / terminarz; biuro: logowanie, plan, wynik, puchar). Nie tabela 1:1.

Źródło kanoniczne etykiet w DB zostaje **polskie** (`Grupowa`, `Półfinał`, `Finał`, `Kobiety`…). UI mapuje je przez `labelDisplay.js` / `PhaseLabels` przy aktualnym `lang`.

## Decyzje terminów

| Miejsce | PL | DE | EN | IT | ES | FR | LT |
|---------|----|----|----|----|----|----|----|
| Checkbox kategorii | Debel | Doppel | Doubles | Doppio | Dobles | Double | **Dvejetai** |
| Singiel (osoba) | zawodnik | Spieler | player | giocatore | jugador | joueur | **žaidėjas** |
| Para / drużyna debla | para | Paar | pair | coppia | pareja | paire | **pora** |
| Kort | kort | Platz | court | campo | cancha | court | **kortas** |
| RR (biuro, format grupy) | Tylko każdy z każdym | Nur Jeder gegen Jeden | Round robin only | — | — | — | **Tik ratų sistema** |
| RR (publiczna faza) | Faza grupowa | Gruppenphase | Group phase | Fase a gironi | Fase de grupos | Phase de groupes | **Grupių etapas** |
| KO | Faza pucharowa | K.-o.-Phase | Knockout | — | — | Phase à élimination | **Atkrintamosios** |
| Półfinał / Finał | Półfinał / Finał | Halbfinale / Finale | Semifinal / Final | — | — | Demi-finale / Finale | **Pusfinalis / Finalas** |

Świadomie **nie** używamy kalki „Podwójny / Dvigubas / Double” na checkboxie kategorii — to nazwa konkurencji (debel), nie przymiotnik formatu.

## Kali: zawodnik vs para

Po deblu te miejsca mówiły o „zawodniku”, choć konkurentem jest para albo strona meczu:

| Klucz / miejsce | Było | Jest |
|-----------------|------|------|
| `office.status.knockoutWaiting` | Czeka na zawodników / Wartet auf Spieler / Waiting for players | strony / Teilnehmer / competitors / concorrenti / competidores / compétiteurs / **varžovų** |
| `office.toast.knockoutSlotIncomplete` | dwóch zawodników / zwei Spieler | dwóch konkurentów / zwei Teilnehmer / two competitors / … / **dviejų varžovų** |
| Publiczna tabela grupy | zawsze `bracket.player` | `bracket.pair`, gdy nazwy wyglądają na `"A / B"` (`isTeamDisplayName`) |
| Biuro → plan, kafelek liczby | zawsze Zawodnicy | przy wybranej kategorii debla: Drużyny/Poros + liczba par |
| Biuro → postęp grupy | zawsze `progress.players` | `progress.pairs` gdy grupa ma `team_id` |
| Aria nieustalonej strony | tylko `unknownPlayer` | `unknownPair`, gdy druga strona to etykieta pary |

Modal wyniku A/B już wcześniej przełączał `modals.playerA` / `modals.teamA` przez `officeFormUsesTeams`.

## Litewski — pakiet

- Publiczna: `TRANSLATIONS.lt` + `TRANSLATION_PATCHES.lt` (`translationsLt.js`)
- Biuro: `OFFICE_TRANSLATION_PATCHES.lt` (`officeTranslationsLt.js`)
- Select **Lietuvių**, `?lang=lt`, `htmlLang: 'lt'`, `Intl` `lt-LT`
- Android: `AvailableLanguages` + `values-lt/strings.xml` (227 kluczy = `values-pl`); fazy: Grupių etapas / Atkrintamosios / Pusfinalis / Finalas
- Gate: `findMissingTranslationKeys` jako test Node (`validation.test.js`) + istniejący `npm run test:i18n`; Android `AvailableLanguagesTest`

## Poza zakresem

`admin.html` zostaje po polsku (osobna decyzja z planu). E2E `15_lang_lt.spec` i emulator = Etap 7.
