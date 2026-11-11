# dsh-desktop-pet behavior contract

Status: implemented in v0.2.0 and kept as the maintained behavior contract. The test suite is
the executable source of truth; protected tests change only with explicit user approval. The
frozen-test baselines from the rebuild live in [dev/tdd](dev/tdd/); the detailed RED output
is retained in repository history.

## Product goal

The pet is a desktop presence that is **always there while DSH runs** and **tells you when
something needs you**: a turn finished, a permission is waiting, a turn errored, a turn hit its
token cap, or your DeepSeek account balance is low. It is not a settings-page toy that must be
manually started every session.

Platform: macOS first (verified), Windows and Linux intended. Code must not assume macOS-only
APIs in shared logic; OS-specific calls must be guarded.

## R1. Persistent enabled state and auto-start

1. When the user enables the pet, the enabled state is written to disk immediately.
2. When the user disables it, the state is written immediately.
3. When a DSH host starts, it reads the saved state and, if enabled, starts the helper
   automatically without any user action.
4. If no saved state exists, the pet starts **stopped** (first-run behavior unchanged).
5. Auto-start must not run away: a failed auto-start records the error and does not retry in a
   tight loop. A later manual enable must still work.
6. The config file lives at `~/.dsh-pet/pet.json`, mode 0600, written atomically
   (temp file + rename). A missing, unreadable, or corrupt file falls back to defaults and is
   never allowed to crash the host.
7. Config contents:
   ```json
   {
     "version": 1,
     "enabled": true,
     "position": { "x": 1156, "y": 700 },
     "sound": true,
     "balanceThreshold": { "currency": "CNY", "amount": 5 }
   }
   ```
   Unknown keys are ignored; invalid values fall back to defaults field-by-field.

## R2. Window position memory

1. The helper reports its window position when the user finishes dragging it, and when the
   window is first placed.
2. The host persists that position in the config file.
3. On the next start, the window opens at the saved position.
4. A saved position that is off every connected display (monitor removed, resolution changed)
   is discarded and the default bottom-right placement is used.
5. Position writes are debounced or idempotent; a drag must not corrupt the config.

## R3. Notifications that cannot be missed

Alerts: turn `completed`, `permission`, `error`, `max-tokens`, and `low-balance`.

1. An alert bubble stays visible until the user dismisses it (the × button or acknowledging
   it) or a newer event replaces it. It must **not** disappear on a 16-second timer. While an
   alert is showing, its secondary detail line is visible without hover, so the amount or
   reason is readable at a glance; sleeping/thinking bubbles stay hover/focus-only.
2. A new alert raises the pet above other windows and onto the current Space without stealing
   keyboard focus (`showInactive`/`moveTop`-style behavior, guarded per platform).
3. A short chime plays for a new alert when sound is enabled. The chime uses a renderer audio
   source (no external asset, works on every OS) and respects the mute/sound setting. The pet
   does not loop or repeat the sound; one alert, one chime.
4. The OS-native notification remains best-effort: it is attempted on every alert, and a
   platform where it silently fails must not break the in-window alert. Native notifications
   are never the only channel.
5. The alert bubble is keyboard reachable and its dismiss control has an accessible label.
6. Sleeping and thinking remain non-alert moods: their bubbles are hover/focus only, as today.

## R4. State reconstruction on start

1. If the pet starts while one or more root turns are running, it shows `thinking` instead of
   `sleeping`.
2. The reconstructed state uses the most recently active root session and does not replay old
   history or old completed alerts.
3. Subagent sessions remain ignored.

## R5. Account balance warning

1. When the DeepSeek account service is available, the pet reads the Platform balance
   (`ctx.deepseekAccount.getBalance`) on start and periodically (5 minutes). It never blocks
   the host and never throws into event handling.
2. When the CNY balance is below the configured threshold (default ¥5), the pet enters a
   `low-balance` mood: hungry artwork, a bubble saying the balance is low with the actual
   amount, and the standard alert behavior from R3.
3. The warning is deduplicated: at most one alert per 24 hours while still low, and no alert
   at or above the threshold. A failed or unavailable balance query never produces a false
   alert.
4. "Usable balance" is the combined CNY total of the main wallet and bonus wallets (DeepSeek
   spends granted credit too). The threshold compares that total; both groups are shown in the
   settings tab.
5. Balance is displayed in the settings tab as `¥X.XX` when available, and as "unavailable"
   when signed out or failed.
6. The threshold is configurable from the settings tab (positive number, CNY) and is persisted
   in the config file.
7. No balance data is sent off the machine by the pet; it is only rendered locally.

## R6. Settings and agent tool

1. The settings tab keeps Start/Stop and Debug mode, and adds: current balance, threshold
   input, sound toggle, and a "Test notification" button.
2. Start/Stop reflects the persisted auto-start state; the copy makes clear that the pet
   returns automatically with the next DSH host.
3. `desktop_pet` tool actions keep existing behavior and gain:
   - `balance` — current balance, threshold, and last balance error.
   - `set-threshold` — `{ currency: 'CNY', amount: <positive number> }`.
   - `test-notification` — fires one completion alert.
4. The HTTP endpoint accepts an optional JSON `value` for actions that need one, still bounded
   (256 bytes) and still origin/auth validated.

## R7. Docs

README and the event table must describe: auto-start, persistent alerts, position memory,
low-balance behavior, the native-notification limitation per OS, and that balance stays local.

## Implementation seams (tests may rely on these)

- New module `src/config.cjs` exports `DEFAULT_CONFIG`, `loadConfig(options?)`, and
  `saveConfig(config, options?)`, where `options.file` overrides the default
  `~/.dsh-pet/pet.json`. Tests use a temp file, never the real home directory.
- `ManagedPet` accepts `configFile` in its constructor options; it loads the saved enabled
  state when `setEnabled`/`autoStart` runs and persists changes. `autoStart()` is a no-op when
  the saved state is not enabled. **When `configFile` is omitted, `ManagedPet` performs no disk
  I/O and keeps today's in-memory behavior**, so the existing protected tests stay valid.
- The host passes a saved position to the helper through the `DSH_PET_POSITION` environment
  variable as JSON `{ "x": number, "y": number }`. The helper validates it against
  `screen.getAllDisplays()` and falls back to bottom-right.
- The helper reports a finished drag to the host as a `pet:position` IPC message carrying
  `{ x, y }`; `ManagedPet` persists it.
- `pet.js` plays one chime for each newly rendered alert mood when sound is enabled; tests may
  stub `AudioContext`/`window.AudioContext`. Contract: every `pet:event` payload published by
  main carries `sound: boolean` (the effective setting, default true). `pet.js` chimes only
  when the state is an alert **and** `sound !== false`, and it must not throw when
  `AudioContext` is unavailable (the protected renderer test runs without it).
- `index.mjs` tracks running root turns in a small pure helper (exported for tests) so the
  resume state can be tested without a live Electron process.

## Balance and settings seams

- New module `src/balance.mjs` (ESM) exports:
  - `ALERT_INTERVAL_MS` = 24 hours.
  - `usableBalance(balance)` → `{ amount, cents, currency }` for the combined CNY
    main + bonus wallets, or `null` when the result is not `status:'ready'` or has no CNY
    wallet. Amounts are summed in integer cents to avoid float drift.
  - `formatBalance(amount, currency = 'CNY')` → `¥3.20` / `$1.00`.
  - `evaluateBalance({ balance, threshold, now, lastAlertAt, wasLow })` →
    `{ status, low, shouldAlert, amount, cents, currency, lastAlertAt, wasLow }`.
    `shouldAlert` is true only when low and either it was not low before or the last alert
    is at least 24 hours old; recovery resets `wasLow`. Unavailable/failed results never alert.
- New module `src/balance-watcher.mjs` exports
  `createBalanceWatcher({ account, config, onAlert, onState, now, intervalMs, schedule, cancel, client })`
  returning `{ start, stop, check, state, setThreshold }`. `check()` never throws; `start()`
  checks immediately and schedules a 5-minute interval; `stop()` cancels it. `client` defaults
  to `{ version: '0.2.0', locale: 'en', timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60 }`.
- New module `src/balance-host.mjs` exports `startBalance({ ctx, pet, config, now })` returning
  `{ state(), check(), setThreshold(threshold), stop() }`. It uses `ctx.inject?.(['deepseekAccount'], child => ...)`,
  sends `{ state: 'low-balance', eventId, title }` through `pet.send` on an alert, and stops
  the watcher on the child fiber's cleanup. With no `inject` or no service it reports
  `{ status: 'unavailable' }`.
- `ManagedPet` gains `setSound(enabled)`, `setBalanceThreshold(threshold)`, and a public
  `config` snapshot. These persist through the config file when `configFile` is set and send
  `{ type: 'pet:config', sound }` to a running helper.
- `src/main.cjs` accepts `{ type: 'pet:config', sound: boolean }` and uses the updated value
  for subsequent `pet:event` payloads. The context-menu "Mute notifications" toggles the same
  runtime sound value (session only).
- The HTTP endpoint accepts JSON `{ action, value }`, still capped at 256 bytes, and passes
  `value` to `operate`. `set-threshold` requires `value = { currency: 'CNY', amount: <positive> }`.
- Settings actions added: `balance`, `set-threshold`, `set-sound`, `test-notification`.
- `client.js` renders the live balance (`¥X.XX` or "unavailable"), a threshold number input,
  a sound checkbox, and a Test notification button, using the existing localized dictionaries.
  Control ids are `dsp-threshold`, `dsp-sound`, and `dsp-test-notification`, so behavior tests
  can find them without depending on layout. Dictionary keys added: `balance`, `threshold`,
  `sound`, `testNotification`, `balanceUnavailable`.

## Out of scope

- Session-specific deep links.
- Signed/notarized installers for each OS (document the path instead).
- Early context-window warnings (only the balance and max-tokens signals are required).
- New artwork.

## Testing rules

- Tests are authored by the test author only, verified RED against the current code, frozen
  with a content baseline, then implemented by a different agent.
- Existing tests are protected; they may only change with explicit user approval.
- Unit tests must not require a real Electron window; use the existing VM/EventEmitter harness
  patterns. Renderer behavior is tested by loading the actual files and inspecting behavior.
- The final suite must run with `npm test` and `node --check` on the entry points.
