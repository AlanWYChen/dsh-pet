const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pet', {
  onEvent: callback => ipcRenderer.on('pet:event', (_event, data) => callback(data)),
  menu: () => ipcRenderer.send('pet:menu'),

  rendered: state => ipcRenderer.send('pet:rendered', state),
  open: () => ipcRenderer.send('pet:open'),
  acknowledge: () => ipcRenderer.send('pet:ack')
});
