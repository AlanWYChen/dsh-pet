// Periodic account-balance polling for the v2 warning. The clock, scheduler,
// account and client metadata are injectable so tests never need timers or the
// network; every failure path degrades to "unavailable", never to a false alert.
import { evaluateBalance } from './balance.mjs';

const DEFAULT_THRESHOLD = { currency: 'CNY', amount: 5 };
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

function defaultClient() {
  return {
    version: '0.2.0',
    locale: 'en',
    timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
  };
}

function unavailableState() {
  return {
    status: 'unavailable',
    low: false,
    shouldAlert: false,
    amount: null,
    cents: null,
    currency: null,
    lastAlertAt: null,
    wasLow: false,
  };
}

/**
 * Poll the DeepSeek account balance and surface alert/state callbacks.
 * `check()` never throws; `start()` checks immediately and then every
 * `intervalMs` (five minutes by default); `stop()` cancels the poll.
 */
export function createBalanceWatcher({
  account,
  config,
  onAlert,
  onState,
  now,
  intervalMs = DEFAULT_INTERVAL_MS,
  schedule,
  cancel,
  client,
} = {}) {
  const clock = typeof now === 'function' ? now : () => Date.now();
  const timerSchedule = typeof schedule === 'function'
    ? schedule
    : (fn, ms) => {
      const timer = setTimeout(fn, ms);
      // Polling alone must never keep a short-lived host or a test process alive.
      if (timer && typeof timer.unref === 'function') timer.unref();
      return timer;
    };
  const timerCancel = typeof cancel === 'function' ? cancel : timer => clearTimeout(timer);
  const settings = config && typeof config === 'object'
    ? config
    : { balanceThreshold: { ...DEFAULT_THRESHOLD } };

  let state = unavailableState();
  let timer = null;
  let running = false;

  async function check() {
    let balance = null;
    try {
      if (account && typeof account.getBalance === 'function') {
        balance = await account.getBalance(client || defaultClient());
      }
    } catch {
      balance = null;
    }
    try {
      state = evaluateBalance({
        balance,
        threshold: settings.balanceThreshold,
        now: clock(),
        lastAlertAt: state.lastAlertAt,
        wasLow: state.wasLow,
      });
    } catch {
      state = unavailableState();
    }
    try { onState?.(state); } catch { /* an observer must not break polling */ }
    if (state.shouldAlert) {
      try { onAlert?.(state); } catch { /* an alert must not break polling */ }
    }
    return state;
  }

  function start() {
    if (running) return;
    running = true;
    timer = timerSchedule(() => check(), intervalMs);
    // Check immediately instead of waiting for the first interval.
    void check();
  }

  function stop() {
    running = false;
    if (timer !== null && timer !== undefined) {
      try { timerCancel(timer); } catch { /* cancellation is best effort */ }
    }
    timer = null;
  }

  function setThreshold(threshold) {
    settings.balanceThreshold = threshold;
  }

  return {
    start,
    stop,
    check,
    state: () => ({ ...state }),
    setThreshold,
  };
}
