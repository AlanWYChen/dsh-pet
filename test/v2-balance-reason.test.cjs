const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createBalanceWatcher } = require('../src/balance-watcher.mjs');

const ready = amount => ({
  status: 'ready',
  value: [{ currency: 'CNY', balance: String(amount) }],
  bonusWallets: [],
});

function watcher(account) {
  return createBalanceWatcher({
    account,
    config: { balanceThreshold: { currency: 'CNY', amount: 5 } },
    now: () => 1234,
    schedule: () => 1,
    cancel: () => {},
  });
}

test('a ready balance records ok and the check time', async () => {
  const state = await watcher({ getBalance: async () => ready(12) }).check();
  assert.equal(state.status, 'ready');
  assert.equal(state.reason, 'ok');
  assert.equal(state.checkedAt, 1234);
});

test('an absent account service is reported as no-service', async () => {
  const state = await watcher(null).check();
  assert.equal(state.status, 'unavailable');
  assert.equal(state.reason, 'no-service');
  assert.equal(state.checkedAt, 1234);
});

test('a null account result is reported as signed-out', async () => {
  const state = await watcher({ getBalance: async () => null }).check();
  assert.equal(state.status, 'unavailable');
  assert.equal(state.reason, 'signed-out');
});

test('a failed balance response and a thrown query are distinguished', async () => {
  const failed = await watcher({ getBalance: async () => ({ status: 'failed' }) }).check();
  assert.equal(failed.reason, 'query-failed');
  const thrown = await watcher({ getBalance: async () => { throw new Error('offline'); } }).check();
  assert.equal(thrown.reason, 'error');
});
