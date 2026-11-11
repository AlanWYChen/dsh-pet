// Pure balance evaluation for the v2 account warning. No I/O, no timers, and
// no Electron: the host and the settings surface can unit test it directly.

export const ALERT_INTERVAL_MS = 24 * 60 * 60 * 1000;

const CNY = 'CNY';
const DEFAULT_THRESHOLD = 5;
const CURRENCY_SYMBOLS = { CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: '¥' };

/** Convert a wallet amount (decimal string or number) to exact integer cents. */
function toCents(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
  }
  return null;
}

function thresholdCents(threshold) {
  const amount = threshold && typeof threshold === 'object' ? Number(threshold.amount) : NaN;
  const safe = Number.isFinite(amount) && amount > 0 ? amount : DEFAULT_THRESHOLD;
  return Math.round(safe * 100);
}

/**
 * Combined usable balance: the main wallet plus every bonus wallet in CNY.
 * Returns null when the account is not ready or has no CNY wallet, so a failed
 * query can never be mistaken for a low (or healthy) balance.
 */
export function usableBalance(balance) {
  if (!balance || typeof balance !== 'object' || balance.status !== 'ready') return null;
  const wallets = [];
  for (const group of [balance.value, balance.bonusWallets]) {
    if (!Array.isArray(group)) continue;
    for (const wallet of group) {
      if (wallet && typeof wallet === 'object' && wallet.currency === CNY) wallets.push(wallet);
    }
  }
  if (wallets.length === 0) return null;
  let cents = 0;
  for (const wallet of wallets) {
    const value = toCents(wallet.balance);
    // A malformed CNY wallet makes the total untrustworthy; never guess.
    if (value === null) return null;
    cents += value;
  }
  return { amount: cents / 100, cents, currency: CNY };
}

/** Render an amount the way the bubble and the settings tab show it. */
export function formatBalance(amount, currency = CNY) {
  const value = Number(amount);
  const safe = Number.isFinite(value) ? value : 0;
  const symbol = CURRENCY_SYMBOLS[currency];
  const rendered = (Math.round(safe * 100) / 100).toFixed(2);
  return symbol ? `${symbol}${rendered}` : `${currency} ${rendered}`;
}

/**
 * Decide the mood and whether the user must be warned now. A low balance
 * alerts once per 24 hours; recovery resets the warning so the next dip is
 * immediate; unavailable data never alerts.
 */
export function evaluateBalance({ balance, threshold, now, lastAlertAt, wasLow } = {}) {
  const time = Number.isFinite(now) ? now : Date.now();
  const previousAlertAt = Number.isFinite(lastAlertAt) ? lastAlertAt : null;
  const usable = usableBalance(balance);
  if (!usable) {
    return {
      status: 'unavailable',
      low: false,
      shouldAlert: false,
      amount: null,
      cents: null,
      currency: null,
      lastAlertAt: previousAlertAt,
      wasLow: false,
    };
  }
  const low = usable.cents < thresholdCents(threshold);
  const intervalElapsed = previousAlertAt === null || time - previousAlertAt >= ALERT_INTERVAL_MS;
  const shouldAlert = low && (wasLow !== true || intervalElapsed);
  return {
    status: 'ready',
    low,
    shouldAlert,
    amount: usable.amount,
    cents: usable.cents,
    currency: usable.currency,
    lastAlertAt: shouldAlert ? time : previousAlertAt,
    wasLow: low,
  };
}
