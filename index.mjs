import { ManagedPet } from './src/managed-helper.mjs';
import { createPermissionDispatcher } from './dsh-plugin.mjs';
import os from 'node:os';
import { noteRootEvent, latestActive } from './src/resume.mjs';
import { startBalance } from './src/balance-host.mjs';
export const inject = ['connection', 'webApp', 'tools'];

const DEFAULT_BALANCE_THRESHOLD = { currency: 'CNY', amount: 5 };

function defaultBalanceThreshold() {
  return { currency: 'CNY', amount: DEFAULT_BALANCE_THRESHOLD.amount };
}

// `set-threshold` only accepts the documented positive CNY shape. The value is
// returned untouched so it keeps the realm the HTTP carrier parsed it in.
function normalizeBalanceThreshold(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid balance threshold');
  }
  if (value.currency !== 'CNY') throw new TypeError('Invalid balance threshold');
  if (typeof value.amount !== 'number' || !Number.isFinite(value.amount) || value.amount <= 0) {
    throw new TypeError('Invalid balance threshold');
  }
  return value;
}

// The saved pet config path. Kept behind a guard so Host unit harnesses that
// strip native imports never trigger filesystem access.
function configFileForHost() {
  try {
    if (typeof os !== 'undefined' && os && typeof os.homedir === 'function') {
      return `${os.homedir()}/.dsh-pet/pet.json`;
    }
  } catch {}
  return undefined;
}

export function apply(ctx) {
  const pet = new ManagedPet({ url: ctx.webApp.getAdvertisedUrl(), configFile: configFileForHost() });
  // The watcher needs the saved threshold. Reading first also makes pet.config
  // available to the settings actions without waiting for the auto-start.
  if (!pet.config && typeof pet.readConfig === 'function') {
    try { pet.readConfig(); } catch { /* a corrupt config falls back to defaults */ }
  }
  let balanceController = null;
  try {
    if (typeof startBalance === 'function') {
      balanceController = startBalance({ ctx, pet, config: pet.config || undefined });
    }
  } catch { /* the balance warning is optional; the pet still mounts */ }
  if (!balanceController || typeof balanceController.state !== 'function') {
    // Protected settings harnesses mount without the balance service.
    balanceController = {
      state: () => ({ status: 'unavailable', low: false, shouldAlert: false, amount: null, cents: null, currency: null, lastAlertAt: null, wasLow: false }),
      check: async () => {},
      setThreshold() {},
      stop() {},
    };
  }
  const balanceThreshold = () => pet.config?.balanceThreshold ?? defaultBalanceThreshold();
  const turns = new Map();
  let resumed = false;
  let lastObserved = null;
  const trackRootEvent = (session, event) => {
    if (typeof noteRootEvent !== 'function') return;
    try { noteRootEvent(turns, session, event, Date.now()); } catch {}
  };
  // Reconstructed start state: the latest still-running root turn, only after
  // the helper is actually ready. Subagents never reach this tracker.
  const resumeThinking = () => {
    if (resumed || typeof latestActive !== 'function') return;
    let active = null;
    try { active = latestActive(turns); } catch {}
    if (!active) return;
    try {
      if (pet.send({ state: 'thinking', sessionId: active.sessionId })) resumed = true;
    } catch {}
  };
  const autoStart = () => {
    if (typeof pet.autoStart !== 'function') return;
    try {
      const starting = pet.autoStart();
      if (starting && typeof starting.then === 'function') starting.then(resumeThinking, () => {});
    } catch { /* a failed auto-start is reported through helper status */ }
  };
  const audit = { seenEvents: 0, rootStarts: 0, rootEnds: 0, ignoredChild: 0, lastType: null, lastReason: null };
  const eventTypes = new Set(['turn/start', 'turn/end', 'approval/asked', 'approval/decided', 'assistant/message', 'tool/call', 'tool/result', 'step/start', 'step/end', 'user/message']);
  const turnReasons = new Set(['completed', 'max-tokens', 'error', 'aborted', 'blocked', 'interrupted', 'forked']);
  const dispatcher = createPermissionDispatcher(event => {
    lastObserved = event.state;
    pet.send(event);
  });
  // One application operation for both UI and agent. State belongs to this Host,
  // never to a browser tab. No global bridge, port or credentials are involved.
  const operate = async (action, value) => {
    if (action === 'status') return pet.status();
    if (action === 'inspect') return { ...pet.status(), lastObserved, ...pet.diagnostics() };
    if (action === 'audit') return { ...pet.status(), ...audit };
    if (action === 'debug-status') return { ...pet.status(), ...pet.debugStatus() };
    if (action === 'debug-enable' || action === 'debug-disable') {
      await pet.setDebugMode(action === 'debug-enable');
      return { ...pet.status(), ...pet.debugStatus() };
    }
    if (action === 'balance') {
      // Refresh before answering so a sign-in is visible immediately instead of
      // waiting for the five-minute poll.
      try { await balanceController.check?.(); } catch { /* state still answers */ }
      return { balance: balanceController.state(), threshold: balanceThreshold() };
    }
    if (action === 'set-threshold') {
      const threshold = normalizeBalanceThreshold(value);
      if (typeof pet.setBalanceThreshold === 'function') await pet.setBalanceThreshold(threshold);
      else if (pet.config) pet.config.balanceThreshold = threshold;
      balanceController.setThreshold?.(threshold);
      return { threshold };
    }
    if (action === 'set-sound') {
      if (typeof value !== 'boolean') throw new TypeError('Sound must be a boolean');
      if (typeof pet.setSound === 'function') await pet.setSound(value);
      else if (pet.config) pet.config.sound = value;
      return { sound: value };
    }
    if (action === 'test-notification') {
      pet.send({ state: 'done', sessionId: 'preview', title: 'Test notification', eventId: `test:${Date.now()}` });
      return pet.status();
    }
    if (!['enable', 'disable'].includes(action)) throw new Error('Unknown pet action');
    dispatcher.dispose();
    resumed = false;
    const wasRunning = Boolean(pet.status?.()?.running);
    const status = await pet.setEnabled(action === 'enable');
    if (action === 'enable' && !wasRunning && status?.running) resumeThinking();
    return status;
  };
  ctx.on('session/event', (session, event) => {
    trackRootEvent(session, event);
    audit.seenEvents++;
    audit.lastType = eventTypes.has(event.type) ? event.type : 'other';
    audit.lastReason = event.type === 'turn/end' && turnReasons.has(event.data?.reason?.kind) ? event.data.reason.kind : null;
    if (session.header?.origin === 'subagent' || session.header?.delegationDepth > 0) audit.ignoredChild++;
    else if (event.type === 'turn/start') audit.rootStarts++;
    else if (event.type === 'turn/end') audit.rootEnds++;
    dispatcher.accept(session, event);
  });
  ctx.on('session/disposed', session => dispatcher.sessionDisposed(session));
  ctx.on('dispose', async () => {
    dispatcher.dispose();
    try { balanceController.stop?.(); } catch { /* ignore */ }
    await pet.dispose();
  });
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/deepseek-pet', methods: ['GET', 'POST'], requestBody: 'buffered',
    async fetch(request) {
      try {
        let action = 'status';
        let value;
        if (request.method === 'POST') {
          // The carrier uses http://dsh.internal for Request.url. Validate the
          // original Host/Origin/auth headers through Connection, not that URL.
          const rejection = ctx.connection.requestRejection(request);
          if (rejection) return new Response('Request rejected', { status: rejection });
          if (request.headers.get('content-type') !== 'application/json')
            return new Response('Expected JSON', { status: 415 });
          // Read the bounded body first, then parse through the carrier Request
          // so the optional `value` stays in the host realm. A malformed body
          // throws into the catch below and becomes a bounded 400.
          const parsedRequest = request.clone();
          const text = await request.text();
          // 256 bytes; fall back to code units in sandboxes without Buffer.
          const size = typeof Buffer === 'undefined' ? text.length : Buffer.byteLength(text, 'utf8');
          if (size > 256) return new Response('Too large', { status: 413 });
          const parsed = await parsedRequest.json();
          action = parsed?.action;
          value = parsed?.value;
        }
        return Response.json(await operate(action, value), { headers: { 'Cache-Control': 'no-store' } });
      } catch { return Response.json({ error: 'Pet operation failed' }, { status: 400 }); }
    },
  }));
  ctx.effect(() => ctx.tools.register({
    name: 'desktop_pet',
    description: 'Read status, start, or stop this DSH instance’s desktop fish companion. Returns enabled/running status and any startup failure; inspect also reports observed and renderer-acknowledged moods and delivery counts.',
    parameters: { type: 'object', properties: { action: { type: 'string', enum: ['status', 'enable', 'disable', 'inspect', 'audit', 'debug-status', 'debug-enable', 'debug-disable', 'balance', 'set-threshold', 'set-sound', 'test-notification'], description: 'Debug actions read or toggle manual previews and test notifications; balance actions read or update the low-balance warning.' }, value: { oneOf: [{ type: 'object', properties: { currency: { type: 'string', enum: ['CNY'] }, amount: { type: 'number', exclusiveMinimum: 0 } }, required: ['currency', 'amount'], additionalProperties: false }, { type: 'boolean' }], description: 'Optional payload for set-threshold ({ currency: CNY, amount: positive number }) or set-sound (boolean).' } }, required: ['action'], additionalProperties: false },
    output: { schema: { type: 'object', properties: { enabled: { type: 'boolean' }, running: { type: 'boolean' }, error: { type: 'string' }, debugMode: { type: 'boolean' }, lastObserved: { oneOf: [{ type: 'string' }, { type: 'null' }] }, lastState: { oneOf: [{ type: 'string' }, { type: 'null' }] }, sent: { type: 'integer' }, received: { type: 'integer' }, seenEvents: { type: 'integer' }, rootStarts: { type: 'integer' }, rootEnds: { type: 'integer' }, ignoredChild: { type: 'integer' }, lastType: { oneOf: [{ type: 'string' }, { type: 'null' }] }, lastReason: { oneOf: [{ type: 'string' }, { type: 'null' }] }, balance: { oneOf: [{ type: 'object' }, { type: 'null' }] }, threshold: { type: 'object', properties: { currency: { type: 'string' }, amount: { type: 'number' } }, required: ['currency', 'amount'] }, sound: { type: 'boolean' } }, required: [], additionalProperties: false }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: async args => operate(args.action, args.value),
  }));
  // Persistent presence: if the saved state says enabled, boot the pet without
  // any user action, then reconstruct a running root turn as thinking.
  autoStart();
}
