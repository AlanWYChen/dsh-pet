# dsh-pet · 蓝色大肥鱼

![dsh-pet sleeping on the desktop, with an “OFF DUTY” notification bubble](<docs/desktop-pet.webp>)

A sleepy blue whale desktop companion for **DeepSeek Harness (DSH)**. It keeps you company while your agent thinks, lets you know when a reply is ready, and nudges you when permission is needed.

Built with Electron, with bilingual English/Chinese settings and messages. The companion belongs to your running DSH Host—not to a browser tab or a separate service.

> Unofficial fan project, not affiliated with DeepSeek or OpenAI. Artwork includes third-party and user-supplied images with differing or unverified permissions. See [artwork credits and restrictions](<CREDITS.md>) before redistributing or using commercially. Public availability is not a blanket license to reuse the artwork.

## What it does

- **Sleeps** when there is nothing to watch; hover or focus to see its idle bubble.
- **Thinks** while a root agent turn is running.
- **Notifies** when a reply is ready or a pending permission needs attention.
- **Asks for rice** when a turn hits its token limit—not when your account balance runs low.
- **Shows an error** when a turn fails, rather than reporting success.
- **Moves with you:** drag the character to reposition it; right-click or use the hover menu for controls.
- **Stays with its Host:** closing a browser tab leaves it running; shutting down or unloading its owning Host stops it.

## Requirements

- Node.js **22 or newer** and npm.
- A graphical desktop session capable of running Electron.
- A DSH version with local bundles, the Plugin Manager, settings-page injection, and the session-event/Connection APIs used by this plugin.

Development and manual checks have been on macOS. Windows and Linux desktop behavior has not been verified. This is a desktop companion, not a headless or SSH-terminal pet.

## Install

```sh
git clone https://github.com/AlanWYChen/dsh-pet.git
cd dsh-pet
npm ci
```

In DSH's **Plugin Manager**, install the cloned directory as a **local bundle**. Then open **Settings → Pet / 大肥鱼** and click **Start**. Click **Stop** to dismiss it. You can also ask the DSH agent to start or stop the desktop pet through its `desktop_pet` tool.

Bundle installation is profile-wide, but each running Host owns its own helper and private IPC channel. The enabled state starts **off after a Host restart**; automatic startup is not currently persisted.

### Everyday controls

| Action | Result |
| --- | --- |
| Drag the character | Move the desktop window |
| Hover or focus the character | Reveal the idle bubble |
| Right-click or open the hover menu | Mute notifications or open DSH |
| Click an alert bubble or native notification | Open the owning Host's GUI |
| Settings → Pet → Debug mode | Enable manual mood previews and a completion-notification test |

Debug mode defaults off and is remembered for the current Host lifetime. Native notifications depend on your OS permissions and Focus / Do Not Disturb settings. Notification clicks currently open the Host GUI, not a particular session.

## How activity maps to moods

| DSH event | Pet behavior |
| --- | --- |
| `turn/start` | Thinking |
| `turn/end`: `completed` | Reply-ready bubble and native notification |
| `turn/end`: `max-tokens` | Hungry |
| `turn/end`: `error` | Error alert |
| Aborted, blocked, interrupted, or forked turn | Rest |
| `approval/asked`, still pending after 500 ms | Permission artwork and native notification |
| `approval/decided`, turn end, or session disposal | Clear the matching permission alert |

Pending permissions take display priority and are tracked independently. The short debounce suppresses most immediately resolved requests. Generic user questions are not treated as permission requests. Delegated subagents are ignored; parent escalation prompts can still notify.

Completion, error, and hungry alerts rest after 16 seconds. Permission alerts remain until resolved. Old history is not replayed, and starting the pet mid-turn does not reconstruct already-pending activity.

## Privacy and process ownership

The plugin observes session events; it **never approves, rejects, or intercepts permission handling**.

Managed IPC carries only generic state and session/request/event identifiers—not prompts, answers, chat titles, tool arguments, commands, or approval reasons. It makes no runtime cloud or image-generation API requests.

Each Host manages its own Electron helper. Managed operation uses no shared loopback port, bridge file, or global single-instance lock. The helper exits when its owning Host disconnects, including after a Host crash.

## Development

```sh
npm test
node --check index.mjs
node --check client.js
```

The existing test suite covers event mapping, privacy boundaries, permissions, helper lifecycle, settings transport/localization, native-drag contracts, renderer startup, and delivery acknowledgements.

**Current verification:** 53 of 55 automated tests pass. Two renderer tests still assert legacy `active/thinking.png` / `active/complete.png` artwork paths, while the renderer uses the current reference-image filenames. These failures are retained transparently; neither tests nor implementation were changed for publication. Both JavaScript entry-point syntax checks pass. No GitHub Actions workflows are configured.

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

- No persistent startup preference or saved window position.
- No session-specific notification deep links or click-through transparent margins.
- OS-native notification delivery and full cross-platform appearance still need broader verification.
- Personal/non-commercial prototype with unresolved permissions for some included artwork. No blanket project-wide reuse license is granted here.
