const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const plain = value => JSON.parse(JSON.stringify(value));

function mount() {
  let tool;
  const handlers = new Map();
  class ManagedPet {
    status() { return { enabled: true, running: true }; }
    diagnostics() { return { lastState: 'sleeping', sent: 0, received: 1 }; }
    send() { return false; }
    async dispose() {}
  }
  const source = fs.readFileSync(path.resolve(__dirname, '../index.mjs'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export const inject = /m, 'const inject = ').replace(/^export function apply\(/m, 'function apply(');
  const box = { ManagedPet, createPermissionDispatcher: () => ({ accept() {}, dispose() {}, sessionDisposed() {} }), Request, Response, URL };
  vm.runInNewContext(`${source}\nthis.apply=apply;`, box);
  box.apply({
    webApp: { getAdvertisedUrl: () => 'http://127.0.0.1:3080' },
    on(name, handler) { handlers.set(name, handler); }, effect(callback) { return callback(); },
    connection: { requestRejection: () => undefined, fetch: { register() { return () => {}; } } },
    tools: { register(value) { tool = value; return () => {}; } },
  });
  return { tool, emit: (session, event) => handlers.get('session/event')(session, event) };
}
const empty = { enabled: true, running: true, seenEvents: 0, rootStarts: 0, rootEnds: 0, ignoredChild: 0, lastType: null, lastReason: null };

test('separate audit view reveals all observed event counts without changing normal status or inspect', async () => {
  const { tool } = mount();
  assert.ok(tool.parameters.properties.action.enum.includes('audit'), 'agent needs an audit operation distinct from frozen inspect and status contracts');
  assert.deepEqual(plain(await tool.execute({ action: 'audit' })), empty);
  assert.deepEqual(plain(await tool.execute({ action: 'status' })), { enabled: true, running: true });
  assert.deepEqual(plain(await tool.execute({ action: 'inspect' })), { enabled: true, running: true, lastObserved: null, lastState: 'sleeping', sent: 0, received: 1 });
});

test('audit counts root turn boundaries separately from filtered child event activity', async () => {
  const { tool, emit } = mount();
  const root = { id: 'PRIVATE_SESSION', header: {} };
  emit(root, { type: 'turn/start', seq: 1, data: { command: 'PRIVATE_COMMAND' } });
  emit({ id: 'child', header: { origin: 'subagent' } }, { type: 'turn/start', seq: 1, data: {} });
  emit({ id: 'deep', header: { delegationDepth: 2 } }, { type: 'turn/end', seq: 2, data: { reason: { kind: 'completed' } } });
  emit(root, { type: 'turn/end', seq: 3, data: { reason: { kind: 'completed' } } });
  assert.deepEqual(plain(await tool.execute({ action: 'audit' })), { enabled: true, running: true, seenEvents: 4, rootStarts: 1, rootEnds: 1, ignoredChild: 2, lastType: 'turn/end', lastReason: 'completed' });
});

test('audit sanitizes event kinds and turn reasons instead of exposing arbitrary event content', async () => {
  const { tool, emit } = mount();
  const root = { id: 'PRIVATE_SESSION', header: { parentSession: 'fork-lineage-not-a-child' } };
  emit(root, { type: 'PRIVATE_CUSTOM_EVENT', seq: 1, data: { reason: 'PRIVATE_REASON' } });
  const unknown = plain(await tool.execute({ action: 'audit' }));
  assert.equal(unknown.seenEvents, 1);
  assert.equal(unknown.lastType, 'other');
  assert.equal(unknown.lastReason, null);
  emit(root, { type: 'turn/end', seq: 2, data: { reason: { kind: 'PRIVATE_REASON' } } });
  const result = plain(await tool.execute({ action: 'audit' }));
  assert.equal(result.rootEnds, 1, 'fork lineage must not be treated as a delegated child');
  assert.equal(result.lastType, 'turn/end');
  assert.equal(result.lastReason, null);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});
