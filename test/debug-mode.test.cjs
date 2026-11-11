const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const plain = value => JSON.parse(JSON.stringify(value));

// Execute actual Electron entry; only native boundaries are substituted.
async function menuHost(debugAtLaunch = false) {
  let window, items;
  const events = [];
  const app = new EventEmitter();
  app.whenReady = () => Promise.resolve(); app.quit = () => {};
  class Window extends EventEmitter {
    constructor() { super(); window = this; this.webContents = new EventEmitter(); this.webContents.setWindowOpenHandler = () => {}; this.webContents.send = (_name, event) => events.push(event); }
    setVisibleOnAllWorkspaces() {} async loadFile() {} isDestroyed() { return false; }
  }
  const processMock = new EventEmitter();
  Object.assign(processMock, { env: { DSH_PET_MANAGED: '1', DSH_PET_DEBUG: debugAtLaunch ? '1' : '0' }, connected: true, send(_message, callback) { callback?.(); } });
  const ipcMain = new EventEmitter();
  const electron = { app, BrowserWindow: Window, ipcMain,
    Menu: { buildFromTemplate(value) { items = value; return { popup() {} }; } },
    Notification: { isSupported: () => false }, shell: { openExternal() {} },
    screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 25, width: 1440, height: 875 } }) },
  };
  const main = path.resolve(__dirname, '../src/main.cjs');
  const localRequire = require('node:module').createRequire(main);
  vm.runInNewContext(fs.readFileSync(main, 'utf8'), {
    require: id => id === 'electron' ? electron : localRequire(id), __dirname: path.dirname(main), process: processMock, URL,
    setTimeout: () => 1, clearTimeout() {}, console,
  }, { filename: main });
  await new Promise(resolve => setImmediate(resolve));
  return { events, config(debugMode) { processMock.emit('message', { type: 'pet:config', debugMode }); }, menu() { ipcMain.emit('pet:menu', { sender: window.webContents }); return items; } };
}
const labels = items => items.map(item => item.label || '');
const debugItems = items => items.filter(item => /^(?:Preview |Try completion notification)/i.test(item.label || ''));

test('normal pet menu has no artwork link or debug previews and preserves ordinary controls', async () => {
  const host = await menuHost(), items = host.menu();
  assert.ok(!labels(items).some(label => /artworks?|credits/i.test(label)), 'Artwork & credits is removed entirely');
  assert.equal(debugItems(items).length, 0, 'preview and completion-test actions are hidden by default');
  for (const label of ['Open DSH', 'Mute notifications', 'Quit pet']) assert.ok(labels(items).includes(label));
});

test('debug setting gates preview and completion actions live, including stale open menu callbacks', async () => {
  const host = await menuHost();
  host.config(true);
  const debug = host.menu();
  assert.ok(labels(debug).includes('Try completion notification'));
  for (const state of ['sleeping', 'thinking', 'hungry']) assert.ok(labels(debug).includes(`Preview ${state}`));
  assert.ok(!labels(debug).some(label => /artworks?|credits/i.test(label)), 'credits do not return in debug mode');
  const preview = debug.find(item => item.label === 'Preview thinking');
  preview.click();
  assert.equal(host.events.at(-1).state, 'thinking', 'enabled preview actually updates the pet');
  host.config(false);
  const before = host.events.length;
  for (const item of debugItems(debug)) item.click();
  assert.equal(host.events.length, before, 'turning debug off revokes callbacks from an already-open menu');
  assert.equal(debugItems(host.menu()).length, 0);
  host.config('true');
  assert.equal(debugItems(host.menu()).length, 0, 'nonboolean configuration cannot enable debug actions');
});

class Child extends EventEmitter {
  connected = true; exitCode = null; signalCode = null; messages = []; stderr = { resume() {} };
  send(message, callback) { this.messages.push(message); callback?.(null); if (message.type === 'shutdown') queueMicrotask(() => this.exit()); }
  exit() { this.connected = false; this.exitCode = 0; this.emit('exit', 0); }
  kill() { this.exit(); }
}
test('Host debug preference defaults off, updates the helper, and survives helper restart without changing normal status', async t => {
  const { ManagedPet } = await import('../src/managed-helper.mjs');
  const children = [], calls = [];
  const pet = new ManagedPet({ url: 'http://127.0.0.1:3080', spawn(...args) { calls.push(args); const child = new Child(); children.push(child); queueMicrotask(() => child.emit('message', { type: 'ready' })); return child; } });
  t.after(() => pet.dispose());
  assert.equal(typeof pet.debugStatus, 'function', 'debug has its own view so normal status remains compatible');
  assert.deepEqual(pet.debugStatus(), { debugMode: false });
  assert.deepEqual(await pet.setDebugMode(true), { debugMode: true });
  assert.equal(children.length, 0, 'debug toggle must not launch the pet');
  await pet.setEnabled(true);
  assert.equal(calls[0][2].env.DSH_PET_DEBUG, '1', 'debug is seeded before the helper starts');
  assert.deepEqual(pet.status(), { enabled: true, running: true });
  await pet.setDebugMode(false);
  assert.deepEqual(children[0].messages.at(-1), { type: 'pet:config', debugMode: false });
  await pet.setEnabled(false);
  await pet.setDebugMode(true);
  await pet.setEnabled(true);
  assert.equal(calls[1][2].env.DSH_PET_DEBUG, '1');
});

test('changing debug during helper startup is synchronized when readiness arrives', async t => {
  const { ManagedPet } = await import('../src/managed-helper.mjs');
  let child, launch;
  const pet = new ManagedPet({ url: 'http://127.0.0.1:3080', spawn(...args) { launch = args; child = new Child(); return child; } });
  t.after(() => pet.dispose());
  assert.equal(typeof pet.setDebugMode, 'function', 'debug must be configurable before startup has settled');
  const starting = pet.setEnabled(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(launch[2].env.DSH_PET_DEBUG, '0');
  await pet.setDebugMode(true);
  child.emit('message', { type: 'ready' });
  await starting;
  assert.deepEqual(child.messages.at(-1), { type: 'pet:config', debugMode: true });
});

function hostOperations() {
  let route, tool; const changes = [];
  class ManagedPet {
    debugMode = false;
    status() { return { enabled: false, running: false }; }
    debugStatus() { return { debugMode: this.debugMode }; }
    setDebugMode(value) { changes.push(value); this.debugMode = value; return this.debugStatus(); }
    send() {} async dispose() {}
  }
  const source = fs.readFileSync(path.resolve(__dirname, '../index.mjs'), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export const inject = /m, 'const inject = ').replace(/^export function apply\(/m, 'function apply(');
  const box = { ManagedPet, createPermissionDispatcher: () => ({ accept() {}, dispose() {}, sessionDisposed() {} }), Request, Response, URL };
  vm.runInNewContext(`${source}\nthis.apply=apply;`, box);
  box.apply({ webApp: { getAdvertisedUrl: () => 'http://127.0.0.1:3080' }, on() {}, effect: callback => callback(),
    connection: { requestRejection: request => request.headers.get('origin') === 'https://evil.example' ? 403 : undefined, fetch: { register(value) { route = value; return () => {}; } } },
    tools: { register(value) { tool = value; return () => {}; } },
  });
  const post = (action, origin = 'http://127.0.0.1:3080') => route.fetch(new Request('http://dsh.internal/api/deepseek-pet', { method: 'POST', headers: { 'Content-Type': 'application/json', origin, host: '127.0.0.1:3080' }, body: JSON.stringify({ action }) }));
  return { tool, post, changes };
}
test('settings and agent debug operations share Host state, preserve ordinary status, and reject foreign-origin changes', async () => {
  const host = hostOperations();
  for (const action of ['debug-status', 'debug-enable', 'debug-disable']) assert.ok(host.tool.parameters.properties.action.enum.includes(action));
  assert.deepEqual(plain(await host.tool.execute({ action: 'debug-status' })), { enabled: false, running: false, debugMode: false });
  const enabled = await host.post('debug-enable');
  assert.equal(enabled.status, 200);
  assert.deepEqual(await enabled.json(), { enabled: false, running: false, debugMode: true });
  assert.deepEqual(plain(await host.tool.execute({ action: 'debug-status' })), { enabled: false, running: false, debugMode: true });
  assert.deepEqual(plain(await host.tool.execute({ action: 'status' })), { enabled: false, running: false });
  assert.equal((await host.post('debug-disable', 'https://evil.example')).status, 403);
  assert.deepEqual(host.changes, [true]);
  assert.deepEqual(plain(await host.tool.execute({ action: 'debug-disable' })), { enabled: false, running: false, debugMode: false });
  assert.deepEqual(host.changes, [true, false]);
});

function debugSetting(language, debugMode) {
  let definition, component, stateIndex = 0; const dictionaries = new Map(), requests = [];
  const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useSyncExternalStore() {}, useEffect() {}, useRef: value => ({ current: value }),
    useState(initial) { const index = stateIndex++; return [index === 0 ? { enabled: true, running: true } : index === 3 ? debugMode : initial, () => {}]; },
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../client.js'), 'utf8'), {
    window: { __ModuleLoader__: { load(value) { definition = value; } } },
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ debugMode: !debugMode }) }; },
  });
  definition.factory(() => React).apply({ effect: callback => callback(), locale: {
    register(namespace, locale, value) { dictionaries.set(`${namespace}:${locale}`, value); return () => {}; },
    bind: namespace => key => dictionaries.get(`${namespace}:${language}`)?.[key] ?? key,
  }, slots: { inject: (_name, callback) => callback(), register(options, value) { if (options.name === 'settings.section') component = value; return () => {}; } } });
  const root = component();
  function walk(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(walk); return [node, ...(node.children || []).flatMap(walk)]; }
  return { nodes: walk(root), requests };
}
for (const language of ['en', 'zh']) {
  for (const enabled of [false, true]) {
    test(`${language} settings checkbox ${enabled ? 'disables' : 'enables'} debug mode through the Host`, async () => {
      const page = debugSetting(language, enabled);
      const control = page.nodes.find(node => node.type === 'input' && node.props.type === 'checkbox');
      assert.ok(control, 'Pet settings must expose a real debug checkbox');
      assert.equal(control.props.checked, enabled);
      assert.equal(!!control.props.disabled, false);
      const text = page.nodes.flatMap(node => node.children || []).filter(value => typeof value === 'string').join(' ');
      assert.match(text, language === 'en' ? /Debug mode/ : /调试模式/);
      await control.props.onChange({ target: { checked: !enabled }, currentTarget: { checked: !enabled } });
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(page.requests.length, 1);
      assert.equal(page.requests[0].url, '/api/deepseek-pet');
      assert.deepEqual(JSON.parse(page.requests[0].options.body), { action: enabled ? 'debug-disable' : 'debug-enable' });
    });
  }
}
test('debug checkbox is disabled until its Host preference has loaded', () => {
  const page = debugSetting('en', null);
  const control = page.nodes.find(node => node.type === 'input' && node.props.type === 'checkbox');
  assert.ok(control, 'debug control is present while preference loads');
  assert.equal(control.props.disabled, true);
});
