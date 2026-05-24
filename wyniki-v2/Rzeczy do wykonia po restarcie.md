# Rzeczy do wykonia po restarcie

## Backend quickfixy objete tym deployem

- `/api/players` i odpowiedzi dodawania gracza zwracaja `id` jako liczbe, nie string.
- `wyniki/api/umpire_api.py` po `create/update/finish` probuje dopiac `phase`, `bracket_group_id` i `tournament_schedule.match_id`.
- `wyniki/database.py` ma poprawione `detect_bracket_context()` z fallbackiem po nazwisku i ochrona przed niejednoznacznosciami.
- `wyniki/database.py` ma poprawione `_find_group_matches()`: laczy exact-match i fallback po nazwisku, zamiast gubic zakonczone mecze zapisane samym nazwiskiem, gdy w tej samej grupie sa juz inne mecze zapisane pelnym imieniem i nazwiskiem.
- `wyniki/services/history_manager.py` buduje `score_a/score_b` z `matches.sets_history`, a nie tylko z pamieci kortu.
- Backend wystawia jawny sygnal live dla aktywnego `Super TB`, zeby frontend i overlay nie musialy juz zgadywac po stanie `1:1` w setach.

## Po restarcie sprawdzic i zdecydowac

- Zweryfikowac, czy tymczasowy sidecar `/tmp/live_group_phase_reconciler.py` nadal jest potrzebny po wdrozeniu backendowych fixow.
- Jesli nie jest potrzebny, zatrzymac go i zostawic normalna logike aplikacji jako jedyne zrodlo prawdy.
- Zrobic jedno przejscie po bazie i posprzatac stare duplikaty `in_progress`, ktore zostaly po wielokrotnym `createMatch`.
- Dodac docelowy mechanizm odtwarzania live stanu po restarcie backendu. Obecnie aktywny stan kortow siedzi w pamieci procesu i nie wraca automatycznie po starcie.
- Rozwazyc twardsza deduplikacje po stronie backendu dla aktywnego meczu na korcie, zeby kolejne `createMatch` nie tworzyly serii pustych duplikatow.

## Dzisiaj sprawdzone na produkcji

### Zakonczone mecze

- Nie widac masowego problemu z blednie zakonczonymi meczami.
- Nie ma dzisiaj zakonczonych meczow z pustym `sets_history`.
- Ostatnie zakonczone mecze grupowe wygladaja logicznie: `271`, `266`, `258`, `251`, `247`, `246`, `238`, `237`, `236`, `233`.
- Audyt harmonogramu do `15:00` jest juz domkniety: wszystkie `23/23` sloty maja spójne `tournament_schedule`, `matches(status=finished)` i `match_history`.

### Nieprzypisane do grup

- Na ten moment nie ma juz dzisiaj kluczowego zakonczonego meczu grupowego niepodpietego do harmonogramu lub grupy. Wczesniejszy przypadek `249` zostal juz recznie dopiety.

### Smieciowe i wiszace rekordy do decyzji po restarcie

- Duzy cleanup duplikatow `in_progress` zostal juz zrobiony na produkcji 2026-05-23. Backup: `/data/wyniki.sqlite3.stale-inprogress-cleanup-20260523T130311Z.bak`.
- Recznie domkniete wyniki z backupem `/data/wyniki.sqlite3.manual-finish-20260523T131430Z.bak`:
	- `259` `Balwierz vs Haftka` zapisane jako `4:2, 4:1` i ustawione na `finished`.
	- `275` `Olkiewicz vs Malak` zapisane jako `0:4, 0:4` i ustawione na `finished`.
- Recznie domkniety slot harmonogramu `85` z backupem `/data/wyniki.sqlite3.manual-finish-slot85-history-backfill-20260523T134343Z.bak`:
	- nowy `match 296` `Tomasz Błoński vs Michal Stypa` zapisany jako `0:4, 0:4` i podpiety do slotu `14:30`, kort `2`.
	- dopisane brakujace `match_history` dla zakonczonych meczow `236`, `237`, `251`, `258`, `271`, zeby harmonogram do `15:00` byl systemowo spójny.
- Pozostale rekordy wymagajace decyzji po restarcie:
	- `229` `t25-1` `Karakula vs Stopierzynski` - stary rekord `in_progress`, bez `phase`, bez `bracket_group_id`, bez slotu w `tournament_schedule`. Nie jest spiety do drabinki ani harmonogramu. Kandydat do usuniecia.
	- `230` `t25-1` `Karakula vs Hortecki` - stary rekord `in_progress`, bez `phase`, bez `bracket_group_id`, bez slotu w `tournament_schedule`. Nie jest spiety do drabinki ani harmonogramu. Kandydat do usuniecia.
	- `288` `t25-3` `Tomasz Gawrych vs Michał Orchowski` - wiszacy duplikat `in_progress` z ostatnim snapshotem po 1 secie (`1:4`). Oficjalny slot dla tej pary jest juz zakonczony jako `match 290`, wiec `288` wyglada na osierocony rekord do posprzatania po restarcie.

### Co juz nie wymaga sprzatania

- Usuniete zostaly wczesniejsze serie duplikatow `in_progress` dla par:
	- `Olkiewicz vs Karakula`
	- `Kopycinski vs Blonski`
	- `Antczak vs Marciniak`
	- `dubiel vs Kokot-Rybinska`
	- `Blonski vs Hortecki`
	- `Balwierz vs Haftka` (duplikaty posrednie, zostal tylko rekord glowny `259`, potem domkniety)
	- `Skarzynski vs Opoka` (zostal tylko rekord glowny `273`, potem domkniety jako wygrana Skarzynskiego po kreczu)
	- `Olkiewicz vs Malak` (duplikaty posrednie usuniete, rekord glowny `275` domkniety)

## Po restarcie najpierw wykonac

1. Zrestartowac backend w oknie bezpiecznym dla turnieju i zweryfikowac, czy Android dalej laduje zawodnikow poprawnie po nowych odpowiedziach `/api/players`.
2. Zweryfikowac, czy tymczasowy sidecar `scripts/live_group_phase_reconciler.py` nadal jest potrzebny po wdrozeniu tych fixow.
3. Usunac po restarcie dwa off-schedule smieciowe rekordy `229` i `230`, jesli nic nowego nie wyjdzie z logow lub od sedziow.
4. Posprzatac po restarcie osierocony duplikat `288`, jesli nic nowego nie wyjdzie jeszcze z logow albo historii kortu `t25-3`.