const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The agent tool must accept the same value payload as the settings HTTP route;
// otherwise set-threshold/set-sound are unreachable from the model.
function mountHost() {
  let tool;
  const calls = [];
  class ManagedPet {
    constructor() {
      this.enabled = false;
      this.config = { balanceThreshold: { currency: 'CNY', amount: 5 }, sound: true };
    }
    status() { return { enabled: this.enabled, running: this.enabled }; }
    async setEnabled(enabled) { this.enabled = enabled; return this.status(); }
    async autoStart() { return this.status(); }
    send() { return true; }
    async dispose() {}
    async setSound(sound) { this.config.sound = sound; calls.push(['sound', sound]); }
    async setBalanceThreshold(threshold) { this.config.balanceThreshold = threshold; calls.push(['threshold', threshold]); }
  }
  const source = fs.readFileSync(path.resolve(__dirname, '../index.mjs'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export const inject = /m, 'const inject = ')
    .replace(/^export function apply\(/m, 'function apply(');
  const sandbox = {
    ManagedPet,
    createPermissionDispatcher: () => ({ dispose() {}, accept() {}, sessionDisposed() {} }),
    startBalance: () => ({ state: () => ({ status: 'unavailable' }), check: async () => {}, setThreshold() {}, stop() {} }),
    noteRootEvent() {},
    latestActive() { return null; },
    Request, Response, URL, AbortSignal,
  };
  vm.runInNewContext(`${source}\nthis.apply = apply;`, sandbox, { filename: 'index.mjs' });
  sandbox.apply({
    webApp: { getAdvertisedUrl: () => 'http://127.0.0.1:3080' },
    on() {}, effect(callback) { return callback(); },
    connection: {
      requestRejection() {},
      fetch: { register() { return () => {}; } },
    },
    tools: { register(value) { tool = value; return () => {}; } },
  });
  return { tool, calls };
}

const plain = value => JSON.parse(JSON.stringify(value));

test('the desktop_pet tool schema accepts the balance value payload', () => {
  const { tool } = mountHost();
  const parameters = tool.parameters;
  assert.equal(parameters.additionalProperties, false);
  assert.deepEqual([...parameters.required], ['action'], 'action stays the only required field');
  assert.ok(parameters.properties.value, 'a value property must exist for set-threshold/set-sound');
  const serialized = JSON.stringify(parameters.properties.value);
  assert.ok(serialized.includes('CNY'), 'the value schema describes the CNY threshold object');
  assert.ok(serialized.includes('boolean'), 'the value schema allows the sound boolean');
  assert.ok(parameters.properties.action.enum.includes('set-threshold'));
  assert.ok(parameters.properties.action.enum.includes('set-sound'));
  assert.ok(parameters.properties.action.enum.includes('test-notification'));
});

test('tool execute forwards the value to the balance operations', async () => {
  const { tool, calls } = mountHost();
  const updated = plain(await tool.execute({ action: 'set-threshold', value: { currency: 'CNY', amount: 9 } }));
  assert.equal(updated.threshold.amount, 9);
  assert.deepEqual(calls.at(-1), ['threshold', { currency: 'CNY', amount: 9 }]);
  const sound = plain(await tool.execute({ action: 'set-sound', value: false }));
  assert.equal(sound.sound, false);
  assert.deepEqual(calls.at(-1), ['sound', false]);
});
