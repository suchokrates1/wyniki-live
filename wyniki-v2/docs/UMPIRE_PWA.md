# Umpire PWA — install for a tournament day

Chrome on an Android tablet. Do not use a laptop browser for live scoring.

1. Open **https://test.blindtennis.app/umpire** (prod `https://blindtennis.app/umpire` stays off until soak / Bramka 9).
2. Chrome menu → **Add to Home screen** / **Install app**. Open the icon, not a leftover tab.
3. Choose language. Pick today’s tournament. Pick the court. Enter the 4-digit court PIN from Admin → Courts.
4. Pick two players (or four for doubles). Set games/sets if needed. Start **Basic** or **Advanced**.
5. Keep the tablet on charge. The screen stays awake during a match.
6. After a match: **Next match — same setup** for the next pair on this court, or **new setup** to change rules.

PIN survives a Chrome restart. If the PIN expired, pick the court again.

## Update the installed Android PWA

The icon is a WebAPK. After a test/prod deploy it does **not** auto-refresh while the app stays in Recents.

1. Close **Sędzia** completely (swipe it away in Recents). Do not leave it in the background.
2. Open the home-screen icon again. Chrome then downloads the new service worker (`skipWaiting` + `clients.claim`).
3. If the UI is still old: open **https://test.blindtennis.app/umpire** in a Chrome tab (not the icon), pull to refresh, then reopen the icon.
4. Last resort: Chrome → site settings for `test.blindtennis.app` → **Clear & reset**, or uninstall the icon and Add to Home screen again.

Hashed `/assets/umpire-*.js` change on every build. HTML is network-first, so a fresh open after step 1–2 is enough on a healthy network.

## iOS

There is no official iOS Simulator on Windows. Local stand-in is Playwright WebKit (`npm run e2e:umpire:ios`). Against the deployed test build: `$env:UMPIRE_E2E_BASE_URL='https://test.blindtennis.app'; npm run e2e:umpire`. Real Safari / Add to Home Screen needs a physical iPhone/iPad or a Mac with Xcode.

iOS has no `beforeinstallprompt`. Share → **Add to Home Screen**. Updates are slower than Android: kill the home-screen app and reopen; if it stays stale, delete the icon and add it again. Battery / `getInstalledRelatedApps` are Chrome/Android-only.

Reżyserka can push court / names / score / rules onto the tablet while the match is open. A toast confirms the update — do not restart the match to apply it.
