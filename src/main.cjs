const { app, BrowserWindow, ipcMain, Menu, Notification, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { createBridge } = require('./bridge.cjs');
const { PetState } = require('./state.cjs');
const managed = process.env.DSH_PET_MANAGED === '1';
// Mutable: the Host may update the effective sound setting at runtime through a
// pet:config message, and the context menu can mute or unmute notifications.
let soundEnabled = process.env.DSH_PET_SOUND !== '0';
const WINDOW_WIDTH = 260;
const WINDOW_HEIGHT = 270;
const WINDOW_MARGIN_X = 24;
const WINDOW_MARGIN_Y = 20;
const VISIBLE_MARGIN = 48;
const ALERT_STATES = new Set(['done', 'permission', 'error', 'hungry', 'low-balance']);
const RENDERED_STATES = ['sleeping', 'thinking', 'done', 'permission', 'hungry', 'error', 'low-balance'];
const dshUrl = (() => {
  try {
    const url = new URL(process.env.DSH_PET_URL || 'http://127.0.0.1:3080');
    if (['http:', 'https:'].includes(url.protocol)) return url.href;
  } catch {}
  return 'http://127.0.0.1:3080';
})();
let win, bridge, positionTimer;
let debugMode = process.env.DSH_PET_DEBUG === '1';
if (managed) {
  process.on('disconnect', () => app.quit());
  process.on('message', message => {
    if (message?.type === 'shutdown') app.quit();
    else if (message?.type === 'pet:event') receive(message.event);
    else if (message?.type === 'pet:config') {
      if (typeof message.debugMode === 'boolean') debugMode = message.debugMode;
      if (typeof message.sound === 'boolean') soundEnabled = message.sound;
    }
  });
}
let muted = false;
const permissionNotifications = new Map();
const state = new PetState();
const configDir = path.join(os.homedir(), '.dsh-pet');
const configPath = path.join(configDir, 'bridge.json');

// A saved position is honoured only while a meaningful part of the window still
// overlaps a connected display. Placement measures against the display's full
// bounds (the macOS menu-bar strip included) so a pet may legitimately live above
// the menu bar; display objects that expose no bounds fall back to their work area.
function savedPosition() {
  const raw = process.env.DSH_PET_POSITION;
  if (typeof raw !== 'string' || !raw) return null;
  let value;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== 'object') return null;
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
  return { x: Math.round(value.x), y: Math.round(value.y) };
}
function displayAreas() {
  const areas = [];
  try {
    const displays = screen.getAllDisplays?.();
    if (Array.isArray(displays)) {
      for (const display of displays) {
        const area = display?.bounds ?? display?.workArea;
        if (area) areas.push(area);
      }
    }
  } catch {}
  if (!areas.length) {
    try {
      const primary = screen.getPrimaryDisplay?.();
      const area = primary?.bounds ?? primary?.workArea;
      if (area) areas.push(area);
    } catch {}
  }
  return areas;
}
// How much of the pet window, placed at `position`, overlaps one display rect.
// Negative values mean the window sits entirely outside that rect on the axis.
function overlap(position, area) {
  return {
    horizontal: Math.min(position.x + WINDOW_WIDTH, area.x + area.width) - Math.max(position.x, area.x),
    vertical: Math.min(position.y + WINDOW_HEIGHT, area.y + area.height) - Math.max(position.y, area.y),
  };
}
function visibleOnDisplay(position) {
  return displayAreas().some(area => {
    const { horizontal, vertical } = overlap(position, area);
    return horizontal >= VISIBLE_MARGIN && vertical >= VISIBLE_MARGIN;
  });
}
function startPosition(area) {
  const fallback = {
    x: area.x + area.width - WINDOW_WIDTH - WINDOW_MARGIN_X,
    y: area.y + area.height - WINDOW_HEIGHT - WINDOW_MARGIN_Y,
  };
  const saved = savedPosition();
  return saved && visibleOnDisplay(saved) ? saved : fallback;
}
// The minimal shift that leaves exactly VISIBLE_MARGIN pt of `size` inside the
// display span [start, start + extent]: either the window pokes out on the near
// side (move it in from the left/top) or on the far side (move it in from the
// right/bottom). Existing overlap is preserved on the other axis.
function clampAxis(value, size, start, extent) {
  if (value < start) return start - size + VISIBLE_MARGIN;
  return start + extent - VISIBLE_MARGIN;
}
// Drag-end reachability guard. The pet may be dragged above the menu bar, but at
// least VISIBLE_MARGIN pt of width and height must remain inside the display whose
// bounds it intersects most (the primary display when it intersects none). Fewer
// than that is corrected with the smallest possible move. Exactly VISIBLE_MARGIN
// is allowed, and an already-reachable window is never moved. This runs only from
// the debounced drag-end handler so it cannot fight an in-progress drag.
function keepWindowReachable() {
  if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) return;
  let bounds;
  try { bounds = win.getBounds?.(); } catch {}
  if (!bounds || !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) return;
  const areas = displayAreas();
  if (!areas.length) return;
  let target = areas[0];
  let strongest = 0;
  for (const area of areas) {
    const { horizontal, vertical } = overlap(bounds, area);
    if (horizontal <= 0 || vertical <= 0) continue;
    const shared = horizontal * vertical;
    if (shared > strongest) { strongest = shared; target = area; }
  }
  if (strongest === 0) {
    try {
      const primary = screen.getPrimaryDisplay?.();
      const area = primary?.bounds ?? primary?.workArea;
      if (area) target = area;
    } catch {}
  }
  const { horizontal, vertical } = overlap(bounds, target);
  if (horizontal >= VISIBLE_MARGIN && vertical >= VISIBLE_MARGIN) return;
  const next = { x: bounds.x, y: bounds.y };
  if (horizontal < VISIBLE_MARGIN) next.x = clampAxis(bounds.x, WINDOW_WIDTH, target.x, target.width);
  if (vertical < VISIBLE_MARGIN) next.y = clampAxis(bounds.y, WINDOW_HEIGHT, target.y, target.height);
  if (next.x === bounds.x && next.y === bounds.y) return;
  try { win.setPosition?.(next.x, next.y); } catch {}
}
function reportPosition() {
  if (!managed || !win || win.isDestroyed?.() || !process.connected || typeof process.send !== 'function') return;
  let bounds;
  try { bounds = win.getBounds?.(); } catch {}
  if (!bounds || !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) return;
  try {
    process.send({ type: 'pet:position', x: Math.round(bounds.x), y: Math.round(bounds.y) }, () => {});
  } catch {}
}
// One debounced report per finished drag; a burst of native move events cannot
// corrupt the persisted config. The reachability guard runs here (and in every
// mode, not only the managed one) so the corrected position is what gets reported
// and persisted when a drag parks the pet off every display.
function handleDragEnd() {
  keepWindowReachable();
  reportPosition();
}
function schedulePositionReport() {
  clearTimeout(positionTimer);
  positionTimer = setTimeout(handleDragEnd, 250);
}

function publish(event) {
  if (win && !win.isDestroyed()) win.webContents.send('pet:event', { ...event, sound: soundEnabled });
}
function raiseAlertWindow() {
  if (!win || win.isDestroyed?.()) return;
  // Surface without stealing keyboard focus; every call is optional for the
  // oldest minimal Electron fakes and for non-macOS windowing. The explicit
  // 'status' level (25) keeps alerts above the macOS menu bar; a bare
  // setAlwaysOnTop(true) would downgrade to 'floating' (3) behind it.
  try { win.setAlwaysOnTop?.(true, 'status'); } catch {}
  try { win.showInactive?.(); } catch {}
  try { win.moveTop?.(); } catch {}
}
const NOTIFICATION_COPY = {
  done: { title: '蓝色大肥鱼 · Reply ready', body: 'Your DSH chat has finished responding.' },
  permission: { title: '蓝色大肥鱼 · Permission needed', body: 'A running session needs your approval. Open DSH to review.' },
  error: { title: '蓝色大肥鱼 · Something went wrong', body: 'Your chat stopped. Open DSH to check.' },
  hungry: { title: '蓝色大肥鱼 · Token limit reached', body: 'This turn reached its token limit.' },
  'low-balance': { title: '蓝色大肥鱼 · Low balance', body: 'Your DeepSeek balance is low. Open DSH to top up.' },
};
// Best-effort OS channel, attempted on every alert. The in-window bubble never
// depends on it working.
function notifyAlert(event) {
  if (muted) return;
  if (!Notification || typeof Notification.isSupported !== 'function' || !Notification.isSupported()) return;
  const copy = NOTIFICATION_COPY[event.state];
  if (!copy) return;
  try {
    const body = event.state === 'low-balance' && event.title
      ? `Current balance: ${event.title}. Open DSH to top up.`
      : (event.title && event.state === 'done' ? event.title : copy.body);
    const notification = new Notification({ title: copy.title, body, silent: false });
    notification.on('click', () => shell.openExternal(dshUrl));
    if (event.state === 'permission') {
      permissionNotifications.set(JSON.stringify([event.sessionId, event.requestId]), {
        notification, sessionId: event.sessionId, requestId: event.requestId,
      });
    }
    notification.show();
  } catch {}
}
function receive(input) {
  let event;
  try { event = state.accept(input); } catch { return; }
  if (!event) return;
  for (const [key, entry] of permissionNotifications) {
    if (entry.sessionId !== event.sessionId) continue;
    if ((event.state === 'permission-resolved' && entry.requestId === event.requestId)
        || ['done', 'sleeping', 'error', 'hungry', 'low-balance'].includes(event.state)) {
      try { entry.notification.close(); } catch {}
      permissionNotifications.delete(key);
    }
  }
  publish(state.current);
  if (ALERT_STATES.has(event.state)) {
    raiseAlertWindow();
    notifyAlert(event);
  }
}
if ((managed && (!process.send || !process.connected)) || (!managed && !app.requestSingleInstanceLock())) app.quit();
else {
  if (!managed) app.on('second-instance', () => win?.show());
  app.whenReady().then(async () => {
    if (managed && !process.connected) { app.quit(); return; }
    let token;
    if (!managed) {
    fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    try { token = JSON.parse(fs.readFileSync(configPath, 'utf8')).token; } catch {}
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) token = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(configPath, JSON.stringify({ port: 47831, token }), { mode: 0o600 });
    fs.chmodSync(configPath, 0o600);
    }
    const area = screen.getPrimaryDisplay().workArea;
    const start = startPosition(area);
    win = new BrowserWindow({ width: WINDOW_WIDTH, height: WINDOW_HEIGHT, x: start.x, y: start.y,
      frame: false, transparent: true, resizable: false, alwaysOnTop: true, hasShadow: false,
      // macOS: without this Electron's constrainFrameRect keeps a frameless window
      // inside the work area, so the pet could not be placed above the menu bar.
      enableLargerThanScreen: true,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    // Drop the window at the 'status' level (25) so it floats above the menu bar
    // (NSMainMenuWindowLevel is 24). Guarded for minimal Electron window fakes.
    try { win.setAlwaysOnTop?.(true, 'status'); } catch {}
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    if (typeof win.on === 'function') {
      win.on('moved', schedulePositionReport);
      win.on('move', schedulePositionReport);
    }
    ipcMain.on('pet:rendered', (event, renderedState) => {
      if (!managed || event.sender !== win.webContents || win.isDestroyed() || !process.connected
          || !RENDERED_STATES.includes(renderedState)) return;
      process.send({ type: 'pet:state', state: renderedState }, error => { if (error) app.quit(); });
    });
    win.webContents.on('did-finish-load', () => { publish(state.current); reportPosition(); });
    await win.loadFile(path.join(__dirname, 'pet.html'));
    if (managed) {
      if (!process.connected) { app.quit(); return; }
      process.send({ type: 'ready' }, error => { if (error) app.quit(); });
    } else {
      bridge = createBridge({ token, onEvent: receive });
      bridge.on('error', error => { publish({ state: 'error', title: `Bridge unavailable: ${error.code}` }); });
    }
    ipcMain.on('pet:menu', () => Menu.buildFromTemplate([
      { label: '蓝色大肥鱼 · DeepSeek Pet', enabled: false },
      { label: 'Open DSH', click: () => shell.openExternal(dshUrl) },
      { type: 'separator' },
      ...(debugMode ? [
        { label: 'Try completion notification', click: () => { if (debugMode) receive({ state: 'done', title: 'Your reply is ready. Come take a look!' }); } },
        ...['sleeping', 'thinking', 'hungry'].map(s => ({ label: `Preview ${s}`, click: () => { if (debugMode) receive({ state: s, sessionId: 'preview' }); } })),
      ] : []),
      { label: 'Mute notifications', type: 'checkbox', checked: muted || !soundEnabled, click: item => { muted = item.checked === true; soundEnabled = !muted; } },
      { type: 'separator' }, { label: 'Quit pet', click: () => app.quit() }
    ]).popup({ window: win }));
    ipcMain.on('pet:open', () => shell.openExternal(dshUrl));
    // Alerts persist until acknowledged or replaced; there is deliberately no
    // inactivity timer that could hide a notification after 16 seconds.
    ipcMain.on('pet:ack', () => publish(state.idle()));
  }).catch(() => app.quit());
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { clearTimeout(positionTimer); bridge?.close(); });
}
