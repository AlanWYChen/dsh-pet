const { test } = require('node:test');
const assert = require('node:assert/strict');

async function tracker() {
  return import('../src/resume.mjs');
}

test('root turn starts are tracked and ends are forgotten', async () => {
  const { noteRootEvent, latestActive } = await tracker();
  const turns = new Map();
  const session = { id: 'chat', header: {} };
  noteRootEvent(turns, session, { type: 'turn/start' }, 100);
  assert.deepEqual(latestActive(turns), { sessionId: 'chat', at: 100 });
  noteRootEvent(turns, session, { type: 'tool/call' }, 150);
  assert.deepEqual(latestActive(turns), { sessionId: 'chat', at: 100 }, 'unrelated events do not refresh a turn');
  noteRootEvent(turns, session, { type: 'turn/end' }, 200);
  assert.equal(latestActive(turns), null);
});

test('the most recently started root turn wins', async () => {
  const { noteRootEvent, latestActive } = await tracker();
  const turns = new Map();
  noteRootEvent(turns, { id: 'first', header: {} }, { type: 'turn/start' }, 100);
  noteRootEvent(turns, { id: 'second', header: {} }, { type: 'turn/start' }, 300);
  noteRootEvent(turns, { id: 'first', header: {} }, { type: 'turn/start' }, 200);
  assert.deepEqual(latestActive(turns), { sessionId: 'second', at: 300 });
  noteRootEvent(turns, { id: 'second', header: {} }, { type: 'turn/end' }, 400);
  assert.deepEqual(latestActive(turns), { sessionId: 'first', at: 200 });
});

test('subagent work never produces a resume state', async () => {
  const { noteRootEvent, latestActive } = await tracker();
  const turns = new Map();
  noteRootEvent(turns, { id: 'child', header: { origin: 'subagent' } }, { type: 'turn/start' }, 100);
  noteRootEvent(turns, { id: 'deeper', header: { delegationDepth: 1 } }, { type: 'turn/start' }, 200);
  assert.equal(latestActive(turns), null);
  noteRootEvent(turns, { id: 'root', header: {} }, { type: 'turn/start' }, 300);
  noteRootEvent(turns, { id: 'other-child', header: { delegationDepth: 2 } }, { type: 'turn/end' }, 400);
  assert.deepEqual(latestActive(turns), { sessionId: 'root', at: 300 });
});

test('an empty tracker has no resume state', async () => {
  const { latestActive } = await tracker();
  assert.equal(latestActive(new Map()), null);
});
