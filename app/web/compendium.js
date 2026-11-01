"use strict";
const $ = s => document.querySelector(s);
const APP_VERSION = '0.69';
let lib = {};      // raw data per category: {cols, rows, index, data, hay}
let views = {};    // what the list shows: every category plus "*" (Everything)
const ALL = '*';
const S = {cat:null, q:'', full:false, filters:{}, sort:{col:'Name',dir:1}, limit:300, sel:null,
           lowCache:{}, meta:{}, terms:null, hidden:new Set(), books:[]};

/* ---------- settings that survive restarts ---------- */
const SETKEY = 'open-compendium-settings';
function loadSettings(){ try{ const o=JSON.parse(localStorage.getItem(SETKEY)||'{}');
  if(o.sort && o.sort.col) S.sort=o.sort; if(Array.isArray(o.hiddenBooks)) S.hidden=new Set(o.hiddenBooks); }catch(e){} }
function saveSettings(){ try{ localStorage.setItem(SETKEY, JSON.stringify({sort:S.sort, hiddenBooks:[...S.hidden]})); }catch(e){} }
loadSettings();

/* ---------- reading the library files (they are parsed, never executed) ---------- */
function parseJsonp(text){
  const open=text.indexOf('('), close=text.lastIndexOf(')');
  if(open<0 || close<open) throw new Error('not jsonp');
  const name=text.slice(0,open).trim(), body=text.slice(open+1,close);
  const m=/^\s*(\d+)\s*,\s*"([^"]*)"\s*,/.exec(body);
  if(!m) throw new Error('unexpected header');
  const kind = /listing/.test(name) ? 'listing' : /index/.test(name) ? 'index' : 'data';
  const args = JSON.parse('[' + body.slice(m[0].length) + ']');   // listing has two arguments, the others one
  return {kind, cat:m[2], payload: kind==='listing' ? args : args[0]};
}

/* ---------- what the program remembers between starts (in its Data folder) ---------- */
const idb=()=>new Promise((res,rej)=>{ const r=indexedDB.open('open-compendium',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('kv'); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
async function save(){ try{ const db=await idb(); await new Promise((res,rej)=>{ const t=db.transaction('kv','readwrite'); t.objectStore('kv').put(lib,'library'); t.oncomplete=res; t.onerror=()=>rej(t.error); }); }catch(e){ console.warn('save failed',e); } }
async function restore(){ try{ const db=await idb(); return await new Promise((res,rej)=>{ const r=db.transaction('kv').objectStore('kv').get('library'); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }catch(e){ return null; } }
async function saveKey(k,v){ try{ const db=await idb(); await new Promise((res,rej)=>{ const t=db.transaction('kv','readwrite'); t.objectStore('kv').put(v,k); t.oncomplete=res; t.onerror=()=>rej(t.error); }); }catch(e){ console.warn('save failed',k,e); } }
async function loadKey(k){ try{ const db=await idb(); return await new Promise((res,rej)=>{ const r=db.transaction('kv').objectStore('kv').get(k); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }catch(e){ return null; } }
/* characters: one file each in the Characters folder (the program does the reading and writing) */
const loadChars=()=>OC.loadChars();
const saveChars=c=>OC.saveChars(c);

/* ---------- the program reads the Libraries folder next to it by itself ----------
   What was read is kept (in the program's Data folder); it is read again only when the files change.
   Character Builder: the merged file from CBLoader holds the core data plus every .part file as it was when
   CBLoader last ran. On top of it go our own additions file, and any .part file changed since that merge
   (a library fix made later), so the program has it without running CBLoader again. */
const LIBRARY_READER=2;   // raised when the way the library is read changes, so it is read again
async function loadLibrary(){
  let list=[]; try{ list=await (await fetch('/_list/Libraries')).json(); }catch(e){}
  list=list.filter(f=>/\.(js|xml|part)$/i.test(f.p));
  const sig=JSON.stringify([LIBRARY_READER, ...list.map(f=>[f.p,f.s,f.m])]);
  if(await loadKey('libsig')===sig){
    const saved=await restore(); if(saved && Object.keys(saved).length) lib=saved;
    const raw=await loadKey('rules'); if(raw){ try{ RULES.use(raw); }catch(e){ console.warn(e); } }
    if(Object.keys(lib).length || RULES.db || !list.length) return;
  }
  await wipe(); lib={};
  if(list.length){
    $('#welcome').style.display='';
    $('#welcome h2').textContent='Reading your library';
    $('#welcome p').textContent='Your library files are new or have changed, so the program reads them once. This takes a little while; next time it starts straight away.';
    await readLibrary(list);
  }
  await saveKey('libsig',sig);
}
async function readLibrary(list){
  const status=t=>{ $('#status').textContent=t; return new Promise(r=>setTimeout(r,10)); };
  const text=async f=>{ try{ const r=await fetch('/Libraries/'+f.p.split('/').map(encodeURIComponent).join('/')); return r.ok ? await r.text() : ''; }catch(e){ return ''; } };
  const base=f=>f.p.split('/').pop();
  // the builder's rules: the merged file (the biggest .xml, preferring one called "merged")
  const xmls=list.filter(f=>/\.xml$/i.test(f.p) && f.s>1e6).sort((a,b)=>(/merged/i.test(base(b))-/merged/i.test(base(a))) || b.s-a.s);
  let merged=null;
  for(const f of xmls){
    await status(`Reading builder rules (${base(f)})… this takes a few seconds`);
    const t=await text(f); if(!/<D20Rules/.test(t.slice(0,400))) continue;
    try{ RULES.load(t); merged=f; break; }catch(e){ console.warn('rules skipped',f.p,e); }
  }
  const ours=f=>/open-compendium/i.test(base(f));
  const parts=list.filter(f=>/\.part$/i.test(f.p) && (!merged || ours(f) || f.m>merged.m)).sort((a,b)=>base(a).localeCompare(base(b)));
  for(const f of parts){
    await status(`Reading ${base(f)}…`);
    const t=await text(f); if(!/<D20Rules/.test(t.slice(0,600))) continue;
    try{ RULES.addPart(t, ours(f) ? 'ours' : merged ? 'newer' : 'add'); }catch(e){ console.warn('part skipped',f.p,e); }
  }
  if(RULES.raw) await saveKey('rules', RULES.raw);
  // the compendium
  const js=list.filter(f=>/\.js$/i.test(f.p));
  let ok=0;
  for(let i=0;i<js.length;i++){
    if(i%8===0) await status(`Reading the compendium… ${i+1} of ${js.length}`);
    const t=await text(js[i]);
    if(!/^od\.reader\.jsonp_(data_index|data_listing|batch_data)\(/.test(t.slice(0,48))) continue;   // not a compendium file
    try{
      const {kind,cat,payload}=parseJsonp(t);
      const c = lib[cat] ||= {cols:null, rows:[], index:{}, data:{}};
      if(kind==='listing'){ c.cols=payload[0]; c.rows=payload[1]; c.hay=null; }
      else if(kind==='index') Object.assign(c.index,payload);
      else Object.assign(c.data,payload);
      ok++;
    }catch(e){ console.warn('skipped',js[i].p,e); }
  }
  if(ok){ S.lowCache={}; S.meta={}; S.terms=null; await save(); }
  await status('');
}
function noLibrary(){
  $('#welcome').style.display='';
  $('#welcome h2').textContent='No library found';
  $('#welcome p').innerHTML='This program contains no game content. Put your own library files in the <b>Libraries</b> folder next to the program: '+
    'the compendium in <code>Libraries\\Compendium</code> (the folders armor, class, power…) and the Character Builder files in '+
    '<code>Libraries\\Character Builder</code> (<code>combined.dnd40.merged.xml</code> and any <code>.part</code> files). '+
    'The program picks them up by itself.';
  $('#welcome .row').replaceChildren(Object.assign(document.createElement('button'),{className:'btn primary',type:'button',textContent:'Look again',onclick:()=>location.reload()}));
}
// a small bar at the top: the library files changed while the program was open
async function libraryChangedBar(){
  if(document.getElementById('libbar')) return;
  // Windows also reports a folder as changed when files in it are only read: show the bar only for a real change
  let list=[]; try{ list=await (await fetch('/_list/Libraries')).json(); }catch(e){ return; }
  list=list.filter(f=>/\.(js|xml|part)$/i.test(f.p));
  if(JSON.stringify([LIBRARY_READER, ...list.map(f=>[f.p,f.s,f.m])])===await loadKey('libsig')) return;
  if(document.getElementById('libbar')) return;
  const bar=document.createElement('div'); bar.id='libbar';
  bar.innerHTML='<span>Your library files have changed.</span>';
  const now=Object.assign(document.createElement('button'),{className:'btn small primary',type:'button',textContent:'Load them now',
    onclick:async()=>{ if(typeof Builder!=='undefined' && Builder.dirty) await Builder.persist(); location.reload(); }});
  const later=Object.assign(document.createElement('button'),{className:'btn small',type:'button',textContent:'Later',onclick:()=>bar.remove()});
  bar.append(now,later); document.body.append(bar);
}

async function wipe(){ try{ const db=await idb(); await new Promise(res=>{ const t=db.transaction('kv','readwrite'); t.objectStore('kv').delete('library'); t.objectStore('kv').delete('rules'); t.oncomplete=res; }); }catch(e){} }

/* ---------- helpers ---------- */
const CAT_LABEL = {[ALL]:'Everything', epicdestiny:'Epic Destiny', paragonpath:'Paragon Path'};
const catLabel = c => CAT_LABEL[c] || c.charAt(0).toUpperCase()+c.slice(1);
const nameCol = c => Math.max(0, c.cols.indexOf('Name'));
const srcCol = c => c.cols.findIndex(x=>/^source/i.test(x));
const tokens = v => String(v).split(/,|\band\b|\bor\b|\//i).map(x=>x.trim()).filter(Boolean);
const bookTokens = v => String(v).split(/[,;]/).map(x=>x.trim()).filter(Boolean);
const NUM_RE = /\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?/;
function startNum(v){ const m=NUM_RE.exec(String(v)); return m ? parseFloat(m[0].replace(/,/g,'')) : null; }
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const V = cat => views[cat];
const where = id => S.cat===ALL ? views[ALL].ref[id] : [S.cat,id];     // list id -> [category, entry id]
function bookOk(v){ if(!S.hidden.size) return true; const b=bookTokens(v); return !b.length || b.some(x=>!S.hidden.has(x)); }

function prepare(){
  for(const c of Object.values(lib)){
    if(c.cols) continue;                      // no listing file: build a minimal one
    c.cols=['ID','Name'];
    const ids=new Set([...Object.keys(c.index),...Object.keys(c.data)]);
    c.rows=[...ids].map(id=>{ const h=/<h1[^>]*>(.*?)(<span|<\/h1>)/i.exec(c.data[id]||'');
      return [id, h ? h[1].replace(/<[^>]+>/g,'') : (c.index[id]||id).slice(0,50)]; });
  }
  for(const c of Object.values(lib)){
    // Some cells are lists like ["1+",1,16,6,...]: the first item is shown, the rest are other tiers (still searchable).
    if(!c.hay){ c.hay={}; for(const r of c.rows) c.hay[r[0]]=r.map(x=>Array.isArray(x)?x.join(' '):x).join(' ').toLowerCase(); }
    const li=c.cols.indexOf('Level');
    c.rows=c.rows.map(r=>{ const o=r.map(x=>Array.isArray(x)?String(x[0]):x);
      if(li>=0 && String(o[li]).trim()==='') o[li]='0';       // no level counts as level 0
      return o; });
  }
  // the Everything view
  views={};
  const all={cols:['ID','Name','Category','Level','SourceBook'], rows:[], hay:{}, ref:{}};
  for(const cat of Object.keys(lib).sort()){
    const c=lib[cat]; views[cat]=c;
    const ni=nameCol(c), li=c.cols.indexOf('Level'), sc=srcCol(c), lbl=catLabel(cat);
    for(const r of c.rows){
      const uid=cat+':'+r[0];
      all.rows.push([uid, r[ni], lbl, li>=0 ? r[li] : '', sc>=0 ? r[sc] : '']);
      all.hay[uid]=c.hay[r[0]]+' '+lbl.toLowerCase();
      all.ref[uid]=[cat,r[0]];
    }
  }
  views[ALL]=all;
}

function lowIndex(cat){
  if(S.lowCache[cat]) return S.lowCache[cat];
  const o={};
  if(cat===ALL){ for(const k of Object.keys(lib)){ const l=lowIndex(k); for(const id in l) o[k+':'+id]=l[id]; } }
  else for(const [k,v] of Object.entries(lib[cat].index)) o[k]=v.toLowerCase();
  return S.lowCache[cat]=o;
}

// a column is "number-first" when most of its values start with a digit (Level, Cost, ...)
function meta(cat){
  if(S.meta[cat]) return S.meta[cat];
  const c=V(cat);
  return S.meta[cat]=c.cols.map((col,i)=>{
    if(col==='ID'||col==='Name') return {numeric:false};
    if(col==='Level') return {numeric:true};
    let filled=0, digit=0;
    for(const r of c.rows){ const v=String(r[i]).trim(); if(!v) continue; filled++; if(/^\D?\d/.test(v)) digit++; }
    return {numeric: filled>0 && digit/filled>=0.5};
  });
}

function filterOptions(cat){
  const c=V(cat), mt=meta(cat), sc=srcCol(c), out=[];
  c.cols.forEach((col,i)=>{
    if(col==='ID'||col==='Name'||i===sc) return;
    if(mt[i].numeric){
      const set=new Set(); c.rows.forEach(r=>{ const n=startNum(r[i]); if(n!==null) set.add(n); });
      const keys=[...set].sort((a,b)=>a-b);
      if(keys.length>=2) out.push({col,i,numeric:true,keys,range:keys.length>40});
    }else{
      const seen=new Map(); c.rows.forEach(r=>tokens(r[i]).forEach(t=>{ const k=t.toLowerCase(); if(!seen.has(k)) seen.set(k,t); }));
      if(seen.size>=2 && seen.size<=80) out.push({col,i,numeric:false,keys:[...seen.values()].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))});
    }
  });
  return out;
}

function sortSpec(c){
  const has=c.cols.includes(S.sort.col);
  return {ci: has ? c.cols.indexOf(S.sort.col) : nameCol(c), dir: has ? S.sort.dir : 1, col: has ? S.sort.col : c.cols[nameCol(c)]};
}

function activeCount(c){ const sc=srcCol(c); if(sc<0 || !S.hidden.size) return c.rows.length; let n=0; for(const r of c.rows) if(bookOk(r[sc])) n++; return n; }

function visibleRows(){
  const c=V(S.cat), mt=meta(S.cat), sc=srcCol(c);
  const qs=S.q.toLowerCase().split(/\s+/).filter(Boolean);
  const low=S.full ? lowIndex(S.cat) : null;
  const fs=Object.entries(S.filters).filter(([,v])=>v!=='' && v!=null);
  const rows=c.rows.filter(r=>{
    if(sc>=0 && !bookOk(r[sc])) return false;
    for(const [i,v] of fs){
      if(typeof v==='object'){ const n=startNum(r[i]); if(n===null) return false; if(v.min!=null && n<v.min) return false; if(v.max!=null && n>v.max) return false; }
      else if(mt[i].numeric){ if(startNum(r[i])!==Number(v)) return false; }
      else if(!tokens(r[i]).some(t=>t.toLowerCase()===v.toLowerCase())) return false;
    }
    if(qs.length){
      const hay=(c.hay[r[0]] ?? r.join(' ').toLowerCase()) + (low ? ' '+(low[r[0]]||'') : '');
      for(const q of qs) if(!hay.includes(q)) return false;
    }
    return true;
  });
  const {ci,dir}=sortSpec(c), ni=nameCol(c), num=mt[ci].numeric;
  rows.sort((a,b)=>{
    let d=0;
    if(num){ const x=startNum(a[ci]), y=startNum(b[ci]);
      if(x===null||y===null){ if(x!==y) return x===null?1:-1; } else d=x-y; }      // blanks always last
    else d=String(a[ci]).localeCompare(String(b[ci]),undefined,{numeric:true});
    return d*dir || String(a[ni]).localeCompare(String(b[ni]),undefined,{numeric:true});
  });
  return rows;
}

/* ---------- source books ---------- */
// Full names, taken from the "Published in ..." lines of the entries themselves.
const BOOK_NAMES = {"AV":"Adventurer's Vault","DSCS":"Dark Sun Campaign Setting","PHB":"Player's Handbook","PHB2":"Player's Handbook 2","EPG":"Eberron Player's Guide","AV2":"Adventurer's Vault 2","MME":"Mordenkainen's Magnificent Emporium","MotP":"Manual of the Planes","PHB3":"Player's Handbook 3","PsP":"Psionic Power","E1":"E1 Death's Reach","TPB":"The Plane Below","TS":"The Shadowfell","HotEC":"Heroes of the Elemental Chaos","DMG":"Dungeon Master's Guide","PHR:T":"Player's Handbook Races: Tiefling","HS1":"HS1 The Slaying Stone","FRPG":"Forgotten Realms Player's Guide","PP":"Primal Power","PHR:D":"Player's Handbook Races: Dragonborn","DP":"Divine Power","AP":"Arcane Power","MP2":"Martial Power 2","NCS":"Neverwinter Campaign Setting","DSH":"Into the Unknown: The Dungeon Survival Handbook","HotF":"Heroes of the Feywild","HotFK":"Heroes of the Forgotten Kingdoms","HotFL":"Heroes of the Fallen Lands","HoS":"Heroes of Shadow","MP":"Martial Power","FRCG":"Forgotten Realms Campaign Guide","MV:TttNV":"Monster Vault: Threats to the Nentir Vale","DMG2":"Dungeon Master's Guide 2","ECS":"Eberron Campaign Setting","MM2":"Monster Manual 2","MV":"Monster Vault","CC":"Class Compendium","MM":"Monster Manual","RC":"Rules Compendium","P2":"P2 Demon Queen Enclave","H1":"H1 Keep on the Shadowfell","P3":"P3 Assault on Nightwyrm Fortress","DMK":"Dungeon Master's Kit","Draco: Metallic":"Draconomicon: Metallic Dragons","FR1":"FR1 Scepter Tower of Spellgard","E2":"E2 Kingdom of the Ghouls","P1":"P1 King of the Trollhaunt Warrens","Draco: Chromatic":"Draconomicon: Chromatic Dragons","E3":"E3 Prince of Undeath","H3":"H3 Pyramid of Shadows","MM3":"Monster Manual 3","H2":"H2 Thunderspire Labyrinth","HS2":"HS2 Orcs of Stonefang Pass","DD":"Dungeon Delve","DoE":"Dragons of Eberron","DSCC":"Dark Sun Creature Catalog","TPA":"The Plane Above","PHH:S1":"PH Heroes: Series 1","PHH:S2":"PH Heroes: Series 2","Red Box":"Red Box Starter Set"};
const MAG_RE = /^(Dra|Dun)(\d+|Annual)$/;
const isMagazine = code => MAG_RE.test(code);
function bookLabel(code){
  const m=MAG_RE.exec(code);
  if(m) return (m[1]==='Dra'?'Dragon Magazine ':'Dungeon Magazine ') + m[2];
  return BOOK_NAMES[code] || code;
}
const stripThe = t => t.replace(/^the\s+/i,'');

function buildBooks(){
  const set=new Set();
  for(const c of Object.values(lib)){ const sc=srcCol(c); if(sc<0) continue; c.rows.forEach(r=>bookTokens(r[sc]).forEach(b=>set.add(b))); }
  const all=[...set]; S.books=all;
  const mags=all.filter(isMagazine).sort((a,b)=>bookLabel(a).localeCompare(bookLabel(b),undefined,{numeric:true}));
  const mains=all.filter(b=>!isMagazine(b)).sort((a,b)=>stripThe(bookLabel(a)).localeCompare(stripThe(bookLabel(b)),undefined,{sensitivity:'base',numeric:true}));
  const panel=$('#bookPanel'); panel.replaceChildren();
  $('#booksBtn').style.display = all.length ? '' : 'none';
  const boxes=new Map(), items=[];
  const setCodes=(codes,on)=>{ codes.forEach(b=>{ on ? S.hidden.delete(b) : S.hidden.add(b); boxes.get(b).checked=on; }); booksChanged(); };
  const btn=(t,fn)=>{ const b=document.createElement('button'); b.className='btn'; b.type='button'; b.textContent=t; b.onclick=fn; return b; };
  const top=document.createElement('div'); top.className='bar';
  const find=document.createElement('input'); find.type='search'; find.placeholder='Find a book…';
  find.oninput=()=>{ const q=find.value.toLowerCase().trim(); items.forEach(([el,txt])=>el.style.display = txt.includes(q) ? '' : 'none'); };
  top.append(find, btn('Select everything',()=>setCodes(all,true)), btn('Select nothing',()=>setCodes(all,false)));
  panel.append(top);
  const group=(title,codes)=>{
    if(!codes.length) return;
    const h=document.createElement('div'); h.className='ghead';
    const t=document.createElement('strong'); t.textContent=title;
    h.append(t, btn('Select all',()=>setCodes(codes,true)), btn('Select none',()=>setCodes(codes,false)));
    const list=document.createElement('div'); list.className='list';
    for(const b of codes){
      const l=document.createElement('label'), x=document.createElement('input');
      x.type='checkbox'; x.checked=!S.hidden.has(b);
      x.onchange=()=>{ x.checked ? S.hidden.delete(b) : S.hidden.add(b); booksChanged(); };
      boxes.set(b,x);
      const name=bookLabel(b), sp=document.createElement('span'); sp.textContent=name; l.title=name;
      l.append(x,sp); list.append(l); items.push([l,(name+' '+b).toLowerCase()]);
    }
    panel.append(h,list);
  };
  group('Books',mains);
  group('Magazines',mags);
  updateBooksBtn();
}
function updateBooksBtn(){ const on=S.books.filter(b=>!S.hidden.has(b)).length; $('#booksBtn').textContent=`Books ${on}/${S.books.length}`; }
function updateCounts(){
  document.querySelectorAll('#cats button').forEach(b=>{ const n=activeCount(V(b.dataset.cat));
    b.querySelector('small').textContent=n; b.classList.toggle('zero',n===0); });
}
function booksChanged(){ updateBooksBtn(); updateCounts(); saveSettings(); S.limit=300; renderList(); }

/* ---------- screen building ---------- */
function start(){
  prepare(); buildBooks(); S.meta={}; S.terms=null;
  $('#welcome').style.display='none';
  $('#tabs').style.display='';
  const hasComp=Object.keys(lib).length>0;
  let saved=null; try{ saved=localStorage.getItem('open-compendium-tab'); }catch(e){}
  const want=S.tab || saved || 'builder';
  showTab(!hasComp ? 'builder' : (want==='builder' && !RULES.db ? 'comp' : want));
  if(!hasComp) return;
  const cats=[ALL, ...Object.keys(lib).sort((a,b)=>catLabel(a).localeCompare(catLabel(b)))];
  $('#cats').replaceChildren(...cats.map(cat=>{
    const b=document.createElement('button'); b.type='button';
    b.innerHTML='<span></span><small></small>';
    b.firstChild.textContent=catLabel(cat);
    if(cat===ALL) b.classList.add('everything');
    b.onclick=()=>selectCat(cat); b.dataset.cat=cat; return b;
  }));
  updateCounts();
  selectCat(views[S.cat] ? S.cat : (lib.power ? 'power' : cats[0]));
}

function showTab(t){
  S.tab=t; try{ localStorage.setItem('open-compendium-tab',t); }catch(e){}
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));
  $('#app').style.display = t==='comp' && Object.keys(lib).length ? 'grid' : 'none';
  $('#compEmpty').hidden = !(t==='comp' && !Object.keys(lib).length);
  $('#builder').style.display = t==='builder' ? '' : 'none';
  $('#bookPanel').hidden=true; closePop();
  $('#booksBtn').style.display = t==='comp' && S.books.length ? '' : 'none';    // the builder uses its own campaign book list
  if(t==='builder') Builder.show();
}

function renderHead(){
  const c=V(S.cat), tr=document.createElement('tr'), sp=sortSpec(c);
  c.cols.forEach(col=>{
    if(col==='ID') return;
    const th=document.createElement('th');
    th.textContent = col + (col===sp.col ? (sp.dir>0 ? ' ▲' : ' ▼') : '');
    th.onclick=()=>{ S.sort={col, dir: col===sp.col ? -sp.dir : 1}; saveSettings(); renderHead(); renderList(); };
    tr.append(th);
  });
  $('#thead').replaceChildren(tr);
}

function emptyDetail(){
  $('#entry').innerHTML='<div class="empty"><b>Nothing selected</b>Pick an entry from the list to read it here. Dotted words inside an entry open their rules.</div>';
}

function selectCat(cat){
  S.cat=cat; S.q=''; S.filters={}; S.limit=300; S.sel=null;      // sorting and book choices deliberately persist
  $('#q').value=''; $('#full').checked=false; S.full=false; closePop();
  document.querySelectorAll('#cats button').forEach(b=>b.classList.toggle('on',b.dataset.cat===cat));
  $('#filters').replaceChildren(...filterOptions(cat).map(f=>{
    if(f.range){
      const w=document.createElement('span'); w.className='range'; w.title=f.col;
      const lo=document.createElement('input'), hi=document.createElement('input');
      lo.type=hi.type='number'; lo.placeholder=f.col+' min'; hi.placeholder=f.col+' max';
      const upd=()=>{ const mn=lo.value===''?null:Number(lo.value), mx=hi.value===''?null:Number(hi.value);
        S.filters[f.i]=(mn==null && mx==null) ? '' : {min:mn,max:mx}; S.limit=300; renderList(); };
      lo.oninput=hi.oninput=upd; w.append(lo,hi); return w;
    }
    const s=document.createElement('select'); s.title=f.col;
    s.add(new Option(`${f.col}: all`,''));
    f.keys.forEach(k=>s.add(new Option(String(k),String(k))));
    s.onchange=()=>{ S.filters[f.i]=s.value; S.limit=300; renderList(); };
    return s;
  }));
  renderHead(); emptyDetail(); renderList();
  document.body.classList.remove('showing');
}

function renderList(){
  const c=V(S.cat), rows=visibleRows(), mt=meta(S.cat);
  const shown=rows.slice(0,S.limit);
  $('#count').textContent=`${rows.length} of ${activeCount(c)}` + (rows.length>shown.length ? ` — showing ${shown.length}` : '');
  const frag=document.createDocumentFragment();
  for(const r of shown){
    const tr=document.createElement('tr'); tr.className='row'+(r[0]===S.sel?' on':'');
    r.forEach((v,i)=>{ if(c.cols[i]==='ID') return; const td=document.createElement('td');
      const n=mt[i].numeric ? startNum(v) : null; td.textContent = n===null ? v : String(n); tr.append(td); });
    tr.onclick=()=>{ S.sel=r[0]; document.querySelectorAll('tr.row.on').forEach(e=>e.classList.remove('on')); tr.classList.add('on'); showEntry(r[0]); };
    frag.append(tr);
  }
  if(rows.length>shown.length){
    const tr=document.createElement('tr'), td=document.createElement('td');
    td.colSpan=c.cols.length; td.style.textAlign='center'; td.style.cursor='pointer'; td.textContent='Show more…';
    tr.onclick=()=>{ S.limit+=500; renderList(); }; tr.append(td); frag.append(tr);
  }
  $('#tbody').replaceChildren(frag);
}

function sanitize(html){
  const doc=new DOMParser().parseFromString(html,'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,link,meta,form,base').forEach(e=>e.remove());
  doc.body.querySelectorAll('*').forEach(el=>{ for(const a of [...el.attributes]){ const n=a.name.toLowerCase();
    if(n.startsWith('on') || n==='href' || n==='src' || n==='srcset' || n==='style') el.removeAttribute(a.name); } });
  return doc.body.innerHTML;
}

/* ---------- glossary words that open a popup ---------- */
// Every glossary entry is linked. Conditions and item keywords match in any capitalisation ("dazed", "Dazed");
// other terms only when written with the same capitals, so ordinary words like "fire" or "push" stay plain.
// Book titles ("Dragon Magazine 380", "Player's Handbook") are matched first and left alone.
function termIndex(){
  if(S.terms) return S.terms;
  const exact=new Map(), loose=new Map(), titles=new Set();
  for(const [cat,c] of Object.entries(lib)){
    if(!/glossary/i.test(cat)) continue;
    const ni=nameCol(c), ti=c.cols.indexOf('Type'), ki=c.cols.indexOf('Category');
    for(const r of c.rows){
      const n=String(r[ni]).trim(); if(n.length<4) continue;
      const any = ti>=0 && (r[ti]==='Rules Condition' || (r[ti]==='Keyword' && r[ki]!=='Monsters'));
      if(any){ if(!loose.has(n.toLowerCase())) loose.set(n.toLowerCase(),[cat,r[0]]); }
      else if(!exact.has(n)) exact.set(n,[cat,r[0]]);
    }
  }
  for(const b of S.books) titles.add(bookLabel(b).toLowerCase());
  ['dragon magazine','dungeon magazine'].forEach(t=>titles.add(t));
  const words=[...new Set([...exact.keys(), ...loose.keys(), ...titles].map(w=>w.toLowerCase()))]
    .sort((a,b)=>b.length-a.length).map(escRe);
  const re = words.length ? new RegExp('(?<![\\w-])('+words.join('|')+')(?![\\w-])','gi') : null;
  return S.terms={exact, loose, titles, re};
}

// ordinary phrases that start with a rules word but don't mean it
const NOT_TERMS=[/^pick (up|it|them)\b/i];
function linkTerms(root, selfKey){
  const T=termIndex(); if(!T.re) return;
  const w=document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes=[];
  while(w.nextNode()){ const n=w.currentNode; if(!n.parentElement.closest('h1,.term,.publishedIn,.empty,.notice')) nodes.push(n); }
  for(const n of nodes){
    const t=n.nodeValue; T.re.lastIndex=0; let m, last=0, frag=null;
    while((m=T.re.exec(t))){
      const word=m[0], low=word.toLowerCase();
      if(T.titles.has(low)) continue;                                   // a book title: leave as text
      if(NOT_TERMS.some(r=>r.test(t.slice(m.index)))) continue;          // "Pick up an item" is not the Pick weapon group
      const hit = T.exact.get(word) || T.loose.get(low);
      if(!hit || hit[0]+':'+hit[1]===selfKey) continue;
      frag ||= document.createDocumentFragment();
      frag.append(t.slice(last,m.index));
      const sp=document.createElement('span'); sp.className='term'; sp.textContent=word;
      sp.dataset.cat=hit[0]; sp.dataset.id=hit[1];
      frag.append(sp); last=m.index+word.length;
    }
    if(frag){ frag.append(t.slice(last)); n.replaceWith(frag); }
  }
}

function renderInto(box, cat, id){
  const c=lib[cat], html=c.data[id];
  if(html){ box.innerHTML=sanitize(html); }
  else{
    box.replaceChildren();
    const n=document.createElement('div'); n.className='notice';
    n.textContent='The full formatted entry is not in the loaded data files, so this is the plain search text.';
    const row=c.rows.find(r=>r[0]===id);
    const h=document.createElement('h1'); h.className='player'; h.textContent=row ? row[nameCol(c)] : id;
    const p=document.createElement('p'); p.textContent=c.index[id] || '(no text available)';
    box.append(n,h,p);
  }
  linkTerms(box, cat+':'+id);
}

let popFor=null;
function closePop(){ $('#pop').hidden=true; popFor=null; }
function openPop(el){
  const r=el.getBoundingClientRect(), p=$('#pop');
  const host=document.querySelector('dialog[open]')||document.body;   // a popup must sit inside an open dialog to be visible
  if(p.parentElement!==host) host.append(p);
  if(el.dataset.rid) Builder.renderElement(p, el.dataset.rid);
  else renderInto(p, el.dataset.cat, el.dataset.id);
  p.hidden=false; p.scrollTop=0;
  p.style.left=Math.max(8,Math.min(r.left, innerWidth-p.offsetWidth-8))+'px';
  let top=r.bottom+6; if(top+p.offsetHeight>innerHeight-8) top=Math.max(8,r.top-p.offsetHeight-6);
  p.style.top=top+'px'; popFor=el;
}

function showEntry(id){
  const [cat,rid]=where(id);
  closePop();
  renderInto($('#entry'), cat, rid);
  $('#detail').scrollTop=0;
  document.body.classList.add('showing');
}

/* ---------- wiring ---------- */
$('#q').oninput=e=>{ S.q=e.target.value; S.limit=300; renderList(); };
$('#full').onchange=e=>{ S.full=e.target.checked; renderList(); };
document.addEventListener('click',e=>{
  const t=e.target.closest && e.target.closest('.term');
  if(t){ if(popFor===t) closePop(); else openPop(t); return; }        // a word inside the popup opens its own popup
  if(!e.target.closest('#bookPanel,#booksBtn')) $('#bookPanel').hidden=true;
  closePop();
});
$('#detail').addEventListener('scroll',closePop);
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
// drag a tab to swap the order of Compendium and Character Builder (remembered)
(()=>{
  const nav=$('#tabs'); let drag=null;
  const saveOrder=()=>{ try{ localStorage.setItem('open-compendium-taborder',JSON.stringify([...nav.children].map(b=>b.dataset.tab))); }catch(e){} };
  try{ const o=JSON.parse(localStorage.getItem('open-compendium-taborder')||'null'); if(Array.isArray(o)) o.forEach(k=>{ const b=nav.querySelector(`[data-tab="${k}"]`); if(b) nav.append(b); }); }catch(e){}
  for(const b of nav.children){
    b.draggable=true; b.title='Drag to change the order';
    b.addEventListener('dragstart',e=>{ drag=b; b.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; });
    b.addEventListener('dragend',()=>{ b.classList.remove('dragging'); drag=null; saveOrder(); });
    b.addEventListener('dragover',e=>{ if(!drag||drag===b) return; e.preventDefault();
      const r=b.getBoundingClientRect(); nav.insertBefore(drag, e.clientX<r.left+r.width/2 ? b : b.nextSibling); });
  }
})();
$('#booksBtn').onclick=()=>{ $('#bookPanel').hidden=!$('#bookPanel').hidden; };
$('#back').onclick=()=>document.body.classList.remove('showing');
// light / dark toggle, remembered
(function(){ const b=$('#themeBtn'), root=document.documentElement;
  const show=()=>{ b.textContent = root.dataset.theme==='dark' ? '☀ Light' : '☾ Dark'; };
  b.onclick=()=>{ root.dataset.theme = root.dataset.theme==='dark' ? 'light' : 'dark'; try{ localStorage.setItem('open-compendium-theme',root.dataset.theme); }catch(e){} show(); };
  show(); })();

