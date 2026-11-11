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
    reason: 'no-inject',
    checkedAt: null,
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

  function mount(account) {
    if (watcher) {
      try { watcher.stop(); } catch { /* replacing a watcher is best effort */ }
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
    try { watcher.start(); } catch { /* polling is optional */ }
    return watcher;
  }

  // The account plugin is normally already mounted by the time this bundle
  // applies. Prefer the direct service lookup; fall back to injection when the
  // service is still arriving (or exposed only through a child context).
  let direct = null;
  try {
    direct = ctx?.get?.('deepseekAccount') ?? ctx?.deepseekAccount ?? null;
  } catch { direct = null; }
  if (direct) {
    mount(direct);
    try { ctx.effect?.(() => () => { try { watcher?.stop(); } catch { /* ignore */ } }); } catch { /* no effect scope */ }
  } else {
    try {
      if (ctx && typeof ctx.inject === 'function') {
        ctx.inject(['deepseekAccount'], child => {
          mount(accountOf(child));
          try {
            // cordis runs the callback now and treats its return value as the
            // fiber disposer.
            child?.effect?.(() => () => watcher?.stop());
          } catch { /* no effect scope: the watcher is still usable */ }
        });
      }
    } catch { /* injection unavailable: remain inert */ }
  }

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
