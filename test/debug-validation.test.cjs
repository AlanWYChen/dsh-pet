const { test } = require('node:test');
const assert = require('node:assert/strict');

test('debug setter rejects nonboolean inputs without changing preference or launching a helper', async t => {
  const { ManagedPet } = await import('../src/managed-helper.mjs');
  let launches = 0;
  const pet = new ManagedPet({ url: 'http://127.0.0.1:3080', spawn() { launches++; throw new Error('must not launch'); } });
  t.after(() => pet.dispose());
  assert.equal(typeof pet.setDebugMode, 'function', 'debug preference setter must exist before validating its inputs');
  for (const invalid of ['true', 'false', 1, 0, null, undefined, {}, []]) {
    await assert.rejects(async () => pet.setDebugMode(invalid), { name: 'TypeError' });
    assert.deepEqual(pet.debugStatus(), { debugMode: false }, 'rejected values do not change the default preference');
  }
  assert.equal(launches, 0);
});
