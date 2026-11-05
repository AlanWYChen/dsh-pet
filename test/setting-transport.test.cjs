const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the production apply body; replace only its imported native process
// boundary and passive dispatcher. No Electron or browser is launched.
function mountHost() {
  let route, tool;
  const transitions = [];
  class ManagedPet {
    constructor() { this.enabled = false; }
    status() { return { enabled: this.enabled, running: this.enabled }; }
    async setEnabled(enabled) { transitions.push(enabled); this.enabled = enabled; return this.status(); }
    send() {}
    async dispose() {}
  }
  const source = fs.readFileSync(path.resolve(__dirname, '../index.mjs'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export const inject = /m, 'const inject = ')
    .replace(/^export function apply\(/m, 'function apply(');
  const sandbox = {
    ManagedPet,
    createPermissionDispatcher: () => ({ dispose() {}, accept() {}, sessionDisposed() {} }),
    Request, Response, URL, AbortSignal,
  };
  vm.runInNewContext(`${source}\nthis.apply = apply;`, sandbox, { filename: 'index.mjs' });
  const ctx = {
    webApp: { getAdvertisedUrl: () => 'http://127.0.0.1:3080' },
    on() {}, effect(callback) { return callback(); },
    connection: {
      // Connection validates original HTTP headers, not its synthetic Fetch URL.
      requestRejection({ headers }) {
        const get = key => typeof headers.get === 'function' ? headers.get(key) : headers[key];
        const origin = get('origin'), host = get('host');
        return host !== '127.0.0.1:3080' || (origin && origin !== 'http://127.0.0.1:3080') ? 403 : undefined;
      },
      fetch: { register(value) { route = value; return () => {}; } },
    },
    tools: { register(value) { tool = value; return () => {}; } },
  };
  sandbox.apply(ctx);
  assert.ok(route && tool, 'Host must register both settings transport and agent operation');
  return { route, tool, transitions };
}

function browserRequest(action, overrides = {}) {
  const headers = { origin: 'http://127.0.0.1:3080', host: '127.0.0.1:3080', 'content-type': 'application/json', ...overrides };
  return new Request('http://dsh.internal/api/deepseek-pet', { method: 'POST', headers, body: JSON.stringify({ action }) });
}
const plain = value => JSON.parse(JSON.stringify(value));

test('settings browser POST works through internal Fetch URL and shares state with agent tool', async () => {
  const { route, tool, transitions } = mountHost();
  const enabled = await route.fetch(browserRequest('enable'));
  assert.equal(enabled.status, 200, 'valid browser origin must not be compared with synthetic dsh.internal URL');
  assert.deepEqual(await enabled.json(), { enabled: true, running: true });
  assert.deepEqual(plain(await tool.execute({ action: 'status' })), { enabled: true, running: true });
  const disabled = await route.fetch(browserRequest('disable'));
  assert.equal(disabled.status, 200);
  assert.deepEqual(await disabled.json(), { enabled: false, running: false });
  await tool.execute({ action: 'enable' });
  const current = await route.fetch(new Request('http://dsh.internal/api/deepseek-pet', { headers: { host: '127.0.0.1:3080' } }));
  assert.equal(current.status, 200);
  assert.deepEqual(await current.json(), { enabled: true, running: true });
  assert.deepEqual(transitions, [true, false, true]);
});

for (const [label, headers] of [
  ['foreign origin', { origin: 'https://evil.example' }],
  ['foreign host', { host: 'evil.example' }],
]) {
  test(`settings rejects ${label} without changing helper state`, async () => {
    const { route, tool, transitions } = mountHost();
    const rejected = await route.fetch(browserRequest('enable', headers));
    assert.equal(rejected.status, 403);
    assert.deepEqual(transitions, []);
    assert.deepEqual(plain(await tool.execute({ action: 'status' })), { enabled: false, running: false });
  });
}

test('settings invalid action returns bounded error and never starts helper', async () => {
  const { route, transitions } = mountHost();
  const response = await route.fetch(browserRequest('not-an-operation'));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Pet operation failed' });
  assert.deepEqual(transitions, []);
});
