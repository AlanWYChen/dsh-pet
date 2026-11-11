const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DEFAULT_CONFIG, loadConfig, saveConfig } = require('../src/config.cjs');

function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-pet-config-'));
  return { dir, file: path.join(dir, 'pet.json') };
}

const expectedDefaults = {
  version: 1,
  enabled: false,
  position: null,
  sound: true,
  balanceThreshold: { currency: 'CNY', amount: 5 },
};

test('missing config loads the documented defaults without creating a file', () => {
  const { dir, file } = workspace();
  assert.deepEqual(loadConfig({ file }), expectedDefaults);
  assert.deepEqual(fs.readdirSync(dir), []);
  assert.equal(DEFAULT_CONFIG.balanceThreshold.amount, 5);
});

test('save then load round-trips every field and keeps the file private and atomic', () => {
  const { dir, file } = workspace();
  const saved = saveConfig({
    version: 1,
    enabled: true,
    position: { x: 12, y: 34 },
    sound: false,
    balanceThreshold: { currency: 'CNY', amount: 7.5 },
  }, { file });
  assert.deepEqual(saved, {
    version: 1,
    enabled: true,
    position: { x: 12, y: 34 },
    sound: false,
    balanceThreshold: { currency: 'CNY', amount: 7.5 },
  });
  assert.deepEqual(loadConfig({ file }), saved);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(dir), ['pet.json'], 'no temp file may survive a successful save');
});

test('a corrupt or unreadable config falls back to defaults instead of throwing', () => {
  const { dir, file } = workspace();
  fs.writeFileSync(file, '{ not json');
  assert.deepEqual(loadConfig({ file }), expectedDefaults);
  fs.writeFileSync(file, JSON.stringify({ version: 99, enabled: 'yes' }));
  assert.deepEqual(loadConfig({ file }), expectedDefaults);
  fs.rmSync(file);
  fs.mkdirSync(file);
  assert.deepEqual(loadConfig({ file }), expectedDefaults, 'a directory in place of the file is not fatal');
  assert.ok(fs.existsSync(dir));
});

test('invalid fields fall back individually and unknown keys are dropped', () => {
  const { file } = workspace();
  fs.writeFileSync(file, JSON.stringify({
    version: 1,
    enabled: 'yes',
    position: { x: 'left', y: 10 },
    sound: 'loud',
    balanceThreshold: { currency: 'USD', amount: -3 },
    extra: { secret: true },
  }));
  assert.deepEqual(loadConfig({ file }), expectedDefaults);

  fs.writeFileSync(file, JSON.stringify({
    version: 1,
    enabled: true,
    position: { x: 10, y: 20 },
    sound: false,
    balanceThreshold: { currency: 'CNY', amount: 3.25 },
    extra: 'ignored',
  }));
  const loaded = loadConfig({ file });
  assert.equal(loaded.enabled, true);
  assert.deepEqual(loaded.position, { x: 10, y: 20 });
  assert.equal(loaded.sound, false);
  assert.deepEqual(loaded.balanceThreshold, { currency: 'CNY', amount: 3.25 });
  assert.equal('extra' in loaded, false);
});

test('a failed save never destroys the previous file', () => {
  const { dir, file } = workspace();
  saveConfig({ enabled: true }, { file });
  const before = fs.readFileSync(file, 'utf8');
  fs.chmodSync(dir, 0o500);
  try {
    assert.throws(() => saveConfig({ enabled: false }, { file }));
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  } finally {
    fs.chmodSync(dir, 0o700);
  }
  assert.deepEqual(fs.readdirSync(dir), ['pet.json']);
});

test('re-saving an existing world-readable file tightens it to 0600', () => {
  const { file } = workspace();
  fs.writeFileSync(file, JSON.stringify({ enabled: true }));
  fs.chmodSync(file, 0o644);
  saveConfig({ enabled: false }, { file });
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(loadConfig({ file }).enabled, false);
});
