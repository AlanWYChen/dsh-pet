const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The Settings tab must be able to force a fresh balance read. Without this it
// would keep showing the cached "unavailable" state for up to five minutes
// after the user signs in.
function mountHost() {
  let tool;
  let checks = 0;
  const state = () => checks === 0
    ? { status: 'unavailable', low: false, shouldAlert: false, amount: null, cents: null, currency: null, lastAlertAt: null, wasLow: false, reason: 'pending' }
    : { status: 'ready', low: false, shouldAlert: false, amount: 12, cents: 1200, currency: 'CNY', lastAlertAt: null, wasLow: false, reason: 'ok' };
  class ManagedPet {
    constructor() {
      this.config = { balanceThreshold: { currency: 'CNY', amount: 5 }, sound: true };
    }
    status() { return { enabled: true, running: true }; }
    async autoStart() { return this.status(); }
    send() { return true; }
    async dispose() {}
  }
  const controller = {
    state,
    async check() { checks++; },
    setThreshold() {},
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
  sandbox.apply({
    webApp: { getAdvertisedUrl: () => 'http://127.0.0.1:3080' },
    on() {}, effect(callback) { return callback(); },
    connection: { requestRejection() {}, fetch: { register() { return () => {}; } } },
    tools: { register(value) { tool = value; return () => {}; } },
  });
  return { tool, checks: () => checks };
}

test('reading the balance forces a fresh account check', async () => {
  const { tool, checks } = mountHost();
  const value = await tool.execute({ action: 'balance' });
  assert.equal(checks(), 1, 'the balance action must not return a stale cached state');
  assert.equal(value.balance.status, 'ready');
  assert.equal(value.balance.reason, 'ok');
});
