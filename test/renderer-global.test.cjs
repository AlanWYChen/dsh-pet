const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Actual Electron diagnostic confirmed contextBridge's exposed `pet` global
// collides with a top-level renderer `const pet`, aborting the script before
// event subscription. Preserve the nonconfigurable real-global boundary here.
test('renderer loads beside the contextBridge pet global and applies actual mood events', () => {
  const nodes = Object.fromEntries(['pet', 'notification', 'character', 'eyebrow', 'message', 'detail', 'menu', 'bubble', 'ack'].map(id => [id, {
    dataset: {}, addEventListener() {}, contains: () => false,
  }]));
  const ocean = { addEventListener() {}, matches: () => false };
  const acknowledgements = [];
  let subscriber;
  const api = Object.freeze({
    onEvent(callback) { subscriber = callback; },
    rendered(state) { acknowledgements.push(state); },
    menu() {}, open() {}, acknowledge() {},
  });
  const context = vm.createContext({
    document: { getElementById: id => nodes[id], querySelector: () => ocean, addEventListener() {}, activeElement: null },
  });
  context.window = context;
  Object.defineProperty(context, 'pet', { value: api, configurable: false, writable: false, enumerable: true });
  assert.doesNotThrow(() => vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../src/pet.js'), 'utf8'), context), 'renderer must not redeclare the contextBridge global API as a top-level lexical binding');
  assert.equal(typeof subscriber, 'function', 'actual renderer must subscribe after loading');
  subscriber({ state: 'thinking' });
  assert.equal(nodes.pet.dataset.state, 'thinking');
  assert.ok(nodes.character.src.endsWith('active/thinking.png'));
  subscriber({ state: 'done' });
  assert.equal(nodes.pet.dataset.state, 'done');
  assert.ok(nodes.character.src.endsWith('active/complete.png'));
  assert.deepEqual(acknowledgements, ['thinking', 'done']);
  assert.equal(context.pet, api, 'rendering must preserve the host API global');
});
