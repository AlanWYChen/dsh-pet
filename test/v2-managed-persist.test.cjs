const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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

function tempConfig(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-pet-managed-'));
  const file = path.join(dir, 'pet.json');
  if (contents !== undefined) fs.writeFileSync(file, typeof contents === 'string' ? contents : JSON.stringify(contents));
  return { dir, file };
}

function readConfig(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function setup({ configFile, behavior, spawn } = {}) {
  const { ManagedPet } = await import('../src/managed-helper.mjs');
  const children = [], calls = [];
  const pet = new ManagedPet({
    url: 'http://127.0.0.1:3080',
    configFile,
    readyTimeout: 50,
    stopTimeout: 20,
    spawn: spawn || ((...args) => {
      const child = new Child();
      children.push(child);
      calls.push(args);
      (behavior || (child => queueMicrotask(() => child.emit('message', { type: 'ready' }))))(child);
      return child;
    }),
  });
  return { pet, children, calls };
}

test('without a configFile the helper keeps in-memory behavior and never auto-starts', async () => {
  const { pet, children } = await setup();
  assert.equal(pet.configFile, undefined);
  assert.deepEqual(await pet.autoStart(), { enabled: false, running: false });
  assert.equal(children.length, 0);
  assert.deepEqual(await pet.setEnabled(true), { enabled: true, running: true });
  assert.equal(children.length, 1);
  await pet.dispose();
});

test('a saved enabled state auto-starts exactly once on host boot', async () => {
  const { file } = tempConfig({ version: 1, enabled: true, position: null, sound: true, balanceThreshold: { currency: 'CNY', amount: 5 } });
  const { pet, children, calls } = await setup({ configFile: file });
  assert.deepEqual(await pet.autoStart(), { enabled: true, running: true });
  assert.equal(children.length, 1);
  assert.equal(calls[0][2].env.DSH_PET_MANAGED, '1');
  assert.deepEqual(await pet.autoStart(), { enabled: true, running: true });
  assert.equal(children.length, 1, 'autoStart must not spawn a second helper');
  await pet.dispose();
});

test('a saved stopped state does nothing on boot', async () => {
  const { file } = tempConfig({ version: 1, enabled: false });
  const { pet, children } = await setup({ configFile: file });
  assert.deepEqual(await pet.autoStart(), { enabled: false, running: false });
  assert.equal(children.length, 0);
  await pet.dispose();
});

test('enable and disable persist immediately', async () => {
  const { file } = tempConfig({ version: 1, enabled: false });
  const { pet } = await setup({ configFile: file });
  await pet.setEnabled(true);
  assert.equal(readConfig(file).enabled, true);
  await pet.setEnabled(false);
  assert.equal(readConfig(file).enabled, false);
  await pet.dispose();
});

test('a failed auto-start records the error, persists enabled, and does not retry in a loop', async () => {
  const { file } = tempConfig({ version: 1, enabled: true });
  let attempts = 0;
  const { pet } = await setup({
    configFile: file,
    spawn() { attempts++; throw new Error('private path'); },
  });
  const status = await pet.autoStart();
  assert.deepEqual(status, { enabled: true, running: false, error: 'Pet process failed' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(attempts, 1, 'one boot attempt, no tight retry loop');
  assert.equal(readConfig(file).enabled, true, 'the preference survives a failed start');
  await pet.dispose();
});

test('a reported drag position is persisted', async () => {
  const { file } = tempConfig({ version: 1, enabled: true });
  const { pet, children } = await setup({ configFile: file });
  await pet.autoStart();
  children[0].emit('message', { type: 'pet:position', x: 111, y: 222 });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(readConfig(file).position, { x: 111, y: 222 });
  await pet.dispose();
});

test('a saved position is passed to the helper for restoration', async () => {
  const { file } = tempConfig({ version: 1, enabled: false, position: { x: 42, y: 84 } });
  const { pet, calls } = await setup({ configFile: file });
  await pet.setEnabled(true);
  assert.deepEqual(JSON.parse(calls[0][2].env.DSH_PET_POSITION), { x: 42, y: 84 });
  await pet.dispose();
});

test('a corrupt config is treated as stopped rather than crashing', async () => {
  const { file } = tempConfig('{ broken');
  const { pet, children } = await setup({ configFile: file });
  assert.deepEqual(await pet.autoStart(), { enabled: false, running: false });
  assert.equal(children.length, 0);
  await pet.dispose();
});
