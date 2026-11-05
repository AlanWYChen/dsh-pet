// Bounded native helper diagnostic. Uses actual main/preload/renderer/state; no
// DSH browser profile, global bridge, credential files or external server.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const messages = [], errors = [];
process.env.DSH_PET_MANAGED = '1';
process.env.DSH_PET_URL = 'http://127.0.0.1:3080';
process.connected = true;
process.send = (message, callback) => { messages.push(message); callback?.(); };
app.on('browser-window-created', (_event, win) => {
  win.webContents.on('preload-error', (_event, _preloadPath, error) => errors.push({ kind: 'preload-error', message: String(error?.message || error) }));
  win.webContents.on('console-message', (_event, details, oldMessage) => {
    const level = typeof details === 'object' ? details.level : details;
    const message = typeof details === 'object' ? details.message : oldMessage;
    if (level === 'error' || level === 3) errors.push({ kind: 'console-error', message: String(message) });
  });
  win.webContents.on('render-process-gone', (_event, details) => errors.push({ kind: 'render-process-gone', reason: details.reason }));
});
const finish = code => {
  clearTimeout(deadline);
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.destroy();
  app.exit(code);
};
const deadline = setTimeout(() => { console.error('State diagnostic timed out'); finish(2); }, 12000);
require('../src/main.cjs');
app.whenReady().then(async () => {
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) throw new Error('Actual main did not create a window');
    if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    const snapshot = () => win.webContents.executeJavaScript(`(() => ({
      api: typeof window.pet,
      onEvent: typeof window.pet?.onEvent,
      rendered: typeof window.pet?.rendered,
      state: document.getElementById('pet')?.dataset.state,
      image: document.getElementById('character')?.getAttribute('src'),
      bubbleHidden: document.getElementById('notification')?.hidden
    }))()`);
    const flush = () => win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await flush();
    const initial = await snapshot();
    const states = [];
    for (const state of ['thinking', 'done']) {
      process.emit('message', { type: 'pet:event', event: { state, sessionId: 'diagnostic', eventId: `diagnostic:${state}` } });
      await flush();
      states.push(await snapshot());
    }
    console.log(JSON.stringify({ initial, states, messages, errors }, null, 2));
    assert.equal(initial.api, 'object', 'sandboxed preload must expose the pet API');
    assert.equal(initial.onEvent, 'function', 'actual preload must expose event subscription');
    assert.equal(initial.rendered, 'function', 'actual preload must expose render acknowledgement');
    assert.equal(initial.state, 'sleeping');
    assert.equal(states[0].state, 'thinking', 'actual helper IPC must update real renderer to thinking');
    assert.equal(states[1].state, 'done', 'actual helper IPC must update real renderer to done');
    assert.ok(messages.some(message => message.type === 'pet:state' && message.state === 'sleeping'), 'initial sleeping render must acknowledge');
    for (const state of ['thinking', 'done']) assert.ok(messages.some(message => message.type === 'pet:state' && message.state === state), `${state} render must acknowledge to its owning Host`);
    assert.deepEqual(errors, [], 'preload/renderer must not report errors');
    finish(0);
  } catch (error) { console.error(error); finish(1); }
});
