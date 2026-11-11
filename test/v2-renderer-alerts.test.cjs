const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.resolve(__dirname, '../src/pet.js'), 'utf8');

function audioHarness() {
  const starts = [];
  class Param {
    constructor() { this.value = 0; }
    setValueAtTime(value) { this.value = value; return this; }
    linearRampToValueAtTime(value) { this.value = value; return this; }
    exponentialRampToValueAtTime(value) { this.value = value; return this; }
  }
  class Node {
    constructor() { this.frequency = new Param(); this.gain = new Param(); }
    connect(target) { return target; }
    start() { starts.push(this); }
    stop() {}
  }
  class FakeAudioContext {
    constructor() { this.currentTime = 0; this.destination = {}; this.state = 'running'; FakeAudioContext.created++; }
    createOscillator() { return new Node(); }
    createGain() { return new Node(); }
    resume() { return Promise.resolve(); }
    close() { this.state = 'closed'; }
  }
  FakeAudioContext.created = 0;
  return { FakeAudioContext, starts };
}

function load({ audio = true } = {}) {
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
  const harness = audio ? audioHarness() : null;
  if (harness) {
    context.AudioContext = harness.FakeAudioContext;
    context.webkitAudioContext = harness.FakeAudioContext;
  }
  vm.runInContext(script, context);
  return { nodes, get subscriber() { return subscriber; }, acknowledgements, context, starts: harness ? harness.starts : [] };
}

test('an alert reveals its detail without hover and one chime plays per alert', () => {
  const renderer = load({ audio: true });
  assert.equal(typeof renderer.subscriber, 'function');
  renderer.subscriber({ state: 'thinking' });
  assert.equal(renderer.starts.length, 0, 'thinking is not an alert');
  assert.notEqual(renderer.nodes.pet.dataset.alert, 'true');

  renderer.subscriber({ state: 'done', sound: true });
  assert.equal(renderer.starts.length, 1, 'completion chimes once');
  assert.equal(renderer.nodes.pet.dataset.alert, 'true');
  assert.equal(renderer.nodes.notification.hidden, false);

  renderer.subscriber({ state: 'done', sound: true });
  assert.equal(renderer.starts.length, 2, 'each new alert chimes exactly once');

  renderer.subscriber({ state: 'permission', sound: false });
  assert.equal(renderer.starts.length, 2, 'sound:false stays silent');
  assert.equal(renderer.nodes.pet.dataset.alert, 'true');

  renderer.subscriber({ state: 'low-balance', sound: true });
  assert.equal(renderer.starts.length, 3, 'a balance alert chimes too');
});

test('dismissing an alert hides it and clears the alert treatment', () => {
  const renderer = load({ audio: false });
  renderer.subscriber({ state: 'done' });
  assert.equal(renderer.nodes.notification.hidden, false);
  renderer.nodes.ack.onclick();
  assert.equal(renderer.nodes.notification.hidden, true);
  assert.notEqual(renderer.nodes.pet.dataset.alert, 'true');
});

test('alerts never throw when the renderer has no AudioContext', () => {
  const renderer = load({ audio: false });
  assert.doesNotThrow(() => renderer.subscriber({ state: 'done', sound: true }));
  assert.equal(renderer.nodes.notification.hidden, false);
});
