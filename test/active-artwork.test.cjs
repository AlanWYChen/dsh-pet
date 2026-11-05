const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const file = relative => fs.readFileSync(path.join(root, relative));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// User-approved replacement contract: these are the supplied attachment hashes,
// not hashes inferred from migrated output. Copying original bytes preserves
// native dimensions, alpha and metadata rather than normalizing the artwork.
const supplied = {
  sleeping: 'bca5680ada0c12d5669ce154b8a909101edea92ab22722d573685fad022fbbd5',
  thinking: '5a1e80e28ca8e61d8bb38103f9d3e7657ed599903f968c257c4f4be6dab29a5e',
  complete: '8aa96ceabcf76d755046c012bef2235416514c1a550247eebbd1bf2fd4b803e4',
  permission: 'cf45c27dc8ce1317dd4017733473d9cf24b9439a1765e9324d7043404b9431fd',
  hungry: '6ccfe5e628e816c4ac2d3a6a40188fe26973c220b71a72e2424f379482bb7c27',
  tanking: 'b8f096d664b8f20da73f15f4c0c493a5c13ea096658806a1ae43a6adbc425dff',
};
const expectedPaths = Object.keys(supplied).map(name => `assets/active/${name}.png`).sort();
const manifest = () => JSON.parse(file('assets/manifest.json').toString('utf8'));
function filesBelow(relative) {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap(entry => {
    const child = `${relative}/${entry.name}`;
    return entry.isDirectory() ? filesBelow(child) : [child];
  });
}

test('assets contains exactly the six supplied active PNGs and no stale image files', () => {
  assert.deepEqual(fs.readdirSync(path.join(root, 'assets/active')).sort(),
    Object.keys(supplied).map(name => `${name}.png`).sort());
  assert.deepEqual(filesBelow('assets').filter(name => /\.(?:png|jpe?g|webp|gif|avif|bmp|tiff?|svg)$/i.test(name)).sort(), expectedPaths);
  for (const category of ['reference', 'reserve']) {
    assert.equal(fs.existsSync(path.join(root, 'assets', category)), false, `obsolete ${category} artwork directory is removed`);
  }
});

test('manifest describes exactly six active outputs without stale reference or reserve entries', () => {
  const data = manifest();
  assert.ok(Array.isArray(data.active), 'manifest lists active artwork');
  assert.deepEqual(data.active.map(entry => entry.path).sort(), expectedPaths);
  for (const category of ['reference', 'reserve']) {
    assert.ok(data[category] === undefined || (Array.isArray(data[category]) && data[category].length === 0), `manifest has no stale ${category} records`);
  }
});

for (const [name, expected] of Object.entries(supplied)) {
  test(`${name} preserves supplied PNG bytes and records truthful source and output hashes`, () => {
    const relative = `assets/active/${name}.png`;
    assert.ok(fs.existsSync(path.join(root, relative)), `${name} supplied artwork exists`);
    const bytes = file(relative);
    assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137,80,78,71,13,10,26,10]), 'actual PNG signature');
    assert.equal(hash(bytes), expected, 'original attachment bytes retained, without resizing, alpha changes or normalization');
    assert.equal(bytes.toString('ascii', 12, 16), 'IHDR');
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    assert.ok(width > 0 && height > 0, 'native canvas has positive dimensions');
    const matches = manifest().active.filter(entry => entry.path === relative);
    assert.equal(matches.length, 1, 'one unambiguous output record');
    const entry = matches[0];
    assert.equal(entry.sourceSha256, expected, 'source hash identifies supplied attachment, not an old reference');
    assert.equal(entry.sha256, hash(bytes), 'output hash describes actual file bytes');
    assert.equal(entry.width, width, 'manifest records native width');
    assert.equal(entry.height, height, 'manifest records native height');
    assert.doesNotMatch(JSON.stringify(entry), /assets\/(?:reference|reserve)\//, 'no stale source path');
  });
}

test('README uses the active tanking illustration and credits identify ChatGPT Image', () => {
  const readme = file('README.md').toString('utf8');
  assert.match(readme, /!\[[^\]]*\]\(<?(?:\.\/)?assets\/active\/tanking\.png>?(?:\s+["'][^"']*["'])?\)|<img\b[^>]*\bsrc=["'](?:\.\/)?assets\/active\/tanking\.png["']/i, 'README displays supplied tanking artwork');
  assert.match(file('CREDITS.md').toString('utf8'), /ChatGPT Image/i, 'credit the actual artwork generator');
  for (const text of [readme, file('CREDITS.md').toString('utf8')]) {
    assert.doesNotMatch(text, /assets\/(?:reference|reserve)\//, 'documentation does not link deleted artwork');
  }
});
