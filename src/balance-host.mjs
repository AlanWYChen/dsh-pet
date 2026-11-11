// Host-side wiring for the account balance warning: inject the DeepSeek
// account service, poll it, and publish one low-balance alert through the pet.
import { formatBalance } from './balance.mjs';
import { createBalanceWatcher } from './balance-watcher.mjs';

const DEFAULT_THRESHOLD = { currency: 'CNY', amount: 5 };

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

function accountOf(child) {
  try {
    if (child && child.deepseekAccount) return child.deepseekAccount;
    if (child && typeof child.get === 'function') return child.get('deepseekAccount');
  } catch { /* an unavailable service is not fatal */ }
  return null;
}

/**
 * Start the balance controller for this Host. Missing injection support or a
 * missing account service leaves a harmless inert controller reporting
 * `{ status: 'unavailable' }`, so the plugin never fails to mount.
 */
export function startBalance({ ctx, pet, config, now } = {}) {
  const settings = config && typeof config === 'object'
    ? config
    : { balanceThreshold: { ...DEFAULT_THRESHOLD } };
  const inert = unavailableState();
  let watcher = null;

  try {
    if (ctx && typeof ctx.inject === 'function') {
      ctx.inject(['deepseekAccount'], child => {
        const account = accountOf(child);
        // A re-injected account service replaces the previous watcher.
        if (watcher) {
          try { watcher.stop(); } catch { /* ignore */ }
        }
        watcher = createBalanceWatcher({
          account,
          config: settings,
          now,
          onAlert: result => {
            try {
              pet?.send?.({
                state: 'low-balance',
                eventId: `balance:${result.lastAlertAt ?? Date.now()}`,
                title: formatBalance(result.amount, result.currency),
              });
            } catch { /* a stopped helper still records the state */ }
          },
        });
        try {
          // cordis runs the callback now and treats its return value as the
          // fiber disposer.
          child?.effect?.(() => () => watcher?.stop());
        } catch { /* no effect scope: the watcher is still usable */ }
        watcher.start();
      });
    }
  } catch { /* injection unavailable: remain inert */ }

  function state() {
    return watcher ? watcher.state() : { ...inert };
  }

  async function check() {
    if (!watcher) return state();
    try { await watcher.check(); } catch { /* never throws into the host */ }
    return state();
  }

  function setThreshold(threshold) {
    if (settings && typeof settings === 'object') settings.balanceThreshold = threshold;
    if (watcher) {
      try { watcher.setThreshold(threshold); } catch { /* ignore */ }
    }
  }

  function stop() {
    if (watcher) {
      try { watcher.stop(); } catch { /* ignore */ }
    }
  }

  return { state, check, setThreshold, stop };
}
