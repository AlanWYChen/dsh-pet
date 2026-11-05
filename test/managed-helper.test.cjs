const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

class Child extends EventEmitter {
  connected = true;
  exitCode = null;
  signalCode = null;
  messages = [];
  kills = [];
  stderr = { resume() {} };
  send(message, callback) {
    this.messages.push(message);
    callback?.(null);
    if (message.type === 'shutdown' && !this.ignoreShutdown) queueMicrotask(() => this.exit(0));
  }
  kill(signal = 'SIGTERM') { this.kills.push(signal); this.exit(null, signal); }
  exit(code = 0, signal = null) {
    this.connected = false;
    this.exitCode = code;
    this.signalCode = signal;
    this.emit('exit', code, signal);
  }
}
async function setup(behavior = child => queueMicrotask(() => child.emit('message', { type: 'ready' }))) {
  const { ManagedPet } = await import('../src/managed-helper.mjs');
  const children = [], calls = [];
  const pet = new ManagedPet({ url: 'http://127.0.0.1:3080', readyTimeout: 30, stopTimeout: 20,
    spawn(...args) { const child = new Child(); children.push(child); calls.push(args); behavior(child); return child; } });
  return { pet, children, calls };
}

test('managed helper starts once, transports events, and gracefully stops', async () => {
  const { pet, children, calls } = await setup();
  assert.deepEqual(pet.status(), { enabled: false, running: false });
  assert.equal(pet.send({ state: 'thinking' }), false);
  assert.deepEqual(await pet.setEnabled(true), { enabled: true, running: true });
  await pet.setEnabled(true);
  assert.equal(children.length, 1);
  assert.equal(calls[0][2].env.DSH_PET_MANAGED, '1');
  assert.equal(calls[0][2].env.DSH_PET_URL, 'http://127.0.0.1:3080/');
  assert.equal(calls[0][2].env.ELECTRON_RUN_AS_NODE, undefined);
  assert.deepEqual(calls[0][2].stdio, ['ignore', 'ignore', 'pipe', 'ipc']);
  assert.equal(pet.send({ state: 'done' }), true);
  assert.deepEqual(children[0].messages[0], { type: 'pet:event', event: { state: 'done' } });
  assert.deepEqual(await pet.setEnabled(false), { enabled: false, running: false });
  assert.equal(children[0].messages.at(-1).type, 'shutdown');
  assert.equal(children[0].kills.length, 0);
  await pet.dispose();
});

test('managed helper handles startup error, early exit and timeout without listener leaks', async () => {
  for (const [behavior, expected] of [
    [child => queueMicrotask(() => child.emit('error', new Error('private path'))), 'Pet process failed'],
    [child => queueMicrotask(() => child.exit(1)), 'Pet exited before ready'],
    [() => {}, 'Pet startup timed out'],
  ]) {
    const { pet, children } = await setup(behavior);
    const status = await pet.setEnabled(true);
    assert.deepEqual(status, { enabled: true, running: false, error: expected });
    assert.equal(pet.child, null);
    assert.equal(children[0].listenerCount('message'), 0);
    await pet.dispose();
  }
});

test('managed helper contains synchronous spawn failure', async () => {
  const { ManagedPet } = await import('../src/managed-helper.mjs');
  const pet = new ManagedPet({ url: 'http://localhost:3080', spawn() { throw new Error('private detail'); } });
  assert.deepEqual(await pet.setEnabled(true), { enabled: true, running: false, error: 'Pet process failed' });
  await pet.dispose();
});

test('managed helper serializes concurrent enable disable enable', async () => {
  const { pet, children } = await setup();
  const results = await Promise.all([pet.setEnabled(true), pet.setEnabled(false), pet.setEnabled(true)]);
  assert.deepEqual(results.map(s => s.running), [true, false, true]);
  assert.equal(children.length, 2);
  assert.equal(children[0].connected, false);
  await pet.dispose();
  assert.equal(children[1].connected, false);
});

test('managed helper disposal disarms queued and future enables', async () => {
  const { pet, children } = await setup();
  const enable = pet.setEnabled(true);
  const dispose = pet.dispose();
  await Promise.all([enable, dispose]);
  assert.equal(children.length, 0);
  assert.deepEqual(await pet.setEnabled(true), { enabled: false, running: false });
  await pet.dispose();
});

test('managed helper reports unexpected exit and permits explicit restart', async () => {
  const { pet, children } = await setup();
  await pet.setEnabled(true);
  children[0].exit(1);
  assert.deepEqual(pet.status(), { enabled: true, running: false, error: 'Pet process exited' });
  await pet.setEnabled(true);
  assert.equal(children.length, 2);
  assert.equal(pet.status().running, true);
  await pet.dispose();
});

test('managed helper recovers from disconnected IPC and force-stops unresponsive child', async () => {
  const { pet, children } = await setup();
  await pet.setEnabled(true);
  children[0].connected = false;
  children[0].emit('disconnect');
  assert.equal(pet.status().error, 'Pet IPC disconnected');
  await pet.setEnabled(true);
  assert.equal(children[0].kills[0], 'SIGTERM');
  children[1].ignoreShutdown = true;
  await pet.setEnabled(false);
  assert.deepEqual(children[1].kills, ['SIGKILL']);
  assert.deepEqual(pet.status(), { enabled: false, running: false });
  await pet.dispose();
});

test('managed helper contains IPC send errors', async () => {
  const { pet, children } = await setup();
  await pet.setEnabled(true);
  const original = children[0].send;
  children[0].send = (_message, callback) => callback(new Error('private detail'));
  assert.equal(pet.send({ state: 'done' }), true);
  assert.equal(pet.status().error, 'Pet IPC send failed');
  children[0].send = original;
  await pet.dispose();
});
