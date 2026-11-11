const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const tick = () => new Promise(resolve => setImmediate(resolve));

// Minimal hooks runtime: mount effects once, no re-render. Enough to observe the
// settings page's network contract and its controls without a browser shell.
function mountClient(language = 'en') {
  const fetches = [];
  let definition;
  let component;
  const dictionaries = new Map();
  const React = {
    createElement(type, props, ...children) { return { type, props: props || {}, children: children.flat(Infinity) }; },
    useState(initial) { return [initial, () => {}]; },
    useEffect(effect) { effect(); },
    useRef(value) { return { current: value }; },
    useMemo(factory) { return factory(); },
    useCallback(fn) { return fn; },
    useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot(); },
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../client.js'), 'utf8');
  const sandbox = {
    fetch: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : null;
      fetches.push({ url, body, method: options.method || 'GET' });
      if (body?.action === 'balance') return { ok: true, json: async () => ({ balance: { status: 'ready', amount: 3, currency: 'CNY' }, threshold: { currency: 'CNY', amount: 5 } }) };
      if (body?.action === 'debug-status') return { ok: true, json: async () => ({ debugMode: false }) };
      return { ok: true, json: async () => ({ enabled: true, running: true }) };
    },
    window: { __ModuleLoader__: { load(value) { definition = value; } }, addEventListener() {}, removeEventListener() {} },
    console,
  };
  vm.runInNewContext(source, sandbox, { filename: 'client.js' });
  const client = definition.factory(name => name === 'react' ? React : undefined);
  const ctx = {
    effect(callback) { return callback(); },
    locale: {
      register(namespace, locale, dictionary) { dictionaries.set(`${namespace}:${locale}`, dictionary); return () => {}; },
      bind(namespace) { return key => dictionaries.get(`${namespace}:${language}`)?.[key] ?? key; },
      subscribe() { return () => {}; },
      getSnapshot() { return language; },
    },
    slots: {
      inject(slot, callback) { return callback(); },
      register(options, value) { component = value; return () => {}; },
    },
  };
  client.apply(ctx);
  assert.equal(typeof component, 'function');
  const tree = component();
  return { tree, fetches, dictionaries, language };
}

function find(node, id) {
  if (!node || typeof node !== 'object') return null;
  if (node.props?.id === id) return node;
  for (const child of node.children || []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const actionFetches = (fetches, action) => fetches.filter(item => item.body?.action === action);

test('the settings page loads the live balance alongside status and debug state', async () => {
  const { fetches, dictionaries } = mountClient('en');
  await tick();
  assert.ok(actionFetches(fetches, 'balance').length >= 1, 'balance is requested on mount');
  assert.equal(actionFetches(fetches, 'balance')[0].method, 'POST');
  const dictionary = dictionaries.get('desktop-pet:en');
  for (const key of ['balance', 'threshold', 'sound', 'testNotification', 'balanceUnavailable']) {
    assert.equal(typeof dictionary[key], 'string', `en dictionary needs ${key}`);
    assert.ok(dictionary[key].trim());
  }
});

test('the threshold, sound, and test controls speak the documented actions', async () => {
  const { tree, fetches } = mountClient('zh');
  const threshold = find(tree, 'dsp-threshold');
  const sound = find(tree, 'dsp-sound');
  const test = find(tree, 'dsp-test-notification');
  assert.ok(threshold, 'threshold input exists');
  assert.ok(sound, 'sound checkbox exists');
  assert.ok(test, 'test notification control exists');

  threshold.props.onChange({ target: { value: '8' } });
  await tick();
  assert.deepEqual(actionFetches(fetches, 'set-threshold').at(-1).body, {
    action: 'set-threshold', value: { currency: 'CNY', amount: 8 },
  });

  sound.props.onChange({ target: { checked: false } });
  await tick();
  assert.deepEqual(actionFetches(fetches, 'set-sound').at(-1).body, { action: 'set-sound', value: false });

  test.props.onClick();
  await tick();
  assert.equal(actionFetches(fetches, 'test-notification').length, 1);
});
