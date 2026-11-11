const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const mainPath = path.resolve(__dirname, '../src/main.cjs');
const area = { x: 0, y: 25, width: 1440, height: 875 };

async function boot({ env = {} } = {}) {
  let win, menuTemplate;
  const app = new EventEmitter();
  app.whenReady = () => Promise.resolve();
  app.quit = () => {};
  class FakeNotification {
    static isSupported() { return false; }
    constructor() {}
    on() { return this; }
    show() {}
    close() {}
  }
  const ipcMain = new EventEmitter();
  const screen = {
    getPrimaryDisplay: () => ({ workArea: area }),
    getDisplayMatching: () => ({ workArea: area }),
    getAllDisplays: () => [{ workArea: area }],
  };
  class FakeWindow extends EventEmitter {
    constructor(options) {
      super();
      win = this;
      this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height };
      this.sent = [];
      this.webContents = new EventEmitter();
      this.webContents.setWindowOpenHandler = () => {};
      this.webContents.send = (channel, payload) => this.sent.push({ channel, payload });
    }
    setVisibleOnAllWorkspaces() {}
    async loadFile() {}
    getBounds() { return { ...this.bounds }; }
    setPosition(x, y) { Object.assign(this.bounds, { x, y }); }
    isDestroyed() { return false; }
    showInactive() {}
    moveTop() {}
    focus() {}
    show() {}
    setAlwaysOnTop() {}
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
    Menu: { buildFromTemplate: template => { menuTemplate = template; return { popup() {} }; } },
    Notification: FakeNotification,
    shell: { openExternal() {}, beep() {} },
    screen,
  };
  const localRequire = require('node:module').createRequire(mainPath);
  vm.runInNewContext(fs.readFileSync(mainPath, 'utf8'), {
    require: id => id === 'electron' ? electron : localRequire(id),
    __dirname: path.dirname(mainPath), process: processMock, URL,
    setTimeout, clearTimeout, console,
  }, { filename: mainPath });
  for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve));
  return { win, processMock, ipcMain, menu: () => menuTemplate };
}

const lastEvent = win => win.sent.filter(item => item.channel === 'pet:event').at(-1)?.payload;

test('the sound setting rides on every published event', async () => {
  const on = await boot({ env: { DSH_PET_SOUND: '1' } });
  on.processMock.emit('message', { type: 'pet:event', event: { state: 'done', eventId: 'a' } });
  assert.equal(lastEvent(on.win).sound, true);

  const off = await boot({ env: { DSH_PET_SOUND: '0' } });
  off.processMock.emit('message', { type: 'pet:event', event: { state: 'done', eventId: 'a' } });
  assert.equal(lastEvent(off.win).sound, false);
});

test('a pet:config sound update applies to later alerts', async () => {
  const { win, processMock } = await boot({ env: { DSH_PET_SOUND: '1' } });
  processMock.emit('message', { type: 'pet:config', sound: false });
  processMock.emit('message', { type: 'pet:event', event: { state: 'done', eventId: 'b' } });
  assert.equal(lastEvent(win).sound, false);
});

test('the context menu mute silences the chime flag', async () => {
  const { win, processMock, ipcMain, menu } = await boot({ env: { DSH_PET_SOUND: '1' } });
  ipcMain.emit('pet:menu');
  const template = menu();
  assert.ok(Array.isArray(template), 'context menu is built');
  const mute = template.find(item => item.label === 'Mute notifications');
  assert.ok(mute, 'menu keeps the mute control');
  mute.click({ checked: true });
  processMock.emit('message', { type: 'pet:event', event: { state: 'done', eventId: 'muted-1' } });
  assert.equal(lastEvent(win).sound, false);
});
