# dsh-desktop-pet · 蓝色大肥鱼

![Tanking whale-girl companion](<assets/active/tanking.png>)

A sleepy blue whale desktop companion for **DeepSeek Harness (DSH)**. It keeps you company while your agent thinks, lets you know when a reply is ready, and nudges you when permission is needed or your account balance runs low.

Built with Electron, with bilingual English/Chinese messages. The companion belongs to your running DSH Host — not to a browser tab or a separate service. The bundle registers as **`dsh-desktop-pet`**, appears in **Settings → Plugins** with the whale-tail icon, and adds a **Desktop Pet / 桌面宠物** settings tab.

> Status: v0.2.0. macOS is verified; Windows and Linux are intended targets and their OS-specific calls are guarded, but they still need a visual/behavioral pass.
>
> Unofficial fan project, not affiliated with DeepSeek or OpenAI. Current artwork is user-supplied and generated with ChatGPT Image. See [artwork credits](<CREDITS.md>) for provenance, icon provenance, and character-design attribution; no blanket license to underlying characters or trademarks is granted.

## What it does

- **Sleeps** when there is nothing to watch; hover or focus to see its idle bubble.
- **Thinks** while a root agent turn is running, including when the pet is started mid-turn.
- **Alerts** when a reply is ready, a permission is waiting, or a turn fails. Alerts stay visible until you dismiss them.
- **Warns you before you run dry** when your DeepSeek account balance falls below the configurable threshold (¥5 by default), showing the actual amount.
- **Asks for rice** when a turn hits its token limit.
- **Moves with you:** drag the character to reposition it; the position is remembered for the next start. On macOS the pet can be parked above the menu bar, and a drag that would leave it unreachable is pulled back into a display.
- **Stays with its Host:** closing a browser tab leaves it running; the pet you enabled comes back automatically with the next DSH host.

## Requirements

- Node.js **22 or newer** and npm.
- A graphical desktop session capable of running Electron.
- A DSH version with local bundles, the Plugin Manager, settings-page injection, and the session-event/Connection APIs used by this plugin.

This is a desktop companion, not a headless or SSH-terminal pet.

## Install

```sh
git clone https://github.com/AlanWYChen/dsh-pet.git
cd dsh-pet
npm ci
```

In DSH's **Plugin Manager**, install the cloned directory as a **local bundle**. Then open **Settings → Desktop Pet / 桌面宠物** and click **Start**. Click **Stop** to dismiss it. You can also ask the DSH agent to start or stop the pet through its `desktop_pet` tool.

Bundle installation is profile-wide, but each running Host owns its own helper and private IPC channel. The enabled state is written immediately to `~/.dsh-pet/pet.json` (mode 0600), so a pet you started **returns automatically with the next DSH host**. A first run with no saved state starts **stopped** until you click Start. The window position is saved too; a saved position that no longer touches a connected display falls back to the bottom-right corner. On macOS a saved position may sit above the menu bar.

### Everyday controls

| Action | Result |
| --- | --- |
| Drag the character | Move the desktop window (on macOS also above the menu bar); the new position is remembered |
| Hover or focus the character | Reveal the idle bubble |
| Right-click or open the hover menu | Mute notifications (chime and OS alerts) or open DSH |
| Click an alert bubble or native notification | Open the owning Host's GUI |
| Settings → Desktop Pet → Balance / threshold | See the live balance (requires a signed-in DeepSeek account) and change the low-balance warning amount (CNY) |
| Settings → Desktop Pet → Sound | Turn the alert chime on or off |
| Settings → Desktop Pet → Test notification | Fire one completion alert to check the whole alert path |
| Settings → Desktop Pet → Debug mode | Enable manual mood previews in the pet menu |

Debug mode defaults off and is remembered for the current Host lifetime. Native notifications depend on your OS permissions and Focus / Do Not Disturb settings. Notification clicks currently open the Host GUI, not a particular session.

## How activity maps to moods

| DSH event | Pet behavior |
| --- | --- |
| `turn/start` | Thinking |
| `turn/end`: `completed` | Reply-ready alert, one chime, and a best-effort OS notification |
| `turn/end`: `max-tokens` | Hungry alert |
| `turn/end`: `error` | Error alert |
| Aborted, blocked, interrupted, or forked turn | Rest |
| `approval/asked`, still pending after 500 ms | Permission artwork, on-screen alert, chime, and a best-effort OS notification |
| `approval/decided`, turn end, or session disposal | Clear the matching permission alert |
| Balance below the configured threshold | `low-balance` alert with hungry artwork and the actual amount |
| Balance available again | Future dips can alert again; dismiss the current alert or let a newer event replace it |

Pending permissions take display priority and are tracked independently. The short debounce suppresses most immediately resolved requests. Generic user questions are not treated as permission requests. Delegated subagents are ignored; parent escalation prompts can still notify.

Completion, error, hungry and low-balance alerts **stay visible until you dismiss them** (the × control or acknowledging them) or a newer event replaces them; they do not disappear on a timer. Permission alerts remain until resolved. Each new alert plays one short chime when sound is enabled and is shown on-screen, with a best-effort OS notification. Low-balance warnings are deduplicated: at most one alert per 24 hours while the balance stays low, and recovery re-arms a later dip. The current alert stays until you dismiss it or a newer event replaces it.

**Thinking has no inactivity timeout:** another session becoming idle, stopping or being disposed cannot put a still-working session to sleep. Sleep is used when no tracked turn or permission remains. Old history is not replayed. Starting the pet mid-turn reconstructs the running root turn as `thinking`; pending permission prompts are not replayed.

Bubbles show one short line in a compact 210px-wide frame. Alert bubbles keep their secondary detail line visible without hover so the amount or reason is readable at a glance; sleeping and thinking bubbles stay hover/focus-only.

## Artwork and icon

- [Active artwork](<assets/active/>): six user-supplied ChatGPT Image-generated PNGs, retained byte-for-byte at their native dimensions and transparency. Five serve runtime moods (sleeping, thinking, done, permission, and hungry — the last also covers errors and the balance warning); tanking illustrates this README without adding a runtime state.
- [Manifest](<assets/manifest.json>): supplied filenames, source/output hashes, dimensions and uses.
- [Plugin icon](icon.png): the bottom-right tail from a user-supplied four-variant sheet, background removed, recolored white, and scaled to 256×256.

Stale archive, reference and reserve images have been removed. See [credits](<CREDITS.md>) for provenance and character-design attribution.

## Privacy and process ownership

The plugin observes session events; it **never approves, rejects, or intercepts permission handling**.

Balance is read locally through DSH's DeepSeek account service and rendered only in the pet's Settings tab; the pet **never uploads or shares balance data**. The low-balance threshold, sound preference, enabled state and window position are stored in `~/.dsh-pet/pet.json` (mode 0600, written atomically). No balance information is sent off the machine.

Managed IPC carries only generic state and session/request/event identifiers — not prompts, answers, chat titles, tool arguments, commands, or approval reasons. It makes no runtime cloud or image-generation API requests.

Each Host manages its own Electron helper. Managed operation uses no shared loopback port, bridge file, or global single-instance lock. The helper exits when its owning Host disconnects, including after a Host crash.

## Development

```sh
npm test
node --check index.mjs
node --check client.js
node --check src/main.cjs
```

The test suite covers event mapping, privacy boundaries, permissions, helper lifecycle, settings transport/localization and actions, native-drag contracts, above-menu-bar placement and drag-end reachability, renderer startup, delivery acknowledgements, persistent auto-start and position, alert persistence, balance evaluation/watching, plugin metadata, and the agent tool schema.

Automated checks cover exact supplied artwork bytes, manifest provenance, clean asset inventory, active renderer paths, compact bubbles, thinking persistence, and the plugin icon metadata. The supplied artwork has been checked visually on macOS; a Windows/Linux visual pass remains outstanding. No GitHub Actions workflows are configured.

The test-freeze baselines from the v0.2.0 rebuild are kept in [docs/dev/tdd](<docs/dev/tdd/>); they are historical and are not runtime assets.

For standalone UI experiments only:

```sh
npm start
# In another terminal:
npm run demo
```

These are developer compatibility utilities, not the normal DSH installation path. Only standalone mode uses the legacy authenticated bridge at port `47831` and `~/.dsh-pet/bridge.json`. Keep its token private. Managed DSH mode does not read or write that file.

### Project layout

| Component | Purpose |
| --- | --- |
| [Host entry](<index.mjs>) | Settings/tool operations, event subscriptions, auto-start, authenticated endpoint |
| [Settings client](<client.js>) | Localized Desktop Pet settings tab, live balance, threshold, sound, and test notification |
| [Event mapping](<dsh-plugin.mjs>) | Turn/permission mapping and pending-approval debounce |
| [Helper controller](<src/managed-helper.mjs>) | Serialized lifecycle, readiness, persistence, shutdown, diagnostics |
| [Electron main](<src/main.cjs>) | Native window, sandboxed renderer, persistent alerts, chime flag, notifications |
| [Renderer](<src/pet.js>) | Mood artwork, messages, sound, and interaction |
| [State machine](<src/state.cjs>) | Active sessions, alert priority, and deduplication |
| [Configuration](<src/config.cjs>) | Atomic 0600 persistence for enabled state, position, sound, and threshold |
| [Turn tracker](<src/resume.mjs>) | Root-turn tracking for mid-turn resume |
| [Balance](<src/balance.mjs>) | Pure balance evaluation and threshold/dedupe logic |
| [Balance watcher](<src/balance-watcher.mjs>) | Five-minute account polling with injectable timing |
| [Balance host wiring](<src/balance-host.mjs>) | Optional `deepseekAccount` injection and low-balance alert delivery |
| [Tests](<test/>) | Unit, renderer, transport, persistence, balance, and metadata coverage |
| [Docs](<docs/>) | Behavior contract and TDD evidence |
| [Credits](<CREDITS.md>) | Artwork and icon provenance, permission caveats |

## Documentation

- [Behavior contract](<docs/behavior-contract.md>) — required behavior and test seams.
- [Test-freeze baselines](<docs/dev/tdd/>) — protected test hashes and approved revisions.
- [Changelog](<CHANGELOG.md>) — release history.
- [Credits](<CREDITS.md>) — artwork, icon, and character-design provenance.

## Known limitations

- No session-specific notification deep links or click-through transparent margins.
- The pet window is not click-through: on macOS, when the pet overlaps the menu bar, clicks inside its 260×270 pt rectangle go to the pet instead of the menu bar. Park it slightly lower if you need that part of the bar.
- The OS-native notification is best-effort. On macOS, a development build of Electron may not register as a notification sender, so the system banner can be missing; the in-window alert and chime remain the reliable channels.
- The pet's right-click / ··· menu is the OS-native menu, not an in-window DSH-styled menu.
- Balance comes from DSH's DeepSeek account session. If that session expires, sign in again under **Settings → Account**; the Desktop Pet tab shows “Sign in to DeepSeek” when it can tell the account is signed out.
- macOS is verified, while Windows and Linux are intended and OS-specific calls are guarded; full cross-platform appearance and behavior still need broader verification.
- Fan prototype using user-supplied ChatGPT Image artwork. No blanket project-wide reuse license is granted here.
