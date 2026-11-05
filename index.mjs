import { ManagedPet } from './src/managed-helper.mjs';
import { createPermissionDispatcher } from './dsh-plugin.mjs';
export const inject = ['connection', 'webApp', 'tools'];

export function apply(ctx) {
  const pet = new ManagedPet({ url: ctx.webApp.getAdvertisedUrl() });
  let lastObserved = null;
  const audit = { seenEvents: 0, rootStarts: 0, rootEnds: 0, ignoredChild: 0, lastType: null, lastReason: null };
  const eventTypes = new Set(['turn/start', 'turn/end', 'approval/asked', 'approval/decided', 'assistant/message', 'tool/call', 'tool/result', 'step/start', 'step/end', 'user/message']);
  const turnReasons = new Set(['completed', 'max-tokens', 'error', 'aborted', 'blocked', 'interrupted', 'forked']);
  const dispatcher = createPermissionDispatcher(event => {
    lastObserved = event.state;
    pet.send(event);
  });
  // One application operation for both UI and agent. State belongs to this Host,
  // never to a browser tab. No global bridge, port or credentials are involved.
  const operate = async action => {
    if (action === 'status') return pet.status();
    if (action === 'inspect') return { ...pet.status(), lastObserved, ...pet.diagnostics() };
    if (action === 'audit') return { ...pet.status(), ...audit };
    if (action === 'debug-status') return { ...pet.status(), ...pet.debugStatus() };
    if (action === 'debug-enable' || action === 'debug-disable') {
      await pet.setDebugMode(action === 'debug-enable');
      return { ...pet.status(), ...pet.debugStatus() };
    }
    if (!['enable', 'disable'].includes(action)) throw new Error('Unknown pet action');
    dispatcher.dispose();
    return pet.setEnabled(action === 'enable');
  };
  ctx.on('session/event', (session, event) => {
    audit.seenEvents++;
    audit.lastType = eventTypes.has(event.type) ? event.type : 'other';
    audit.lastReason = event.type === 'turn/end' && turnReasons.has(event.data?.reason?.kind) ? event.data.reason.kind : null;
    if (session.header?.origin === 'subagent' || session.header?.delegationDepth > 0) audit.ignoredChild++;
    else if (event.type === 'turn/start') audit.rootStarts++;
    else if (event.type === 'turn/end') audit.rootEnds++;
    dispatcher.accept(session, event);
  });
  ctx.on('session/disposed', session => dispatcher.sessionDisposed(session));
  ctx.on('dispose', async () => { dispatcher.dispose(); await pet.dispose(); });
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/deepseek-pet', methods: ['GET', 'POST'], requestBody: 'buffered',
    async fetch(request) {
      try {
        let action = 'status';
        if (request.method === 'POST') {
          // The carrier uses http://dsh.internal for Request.url. Validate the
          // original Host/Origin/auth headers through Connection, not that URL.
          const rejection = ctx.connection.requestRejection(request);
          if (rejection) return new Response('Request rejected', { status: rejection });
          if (request.headers.get('content-type') !== 'application/json')
            return new Response('Expected JSON', { status: 415 });
          const text = await request.text();
          if (text.length > 128) return new Response('Too large', { status: 413 });
          action = JSON.parse(text).action;
        }
        return Response.json(await operate(action), { headers: { 'Cache-Control': 'no-store' } });
      } catch { return Response.json({ error: 'Pet operation failed' }, { status: 400 }); }
    },
  }));
  ctx.effect(() => ctx.tools.register({
    name: 'desktop_pet',
    description: 'Read status, start, or stop this DSH instance’s desktop fish companion. Returns enabled/running status and any startup failure; inspect also reports observed and renderer-acknowledged moods and delivery counts.',
    parameters: { type: 'object', properties: { action: { type: 'string', enum: ['status', 'enable', 'disable', 'inspect', 'audit', 'debug-status', 'debug-enable', 'debug-disable'], description: 'Debug actions read or toggle manual previews and test notifications.' } }, required: ['action'], additionalProperties: false },
    output: { schema: { type: 'object', properties: { enabled: { type: 'boolean' }, running: { type: 'boolean' }, error: { type: 'string' }, debugMode: { type: 'boolean' }, lastObserved: { oneOf: [{ type: 'string' }, { type: 'null' }] }, lastState: { oneOf: [{ type: 'string' }, { type: 'null' }] }, sent: { type: 'integer' }, received: { type: 'integer' }, seenEvents: { type: 'integer' }, rootStarts: { type: 'integer' }, rootEnds: { type: 'integer' }, ignoredChild: { type: 'integer' }, lastType: { oneOf: [{ type: 'string' }, { type: 'null' }] }, lastReason: { oneOf: [{ type: 'string' }, { type: 'null' }] } }, required: ['enabled', 'running'], additionalProperties: false }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: async args => operate(args.action),
  }));
}
