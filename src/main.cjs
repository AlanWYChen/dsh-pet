const { app, BrowserWindow, ipcMain, Menu, Notification, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { createBridge } = require('./bridge.cjs');
const { PetState } = require('./state.cjs');
const managed = process.env.DSH_PET_MANAGED === '1';
const dshUrl = (() => {
  try {
    const url = new URL(process.env.DSH_PET_URL || 'http://127.0.0.1:3080');
    if (['http:', 'https:'].includes(url.protocol)) return url.href;
  } catch {}
  return 'http://127.0.0.1:3080';
})();
let win, bridge, idleTimer;
let debugMode = process.env.DSH_PET_DEBUG === '1';
if (managed) {
  process.on('disconnect', () => app.quit());
  process.on('message', message => {
    if (message?.type === 'shutdown') app.quit();
    else if (message?.type === 'pet:event') receive(message.event);
    else if (message?.type === 'pet:config' && typeof message.debugMode === 'boolean') debugMode = message.debugMode;
  });
}
let muted = false;
const permissionNotifications = new Map();
const state = new PetState();
const configDir = path.join(os.homedir(), '.dsh-pet');
const configPath = path.join(configDir, 'bridge.json');
function publish(event) {
  if (win && !win.isDestroyed()) win.webContents.send('pet:event', event);
}
function receive(input) {
  const event = state.accept(input);
  if (!event) return;
  clearTimeout(idleTimer);
  for (const [key, entry] of permissionNotifications) {
    if (entry.sessionId !== event.sessionId) continue;
    if ((event.state === 'permission-resolved' && entry.requestId === event.requestId) || ['done', 'sleeping', 'error', 'hungry'].includes(event.state)) {
      entry.notification.close(); permissionNotifications.delete(key);
    }
  }
  publish(state.current);
  if (['done', 'permission'].includes(event.state) && !muted && Notification.isSupported()) {
    const permission = event.state === 'permission';
    const notification = new Notification({ title: permission ? '蓝色大肥鱼 · Permission needed' : '蓝色大肥鱼 · Reply ready', body: permission ? 'A running session needs your approval. Open DSH to review.' : event.title || 'Your DSH chat has finished responding.', silent: false });
    notification.on('click', () => shell.openExternal(dshUrl));
    if (permission) permissionNotifications.set(JSON.stringify([event.sessionId, event.requestId]), { notification, sessionId: event.sessionId, requestId: event.requestId });
    notification.show();
  }
  if (['done', 'error', 'hungry'].includes(event.state)) idleTimer = setTimeout(() => publish(state.idle()), 16000);
}
if ((managed && (!process.send || !process.connected)) || (!managed && !app.requestSingleInstanceLock())) app.quit();
else {
  if (!managed) app.on('second-instance', () => win?.show());
  app.whenReady().then(async () => {
    if (managed && !process.connected) { app.quit(); return; }
    let token;
    if (!managed) {
    fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    try { token = JSON.parse(fs.readFileSync(configPath, 'utf8')).token; } catch {}
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) token = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(configPath, JSON.stringify({ port: 47831, token }), { mode: 0o600 });
    fs.chmodSync(configPath, 0o600);
    }
    const area = screen.getPrimaryDisplay().workArea;
    win = new BrowserWindow({ width: 260, height: 270, x: area.x + area.width - 284, y: area.y + area.height - 290,
      frame: false, transparent: true, resizable: false, alwaysOnTop: true, hasShadow: false,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    ipcMain.on('pet:rendered', (event, renderedState) => {
      if (!managed || event.sender !== win.webContents || win.isDestroyed() || !process.connected
          || !['sleeping', 'thinking', 'done', 'permission', 'hungry', 'error'].includes(renderedState)) return;
      process.send({ type: 'pet:state', state: renderedState }, error => { if (error) app.quit(); });
    });
    win.webContents.on('did-finish-load', () => publish(state.current));
    await win.loadFile(path.join(__dirname, 'pet.html'));
    if (managed) {
      if (!process.connected) { app.quit(); return; }
      process.send({ type: 'ready' }, error => { if (error) app.quit(); });
    } else {
      bridge = createBridge({ token, onEvent: receive });
      bridge.on('error', error => { publish({ state: 'error', title: `Bridge unavailable: ${error.code}` }); });
    }
    ipcMain.on('pet:menu', () => Menu.buildFromTemplate([
      { label: '蓝色大肥鱼 · DeepSeek Pet', enabled: false },
      { label: 'Open DSH', click: () => shell.openExternal(dshUrl) },
      { type: 'separator' },
      ...(debugMode ? [
        { label: 'Try completion notification', click: () => { if (debugMode) receive({ state: 'done', title: 'Your reply is ready. Come take a look!' }); } },
        ...['sleeping', 'thinking', 'hungry'].map(s => ({ label: `Preview ${s}`, click: () => { if (debugMode) receive({ state: s, sessionId: 'preview' }); } })),
      ] : []),
      { label: 'Mute notifications', type: 'checkbox', checked: muted, click: item => { muted = item.checked; } },
      { type: 'separator' }, { label: 'Quit pet', click: () => app.quit() }
    ]).popup({ window: win }));
    ipcMain.on('pet:open', () => shell.openExternal(dshUrl));
    ipcMain.on('pet:ack', () => { clearTimeout(idleTimer); publish(state.idle()); });
  }).catch(() => app.quit());
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { clearTimeout(idleTimer); bridge?.close(); });
}
