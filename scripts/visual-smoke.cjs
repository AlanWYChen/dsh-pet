// Render the actual pet page in Electron, verify preload/DOM, and save a preview.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ width: 292, height: 380, show: false, transparent: true, frame: false,
      webPreferences: { preload: path.join(__dirname, '../src/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    const errors = [];
    win.webContents.on('console-message', (_event, details) => { if (details.level === 'error') errors.push(details.message); });
    await win.loadFile(path.join(__dirname, '../src/pet.html'));
    const initial = await win.webContents.executeJavaScript("({preload:typeof window.pet?.onEvent,imageReady:document.querySelector('img').complete && document.querySelector('img').naturalWidth>0})");
    if (initial.preload !== 'function' || !initial.imageReady) throw new Error(JSON.stringify(initial));
    fs.mkdirSync(path.join(__dirname, '../previews'), { recursive: true });
    for (const state of ['sleeping', 'thinking', 'done', 'hungry', 'permission']) {
      win.webContents.send('pet:event', { state });
      await win.webContents.executeJavaScript(`new Promise(resolve => { const check = () => document.querySelector('main').dataset.state === ${JSON.stringify(state)} ? resolve() : requestAnimationFrame(check); check(); })`);
      await win.webContents.executeJavaScript("document.getAnimations().forEach(a=>a.pause()); Promise.all([...document.images].map(i=>i.decode()))");
      const actual = await win.webContents.executeJavaScript("document.querySelector('main').dataset.state");
      if (actual !== state) throw new Error(`State not rendered: ${state}`);
      await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const image = await win.webContents.capturePage();
      fs.writeFileSync(path.join(__dirname, `../previews/${state}.png`), image.toPNG());
    }
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('PASS: Electron sandbox preload, five rendered moods, image decoding, screenshot captures.');
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
