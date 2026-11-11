const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ALERT_INTERVAL_MS, usableBalance, formatBalance, evaluateBalance } = require('../src/balance.mjs');

const ready = (normal, bonus = []) => ({
  status: 'ready',
  value: normal.map(([currency, balance]) => ({ currency, balance })),
  bonusWallets: bonus.map(([currency, balance]) => ({ currency, balance })),
});
const threshold = { currency: 'CNY', amount: 5 };

test('usable balance sums main and bonus CNY wallets in exact cents', () => {
  assert.equal(ALERT_INTERVAL_MS, 24 * 60 * 60 * 1000);
  assert.deepEqual(usableBalance(ready([['CNY', '3.20']], [['CNY', '1.00']])), { amount: 4.2, cents: 420, currency: 'CNY' });
  assert.deepEqual(usableBalance(ready([['CNY', '0.10']], [['CNY', '0.20']])), { amount: 0.3, cents: 30, currency: 'CNY' });
  assert.deepEqual(usableBalance(ready([['CNY', '1.05']])), { amount: 1.05, cents: 105, currency: 'CNY' });
});

test('usable balance ignores other currencies and unavailable results', () => {
  assert.equal(usableBalance(ready([['USD', '9.99']])), null);
  assert.equal(usableBalance(ready([['USD', '1.00']], [['CNY', '2.00']])).cents, 200);
  assert.equal(usableBalance({ status: 'failed' }), null);
  assert.equal(usableBalance(null), null);
  assert.equal(usableBalance({ status: 'ready', value: null, bonusWallets: null }), null);
});

test('balances are formatted with their currency symbol', () => {
  assert.equal(formatBalance(3.2), '¥3.20');
  assert.equal(formatBalance(12, 'USD'), '$12.00');
  assert.equal(formatBalance(0), '¥0.00');
});

test('a first low balance alerts and records the alert time', () => {
  const result = evaluateBalance({ balance: ready([['CNY', '3.00']]), threshold, now: 1000 });
  assert.equal(result.status, 'ready');
  assert.equal(result.low, true);
  assert.equal(result.shouldAlert, true);
  assert.equal(result.amount, 3);
  assert.equal(result.currency, 'CNY');
  assert.equal(result.lastAlertAt, 1000);
  assert.equal(result.wasLow, true);
});

test('a still-low balance does not alert again inside 24 hours, but does afterwards', () => {
  const first = evaluateBalance({ balance: ready([['CNY', '3.00']]), threshold, now: 0 });
  const soon = evaluateBalance({ balance: ready([['CNY', '3.00']]), threshold, now: 60 * 60 * 1000,
    lastAlertAt: first.lastAlertAt, wasLow: first.wasLow });
  assert.equal(soon.low, true);
  assert.equal(soon.shouldAlert, false);
  assert.equal(soon.lastAlertAt, first.lastAlertAt);
  const later = evaluateBalance({ balance: ready([['CNY', '3.00']]), threshold,
    now: first.lastAlertAt + ALERT_INTERVAL_MS, lastAlertAt: first.lastAlertAt, wasLow: first.wasLow });
  assert.equal(later.shouldAlert, true);
  assert.equal(later.lastAlertAt, first.lastAlertAt + ALERT_INTERVAL_MS);
});

test('recovery clears the low state and a new dip alerts immediately', () => {
  const recovered = evaluateBalance({ balance: ready([['CNY', '8.00']]), threshold, now: 100,
    lastAlertAt: 50, wasLow: true });
  assert.equal(recovered.low, false);
  assert.equal(recovered.shouldAlert, false);
  assert.equal(recovered.wasLow, false);
  const dip = evaluateBalance({ balance: ready([['CNY', '4.00']]), threshold, now: 200,
    lastAlertAt: 50, wasLow: false });
  assert.equal(dip.shouldAlert, true);
  assert.equal(dip.lastAlertAt, 200);
});

test('an unavailable balance never alerts and keeps the previous dedupe state', () => {
  for (const balance of [{ status: 'failed' }, null]) {
    const result = evaluateBalance({ balance, threshold, now: 500, lastAlertAt: 50, wasLow: true });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.low, false);
    assert.equal(result.shouldAlert, false);
    assert.equal(result.lastAlertAt, 50);
    assert.equal(result.wasLow, false);
    assert.equal(result.amount, null);
  }
});

test('the threshold includes bonus credit', () => {
  const result = evaluateBalance({ balance: ready([['CNY', '1.00']], [['CNY', '3.50']]), threshold, now: 0 });
  assert.equal(result.low, true);
  assert.equal(result.amount, 4.5);
  const atLimit = evaluateBalance({ balance: ready([['CNY', '5.00']]), threshold, now: 0 });
  assert.equal(atLimit.low, false, 'exactly at the threshold is not low');
});
