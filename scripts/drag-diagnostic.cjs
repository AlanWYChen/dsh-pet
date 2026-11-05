// Read-only native diagnostic: actual main/preload/renderer, one owned helper.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
process.env.DSH_PET_MANAGED = '1';
process.connected = true;
process.send = (_message, callback) => callback?.();
require('../src/main.cjs');
const deadline = setTimeout(() => { console.error('Diagnostic timed out'); app.exit(2); }, 12000);
app.whenReady().then(async () => {
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) throw new Error('Actual main did not create window');
    if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    const errors=[];
    win.webContents.on('console-message', (_event, details) => { if (details.level === 'error') errors.push(details.message); });
    const info = await win.webContents.executeJavaScript(`(() => {
      window.dragEvents=[];
      for(const type of ['pointerdown','pointermove','pointerup','gotpointercapture','lostpointercapture','pointercancel'])
        document.querySelector('.ocean').addEventListener(type,e=>window.dragEvents.push({type:e.type,id:e.pointerId,x:e.screenX,y:e.screenY,target:e.target.tagName,buttons:e.buttons}));
      window.addEventListener('error',e=>window.dragEvents.push({error:e.message}));
      const ocean=document.querySelector('.ocean'), rect=ocean.getBoundingClientRect();
      return {drag:typeof window.pet?.drag,home:typeof window.pet?.home,region:getComputedStyle(ocean).webkitAppRegion,touchAction:getComputedStyle(ocean).touchAction,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}};
    })()`);
    win.show(); win.focus();
    const before=win.getBounds();
    const x=Math.round(info.rect.x+info.rect.width/2),y=Math.round(info.rect.y+info.rect.height/2);
    const flush=()=>win.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    win.webContents.sendInputEvent({type:'mouseMove',x,y}); await flush();
    win.webContents.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1}); await flush();
    win.webContents.sendInputEvent({type:'mouseMove',x:x-30,y:y-20,button:'left',movementX:-30,movementY:-20}); await flush();
    win.webContents.sendInputEvent({type:'mouseUp',x:x-30,y:y-20,button:'left',clickCount:1}); await flush();
    const after=win.getBounds();
    const events=await win.webContents.executeJavaScript('window.dragEvents');
    console.log(JSON.stringify({info,before,after,events,errors},null,2));
    assert.notDeepEqual({x:after.x,y:after.y},{x:before.x,y:before.y},'actual Electron gesture must move the window');
    assert.equal(errors.length,0);
    clearTimeout(deadline); win.destroy(); app.exit(0);
  } catch(error) { console.error(error); clearTimeout(deadline); for(const win of BrowserWindow.getAllWindows())win.destroy(); app.exit(1); }
});
