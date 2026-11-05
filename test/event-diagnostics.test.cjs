const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const plain = value => JSON.parse(JSON.stringify(value));

class Child extends EventEmitter {
  connected = true;
  exitCode = null;
  signalCode = null;
  stderr = { resume() {} };
  send(message, callback) {
    callback?.(null);
    if (message.type === 'shutdown') queueMicrotask(() => { this.connected = false; this.exitCode = 0; this.emit('exit', 0); });
  }
  kill() { this.connected = false; this.signalCode = 'SIGTERM'; this.emit('exit', null, 'SIGTERM'); }
}

test('helper diagnostics distinguish sent notifications from renderer acknowledgements without changing status', async t => {
  const { ManagedPet } = await import('../src/managed-helper.mjs');
  let child;
  const pet = new ManagedPet({ url: 'http://127.0.0.1:3080', spawn() { child = new Child(); queueMicrotask(() => child.emit('message', { type: 'ready' })); return child; } });
  t.after(() => pet.dispose());
  assert.equal(typeof pet.diagnostics, 'function', 'a separate diagnostic view is required to locate event delivery failure');
  assert.deepEqual(pet.diagnostics(), { lastState: null, sent: 0, received: 0 });
  assert.equal(pet.send({ state: 'thinking' }), false);
  await pet.setEnabled(true);
  assert.equal(pet.send({ state: 'thinking', title: 'PRIVATE_TITLE', sessionId: 'PRIVATE_SESSION' }), true);
  assert.deepEqual(pet.diagnostics(), { lastState: null, sent: 1, received: 0 }, 'IPC send is not proof of a rendered state');
  child.emit('message', { type: 'pet:state', state: 'thinking' });
  assert.deepEqual(pet.diagnostics(), { lastState: 'thinking', sent: 1, received: 1 });
  child.emit('message', { type: 'pet:state', state: 'not-a-mood', reason: 'PRIVATE_REASON' });
  child.emit('message', { type: 'other', state: 'done' });
  assert.deepEqual(pet.diagnostics(), { lastState: 'thinking', sent: 1, received: 1 }, 'only recognized renderer state acknowledgements count');
  assert.deepEqual(pet.status(), { enabled: true, running: true }, 'normal status remains backwards compatible');
  assert.ok(!JSON.stringify(pet.diagnostics()).includes('PRIVATE'));
});

test('Host inspect exposes observation versus helper delivery without session content', async () => {
  let tool, route;
  const handlers = new Map();
  class ManagedPet {
    status() { return { enabled: false, running: false }; }
    diagnostics() { return { lastState: null, sent: 0, received: 0 }; }
    send() { return false; }
    async dispose() {}
  }
  const { createPermissionDispatcher } = await import('../dsh-plugin.mjs');
  const source = fs.readFileSync(path.resolve(__dirname, '../index.mjs'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export const inject = /m, 'const inject = ').replace(/^export function apply\(/m, 'function apply(');
  const box = { ManagedPet, createPermissionDispatcher, Request, Response, URL, AbortSignal };
  vm.runInNewContext(`${source}\nthis.apply = apply;`, box);
  box.apply({
    webApp: { getAdvertisedUrl: () => 'http://127.0.0.1:3080' },
    on(name, handler) { handlers.set(name, handler); },
    effect(callback) { return callback(); },
    connection: { requestRejection: () => undefined, fetch: { register(value) { route = value; return () => {}; } } },
    tools: { register(value) { tool = value; return () => {}; } },
  });
  assert.ok(tool.parameters.properties.action.enum.includes('inspect'), 'agent must be able to retrieve delivery diagnostics');
  assert.deepEqual(plain(await tool.execute({ action: 'inspect' })), { enabled: false, running: false, lastObserved: null, lastState: null, sent: 0, received: 0 });
  const session = { id: 'PRIVATE_SESSION', header: {} };
  handlers.get('session/event')(session, { type: 'turn/start', seq: 1, data: { reason: 'PRIVATE_REASON' } });
  assert.deepEqual(plain(await tool.execute({ action: 'inspect' })), { enabled: false, running: false, lastObserved: 'thinking', lastState: null, sent: 0, received: 0 }, 'Host observation must remain visible even if helper is disabled');
  handlers.get('session/event')({ id: 'child', header: { origin: 'subagent' } }, { type: 'turn/end', seq: 2, data: { reason: { kind: 'completed' } } });
  assert.equal((await tool.execute({ action: 'inspect' })).lastObserved, 'thinking', 'ignored child turns must not replace root diagnostic');
  handlers.get('session/event')(session, { type: 'turn/end', seq: 3, data: { reason: { kind: 'completed' } } });
  const response = await route.fetch(new Request('http://dsh.internal/api/deepseek-pet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'inspect' }) }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { enabled: false, running: false, lastObserved: 'done', lastState: null, sent: 0, received: 0 });
});

test('renderer acknowledges only after applying the received mood to the character', () => {
  const nodes = Object.fromEntries(['pet', 'notification', 'character', 'eyebrow', 'message', 'detail', 'menu', 'bubble', 'ack'].map(id => [id, { dataset: {}, addEventListener() {}, contains: () => false }]));
  const ocean = { addEventListener() {}, matches: () => false };
  let onEvent;
  const acknowledgements = [];
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/pet.js'), 'utf8'), {
    document: { getElementById: id => nodes[id], querySelector: () => ocean, addEventListener() {}, activeElement: null },
    window: { pet: { onEvent(callback) { onEvent = callback; }, rendered(state) { acknowledgements.push({ state, characterState: nodes.pet.dataset.state, source: nodes.character.src }); } } },
  });
  onEvent({ state: 'thinking' });
  assert.equal(acknowledgements.length, 1, 'renderer must acknowledge the rendered mood instead of treating IPC delivery as rendering');
  assert.equal(acknowledgements[0].state, 'thinking');
  assert.equal(acknowledgements[0].characterState, 'thinking');
  assert.ok(acknowledgements[0].source.endsWith('active/thinking.png'));
  onEvent({ state: 'done' });
  assert.equal(acknowledgements[1].state, 'done');
});

test('main forwards only authorized valid renderer acknowledgements to its owning Host', async () => {
  const messages = [];
  let window;
  const app = new EventEmitter();
  app.whenReady = () => Promise.resolve(); app.quit = () => {};
  class FakeWindow extends EventEmitter {
    constructor() {
      super(); window = this;
      this.webContents = new EventEmitter();
      this.webContents.setWindowOpenHandler = () => {}; this.webContents.send = () => {};
    }
    setVisibleOnAllWorkspaces() {}
    async loadFile() {}
    isDestroyed() { return false; }
  }
  const processMock = new EventEmitter();
  Object.assign(processMock, { env: { DSH_PET_MANAGED: '1' }, connected: true, send(message, callback) { messages.push(message); callback?.(); } });
  const ipcMain = new EventEmitter();
  const main = path.resolve(__dirname, '../src/main.cjs');
  const localRequire = require('node:module').createRequire(main);
  const electron = { app, BrowserWindow: FakeWindow, ipcMain, Menu: { buildFromTemplate: () => ({ popup() {} }) }, Notification: { isSupported: () => false }, shell: { openExternal() {} }, screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } }) } };
  vm.runInNewContext(fs.readFileSync(main, 'utf8'), { require: id => id === 'electron' ? electron : localRequire(id), __dirname: path.dirname(main), process: processMock, URL, setTimeout, clearTimeout, console });
  await new Promise(resolve => setImmediate(resolve));
  messages.length = 0;
  ipcMain.emit('pet:rendered', { sender: window.webContents }, 'thinking');
  assert.deepEqual(plain(messages), [{ type: 'pet:state', state: 'thinking' }], 'ack must traverse actual main-process IPC to the owning Host');
  ipcMain.emit('pet:rendered', { sender: {} }, 'done');
  ipcMain.emit('pet:rendered', { sender: window.webContents }, 'not-a-mood');
  ipcMain.emit('pet:rendered', { sender: window.webContents }, { state: 'done', title: 'PRIVATE_TITLE' });
  assert.deepEqual(plain(messages), [{ type: 'pet:state', state: 'thinking' }], 'foreign senders, invalid states and object payloads must not enter diagnostics');
});

test('preload forwards renderer acknowledgement through a dedicated bounded state channel', () => {
  let exposed;
  const sent = [];
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/preload.cjs'), 'utf8'), {
    require: () => ({ contextBridge: { exposeInMainWorld(_name, value) { exposed = value; } }, ipcRenderer: { on() {}, send(...args) { sent.push(args); } } }),
  });
  assert.equal(typeof exposed.rendered, 'function', 'preload must expose renderer acknowledgement');
  exposed.rendered('thinking');
  assert.deepEqual(plain(sent), [['pet:rendered', 'thinking']]);
});
