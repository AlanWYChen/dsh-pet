const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = name => fs.readFileSync(path.resolve(__dirname, '../src', name), 'utf8');
const rules = () => [...source('pet.css').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, css]) => ({ selector: selector.trim(), css }));
const property = (css, key) => new RegExp(`(?:^|;)\\s*${key}\\s*:\\s*([^;]+)`).exec(css)?.[1].trim();

test('default speech bubble is compact with one short message, not a permanent multi-line status panel', () => {
  const css = rules();
  const bubble = css.find(rule => rule.selector === '.bubble');
  assert.ok(bubble, 'bubble has its own sizing contract');
  const height = property(bubble.css, 'max-height');
  assert.match(height || '', /^\d+(?:\.\d+)?px$/, 'default bubble must have a bounded pixel height');
  assert.ok(parseFloat(height) <= 48, 'default bubble height must not exceed 48px');
  const widthRule = css.find(rule => rule.selector === '.notification' && /max-width\s*:/.test(rule.css)) || bubble;
  const width = property(widthRule.css, 'max-width');
  assert.match(width || '', /^\d+(?:\.\d+)?px$/, 'bubble or its wrapper has a bounded width');
  assert.ok(parseFloat(width) <= 220, 'default bubble width must not exceed 220px');
  const eyebrow = css.find(rule => rule.selector === '#eyebrow');
  assert.equal(property(eyebrow?.css || '', 'display'), 'none', 'decorative eyebrow is not permanently shown');
  const detail = css.find(rule => rule.selector === '#detail');
  assert.equal(property(detail?.css || '', 'display'), 'none', 'secondary details are hidden in the compact default');
  const message = css.find(rule => rule.selector === '#message');
  assert.equal(property(message?.css || '', 'white-space'), 'nowrap', 'default message stays on one short line');
});

test('secondary bubble detail is revealed for pointer hover and keyboard focus only', () => {
  const css = rules();
  for (const interaction of [':hover', ':focus-within']) {
    assert.ok(css.some(rule => rule.selector.includes(interaction) && rule.selector.includes('#detail') && /display\s*:\s*(?:block|inline|flex)/.test(rule.css)), `${interaction} reveals detail`);
  }
});

function renderer() {
  function element() { return { dataset: {}, handlers: new Map(), addEventListener(type, callback) { this.handlers.set(type, callback); }, contains: () => false, matches: () => false }; }
  const nodes = Object.fromEntries(['pet','notification','character','eyebrow','message','detail','menu','bubble','ack'].map(id => [id, element()]));
  const ocean = element(); let accept;
  const context = vm.createContext({ document: { getElementById: id => nodes[id], querySelector: () => ocean, addEventListener() {}, activeElement: null } });
  context.window = context;
  Object.defineProperty(context, 'pet', { configurable: false, writable: false, value: { onEvent(callback) { accept = callback; }, rendered() {}, acknowledge() {}, menu() {}, open() {} } });
  vm.runInContext(source('pet.js'), context);
  return { nodes, ocean, accept };
}

test('all actively rendered moods use the normalized active PNG set, including initial HTML', () => {
  const { nodes, accept } = renderer();
  const expected = { sleeping: 'sleeping', thinking: 'thinking', done: 'complete', permission: 'permission', hungry: 'hungry', error: 'hungry' };
  for (const [state, image] of Object.entries(expected)) {
    accept({ state });
    assert.equal(nodes.character.src, `../assets/active/${image}.png`, `${state} uses its normalized cutout`);
    assert.ok(nodes.message.textContent.length <= 30 && !nodes.message.textContent.includes('\n'), 'one short default message');
  }
  assert.match(source('pet.html'), /id="character"[^>]*src="\.\.\/assets\/active\/sleeping\.png"/, 'initial sleeping image uses the same active assets');
});

test('permission bubble remains visible without hover or focus until a resolved mood arrives', () => {
  const { nodes, ocean, accept } = renderer();
  accept({ state: 'permission' });
  assert.equal(nodes.notification.hidden, false);
  ocean.handlers.get('pointerenter')?.({});
  nodes.pet.handlers.get('pointerleave')?.({});
  nodes.pet.handlers.get('focusout')?.({ relatedTarget: null });
  assert.equal(nodes.notification.hidden, false, 'losing interaction must not hide a pending permission');
  accept({ state: 'thinking' });
  assert.equal(nodes.notification.hidden, true, 'nonalert mood returns to compact idle visibility');
});
