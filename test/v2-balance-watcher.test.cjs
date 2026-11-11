const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createBalanceWatcher } = require('../src/balance-watcher.mjs');

const ready = amount => ({
  status: 'ready',
  value: [{ currency: 'CNY', balance: String(amount) }],
  bonusWallets: [],
});
const tick = () => new Promise(resolve => setImmediate(resolve));

function setup({ balance = ready(3), account, now = () => 1000 } = {}) {
  const events = { alerts: [], states: [], scheduled: [], cancelled: [] };
  const watcher = createBalanceWatcher({
    account: account === undefined ? { getBalance: async () => balance } : account,
    config: { balanceThreshold: { currency: 'CNY', amount: 5 } },
    onAlert: result => events.alerts.push(result),
    onState: result => events.states.push(result),
    now,
    intervalMs: 300000,
    schedule: (fn, ms) => { events.scheduled.push({ fn, ms }); return events.scheduled.length; },
    cancel: id => events.cancelled.push(id),
  });
  return { watcher, events };
}

test('start checks immediately, schedules five-minute polls, and alerts once', async () => {
  const { watcher, events } = setup();
  watcher.start();
  assert.equal(events.scheduled.length, 1);
  assert.equal(events.scheduled[0].ms, 300000);
  await tick();
  assert.equal(events.alerts.length, 1);
  assert.equal(events.alerts[0].low, true);
  assert.equal(events.alerts[0].amount, 3);
  assert.equal(watcher.state().low, true);
  assert.equal(events.states.at(-1).low, true);
  await events.scheduled[0].fn();
  assert.equal(events.alerts.length, 1, 'a still-low balance does not alert again');
  watcher.stop();
  assert.deepEqual(events.cancelled, [1]);
});

test('the DeepSeek client metadata is sent with the query', async () => {
  const calls = [];
  const { watcher } = setup({
    account: { async getBalance(client) { calls.push(client); return ready(3); } },
  });
  await watcher.check();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].version, '0.2.0');
  assert.equal(calls[0].locale, 'en');
  assert.equal(Number.isInteger(calls[0].timezoneOffsetSeconds), true);
  assert.equal(calls[0].timezoneOffsetSeconds, -new Date().getTimezoneOffset() * 60);
});

test('recovery resets the warning and a later dip alerts again', async () => {
  let current = ready(3);
  const { watcher, events } = setup({ now: () => 0, account: { getBalance: async () => current } });
  await watcher.check();
  assert.equal(events.alerts.length, 1);
  current = ready(9);
  await watcher.check();
  assert.equal(watcher.state().low, false);
  current = ready(2);
  await watcher.check();
  assert.equal(events.alerts.length, 2, 'a new dip after recovery alerts immediately');
});

test('a failed or absent balance query never alerts and never throws', async () => {
  const failing = setup({ account: { getBalance: async () => { throw new Error('offline'); } } });
  await assert.doesNotReject(() => failing.watcher.check());
  assert.equal(failing.events.alerts.length, 0);
  assert.equal(failing.watcher.state().status, 'unavailable');

  const missing = setup({ account: null });
  await assert.doesNotReject(() => missing.watcher.check());
  assert.equal(missing.events.alerts.length, 0);
  assert.equal(missing.watcher.state().status, 'unavailable');
  assert.doesNotThrow(() => missing.watcher.start());
  missing.watcher.stop();

  const failedResponse = setup({ balance: { status: 'failed' } });
  await failedResponse.watcher.check();
  assert.equal(failedResponse.events.alerts.length, 0);
});

test('a lowered threshold re-evaluates on the next poll', async () => {
  const { watcher, events } = setup({ balance: ready(6) });
  await watcher.check();
  assert.equal(events.alerts.length, 0);
  watcher.setThreshold({ currency: 'CNY', amount: 10 });
  await watcher.check();
  assert.equal(events.alerts.length, 1);
});
