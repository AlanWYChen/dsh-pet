const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Inspect actual component output/actions only. Effects are inert: no DOM,
// browser preview, screenshot, helper process or layout engine is simulated.
function setting(language, running) {
  let definition, registration, stateIndex = 0;
  const dictionaries = new Map(), requests = [];
  const React = {
    createElement(type, props, ...children) { return { type, props: props || {}, children }; },
    useSyncExternalStore() {},
    useState(initial) { return [stateIndex++ === 0 ? { enabled: running, running } : initial, () => {}]; },
    useRef: value => ({ current: value }), useEffect() {},
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../client.js'), 'utf8'), {
    window: { __ModuleLoader__: { load(value) { definition = value; } } },
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ enabled: !running, running: !running }) }; },
  });
  definition.factory(name => { assert.equal(name, 'react'); return React; }).apply({
    effect(callback) { return callback(); },
    locale: {
      register(namespace, locale, dictionary) { dictionaries.set(`${namespace}:${locale}`, dictionary); return () => {}; },
      bind(namespace) { return key => dictionaries.get(`${namespace}:${language}`)?.[key] ?? key; },
    },
    slots: { inject(_slot, callback) { return callback(); }, register(options, component) { registration = { options, component }; return () => {}; } },
  });
  const root = registration.component();
  function walk(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(walk);
    return [node, ...(node.children || []).flatMap(walk)];
  }
  const nodes = walk(root);
  function text(node) { if (Array.isArray(node)) return node.map(text).join(''); return node && typeof node === 'object' ? text(node.children || []) : node == null || node === false ? '' : String(node); }
  return { nodes, text, requests, dictionary: dictionaries.get(`desktop-pet:${language}`), registration };
}

for (const language of ['en', 'zh']) {
  for (const running of [false, true]) {
    test(`${language} ${running ? 'running' : 'stopped'} pet exposes explicit localized ${running ? 'Stop' : 'Start'} action`, async () => {
      const page = setting(language, running), key = running ? 'stop' : 'start';
      const label = page.dictionary[key];
      assert.equal(typeof label, 'string', `dictionary must expose explicit ${key} action text`);
      assert.ok(label.trim());
      if (language === 'en') assert.equal(label, running ? 'Stop' : 'Start');
      else assert.notEqual(label, running ? 'Stop' : 'Start', 'Chinese action must be localized');
      const buttons = page.nodes.filter(node => node.type === 'button');
      assert.ok(!buttons.some(node => node.props.role === 'switch'), 'Start/Stop are ordinary action buttons, not a text switch');
      const button = buttons.find(node => page.text(node) === label && !node.props.disabled);
      assert.ok(button, `an enabled ${key} action must be visible`);
      assert.equal(button.props.type, 'button');
      assert.equal(typeof button.props.onClick, 'function');
      await button.props.onClick();
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(page.requests.length, 1, 'click invokes exactly one Host operation');
      assert.equal(page.requests[0].url, '/api/deepseek-pet');
      assert.equal(page.requests[0].options.method, 'POST');
      assert.deepEqual(JSON.parse(page.requests[0].options.body), { action: running ? 'disable' : 'enable' });
    });
  }
}

test('settings uses a themed bordered card and outlined rounded-rectangular action button', () => {
  const page = setting('en', false);
  const css = page.nodes.filter(node => node.type === 'style').map(node => page.text(node)).join('\n');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, declarations]) => ({ selector: selector.trim(), declarations }));
  const renderedClasses = new Set(page.nodes.flatMap(node => (node.props.className || '').split(/\s+/)).filter(Boolean));
  const card = rules.find(rule => [...renderedClasses].some(name => rule.selector === `.${name}`)
    && /(?:^|;)\s*border\s*:\s*(?!0\b|none\b)[^;]+/i.test(rule.declarations)
    && /border-radius\s*:\s*[^;]+/.test(rule.declarations));
  assert.ok(card, 'a rendered settings card needs a full outline and rounded corners, not only a row underline');
  assert.match(card.declarations, /var\(--dsw-alias-/, 'card inherits DSH theme tokens');
  const button = rules.find(rule => /(?:^|\s|\.)button(?:\s|$)/.test(rule.selector)
    && /(?:^|;)\s*border\s*:\s*(?!0\b|none\b)[^;]+/i.test(rule.declarations));
  assert.ok(button, 'action buttons retain a visible outline');
  const radius = button.declarations.match(/border-radius\s*:\s*(\d+(?:\.\d+)?)px\s*(?:;|$)/);
  assert.ok(radius, 'action uses an explicit small rounded-rectangle radius');
  assert.ok(Number(radius[1]) > 0 && Number(radius[1]) <= 12, 'avoid the old 16px pill radius');
  assert.match(button.declarations, /var\(--dsw-alias-/, 'button inherits DSH theme tokens');
});
