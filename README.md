# dsh-pet · 蓝色大肥鱼

![Tanking whale-girl companion](<assets/active/tanking.png>)

A sleepy blue whale desktop companion for **DeepSeek Harness (DSH)**. It keeps you company while your agent thinks, lets you know when a reply is ready, and nudges you when permission is needed.

Built with Electron, with bilingual English/Chinese settings and messages. The companion belongs to your running DSH Host—not to a browser tab or a separate service.

> Unofficial fan project, not affiliated with DeepSeek or OpenAI. Current artwork is user-supplied and generated with ChatGPT Image. See [artwork credits](<CREDITS.md>) for provenance and character-design attribution; no blanket license to underlying characters or trademarks is granted.

## What it does

- **Sleeps** when there is nothing to watch; hover or focus to see its idle bubble.
- **Thinks** while a root agent turn is running.
- **Notifies** when a reply is ready, a pending permission needs attention, or the pet itself has something to say.
- **Warns you before you run dry** when your DeepSeek account balance falls below the configurable threshold (¥5 by default), showing the actual amount.
- **Asks for rice** when a turn hits its token limit.
- **Shows an error** when a turn fails, rather than reporting success.
- **Moves with you:** drag the character to reposition it; the position is remembered for the next start. Right-click or use the hover menu for controls.
- **Stays with its Host:** closing a browser tab leaves it running; shutting down or unloading its owning Host stops it, and a pet you enabled comes back automatically with the next DSH host.

## Requirements

- Node.js **22 or newer** and npm.
- A graphical desktop session capable of running Electron.
- A DSH version with local bundles, the Plugin Manager, settings-page injection, and the session-event/Connection APIs used by this plugin.

Development and manual checks have been on macOS first. Windows and Linux are intended targets; OS-specific calls are guarded, but desktop behavior there has not been verified. This is a desktop companion, not a headless or SSH-terminal pet.

## Install

```sh
git clone https://github.com/AlanWYChen/dsh-pet.git
cd dsh-pet
npm ci
```

In DSH's **Plugin Manager**, install the cloned directory as a **local bundle**. Then open **Settings → Pet / 大肥鱼** and click **Start**. Click **Stop** to dismiss it. You can also ask the DSH agent to start or stop the desktop pet through its `desktop_pet` tool.

In **Settings → Plugins** the bundle is listed as `dsh-desktop-pet` with the whale-tail icon. Bundle installation is profile-wide, but each running Host owns its own helper and private IPC channel. The enabled state is written immediately to `~/.dsh-pet/pet.json` (mode 0600), so a pet you started **returns automatically with the next DSH host**. A first run with no saved state still starts **stopped** until you click Start. The window position is saved too, and a saved position that no longer touches a connected display falls back to the bottom-right corner.

### Everyday controls

| Action | Result |
| --- | --- |
| Drag the character | Move the desktop window; the new position is remembered |
| Hover or focus the character | Reveal the idle bubble |
| Right-click or open the hover menu | Mute notifications (chime and OS alerts) or open DSH |
| Click an alert bubble or native notification | Open the owning Host's GUI |
| Settings → Pet → Balance / threshold | See the live balance and change the low-balance warning amount (CNY) |
| Settings → Pet → Sound | Turn the alert chime on or off |
| Settings → Pet → Test notification | Fire one completion alert to check the whole alert path |
| Settings → Pet → Debug mode | Enable manual mood previews and a completion-notification test |

Debug mode defaults off and is remembered for the current Host lifetime. Native notifications depend on your OS permissions and Focus / Do Not Disturb settings. Notification clicks currently open the Host GUI, not a particular session.

## How activity maps to moods

| DSH event | Pet behavior |
| --- | --- |
| `turn/start` | Thinking |
| `turn/end`: `completed` | Reply-ready alert plus one chime and a best-effort OS notification |
| `turn/end`: `max-tokens` | Hungry alert |
| `turn/end`: `error` | Error alert |
| Aborted, blocked, interrupted, or forked turn | Rest |
| `approval/asked`, still pending after 500 ms | Permission artwork and native notification |
| `approval/decided`, turn end, or session disposal | Clear the matching permission alert |
| Balance below the configured threshold | `low-balance` alert with hungry artwork and the actual amount |
| Balance available again | Clear the warning; a later dip can alert again |

Pending permissions take display priority and are tracked independently. The short debounce suppresses most immediately resolved requests. Generic user questions are not treated as permission requests. Delegated subagents are ignored; parent escalation prompts can still notify.

Completion, error, hungry and low-balance alerts **stay visible until you dismiss them** (the × control or acknowledging them) or a newer event replaces them; they do not disappear on a timer. Permission alerts remain until resolved. Each new alert plays one short chime when sound is enabled and is shown on-screen, with a best-effort OS notification. Low-balance warnings are deduplicated: at most one alert per 24 hours while the balance stays low, and the warning clears when the balance recovers. **Thinking has no inactivity timeout:** another session becoming idle, stopping or being disposed cannot put a still-working session to sleep. Sleep is used when no tracked turn or permission remains. Old history is not replayed, and starting the pet mid-turn does not reconstruct already-pending activity.

Bubbles show one short line in a compact 210px-wide frame. Alert bubbles keep their secondary detail line visible without hover so the amount or reason is readable at a glance; sleeping and thinking bubbles stay hover/focus-only.

## Artwork folders

- [Active artwork](<assets/active/>): six user-supplied ChatGPT Image-generated PNGs, retained byte-for-byte at their native dimensions and transparency. Five serve the existing runtime moods; hungry is also used for errors. Tanking illustrates this README without adding a runtime state.
- [Manifest](<assets/manifest.json>): supplied filenames, source/output hashes, dimensions and uses.

Stale archive, reference and reserve images have been removed. See [credits](<CREDITS.md>) for provenance and character-design attribution.

## Privacy and process ownership

The plugin observes session events; it **never approves, rejects, or intercepts permission handling**.

Balance is read locally through DSH's DeepSeek account service and rendered only in the pet's Settings tab; the pet **never uploads or shares balance data**. The low-balance threshold, sound preference, enabled state and window position are stored in `~/.dsh-pet/pet.json` (mode 0600, written atomically). No balance information is sent off the machine.

Managed IPC carries only generic state and session/request/event identifiers—not prompts, answers, chat titles, tool arguments, commands, or approval reasons. It makes no runtime cloud or image-generation API requests.

Each Host manages its own Electron helper. Managed operation uses no shared loopback port, bridge file, or global single-instance lock. The helper exits when its owning Host disconnects, including after a Host crash.

## Development

```sh
npm test
node --check index.mjs
node --check client.js
```

The existing test suite covers event mapping, privacy boundaries, permissions, helper lifecycle, settings transport/localization, native-drag contracts, renderer startup, and delivery acknowledgements.

Automated checks cover exact supplied artwork bytes, manifest provenance, clean asset inventory, active renderer paths, compact bubbles and thinking persistence. The replacement artwork still needs a fresh user-visible Electron check. No GitHub Actions workflows are configured.

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
| [Host entry](<index.mjs>) | Settings/tool operations, event subscriptions, authenticated endpoint |
| [Client settings](<client.js>) | Localized Pet settings tab |
| [Event dispatcher](<dsh-plugin.mjs>) | Turn/permission mapping and debounce |
| [Helper controller](<src/managed-helper.mjs>) | Serialized lifecycle, readiness, shutdown, diagnostics |
| [Electron main process](<src/main.cjs>) | Native window, sandboxed renderer, desktop notifications |
| [Renderer](<src/pet.js>) | Mood artwork, messages, and interaction |
| [State machine](<src/state.cjs>) | Active sessions, alert priority, and deduplication |
| [Artwork credits](<CREDITS.md>) | Sources, attribution, and permission caveats |

## Known limitations

- No session-specific notification deep links or click-through transparent margins.
- Platform intent: macOS is verified first, while Windows and Linux are intended and OS-specific calls are guarded; full cross-platform appearance and behavior still need broader verification.
- The OS-native notification is best-effort. On macOS, a development build of Electron may not register as a notification sender, so the system banner can be missing; the in-window alert and chime remain the reliable channels.
- Fan prototype using user-supplied ChatGPT Image artwork. No blanket project-wide reuse license is granted here.
