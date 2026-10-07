# HTTP API

Every route the app serves, generated from the code by `python scripts/api_doc.py`.
`test_api_doc.py` fails when this file and the routes disagree, so regenerate it after
adding, removing or renaming a route. A route is described by the first line of its
view's docstring; an empty cell means the view has none yet.

The umpire app's calls are explained in more detail in [UMPIRE_API.md](UMPIRE_API.md).


## admin

| Method | Path | What it does |
|---|---|---|
| GET | `/admin/api/courts` | Get courts for active tournaments only. |
| POST | `/admin/api/courts` |  |
| DELETE | `/admin/api/courts/<kort_id>` |  |
| PUT | `/admin/api/courts/<kort_id>` | Update court (rename kort_id). |
| PUT | `/admin/api/courts/<kort_id>/pin` |  |
| POST | `/admin/api/courts/<kort_id>/reset` | Reset court state - clear all match data. |
| DELETE | `/admin/api/demo` | Clear demo data and deactivate demo overlay. |
| POST | `/admin/api/demo` | Seed demo data for admin preview. Does NOT affect production overlays. |
| POST | `/admin/api/demo/overlay` | Toggle demo data visibility in production overlays (OBS). |
| GET | `/admin/api/demo/status` | Get current demo state. |
| GET | `/admin/api/director/tablets` | Live umpire tablets (heartbeat/events) plus in-progress matches on a court. |
| GET | `/admin/api/e2e/artifacts` | Return emulator E2E artifacts created with an E2E-* marker. |
| POST | `/admin/api/e2e/cleanup` | Delete emulator E2E artifacts created with an E2E-* marker. |
| DELETE | `/admin/api/history/latest` | Delete the latest history entry. |
| POST | `/admin/api/matches/<int:match_id>/control` | Push court, names, score, and match rules onto the umpire tablet. |
| GET | `/admin/api/settings/email` | Get SMTP/email settings used for match and tournament reports. |
| PUT | `/admin/api/settings/email` | Persist SMTP/email settings. |

## admin_auth

| Method | Path | What it does |
|---|---|---|
| POST | `/admin/api/auth` |  |

## admin_global_players

| Method | Path | What it does |
|---|---|---|
| GET | `/admin/api/global-players` | List all global players with optional filters. |
| POST | `/admin/api/global-players` |  |
| DELETE | `/admin/api/global-players/<int:gp_id>` | Delete a global player (only if no tournament entries). |
| GET | `/admin/api/global-players/<int:gp_id>` | Get a global player with career stats. |
| PUT | `/admin/api/global-players/<int:gp_id>` |  |
| GET | `/admin/api/global-players/<int:gp_id>/classifications` | The player's sport class history, oldest first. |
| DELETE | `/admin/api/global-players/<int:gp_id>/photo` | Delete a player photo. |
| POST | `/admin/api/global-players/<int:gp_id>/photo` | Upload a player photo (resized to max 200x200). |
| POST | `/admin/api/global-players/migrate` | One-time migration: create GlobalPlayer records from existing players. |
| POST | `/admin/api/global-players/tournaments/<int:tid>/add-global` | Add a global player to a tournament. Body: { global_player_id: int, category: str (optional override) } |
| GET | `/admin/api/global-players/tournaments/<int:tid>/classification-review` | Players of a tournament who played outside their sport class. |
| POST | `/admin/api/global-players/tournaments/<int:tid>/classification-review` | Body: { decisions: [{ global_player_id, decision: reclassify\|play_up\|skip, classification? }] } |

## admin_player_reviews

| Method | Path | What it does |
|---|---|---|
| GET | `/admin/api/player-reviews` |  |
| POST | `/admin/api/player-reviews/<int:review_id>/accept` |  |
| POST | `/admin/api/player-reviews/<int:review_id>/revert` |  |

## admin_series

| Method | Path | What it does |
|---|---|---|
| GET | `/admin/api/series` |  |
| POST | `/admin/api/series` |  |
| DELETE | `/admin/api/series/<int:series_id>` |  |
| PATCH, PUT | `/admin/api/series/<int:series_id>` |  |
| POST | `/admin/api/series/<int:series_id>/members` |  |
| DELETE | `/admin/api/series/<int:series_id>/members/<int:account_id>` |  |
| PATCH, PUT | `/admin/api/series/<int:series_id>/members/<int:account_id>` |  |
| POST | `/admin/api/series/<int:series_id>/members/<int:account_id>/invite` |  |
| DELETE | `/admin/api/series/<int:series_id>/tournaments/<int:tournament_id>` |  |
| PUT | `/admin/api/series/<int:series_id>/tournaments/<int:tournament_id>` |  |
| GET | `/admin/api/series/settings` |  |
| PUT | `/admin/api/series/settings` |  |

## admin_tournaments

| Method | Path | What it does |
|---|---|---|
| GET | `/admin/api/tournaments` |  |
| POST | `/admin/api/tournaments` |  |
| DELETE | `/admin/api/tournaments/<int:tournament_id>` |  |
| GET | `/admin/api/tournaments/<int:tournament_id>` | Get a single tournament. |
| PUT | `/admin/api/tournaments/<int:tournament_id>` |  |
| PUT | `/admin/api/tournaments/<int:tournament_id>/active` | Toggle active state for a single tournament without affecting others. |
| GET | `/admin/api/tournaments/<int:tournament_id>/categories` |  |
| POST | `/admin/api/tournaments/<int:tournament_id>/categories` |  |
| DELETE | `/admin/api/tournaments/<int:tournament_id>/categories/<int:category_id>` |  |
| PATCH, PUT | `/admin/api/tournaments/<int:tournament_id>/categories/<int:category_id>` |  |
| POST | `/admin/api/tournaments/<int:tournament_id>/categories/confirm` |  |
| GET | `/admin/api/tournaments/<int:tournament_id>/court-streams` | Return the day × court stream URL grid for a tournament. |
| PUT | `/admin/api/tournaments/<int:tournament_id>/court-streams` | Save YouTube / stream URLs per tournament day and court. |
| GET | `/admin/api/tournaments/<int:tournament_id>/players` |  |
| POST | `/admin/api/tournaments/<int:tournament_id>/players` | Add a player to a tournament. |
| DELETE | `/admin/api/tournaments/<int:tournament_id>/players/<int:player_id>` |  |
| PUT | `/admin/api/tournaments/<int:tournament_id>/players/<int:player_id>` |  |
| POST | `/admin/api/tournaments/<int:tournament_id>/players/bulk` | Bulk import pre-parsed players: { "players": [{"name": "...", "category": "...", "country": "..."}] } |
| POST | `/admin/api/tournaments/<int:tournament_id>/players/parse-import` | Parse free-form tournament player import text and return preview data. |
| GET | `/admin/api/tournaments/active` | Get only active tournaments for admin integrations. |

## app

| Method | Path | What it does |
|---|---|---|
| GET | `/data/photos/<path:filename>` |  |
| GET | `/data/tournament-logos/<path:filename>` |  |

## bracket_admin

| Method | Path | What it does |
|---|---|---|
| GET | `/admin/api/tournaments/<int:tid>/bracket/groups` | Get bracket groups for a tournament. |
| PUT | `/admin/api/tournaments/<int:tid>/bracket/groups` | Replace bracket groups. Body: {"groups": [{"name": "A", "players": [1,2,3]}, ...]} |
| GET | `/admin/api/tournaments/<int:tid>/bracket/knockout` | Get knockout bracket slots. |
| PUT | `/admin/api/tournaments/<int:tid>/bracket/knockout` | Manually set knockout bracket. Body: {"knockout": [...]} |
| POST | `/admin/api/tournaments/<int:tid>/bracket/knockout/generate` | Auto-generate knockout from group standings (1A vs 2B, 1B vs 2A). |

## bracket_public

| Method | Path | What it does |
|---|---|---|
| GET | `/api/tournament/<int:tid>/bracket` | Full bracket for a specific tournament. |
| GET | `/api/tournament/<int:tid>/history` | Match history for a specific tournament. |
| GET | `/api/tournament/<int:tid>/info` | Quick info banner for a specific tournament. |
| GET | `/api/tournament/<int:tid>/schedule` | Public schedule for a specific tournament. |
| GET | `/api/tournament/bracket` | Full bracket for a requested tournament or the first active one. |
| GET | `/api/tournament/info` | Quick info banner for the active tournament. |
| GET | `/api/tournament/list` | List all tournaments for public tournament browsing. |
| GET | `/api/tournament/schedule` | Public schedule for a requested tournament or the first active one. |

## courts

| Method | Path | What it does |
|---|---|---|
| GET | `/api/history` | Get match history, optionally filtered by tournament. |
| GET | `/api/match-stats/<int:match_id>` | Get match statistics for Details button in history. |
| GET | `/api/snapshot` | Get current state of all courts. |

## health

| Method | Path | What it does |
|---|---|---|
| GET | `/health` | Health check endpoint for monitoring. |

## office

| Method | Path | What it does |
|---|---|---|
| POST | `/api/office/<int:slot>/auth` | Authenticate access to one office slot. |
| POST | `/api/office/<int:slot>/autoschedule/apply` | Persist a reviewed set of placements to the schedule. |
| GET | `/api/office/<int:slot>/autoschedule/config` | Return auto-scheduler config plus available courts and detected category bands. |
| PUT | `/api/office/<int:slot>/autoschedule/config` | Persist auto-scheduler config (court mapping, slot minutes, start time, rest). |
| POST | `/api/office/<int:slot>/autoschedule/generate` | Build a non-persisted auto-placement proposal to review on the board. |
| POST | `/api/office/<int:slot>/autoschedule/move` | Move one match to a court/time. Other matches keep their times. |
| POST | `/api/office/<int:slot>/autoschedule/unassign` | Return a match to the unassigned pool (clear court and time). |
| GET | `/api/office/<int:slot>/categories` |  |
| POST | `/api/office/<int:slot>/categories` |  |
| DELETE | `/api/office/<int:slot>/categories/<int:category_id>` |  |
| PATCH, PUT | `/api/office/<int:slot>/categories/<int:category_id>` |  |
| POST | `/api/office/<int:slot>/categories/confirm` |  |
| GET | `/api/office/<int:slot>/court-streams` | Return the day × court stream URL grid for the authenticated office. |
| PUT | `/api/office/<int:slot>/court-streams` | Save YouTube / stream URLs per tournament day and court. |
| GET | `/api/office/<int:slot>/dashboard` | Return office dashboard for one office slot. |
| POST | `/api/office/<int:slot>/group-matches` | Create a finished group-stage result from the standalone office module. |
| GET | `/api/office/<int:slot>/knockout-formats` | Knockout format, allowed formats and a draw preview for every category. |
| PUT | `/api/office/<int:slot>/knockout-formats/<int:category_id>` | Save (and confirm) a category's knockout format; rebuilds its draw when it changed. |
| POST | `/api/office/<int:slot>/knockout-formats/confirm-all` | Confirm the current format of every category. |
| POST | `/api/office/<int:slot>/knockout-formats/preview` | Preview an unsaved format for one category. |
| POST | `/api/office/<int:slot>/knockout-matches` | Create a finished knockout result from the standalone office module. |
| POST | `/api/office/<int:slot>/knockout/swap` | Swap two players between knockout slots of one category before they have played. |
| PUT | `/api/office/<int:slot>/matches/<int:match_id>` | Edit an existing office match result from the standalone office module. |
| GET | `/api/office/<int:slot>/meta` | Return public metadata for one office slot before login. |
| GET | `/api/office/<int:slot>/planning` | Return all data needed by the office planning workflow. |
| PUT | `/api/office/<int:slot>/planning/groups` | Replace bracket groups from the standalone office planning workflow. |
| POST | `/api/office/<int:slot>/planning/groups/replace-schedule` | Regenerate unplayed group fixtures and put them back on the timetable. |
| POST | `/api/office/<int:slot>/planning/start-numbers` | Give start numbers to the players listed in a category that have none yet. |
| POST | `/api/office/<int:slot>/players` | Add a player to the tournament from the office workflow. |
| GET | `/api/office/<int:slot>/quick-info` | Return the quick info banner draft for the authenticated office. |
| PUT | `/api/office/<int:slot>/quick-info` | Publish or hide the quick info banner on the public live site. |
| GET | `/api/office/<int:slot>/schedule` | Return schedule entries for one authenticated office slot. |
| POST, PUT | `/api/office/<int:slot>/schedule` | Create or update manual schedule entries from the office workflow. |
| DELETE | `/api/office/<int:slot>/schedule/<int:schedule_id>` | Delete one schedule entry from the office workflow. |
| PATCH, PUT | `/api/office/<int:slot>/schedule/<int:schedule_id>` | Update date, time, court, status or notes for one schedule entry. |
| POST | `/api/office/<int:slot>/schedule/clear-day` | Move one day's matches back to the unassigned pool; played and live ones stay. |
| POST | `/api/office/<int:slot>/schedule/generate` | Create missing schedule entries from groups and knockout slots. |
| POST | `/api/office/<int:slot>/schedule/generate-rematch` | Add a second group-stage round robin for selected bracket groups. |
| POST | `/api/office/<int:slot>/schedule/notes` | Write (replace, append or clear) the public note of every matching match. |
| POST | `/api/office/<int:slot>/schedule/notes/preview` | Which matches a bulk note would touch, and how. |
| POST | `/api/office/<int:slot>/schedule/publish` | Promote all draft schedule entries to published (planned). |
| DELETE | `/api/office/<int:slot>/schedule/unassigned` | Delete all unassigned schedule entries (no court or time), optionally for one day. |
| POST | `/api/office/<int:slot>/session` | Re-issue the event-stream cookie after the tournament moved to another slot. |
| GET | `/api/office/<int:slot>/stream` | Authenticated, tournament-scoped invalidation stream for the office UI. |
| GET | `/api/office/<int:slot>/teams` |  |
| POST | `/api/office/<int:slot>/teams` |  |
| DELETE | `/api/office/<int:slot>/teams/<int:team_id>` |  |
| GET | `/api/office/tournaments` | Tournaments the office can open, with the slot each one uses today (before login). |

## organizer

| Method | Path | What it does |
|---|---|---|
| POST | `/organizer/api/auth` |  |
| GET | `/organizer/api/invite/<token>` |  |
| POST | `/organizer/api/invite/<token>` |  |
| GET | `/organizer/api/me` |  |
| GET | `/organizer/api/series/<int:series_id>/tournaments` |  |

## organizer_players

| Method | Path | What it does |
|---|---|---|
| GET | `/organizer/api/players` |  |
| POST | `/organizer/api/players` |  |
| PUT | `/organizer/api/players/<int:gp_id>` |  |
| GET | `/organizer/api/tournaments/<int:tournament_id>/players` |  |
| POST | `/organizer/api/tournaments/<int:tournament_id>/players` |  |
| DELETE | `/organizer/api/tournaments/<int:tournament_id>/players/<int:player_id>` |  |
| PUT | `/organizer/api/tournaments/<int:tournament_id>/players/<int:player_id>` |  |
| POST | `/organizer/api/tournaments/<int:tournament_id>/players/add-global` |  |
| POST | `/organizer/api/tournaments/<int:tournament_id>/players/bulk` |  |
| POST | `/organizer/api/tournaments/<int:tournament_id>/players/parse-import` |  |

## organizer_tournaments

| Method | Path | What it does |
|---|---|---|
| POST | `/organizer/api/series/<int:series_id>/tournaments` |  |
| GET | `/organizer/api/tournaments/<int:tournament_id>` |  |
| PUT | `/organizer/api/tournaments/<int:tournament_id>` |  |
| PUT | `/organizer/api/tournaments/<int:tournament_id>/active` | The day of the tournament: live for the umpires' app and the office, or not. |
| GET | `/organizer/api/tournaments/<int:tournament_id>/categories` |  |
| POST | `/organizer/api/tournaments/<int:tournament_id>/categories` |  |
| DELETE | `/organizer/api/tournaments/<int:tournament_id>/categories/<int:category_id>` |  |
| PATCH, PUT | `/organizer/api/tournaments/<int:tournament_id>/categories/<int:category_id>` |  |
| POST | `/organizer/api/tournaments/<int:tournament_id>/categories/confirm` |  |
| PUT | `/organizer/api/tournaments/<int:tournament_id>/courts/<kort_id>/pin` |  |
| GET | `/organizer/api/tournaments/<int:tournament_id>/log` |  |
| POST | `/organizer/api/tournaments/<int:tournament_id>/office-session` | Into the office without its password: the organizer already proved who they are. |

## overlay_api

| Method | Path | What it does |
|---|---|---|
| DELETE | `/api/overlay/logo` | Remove tournament logo. |
| POST | `/api/overlay/logo` | Upload tournament logo as base64 data-URL (JSON body: {logo: "data:..."}). |
| DELETE | `/api/overlay/overlays/<overlay_id>` | Delete a single overlay preset. |
| GET | `/api/overlay/settings` | Get current overlay settings. |
| PUT | `/api/overlay/settings` | Update overlay settings (merge semantics). |
| POST | `/api/overlay/stats` | Toggle stats panels on overlays 1-4 for StreamDeck/webhook integrations. |
| GET, POST | `/api/overlay/stats/<action>` | Toggle stats panels on overlays 1-4 for StreamDeck/webhook integrations. |

## panic_admin

| Method | Path | What it does |
|---|---|---|
| POST | `/admin/api/panic/recipients` |  |
| DELETE | `/admin/api/panic/recipients/<int:recipient_id>` |  |
| PUT | `/admin/api/panic/recipients/<int:recipient_id>` |  |
| GET | `/admin/api/panic/settings` |  |
| PUT | `/admin/api/panic/settings` |  |

## panic_umpire

| Method | Path | What it does |
|---|---|---|
| POST | `/api/umpire/panic` |  |
| GET | `/api/umpire/panic/<token>` |  |
| POST | `/api/umpire/panic/<token>` |  |

## players_public

| Method | Path | What it does |
|---|---|---|
| GET | `/api/players/<int:player_id>/profile` | A player's public profile, by tournament entry id or, with ?global=1, by global player id. |
| GET | `/api/players/active` | Get players from all active tournaments (for Umpire App). |
| GET | `/api/players/all` | Get all players across all tournaments with match stats. |

## push

| Method | Path | What it does |
|---|---|---|
| GET | `/api/push/key` | The VAPID public key, or enabled=false when push is not configured. |
| POST | `/api/push/subscribe` |  |
| POST | `/api/push/unsubscribe` |  |

## stream

| Method | Path | What it does |
|---|---|---|
| GET | `/api/stream` | Server-Sent Events stream for real-time updates. |

## tournaments_public

| Method | Path | What it does |
|---|---|---|
| GET | `/api/tournaments/active` | Active tournaments for the Android app, including Play-review simulations. |

## umpire_api

| Method | Path | What it does |
|---|---|---|
| GET | `/api/courts` | Get list of available courts for app. |
| POST | `/api/courts/<kort_id>/authorize` | Verify PIN for court access. |
| GET | `/api/courts/<kort_id>/suggested-match` | Return nearest scheduled match for the selected court and current app time. |
| POST | `/api/match-events` | Process match event and push real-time score update via SSE. |
| POST | `/api/match-statistics` | Receive match statistics from app. |
| POST | `/api/matches` | Create new match on server. |
| GET | `/api/matches/<int:match_id>` | Get match details. |
| PUT | `/api/matches/<int:match_id>` | Update match score and state. |
| POST | `/api/matches/<int:match_id>/finish` | Mark match as finished. |
| GET, POST | `/api/players` | Get list of available players for app, or add a new player (POST). |
| POST | `/api/umpire-heartbeat` | Receive periodic heartbeat from umpire tablet (battery, online status). |
| GET | `/api/umpire/commands` | Long-poll pending director commands for the authorized tablet session. |
| POST | `/api/umpire/commands/<command_id>/ack` | Drop a director command after the tablet applied it. |

## umpire_devices_admin

| Method | Path | What it does |
|---|---|---|
| GET | `/admin/api/devices` |  |
| PUT | `/admin/api/devices/<android_id>` |  |

## web

| Method | Path | What it does |
|---|---|---|
| GET | `/` | Serve main page. |
| GET | `/admin` | Serve admin page. |
| GET | `/admin.html` | Serve admin page. |
| GET | `/admin/` | Serve admin page. |
| GET | `/admin/login` | Serve the admin sign-in page; the panel sends you here without a session. |
| GET | `/admin/login/` | Serve the admin sign-in page; the panel sends you here without a session. |
| GET | `/assets/<path:filename>` | Serve static assets (JS, CSS, etc.). |
| GET | `/brand/<path:filename>` |  |
| GET | `/embed` | Serve embed page with optional language and court parameters. |
| GET | `/embed.html` | Serve embed page with optional language and court parameters. |
| GET | `/embed/<lang>/<int:court>` | Serve embed page with optional language and court parameters. |
| GET | `/favicon.svg` |  |
| GET | `/office` | Serve standalone office page. |
| GET | `/office.html` | Serve standalone office page. |
| GET | `/office/` | Serve standalone office page. |
| GET | `/office/<int:slot>` | Serve standalone office page. |
| GET | `/office/<int:slot>/` | Serve standalone office page. |
| GET | `/organizer` | Serve the series organizer's panel. |
| GET | `/organizer/` | Serve the series organizer's panel. |
| GET | `/organizer/invite` | Serve the organizer's sign-in; with ?token= it sets the password from an invitation. |
| GET | `/organizer/login` | Serve the organizer's sign-in; with ?token= it sets the password from an invitation. |
| GET | `/organizer/login/` | Serve the organizer's sign-in; with ?token= it sets the password from an invitation. |
| GET | `/overlay/<int:tournament_slot>/<overlay_id>` | Serve overlay page for any preset (e.g. /overlay/1, /overlay/all, /overlay/split_1_2). |
| GET | `/overlay/<overlay_id>` | Serve overlay page for any preset (e.g. /overlay/1, /overlay/all, /overlay/split_1_2). |
| GET | `/privacy` | Serve the public privacy policy. |
| GET | `/privacy.html` | Serve the public privacy policy. |
| GET | `/privacy/` | Serve the public privacy policy. |
| GET | `/site-icons/<path:filename>` |  |
| GET | `/site-sw.js` |  |
| GET | `/site.webmanifest` |  |
| GET | `/umpire` | Serve the umpire PWA (pre-match + scoring). |
| GET | `/umpire-icons/<path:filename>` |  |
| GET | `/umpire-sw.js` |  |
| GET | `/umpire.html` | Serve the umpire PWA (pre-match + scoring). |
| GET | `/umpire.webmanifest` |  |
| GET | `/umpire/` | Serve the umpire PWA (pre-match + scoring). |
| GET | `/vest-media-logo.png` | Vest Media brand mark for TV watermark (same asset as vestmedia.pl). |
