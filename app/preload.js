/* The few things the app may ask of the program. Nothing else on the computer is reachable from the page. */
const { contextBridge, ipcRenderer } = require('electron');
const arg = (process.argv.find(a => a.startsWith('--oc-version=')) || '').split('=')[1] || '';
contextBridge.exposeInMainWorld('OC', {
  version: arg,
  loadChars: () => ipcRenderer.invoke('chars:load'),
  saveChars: chars => ipcRenderer.invoke('chars:sync', JSON.stringify(chars)),
  listFolders: () => ipcRenderer.invoke('folders:list'),
  folderOp: (op, a, b) => ipcRenderer.invoke('folders:op', op, String(a || ''), String(b || '')),
  purgeChar: id => ipcRenderer.invoke('chars:purge', String(id || '')),
  showChar: id => ipcRenderer.invoke('chars:show', String(id || '')),
  savePicture: (name, bytes) => ipcRenderer.invoke('picture:save', String(name || ''), bytes),
  savePack: (name, text, oldName) => ipcRenderer.invoke('pack:save', String(name || ''), String(text || ''), String(oldName || '')),
  deletePack: name => ipcRenderer.invoke('pack:delete', String(name || '')),
  showPack: name => ipcRenderer.invoke('pack:show', String(name || '')),
  onFlush: cb => ipcRenderer.on('app:flush', async () => { try { await cb(); } catch (e) {} ipcRenderer.invoke('app:flushed'); }),
  onFolderChanged: cb => ipcRenderer.on('folder-changed', (e, which) => cb(which)),
});
