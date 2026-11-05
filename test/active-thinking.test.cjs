const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PetState } = require('../src/state.cjs');

test('an idle or disposed unrelated session cannot put a working session to sleep', () => {
  const pet = new PetState();
  pet.accept({ state: 'thinking', sessionId: 'working' });
  pet.accept({ state: 'sleeping', sessionId: 'unrelated-idle' });
  assert.equal(pet.current.state, 'thinking');
  assert.equal(pet.current.sessionId, 'working');
});

test('a stopped session falls back to another still-working session immediately', () => {
  const pet = new PetState();
  pet.accept({ state: 'thinking', sessionId: 'first' });
  pet.accept({ state: 'thinking', sessionId: 'second' });
  pet.accept({ state: 'sleeping', sessionId: 'second' });
  assert.equal(pet.current.state, 'thinking');
  assert.equal(pet.current.sessionId, 'first');
  assert.equal(pet.active.has('second'), false);
});

test('thinking has no inactivity expiry and survives repeated idle evaluations', () => {
  const pet = new PetState();
  pet.accept({ state: 'thinking', sessionId: 'long-running' });
  for (let i = 0; i < 10; i++) {
    assert.equal(pet.idle().state, 'thinking');
    assert.equal(pet.current.sessionId, 'long-running');
  }
});

test('completion alerts still display before returning to another active session', () => {
  const pet = new PetState();
  pet.accept({ state: 'thinking', sessionId: 'working' });
  pet.accept({ state: 'thinking', sessionId: 'finishing' });
  pet.accept({ state: 'done', sessionId: 'finishing' });
  assert.equal(pet.current.state, 'done');
  assert.equal(pet.current.sessionId, 'finishing');
  assert.equal(pet.idle().state, 'thinking');
  assert.equal(pet.current.sessionId, 'working');
});

test('pending permission keeps priority over unrelated sleeping and then resumes thinking', () => {
  const pet = new PetState();
  pet.accept({ state: 'thinking', sessionId: 'working' });
  pet.accept({ state: 'permission', sessionId: 'working', requestId: 'approval' });
  pet.accept({ state: 'sleeping', sessionId: 'unrelated' });
  assert.equal(pet.current.state, 'permission');
  pet.accept({ state: 'permission-resolved', sessionId: 'working', requestId: 'approval' });
  assert.equal(pet.current.state, 'thinking');
  assert.equal(pet.current.sessionId, 'working');
});

test('sleep remains correct when the last working session actually ends', () => {
  const pet = new PetState();
  pet.accept({ state: 'thinking', sessionId: 'only' });
  pet.accept({ state: 'sleeping', sessionId: 'only' });
  assert.equal(pet.current.state, 'sleeping');
  assert.equal(pet.active.size, 0);
});
