const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const mainPath = path.resolve(__dirname, '../src/main.cjs');
const area = { x: 0, y: 25, width: 1440, height: 875 };
const defaultBounds = { x: area.width - 284, y: area.y + area.height - 290, width: 260, height: 270 };

async function boot({ env = {}, minimal = false } = {}) {
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

  class FakeNotification {
    static isSupported() { return true; }
    constructor(options) { this.options = options; this.handlers = {}; this.shown = false; FakeNotification.instances.push(this); }
    on(name, handler) { this.handlers[name] = handler; return this; }
    show() { this.shown = true; }
    close() { this.closed = true; }
  }
  FakeNotification.instances = [];

  const ipcMain = new EventEmitter();
  const shell = { openExternal() {}, beep() {} };
  const screen = {
    getPrimaryDisplay: () => ({ workArea: area }),
    getDisplayMatching: () => ({ workArea: area }),
  };
  if (!minimal) screen.getAllDisplays = () => [{ workArea: area }];

  class FakeWindow extends EventEmitter {
    constructor(options) {
      super();
      windows.push(this);
      this.options = options;
      this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height };
      this.sent = [];
      this.webContents = new EventEmitter();
      this.webContents.setWindowOpenHandler = () => {};
      this.webContents.send = (channel, payload) => this.sent.push({ channel, payload });
      this.showInactiveCalls = 0;
      this.moveTopCalls = 0;
      this.focusCalls = 0;
      this.showCalls = 0;
      this.alwaysOnTop = [];
    }
    setVisibleOnAllWorkspaces() {}
    async loadFile() {}
    getBounds() { return { ...this.bounds }; }
    setPosition(x, y) { Object.assign(this.bounds, { x, y }); }
    isDestroyed() { return false; }
  }
  if (!minimal) {
    Object.assign(FakeWindow.prototype, {
      showInactive() { this.showInactiveCalls++; },
      moveTop() { this.moveTopCalls++; },
      focus() { this.focusCalls++; },
      show() { this.showCalls++; },
      setAlwaysOnTop(...args) { this.alwaysOnTop.push(args); },
    });
  }

  const processMock = new EventEmitter();
  Object.assign(processMock, {
    env: { DSH_PET_MANAGED: '1', DSH_PET_URL: 'http://127.0.0.1:3080', ...env },
    connected: true,
    sent: [],
    send(message, callback) { processMock.sent.push(message); callback?.(null); },
  });

  const electron = {
    app, BrowserWindow: FakeWindow, ipcMain,
    Menu: { buildFromTemplate: () => ({ popup() {} }) },
    Notification: FakeNotification,
    shell, screen,
  };
  const localRequire = require('node:module').createRequire(mainPath);
  vm.runInNewContext(fs.readFileSync(mainPath, 'utf8'), {
    require: id => id === 'electron' ? electron : localRequire(id),
    __dirname: path.dirname(mainPath), process: processMock, URL,
    setTimeout: setTimeoutFake, clearTimeout: clearTimeoutFake, console,
  }, { filename: mainPath });
  for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve));
  const win = windows.at(-1);
  return { app, win, ipcMain, processMock, runTimers, Notification: FakeNotification, electron };
}

function lastPetEvent(win) {
  return win.sent.filter(item => item.channel === 'pet:event').at(-1)?.payload;
}

test('a completion alert raises the pet without focus, notifies, and stays until acknowledged', async () => {
  const { win, processMock, ipcMain, runTimers, Notification } = await boot();
  processMock.emit('message', { type: 'pet:event', event: { state: 'done', sessionId: 'chat', eventId: 'chat:1' } });
  const shown = lastPetEvent(win);
  assert.equal(shown.state, 'done');
  assert.equal(shown.sound, true, 'alerts carry the effective sound setting');
  assert.ok(win.showInactiveCalls >= 1, 'alert must surface the window');
  assert.ok(win.moveTopCalls >= 1, 'alert must rise above other windows');
  assert.equal(win.focusCalls, 0, 'alert must not steal keyboard focus');
  assert.equal(Notification.instances.length, 1);
  assert.equal(Notification.instances[0].shown, true);

  runTimers();
  assert.equal(lastPetEvent(win).state, 'done', 'a completion alert must not auto-sleep on a timer');

  ipcMain.emit('pet:ack');
  assert.equal(lastPetEvent(win).state, 'sleeping');
});

test('thinking is not an alert and does not raise the window', async () => {
  const { win, processMock } = await boot();
  const before = win.showInactiveCalls;
  processMock.emit('message', { type: 'pet:event', event: { state: 'thinking', sessionId: 'chat' } });
  assert.equal(lastPetEvent(win).state, 'thinking');
  assert.equal(win.showInactiveCalls, before);
});

test('a low-balance alert uses the same persistent alert machinery', async () => {
  const { win, processMock, runTimers, Notification } = await boot();
  processMock.emit('message', { type: 'pet:event', event: { state: 'low-balance', eventId: 'balance:1', title: '¥3.20' } });
  assert.equal(lastPetEvent(win).state, 'low-balance');
  assert.ok(win.showInactiveCalls >= 1);
  assert.equal(Notification.instances.length, 1);
  runTimers();
  assert.equal(lastPetEvent(win).state, 'low-balance');
});

test('a saved on-screen position is restored and an off-screen one falls back', async () => {
  const restored = await boot({ env: { DSH_PET_POSITION: JSON.stringify({ x: 100, y: 200 }) } });
  assert.deepEqual(restored.win.bounds, { x: 100, y: 200, width: 260, height: 270 });

  const offscreen = await boot({ env: { DSH_PET_POSITION: JSON.stringify({ x: -5000, y: -5000 }) } });
  assert.deepEqual(offscreen.win.bounds, defaultBounds);

  const malformed = await boot({ env: { DSH_PET_POSITION: 'not json' } });
  assert.deepEqual(malformed.win.bounds, defaultBounds);
});

test('a finished drag reports its position to the host', async () => {
  const { win, processMock, runTimers } = await boot();
  Object.assign(win.bounds, { x: 7, y: 8 });
  win.emit('moved');
  runTimers();
  assert.ok(processMock.sent.some(message => message.type === 'pet:position' && message.x === 7 && message.y === 8));
});

test('the oldest minimal Electron fake still boots and survives an alert', async () => {
  const { win, processMock } = await boot({ minimal: true });
  assert.ok(win, 'window still created');
  assert.doesNotThrow(() => processMock.emit('message', { type: 'pet:event', event: { state: 'done' } }));
  assert.equal(lastPetEvent(win).state, 'done');
});
