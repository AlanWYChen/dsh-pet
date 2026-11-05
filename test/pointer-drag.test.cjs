const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function renderer() {
  const listeners = new Map(), sent = [];
  const ocean = {
    addEventListener(type, handler) { listeners.set(type, handler); },
    setPointerCapture() {}, hasPointerCapture() { return false; }, releasePointerCapture() {},
    contains() { return false; }, matches() { return false; },
  };
  const nodes = Object.fromEntries(['pet','notification','character','eyebrow','message','detail','menu','bubble','ack'].map(id => [id, { dataset: {}, addEventListener() {}, contains() { return false; } }]));
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/pet.js'), 'utf8'), {
    document: { getElementById: id => nodes[id], querySelector: () => ocean, addEventListener() {}, activeElement: null },
    window: { pet: { onEvent() {}, drag: () => sent.push('drag'), home: () => sent.push('home'), menu: () => sent.push('menu'), open: () => sent.push('open'), acknowledge: () => sent.push('ack') } },
  });
  function emit(type, x = 80) { listeners.get(type)?.({ clientX:x, clientY:80, screenX:x, screenY:80, button:0, pointerId:1, target: { closest: () => null }, preventDefault() {} }); }
  return { emit, sent, listeners, nodes };
}

test('ocean uses Electron native CSS dragging while buttons remain no-drag', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../src/pet.css'), 'utf8');
  const ocean = css.match(/(?:^|})\s*\.ocean\s*\{([^}]*)\}/)?.[1];
  const buttons = css.match(/(?:^|})\s*button\s*\{([^}]*)\}/)?.[1];
  assert.ok(ocean, 'pet character needs its native drag surface');
  assert.match(ocean, /(?:-webkit-)?app-region\s*:\s*drag\s*(?:;|$)/, 'ocean delegates movement to Electron');
  assert.match(buttons || '', /(?:-webkit-)?app-region\s*:\s*no-drag\s*(?:;|$)/, 'buttons remain clickable within native drag regions');
});

test('renderer does not intercept custom pointer dragging or double-click parking', () => {
  const { emit, sent, listeners } = renderer();
  emit('pointerdown'); emit('pointermove', 110); emit('pointerup', 110); emit('dblclick', 110);
  assert.deepEqual(sent, [], 'dragging/double-click must not call custom window-movement APIs');
  for (const name of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'dblclick'])
    assert.equal(listeners.has(name), false, `${name} must be left to native window handling`);
});

test('renderer keeps menu, open and acknowledge controls', () => {
  const { nodes, sent } = renderer();
  nodes.menu.onclick(); nodes.bubble.onclick(); nodes.ack.onclick();
  assert.deepEqual(sent, ['menu', 'open', 'ack']);
});
