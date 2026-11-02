/* Open Compendium - the program around the app.
   It opens one window, shows the app from its own folder, and keeps everything next to the program:
     Libraries\   your compendium and Character Builder files (read only)
     portraits\   pictures (new ones are copied in here)
     Characters\  one file per character (deleted ones go to Characters\Deleted)
     Data\        the program's own memory: settings, window size, the prepared library
   It never connects to the internet: every web address is refused. */
'use strict';
const { app, BrowserWindow, protocol, session, ipcMain, Menu, nativeTheme, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

const VERSION = require('./package.json').version;
const HOME = app.isPackaged ? path.dirname(process.execPath) : path.resolve(__dirname, '..', '..');
const WEB = path.join(__dirname, 'web');
const DIRS = {
  Libraries: path.join(HOME, 'Libraries'),
  portraits: path.join(HOME, 'portraits'),
  Characters: path.join(HOME, 'Characters'),
  Data: path.join(HOME, 'Data'),
};

/* ---------- everything the engine writes stays in the program's folder ---------- */
app.setPath('userData', DIRS.Data);
app.setPath('sessionData', DIRS.Data);
try { app.setPath('crashDumps', path.join(DIRS.Data, 'Crashes')); } catch (e) {}
try { app.setAppLogsPath(path.join(DIRS.Data, 'Logs')); } catch (e) {}

/* ---------- no internet: switch off the engine's own background connections ---------- */
for (const s of ['disable-background-networking', 'disable-component-update', 'disable-domain-reliability',
  'no-pings', 'disable-breakpad', 'disable-sync', 'no-default-browser-check', 'disable-client-side-phishing-detection'])
  app.commandLine.appendSwitch(s);
app.commandLine.appendSwitch('disable-features',
  'MediaRouter,OptimizationHints,AutofillServerCommunication,Translate,SpareRendererForSitePerProcess,NetworkTimeServiceQuerying,CertificateTransparencyComponentUpdater,InterestFeedContentSuggestions');

// one copy at a time (two would write the same character files)
if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });

protocol.registerSchemesAsPrivileged([{ scheme: 'oc', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } }]);

/* ---------- files ---------- */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.xml': 'text/xml',
  '.part': 'text/xml', '.txt': 'text/plain', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const inside = (base, p) => { const r = path.resolve(base, p); return (r === base || r.startsWith(base + path.sep)) ? r : null; };
async function exists(p) { try { return (await fsp.stat(p)).isFile(); } catch (e) { return false; } }
async function walk(base, rel = '', out = []) {
  let list = [];
  try { list = await fsp.readdir(path.join(base, rel), { withFileTypes: true }); } catch (e) { return out; }
  for (const d of list) {
    const r = rel ? rel + '/' + d.name : d.name;
    if (d.isDirectory()) await walk(base, r, out);
    else if (d.isFile()) { try { const s = await fsp.stat(path.join(base, r)); out.push({ p: r, s: s.size, m: Math.round(s.mtimeMs) }); } catch (e) {} }
  }
  return out;
}
// a picture asked for by name only (characters from the original builder): look in the subfolders too
async function findByName(base, name) {
  const want = name.toLowerCase();
  const hit = (await walk(base)).find(f => path.basename(f.p).toLowerCase() === want);
  return hit ? path.join(base, hit.p) : null;
}
function reply(status, body, type) {
  return new Response(body, { status, headers: { 'content-type': type || 'text/plain', 'cache-control': 'no-store' } });
}

/* oc://app/...  the app, plus  /Libraries/..., /portraits/...  and  /_list/<folder>  (what is in a folder) */
async function serve(request) {
  const u = new URL(request.url);
  let p; try { p = decodeURIComponent(u.pathname).replace(/^\/+/, ''); } catch (e) { return reply(400, 'bad address'); }
  const m = /^_list\/(Libraries|portraits)$/.exec(p);
  if (m) return reply(200, JSON.stringify(await walk(DIRS[m[1]])), 'application/json');
  let file = null;
  const top = p.split('/')[0];
  if (top === 'Libraries' || top === 'portraits') {
    file = inside(DIRS[top], p.slice(top.length + 1));
    if (file && !(await exists(file)) && top === 'portraits') file = await findByName(DIRS.portraits, path.basename(file));
  } else file = inside(WEB, p || 'index.html');
  if (!file || !(await exists(file))) return reply(404, 'not found');
  return reply(200, await fsp.readFile(file), MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
}

/* ---------- characters: one file each, named after the character ---------- */
const charFiles = new Map();   // character id -> {file, text}
const safeName = s => (String(s || '').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/[. ]+$/, '').trim() || 'Unnamed').slice(0, 80);
async function writeAtomic(file, text) {
  const tmp = file + '.saving';
  await fsp.writeFile(tmp, text, 'utf8');
  await fsp.rename(tmp, file);
}
/* Folders: each subfolder of Characters is a group (like the original builder's folder list); Deleted is not one. */
const BIN = 'Deleted';
const folderPath = f => f ? path.join(DIRS.Characters, safeName(f)) : DIRS.Characters;
async function listFolders() {
  let ds = [];
  try { ds = await fsp.readdir(DIRS.Characters, { withFileTypes: true }); } catch (e) {}
  return ds.filter(d => d.isDirectory() && d.name.toLowerCase() !== BIN.toLowerCase()).map(d => d.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
}
async function readFolder(dir, folder, out) {
  let names = [];
  try { names = await fsp.readdir(dir); } catch (e) { return; }
  for (const n of names) {
    if (!/\.json$/i.test(n)) continue;
    const file = path.join(dir, n);
    try {
      const text = await fsp.readFile(file, 'utf8');
      const c = JSON.parse(text);
      if (!c || typeof c !== 'object' || !c.id || !c.abilities) continue;
      if (out[c.id]) continue;       // the same character twice (a copy saved to a file): keep the first
      c.folder = folder;             // where the file is decides the folder
      out[c.id] = c; charFiles.set(c.id, { file, text });
    } catch (e) { console.warn('could not read', n, e.message); }
  }
  // a save cut short (power cut, pulled flash drive): keep it if it is complete and newer, otherwise drop it
  for (const n of names) {
    if (!/\.json\.saving$/i.test(n)) continue;
    const tmp = path.join(dir, n);
    try {
      const text = await fsp.readFile(tmp, 'utf8'); const c = JSON.parse(text);
      const known = c && c.id && charFiles.get(c.id);
      if (c && c.id && (!known || (await fsp.stat(tmp)).mtimeMs > (await fsp.stat(known.file)).mtimeMs)) {
        const file = known ? known.file : tmp.replace(/\.saving$/i, '');
        await fsp.rename(tmp, file); c.folder = folder; out[c.id] = c; charFiles.set(c.id, { file, text });
      } else await fsp.unlink(tmp);
    } catch (e) { await fsp.unlink(tmp).catch(() => {}); }
  }
}
async function loadChars() {
  await fsp.mkdir(DIRS.Characters, { recursive: true }).catch(() => {});
  const out = {};
  await readFolder(DIRS.Characters, '', out);
  for (const f of await listFolders()) await readFolder(path.join(DIRS.Characters, f), f, out);
  return out;
}
let syncing = Promise.resolve();
function queue(job) { const p = syncing.then(job); syncing = p.catch(e => console.warn('save failed', e)); return p; }
const syncChars = json => queue(() => doSync(json));
async function doSync(json) {
  const chars = JSON.parse(json);
  await fsp.mkdir(DIRS.Characters, { recursive: true });
  const taken = new Set();
  for (const [id, info] of charFiles) if (chars[id]) taken.add(info.file.toLowerCase());
  for (const [id, c] of Object.entries(chars)) {
    const text = JSON.stringify(c, null, 1);
    const old = charFiles.get(id);
    const dir = folderPath(c.folder || '');
    await fsp.mkdir(dir, { recursive: true });
    const stem = safeName(c.name);
    let file = old && path.dirname(old.file) === dir && path.basename(old.file, '.json').replace(/ \(\d+\)$/, '') === stem ? old.file : null;
    if (!file) {
      for (let i = 1; i < 1000; i++) {
        const f = path.join(dir, (i === 1 ? stem : `${stem} (${i})`) + '.json');
        if (!taken.has(f.toLowerCase()) && !(await exists(f))) { file = f; break; }
      }
    }
    if (old && old.file === file && old.text === text) continue;
    await writeAtomic(file, text);
    taken.add(file.toLowerCase());
    if (old && old.file !== file) { await fsp.unlink(old.file).catch(() => {}); taken.delete(old.file.toLowerCase()); }
    charFiles.set(id, { file, text });
  }
  // characters deleted in the app: their files are moved to Characters\Deleted, not destroyed
  for (const [id, info] of [...charFiles]) {
    if (chars[id]) continue;
    const bin = path.join(DIRS.Characters, BIN);
    await fsp.mkdir(bin, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    await fsp.rename(info.file, path.join(bin, path.basename(info.file, '.json') + ' ' + stamp + '.json')).catch(() => {});
    charFiles.delete(id);
  }
}
// folder changes: a new (empty) folder, a renamed one, a removed empty one
async function folderOp(op, a, b) {
  return queue(async () => {
    const A = a ? folderPath(a) : null;
    if (op === 'make') { await fsp.mkdir(A, { recursive: true }); return path.basename(A); }
    if (op === 'rename') {
      const B = folderPath(b);
      if (A.toLowerCase() !== B.toLowerCase() && await fsp.stat(B).then(() => true, () => false)) throw new Error('A folder with that name already exists.');
      await fsp.rename(A, B);
      for (const info of charFiles.values()) if (path.dirname(info.file) === A) info.file = path.join(B, path.basename(info.file));
      return path.basename(B);
    }
    if (op === 'remove') { await fsp.rmdir(A); return true; }      // only an empty folder can be removed
  });
}
// a character deleted before anything was chosen for it: its file is removed for good (no copy in Deleted)
function purgeChar(id) {
  return queue(async () => { const info = charFiles.get(id); if (!info) return; await fsp.unlink(info.file).catch(() => {}); charFiles.delete(id); });
}
// show a character's file in Explorer
function showChar(id) {
  const info = charFiles.get(id);
  if (info) shell.showItemInFolder(info.file); else shell.openPath(DIRS.Characters);
}

/* ---------- a new picture is copied into the portraits folder ---------- */
async function savePicture(name, bytes) {
  await fsp.mkdir(DIRS.portraits, { recursive: true });
  const clean = safeName(name || 'picture.png');
  const dot = clean.lastIndexOf('.'), stem = dot > 0 ? clean.slice(0, dot) : clean, ext = dot > 0 ? clean.slice(dot) : '.png';
  const buf = Buffer.from(bytes);
  for (let i = 1; i < 1000; i++) {
    const n = i === 1 ? stem + ext : `${stem} (${i})${ext}`, file = path.join(DIRS.portraits, n);
    let old = null; try { old = await fsp.readFile(file); } catch (e) {}
    if (old && old.equals(buf)) return n;          // the same picture is already there
    if (old) continue;
    await fsp.writeFile(file, buf);
    return n;
  }
  return null;
}

/* ---------- the window ---------- */
const WINFILE = path.join(DIRS.Data, 'window.json');
function loadWin() { try { return JSON.parse(fs.readFileSync(WINFILE, 'utf8')); } catch (e) { return {}; } }
function saveWin(w) {
  try {
    const b = w.getNormalBounds();
    fs.mkdirSync(DIRS.Data, { recursive: true });
    fs.writeFileSync(WINFILE, JSON.stringify({ ...b, max: w.isMaximized(), zoom: w.webContents.getZoomFactor() }));
  } catch (e) {}
}

function watchFolders(win) {
  for (const key of ['Libraries', 'portraits']) {
    let t = null;
    try {
      fs.watch(DIRS[key], { recursive: true }, () => {
        clearTimeout(t);
        t = setTimeout(() => { if (!win.isDestroyed()) win.webContents.send('folder-changed', key); }, 1200);
      });
    } catch (e) { /* folder missing or not watchable: the app still works, it just won't notice changes */ }
  }
}

function createWindow() {
  const s = loadWin();
  const win = new BrowserWindow({
    x: s.x, y: s.y, width: s.width || 1400, height: s.height || 900, minWidth: 900, minHeight: 600,
    title: 'Open Compendium', icon: path.join(__dirname, 'icon.png'), show: false, autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#17161a' : '#f6f4ef',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false,
      spellcheck: false, additionalArguments: ['--oc-version=' + VERSION],
    },
  });
  if (s.max) win.maximize();
  win.once('ready-to-show', () => { if (s.zoom) win.webContents.setZoomFactor(s.zoom); win.show(); });
  // before closing, the app saves anything not yet saved (at most a few seconds)
  let closing = false;
  win.on('close', e => {
    saveWin(win);
    if (closing) return;
    e.preventDefault(); closing = true;
    const done = () => { if (!win.isDestroyed()) win.destroy(); };
    ipcMain.handleOnce('app:flushed', async () => { await syncing; setImmediate(done); });
    win.webContents.send('app:flush');
    setTimeout(done, 4000);
  });

  // stay on the app: no leaving the page, no new windows
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('oc://app/')) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // keys a browser would have: zoom, reload, full screen, developer tools
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    const wc = win.webContents, ctrl = i.control || i.meta;
    if (ctrl && (i.key === '=' || i.key === '+')) { wc.setZoomFactor(Math.min(3, wc.getZoomFactor() + 0.1)); e.preventDefault(); }
    else if (ctrl && i.key === '-') { wc.setZoomFactor(Math.max(0.5, wc.getZoomFactor() - 0.1)); e.preventDefault(); }
    else if (ctrl && i.key === '0') { wc.setZoomFactor(1); e.preventDefault(); }
    else if (i.key === 'F5' || (ctrl && i.key.toLowerCase() === 'r')) { wc.reload(); e.preventDefault(); }
    else if (i.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (i.key === 'F12' || (ctrl && i.shift && i.key.toLowerCase() === 'i')) { wc.toggleDevTools(); e.preventDefault(); }
  });
  win.webContents.on('zoom-changed', (e, dir) => { const wc = win.webContents; wc.setZoomFactor(Math.max(0.5, Math.min(3, wc.getZoomFactor() + (dir === 'in' ? 0.1 : -0.1)))); });

  // right-click: cut, copy and paste in text boxes, copy on selected text
  win.webContents.on('context-menu', (e, p) => {
    const t = [];
    if (p.isEditable) t.push({ role: 'cut', label: 'Cut', enabled: p.editFlags.canCut }, { role: 'copy', label: 'Copy', enabled: p.editFlags.canCopy },
      { role: 'paste', label: 'Paste', enabled: p.editFlags.canPaste }, { type: 'separator' }, { role: 'selectAll', label: 'Select all' });
    else if (p.selectionText && p.selectionText.trim()) t.push({ role: 'copy', label: 'Copy' });
    if (t.length) Menu.buildFromTemplate(t).popup({ window: win });
  });

  win.loadURL('oc://app/index.html');
  watchFolders(win);
  return win;
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const ses = session.defaultSession;
  // refuse every web address: the program only ever shows its own files
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*', 'file://*/*'] },
    (d, cb) => cb({ cancel: !d.url.startsWith('devtools://') }));
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(['clipboard-sanitized-write', 'fullscreen'].includes(perm)));
  ses.setPermissionCheckHandler((wc, perm) => ['clipboard-sanitized-write', 'fullscreen'].includes(perm));
  try { ses.setSpellCheckerEnabled(false); } catch (e) {}
  protocol.handle('oc', serve);

  for (const d of [DIRS.Data, DIRS.Characters, DIRS.portraits]) await fsp.mkdir(d, { recursive: true }).catch(() => {});

  ipcMain.handle('chars:load', () => loadChars());
  ipcMain.handle('chars:sync', (e, json) => syncChars(json));
  ipcMain.handle('folders:list', () => listFolders());
  ipcMain.handle('folders:op', (e, op, a, b) => folderOp(op, a, b));
  ipcMain.handle('chars:purge', (e, id) => purgeChar(String(id || '')));
  ipcMain.handle('chars:show', (e, id) => showChar(id));
  ipcMain.handle('picture:save', (e, name, bytes) => savePicture(name, bytes));

  createWindow();
});
app.on('window-all-closed', async () => { await syncing; app.quit(); });
