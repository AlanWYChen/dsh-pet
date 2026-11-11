const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const locale = name => JSON.parse(fs.readFileSync(path.join(root, 'locale', `${name}.json`), 'utf8'));

test('the Plugins list registers the desktop pet as dsh-desktop-pet', () => {
  assert.equal(locale('en').meta.title, 'dsh-desktop-pet');
  assert.equal(locale('zh').meta.title, 'dsh-desktop-pet');
  assert.ok(locale('en').meta.description.trim());
  assert.ok(locale('zh').meta.description.trim());
});

test('the plugin manifest points at the supplied tail icon', () => {
  assert.equal(manifest.icon, './icon.png');
  assert.equal(manifest.exports['./icon'], './icon.png');
  assert.ok(manifest.files.includes('icon.png'), 'the icon must ship with the package');
  assert.equal(fs.existsSync(path.join(root, 'icon.svg')), false, 'the generic fish icon must be gone');
});

test('the tail icon is a bounded square transparent PNG', () => {
  const file = path.join(root, 'icon.png');
  const bytes = fs.readFileSync(file);
  assert.ok(bytes.length <= 256 * 1024, 'DSH rejects package icons above 256 KiB');
  assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR');
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const colorType = bytes[25];
  assert.equal(width, height, 'the plugin icon must be square');
  assert.ok(width >= 128, 'the icon must be large enough to scale down cleanly');
  assert.equal(colorType, 6, 'the icon must carry an alpha channel (RGBA)');
});
