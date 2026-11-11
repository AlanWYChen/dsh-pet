const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startBalance } = require('../src/balance-host.mjs');

const ready = amount => ({
  status: 'ready',
  value: [{ currency: 'CNY', balance: String(amount) }],
  bonusWallets: [],
});
const tick = () => new Promise(resolve => setImmediate(resolve));

test('an already-mounted account service is used directly, without injection', async () => {
  const sent = [];
  let cleanup;
  const account = { getBalance: async () => ready(3) };
  const ctx = {
    get(name) { return name === 'deepseekAccount' ? account : undefined; },
    effect(fn) { cleanup = fn(); return { dispose() {} }; },
  };
  const host = startBalance({
    ctx,
    pet: { send(event) { sent.push(event); return true; } },
    config: { balanceThreshold: { currency: 'CNY', amount: 5 } },
    now: () => 1000,
  });
  await tick();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].state, 'low-balance');
  assert.equal(sent[0].title, '¥3.00');
  assert.equal(host.state().status, 'ready');
  assert.equal(host.state().reason, 'ok');
  assert.doesNotThrow(() => cleanup?.());
});

test('a directly exposed account property is also accepted', async () => {
  const sent = [];
  let cleanup;
  const account = { getBalance: async () => ready(25) };
  const ctx = {
    deepseekAccount: account,
    effect(fn) { cleanup = fn(); return { dispose() {} }; },
  };
  const host = startBalance({
    ctx,
    pet: { send(event) { sent.push(event); return true; } },
    config: { balanceThreshold: { currency: 'CNY', amount: 5 } },
    now: () => 1000,
  });
  await tick();
  assert.equal(sent.length, 0, 'a healthy balance stays silent');
  assert.equal(host.state().amount, 25);
  cleanup?.();
});
