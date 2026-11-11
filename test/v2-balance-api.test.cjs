const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function mountHost({ balance } = {}) {
  let route, tool;
  const calls = [];
  const petSent = [];
  class ManagedPet {
    constructor(options) {
      this.options = options;
      this.enabled = false;
      this.config = { enabled: false, balanceThreshold: { currency: 'CNY', amount: 5 }, sound: true };
    }
    status() { return { enabled: this.enabled, running: this.enabled }; }
    async setEnabled(enabled) { this.enabled = enabled; calls.push(['setEnabled', enabled]); return this.status(); }
    async autoStart() { return this.status(); }
    send(event) { petSent.push(event); return true; }
    async dispose() {}
    async setSound(sound) { this.config.sound = sound; calls.push(['sound', sound]); }
    async setBalanceThreshold(threshold) { this.config.balanceThreshold = threshold; calls.push(['threshold', threshold]); }
  }
  const controller = {
    threshold: { currency: 'CNY', amount: 5 },
    state() { return balance || { status: 'ready', low: true, amount: 3, cents: 300, currency: 'CNY' }; },
    async check() {},
    setThreshold(threshold) { this.threshold = threshold; },
    stop() {},
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../index.mjs'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export const inject = /m, 'const inject = ')
    .replace(/^export function apply\(/m, 'function apply(');
  const sandbox = {
    ManagedPet,
    createPermissionDispatcher: () => ({ dispose() {}, accept() {}, sessionDisposed() {} }),
    startBalance: () => controller,
    noteRootEvent() {},
    latestActive() { return null; },
    Request, Response, URL, AbortSignal,
  };
  vm.runInNewContext(`${source}\nthis.apply = apply;`, sandbox, { filename: 'index.mjs' });
  const ctx = {
    webApp: { getAdvertisedUrl: () => 'http://127.0.0.1:3080' },
    on() {}, effect(callback) { return callback(); },
    connection: {
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
  assert.ok(route && tool);
  return { route, tool, calls, petSent, controller };
}

const plain = value => JSON.parse(JSON.stringify(value));
function post(body) {
  return new Request('http://dsh.internal/api/deepseek-pet', {
    method: 'POST',
    headers: { origin: 'http://127.0.0.1:3080', host: '127.0.0.1:3080', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('the balance action reports the live balance and threshold', async () => {
  const { tool } = mountHost();
  const value = plain(await tool.execute({ action: 'balance' }));
  assert.deepEqual(value, {
    balance: { status: 'ready', low: true, amount: 3, cents: 300, currency: 'CNY' },
    threshold: { currency: 'CNY', amount: 5 },
  });
});

test('set-threshold validates, persists, and updates the live watcher', async () => {
  const { route, tool, calls, controller } = mountHost();
  const updated = await route.fetch(post({ action: 'set-threshold', value: { currency: 'CNY', amount: 7.5 } }));
  assert.equal(updated.status, 200);
  assert.deepEqual(calls.at(-1), ['threshold', { currency: 'CNY', amount: 7.5 }]);
  assert.deepEqual(controller.threshold, { currency: 'CNY', amount: 7.5 });
  assert.equal(plain(await tool.execute({ action: 'balance' })).threshold.amount, 7.5);
});

for (const value of [
  { currency: 'CNY', amount: 0 },
  { currency: 'CNY', amount: -3 },
  { currency: 'USD', amount: 5 },
  { currency: 'CNY', amount: 'many' },
  null,
]) {
  test(`set-threshold rejects ${JSON.stringify(value)} without changing state`, async () => {
    const { route, calls } = mountHost();
    const rejected = await route.fetch(post({ action: 'set-threshold', value }));
    assert.equal(rejected.status, 400);
    assert.equal(calls.some(call => call[0] === 'threshold'), false);
  });
}

test('the endpoint is bounded at 256 bytes', async () => {
  const { route } = mountHost();
  const huge = await route.fetch(post({ action: 'set-threshold', value: { currency: 'CNY', amount: 5, pad: 'x'.repeat(300) } }));
  assert.equal(huge.status, 413);
});

test('test-notification sends one completion event and set-sound persists', async () => {
  const { route, petSent, calls } = mountHost();
  const response = await route.fetch(post({ action: 'test-notification' }));
  assert.equal(response.status, 200);
  assert.equal(petSent.at(-1).state, 'done');
  const sound = await route.fetch(post({ action: 'set-sound', value: false }));
  assert.equal(sound.status, 200);
  assert.deepEqual(calls.at(-1), ['sound', false]);
});

test('existing status shape is unchanged for the protected settings harness', async () => {
  const { route } = mountHost();
  const response = await route.fetch(new Request('http://dsh.internal/api/deepseek-pet', {
    headers: { host: '127.0.0.1:3080' },
  }));
  assert.deepEqual(await response.json(), { enabled: false, running: false });
});
