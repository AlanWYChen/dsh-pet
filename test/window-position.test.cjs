const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

// Authorized contract replacement: native dragging replaces custom parking IPC.
async function boot() {
  let window;
  const area = { x: 0, y: 25, width: 1440, height: 875 };
  const app = new EventEmitter();
  app.whenReady = () => Promise.resolve(); app.quit = () => {};
  class FakeWindow extends EventEmitter {
    constructor(options) {
      super(); window = this; this.options = options;
      this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height };
      this.webContents = new EventEmitter();
      this.webContents.setWindowOpenHandler = () => {}; this.webContents.send = () => {};
    }
    setVisibleOnAllWorkspaces() {}
    async loadFile() {}
    getBounds() { return { ...this.bounds }; }
    setPosition(x, y) { Object.assign(this.bounds, { x, y }); }
    isDestroyed() { return false; }
  }
  const processMock = new EventEmitter();
  Object.assign(processMock, { env: { DSH_PET_MANAGED: '1' }, connected: true, send() {} });
  const ipcMain = new EventEmitter();
  const electron = {
    app, BrowserWindow: FakeWindow, ipcMain,
    Menu: { buildFromTemplate: () => ({ popup() {} }) },
    Notification: { isSupported: () => false }, shell: { openExternal() {} },
    screen: { getPrimaryDisplay: () => ({ workArea: area }), getDisplayMatching: () => ({ workArea: area }) },
  };
  const main = path.resolve(__dirname, '../src/main.cjs');
  const localRequire = require('node:module').createRequire(main);
  vm.runInNewContext(fs.readFileSync(main, 'utf8'), {
    require: id => id === 'electron' ? electron : localRequire(id),
    __dirname: path.dirname(main), process: processMock, URL, setTimeout, clearTimeout, console,
  }, { filename: main });
  await new Promise(resolve => setImmediate(resolve));
  return { window, area, ipcMain };
}

test('pet still starts compact at primary work-area bottom right', async () => {
  const { window, area } = await boot();
  assert.deepEqual(window.getBounds(), { x: area.x + area.width - 260 - 24, y: area.y + area.height - 270 - 20, width: 260, height: 270 });
});

test('main no longer registers custom home or pointer-drag IPC', async () => {
  const { ipcMain } = await boot();
  assert.equal(ipcMain.listenerCount('pet:home'), 0, 'obsolete double-click parking must be removed');
  assert.equal(ipcMain.listenerCount('pet:drag'), 0, 'native dragging must not have a custom movement channel');
  for (const name of ['pet:menu', 'pet:open', 'pet:ack']) assert.equal(ipcMain.listenerCount(name), 1, `${name} remains available`);
});

test('preload exposes only pet interaction APIs, not home or drag', () => {
  let exposed; const sent = [];
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/preload.cjs'), 'utf8'), {
    require: () => ({ contextBridge: { exposeInMainWorld: (_name, value) => { exposed = value; } }, ipcRenderer: { on() {}, send: (...args) => sent.push(args) } }),
  });
  assert.equal(exposed.home, undefined, 'no obsolete parking API');
  assert.equal(exposed.drag, undefined, 'no custom drag API');
  for (const name of ['onEvent', 'menu', 'open', 'acknowledge']) assert.equal(typeof exposed[name], 'function');
  exposed.menu(); exposed.open(); exposed.acknowledge();
  assert.deepEqual(sent, [['pet:menu'], ['pet:open'], ['pet:ack']]);
});
