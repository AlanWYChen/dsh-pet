const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const [language, expected] of [['en', 'Desktop Pet'], ['zh', '桌面宠物']]) {
  test(`pet tab and settings heading use exact ${language} name ${expected}`, () => {
    let definition, section, icon;
    const dictionaries = new Map();
    const elements = [];
    const React = {
      createElement(type, props, ...children) {
        const value = { type, props, children }; elements.push(value); return value;
      },
      useSyncExternalStore() {},
      useState: value => [value, () => {}],
      useRef: value => ({ current: value }),
      useEffect() {},
    };
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../client.js'), 'utf8'), {
      window: { __ModuleLoader__: { load(value) { definition = value; } } },
    }, { filename: 'client.js' });
    const client = definition.factory(name => { assert.equal(name, 'react'); return React; });
    client.apply({
      effect(callback) { return callback(); },
      locale: {
        register(namespace, locale, dictionary) { dictionaries.set(`${namespace}:${locale}`, dictionary); return () => {}; },
        bind(namespace) { return key => dictionaries.get(`${namespace}:${language}`)?.[key] ?? key; },
      },
      slots: {
        inject(_slot, callback) { return callback(); },
        register(options, component) { if (options.name === 'settings.section') section = { options, component }; else if (options.name === 'settings.section.icon') icon = { options, component }; return () => {}; },
      },
    });
    assert.equal(dictionaries.get(`desktop-pet:${language}`).title, expected, 'localized title is the exact user-requested name');
    assert.ok(section, 'the settings section must be registered');
    const label = section.options.label;
    assert.equal(typeof label === 'function' ? label() : label, expected, 'Settings tab displays exact requested name');
    // Inspect component output values only, with effects inert; no DOM/browser,
    // fetch, native helper or style/layout emulation is involved.
    section.component();
    assert.ok(elements.some(element => element.type === 'div' && element.children.length === 1 && element.children[0] === expected), 'settings heading displays the same exact name');
    assert.ok(icon, 'the Settings tab contributes a navigation icon');
    assert.equal(icon.options.id, section.options.id, 'the icon id must match the section id');
    const rendered = icon.component({ size: 20, active: true });
    assert.equal(rendered.type, 'span');
    assert.equal(rendered.props['aria-hidden'], 'true');
    assert.equal(rendered.props.style.width, 20);
    assert.equal(rendered.props.style.height, 20);
    assert.equal(rendered.props.style.backgroundColor, 'currentColor', 'the glyph follows the native icon color (white on the dark theme)');
    assert.ok(String(rendered.props.style.WebkitMaskImage).startsWith('url(data:image/png;base64,'), 'the supplied tail icon is embedded as an adaptive mask');
  });
}
