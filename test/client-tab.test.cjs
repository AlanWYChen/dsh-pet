const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Observe only the plugin's public module/slot registration. No component is
// rendered and no React hooks, DOM, browser shell, or application UI is emulated.
function registerClient(initialLanguage = 'en') {
  let definition;
  let language = initialLanguage;
  const registrations = [];
  const injections = [];
  const dictionaries = new Map();
  const React = { createElement() { throw new Error('Registration tests must not render components'); } };
  const source = fs.readFileSync(path.resolve(__dirname, '../client.js'), 'utf8');
  vm.runInNewContext(source, {
    window: { __ModuleLoader__: { load(value) { definition = value; } } },
  }, { filename: 'client.js' });
  assert.ok(definition, 'Client artifact must register its module factory');
  const client = definition.factory(name => {
    assert.equal(name, 'react', 'Client must use the shared React module');
    return React;
  });
  const ctx = {
    effect(callback) { return callback(); },
    locale: {
      register(namespace, locale, dictionary) {
        dictionaries.set(`${namespace}:${locale}`, dictionary);
        return () => dictionaries.delete(`${namespace}:${locale}`);
      },
      bind(namespace) {
        return key => dictionaries.get(`${namespace}:${language}`)?.[key] ?? key;
      },
    },
    slots: {
      inject(slot, callback) { injections.push(slot); return callback(); },
      register(options, component) {
        registrations.push({ options, component });
        return () => {};
      },
    },
  };
  client.apply(ctx);
  return { registrations, injections, dictionaries, setLanguage(next) { language = next; } };
}

for (const language of ['en', 'zh']) {
  test(`desktop pet owns a localized Settings tab in ${language}, not a General row`, () => {
    const { registrations, injections, dictionaries } = registerClient(language);
    assert.equal(registrations.length, 1, 'Pet should contribute exactly its own settings page');
    const { options, component } = registrations[0];
    assert.equal(options.name, 'settings.section', 'Pet belongs beside other Settings tabs, not inside General');
    assert.equal(options.id, 'deepseek-desktop-pet', 'Pet retains its stable, feature-owned registration id');
    assert.equal(typeof component, 'function', 'Settings page needs its own component');
    assert.ok(injections.includes('settings.section'), 'Registration must be owned by the Settings section slot');
    assert.ok(!injections.includes('settings.general.item'), 'General preference-row registration must be removed');
    assert.ok(!registrations.some(({ options: entry }) => entry.name === 'settings.general.item'));
    const label = typeof options.label === 'function' ? options.label() : options.label;
    assert.equal(typeof label, 'string');
    assert.ok(label.trim(), 'Settings tab needs a visible nonempty label');
    const dictionary = dictionaries.get(`desktop-pet:${language}`);
    assert.ok(dictionary, 'Tab must use the existing localized pet vocabulary');
    assert.equal(label, dictionary.title, 'Tab label follows the selected pet locale');
  });
}

test('Settings tab label follows a locale switch without re-registering the page', () => {
  const client = registerClient('en');
  const tab = client.registrations.find(({ options }) => options.name === 'settings.section');
  assert.ok(tab, 'Pet must have its own Settings section before labels can be projected');
  assert.equal(typeof tab.options.label, 'function', 'Settings uses a label thunk for live localization');
  const english = tab.options.label();
  client.setLanguage('zh');
  const chinese = tab.options.label();
  assert.equal(english, client.dictionaries.get('desktop-pet:en').title);
  assert.equal(chinese, client.dictionaries.get('desktop-pet:zh').title);
  assert.notEqual(chinese, english, 'English and Chinese tabs should have localized names');
  assert.equal(client.registrations.length, 1, 'Locale changes must not duplicate Settings pages');
});
