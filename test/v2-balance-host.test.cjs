const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startBalance } = require('../src/balance-host.mjs');

const ready = amount => ({
  status: 'ready',
  value: [{ currency: 'CNY', balance: String(amount) }],
  bonusWallets: [],
});
const tick = () => new Promise(resolve => setImmediate(resolve));
const config = () => ({ balanceThreshold: { currency: 'CNY', amount: 5 } });

function mount({ account = { getBalance: async () => ready(3) }, inject = true, now = () => 1000 } = {}) {
  const sent = [];
  const cleanups = [];
  let captured;
  const ctx = inject ? {
    inject(deps, callback) {
      captured = { deps, callback };
      return { dispose() {} };
    },
  } : {};
  const pet = { send(event) { sent.push(event); return true; } };
  const settings = config();
  const host = startBalance({ ctx, pet, config: settings, now });
  let effectCleanup;
  if (captured) {
    captured.callback({
      deepseekAccount: account,
      effect(fn) { effectCleanup = fn(); return { dispose() {} }; },
    });
  }
  return { host, sent, settings, captured, cleanups, runCleanup: () => effectCleanup?.() };
}

test('a low balance sends one low-balance event with the formatted amount', async () => {
  const { host, sent, captured } = mount();
  assert.deepEqual(captured.deps, ['deepseekAccount']);
  assert.equal(host.state().status, 'unavailable');
  await tick();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].state, 'low-balance');
  assert.equal(sent[0].title, '¥3.00');
  assert.equal(typeof sent[0].eventId, 'string');
  assert.equal(host.state().low, true);
});

test('a healthy balance stays silent and is readable through state()', async () => {
  const { host, sent } = mount({ account: { getBalance: async () => ready(25) } });
  await tick();
  assert.equal(sent.length, 0);
  assert.equal(host.state().low, false);
  assert.equal(host.state().amount, 25);
});

test('a missing account service is inert rather than fatal', async () => {
  const sent = [];
  const host = startBalance({ ctx: {}, pet: { send: event => sent.push(event) }, config: config() });
  assert.equal(host.state().status, 'unavailable');
  assert.equal(sent.length, 0);
  assert.doesNotThrow(() => host.setThreshold({ currency: 'CNY', amount: 9 }));
  assert.doesNotThrow(() => host.stop());
});

test('a failed query does not send a false alert', async () => {
  const { host, sent } = mount({ account: { getBalance: async () => { throw new Error('offline'); } } });
  await tick();
  assert.equal(sent.length, 0);
  assert.equal(host.state().status, 'unavailable');
});

test('the configured threshold is live and the watcher stops on cleanup', async () => {
  const { host, sent, settings, runCleanup } = mount({ account: { getBalance: async () => ready(6) } });
  await tick();
  assert.equal(sent.length, 0);
  host.setThreshold({ currency: 'CNY', amount: 10 });
  assert.equal(settings.balanceThreshold.amount, 10);
  await host.check();
  assert.equal(sent.length, 1);
  assert.doesNotThrow(() => runCleanup());
});

test('a helper that is not running still records the balance state', async () => {
  const sent = [];
  const ctx = { inject(deps, callback) { callback({ deepseekAccount: { getBalance: async () => ready(2) }, effect() {} }); } };
  const host = startBalance({ ctx, pet: { send: event => { sent.push(event); return false; } }, config: config(), now: () => 0 });
  await tick();
  assert.equal(sent.length, 1);
  assert.equal(host.state().low, true);
});
