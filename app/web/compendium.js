"use strict";
const $ = s => document.querySelector(s);
const APP_VERSION = '1.1';
let lib = {};      // raw data per category: {cols, rows, index, data, hay}
let views = {};    // what the list shows: every category plus "*" (Everything)
const ALL = '*';
const MOUNT = '~mount';     // a view, not a category: monsters with the mount keyword and the player mounts among the companions
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
const LIBRARY_READER=12;   // raised when the way the library is read changes, so it is read again
// the library files the program reads and remembers (homebrew packs are read on their own, every start)
const isHomebrewFile=f=>/^Homebrew\//i.test(f.p);
const libraryFiles=list=>list.filter(f=>/\.(js|xml|part)$/i.test(f.p) && !isHomebrewFile(f));
async function loadLibrary(){ await loadLibraryFiles(); await loadHomebrew(); }
async function loadLibraryFiles(){
  let list=[]; try{ list=await (await fetch('/_list/Libraries')).json(); }catch(e){}
  list=libraryFiles(list);
  const sig=JSON.stringify([LIBRARY_READER, ...list.map(f=>[f.p,f.s,f.m])]);
  if(await loadKey('libsig')===sig){
    const saved=await restore(); if(saved && Object.keys(saved).length) lib=saved;
    const raw=await loadKey('rules'); if(raw){ try{ RULES.use(raw); }catch(e){ console.warn(e); } }
    const core=await loadKey('core'); if(core) applyCore(core);
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
/* ---------- homebrew packs (Libraries\Homebrew\*.part, not the Deleted folder) ----------
   Read every start and whenever they change; they are small. HOMEBREW.packs: [{name, file, text, count, error}] */
const HOMEBREW={packs:[], sig:''};
const packFiles=list=>list.filter(f=>isHomebrewFile(f) && /\.part$/i.test(f.p) && !/^Homebrew\/Deleted\//i.test(f.p))
  .sort((a,b)=>a.p.localeCompare(b.p,undefined,{sensitivity:'base',numeric:true}));
async function homebrewChanged(list){ return JSON.stringify(packFiles(list).map(f=>[f.p,f.s,f.m]))!==HOMEBREW.sig; }
async function loadHomebrew(refresh){
  let list=[]; try{ list=await (await fetch('/_list/Libraries')).json(); }catch(e){}
  const files=packFiles(list);
  HOMEBREW.sig=JSON.stringify(files.map(f=>[f.p,f.s,f.m]));
  const packs=[];
  for(const f of files){
    let text=''; try{ const r=await fetch('/Libraries/'+f.p.split('/').map(encodeURIComponent).join('/')); if(r.ok) text=await r.text(); }catch(e){}
    const name=f.p.split('/').pop().replace(/\.part$/i,'');
    packs.push({name, file:f.p, text});
  }
  HOMEBREW.packs=packs;
  if(RULES.raw || RULES.base) RULES.applyHomebrew(packs);
  if(refresh) document.dispatchEvent(new Event('homebrew-changed'));
}
// without the core library the program still works, but the lists and tables in it are empty: say which file is missing
function coreNotice(){
  if(CORE_LOADED || document.getElementById('corebar')) return;
  const bar=document.createElement('div'); bar.id='corebar'; bar.className='libbar';
  bar.innerHTML='<span>The core library (<b>open-compendium-core.part</b>) is not in your Libraries folder. The program works, but ability score arrays and point buy, starting money, magic item values, Charge and unarmed attacks, combat actions, conditions and effect durations, optional details, full book names and the newer monster math stay empty until it is back.</span>';
  bar.append(Object.assign(document.createElement('button'),{className:'btn small',type:'button',textContent:'OK',onclick:()=>bar.remove()}));
  document.body.append(bar);
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
  // the core library (open-compendium-core.part): the rules and lists the program itself needs (ability arrays,
  // combat actions, conditions, book names...). It is read on its own, not as part of the Character Builder rules.
  const isCore=f=>/^open-compendium-core\.part$/i.test(base(f));
  let core=[];
  for(const f of list.filter(isCore)){ try{ core=core.concat(RULES.parse(await text(f),true)); }catch(e){ console.warn('core library skipped',f.p,e); } }
  applyCore(core); await saveKey('core',core);
  list=list.filter(f=>!isCore(f));
  const ours=f=>/open-compendium/i.test(base(f));
  // a .part is read when it is ours or changed after the merged file was made (older ones are already inside it).
  // So whenever the merged file is rewritten, a part that is not yet inside it must be saved again after it.
  const parts=list.filter(f=>/\.part$/i.test(f.p) && (!merged || ours(f) || f.m>merged.m)).sort((a,b)=>base(a).localeCompare(base(b)));
  for(const f of parts){
    await status(`Reading ${base(f)}…`);
    const t=await text(f); if(!/<D20Rules/.test(t.slice(0,600))) continue;
    try{ RULES.addPart(t, ours(f) ? 'ours' : merged ? 'newer' : 'add'); }catch(e){ console.warn('part skipped',f.p,e); }
  }
  if(RULES.raw) await saveKey('rules', RULES.raw);
  // the compendium
  const js=list.filter(f=>/\.js$/i.test(f.p));
  let ok=0; const extraRows={};
  for(let i=0;i<js.length;i++){
    if(i%8===0) await status(`Reading the compendium… ${i+1} of ${js.length}`);
    const t=await text(js[i]);
    if(!/^od\.reader\.jsonp_(data_index|data_listing|batch_data)\(/.test(t.slice(0,48))) continue;   // not a compendium file
    try{
      const {kind,cat,payload}=parseJsonp(t);
      const c = lib[cat] ||= {cols:null, rows:[], index:{}, data:{}};
      // our own additions (a file with "open-compendium" in its name) add rows instead of replacing the listing
      if(kind==='listing' && /open-compendium/i.test(js[i].p)) (extraRows[cat] ||= []).push({cols:payload[0], rows:payload[1]});
      else if(kind==='listing'){ c.cols=payload[0]; c.rows=payload[1]; c.hay=null; }
      else if(kind==='index') Object.assign(c.index,payload);
      else Object.assign(c.data,payload);
      ok++;
    }catch(e){ console.warn('skipped',js[i].p,e); }
  }
  // added entries: their columns are matched to the category's own by name
  for(const [cat,adds] of Object.entries(extraRows)){
    const c=lib[cat]; if(!c) continue;
    for(const a of adds){ const cols=c.cols||a.cols; if(!c.cols) c.cols=cols;
      const ids=new Set(c.rows.map(r=>r[0]));
      for(const r of a.rows){ if(ids.has(r[0])) continue; const o=cols.map(k=>{ const j=a.cols.indexOf(k); return j<0 ? '' : r[j]; }); c.rows.push(o); }
      c.hay=null; }
  }
  // corrections from our additions file (a misspelt name, wording an official update changed): applied to both
  if(RULES.raw && applyCorrections()){ RULES.use(RULES.raw); await saveKey('rules', RULES.raw); }
  if(ok){ S.lowCache={}; S.meta={}; S.terms=null; await save(); }
  await status('');
}
/* A correction is an entry of type "Correction" in the additions file: its name is the right text, "Wrong" the text it
   replaces, and "Only" (optional) the ids it applies to. The wrong spelling stays findable in the compendium's search. */
function applyCorrections(){
  const fixes=(RULES.raw||[]).filter(o=>o.type==='Correction' && o.spec?.Wrong);
  const aliases=(RULES.raw||[]).filter(o=>o.type==='Alias' && o.spec?.Only);
  if(!fixes.length && !aliases.length) return false;
  // ID_FMP_POWER_7572 in the builder is power7572 in the compendium; other ids are used as they are
  const compIds=list=>new Set(list.map(x=>{ const m=/^ID_FMP_([A-Z_]+?)_(\d+)$/.exec(x); return m ? m[1].replace(/_/g,'').toLowerCase()+m[2] : x; }));
  /* An "Alias" is another name an entry is known by (the book's name, when the library kept a later one): the
     entry is found by either name, in the compendium's search and the builder's lists. Nothing is renamed. */
  for(const a of aliases){
    const only=new Set(a.spec.Only.split(',').map(x=>x.trim())), cids=compIds([...only]);
    for(const o of RULES.raw) if(o!==a && only.has(o.id)) (o.also ||= []).push(a.name);
    for(const c of Object.values(lib)){
      for(const r of c.rows) if(cids.has(r[0])) ((c.also ||= {})[r[0]] ||= []).push(a.name);
      for(const id of Object.keys(c.index)) if(cids.has(id)) c.index[id]+=' '+a.name;
    }
  }
  const sw=(t,f)=>typeof t==='string' ? t.split(f.spec.Wrong).join(f.name) : t;
  for(const f of fixes){
    const only=f.spec.Only ? new Set(f.spec.Only.split(',').map(x=>x.trim())) : null;
    /* "Field" (optional) names one line of a builder entry (Hit, Effect, Secondary Attack…): only that line is
       corrected, and the compendium is left alone (it already has the right text). */
    const field=f.spec.Field?.trim();
    if(field){
      const add=f.spec.Wrong.trim()==='(missing)', before=f.spec.Before?.trim();
      for(const o of RULES.raw) if(o!==f && (!only || only.has(o.id)) && o.spec){
        const keys=Object.keys(o.spec);
        // Wrong "(missing)": the line is not there at all, so it is added (in front of the line named in "Before")
        if(add){ if(keys.some(k=>k.trim()===field)) continue;
          const at=before ? keys.findIndex(k=>k.trim()===before) : -1, spec={};
          keys.forEach((k,i)=>{ if(i===at) spec[field]=f.name; spec[k]=o.spec[k]; }); if(at<0) spec[field]=f.name;
          o.spec=spec; continue; }
        if(field==='(source)'){ o.source=sw(o.source,f); continue; }   // the book a builder entry says it is from
        for(const k of keys) if(k.trim()===field) o.spec[k]=sw(o.spec[k],f);   // a second attack's lines are indented
      }
      continue;
    }
    for(const o of RULES.raw){
      if(o===f || (only && !only.has(o.id))) continue;
      const was=o.name; o.name=sw(o.name,f); if(o.name!==was) (o.also ||= []).push(was);   // the old spelling still finds it
      o.text=sw(o.text,f); o.flavor=sw(o.flavor,f);
      if(o.spec) for(const k of Object.keys(o.spec)) o.spec[k]=sw(o.spec[k],f);
    }
    // in the compendium the same entries: ID_FMP_POWER_7572 is power7572 there
    const cids=only ? compIds([...only]) : null;
    const mine=id=>!cids || cids.has(id);
    for(const c of Object.values(lib)){
      for(const r of c.rows) if(mine(r[0])) for(let i=0;i<r.length;i++){
        if(typeof r[i]==='string' && r[i].includes(f.spec.Wrong)){ r[i]=sw(r[i],f); ((c.also ||= {})[r[0]] ||= []).push(f.spec.Wrong); }
        else if(Array.isArray(r[i]) && typeof r[i][0]==='string' && r[i][0].includes(f.spec.Wrong)) r[i]=[sw(r[i][0],f),...r[i].slice(1)];   // a level or price column: what it shows comes first
      }
      for(const id of Object.keys(c.data)) if(mine(id) && c.data[id].includes(f.spec.Wrong)) c.data[id]=sw(c.data[id],f);
      for(const id of Object.keys(c.index)) if(mine(id) && c.index[id].includes(f.spec.Wrong)) c.index[id]=sw(c.index[id],f)+' '+f.spec.Wrong;
    }
  }
  return true;
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
  let all=[]; try{ all=await (await fetch('/_list/Libraries')).json(); }catch(e){ return; }
  // a homebrew pack added, changed or removed (by the workshop, or a file dropped in): put the packs on again, no reload
  if(await homebrewChanged(all)) await loadHomebrew(true);
  const list=libraryFiles(all);
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
const CAT_LABEL = {[ALL]:'Everything', [MOUNT]:'Mount', epicdestiny:'Epic Destiny', paragonpath:'Paragon Path', monstertemplate:'Monster Template', monstertheme:'Monster Theme'};
const catLabel = c => CAT_LABEL[c] || c.charAt(0).toUpperCase()+c.slice(1);
const nameCol = c => Math.max(0, c.cols.indexOf('Name'));
const srcCol = c => c.cols.findIndex(x=>/^source/i.test(x));
const tokens = v => String(v).split(/,|\band\b|\bor\b|\//i).map(x=>x.trim()).filter(Boolean);
const bookTokens = v => String(v).split(/[,;]/).map(x=>x.trim()).filter(Boolean);
const NUM_RE = /\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?/;
function startNum(v){ const m=NUM_RE.exec(String(v)); return m ? parseFloat(m[0].replace(/,/g,'')) : null; }
/* Searching: a name is found by its words in any order; apostrophes don't matter ("Griffons Pull" finds "Griffon's Pull").
   Book names are never searched (the book lists are for that). */
// search: apostrophes vanish, other punctuation counts as a space, and several words must appear together in the order typed
const searchNorm = s => ' '+String(s??'').toLowerCase().replace(/['’‘`´]/g,'').replace(/[^\p{L}\p{N}+]+/gu,' ').trim()+' ';
const searchWords = q => searchNorm(q).split(' ').filter(Boolean);
const _phraseRe = new WeakMap();   // 'griff pu' still finds 'Griffon's Pull': each word may be the start of a longer word
const wordsIn = (words, hay) => { if(!words.length) return true; if(words.length===1) return hay.includes(words[0]);
  let re=_phraseRe.get(words); if(!re){ re=new RegExp(words.map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\S* ')); _phraseRe.set(words,re); }
  return re.test(hay); };
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const V = cat => views[cat];
const where = id => views[S.cat]?.ref ? views[S.cat].ref[id] : [S.cat,id];     // list id -> [category, entry id]
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
    { c.hay={}; c.hayAll={}; const ni=nameCol(c), sc=srcCol(c);
      for(const r of c.rows){ c.hay[r[0]]=searchNorm(r[ni]+' '+(c.also?.[r[0]]||[]).join(' '));
        c.hayAll[r[0]]=searchNorm(r.filter((x,i)=>i!==sc && i!==0).map(x=>Array.isArray(x)?x.join(' '):x).join(' ')+' '+(c.also?.[r[0]]||[]).join(' ')); } }
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
      all.hay[uid]=c.hay[r[0]]; (all.hayAll ||= {})[uid]=c.hayAll[r[0]]+searchNorm(lbl);
      all.ref[uid]=[cat,r[0]];
    }
  }
  views[ALL]=all;
  // the Mount view: each row points at its entry in Monster or Companion
  const mt={cols:['ID','Name','Kind','Level','Size','CreatureType','SourceBook'], rows:[], hay:{}, ref:{}};
  const pick=(cat,keep,kind)=>{ const c=lib[cat]; if(!c) return;
    const col=k=>c.cols.indexOf(k), ni=nameCol(c), li=col('Level'), si=col('Size'), ti=col('CreatureType'), sc=srcCol(c);
    for(const r of c.rows){ if(!keep(r,col)) continue; const uid=cat+':'+r[0];
      const lv = li>=0 ? r[li] : ((/class=level>Level (\d+)/.exec(c.data[r[0]]||'')||[])[1] || '');      // companions have no Level column
      mt.rows.push([uid, r[ni], kind, lv, si>=0 ? r[si] : '', ti>=0 ? r[ti] : '', sc>=0 ? r[sc] : '']);
      mt.hay[uid]=c.hay[r[0]]; (mt.hayAll ||= {})[uid]=c.hayAll[r[0]]+searchNorm(kind); mt.ref[uid]=[cat,r[0]]; } };
  pick('monster',(r,col)=>tokens(r[col('CreatureType')]).some(t=>/^mount$/i.test(t)),'Monster');
  pick('companion',(r,col)=>/^mount$/i.test(String(r[col('Type')]).trim()),'Companion');
  if(mt.rows.length) views[MOUNT]=mt;
}

function lowIndex(cat){
  if(S.lowCache[cat]) return S.lowCache[cat];
  const o={};
  if(cat===ALL){ for(const k of Object.keys(lib)){ const l=lowIndex(k); for(const id in l) o[k+':'+id]=l[id]; } }
  else if(views[cat]?.ref){ for(const [uid,[k,id]] of Object.entries(views[cat].ref)){ const l=lowIndex(k)[id]; if(l) o[uid]=l; } }
  // the entry's text without its "Published in" line (books are not searched)
  else { const c=lib[cat]; for(const k of new Set([...Object.keys(c.index),...Object.keys(c.data)])){ const h=c.data[k];
    o[k]=searchNorm(h ? h.replace(/<p class=publishedIn>[\s\S]*?<\/p>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&[a-z]+;/g,' ') : String(c.index[k]||'').replace(/Published in[\s\S]*$/,'')); } }
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
  const qs=searchWords(S.q);
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
      const hay=S.full ? (c.hayAll?.[r[0]] ?? '')+' '+(low[r[0]]||'') : (c.hay[r[0]] ?? searchNorm(r[nameCol(c)]));
      if(!wordsIn(qs,hay)) return false;
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
let BOOK_NAMES = {};          // code -> full book name, from the core library
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
  const hasRules=!!RULES.db, both=!hasComp && !hasRules;
  // a tab with no library behind it is hidden (unless neither library is there: then both show their notices)
  $('#tabs [data-tab="comp"]').hidden = !hasComp && !both;
  $('#tabs [data-tab="builder"]').hidden = !hasRules && !both;
  const want=S.tab || 'builder';          // the program always opens on the Character Builder
  showTab(!hasComp ? 'builder' : (want==='builder' && !hasRules ? 'comp' : want));
  if(!hasComp) return;
  const cats=[ALL, ...[...Object.keys(lib), ...(views[MOUNT] ? [MOUNT] : [])].sort((a,b)=>catLabel(a).localeCompare(catLabel(b)))];
  $('#cats').replaceChildren(...cats.map(cat=>{
    const b=document.createElement('button'); b.type='button';
    b.innerHTML='<span></span><small></small>';
    b.firstChild.textContent=catLabel(cat);
    if(cat===ALL) b.classList.add('everything');
    b.onclick=()=>selectCat(cat); b.dataset.cat=cat; return b;
  }));
  updateCounts();
  selectCat(views[S.cat] ? S.cat : ALL);      // a fresh start shows Everything
}

function showTab(t){
  S.tab=t; try{ localStorage.setItem('open-compendium-tab',t); }catch(e){}
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));
  $('#app').style.display = t==='comp' && Object.keys(lib).length ? 'grid' : 'none';
  $('#compEmpty').hidden = !(t==='comp' && !Object.keys(lib).length);
  $('#builder').style.display = t==='builder' ? '' : 'none';
  $('#workshop').style.display = t==='brew' ? '' : 'none';
  $('#bookPanel').hidden=true; closePop();
  $('#booksBtn').style.display = t==='comp' && S.books.length ? '' : 'none';    // the builder shows its own campaign book list there
  if(t==='comp'){ updateBooksBtn(); $('#booksBtn').title='The books the compendium shows'; }
  if(t==='builder') Builder.show();
  if(t==='brew') Workshop.show();
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
  const c=V(S.cat), rows=visibleRows(), mt=meta(S.cat), sc=srcCol(c);
  const shown=rows.slice(0,S.limit);
  $('#count').textContent=`${rows.length} of ${activeCount(c)}` + (rows.length>shown.length ? ` — showing ${shown.length}` : '');
  const frag=document.createDocumentFragment();
  for(const r of shown){
    const tr=document.createElement('tr'); tr.className='row'+(r[0]===S.sel?' on':'');
    r.forEach((v,i)=>{ if(c.cols[i]==='ID') return; const td=document.createElement('td');
      const n=mt[i].numeric ? startNum(v) : null;
      if(i===sc && v){ const d=document.createElement('div'); d.className='srccell'; d.textContent=v; td.title=bookTokens(v).map(bookLabel).join('\n'); td.append(d); }   // long source lists: two lines, the rest on hover
      else td.textContent = n===null ? v : String(n);
      tr.append(td); });
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
  const exact=new Map(), loose=new Map(), titles=new Set(), dis=new Map();
  // diseases a monster passes on ("level 8 mummy rot") open their own entry too
  for(const [cat,c] of Object.entries(lib)){
    if(!/^disease$/i.test(cat)) continue;
    const ni=nameCol(c);
    for(const r of c.rows){ const n=String(r[ni]).trim(); dis.set(n.toLowerCase(),[cat,r[0]]); if(n.length>=6 && !loose.has(n.toLowerCase())) loose.set(n.toLowerCase(),[cat,r[0]]); }
  }
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
  return S.terms={exact, loose, titles, re, dis};
}

// ordinary phrases that start with a rules word but don't mean it
const NOT_TERMS=[/^pick (up|it|them)\b/i];
// the die-face characters (recharge 5 6 and the like) are too small to read in most fonts: show each as its number in a little box
const DIE='⚀⚁⚂⚃⚄⚅';
function showDice(root){
  const w=document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes=[];
  while(w.nextNode()) if(/[⚀-⚅]/.test(w.currentNode.nodeValue)) nodes.push(w.currentNode);
  for(const n of nodes){
    const frag=document.createDocumentFragment();
    for(const part of n.nodeValue.split(/([⚀-⚅])/)){
      if(part.length===1 && DIE.includes(part)){ const d=document.createElement('span'); d.className='die'; d.textContent=DIE.indexOf(part)+1; d.title='a roll of '+d.textContent; frag.append(d); }
      else if(part) frag.append(part);
    }
    n.replaceWith(frag);
  }
}
function linkTerms(root, selfKey){
  showDice(root);
  const T=termIndex(); if(!T.re) return;
  // a monster's own version of a disease ("filth fever" in the Dire Rat opens "Dire Rat Filth Fever")
  const h1=root.querySelector('h1.monster'), who=h1 ? String(h1.firstChild && h1.firstChild.nodeValue || '').trim().toLowerCase() : '';
  const own=low=>{ if(!who) return null; for(const n of [who, who.replace(/\s*\(.*\)$/,''), who.split(',')[0]]){ const d=T.dis.get(n+' '+low); if(d) return d; } return null; };
  const w=document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes=[];
  while(w.nextNode()){ const n=w.currentNode; if(!n.parentElement.closest('h1,.term,.publishedIn,.empty,.notice')) nodes.push(n); }
  for(const n of nodes){
    const t=n.nodeValue; T.re.lastIndex=0; let m, last=0, frag=null;
    while((m=T.re.exec(t))){
      const word=m[0], low=word.toLowerCase();
      if(T.titles.has(low)) continue;                                   // a book title: leave as text
      if(NOT_TERMS.some(r=>r.test(t.slice(m.index)))) continue;          // "Pick up an item" is not the Pick weapon group
      let hit = T.exact.get(word) || T.loose.get(low);
      if(hit && /^disease$/i.test(hit[0])) hit = own(low) || hit;
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

// The ability scores and the Alignment / Languages line of a stat block: lined up in even columns, as in the books.
const STAT_ROW=[/^<b>\s*Str\s*<\/b>.*<b>\s*Dex\s*<\/b>.*<b>\s*Wis\s*<\/b>/s, /^<b>\s*Con\s*<\/b>.*<b>\s*Int\s*<\/b>.*<b>\s*Cha\s*<\/b>/s,
                /^<b>\s*Alignment\s*<\/b>.*<b>\s*Languages\s*<\/b>/s];
/* ---------- monsters in one layout ----------
   The compendium has two monster layouts: the older one (2008-2010: "(standard; at-will)" after each power, the
   powers in one list) and the newer one (Monster Vault on: the powers under Traits, Standard Actions, Move
   Actions... and the core stats in a table). Both are shown alike: the powers grouped under their action type
   as in the newer layout, the core stats as plain lines as in the older one. The entries themselves are not
   changed. An older power loses the action word its heading already gives ("(standard; at-will)" becomes
   "(at-will)"), and the newer monsters' core stats follow the older order (Initiative and Senses first, Speed last). */
const GAP='<span class="gap"></span>';
const ACTION_GROUPS=['Traits','Standard Actions','Move Actions','Minor Actions','Free Actions','Triggered Actions'];
function unifyMonster(box){
  const h1=box.querySelector('h1.monster'); if(!h1) return;
  const tbl=box.querySelector('table.bodytable');
  const tidy=s=>s.replace(/(?:\s|&nbsp;){3,}/g,GAP);
  if(tbl){
    // the newer layout: the stats table becomes lines
    const rows=[...tbl.rows].map(tr=>[...tr.cells].map(td=>td.innerHTML.trim()).filter(Boolean));
    const pick=re=>{ for(const r of rows) for(let i=0;i<r.length;i++) if(re.test(r[i])) return r.splice(i,1)[0]; return ''; };
    const hp=pick(/^<b>HP<\/b>/), init=pick(/^<b>Initiative<\/b>/), ac=pick(/^<b>AC<\/b>/), perc=pick(/^<b>Perception<\/b>/), speed=pick(/^<b>Speed<\/b>/);
    // the third row's right cell is the senses (Darkvision...), once Speed is taken out
    const senses=rows[2] && rows[2].length===1 && !/^<b>/.test(rows[2][0]) ? rows[2].splice(0,1)[0].replace(/^[A-Z](?=[a-z])/,c=>c.toLowerCase()) : '';
    const sensesLine=perc ? '<b>Senses</b> '+perc.replace(/^<b>Perception<\/b>\s*/,'Perception ')+(senses?'; '+senses:'') : (senses?'<b>Senses</b> '+senses:'');
    const lines=[[init,sensesLine].filter(Boolean).join(GAP), hp, ac, ...rows.filter(r=>r.length).map(r=>r.join(GAP)), speed].filter(Boolean);
    const p=document.createElement('p'); p.className='flavor'; p.innerHTML=lines.join('<br>');
    tbl.replaceWith(p);
    return;
  }
  if(box.querySelector(':scope > h2')) return;          // already grouped under headings
  // the older layout: core stats as they are (wide spaces become one gap); auras go to Traits
  const stat=h1.nextElementSibling && h1.nextElementSibling.matches('p.flavor:not(.alt)') ? h1.nextElementSibling : null;
  const auras=[];
  if(stat){
    const segs=stat.innerHTML.split(/<br\s*\/?>/i).map(x=>x.trim()).filter(Boolean), keep=[];
    for(const s of segs){
      const m=/^<b>([^<]+)<\/b>\s*((?:\([^)]*\)\s*)?)aura\s*(\d+)(.*)$/i.exec(s);
      if(m && !/^(Initiative|HP|AC|Speed|Senses)$/i.test(m[1].trim())){
        const rest=m[4].replace(/^\s*[;,:]?\s*/,'').replace(/^[a-z]/,c=>c.toUpperCase());
        auras.push(['☼ <b>'+m[1].trim()+'</b> '+(m[2]?m[2].trim()+' ':'')+'✦ Aura '+m[3], rest]);
      } else keep.push(tidy(s));
    }
    stat.innerHTML=keep.join('<br>');
  }
  // powers: a heading line (p.flavor.alt) and its text lines, up to the Alignment / ability scores block
  const groups={}; ACTION_GROUPS.forEach(g=>groups[g]=[]);
  const heads=[...box.querySelectorAll(':scope > p.flavor.alt')].filter(p=>!/<b>\s*(Alignment|Str|Skills|Languages|Equipment)\b/.test(p.innerHTML));
  if(!heads.length && !auras.length) return;
  for(const [hd,txt] of auras){ const a=document.createElement('p'); a.className='flavor alt'; a.innerHTML=hd; const b=document.createElement('p'); b.className='flavorIndent'; b.innerHTML=txt; groups.Traits.push([a,b]); }
  for(const hp of heads){
    const body=[]; let n=hp.nextElementSibling;
    while(n && n.matches('p.flavorIndent')){ body.push(n); n=n.nextElementSibling; }
    const m=/<\/b>\s*\(([^)<]*)(\)|$|(?=<))/.exec(hp.innerHTML), use=m?m[1].trim().toLowerCase():'';   // a few lack the closing bracket
    const first=use.split(/[;,]/)[0].trim();
    let g='Traits';
    if(/^standard\b/.test(first)) g='Standard Actions';
    else if(/^move\b/.test(first)) g='Move Actions';
    else if(/^minor\b/.test(first)) g='Minor Actions';
    else if(/^free\b/.test(first)) g='Free Actions';
    else if(/^(immediate|opportunity|no action|when|while|reaction|interrupt)/.test(first) || /\bwhen\b/.test(first)) g='Triggered Actions';
    if(m && /^(standard|move|minor|free)\b/.test(first)){
      // the heading already says the action: "(standard; at-will)" -> "(at-will)", "(minor 1/round; at-will)" -> "(1/round; at-will)"
      let u=m[1].trim().replace(/^(standard|move|minor|free)(\s+action)?\b\s*/i,'').replace(/^[;,]\s*/,'');
      hp.innerHTML=hp.innerHTML.replace(m[0], u ? '</b> ('+u+')' : '</b>');
    } else if(m && !m[2]) hp.innerHTML=hp.innerHTML.replace(m[0], m[0].trimEnd()+')');   // close the bracket the entry forgot
    groups[g].push([hp,...body]);
  }
  // put them back in order, each group under its heading, where the first power was
  const anchor=document.createComment('powers');
  if(heads[0]) heads[0].before(anchor); else (stat||h1).after(anchor);
  const frag=document.createDocumentFragment();
  for(const g of ACTION_GROUPS){ if(!groups[g].length) continue;
    const h=document.createElement('h2'); h.textContent=g; frag.append(h);
    for(const nodes of groups[g]) frag.append(...nodes); }
  anchor.replaceWith(frag);
}

function statColumns(root){
  root.querySelectorAll('p').forEach(p=>{
    const segs=p.innerHTML.split(/<br\s*\/?>/i).map(x=>x.trim());
    if(!segs.some(x=>STAT_ROW.some(r=>r.test(x)))) return;
    const g=document.createElement('div'); g.className='statcols';
    for(const seg of segs){
      if(!seg) continue;
      if(STAT_ROW.some(r=>r.test(seg))){
        // one cell per bold label: Str | Dex | Wis, or Alignment | Languages (the last spans the rest of the row)
        const parts=seg.split(/(?=<b>\s*(?:Str|Dex|Wis|Con|Int|Cha|Alignment|Languages)\s*<\/b>)/);
        parts.forEach((x,i)=>{ const d=document.createElement('span'); d.innerHTML=x.trim(); if(parts.length===2 && i===1) d.className='rest'; g.append(d); });
      } else { const d=document.createElement('span'); d.className='full'; d.innerHTML=seg; g.append(d); }
    }
    p.replaceChildren(g);
  });
}

// Trap lists ("✦ DC 8: ..."): the star stays at the margin and wrapped lines indent past it, as in the books.
function hangBullets(root){
  root.querySelectorAll('.trapblockbody').forEach(sp=>{
    if(!sp.innerHTML.includes('✦')) return;
    const lines=sp.innerHTML.split(/<br\s*\/?>/i).filter(x=>x.trim());
    sp.innerHTML=lines.map(x=>{
      const m=x.match(/^(?:\s|&nbsp;)*✦(?:\s|&nbsp;)*/);
      return m ? '<span class="bul"><span class="star">✦</span>'+x.slice(m[0].length)+'</span>' : '<span class="line">'+x+'</span>';
    }).join('');
  });
}

function renderInto(box, cat, id){
  const c=lib[cat], html=c.data[id];
  box.dataset.cat=cat;                                   // lets the style sheet colour by category (companions green, like monsters)
  // the newer monster math (the switch by the search box): the engine's version of an older monster, and what it changed
  const mm = cat==='monster' && S.newMath && html && typeof MonsterMath!=='undefined' ? MonsterMath.update(cat,id) : null;
  if(html){ box.innerHTML=sanitize(mm && mm.html || html); if(cat==='monster') unifyMonster(box); statColumns(box); hangBullets(box); }
  else{
    box.replaceChildren();
    const n=document.createElement('div'); n.className='notice';
    n.textContent='The full formatted entry is not in the loaded data files, so this is the plain search text.';
    const row=c.rows.find(r=>r[0]===id);
    const h=document.createElement('h1'); h.className='player'; h.textContent=row ? row[nameCol(c)] : id;
    const p=document.createElement('p'); p.textContent=c.index[id] || '(no text available)';
    box.append(n,h,p);
  }
  if(S.newMath && html && cat==='monster' && box.id==='entry' && typeof MONSTER_MATH!=='undefined' && MONSTER_MATH){
    const ch=mm ? mm.changes : [];
    const n=document.createElement('div'); n.className='mathnote'+(ch.length?'':' none');
    const b=document.createElement('b'); b.textContent=ch.length ? 'Newer monster math: what changed' : mm ? 'Newer monster math: nothing to change' : 'This monster already uses the newer monster math'; n.append(b);
    if(ch.length){ const ul=document.createElement('ul'); for(const c of ch){ const li=document.createElement('li'); li.textContent=c; ul.append(li); } n.append(ul); }
    const pub=box.querySelector('p.publishedIn'); pub ? pub.before(n) : box.append(n);
  }
  linkTerms(box, cat+':'+id);
}

/* Questions and messages in the program's own window (the system's pop-ups can leave the window unresponsive on
   Windows until it is clicked elsewhere). ask(text) -> Promise<true|false>; tell(text) shows a message. */
function ask(text,{ok='OK',cancel='Cancel'}={}){
  return new Promise(res=>{
    const d=document.createElement('dialog'); d.className='askdlg';
    const p=document.createElement('p'); p.textContent=text; p.style.whiteSpace='pre-line';
    const row=document.createElement('div'); row.className='brow'; row.style.justifyContent='flex-end'; row.style.marginTop='12px';
    let answer=false;
    const b=(t,v,cls)=>{ const x=document.createElement('button'); x.type='button'; x.className='btn'+(cls?' '+cls:''); x.textContent=t; x.onclick=()=>{ answer=v; d.close(); }; return x; };
    if(cancel) row.append(b(cancel,false));
    const okb=b(ok,true,'primary'); row.append(okb);
    d.append(p,row); document.body.append(d);
    d.addEventListener('close',()=>{ d.remove(); res(answer); });
    d.showModal(); okb.focus();
  });
}
function tell(text){ return ask(text,{cancel:null}); }

let popFor=null;
function closePop(){ $('#pop').hidden=true; popFor=null; }
function openPop(el){
  const r=el.getBoundingClientRect(), p=$('#pop');
  const host=document.querySelector('dialog[open]')||document.body;   // a popup must sit inside an open dialog to be visible
  if(p.parentElement!==host) host.append(p);
  if(el.dataset.rid){
    Builder.renderElement(p, el.dataset.rid);
    // a power the character has (chosen or gained automatically): its worked-out numbers under the text
    const e=RULES.db?.els[el.dataset.rid];
    if(e?.type==='Power' && Builder.ch && Builder.st?.granted.has(e.id)){ const nb=Builder.powerNumbers(e, true); if(nb){ const pub=p.querySelector('.publishedIn'); pub ? pub.before(nb) : p.append(nb); } }
  }
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
// the newer monster math: remembered between visits; the shown entry is drawn again
try{ S.newMath=localStorage.getItem('open-compendium-newmath')==='1'; }catch(e){ S.newMath=false; }
$('#newMath').checked=S.newMath;
$('#newMath').onchange=e=>{ S.newMath=e.target.checked; try{ localStorage.setItem('open-compendium-newmath',S.newMath?'1':'0'); }catch(x){}
  if(S.sel) showEntry(S.sel); };
document.addEventListener('click',e=>{
  const t=e.target.closest && e.target.closest('.term');
  if(t){ if(popFor===t) closePop(); else openPop(t); return; }        // a word inside the popup opens its own popup
  if(!e.target.closest('#bookPanel,#booksBtn')) $('#bookPanel').hidden=true;
  closePop();
});
$('#detail').addEventListener('scroll',closePop);
// Up and Down arrows step through the list (in the compendium tab, outside text boxes other than the search box)
document.addEventListener('keydown',e=>{
  if(e.key!=='ArrowDown' && e.key!=='ArrowUp') return;
  if(e.altKey || e.ctrlKey || e.metaKey || document.querySelector('dialog[open]')) return;
  if($('#app').style.display!=='grid') return;
  const a=document.activeElement;
  if(a && a!==$('#q') && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
  const rows=[...document.querySelectorAll('#tbody tr.row')]; if(!rows.length) return;
  const i=rows.findIndex(r=>r.classList.contains('on'));
  const j= i<0 ? 0 : Math.max(0,Math.min(rows.length-1, i+(e.key==='ArrowDown'?1:-1)));
  e.preventDefault();
  if(j===i) return;
  rows[j].click(); rows[j].scrollIntoView({block:'nearest'});
});
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
$('#booksBtn').onclick=()=>{ if(S.tab==='builder'){ Builder.openCampaign(); return; } $('#bookPanel').hidden=!$('#bookPanel').hidden; };
$('#back').onclick=()=>document.body.classList.remove('showing');
// light / dark toggle, remembered
(function(){ const b=$('#themeBtn'), root=document.documentElement;
  const show=()=>{ b.textContent = root.dataset.theme==='dark' ? '☀ Light' : '☾ Dark'; };
  b.onclick=()=>{ root.dataset.theme = root.dataset.theme==='dark' ? 'light' : 'dark'; try{ localStorage.setItem('open-compendium-theme',root.dataset.theme); }catch(e){} show(); };
  show(); })();

