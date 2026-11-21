const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

// Increment 3 acceptance contract: the pet may live above the macOS menu bar.
//
// R1  BrowserWindow is created with enableLargerThanScreen: true.
// R2  The window is raised with setAlwaysOnTop(true, 'status') (level 25, above
//     NSMainMenuWindowLevel 24) right after creation, and alert raising must not
//     reset the level to 'floating' (3) with a bare setAlwaysOnTop(true).
// R3  Startup saved-position validation considers a display's FULL bounds (the
//     menu-bar strip included) and only falls back to workArea when a display
//     object exposes no bounds (older fakes).
// R4  The existing 250 ms debounced drag-end handler clamps the window back so at
//     least VISIBLE_MARGIN = 48 pt of width and height remain inside the display
//     whose bounds intersect the window most (no intersection -> primary).
// R5  Default/off-screen placement and the IPC surface do not change.
//
// The harness loads the real src/main.cjs inside vm.runInNewContext with a fake
// electron module, so these assertions observe behavior, not source text.

const mainPath = path.resolve(__dirname, '../src/main.cjs');
const WINDOW_WIDTH = 260;
const WINDOW_HEIGHT = 270;
const VISIBLE_MARGIN = 48;
const MENU_BAR_STRIP = { x: 0, y: 33, width: 1512, height: 869 };

// A realistic macOS display: full bounds include the menu-bar strip, workArea
// starts below it. Both are exposed so the full-bounds rule is actually exercised.
const DISPLAY = {
  bounds: { x: 0, y: 0, width: 1512, height: 982 },
  workArea: MENU_BAR_STRIP,
};
const SECONDARY = {
  bounds: { x: 1512, y: 0, width: 1440, height: 900 },
  workArea: { x: 1512, y: 25, width: 1440, height: 875 },
};
const DEFAULT_START = {
  x: DISPLAY.workArea.x + DISPLAY.workArea.width - WINDOW_WIDTH - 24,
  y: DISPLAY.workArea.y + DISPLAY.workArea.height - WINDOW_HEIGHT - 20,
  width: WINDOW_WIDTH,
  height: WINDOW_HEIGHT,
};

async function boot({ env = {}, displays = [DISPLAY], minimal = false, unmanaged = false } = {}) {
  const timers = new Map();
  let nextTimer = 1;
  const setTimeoutFake = (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; };
  const clearTimeoutFake = id => timers.delete(id);
  const runTimers = () => {
    const pending = [...timers.values()];
    timers.clear();
    for (const timer of pending) timer.fn();
  };

  const windows = [];
  const app = new EventEmitter();
  app.whenReady = () => Promise.resolve();
  app.quit = () => { app.quitCalled = true; };
  app.requestSingleInstanceLock = () => true;

  class FakeNotification {
    static isSupported() { return false; }
    constructor() {}
    on() { return this; }
    show() {}
    close() {}
  }

  const ipcMain = new EventEmitter();
  const shell = { openExternal() {}, beep() {} };
  const screen = {
    getPrimaryDisplay: () => displays[0],
    getDisplayMatching: () => displays[0],
    getAllDisplays: () => [...displays],
  };

  class FakeWindow extends EventEmitter {
    constructor(options) {
      super();
      windows.push(this);
      this.options = options;
      this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height };
      this.sent = [];
      this.alwaysOnTopCalls = [];
      this.setPositionCalls = [];
      this.webContents = new EventEmitter();
      this.webContents.setWindowOpenHandler = () => {};
      this.webContents.send = (channel, payload) => this.sent.push({ channel, payload });
    }
    setVisibleOnAllWorkspaces() {}
    async loadFile() {}
    getBounds() { return { ...this.bounds }; }
    isDestroyed() { return false; }
  }
  if (!minimal) {
    Object.assign(FakeWindow.prototype, {
      setPosition(x, y) { this.setPositionCalls.push([x, y]); Object.assign(this.bounds, { x, y }); },
      setAlwaysOnTop(...args) { this.alwaysOnTopCalls.push(args); },
      showInactive() {},
      moveTop() {},
      focus() {},
      show() {},
    });
  }

  const processMock = new EventEmitter();
  Object.assign(processMock, {
    env: unmanaged
      ? { DSH_PET_URL: 'http://127.0.0.1:3080', ...env }
      : { DSH_PET_MANAGED: '1', DSH_PET_URL: 'http://127.0.0.1:3080', ...env },
    connected: true,
    sent: [],
    send(message, callback) { processMock.sent.push(message); callback?.(null); },
  });

  // Unmanaged main.cjs writes its bridge config and starts the HTTP bridge; keep
  // both out of the test process so the unmanaged mode can still be exercised.
  const overrides = {};
  if (unmanaged) {
    overrides['node:fs'] = {
      mkdirSync() {},
      readFileSync() { return JSON.stringify({ token: 'a'.repeat(64) }); },
      writeFileSync() {},
      chmodSync() {},
    };
    overrides['./bridge.cjs'] = {
      createBridge() { const bridge = new EventEmitter(); bridge.close = () => {}; return bridge; },
    };
  }

  const electron = {
    app, BrowserWindow: FakeWindow, ipcMain,
    Menu: { buildFromTemplate: () => ({ popup() {} }) },
    Notification: FakeNotification,
    shell, screen,
  };
  const localRequire = require('node:module').createRequire(mainPath);
  vm.runInNewContext(fs.readFileSync(mainPath, 'utf8'), {
    require: id => id === 'electron' ? electron : (overrides[id] ?? localRequire(id)),
    __dirname: path.dirname(mainPath), process: processMock, URL,
    setTimeout: setTimeoutFake, clearTimeout: clearTimeoutFake, console,
  }, { filename: mainPath });
  for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve));
  return { app, win: windows.at(-1), windows, ipcMain, processMock, runTimers, electron, screen };
}

const lastPositionReport = processMock => processMock.sent.filter(message => message.type === 'pet:position').at(-1);
// The window level in effect after the last setAlwaysOnTop call. Electron's
// default level for a bare setAlwaysOnTop(true) is 'floating'.
const effectiveLevel = win => {
  const last = win.alwaysOnTopCalls.at(-1);
  return last ? (last[1] ?? 'floating') : null;
};

test('the pet window opts into living above the macOS menu bar', async () => {
  const { win } = await boot();
  assert.equal(win.options.enableLargerThanScreen, true,
    'a frameless macOS window needs enableLargerThanScreen: true to be placed above the menu bar');
});

test('the pet window is raised to the status level above the menu bar at startup', async () => {
  const { win } = await boot();
  assert.ok(win.alwaysOnTopCalls.some(call => call[0] === true && call[1] === 'status'),
    `startup must call setAlwaysOnTop(true, 'status') to beat NSMainMenuWindowLevel; saw ${JSON.stringify(win.alwaysOnTopCalls)}`);
  assert.equal(effectiveLevel(win), 'status',
    'the pet must end startup at the status level (25), not the default floating level (3)');
});

test('an alert keeps the status level instead of dropping the pet behind the menu bar', async () => {
  const { win, processMock } = await boot();
  processMock.emit('message', { type: 'pet:event', event: { state: 'done', sessionId: 'chat', eventId: 'chat:1' } });
  const last = win.alwaysOnTopCalls.at(-1);
  assert.ok(last, 'raising an alert must set the window level');
  assert.deepEqual(last.slice(0, 2), [true, 'status'],
    "raiseAlertWindow must call setAlwaysOnTop(true, 'status'); a bare setAlwaysOnTop(true) resets to floating (3) and puts the pet behind the menu bar");
  assert.equal(effectiveLevel(win), 'status', 'the effective window level after an alert must stay above the menu bar');
});

test('a saved position above the menu bar is restored verbatim', async () => {
  const above = await boot({ env: { DSH_PET_POSITION: JSON.stringify({ x: 300, y: -200 }) } });
  assert.deepEqual(above.win.bounds, { x: 300, y: -200, width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
    'y=-200 still leaves 70 pt inside the full 982 pt display, so it is a legitimate save and must not be replaced by the work-area fallback');

  const atTop = await boot({ env: { DSH_PET_POSITION: JSON.stringify({ x: 300, y: 0 }) } });
  assert.deepEqual(atTop.win.bounds, { x: 300, y: 0, width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
    'a saved y=0 position overlapping the menu-bar strip is restored as saved');
});

test('saved-position validation uses full bounds and falls back to workArea only when a display lacks bounds', async () => {
  const full = await boot({ env: { DSH_PET_POSITION: JSON.stringify({ x: 100, y: -200 }) } });
  assert.deepEqual(full.win.bounds, { x: 100, y: -200, width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
    'validation must accept visibility measured against the full display bounds, menu-bar strip included');

  const legacyDisplay = [{ workArea: { x: 0, y: 25, width: 1440, height: 875 } }];
  const restored = await boot({ displays: legacyDisplay, env: { DSH_PET_POSITION: JSON.stringify({ x: 100, y: 200 }) } });
  assert.deepEqual(restored.win.bounds, { x: 100, y: 200, width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
    'a display without bounds must still validate saved positions against its work area');

  const fallback = await boot({ displays: legacyDisplay, env: { DSH_PET_POSITION: JSON.stringify({ x: 100, y: -200 }) } });
  assert.deepEqual(fallback.win.bounds, { x: 1156, y: 610, width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
    'the work-area fallback still rejects a position that is only visible on the menu-bar strip');
});

test('a drag off every display is pulled back by the minimal margin and the corrected position is reported', async () => {
  const { win, processMock, runTimers } = await boot({ displays: [DISPLAY, SECONDARY] });
  Object.assign(win.bounds, { x: -1000, y: -1000 });
  win.emit('moved');
  assert.deepEqual(win.bounds, { x: -1000, y: -1000, width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
    'the reachability guard belongs to the debounced drag-end handler, not to every move tick');
  runTimers();
  assert.deepEqual(win.bounds, { x: -212, y: -222, width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
    'with no display intersection the primary display wins and the minimal clamp leaves exactly 48 pt visible on each axis');
  const report = lastPositionReport(processMock);
  assert.ok(report, 'the corrected drag-end position must be reported to the host');
  assert.equal(report.x, -212, 'the host must persist the corrected x, not the off-screen drag x');
  assert.equal(report.y, -222, 'the host must persist the corrected y, not the off-screen drag y');
});

test('exactly 48 pt of the pet visible after a drag is reachable and stays put', async () => {
  const { win, processMock, runTimers } = await boot();
  Object.assign(win.bounds, { x: 400, y: -222 });
  win.emit('moved');
  runTimers();
  assert.deepEqual(win.bounds, { x: 400, y: -222, width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
    'exactly VISIBLE_MARGIN (48 pt) of height is enough: no reposition is allowed');
  assert.equal(win.setPositionCalls.length, 0, 'a reachable position must not be moved at all');
  const report = lastPositionReport(processMock);
  assert.equal(report?.x, 400);
  assert.equal(report?.y, -222);
});

test('47 pt of the pet visible after a drag is clamped by the minimal margin', async () => {
  const { win, processMock, runTimers } = await boot();
  Object.assign(win.bounds, { x: 400, y: -223 });
  win.emit('moved');
  runTimers();
  assert.deepEqual(win.bounds, { x: 400, y: -222, width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
    'one point short of the margin must be pulled down by exactly one point');
  const report = lastPositionReport(processMock);
  assert.equal(report?.x, 400);
  assert.equal(report?.y, -222, 'the corrected position, not the raw drag position, is what the host receives');
});

test('a pet above the menu bar that is reachable on the full display is not pulled down', async () => {
  const { win, processMock, runTimers } = await boot();
  // 70 pt visible against the full bounds, but only 37 pt against the work area.
  Object.assign(win.bounds, { x: 400, y: -200 });
  win.emit('moved');
  runTimers();
  assert.deepEqual(win.bounds, { x: 400, y: -200, width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
    'reachability must be measured against full bounds: 70 pt is reachable even though workArea only sees 37 pt');
  assert.equal(lastPositionReport(processMock)?.y, -200);
});

test('the drag guard keeps a pet reachable through a second connected display', async () => {
  const { win, processMock, runTimers } = await boot({ displays: [DISPLAY, SECONDARY] });
  // 40 pt of width on the primary display, 220 pt on the secondary display.
  Object.assign(win.bounds, { x: 1472, y: 400 });
  win.emit('moved');
  runTimers();
  assert.deepEqual(win.bounds, { x: 1472, y: 400, width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
    'the pet is reachable on a connected display, so the guard must not relocate it');
  assert.equal(lastPositionReport(processMock)?.x, 1472);
});

test('the drag guard is a guarded no-op for the oldest minimal Electron window fake', async () => {
  const { win, processMock, runTimers } = await boot({ minimal: true });
  Object.assign(win.bounds, { x: -1000, y: -1000 });
  assert.doesNotThrow(() => win.emit('moved'));
  assert.doesNotThrow(() => runTimers(), 'missing setPosition/setAlwaysOnTop window APIs must never throw');
  assert.deepEqual(win.bounds, { x: -1000, y: -1000, width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
    'without a setPosition API the guard cannot move the window and must leave it alone');
  assert.equal(lastPositionReport(processMock)?.x, -1000, 'drag-end reporting still works for the minimal fake');
});

test('the drag guard is a guarded no-op when screen display APIs are missing', async () => {
  const { electron, win, runTimers } = await boot();
  delete electron.screen.getAllDisplays;
  delete electron.screen.getPrimaryDisplay;
  delete electron.screen.getDisplayMatching;
  Object.assign(win.bounds, { x: -1000, y: -1000 });
  win.emit('moved');
  assert.doesNotThrow(() => runTimers(), 'a missing screen API must not crash the drag-end handler');
  assert.deepEqual(win.bounds, { x: -1000, y: -1000, width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
    'without display information the guard is a no-op');
});

test('the drag guard also applies in unmanaged mode', async () => {
  const { win, runTimers } = await boot({ unmanaged: true });
  Object.assign(win.bounds, { x: -1000, y: -1000 });
  win.emit('moved');
  runTimers();
  assert.deepEqual(win.bounds, { x: -212, y: -222, width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
    'the reachability guard must not be managed-mode-only');
});

test('default placement, off-screen fallback, and the IPC surface are unchanged', async () => {
  const plain = await boot();
  assert.deepEqual(plain.win.bounds, DEFAULT_START,
    'with no saved position the pet still starts bottom-right inside the primary work area');

  const offscreen = await boot({ env: { DSH_PET_POSITION: JSON.stringify({ x: -5000, y: -5000 }) } });
  assert.deepEqual(offscreen.win.bounds, DEFAULT_START,
    'a saved position off every display still falls back to the bottom-right work-area start');

  assert.equal(plain.ipcMain.listenerCount('pet:drag'), 0, 'native dragging must not gain a custom IPC channel');
  assert.equal(plain.ipcMain.listenerCount('pet:home'), 0, 'obsolete parking IPC stays absent');
  for (const name of ['pet:menu', 'pet:open', 'pet:ack', 'pet:rendered'])
    assert.equal(plain.ipcMain.listenerCount(name), 1, `${name} stays available`);
});
