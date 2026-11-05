"use strict";
/* =====================================================================
   Character builder screen (level 1), arranged like the original builder:
   Start | Class | Race | Background | Ability Scores | Skills | Powers | Feats
   Uses rules.js for the logic and compendium.js for showing entries.
   ===================================================================== */

const POINT_COST={10:0,11:1,12:2,13:3,14:5,15:7,16:9,17:12,18:16};
const STANDARD_ARRAY=[16,14,13,12,11,10];
const ARRAYS=[[18,14,11,10,10,8],[18,13,13,10,10,8],[18,13,11,10,10,10],[17,16,11,10,10,8],[17,15,13,10,10,8],
  [17,14,12,11,10,8],[16,16,13,11,10,8],[16,16,12,12,11,8],[16,14,14,11,11,8],[16,14,13,12,11,10]];
const curArray=ch=>ARRAYS[ch.arrayIdx ?? 9] || STANDARD_ARRAY;
const SECTIONS=[['start','Start'],['build','Build'],['shop','Shop'],['manage','Manage'],['sheet','Character Sheet']];
const STEPS=[['class','Class'],['race','Race'],['background','Background'],['abilities','Ability Scores'],['skills','Skills'],['powers','Powers'],['feats','Feats']];
const STEP_HAS_SHOWALL=new Set(['class','race','background','skills','powers','feats']);
// where each kind of choice is shown
const TYPE_STEP={'CountsAsRace':'race','Paragon Path':'class','Epic Destiny':'class','Class':'class','Build':'class','Deity':'class','Theme':'background','Race':'race','Race Ability Bonus':'abilities','Language':'race',
  'Background':'background','Background Choice':'background','Gender':'background','Alignment':'background','Skill Training':'skills','Power':'powers','Feat':'feats'};
// for other choices, look at what they came from
const OWNER_STEP={'Feat':'feats','Power':'powers','Race':'race','Racial Trait':'race','Class':'class','Class Feature':'class','Build':'class','Theme':'background','Background':'background','Background Choice':'background','Deity':'class'};
const TYPE_ORDER=['Class','Hybrid Class','Build','Class Feature','Paragon Path','Epic Destiny','Deity','Race','Race Ability Bonus','Racial Trait','Language','Theme','Background','Background Choice','Gender','Alignment'];
const INLINE_TYPES=new Set(['Race Ability Bonus','Language','Skill Training','Gender','Alignment','Background Choice']);
const isInline=t=>INLINE_TYPES.has(t) || /^Ability Increase/.test(t);

function newChar(){
  return {id:'c'+Date.now().toString(36), name:'New character', level:1, method:'array',
          abilities:{Strength:16,Constitution:14,Dexterity:13,Intelligence:12,Wisdom:11,Charisma:10},
          picks:{}, hb:{}, showAll:{}, extra:{}, campaign:lastCampaign(), xp:0, swaps:{}, details:{inherent:true, featTax:true}, items:[], equip:{}, money:10000, stored:0, rituals:[], formulas:[], practices:[],
          info:{player:(()=>{ try{ return localStorage.getItem('open-compendium-player')||''; }catch(e){ return ''; } })()}, journal:[], companionInfo:{}};
}

const el=(tag,props={},...kids)=>{ const e=document.createElement(tag); for(const [k,v] of Object.entries(props)){
  if(k==='class') e.className=v; else if(k==='text') e.textContent=v; else if(k.startsWith('on')) e[k]=v; else if(k==='dataset') Object.assign(e.dataset,v); else if(/^(disabled|checked|selected|hidden|required|readonly|multiple)$/.test(k)){ if(v) e.setAttribute(k,''); }   // on/off attributes: any empty value means off
    else if(v!==false && v!=null) e.setAttribute(k,v===true?'':v); }
  for(const k of kids.flat()) if(k!=null && k!==false) e.append(k.nodeType ? k : document.createTextNode(String(k))); return e; };

/* Character folders (like the original builder's folder list): the subfolders of the Characters folder */
const Folders={
  list:[],
  async load(){ try{ this.list=await OC.listFolders(); }catch(e){ this.list=[]; } this.sort(); },
  find(n){ n=String(n||'').toLowerCase(); return this.list.find(x=>x.toLowerCase()===n); },
  has(n){ return !!this.find(n); },
  /* the order you set by dragging (new folders go last); folders not placed yet follow alphabetically; Killed is
     always at the bottom */
  KEY:'open-compendium-folderorder',
  order(){ try{ return JSON.parse(localStorage.getItem(this.KEY)||'[]'); }catch(e){ return []; } },
  saveOrder(){ try{ localStorage.setItem(this.KEY,JSON.stringify(this.list)); }catch(e){} },
  sort(){
    const o=this.order().map(x=>x.toLowerCase()), at=n=>{ const i=o.indexOf(n.toLowerCase()); return i<0?1e6:i; };
    this.list.sort((a,b)=>(/^killed$/i.test(a)-/^killed$/i.test(b)) || at(a)-at(b) || a.localeCompare(b,undefined,{sensitivity:'base',numeric:true}));
  },
  move(name,before){       // put a folder just before another one (or at the end)
    const l=this.list.filter(x=>x!==name), i=before ? l.indexOf(before) : -1;
    l.splice(i<0?l.length:i,0,name); this.list=l; this.saveOrder(); this.sort();
  },
  clean(n){ return String(n||'').replace(/[\\/:*?"<>|]+/g,'_').replace(/[. ]+$/,'').trim().slice(0,60); },
  async make(n){
    n=this.clean(n); if(!n) return null;
    if(/^deleted$/i.test(n)){ tell('“Deleted” is where deleted characters go; please choose another name.'); return null; }
    if(this.has(n)) return this.find(n);
    try{ n=await OC.folderOp('make',n); }catch(e){ tell('Could not make that folder: '+e.message); return null; }
    this.list.push(n); this.sort(); this.saveOrder(); return n;
  },
  async rename(a,b){
    b=this.clean(b); if(!b || b===a) return a;
    if(/^deleted$/i.test(b)){ tell('“Deleted” is where deleted characters go; please choose another name.'); return a; }
    if(this.has(b) && b.toLowerCase()!==a.toLowerCase()){ tell('A folder with that name already exists.'); return a; }
    try{ b=await OC.folderOp('rename',a,b); }catch(e){ tell('Could not rename the folder: '+e.message.replace(/^.*Error: /,'')); return a; }
    this.list=this.list.map(x=>x===a?b:x); this.saveOrder(); this.sort(); return b;
  },
  async remove(n){
    try{ await OC.folderOp('remove',n); }catch(e){ tell('Only an empty folder can be removed. (Files you put there yourself count too.)'); return false; }
    this.list=this.list.filter(x=>x!==n); this.saveOrder(); return true;
  },
};

const Builder={
  ch:null, st:null, chars:{}, saveTimer:null, picker:null, step:'class',

  async init(){
    try{ this.chars=await loadChars(); }catch(e){ this.chars={}; }
    await Folders.load();
    try{ this.folderView=localStorage.getItem('open-compendium-folderview') ?? '*'; }catch(e){ this.folderView='*'; }
    if(this.folderView!=='*' && this.folderView!=='' && !Folders.has(this.folderView)) this.folderView='*';
    let cur=null; try{ cur=localStorage.getItem('open-compendium-char'); this.step=localStorage.getItem('open-compendium-step')||'class'; }catch(e){}
    this.section='start';      // the builder always opens on Start, where the character is chosen
    if(!STEPS.some(([k])=>k===this.step)) this.step='class';
    // the builder opens with no character: one is opened from the list, or a new one made
    this.ch=this.fixup(newChar()); this.none=true;
    if(!Object.keys(this.chars).length) this.step='class';
  },
  fixup(c){ if(typeof c.showAll!=='object' || !c.showAll) c.showAll={}; c.extra ||= {}; c.hb ||= {}; c.picks ||= {};
    c.items ||= []; c.equip ||= {}; if(c.money==null) c.money=10000; c.stored ||= 0; c.rituals ||= []; c.formulas ||= []; c.practices ||= [];
    c.campaign ||= lastCampaign();
    c.campaign.books=newBookNames(c.campaign.books);
    if(!c.details){ c.details={inherent: c.campaign.inherent!==undefined ? !!c.campaign.inherent : true}; }
    delete c.campaign.inherent;
    return c; },

  show(){ this.render(); },
  // open a character (or a new one): the shop's search and the Manage tab start fresh; a new character starts on Class
  openChar(c,isNew){
    if(!this.none && (this.chars[this.ch.id]||this.dirty)) this.persist();
    this.none=false; this.ch=this.fixup(c);
    this.shop={...this.shop, q:'', sel:null, base:null, qty:1, limit:200, inv:null, rsel:null};
    this.mtab='details';
    if(isNew) this.step='class';
    this.go('start');
  },
  go(step){
    if(SECTIONS.some(([k])=>k===step)) this.section=step; else { this.section='build'; this.step=step; }
    try{ localStorage.setItem('open-compendium-step',this.step); }catch(e){}
    this.render(); $('#bChoices').scrollTop=0; },

  changed(){
    this.render();
    if(this.none) return;
    this.dirty=true;
    clearTimeout(this.saveTimer);
    this.saveTimer=setTimeout(()=>this.persist(),400);
  },
  // the line shown under the character's name in the list, from the character as it is now
  summarize(){
    const st=this.st, find=t=>[...(st?.granted.values()||[])].find(e=>e.type===t);
    this.ch.summary=[find('Race')?.name, find('Class')?.name, 'level '+(this.ch.level||1)].filter(Boolean).join(' · ');
    this.ch.homebrew=st ? this.isHomebrew() : false;
  },
  async persist(){
    if(this.none) return;
    this.summarize();
    if(typeof syncCoins==='function') syncCoins(this.ch);
    this.chars[this.ch.id]=this.ch;
    try{ localStorage.setItem('open-compendium-char',this.ch.id); }catch(e){}
    this.dirty=false;
    await saveChars(this.chars);
  },

  /* ---------- where a choice belongs ---------- */
  stepOf(slot){
    if(/^(Familiar|Companion)/.test(slot.type)) return 'companion';     // shown on Manage -> Companion, like the original
    if(slot.extra) return TYPE_STEP[slot.type]||'feats';
    if(slot.type==='Power' && !/\$\$CLASS/.test(slot.cat) && this.cameFrom(slot,['Race','Racial Trait'])) return 'race';
    if(TYPE_STEP[slot.type]) return TYPE_STEP[slot.type];
    if(/^Ability Increase/.test(slot.type)) return 'abilities';
    // a theme can need the race (Knight of Synnoria: Llewyrr elf), so it and its own choices sit in Background, after Race
    if(this.cameFrom(slot,['Theme'])) return 'background';
    if(slot.type==='Class Feature' && !this.cameFrom(slot,['Race','Racial Trait'])) return 'class';
    if(this.cameFrom(slot,['Race','Racial Trait'])) return 'race';
    let id=slot.owner, guard=0, fallback=null;
    while(id && guard++<25){
      const e=RULES.db.els[id]; if(!e) break;
      if(e.type==='Power'){ fallback ||= 'powers'; }
      else if(OWNER_STEP[e.type]) return OWNER_STEP[e.type];
      const via=this.st.via.get(id); if(!via || via==='start' || via.startsWith('extra:')) break;
      id=via.split('#')[0];
    }
    return fallback||'class';
  },
  cameFrom(slot,types){
    let id=slot.owner, guard=0;
    while(id && guard++<25){
      const e=RULES.db.els[id]; if(!e) return false;
      if(types.includes(e.type)) return true;
      if(['Class','Feat','Background','Theme'].includes(e.type)) return false;
      const via=this.st.via.get(id); if(!via || via==='start' || via.startsWith('extra:')) return false;
      id=via.split('#')[0];
    }
    return false;
  },
  slotsFor(step){
    const order=t=>{ const i=TYPE_ORDER.indexOf(t); return i<0?99:i; };
    const list=this.st.slots.filter(s=>this.stepOf(s)===step).sort((a,b)=>(a.level||1)-(b.level||1) || order(a.type)-order(b.type));
    // a choice that belongs to something picked in another choice (Extra Manifestation's manifestation) goes right under it
    const by=new Map(); for(const s of list) for(const p of this.picksOf(s)) by.set(p,s);
    const kids=new Map(), top=[];
    const anchor=id=>/^(Class|Race|Theme|Background|Paragon Path|Epic Destiny|Hybrid Class|Build)$/.test(RULES.db.els[id]?.type||'');   // whole steps hang off these: no nesting
    for(const s of list){ const par=anchor(s.owner)?null:by.get(s.owner); if(par && par!==s){ if(!kids.has(par)) kids.set(par,[]); kids.get(par).push(s); s.sub=true; } else { top.push(s); s.sub=false; } }
    const out=[], put=s=>{ out.push(s); for(const k of kids.get(s)||[]) put(k); }; top.forEach(put);
    return out.length===list.length ? out : list;
  },
  picksOf(slot){ return this.ch.picks[slot.key] || (slot.def ? [slot.def] : []); },
  openIn(step){ return this.slotsFor(step).filter(s=>!s.optional && this.picksOf(s).length<s.number).length; },

  /* ---------- availability ---------- */
  // the character's campaign decides which books may be used
  bookOk(elm){
    const c=this.ch.campaign; if(!c || !c.books) return true;
    const src=sourcesOf(elm); if(!src.length) return true;
    if(!this._en || this._enFor!==c.books){ this._en=new Set(c.books); this._enFor=c.books; }
    return src.some(x=>this._en.has(x));
  },
  // the book list in use: the open character's, or (with none open) the placeholder whose list new characters start with
  camp(){ return this.ch.campaign; },
  saveCamp(){
    try{ localStorage.setItem(CAMPKEY,JSON.stringify(this.ch.campaign)); }catch(e){}
    this.changed();
    if($('#campDlg').open) $('#campCount').textContent=this.campaignLine();
    updateBuilderBooksBtn();
  },
  setCampaign(c){
    this.ch.campaign={name:c.name||'Campaign', books:newBookNames(c.books)};
    this.saveCamp();
  },
  campaignLine(){
    const c=this.ch.campaign||{}, all=builderBooks().length;
    return `${c.name||'All books'} · ${c.books? c.books.filter(b=>builderBooks().includes(b)).length : all} of ${all} books`;
  },
  openCampaign(){
    const dlg=$('#campDlg'), c=this.ch.campaign;
    $('#campWho').textContent = !this.none ? `Books for ${this.ch.name||'this character'}` : 'No character open: new characters start with these books';
    const name=$('#campName'); name.value=c.name||''; name.oninput=()=>{ this.ch.campaign.name=name.value; this.saveCamp(); };
    this.renderCampaignBooks();
    dlg.showModal();
  },
  renderCampaignBooks(){
    const box=$('#campBody'), all=builderBooks();
    const enabled=new Set(this.ch.campaign.books||all);
    const commit=()=>{ this.ch.campaign.books=all.filter(b=>enabled.has(b)); if(this.ch.campaign.books.length===all.length) this.ch.campaign.books=null; this.saveCamp(); };
    const mags=all.filter(isMagName).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    const mains=all.filter(b=>!isMagName(b)).sort((a,b)=>stripThe(a).localeCompare(stripThe(b),undefined,{sensitivity:'base',numeric:true}));
    const boxes=new Map(), items=[];
    const setAll=(list,on)=>{ list.forEach(b=>{ on?enabled.add(b):enabled.delete(b); boxes.get(b).checked=on; }); commit(); };
    const btn=(t,fn)=>el('button',{class:'btn small',type:'button',text:t,onclick:fn});
    const find=el('input',{type:'search',placeholder:'Find a book…'});
    find.oninput=()=>{ const q=find.value.toLowerCase().trim(); items.forEach(([l,t])=>l.style.display=t.includes(q)?'':'none'); };
    box.replaceChildren(el('div',{class:'bar'},find,btn('Select everything',()=>setAll(all,true)),btn('Select nothing',()=>setAll(all,false))));
    for(const [title,list] of [['Books',mains],['Magazines',mags]]){
      if(!list.length) continue;
      const grid=el('div',{class:'list'});
      for(const b of list){
        const cb=el('input',{type:'checkbox',checked:enabled.has(b)}); boxes.set(b,cb);
        cb.onchange=()=>{ cb.checked?enabled.add(b):enabled.delete(b); commit(); };
        const l=el('label',{title:b},cb,el('span',{text:b})); grid.append(l); items.push([l,b.toLowerCase()]);
      }
      box.append(el('div',{class:'ghead'},el('strong',{text:title}),btn('Select all',()=>setAll(list,true)),btn('Select none',()=>setAll(list,false))), grid);
    }
    $('#campCount').textContent=this.campaignLine();
  },
  exportCampaign(){
    const c=this.ch.campaign;
    const blob=new Blob([JSON.stringify({app:'Open Compendium',type:'campaign',version:1,name:c.name||'Campaign',books:c.books},null,1)],{type:'application/json'});
    const a=el('a',{href:URL.createObjectURL(blob),download:(c.name||'campaign').replace(/[\\/:*?"<>|]+/g,'_')+'.campaign.json'});
    document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  },
  async importCampaign(file){
    try{
      const o=JSON.parse(await file.text());
      if(o.type!=='campaign') throw new Error();
      this.setCampaign({name:o.name, books:Array.isArray(o.books)?o.books:null});
      if($('#campDlg').open) this.openCampaign();
    }catch(e){ tell('That file is not an Open Compendium campaign file.'); }
  },
  options(slot){
    const showAll=!!this.ch.showAll[this.stepOf(slot)], picks=this.picksOf(slot);
    const cls=classIds(this.st), classOnly=slot.type==='Power' && /\$\$CLASS/.test(slot.cat) && cls.length;
    return slotCandidates(slot,this.st)
      .filter(e=>!(e.type==='Feat' && e.spec['Container']))          // "Weapon Focus" itself is just a group heading
      .filter(e=>!classOnly || !e.spec['Class'] || cls.includes(e.spec['Class'].trim()))   // e.g. no vampire powers for a fighter
      .map(e=>{
        const pre=prereqOk(e,this.st), book=this.bookOk(e), house=isHouseRule(e), impl=veImplementOk(slot,e,this.st);
        const ok=pre && book && !slot.extra && !house && impl;
        return {el:e, ok, hide:!veRelevant(slot,e,this.st), why: slot.extra ? 'extra house-rule slot' : house ? 'house rule' : !pre ? 'prerequisites not met' : !book ? 'book not selected' : !impl ? 'a weapon group, not one of your implements' : ''};
      })
      .filter(o=>(o.ok && !o.hide) || showAll || slot.extra && prereqOk(o.el,this.st) || picks.includes(o.el.id))
      .sort((a,b)=>(b.ok-a.ok) || (/^(Race Ability Bonus|Ability Increase)/.test(slot.type) ? ABILITIES.indexOf(a.el.name)-ABILITIES.indexOf(b.el.name) : 0)
                   || a.el.name.localeCompare(b.el.name,undefined,{numeric:true}));
  },
  setPick(slot, id, on){
    const ch=this.ch, cur=[...this.picksOf(slot)];
    const i=cur.indexOf(id);
    if(on && i<0){
      if(slot.number===1){ cur.forEach(x=>delete ch.hb[slot.key+'|'+x]); cur.length=0; }
      else if(cur.length>=slot.number) return false;
      cur.push(id);
      if(slot.extra){ ch.hb[slot.key+'|'+id]=1; (ch.extraLevel ||= {})[slot.uid]=minLevelFor(RULES.db.els[id]); }
    }
    if(!on && i>=0){ cur.splice(i,1); delete ch.hb[slot.key+'|'+id]; }
    ch.picks[slot.key]=cur;
    this.changed(); return true;
  },
  // why a chosen option is homebrew right now ('' = it isn't)
  hbWhy(slot,id){
    if(slot.extra) return 'extra house-rule slot';
    const e=RULES.db.els[id]; if(!e) return '';
    if(isHouseRule(e)) return 'house rule';
    if(!prereqOk(e,this.st)) return 'prerequisites not met';
    if(!this.bookOk(e)) return 'book not in this campaign';
    if(!veImplementOk(slot,e,this.st)) return 'a weapon group, not one of your implements';
    return '';
  },
  isHomebrew(){ return this.st.slots.some(s=>this.picksOf(s).some(id=>this.hbWhy(s,id))) || OPTIONAL_DETAILS.some(d=>d.homebrew && this.ch.details?.[d.key]); },

  /* ---------- main render ---------- */
  render(){
    updateBuilderBooksBtn();
    const root=$('#bChoices'), sheet=$('#bSheet');
    if(!RULES.db){
      root.replaceChildren(el('div',{class:'bnote'},
        el('h2',{text:'Builder data not loaded'}),
        el('p',{text:'Put combined.dnd40.merged.xml (from CBLoader\\Cache) in the Libraries\\Character Builder folder next to the program. The builder reads its rules from that file.'})));
      sheet.replaceChildren(); return;
    }
    this._rev=null;
    this.st=evaluate(this.ch);
    // a companion with only one possible choice is given right away (a druid of spring always has a wolf)
    for(let i=0;i<4;i++){
      const one=this.st.slots.map(sl=>[sl, !sl.extra && sl.type==='Companion' && !this.picksOf(sl).length && this.options(sl).filter(o=>o.ok)]).find(([,o])=>o && o.length===1);
      if(!one) break;
      (this.ch.picks[one[0].key] ||= []).push(one[1][0].el.id);
      this.st=evaluate(this.ch);
    }
    if(!this.none && this.giveFreebies()) this.st=evaluate(this.ch);
    let body;
    if(this.section==='start') body=this.startStep();
    else if(this.section==='shop') body=this.shopStep();
    else if(this.section==='manage') body=this.manageStep();
    else if(this.section==='sheet') body=this.sheetStep();
    else body=[...({abilities:()=>this.abilitiesStep(), skills:()=>this.skillsStep()}[this.step] || (()=>this.choiceStep(this.step)))(), this.nextBar()];
    // lists keep their scroll position when the screen is redrawn
    const keep={}; root.querySelectorAll('[data-keep]').forEach(x=>keep[x.dataset.keep]=x.scrollTop);
    root.replaceChildren(this.stepNav(), ...body.filter(Boolean));
    // on Start, character files dropped anywhere on the page are imported straight away
    root.classList.toggle('dropchars', this.section==='start');
    // the Character Sheet uses the whole width; the small sheet on the side is hidden there
    document.body.classList.toggle('sheetmode', this.section==='sheet');
    root.querySelectorAll('[data-keep]').forEach(x=>{ if(keep[x.dataset.keep]) x.scrollTop=keep[x.dataset.keep]; });
    this.renderSheet(sheet);
    this.applyCharColour();
  },
  // the builder takes the character's colour (the portrait's, or the one chosen on Manage > Portrait) instead of the app's
  applyCharColour(){
    const b=$('#builder'), c=typeof frameColour==='function' && this.ch?.portrait ? frameColour(this.ch) : '';
    if(!c){ b.classList.remove('charcol'); return; }
    const [h,s0,l0]=hexToHsl(c), s=Math.min(s0,0.75);
    const light=hslToHex(h,s,Math.min(Math.max(l0,0.28),0.42)), dark=hslToHex(h,s,Math.max(Math.min(l0,0.72),0.6));
    b.style.setProperty('--char-l',light); b.style.setProperty('--char-d',dark);
    b.classList.add('charcol');
  },

  stepNav(){
    const total=STEPS.reduce((a,[k])=>a+this.openIn(k),0);
    const secs=el('nav',{class:'sections'});
    for(const [k,label] of SECTIONS)
      secs.append(el('button',{type:'button',class:'sec'+(this.section===k?' on':''),disabled:this.none && k!=='start',title:this.none && k!=='start'?'Open a character first':'',onclick:()=>this.go(k)},label,
        k==='build'&&total&&!this.none?el('span',{class:'need',text:total}):null,
        // companion choices waiting on Manage > Companion (level-up ability increases...)
        k==='manage'&&this.openIn('companion')?el('span',{class:'need',text:this.openIn('companion')}):null));
    const nav=el('nav',{class:'steps'});
    if(this.section==='build') for(const [k,label] of STEPS){
      let n=this.openIn(k);
      if(k==='abilities' && this.abilityProblem()) n=n||'!';
      nav.append(el('button',{type:'button',class:'step'+(this.step===k?' on':''),onclick:()=>this.go(k)},label, n?el('span',{class:'need',text:n}):null));
    }
    // (the character's name, level and homebrew mark are on the sheet; the campaign is under Manage)
    return el('div',{class:'stepwrap'}, secs, this.section==='build'?nav:null);
  },

  /* Items a class feature gives (a hexblade's pact weapon: "FREEBEE:<item>"): added and put in the main hand when
     it is free; taken away again when the feature goes (another pact chosen). They are not in the shop's list. */
  giveFreebies(){
    const ch=this.ch, db=RULES.db, want=new Map();
    for(const e of this.st.granted.values()){ if(/^(Magic Item|Weapon|Armor|Gear)$/.test(e.type)) continue;
      for(const [t,a] of e.rules||[]) if(t==='statadd' && /^FREEBEE:/.test(a.name||'') && db.els[a.name.slice(8)]) want.set(a.name.slice(8), e.name); }
    ch.freebies ||= {}; let changed=false;
    for(const [id,uid] of Object.entries(ch.freebies)){
      if(want.has(id) && ch.items.some(x=>x.uid===uid)) continue;
      ch.items=ch.items.filter(x=>x.uid!==uid);
      for(const [k,u] of Object.entries(ch.equip||{})) if(u===uid) delete ch.equip[k];
      delete ch.freebies[id]; changed=true;
    }
    for(const [id,from] of want){
      if(ch.freebies[id]) continue;
      // already there (an imported character has it among its items): that one is the feature's
      const had=ch.items.find(x=>!x.freebie && x.ids.includes(id));
      if(had){ had.freebie=from; ch.freebies[id]=had.uid; changed=true; continue; }
      const fe=db.els[id], kind=baseKind(fe), name=sp(fe,kind).toLowerCase();
      const b=kind ? (db.byType[kind]||[]).map(x=>db.els[x]).find(x=>x.name.toLowerCase()===name) : null;
      const it={uid:Math.random().toString(36).slice(2,9), ids:b?[b.id,fe.id]:[fe.id], qty:1, freebie:from};
      ch.items.push(it); ch.freebies[id]=it.uid; changed=true;
      ch.equip ||= {}; if(!ch.equip.main){ ch.equip.main=it.uid; }
    }
    // one put in a hand it can't go in (a pact weapon in the off hand, before that was stopped) is taken out of it
    for(const uid of Object.values(ch.freebies)) for(const [k,u] of Object.entries(ch.equip||{})){
      const it=ch.items.find(x=>x.uid===uid);
      if(u===uid && it && /^(main|off)$/.test(k) && !itemSlots(it).includes(k)){ delete ch.equip[k]; if(!ch.equip.main) ch.equip.main=uid; changed=true; } }
    if(changed) this.dirty=true;
    return changed;
  },
  // "Next" at the foot of each build step, as in the original: only once every required choice here is made (Enter presses it)
  nextBar(){
    const i=STEPS.findIndex(([k])=>k===this.step), next=STEPS[i+1];
    const left=this.openIn(this.step)||(this.step==='abilities' && this.abilityProblem() ? 1 : 0);
    const label=next ? 'Next: '+next[1] : 'Next: Shop';
    const b=el('button',{class:'btn primary nextstep',type:'button',disabled:!!left,text:label+' ▸',
      title:left ? 'Make the choices marked “choose” first' : 'Or press Enter',onclick:()=>next ? this.go(next[0]) : this.go('shop')});
    return el('div',{class:'nextbar'}, left ? el('span',{class:'muted small',text:typeof left==='number' && left>0 ? `${left} choice${left>1?'s':''} still to make on this page` : ''}) : null, b);
  },
  stepHeader(step,title){
    const kids=[el('h3',{text:title})];
    if(STEP_HAS_SHOWALL.has(step)) kids.push(el('label',{class:'chk',title:'List everything here, including options you don\'t qualify for or from books you switched off. Anything chosen that way is marked as homebrew.'},
      el('input',{type:'checkbox',checked:!!this.ch.showAll[step],onchange:e=>{ this.ch.showAll[step]=e.target.checked; this.changed(); }}),' Show everything available'));
    return el('div',{class:'stephead'},...kids);
  },

  /* ---------- Start ---------- */
  startStep(){
    if(this.st) this.summarize();
    const all=Object.values(this.none ? {...this.chars} : {...this.chars,[this.ch.id]:this.ch});      // with nothing open, only saved characters
    const view=this.folderView ?? '*';
    const inView=c=>view==='*' || (c.folder||'')===view;
    const cards=el('div',{class:'cards'});
    for(const c of all.filter(inView)) cards.append(this.charCard(c));
    if(!cards.children.length) cards.append(el('p',{class:'muted small',text:'No characters in this folder yet. Drag one here from another folder, or make a new one.'}));
    const isDefault=this.ch.name==='New character';
    const name=el('input',{type:'text',value:isDefault?'':this.ch.name,placeholder:'New character',class:'bname','aria-label':'Character name'});
    name.oninput=()=>{ this.ch.name=name.value.trim()?name.value:'New character'; this.dirty=true;
      const b=document.querySelector('#bChoices .ccard.on .cname'); if(b) b.textContent=name.value||'Unnamed';
      clearTimeout(this.saveTimer); this.saveTimer=setTimeout(()=>{ this.persist(); this.renderSheet($('#bSheet')); },400); };
    return [
      this.none ? el('div',{class:'bcard'}, el('h3',{text:'No character open'}), el('p',{class:'muted',text:'Open one from your characters below, or make a new one.'})) : null,
      this.none ? null : el('div',{class:'bcard'}, el('h3',{text:'Current character'}), el('label',{class:'muted small',text:'Name'}), name,
        el('div',{class:'brow',style:'margin-top:10px'}, el('label',{class:'muted small',text:'Level'}), this.levelSelect(),
          el('span',{class:'muted small',text:'For a new character starting above level 1. During play, add experience under Manage.'}))),
      this.none ? null : this.detailsCard(),

      el('div',{class:'bcard'}, el('div',{class:'stephead'},el('h3',{text:'Your characters'}),
          el('div',{class:'brow'},
            el('button',{class:'btn primary',type:'button',text:'New character',onclick:()=>{ const c=newChar(); c.folder=this.newFolder(); this.openChar(c,true); this.changed(); }}),
            el('button',{class:'btn',type:'button',text:'Open file…',title:'Open a character saved by this app (.json) or by the original Character Builder (.dnd4e)',onclick:()=>$('#charIn').click()}))),
        el('div',{class:'cfolders'}, this.folderList(all), cards),
        el('p',{class:'muted small',text:'Characters are saved automatically, one file each, in the Characters folder next to the program; each folder here is a folder there. Deleted characters are moved to Characters\\Deleted. Drag a character onto a folder to move it. Tick “Killed” to move a fallen character to the Killed folder. You can also drag character files (.dnd4e or .json) onto this screen to import them.'})),
      this.importReport(),
      el('div',{class:'appver',text:'Open Compendium '+APP_VERSION})];
  },

  // one character card: killed tick (top left), portrait, name, buttons; it can be dragged onto a folder
  charCard(c){
    const cur=!this.none && c.id===this.ch.id;
    const kill=el('input',{type:'checkbox',checked:!!c.killed,'aria-label':'Killed'});
    kill.onchange=()=>this.setKilled(c,kill.checked);
    const P=Portraits.of(c);
    const pic=c.portrait && !c.portraitBlank ? pictureImg(P,'cthumb','',img=>img.remove()) : null;
    const card=el('div',{class:'ccard'+(cur?' on':'')+(c.killed?' dead':''),draggable:'true',title:'Drag onto a folder to move it'},
      el('div',{class:'ctop'}, el('label',{class:'killchk',title:'Killed: moves the character to the Killed folder (untick to bring them back)'}, kill, el('span',{text:'Killed'})),
        el('span',{style:'flex:1'}), pic),
      el('div',{}, el('b',{class:'cname',text:c.name||'Unnamed'}), c.homebrew?el('span',{class:'hb small',text:'HB'}):null),
      el('div',{class:'muted small',text:c.summary||'Level 1'}),
      el('div',{class:'brow wrap'},
        cur ? el('span',{class:'muted small',text:'Open now'}) : el('button',{class:'btn small',type:'button',text:'Open',onclick:()=>this.openChar(c)}),
        el('button',{class:'btn small',type:'button',text:'Show file',title:'Show this character\'s file in its folder',onclick:async()=>{ if(cur) await this.persist(); OC.showChar(c.id); }}),
        el('button',{class:'btn small',type:'button',text:'Delete',onclick:()=>this.remove(c)})));
    card.addEventListener('dragstart',e=>{ e.dataTransfer.setData('application/x-oc-char',c.id); e.dataTransfer.effectAllowed='move'; card.classList.add('dragging'); });
    card.addEventListener('dragend',()=>card.classList.remove('dragging'));
    return card;
  },

  // the folder list beside the cards
  folderList(all){
    const view=this.folderView ?? '*';
    const count=f=>all.filter(c=>f==='*' || (c.folder||'')===f).length;
    const pick=f=>{ this.folderView=f; try{ localStorage.setItem('open-compendium-folderview',f); }catch(e){} this.render(); };
    const row=(f,label)=>{
      const on=f===view;
      const r=el('div',{class:'frow'+(on?' on':''),tabindex:'0',role:'button',onclick:()=>pick(f),onkeydown:e=>{ if(e.key==='Enter') pick(f); }},
        el('span',{class:'fname',text:label}), el('small',{text:count(f)}));
      if(on && f && f!=='*'){
        r.append(el('span',{class:'facts'},
          el('button',{class:'ficon',type:'button',title:'Rename this folder',text:'✎',onclick:e=>{ e.stopPropagation(); this.folderInput(r,f,async v=>{ const n=await Folders.rename(f,v); if(n!==f){ for(const c of all) if(c.folder===f) c.folder=n; this.folderView=n; try{ localStorage.setItem('open-compendium-folderview',n); }catch(e){} await this.saveAllChars(); } this.render(); }); }}),
          el('button',{class:'ficon',type:'button',title:count(f)?'Only an empty folder can be removed':'Remove this folder',text:'✕',disabled:count(f)>0,onclick:async e=>{ e.stopPropagation(); if(await Folders.remove(f)) pick('*'); }})));
      }
      if(f!=='*'){
        r.addEventListener('dragover',e=>{ if([...e.dataTransfer.types].includes('application/x-oc-char')){ e.preventDefault(); r.classList.add('drop'); } });
        r.addEventListener('dragleave',()=>r.classList.remove('drop'));
        r.addEventListener('drop',e=>{ const id=e.dataTransfer.getData('application/x-oc-char'); if(!id) return; e.preventDefault(); e.stopPropagation(); r.classList.remove('drop');
          const c=id===this.ch.id ? this.ch : this.chars[id]; if(c) this.moveChar(c,f); });
      }
      // your own folders can be dragged up and down to change their order (Killed stays at the bottom)
      if(f && f!=='*'){
        const fixed=/^killed$/i.test(f);
        if(!fixed){ r.draggable=true; r.title='Drag to change the order';
          r.addEventListener('dragstart',e=>{ e.dataTransfer.setData('application/x-oc-folder',f); e.dataTransfer.effectAllowed='move'; r.classList.add('dragging'); });
          r.addEventListener('dragend',()=>r.classList.remove('dragging')); }
        r.addEventListener('dragover',e=>{ if(![...e.dataTransfer.types].includes('application/x-oc-folder')) return; e.preventDefault();
          const below=fixed || e.offsetY>r.offsetHeight/2; r.classList.toggle('insbelow',below); r.classList.toggle('insabove',!below); });
        r.addEventListener('dragleave',()=>r.classList.remove('insabove','insbelow'));
        r.addEventListener('drop',e=>{ const name=e.dataTransfer.getData('application/x-oc-folder'); if(!name || name===f) return; e.preventDefault(); e.stopPropagation();
          const below=r.classList.contains('insbelow'); r.classList.remove('insabove','insbelow');
          const l=Folders.list.filter(x=>x!==name), i=l.indexOf(f);
          Folders.move(name, fixed ? f : below ? (l[i+1]||null) : f); this.render(); });
      }
      return r;
    };
    const box=el('div',{class:'flist'}, row('*','All'), row('','No folder'), ...Folders.list.map(f=>row(f,f)));
    const add=el('button',{class:'btn small',type:'button',text:'+ New folder'});
    add.onclick=()=>this.folderInput(add,'',async v=>{ const n=await Folders.make(v); if(n){ this.folderView=n; try{ localStorage.setItem('open-compendium-folderview',n); }catch(e){} } this.render(); });
    box.append(add);
    return box;
  },
  // a small text box in place of a folder row (new folder / rename); Enter keeps, Esc cancels
  folderInput(node,value,done){
    const i=el('input',{type:'text',value,class:'finput',placeholder:'Folder name','aria-label':'Folder name'});
    let finished=false;
    const finish=ok=>{ if(finished) return; finished=true; if(ok && i.value.trim()) done(i.value); else this.render(); };
    i.onkeydown=e=>{ if(e.key==='Enter'){ e.preventDefault(); finish(true); } else if(e.key==='Escape') finish(false); };
    i.onblur=()=>finish(true);
    i.onclick=e=>e.stopPropagation();
    node.replaceWith(i); i.focus(); i.select();
  },
  // the folder a new or imported character goes in: the one being viewed, except All and Killed (then No folder)
  newFolder(){ const v=this.folderView;
    if(/^killed$/i.test(v||'')){ this.folderView=''; try{ localStorage.setItem('open-compendium-folderview',''); }catch(e){} return ''; }
    return !v || v==='*' ? '' : v; },
  async saveAllChars(){ if(this.chars[this.ch.id] || this.dirty) this.chars[this.ch.id]=this.ch; this.dirty=false; await saveChars(this.chars); },
  async moveChar(c,f){ if((c.folder||'')===f) return; c.folder=f; if(c.id!==this.ch.id || this.chars[c.id]) this.chars[c.id]=c; await this.saveAllChars(); this.render(); },
  async setKilled(c,on){
    if(on){ c.killed=true; c.folderBeforeKilled=c.folder||''; c.folder=Folders.find('Killed') || await Folders.make('Killed') || c.folder; }
    else { c.killed=false; const back=c.folderBeforeKilled||''; c.folder=back && Folders.has(back) ? Folders.find(back) : ''; delete c.folderBeforeKilled; }
    this.chars[c.id]=c; await this.saveAllChars(); this.render();
  },

  detailsCard(){
    const d=this.ch.details ||= {inherent:true};
    const rows=OPTIONAL_DETAILS.filter(o=>o.homebrew || (o.ids||[o.id]).every(id=>RULES.db.els[id])).map(o=>{
      const cb=el('input',{type:'checkbox',checked:!!d[o.key]});
      cb.onchange=()=>{ d[o.key]=cb.checked; this.changed(); };
      return el('label',{class:'detail'}, cb, el('b',{text:o.name}), el('span',{class:'muted small',text:o.text}));
    });
    return el('div',{class:'bcard'}, el('h3',{text:'Optional details'}), el('p',{class:'muted small',text:'Check all that apply to this character.'}), ...rows);
  },

  levelSelect(){
    const sel=el('select',{'aria-label':'Level'});
    for(let n=1;n<=30;n++) sel.add(new Option(n,n,false,n===(this.ch.level||1)));
    sel.onchange=()=>this.setLevel(+sel.value,true);
    return sel;
  },
  // setting the level directly also sets experience to that level's minimum
  setLevel(n,fromSelect){
    const t=xpTable(); n=Math.max(1,Math.min(30,n));
    this.ch.level=n;
    if(fromSelect){ const x=this.ch.xp||0; if(x<t[n] || (n<30 && x>=t[n+1])) this.ch.xp=t[n]; }
    this.changed();
  },

  /* ---------- Manage: experience and levelling up ---------- */
  campaignCard(){
    return el('div',{class:'bcard'}, el('div',{class:'stephead'},el('h3',{text:'Campaign settings'}),
          el('div',{class:'brow'},
            el('button',{class:'btn small',type:'button',text:'Choose books…',onclick:()=>this.openCampaign()}),
            el('button',{class:'btn small',type:'button',text:'Save campaign file',onclick:()=>this.exportCampaign()}),
            el('button',{class:'btn small',type:'button',text:'Load campaign file…',onclick:()=>$('#campIn').click()}))),
        el('p',{text:this.campaignLine()}),
        el('p',{class:'muted small',text:'A campaign is the list of books a character may use. A DM can save one and give the file to players; loading it limits this character\'s options to those books. The compendium has its own separate book list.'}));
  },
  levelUpCards(){
    const ch=this.ch, t=xpTable(), lvl=ch.level||1, xp=ch.xp||0, next=lvl<30?t[lvl+1]:null;
    const amount=el('input',{type:'number',min:0,step:50,placeholder:'XP gained','aria-label':'Experience gained',class:'xpin'});
    const add=()=>{ const v=Math.floor(+amount.value||0); if(!v) return;
      const before=lvl; ch.xp=Math.max(0,xp+v); const reach=levelForXp(ch.xp);
      if(reach>before){ ch.level=reach; this.levelMsg=`Level ${reach} reached! New choices are listed below.`; } else this.levelMsg='';
      this.changed(); };
    amount.onkeydown=e=>{ if(e.key==='Enter') add(); };
    const bar=next ? Math.min(100,Math.round((xp-t[lvl])/(next-t[lvl])*100)) : 100;
    const xpCard=el('div',{class:'bcard'}, el('h3',{text:'Experience'}),
      el('div',{class:'xprow'}, el('div',{},el('div',{class:'muted small',text:'Level'}),el('b',{class:'big',text:lvl})),
        el('div',{},el('div',{class:'muted small',text:'Experience'}),el('b',{class:'big',text:xp.toLocaleString()})),
        el('div',{},el('div',{class:'muted small',text:'Next level at'}),el('b',{class:'big',text:next?next.toLocaleString():'—'}))),
      el('div',{class:'xpbar'},el('span',{style:`width:${bar}%`})),
      el('div',{class:'brow wrap',style:'margin-top:10px'}, amount, el('button',{class:'btn primary',type:'button',text:'Add experience',onclick:add}),
        el('span',{class:'muted small',text:'The level goes up automatically when you have enough.'})),
      this.levelMsg ? el('p',{class:'lvlmsg',text:this.levelMsg}) : null,
      el('div',{class:'setdirect'}, el('h4',{class:'lvlhead',text:'Set level or experience directly'}),
        el('div',{class:'brow wrap'}, el('label',{class:'muted small',text:'Level'}), this.levelSelect(),
          el('label',{class:'muted small',text:'Experience'}), (()=>{ const i=el('input',{type:'number',min:0,value:xp,class:'xpin'}); i.onchange=()=>{ ch.xp=Math.max(0,+i.value||0); ch.level=levelForXp(ch.xp); this.changed(); }; return i; })())));
    // choices still open, newest level first
    const stepRank=s=>STEPS.findIndex(([k])=>k===this.stepOf(s));
    const order=t=>{ const i=TYPE_ORDER.indexOf(t); return i<0?99:i; };
    const open=this.st.slots.filter(s=>(!s.optional || /^(Paragon Path|Epic Destiny)$/.test(s.type)) && this.picksOf(s).length<s.number);
    const cur=this.st.slots.filter(s=>(s.level||1)===lvl && lvl>1);
    const list=[...new Set([...open,...cur])].sort((a,b)=>(a.level||1)-(b.level||1) || stepRank(a)-stepRank(b) || order(a.type)-order(b.type));
    const choices=el('div',{class:'bcard'}, el('h3',{text: lvl>1 ? `Level-up choices` : 'Choices'}));
    if(!list.length) choices.append(el('p',{class:'muted',text:'Nothing left to choose.'}));
    let last=null;
    for(const sl of list){ if(sl.level!==last){ choices.append(el('h4',{class:'lvlhead',text:'Level '+(sl.level||1)})); last=sl.level; }
      choices.append(el('div',{class:'muted small',text:STEPS.find(([k])=>k===this.stepOf(sl))?.[1]||''}), this.slotRow(sl)); }
    return [xpCard, choices];
  },

  /* comparison with the original builder, for imported characters */
  importReport(){
    const info=this.ch.importInfo; if(!info) return null;
    const st=this.st, rows=[]; let diff=0;
    for(const [k,old] of Object.entries(info.compare||{})){
      const ours=st.stat(k), same=ours===old; if(!same) diff++;
      rows.push(el('tr',{class:same?'':'bad'}, el('td',{text:k.replace(' Defense','')}), el('td',{text:old}), el('td',{text:ours}), el('td',{text:same?'✓':'✗ '+(ours>old?'+':'')+(ours-old)})));
    }
    const card=el('div',{class:'bcard'},
      el('div',{class:'stephead'}, el('h3',{text:'Imported from the original Character Builder'}),
        el('button',{class:'btn small',type:'button',text:'Hide report',onclick:()=>{ delete this.ch.importInfo; this.changed(); }})),
      el('p',{class:'muted small',text:`${info.file||'File'} · saved at level ${info.savedLevel}${info.legality==='houserule'?' · uses house rules':''}. Numbers compared at level ${info.savedLevel}, with the equipped items.`}),
      el('p',{class:diff?'warn':'',text: diff ? `${diff} number${diff>1?'s':''} differ.` : 'All numbers match the original builder.'}),
      el('div',{class:'tblwrap'}, el('table',{class:'sktable cmp'},
        el('thead',{},el('tr',{},...['','Original','Open Compendium',''].map(t=>el('th',{text:t})))), el('tbody',{},...rows))));
    if(info.missing?.length) card.append(el('p',{class:'warn small',text:'Not found in your builder data (left out): '+info.missing.join(', ')}));
    if(info.later?.length){
      const d=el('details',{}, el('summary',{text:`Choices made after level 1 (${info.later.reduce((a,l)=>a+l.items.length,0)}) — kept for when higher levels are supported`}));
      for(const l of info.later) d.append(el('p',{class:'small'}, el('b',{text:'Level '+l.level+': '}), l.items.join(', ')));
      card.append(d);
    }
    return card;
  },

  /* ---------- Class / Race / Background / Powers / Feats ---------- */
  choiceStep(step){
    const titles={class:'Class choices',race:'Race choices',background:'Background choices (optional)',powers:'Power choices',feats:'Feat choices'};
    const all=this.slotsFor(step);
    const placed=s=>s.extra && this.picksOf(s).length && !s.inactive;
    const slots=all.filter(s=>!s.extra || placed(s)), extras=all.filter(s=>s.extra && !placed(s));
    const card=el('div',{class:'bcard'}, this.stepHeader(step,titles[step]||step));
    if(step==='feats'){
      const box=el('div',{class:'extrabox'}, el('div',{class:'stephead'}, el('h4',{class:'lvlhead',style:'flex:1;margin:0',text:'Extra feats (house rule)'}),
        el('button',{class:'btn small',type:'button',title:'Add another feat beyond the normal rules. It is marked as homebrew and placed at the level the feat requires.',text:'+ Add extra feat',
          onclick:()=>{ const uid=Date.now().toString(36); (this.ch.extra.Feat ||= []).push(uid); this.changed(); }})));
      if(!extras.length) box.append(el('p',{class:'muted small',text:'Pick any feat your character qualifies for now. Once chosen, it moves into the list below at the level the feat requires.'}));
      for(const s of extras) box.append(this.slotRow(s));
      card.append(box);
    }
    if(step==='background') card.append(el('p',{class:'muted small',text:'You can have up to six backgrounds, but you take the benefit of only one of them.'}));
    if(!slots.length) card.append(el('p',{class:'muted',text: step==='class'||step==='race' ? 'Nothing to choose yet.' : 'Choose a race and class first.'}));
    let lastLvl=null;
    for(const s of slots){
      if(this.st.level>1 && s.level!==lastLvl){ card.append(el('h4',{class:'lvlhead',text:'Level '+(s.level||1)})); lastLvl=s.level; }
      card.append(this.slotRow(s));
    }
    if(step==='powers'||step==='feats'){
      const type=step==='powers'?'Power':'Feat';
      const auto=[...this.st.granted.values()].filter(e=>e.type===type && !/#|^extra:/.test(this.st.via.get(e.id)||''));
      if(auto.length){
        const box=el('div',{class:'autolist'}, el('h4',{class:'lvlhead',text:'Gained automatically (no choice needed)'}));
        for(const e of auto.sort((a,b)=>(this.st.lvl.get(a.id)||1)-(this.st.lvl.get(b.id)||1)||a.name.localeCompare(b.name))){
          const src=RULES.db.els[this.st.via.get(e.id)];
          box.append(el('div',{class:'autorow'}, el('span',{},usageDot(e),el('span',{class:'term',dataset:{rid:e.id},text:e.name}), e.spec['Power Usage']?el('span',{class:'muted small',text:' · '+e.spec['Power Usage'].trim()}):null),
            el('span',{class:'muted small',text:(src && !/^(Level|Level1Rules)$/.test(src.type) ? 'from '+src.name : this.st.via.get(e.id)==='start' ? 'from Optional details (Start)' : 'everyone has this')+((this.st.lvl.get(e.id)||1)>1?' · level '+this.st.lvl.get(e.id):'')})));
        }
        card.append(box);
      }
    }

    return [card];
  },

  slotRow(slot){
    const ch=this.ch, picks=this.picksOf(slot), db=RULES.db;
    const owner=db.els[slot.owner];
    const need=!slot.optional && picks.length<slot.number;
    const head=el('div',{class:'slothead'},
      el('span',{class:'slottitle',text:slotTitle(slot)}),
      slot.extra ? el('span',{class:'hb small',text:'house rule'}) : null,
      owner && !['Level','Level1Rules','Internal'].includes(owner.type) && !slotTitle(slot).startsWith(owner.name) ? el('span',{class:'muted small',text:'from '+owner.name}) : null,
      need ? el('span',{class:'need',text: slot.number>1 ? `${slot.number-picks.length} to choose` : 'choose'}) : null,
      slot.extra && picks[0] ? el('span',{class:'muted small',text:'level '+slot.level}) : null,
      slot.extra ? el('button',{class:'x',type:'button',title:'Remove this extra slot','aria-label':'Remove extra slot',text:'×',onclick:()=>{
        ch.extra[slot.type]=(ch.extra[slot.type]||[]).filter(u=>u!==slot.uid); delete ch.picks[slot.key]; this.changed(); }}) : null);
    const row=el('div',{class:'slot'+(need?' needs':'')+(slot.sub?' subslot':'')}, head);
    if(slot.noImplements && !picks.length) row.append(el('p',{class:'muted small',text:'Not needed: this character has no implement proficiency, so an implement choice would never apply. It only counts if the character later gains one (a multiclass feat, say).'}));

    if(slot.extra && slot.inactive){
      const e=RULES.db.els[picks[0]];
      row.append(el('p',{class:'warn small',text:`Empty at this level: ${e?e.name:'the feat'} needs level ${slot.level}. It comes back if the character reaches that level.`}));
      return row;
    }
    // a companion that comes with no other possibility (a sentinel's season decides it) is shown, not offered as a choice
    if(slot.type==='Companion' && !slot.extra && picks.length===1){
      const ok=this.options(slot).filter(o=>o.ok);
      if(ok.length===1 && ok[0].el.id===picks[0]){
        const e=db.els[picks[0]];
        row.append(el('div',{class:'chosen'}, el('span',{class:'pick'}, el('span',{class:'term',dataset:{rid:e.id},text:e.name})),
          el('span',{class:'muted small',text:'comes with '+(owner?owner.name.replace(/:.*$/,''):'your choices')+' (no other option)'})));
        return row;
      }
    }
    if(isInline(slot.type)){
      const opts=this.options(slot);
      if(slot.type==='Alignment') return this.alignmentRow(slot,row,opts,picks);
      if(slot.number===1){
        const sel=el('select',{'aria-label':slotTitle(slot)});
        const ph=new Option(slot.optional?'— none —':'— choose —',''); if(!slot.optional){ ph.disabled=true; ph.selected=!picks.length; }
        sel.add(ph);
        const opt=o=>new Option(o.el.name+(o.ok?'':' (homebrew)'),o.el.id,false,picks.includes(o.el.id));
        if(slot.type==='Language'){                                  // grouped by book, alphabetical inside
          const g=new Map(); for(const o of opts){ const k=sourceGroup(o.el); if(!g.has(k)) g.set(k,[]); g.get(k).push(o); }
          for(const k of [...g.keys()].sort(sourceGroupSort)){ const og=el('optgroup',{label:k}); g.get(k).forEach(o=>og.append(opt(o))); sel.append(og); }
        } else for(const o of opts) sel.add(opt(o));
        sel.onchange=()=>{ if(sel.value) this.setPick(slot,sel.value,true); else picks.slice().forEach(id=>this.setPick(slot,id,false)); };
        row.append(el('div',{class:'brow'},sel, picks[0] && slot.type!=='Race Ability Bonus'?el('span',{class:'term small',dataset:{rid:picks[0]},text:'details'}):null));
        if(!opts.length) row.append(el('p',{class:'muted small',text: slot.type==='Background Choice' ? 'Choose a background first.' : 'No options.'}));
      }else{
        const chips=el('div',{class:'chips'});
        for(const o of opts){
          const on=picks.includes(o.el.id);
          const cb=el('input',{type:'checkbox',checked:on,disabled:!on && picks.length>=slot.number});
          cb.onchange=()=>this.setPick(slot,o.el.id,cb.checked);
          chips.append(el('label',{class:'chip'+(on?' on':'')+(o.ok?'':' hbopt'),title:o.ok?'':'Homebrew: '+o.why},cb,o.el.name));
        }
        row.append(chips);
      }
    }else{
      const chosen=el('div',{class:'chosen'});
      for(const id of picks){
        const e=db.els[id]; if(!e) continue;
        const why=this.hbWhy(slot,id);
        chosen.append(el('span',{class:'pick'}, usageDot(e),
          el('span',{class:'term',dataset:{rid:id},text:e.name}),
          why?el('span',{class:'hb small',title:'Homebrew: '+why,text:'HB'}):null,
          el('span',{class:'muted small',text:shortSource(e)}),
          el('button',{class:'x',type:'button',title:'Remove','aria-label':'Remove '+e.name,text:'×',onclick:()=>this.setPick(slot,id,false)})));
      }
      chosen.append(el('button',{class:'btn small',type:'button',text: picks.length ? 'Change…' : 'Choose…',onclick:()=>this.openPicker(slot)}));
      row.append(chosen);
      if(slot.swap){
        const cls=classIds(this.st);
        const mine=[...this.st.granted.values(), ...[...this.st.replaced].map(id=>RULES.db.els[id])].filter(e=>e && e.type==='Power'
          && new RegExp(/daily/i.test(slot.cat)?'daily':/utility/i.test(slot.cat)?'utility':'encounter','i').test(e.spec['Power Usage']||'')
          && cls.includes((e.spec['Class']||'').trim()) && !picks.includes(e.id)
          && (this.st.lvl.get(e.id)||1)<slot.level);
        const sel=el('select',{'aria-label':'Power to replace'});
        sel.add(new Option('— choose the power it replaces —',''));
        for(const e of [...new Map(mine.map(e=>[e.id,e])).values()]) sel.add(new Option(e.name+' (level '+(e.spec['Level']||'?')+')',e.id,false,ch.swaps?.[slot.key]===e.id));
        sel.onchange=()=>{ (ch.swaps ||= {})[slot.key]=sel.value||undefined; this.changed(); };
        row.append(el('div',{class:'brow',style:'margin-top:6px'}, el('span',{class:'muted small',text:'Replaces:'}), sel));
      }
    }
    return row;
  },

  // Nine-point alignment. 4e has five; the other four count as the nearest 4e alignment and are marked as house rules.
  alignmentRow(slot,row,opts,picks){
    const byName=Object.fromEntries(opts.map(o=>[o.el.name,o.el.id]));
    const sel=el('select',{'aria-label':'Alignment'});
    sel.add(new Option('— none —',''));
    const cur=this.ch.align9 || (picks[0] ? Object.keys(ALIGN9).find(k=>ALIGN9[k].base===RULES.db.els[picks[0]]?.name && ALIGN9[k].core) : '');
    for(const [label,a] of Object.entries(ALIGN9)) sel.add(new Option(label,label,false,cur===label));
    sel.onchange=()=>{
      const v=sel.value; this.ch.align9=v||undefined;
      (this.ch.picks[slot.key]||[]).slice().forEach(id=>{ delete this.ch.hb[slot.key+'|'+id]; });
      this.ch.picks[slot.key]= v && byName[ALIGN9[v].base] ? [byName[ALIGN9[v].base]] : [];
      this.changed();
    };
    row.append(el('div',{class:'brow'}, sel, cur && !ALIGN9[cur]?.core ? el('span',{class:'hb small',title:'Not one of the five 4e alignments; rules treat it as '+ALIGN9[cur].base,text:'HB'}) : null));
    return row;
  },

  abilitiesStep(){
    const inc=this.slotsFor('abilities').filter(s=>s.type!=='Race Ability Bonus');
    const card=inc.length ? el('div',{class:'bcard'}, el('h3',{text:'Ability increases'}),
      el('p',{class:'muted small',text:'At levels 11 and 21 every ability also goes up by 1 automatically.'}), ...inc.flatMap(sl=>[el('h4',{class:'lvlhead',text:'Level '+sl.level}), this.slotRow(sl)])) : null;
    return [this.abilityCard(), card];
  },

  /* ---------- Ability scores ---------- */
  abilityProblem(){
    const ch=this.ch;
    if(ch.method==='points'){ const r=pointBuy(ch.abilities); return r.bad || r.cost>22; }
    if(ch.method==='array'){ const v=ABILITIES.map(a=>+ch.abilities[a]).sort((a,b)=>b-a); return v.join()!==curArray(ch).join(); }
    return false;
  },
  abilityCard(){
    const ch=this.ch, st=this.st, card=el('div',{class:'bcard'});
    const method=el('select',{'aria-label':'Ability score method'});
    const cur=ch.method==='array' ? 'array'+(ch.arrayIdx??9) : ch.method;
    const og=el('optgroup',{label:'Sample ability arrays'});
    ARRAYS.forEach((arr,i)=>og.append(new Option(arr.join(', ')+(i===9?' (standard)':''),'array'+i,false,cur==='array'+i)));
    method.append(og, new Option('Point buy (22 points)','points',false,cur==='points'), new Option('Enter scores (rolled or other)','manual',false,cur==='manual'));
    method.onchange=()=>{
      const v=method.value;
      if(v.startsWith('array')){ ch.method='array'; ch.arrayIdx=+v.slice(5); curArray(ch).forEach((n,i)=>ch.abilities[ABILITIES[i]]=n); }
      else{ ch.method=v; if(v==='points') ch.abilities={Strength:10,Constitution:10,Dexterity:10,Intelligence:10,Wisdom:10,Charisma:8}; }
      this.changed(); };
    // what matters for this character: the class's key abilities, and what the race adds
    const granted=[...st.granted.values()];
    const classes=granted.filter(e=>/^(Class|Hybrid Class)$/.test(e.type));
    const keys=new Set(classes.flatMap(c=>String(sp(c,'Key Abilities')).split(/,|\band\b/).map(x=>x.trim()).filter(x=>ABILITIES.includes(x))));
    const race=granted.find(e=>e.type==='Race');
    const info=el('div',{class:'abilinfo'},
      el('div',{}, el('b',{text:'Key abilities: '}), keys.size ? [...keys].join(', ') : el('span',{class:'muted',text:'choose a class first'}),
        classes.length ? el('span',{class:'muted small',text:' ('+classes.map(c=>c.name).join(', ')+')'}) : null),
      el('div',{}, el('b',{text:'Racial modifiers: '}), race ? (sp(race,'Ability Scores')||'none').trim() : el('span',{class:'muted',text:'choose a race first'})));
    const bonus=this.slotsFor('abilities').filter(s=>s.type==='Race Ability Bonus');
    for(const s of bonus) info.append(this.slotRow(s));
    const grid=el('div',{class:'abil'});
    grid.append(el('span',{class:'h',text:''}),el('span',{class:'h',text:'Base'}),el('span',{class:'h',text:'Bonus'}),el('span',{class:'h',text:'Final'}),el('span',{class:'h',text:'Mod'}));
    for(const a of ABILITIES){
      let input;
      if(ch.method==='array'){
        input=el('select',{'aria-label':a});
        [...new Set(curArray(ch))].forEach(v=>input.add(new Option(v,v,false,+ch.abilities[a]===v)));
        input.onchange=()=>{ const v=+input.value, other=ABILITIES.find(b=>b!==a && +ch.abilities[b]===v);
          if(other) ch.abilities[other]=ch.abilities[a]; ch.abilities[a]=v; this.changed(); };
      }else{
        input=el('input',{type:'number','aria-label':a,value:ch.abilities[a],min:ch.method==='points'?8:1,max:ch.method==='points'?18:30});
        input.onchange=()=>{ ch.abilities[a]=+input.value||10; this.changed(); };
      }
      const fin=st.stat(a), mod=Math.floor((fin-10)/2), add=fin-(+ch.abilities[a]||0), key=keys.has(a);
      grid.append(el('span',{class:'an'+(key?' key':''),title:key?'A key ability for your class':''},a,key?el('span',{class:'keydot',text:' ★'}):null), input,
        el('span',{class:'muted',text:add?(add>0?'+':'')+add:'—'}), el('b',{text:fin}), el('span',{text:(mod>=0?'+':'')+mod}));
    }
    card.append(this.stepHeader('abilities','Ability scores'), info, method, grid);
    if(ch.method==='points'){
      const r=pointBuy(ch.abilities);
      card.append(el('p',{class: r.cost>22||r.bad ? 'warn' : 'muted',
        text: r.bad ? 'Point buy: one score may be 8 or 9, the others must be 10–18.' : `Points spent: ${r.cost} of 22`}));
    }
    card.append(el('p',{class:'muted small',text:'★ marks your class\'s key abilities. Bonus is what your race (and level increases) add; Final is the score you play with.'}));
    return card;
  },

  /* ---------- Skills ---------- */
  skillsStep(){
    const st=this.st, s=n=>st.stat(n), half=s('HALF-LEVEL');
    const card=el('div',{class:'bcard'}, this.stepHeader('skills','Skill training choices'));
    for(const sl of this.slotsFor('skills')) card.append(this.slotRow(sl));
    const tbl=el('table',{class:'sktable'});
    tbl.append(el('thead',{},el('tr',{},...['Skill','Ability','Ability mod + ½ level','Trained','Armor penalty','Misc','Score'].map(t=>el('th',{text:t})))));
    const tb=el('tbody');
    for(const k of SKILLS){
      const keyAb=(RULES.db.els[(RULES.db.nameIdx[k.toLowerCase()]||[]).find(i=>RULES.db.els[i].type==='Skill')]||{spec:{}}).spec['Key Ability']||'';
      const abMod=keyAb ? Math.floor((s(keyAb)-10)/2) : 0;
      const tr=s(k+' Trained'), total=s(k), armor=0, misc=total-abMod-half-tr-armor;
      const src=tr ? this.trainedFrom(k) : '';
      tb.append(el('tr',{class:tr?'tr':''},
        el('td',{},el('span',{class:'term',dataset:{rid:(RULES.db.nameIdx[k.toLowerCase()]||[]).find(i=>RULES.db.els[i].type==='Skill')||''},text:k})),
        el('td',{class:'muted',text:keyAb.slice(0,3).toUpperCase()}),
        el('td',{text:fmt(abMod+half)}),
        el('td',{},tr?el('span',{},el('b',{text:'+'+tr}),el('span',{class:'muted small',text:' '+src})):''),
        el('td',{class:'muted',text:armor||'—'}),
        el('td',{text:misc?fmt(misc):'—'}),
        el('td',{},el('b',{text:fmt(total)}))));
    }
    tbl.append(tb);
    card.append(el('div',{class:'tblwrap'},tbl), el('p',{class:'muted small',text:'Armor penalties will apply once equipment is added.'}));
    return [card];
  },
  trainedFrom(skill){
    for(const p of this.st.stat.parts(skill+' Trained')){
      const via=this.st.via.get(p.src); if(!via) continue;
      if(via.includes('#')){ const o=RULES.db.els[via.split('#')[0]]; return o ? (o.type==='Class'?'class choice':o.name) : ''; }
      if(via.startsWith('extra:')) return 'house rule';
      const g=RULES.db.els[via]; return g ? g.name : '';
    }
    return '';
  },

  /* ---------- picker dialog ---------- */
  openPicker(slot){
    this.picker={slot, q:'', focus:null, open:new Set()};
    $('#pkTitle').textContent=slotTitle(slot);
    $('#pkSearch').value='';
    const step=this.stepOf(slot), all=$('#pkAll');
    all.checked=!!this.ch.showAll[step]; all.parentElement.style.display = STEP_HAS_SHOWALL.has(step) && !slot.extra ? '' : 'none';
    all.onchange=()=>{ this.ch.showAll[step]=all.checked; this.changed(); this.renderPicker(); };
    this.renderPicker();
    $('#picker').showModal();
    $('#pkSearch').focus();
  },
  renderPicker(){
    const P=this.picker, {slot,q}=P, picks=this.picksOf(slot);
    const opts=this.options(slot).filter(o=>!q || (o.el.name+' '+(o.el.also||[]).join(' ')+' '+metaLine(o.el)).toLowerCase().includes(q));
    $('#pkCount').textContent=`${picks.length} of ${slot.number} chosen · ${opts.length} option${opts.length===1?'':'s'}`;
    const list=$('#pkList'); list.replaceChildren();
    // group long lists the way the original builder does
    const groupFn=slot.type==='Feat'?featGroup : slot.type==='Background'?(e=>e.spec['Campaign']||'Other') : (slot.type==='Class'||slot.type==='Race'||slot.type==='Paragon Path'||slot.type==='Epic Destiny')?bookGroup
      : slot.type==='Power' ? powerClassGroup : (slot.type==='Deity'||slot.type==='CountsAsRace') ? sourceGroup : null;
    const groups=new Map();
    for(const o of opts){ const g=groupFn?groupFn(o.el):''; if(!groups.has(g)) groups.set(g,[]); groups.get(g).push(o); }
    // powers: alphabetical inside each class group, like the original
    if(groupFn===powerClassGroup) for(const items of groups.values()) items.sort((a,b)=>a.el.name.localeCompare(b.el.name,undefined,{numeric:true}));
    const names=[...groups.keys()].sort(groupFn===bookGroup ? bookGroupSort : groupFn===sourceGroup ? sourceGroupSort : groupFn===powerClassGroup ? powerGroupSort : groupSort);
    // feats: the ones your class, build or background suggests, first (as in the original builder); they stay in their own groups too
    const REC='Recommended for your build';
    if(slot.type==='Feat'){ const sug=this.suggestedFeats(), rec=opts.filter(o=>sug.has(o.el.id)).sort((a,b)=>a.el.name.localeCompare(b.el.name));
      if(rec.length){ groups.set(REC,rec); names.unshift(REC); } }
    // small grouped lists start open; big ones (feats, every class's powers) start closed
    const expandAll=!!q || names.length<=1 || (groupFn!==featGroup && opts.length<=150);
    for(const g of names){
      const items=groups.get(g);
      const has=items.some(o=>picks.includes(o.el.id)||o.el.id===P.focus);
      const isOpen=P.open.has('!'+g) ? false : (expandAll || P.open.has(g) || has || g===REC);
      const box=g ? el('div',{class:'pkg'}) : list; if(g) list.append(box);
      if(g){
        box.append(el('div',{class:'pkgroup'+(isOpen?' open':''),dataset:{g},role:'button',tabindex:0,onclick:()=>{
          if(isOpen){ P.open.delete(g); P.open.add('!'+g); } else { P.open.add(g); P.open.delete('!'+g); } this.renderPicker(); }},
          el('span',{text:(isOpen?'▾ ':'▸ ')+g}), el('span',{class:'muted small',text:items.length})));
      }
      if(!isOpen) continue;
      for(const o of items.slice(0,expandAll&&!g?400:items.length)) box.append(this.pickRow(o,slot,picks));
    }
    if(!opts.length) list.append(el('p',{class:'muted pad',text: this.ch.showAll[this.stepOf(slot)] ? 'Nothing fits this choice.' : 'Nothing you qualify for. Tick “Show everything available” to see all options.'}));
    if(P.kb){ const k=list.querySelector(P.kb.g!=null ? `.pkgroup[data-g="${CSS.escape(P.kb.g)}"]` : `.pkrow[data-id="${CSS.escape(P.kb.id)}"]`); if(k) k.classList.add('kb'); }
    const f=opts.find(o=>o.el.id===P.focus) || opts.find(o=>picks.includes(o.el.id)) || (!groupFn && opts[0]);
    if(f) this.previewPick(f); else $('#pkPreview').replaceChildren(el('p',{class:'muted',text:'Open a group and pick an entry to read it here.'}));
  },
  // feats suggested by what the character has: a build's or class's suggested feats, and "suggest" rules (build suggestions, backgrounds)
  suggestedFeats(){
    const out=new Set(), db=RULES.db;
    for(const e of this.st.granted.values()){
      for(const id of sp(e,'_SUGGESTED_FEATS').split(',').map(x=>x.trim()).filter(Boolean)) out.add(id);
      for(const [t,a] of e.rules||[]) if(t==='suggest' && a.type==='Feat' && a.name) out.add(a.name);
    }
    return new Set([...out].filter(id=>db.els[id]?.type==='Feat'));
  },
  pickRow(o,slot,picks){
    const on=picks.includes(o.el.id);
    const row=el('div',{class:'pkrow'+(on?' on':'')+(this.picker.focus===o.el.id?' focus':''),dataset:{id:o.el.id}});
    if(slot.number>1){
      const cb=el('input',{type:'checkbox',checked:on,disabled:!on && picks.length>=slot.number,'aria-label':'Choose '+o.el.name});
      cb.onclick=e=>{ e.stopPropagation(); this.setPick(slot,o.el.id,cb.checked); this.renderPicker(); };
      row.append(cb);
    }
    row.append(el('div',{class:'pkname'}, usageDot(o.el), el('b',{text:o.el.name}), o.ok?null:el('span',{class:'hb small',title:o.why,text:'HB'}),
      el('div',{class:'muted small',text:metaLine(o.el)})));
    row.onclick=()=>{ this.picker.focus=o.el.id; this.previewPick(o); $('#pkList').querySelectorAll('.focus').forEach(x=>x.classList.remove('focus')); row.classList.add('focus'); };
    row.ondblclick=()=>{ if(slot.number===1){ this.setPick(slot,o.el.id,true); $('#picker').close(); } };
    return row;
  },
  previewPick(o){
    const {slot}=this.picker, picks=this.picksOf(slot), on=picks.includes(o.el.id);
    const box=$('#pkPreview'); box.replaceChildren();
    const bar=el('div',{class:'pkbar'});
    if(slot.number===1) bar.append(el('button',{class:'btn primary',type:'button',text:on?'Chosen ✓':'Choose '+o.el.name,disabled:on,
      onclick:()=>{ this.setPick(slot,o.el.id,true); $('#picker').close(); }}));
    if(!o.ok) bar.append(el('span',{class:'hb',text:'Homebrew: '+o.why}));
    const body=el('div',{class:'entry'});
    box.append(bar, this.statStrip(), body);
    this.renderElement(body,o.el.id);
    if(o.el.type==='Power') box.append(this.powerNumbers(o.el));
    box.scrollTop=0;
  },
  // the character's scores and defenses, at the top of the choice window (the sheet beside it is covered)
  statStrip(){
    const st=this.st, sv=n=>this.sv ? this.sv(n) : st.stat(n), m=a=>Math.floor((st.stat(a)-10)/2);
    return el('div',{class:'pkstats'},
      ...ABILITIES.map(a=>el('span',{class:'pkstat'}, el('small',{text:a.slice(0,3).toUpperCase()}), el('b',{text:st.stat(a)}), el('em',{text:fmt(m(a))}))),
      el('span',{class:'pksep'}),
      ...[['AC','AC'],['Fort','Fortitude Defense'],['Ref','Reflex Defense'],['Will','Will Defense'],['HP','Hit Points']].map(([l,n])=>el('span',{class:'pkstat'}, el('small',{text:l}), el('b',{text:sv(n)}))));
  },
  // a power's worked-out numbers with this character's weapons, and how they're made up (as on the sheet)
  powerNumbers(p,quiet){
    let calc; try{ calc=this.powerCalc(p); }catch(e){ return null; }
    const box=el('div',{class:'pknums'}, el('h4',{text:'Your numbers'}));
    if(!calc.rows?.length){ if(quiet) return null; box.append(el('p',{class:'muted small',text:calc.note || 'No attack roll to work out.'})); return box; }
    // the weapons in hand first, then unarmed; with nothing in hand, the first weapon carried
    const ch=this.ch, held=new Set(['main','off'].map(k=>(ch.items||[]).find(x=>x.uid===ch.equip?.[k])).filter(Boolean).map(it=>{ const {base,magic}=itemParts(it); return magic&&base?itemName({ids:[base.id,magic.id]}):base?.name; }));
    const un=calc.rows.filter(r=>r.weapon==='Unarmed'), armed=calc.rows.filter(r=>r.weapon!=='Unarmed');
    let show=armed.filter(r=>held.has(r.weapon) || /^(Main|Off) hand: /.test(r.weapon));
    if(!show.length) show=armed.slice(0,1);
    show=[...show, ...un]; if(!show.length) show=calc.rows.slice(0,1);
    const more=calc.rows.length-show.length;
    for(const r of show){
      box.append(el('div',{class:'pknum'},
        el('div',{}, el('b',{text:(r.weapon && r.weapon!=='—' ? r.weapon+': ' : '')+fmt(r.atk)+' vs '+r.def}), r.dmg ? ' · '+r.dmg+' damage' : ''),
        el('div',{class:'howcols'},
          el('div',{}, el('small',{text:'Attack bonus'}), el('ul',{}, ...r.atkParts.map(([v,l])=>el('li',{text:`${fmt(v)} ${l}`})))),
          r.dmg ? el('div',{}, el('small',{text:'Damage'}), el('ul',{}, ...(r.dice?[el('li',{text:r.dice+' '+r.diceNote})]:[]), ...r.dmgParts.map(([v,l])=>el('li',{text:`${fmt(v)} ${l}`})))) : null)));
    }
    if(more>0) box.append(el('p',{class:'muted small',text:`…and ${more} more weapon${more>1?'s':''} carried: see the Character Sheet.`}));
    if(calc.note) box.append(el('p',{class:'muted small',text:calc.note}));
    return box;
  },

  /* ---------- showing an element: compendium entry if there is one, otherwise the builder's own text ---------- */
  renderElement(box,rid){
    const e=RULES.db?.els[rid]; if(!e){ box.textContent='(not found)'; return; }
    if(e.added){ renderPatron(box,e); return; }
    if(e.type==='Magic Item'){ box.replaceChildren(); renderItemCard(box,e,0); linkTerms(box,''); return; }
    const ref=compendiumRef(e);
    if(ref){ renderInto(box,ref[0],ref[1]); stripRevisions(box); return; }
    box.replaceChildren();
    const usage=(e.spec['Power Usage']||'').toLowerCase();
    const cls=e.type==='Power' ? (/at-will/.test(usage)?'atwillpower':/encounter/.test(usage)?'encounterpower':/daily/.test(usage)?'dailypower':'player')
      : /^(Gear|Armor|Weapon|Superior Implement|Ritual Scroll)$/.test(e.type) ? 'magicitem' : 'player';
    const h=el('h1',{class:cls},e.name); if(e.spec['Display']) h.append(el('span',{class:'level',text:e.spec['Display']}));
    box.append(h);
    if(e.flavor) box.append(el('p',{class:'flavor'},el('i',{text:e.flavor})));
    const pre=readablePre(e);
    if(pre) box.append(el('p',{},el('b',{text:'Prerequisite: '}),pre));
    for(const [k,v] of Object.entries(e.type==='Power' && this.st?.granted.has(e.id) ? modSpec(e,this.st) : e.spec)){
      if(k[0]==='_' || ['Display','Class','Level','Power Usage','Short Description','type','Type','Container'].includes(k) || /^ID_/.test(v)) continue;
      box.append(...specRow(k,v));
    }
    if(e.text){ for(const para of e.text.split(/\n\s*/)) if(para.trim()) box.append(el('p',{text:para.trim()})); }
    else if(e.spec['Short Description']) box.append(el('p',{text:e.spec['Short Description']}));
    box.append(el('p',{class:'publishedIn',text:e.source && e.source!=='Core' ? 'Published in '+e.source+'.' : 'Core rules.'}));
    linkTerms(box,'');
  },

  /* ---------- character sheet ---------- */
  renderSheet(box){
    if(this.none){ box.replaceChildren(el('p',{class:'muted pad',text:'No character open.'})); return; }
    const st=this.st, ch=this.ch, s=n=>st.stat(n);
    const race=[...st.granted.values()].find(e=>e.type==='Race'), cls=[...st.granted.values()].find(e=>e.type==='Class');
    const theme=[...st.granted.values()].find(e=>e.type==='Theme');
    const hp=s('Hit Points');
    const num=(label,v)=>el('div',{class:'stat'},el('span',{class:'muted small',text:label}),el('b',{text:v}));
    const sec=(t,...k)=>el('div',{class:'ssec'},el('h4',{text:t}),...k);
    // Powers and the lists below it can be folded away; remembered between visits
    let folded={}; try{ folded=JSON.parse(localStorage.getItem('open-compendium-sheetfold')||'{}'); }catch(e){}
    const fold=(t,...k)=>{ const d=el('details',{class:'ssec fold',open:!folded[t]}, el('summary',{},el('h4',{text:t})), ...k);
      d.ontoggle=()=>{ folded[t]=!d.open; try{ localStorage.setItem('open-compendium-sheetfold',JSON.stringify(folded)); }catch(e){} }; return d; };
    const term=e=>el('span',{class:'term',dataset:{rid:e.id},text:e.name});
    const listOf=(type)=>{ const items=[...st.granted.values()].filter(e=>e.type===type);
      return items.length ? el('div',{class:'tags'},...items.map(term)) : el('span',{class:'muted small',text:'—'}); };
    const skills=el('div',{class:'skills'});
    for(const k of SKILLS){ const tr=s(k+' Trained')>0, v=s(k); skills.append(el('span',{class:tr?'tr':'',text:k}), el('b',{text:fmt(v)})); }
    const powers=[...st.granted.values()].filter(e=>e.type==='Power');
    const uo=e=>{ const u=(e.spec['Power Usage']||'').toLowerCase(); return /at-will/.test(u)?0:/encounter/.test(u)?1:/daily/.test(u)?2:3; };
    powers.sort((a,b)=>uo(a)-uo(b)||a.name.localeCompare(b.name));
    box.replaceChildren(
      el('div',{class:'sheetgrip',title:'Drag to move the character sheet to the other side of the screen (or double-click)'}, '⋮⋮'),
      // the heading: name, a small ornament, the portrait in a frame, then race / class / theme, like the original's (centred)
      el('div',{class:'shead',style:ch.portrait && !ch.portraitBlank && frameColour(ch) ? '--pcol:'+frameColour(ch) : null},
        el('h2',{text:ch.name||'Unnamed'}),
        el('div',{class:'sflourish','aria-hidden':'true'}, el('span',{text:'◆'})),
        ch.portrait && !ch.portraitBlank ? el('div',{class:'sframe'}, portraitImg(ch,'sheetportrait',img=>img.parentElement?.remove())) : null,
        el('div',{class:'stags'}, ...[race?.name, cls?.name, theme?.name].filter(Boolean).map(t=>el('span',{class:'stag',text:t})),
          this.isHomebrew()?el('span',{class:'hb',text:'Homebrew'}):null, ch.killed?el('span',{class:'killedtag',text:'Killed'}):null),
        el('div',{class:'muted small',text:['Level '+st.level, (ch.xp||0).toLocaleString()+' XP', ch.align9||[...st.granted.values()].find(e=>e.type==='Alignment')?.name].filter(Boolean).join(' · ')})),
      el('div',{class:'stats'},
        num('Hit points',hp), num('Bloodied',Math.floor(hp/2)), num('Surge value',Math.floor(hp/4)), num('Surges / day',s('Healing Surges')),
        num('AC',s('AC')), num('Fortitude',s('Fortitude Defense')), num('Reflex',s('Reflex Defense')), num('Will',s('Will Defense')),
        num('Initiative',fmt(s('Initiative'))), num('Speed',s('Speed')), num('Action points',s('_BaseActionPoints'))),
      (()=>{ const eq=Object.entries(ch.equip||{}).map(([sl,u])=>(ch.items||[]).find(x=>x.uid===u)).filter(Boolean);
        return el('p',{class:'muted small'}, eq.length ? ['Wearing: ', ...[...new Set(eq)].flatMap((it,i)=>[i?', ':'', el('span',{class:'term',dataset:{rid:itemParts(it).magic?.id||it.ids[0]},text:itemName(it)})])] : 'No equipment worn.',
          ' · Money: '+fmtMoney(ch.money||0)); })(),
      sec('Ability scores',el('div',{class:'skills'},...ABILITIES.flatMap(a=>[el('span',{text:a}),el('b',{text:s(a)+' ('+fmt(Math.floor((s(a)-10)/2))+')'})]))),
      sec('Skills',skills),
      fold('Powers',el('div',{class:'plist'},...powers.map(p=>el('div',{class:'prow u'+uo(p)},el('span',{},usageDot(p),term(p)),el('span',{class:'muted small',text:p.spec['Power Usage']||''}))))),
      fold('Feats',listOf('Feat')),
      fold('Class features',listOf('Class Feature')),
      fold('Racial traits',listOf('Racial Trait')),
      fold('Background',listOf('Background')),
      fold('Languages',listOf('Language')),
      fold('Proficiencies',listOf('Proficiency')));
    // the frame takes the portrait's colour (worked out once, then kept with the character)
    if(ch.portrait && !ch.portraitColor) Portraits.updateColour(ch).then(c=>{ if(c){ box.querySelector('.shead')?.style.setProperty('--pcol',frameColour(ch)); this.softChange(); } });
  },

  /* ---------- files ---------- */
  // several files at once: each is imported and saved before the next
  async importFiles(files){
    const ok=[...files].filter(f=>/\.(dnd4e|json|xml|txt)$/i.test(f.name));
    for(const f of ok){ await this.importFile(f); clearTimeout(this.saveTimer); await this.persist(); }
    return ok.length;
  },
  async importFile(file){
    const text=await file.text();
    if(/^\s*(\ufeff)?\s*</.test(text)){                       // a save file from the original Character Builder
      try{ const c=importDnd4e(text); c.importInfo.file=file.name; c.folder=this.newFolder(); this.openChar(c); this.changed(); }
      catch(e){ tell('Could not import that file: '+e.message); }
      return;
    }
    try{
      const o=JSON.parse(text), c=o.character||o;
      if(!c || !c.picks || !c.abilities) throw new Error('not a character file');
      c.id='c'+Date.now().toString(36);
      c.folder=this.newFolder(); delete c.killed; delete c.folderBeforeKilled;
      this.openChar(c); this.changed();
    }catch(e){ tell('That file is not an Open Compendium character.'); }
  },
  async remove(c){
    // nothing chosen yet (a character made by accident): removed completely, no copy kept in Deleted
    // (choices the program fills in by itself, like a language, don't count: no class and no race means nothing was done)
    const blank=!Object.values(c.picks||{}).flat().some(id=>/^(Class|Race|Hybrid Class)$/.test(RULES.db?.els[id]?.type||''));
    if(!await ask(blank ? `Delete “${c.name}”? Nothing has been chosen for it yet, so it is removed completely.` : `Delete “${c.name}”? Its file is moved to Characters\\Deleted.`)) return;
    if(blank) await OC.purgeChar(c.id);
    delete this.chars[c.id]; await saveChars(this.chars);
    if(c.id===this.ch.id){ this.ch=this.fixup(newChar()); this.none=true; }
    clearTimeout(this.saveTimer); this.dirty=false;
    this.render();      // (not saved: a fresh empty character is only kept once something is done with it)
  }
};

/* ---------- helpers ---------- */
const fmt=n=>(n>=0?'+':'')+n;
function pointBuy(ab){
  const vals=ABILITIES.map(a=>+ab[a]).sort((x,y)=>x-y);
  let cost=0, bad=false; const low=vals[0];
  if(low<8) bad=true; cost+= low<10 ? low-8 : 2+(POINT_COST[low]??99);
  for(const v of vals.slice(1)){ if(v<10||v>18) bad=true; cost+=POINT_COST[v]??99; }
  return {cost,bad};
}
function slotTitle(slot){
  const o=RULES.db.els[slot.owner];
  const fromOwner=o && !['Level','Level1Rules','Race','Class','Grants','Internal'].includes(o.type);
  if(slot.extra) return 'Extra '+slot.type.toLowerCase();
  if(slot.type==='Power' && slot.swap) return `New ${/daily/i.test(slot.cat)?'daily':/utility/i.test(slot.cat)?'utility':'encounter'} power (replaces one you have)`;
  if(/^Ability Increase/.test(slot.type)) return `Ability increases (choose ${slot.number})`;
  if(slot.type==='Power'){
    if(slot.label && !/^Power /i.test(slot.label)) return slot.label+(slot.number>1?` (choose ${slot.number})`:'');   // e.g. "Dilettante"
    if(slot.cat && !/\$\$|ID_|\||,/.test(slot.cat) && /[a-z]/i.test(slot.cat)) return slot.cat.replace(/\b\w/g,c=>c.toUpperCase())+(slot.optional?' (optional)':'');
    const c=slot.cat.toLowerCase();
    const u=/at-will/.test(c)?'At-will':/encounter/.test(c)?'Encounter':/daily/.test(c)?'Daily':/utility/.test(c)?'Utility':'';
    if(!u && fromOwner) return o.name+(slot.number>1?` (choose ${slot.number})`:'');
    return (u?u+' power':'Power')+(slot.number>1?`s (choose ${slot.number})`:'');
  }
  if(slot.type==='Trait Package' && fromOwner) return o.name.replace(/\s+Choice\b/,' choice');   // "Season choice", "Virtue choice"
  if(slot.type==='CountsAsRace') return 'Choose your race in life';
  if(slot.type==='Background') return slot.number>1 ? `Additional backgrounds (up to ${slot.number})` : 'Background';
  const names={'Race Ability Bonus':'Racial ability bonus','Skill Training':'Trained skills','Class Feature':'Class feature','Racial Trait':'Racial option','Build':'Build','Background Choice':'Background benefit','Theme':'Theme','Deity':'Deity'};
  let t=names[slot.type]||slot.type;
  if(['Racial Trait','Class Feature'].includes(slot.type) && slot.cat && !/ID_|\||\$\$|^\d+$/.test(slot.cat)) t=slot.cat.split(',').map(x=>x.trim()).join(': ');
  else if(['Racial Trait','Class Feature'].includes(slot.type) && fromOwner) t=o.name+(slot.sub?' choice':'');   // under its feat: "Extra Manifestation choice", not the feat's name again
  if(slot.number>1) t+=` (choose ${slot.number})`;
  if(slot.optional) t+=' (optional)';
  return t;
}
function shortSource(e){ const s=e.source||''; return s==='Core'?'':s; }
function metaLine(e){
  const s=e.spec, bits=[];
  if(e.type==='Power') bits.push(s['Display']||'', s['Power Usage']||'', s['Action Type']||'');
  else if(e.type==='Feat') bits.push(s['Short Description']||'');
  else if(e.type==='Background') bits.push(s['Associated Skills']?'Skills: '+s['Associated Skills']:'');
  const rp=readablePre(e); if(rp) bits.push('Prereq: '+rp.slice(0,80));
  bits.push(e.source||'');
  return bits.filter(Boolean).join(' · ');
}

// Feat groups, similar to the original builder's lists
let _raceWords=null, _classWords=null;
function featGroup(e){
  const db=RULES.db;
  const sup=(e.spec['_SupportsID']||'').trim();
  if(sup && db.els[sup]) return db.els[sup].name;                       // e.g. Weapon Focus (Axe) -> Weapon Focus
  const t=(e.spec['type']||e.spec['Type']||'').trim();
  if(t){
    if(/^multiclass/i.test(t)) return 'Multiclass Feats';
    if(/bloodline/i.test(t)) return 'Bloodline Feats';
    return /feats?$/i.test(t) ? t : t+' Feats';
  }
  if(!_raceWords){
    _raceWords=new Set(); (db.byType['Race']||[]).forEach(id=>{ const n=db.els[id].name.toLowerCase(); _raceWords.add(n); n.split(/\s+/).forEach(w=>w.length>3&&_raceWords.add(w)); });
    _classWords=new Set(); (db.byType['Class']||[]).forEach(id=>{ if(!HIDDEN_CLASS.test(id)) _classWords.add(db.els[id].name.toLowerCase()); });
  }
  const clauses=(e.pre||'').split(/[,;]|\s+or\s+/i).map(c=>c.trim().toLowerCase().replace(/\s+(race|class)$/,'')).filter(Boolean);   // "Fighter or rogue" counts too
  if(clauses.some(c=>_classWords.has(c) || /class feature$/.test(c))) return 'Class Feats';
  const raceClauses=(e.pre||'').split(/[,;]|\s+or\s+/i).map(c=>c.trim().toLowerCase().replace(/\s+race$/,''));   // "Dwarf or must worship Moradin" is racial
  if(raceClauses.some(c=>_raceWords.has(c))) return 'Racial Feats';
  if(clauses.some(c=>/^any .+ class$|power source/.test(c))) return 'Class Feats';
  return (e.spec['Tier']||'Heroic')+' Tier Feats';
}
// Classes and races: Player's Handbook 1-3, then Essentials, then everything else
function bookGroup(e){
  const src=(e.source||'').split(',').map(x=>x.trim()).filter(x=>x && x!=='Core')[0]||'';
  if(/^Player's Handbook( [23])?$/.test(src)) return src;
  if(/Player Essentials|Heroes of the Fallen Lands|Heroes of the Forgotten Kingdoms|Heroes of Shadow|Red Box/.test(src)) return 'Essentials';
  return 'Other books';
}
// the lowest level a feat can be taken at (from its tier and any "Nth level" prerequisite)
function minLevelFor(e){
  if(!e) return 1;
  let n={Paragon:11,Epic:21}[(e.spec['Tier']||'').trim()]||1;
  const m=/(\d+)(?:st|nd|rd|th)\s+level/i.exec(e.pre||''); if(m) n=Math.max(n,+m[1]);
  if(/paragon tier/i.test(e.pre||'')) n=Math.max(n,11); if(/epic tier/i.test(e.pre||'')) n=Math.max(n,21);
  return n;
}
// Group by the actual book: Player's Handbooks first, then Essentials, then the rest alphabetically
function sourceGroup(e){ if(e.group) return e.group; return (e.source||'').split(',').map(x=>x.trim()).filter(x=>x && x!=='Core')[0]||'Core rules'; }
function sourceGroupSort(a,b){
  // a group like "Dark Sun: …" right after its book ("Dark Sun Campaign Setting")
  const ga=/^([^:]+):/.exec(a)?.[1], gb=/^([^:]+):/.exec(b)?.[1];
  if(ga && b.startsWith(ga) && !gb) return 1; if(gb && a.startsWith(gb) && !ga) return -1;
  const rank=x=>/^Player's Handbook( [23])?$/.test(x) ? 0 : /Player Essentials|Heroes of the Fallen Lands|Heroes of the Forgotten Kingdoms|Heroes of Shadow/.test(x) ? 1 : /^(Dragon|Dungeon) Magazine/.test(x) ? 3 : 2;
  return rank(a)-rank(b) || a.localeCompare(b,undefined,{numeric:true});
}
/* A magic item the way the original builder's shop shows it: this exact item (one level), its set and set bonuses,
   and the power cards and related items it lists. */
function renderItemCard(box,e,depth){
  const db=RULES.db, lv=sp(e,'Level');
  const h=el('h1',{class:'magicitem'},e.name); if(lv) h.append(el('span',{class:'level',text:'Level '+lv}));
  box.append(h);
  if(e.flavor) box.append(el('p',{class:'flavor'},el('i',{text:e.flavor})));
  const cost=itemCost(e);
  box.append(el('p',{class:'itemline'}, el('span',{text:lv?'Lvl '+lv:''}), el('b',{text:cost?fmtMoney(cost):''})));
  const set=db.els[sp(e,'_Item_Set_ID')];
  if(set) box.append(el('p',{},el('b',{text:'Item Set: '}),set.name));
  const SKIP=/^(_|Level$|Gold$|Silver$|Copper$|Full Text$|Tier$|Magic Item Type$|Item Slot$|count$)/;
  for(const [k,v] of Object.entries(e.spec)){ if(SKIP.test(k) || !v || /^ID_/.test(v)) continue;
    box.append(...specRow(k,v)); }
  if(e.text) for(const para of e.text.split(/\n\s*/)) if(para.trim()) box.append(el('p',{text:para.trim()}));
  // set bonuses and the powers they give
  if(set){
    const ben=sp(set,'Benefits').split(',').map(x=>db.els[x.trim()]).filter(Boolean);
    if(ben.length){
      box.append(el('h3',{text:set.name+' benefits'}));
      const t=el('table',{class:'settable'}, el('tr',{},el('th',{text:'Pieces'}),el('th',{text:'Benefit'})));
      for(const b of ben) t.append(el('tr',{},el('td',{text:sp(b,'Piece Count')}),el('td',{text:b.text||''})));
      box.append(t);
      if(depth<1) for(const b of ben) for(const [tag,a] of b.rules) if(tag==='grant' && db.els[a.name]?.type==='Power'){ const c=el('div',{class:'subcard'}); renderPowerCard(c,db.els[a.name]); box.append(c); }
    }
  }
  // power cards and related items listed with this item (e.g. The Nine Swords of Tyr -> its powers and the 9th sword)
  if(depth<1) for(const id of sp(e,'_DisplayPowers').split(',').map(x=>x.trim()).filter(Boolean)){
    const x=db.els[id]; if(!x) continue;
    const c=el('div',{class:'subcard'});
    if(x.type==='Magic Item') renderItemCard(c,x,depth+1); else renderPowerCard(c,x);
    box.append(c);
  }
  if(!depth) box.append(el('p',{class:'publishedIn',text:e.source && e.source!=='Core' ? 'Published in '+e.source+'.' : 'Core rules.'}));
}
/* one field of a card ("Effect: ..."): line breaks kept, and the data's "<table>Level  Damage ...</table>"
   shown as a real table (rows on separate lines, cells split by tabs) */
function specRow(k,v){
  const out=[]; v=String(v);
  const parts=v.split(/(<table>[\s\S]*?<\/table>)/i);
  let first=true;
  for(const part of parts){
    const t=/^<table>([\s\S]*)<\/table>$/i.exec(part);
    if(t){
      const rows=t[1].replace(/\r/g,'').split(/\n/).map(r=>r.split(/\t+/).map(c=>c.trim())).filter(r=>r.some(Boolean));
      if(rows.length>1){ out.push(el('table',{class:'spectable'}, ...rows.map((r,i)=>el('tr',{}, ...r.map(c=>el(i?'td':'th',{text:c})))))); }
      else out.push(el('p',{class:'prel',text:t[1].trim()}));
      continue;
    }
    const txt=part.replace(/\r/g,'').replace(/\n\s*\n+/g,'\n').replace(/^\s+|\s+$/g,'');
    if(!txt && !first) continue;
    out.push(el('p',{class:'prel'}, first?el('b',{text:k+': '}):null, ...boldLabels(txt)));
    first=false;
  }
  return out;
}
// the parts of a power written into one field ("Trigger: ...", "Effect (Free Action): ...", "Level 11: ...") get their
// label in bold, as on a printed card
const LABELS=/((?:^|(?<=[\n.;)] ?))(?:Primary |Secondary )?(?:Attack|Hit|Miss|Effect|Trigger|Aftereffect|Malfunction|Special|Requirement|Prerequisite|Target|Sustain (?:Minor|Move|Standard)|First Failed Saving Throw|Second Failed Saving Throw|Failed Saving Throw|Level \d+(?: or \d+)?)(?: \([^)]*\))?:)/;
function boldLabels(txt){
  return txt.split(new RegExp(LABELS.source,'g')).map((p,i)=>i%2 ? el('b',{text:p}) : p).filter(p=>p!=='');
}
// a prerequisite as a person would write it: the builder's own bookkeeping ("!Deity of the Arcana domain" = has no
// other deity yet, "~...", "ID_...") is left out
function readablePre(e){
  const t=(e.ppre||e.pre||'').replace(/\s+/g,' ').trim();
  if(!t || /^~/.test(t) || /^ID_/.test(t)) return '';
  return t.split(/\s*,\s*/).filter(c=>c && !/^!/.test(c) && !/^ID_/.test(c)).join(', ');
}
function renderPowerCard(box,e){
  const usage=(e.spec['Power Usage']||'').toLowerCase();
  const cls=/at-will/.test(usage)?'atwillpower':/encounter/.test(usage)?'encounterpower':/daily/.test(usage)?'dailypower':'player';
  const h=el('h1',{class:cls},e.name); if(e.spec['Display']) h.append(el('span',{class:'level',text:e.spec['Display']}));
  box.append(h);
  if(e.flavor) box.append(el('p',{class:'flavor'},el('i',{text:e.flavor})));
  if(e.spec['Power Usage']) box.append(el('p',{class:'powerstat'}, el('b',{text:e.spec['Power Usage'].trim()}), e.spec['Keywords'] ? ' ✦ '+e.spec['Keywords'].trim() : ''));
  for(const [k,v] of Object.entries(e.spec)){ if(k[0]==='_' || /^(Display|Class|Short Description|type|Type|Container|Power Usage|Power Type|Level|Keywords)$/.test(k) || !v || /^ID_/.test(v)) continue;
    box.append(...specRow(k,v)); }
  if(e.text) for(const para of e.text.split(/\n\s*/)) if(para.trim()) box.append(el('p',{text:para.trim()}));
}
// A patron from the additions file (a Dark Sun sorcerer-king, say): who they are, plus anything in the user's own files that belongs to them
function renderPatron(box,e){
  const k=e.added;
  box.replaceChildren(el('h1',{class:'player'},e.name), el('p',{},el('b',{text:k.title+' '}),k.city));
  box.append(el('p',{class:'muted small',text:'From your additions file: the original Character Builder has no such choice. Choosing one is for your character\'s story and has no rules effect.'}));
  const re=new RegExp('\\b('+k.words.map(w=>w.replace(/[-]/g,'\\-')).join('|')+')\\b','i');
  // the compendium's monster entry, if the compendium is loaded
  const m=lib.monster; const ni=m?.cols ? m.cols.indexOf('Name') : -1;
  const mon=ni>=0 ? m.rows.filter(r=>String(r[ni]).startsWith(e.name+',')) : [];
  if(mon.length) box.append(el('p',{},el('b',{text:'In the compendium: '}),...mon.flatMap((r,i)=>[i?', ':'',el('span',{class:'term',dataset:{cat:'monster',id:r[0]},text:String(r[ni])})])));
  const seen=new Set(), rel={};
  for(const o of RULES.raw){
    if(!/^(Feat|Magic Item|Power|Background|Paragon Path|Theme|Class Feature)$/.test(o.type) || !re.test(o.name)) continue;
    const n=o.name.replace(/\s*\((heroic|paragon|epic) tier\)$/i,''); if(seen.has(o.type+n)) continue; seen.add(o.type+n);
    (rel[o.type] ||= []).push(el('span',{class:'term',dataset:{rid:o.id},text:n}));
  }
  for(const [t,items] of Object.entries(rel)) box.append(el('p',{},el('b',{text:t+(items.length>1?'s':'')+': '}),...items.flatMap((x,i)=>[i?', ':'',x])));
  if(!mon.length && !Object.keys(rel).length) box.append(el('p',{class:'muted',text:'Nothing else about '+e.name+' is in your files.'}));
  box.append(el('p',{class:'publishedIn',text:e.source ? 'Described in the '+e.source+'.' : ''}));
}
// options written as house rules (not from a published book), like the Oversized Weapon Grip feat
const isHouseRule=e=>!!(e && (sp(e,'_Homebrew') || /house rules?/i.test(e.source||'')));
// a small coloured mark for a power: green at-will, red encounter, black daily (the original's colours)
function hexToHsl(hex){
  const n=parseInt(hex.slice(1),16), r=(n>>16&255)/255, g=(n>>8&255)/255, b=(n&255)/255, mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2;
  if(mx===mn) return [0,0,l];
  const d=mx-mn, s=l>0.5?d/(2-mx-mn):d/(mx+mn);
  const h=mx===r?((g-b)/d+(g<b?6:0)):mx===g?(b-r)/d+2:(r-g)/d+4;
  return [h*60,s,l];
}
function hslToHex(h,s,l){
  const k=n=>(n+h/30)%12, a=s*Math.min(l,1-l), f=n=>l-a*Math.max(-1,Math.min(k(n)-3,9-k(n),1));
  return '#'+[f(0),f(8),f(4)].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('');
}
function usageDot(e){
  if(!e || e.type!=='Power') return null;
  const u=(e.spec['Power Usage']||'').toLowerCase(), k=/at-will/.test(u)?'atwill':/encounter/.test(u)?'encounter':/daily/.test(u)?'daily':'';
  return k ? el('span',{class:'udot '+k,title:e.spec['Power Usage'].trim()}) : null;
}
// Group powers like the original: "Fighter Level 2 Utility Powers", "Slayer Level 2 Utility Powers", "Skill Level 2 Utility Powers"
function powerWho(e){
  // powers of a sub-class (Slayer, Knight...) are tagged with a class feature like "Level 2 Slayer Utility Power"
  // (only the character's own sub-class gets its own group; the original lists the others under the main class)
  const mine=new Set(classIds(Builder.st).map(id=>RULES.db.els[id]?.name).filter(Boolean));
  for(const c of e.cats){ const f=RULES.db.els[c]; const m=f && f.type==='Class Feature' && /^Level \d+ (.+?) (Utility|Attack|At-Will|Encounter|Daily|Stance)\b.*Power/i.exec(f.name); if(m && mine.has(m[1])) return m[1]; }
  if(e.cats.includes('ID_INTERNAL_CATEGORY_SKILL_POWER')) return 'Skill';
  const c=RULES.db.els[(e.spec['Class']||'').trim()]; if(c) return c.name;
  const first=(e.spec['Display']||'').trim().split(/\s+/)[0]||'';
  if(SKILLS.includes(first) || e.cats.some(x=>/skill power/i.test(x))) return 'Skill';
  return (e.spec['Display']||'').replace(/\s+(Attack|Utility|Feature|Power)?\s*\d*$/i,'').trim() || 'Other';
}
function powerClassGroup(e){
  const lvl=(e.spec['Level']||'').trim(), use=(e.spec['Power Usage']||'').trim();
  const kind=/utility/i.test(e.spec['Power Type']||'') ? 'Utility' : use;
  return powerWho(e)+(lvl?' Level '+lvl:'')+(kind?' '+kind:'')+' Powers';
}
// the character's own class first, then its sub-class, then skill powers, then the rest; lower levels first
function powerGroupSort(a,b){
  const own=new Set(classIds(Builder.st).map(id=>RULES.db.els[id]?.name).filter(Boolean));
  const rank=g=>{ const who=g.replace(/ Level \d+.*$| (At-Will|Encounter|Daily|Utility) Powers$/,''); return [...own][0]===who ? 0 : own.has(who) ? 1 : who==='Skill' ? 3 : 2; };
  const lv=g=>+(/Level (\d+)/.exec(g)||[0,0])[1];
  return rank(a)-rank(b) || lv(a)-lv(b) || a.localeCompare(b);
}
const ALIGN9={
  'Lawful Good':{base:'Lawful Good',core:true}, 'Neutral Good':{base:'Good',core:true}, 'Chaotic Good':{base:'Good'},
  'Lawful Neutral':{base:'Unaligned'}, 'True Neutral':{base:'Unaligned',core:true}, 'Chaotic Neutral':{base:'Unaligned'},
  'Lawful Evil':{base:'Evil'}, 'Neutral Evil':{base:'Evil',core:true}, 'Chaotic Evil':{base:'Chaotic Evil',core:true}};
const BOOK_GROUPS=["Player's Handbook","Player's Handbook 2","Player's Handbook 3",'Essentials','Other books'];
const bookGroupSort=(a,b)=>BOOK_GROUPS.indexOf(a)-BOOK_GROUPS.indexOf(b);
const GROUP_FIRST=['Racial Feats','Class Feats','Heroic Tier Feats','Paragon Tier Feats','Epic Tier Feats'];
function groupSort(a,b){ const ia=GROUP_FIRST.indexOf(a), ib=GROUP_FIRST.indexOf(b);
  if(ia>=0||ib>=0) return (ia<0?99:ia)-(ib<0?99:ib); return a.localeCompare(b); }

// Builder IDs like ID_FMP_POWER_6965 match compendium entries like power6965.
const COMP_TYPES={POWER:'power',FEAT:'feat',CLASS:'class',RACE:'race',PARAGON_PATH:'paragonpath',EPIC_DESTINY:'epicdestiny',THEME:'theme',BACKGROUND:'background',DEITY:'deity',RITUAL:'ritual',ARMOR:'armor',WEAPON:'weapon'};
const _compNames={};
function compByName(cat,name){
  const c=lib[cat]; if(!c || !c.cols) return null;
  if(!_compNames[cat] || _compNames[cat].rows!==c.rows){ const ni=c.cols.indexOf('Name'), m={}; for(const r of c.rows) m[String(r[ni]).toLowerCase()] ||= r[0]; _compNames[cat]={rows:c.rows, m}; }
  return _compNames[cat].m[name.toLowerCase()]||null;
}
function compendiumRef(e){
  if(/^(Magic Item|Gear|Armor|Weapon|Superior Implement)$/.test(e.type)){
    const n=e.name.replace(/\s*\((heroic|paragon|epic) tier\)$/i,'').replace(/\s*\(level \d+\)$/i,'').replace(/\s*\+\d+$/,'');
    const mt=sp(e,'Magic Item Type');
    const order=e.type==='Armor'||mt==='Armor' ? ['armor','item'] : e.type==='Weapon'||mt==='Weapon' ? ['weapon','item'] : IMPLEMENT_TYPES.test(mt)||e.type==='Superior Implement' ? ['implement','item'] : ['item','armor','weapon','implement'];
    for(const cat of order){ const id=compByName(cat,n)||compByName(cat,e.name); if(id && (lib[cat].data[id]||lib[cat].index[id])) return [cat,id]; }
    return null;
  }
  const m=/^ID_FMP_([A-Z_]+?)_(\d+)$/.exec(e.id); if(!m) return null;
  const cat=COMP_TYPES[m[1]]; if(!cat || !lib[cat]) return null;
  const id=cat+m[2];
  return (lib[cat].data[id] || lib[cat].index[id]) ? [cat,id] : null;
}

/* ---------- campaign helpers ---------- */
const CAMPKEY='open-compendium-campaign';
// books renamed in the builder library (0.99.69), so a saved book list keeps finding them
const RENAMED_BOOKS={"Dungeon Survival Handbook":"Into the Unknown: The Dungeon Survival Handbook",
  "Player Essentials: Heroes of the Fallen Lands":"Heroes of the Fallen Lands","Player Essentials: Heroes of the Forgotten Kingdoms":"Heroes of the Forgotten Kingdoms",
  "Player Essentials: Heroes of Shadow":"Heroes of Shadow","Neverwinter Campaign Guide":"Neverwinter Campaign Setting","Player Essentials: Class Compendium":"Class Compendium",
  "Dragon 427":"Dragon Magazine 427","The Plane Below: Secrets of the Elemental Chaos":"The Plane Below","Open Grave: Secrets of the Undead":"Open Grave",
  "Thingamajigs of the Barrier Peaks (Dragon Magazine 410)":"Dragon Magazine 410","Dungeon Magazine 405":"Dungeon Magazine 205",
  "Eberron Campaign Guide":"Eberron Campaign Setting","Dragon Magazine Annual 2009":"Dragon Magazine Annual","EPIC 3-1":"EPIC3-1 The Glorious Hunt",
  "The Book Of Vile Darkness":"The Book of Vile Darkness"};
const newBookNames = books => Array.isArray(books) ? [...new Set(books.map(b=>RENAMED_BOOKS[b]||b))] : null;
function lastCampaign(){ try{ const c=JSON.parse(localStorage.getItem(CAMPKEY)||'null'); if(c && typeof c==='object') return {name:c.name||'Campaign', books:newBookNames(c.books), inherent:!!c.inherent}; }catch(e){} return {name:'All books', books:null}; }
function sourcesOf(e){ return (e.source||'').split(',').map(x=>x.trim()).filter(x=>x && x!=='Core'); }
let _builderBooks=null;
function builderBooks(){
  if(_builderBooks && _builderBooks.db===RULES.db) return _builderBooks.list;
  const set=new Set();
  for(const t of ['Race','Class','Feat','Power','Background','Theme','Deity','Build','Racial Trait','Class Feature','Paragon Path','Epic Destiny','Language','Skill Training','Magic Item','Armor','Weapon','Gear','Superior Implement','Ritual'])
    for(const id of RULES.db.byType[t]||[]) sourcesOf(RULES.db.els[id]).forEach(s=>set.add(s));
  _builderBooks={db:RULES.db, list:[...set]}; return _builderBooks.list;
}
const isMagName=n=>/^(Dragon|Dungeon)( Magazine)? (\d+|Annual)/i.test(n);

$('#campIn').onchange=e=>{ const f=e.target.files[0]; if(f) Builder.importCampaign(f); e.target.value=''; };
$('#campDone').onclick=()=>$('#campDlg').close();
// the header's Books button: the compendium's own list there, this campaign list on the builder tab
function updateBuilderBooksBtn(){ if(S.tab!=='builder' || !RULES.db) return; const all=builderBooks(), c=Builder.ch.campaign; const b=$('#booksBtn'); b.style.display=all.length?'':'none'; b.textContent=`Books ${c.books?c.books.filter(x=>all.includes(x)).length:all.length}/${all.length}`; b.title='The books characters may use (the character\'s campaign)'; }
$('#campSave').onclick=()=>Builder.exportCampaign();
$('#campLoad').onclick=()=>$('#campIn').click();
$('#charIn').onchange=e=>{ const f=e.target.files[0]; if(f) Builder.importFile(f); e.target.value=''; };
// dropping character files on the Start screen
(()=>{ const root=$('#bChoices'); let depth=0;
  const isFiles=e=>[...(e.dataTransfer?.types||[])].includes('Files');
  root.addEventListener('dragenter',e=>{ if(!root.classList.contains('dropchars') || !isFiles(e)) return; depth++; root.classList.add('dropping'); });
  root.addEventListener('dragleave',()=>{ if(--depth<=0){ depth=0; root.classList.remove('dropping'); } });
  root.addEventListener('dragover',e=>{ if(root.classList.contains('dropchars') && isFiles(e)) e.preventDefault(); });
  root.addEventListener('drop',async e=>{ if(!root.classList.contains('dropchars') || !isFiles(e)) return; e.preventDefault(); depth=0; root.classList.remove('dropping');
    const n=await Builder.importFiles(e.dataTransfer.files);
    if(!n) tell('Drop a character file: .dnd4e from the original Character Builder, or .json saved by this app.'); });
})();
$('#pkSearch').oninput=e=>{ Builder.picker.q=e.target.value.toLowerCase().trim(); Builder.renderPicker(); };
$('#pkClose').onclick=()=>$('#picker').close();
// Arrow keys move through the list (group headings included); Enter chooses or opens/closes a group;
// Space ticks a box in multi-choice lists; Left/Right close/open a group.
$('#picker').addEventListener('keydown',e=>{
  const P=Builder.picker; if(!P) return;
  const inSearch=e.target.id==='pkSearch';
  if(!['ArrowDown','ArrowUp','Enter',' ','ArrowLeft','ArrowRight'].includes(e.key)) return;
  if(inSearch && (e.key===' '||e.key==='ArrowLeft'||e.key==='ArrowRight')) return;
  const items=[...$('#pkList').querySelectorAll('.pkgroup,.pkrow')]; if(!items.length) return;
  let i=items.findIndex(x=>x.classList.contains('kb'));
  const mark=el=>{ items.forEach(x=>x.classList.remove('kb')); el.classList.add('kb'); el.scrollIntoView({block:'nearest'});
    P.kb = el.classList.contains('pkgroup') ? {g:el.dataset.g} : {id:el.dataset.id};
    if(el.classList.contains('pkrow')) el.click(); };
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();
    i = i<0 ? (e.key==='ArrowDown'?0:items.length-1) : Math.max(0,Math.min(items.length-1,i+(e.key==='ArrowDown'?1:-1)));
    mark(items[i]); if(inSearch) $('#pkList').focus(); return;
  }
  if(i<0) return;
  const cur=items[i];
  if(cur.classList.contains('pkgroup')){
    const open=cur.classList.contains('open');
    if(e.key==='Enter' || (e.key==='ArrowRight'&&!open) || (e.key==='ArrowLeft'&&open)){ e.preventDefault(); cur.click(); }
    return;
  }
  const cb=cur.querySelector('input[type=checkbox]');
  if(e.key===' ' || (e.key==='Enter' && cb)){ if(cb){ e.preventDefault(); cb.click(); } return; }
  if(e.key==='Enter'){ e.preventDefault(); cur.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})); }
});
$('#picker').addEventListener('close',()=>closePop());

/* ---------- start-up (runs after all scripts are loaded) ---------- */
(async()=>{
  await loadLibrary();
  await Builder.init();
  if(Object.keys(lib).length || RULES.db) start(); else noLibrary();
  colourAllFromFolder();
  // the program noticed a change in its folders
  // (Windows also reports the folder as changed when pictures in it are only looked at: redraw only when the list of
  //  pictures really changed, otherwise the gallery would jump back to the top while you scroll)
  let picSig=null;
  const portraitSig=async()=>{ try{ return JSON.stringify(await (await fetch('/_list/portraits')).json()); }catch(e){ return null; } };
  portraitSig().then(s=>{ picSig=s; });
  OC.onFolderChanged(async which=>{
    if(which==='Libraries') return libraryChangedBar();
    const s=await portraitSig(); if(s===picSig) return; picSig=s;
    colourAllFromFolder();
    if(Builder.section==='manage'){ const r=$('#bChoices'), y=r.scrollTop; Builder.render(); r.scrollTop=y; }
  });
  // save anything not yet saved when the window closes, or before the page reloads
  OC.onFlush(async()=>{ if(Builder.dirty) await Builder.persist(); });
  addEventListener('beforeunload',()=>{ if(Builder.dirty) Builder.persist(); });
})();

/* The character sheet can be dragged to the left or right side; the choice is remembered. */
(function(){
  const KEY='open-compendium-sheetside';
  const apply=side=>{ document.body.dataset.sheet=side; try{ localStorage.setItem(KEY,side); }catch(e){} };
  try{ document.body.dataset.sheet=localStorage.getItem(KEY)||'right'; }catch(e){ document.body.dataset.sheet='right'; }
  let drag=null;
  document.addEventListener('pointerdown',e=>{
    const g=e.target.closest && e.target.closest('.sheetgrip'); if(!g) return;
    e.preventDefault(); drag={x:e.clientX}; document.body.classList.add('sheetdrag'); g.setPointerCapture?.(e.pointerId);
  });
  document.addEventListener('pointermove',e=>{ if(!drag) return;
    document.body.dataset.sheetdrop = e.clientX < innerWidth/2 ? 'left' : 'right'; });
  document.addEventListener('pointerup',e=>{ if(!drag) return;
    const moved=Math.abs(e.clientX-drag.x)>30; drag=null; document.body.classList.remove('sheetdrag');
    if(moved) apply(e.clientX < innerWidth/2 ? 'left' : 'right'); delete document.body.dataset.sheetdrop; });
  document.addEventListener('dblclick',e=>{ if(e.target.closest && e.target.closest('.sheetgrip')) apply(document.body.dataset.sheet==='left'?'right':'left'); });
})();

// the shop's lists: the up and down arrow keys move to the next or previous entry (when not typing in a box)
document.addEventListener('keydown',e=>{
  if(!/^Arrow(Up|Down)$/.test(e.key) || Builder.section!=='shop' || e.target.closest?.('input,textarea,select,dialog')) return;
  const rows=[...document.querySelectorAll('#bChoices .shoplist tr.row')]; if(!rows.length) return;
  e.preventDefault();
  const i=rows.findIndex(r=>r.classList.contains('on'));
  const next=rows[i<0 ? 0 : Math.max(0,Math.min(rows.length-1,i+(e.key==='ArrowDown'?1:-1)))];
  if(next && !next.classList.contains('on')){ next.click(); requestAnimationFrame(()=>document.querySelector('#bChoices .shoplist tr.row.on')?.scrollIntoView({block:'nearest'})); }
});

// Enter goes to the next build step when its Next button is active (not while typing or in a window)
document.addEventListener('keydown',e=>{
  if(e.key!=='Enter' || e.ctrlKey || e.altKey || e.shiftKey || document.querySelector('dialog[open]')) return;
  const t=e.target; if(t && t.closest && t.closest('input,textarea,select,button,[contenteditable],a')) return;
  if($('#builder')?.style.display==='none') return;
  const b=document.querySelector('#bChoices .nextstep'); if(b && !b.disabled){ e.preventDefault(); b.click(); }
});
// a click outside an open window (on the darkened page behind it) closes it, like Done or Cancel
(()=>{
  let downOut=null;
  const outside=(d,e)=>{ const r=d.getBoundingClientRect(); return e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom; };
  document.addEventListener('mousedown',e=>{ const d=e.target; downOut = d && d.tagName==='DIALOG' && d.open && outside(d,e) ? d : null; },true);
  document.addEventListener('click',e=>{ const d=e.target; if(d && d===downOut && d.tagName==='DIALOG' && d.open && outside(d,e)) d.close(); downOut=null; },true);
})();

// the official errata notes at the end of a compendium entry ("Update (4/2009)", "Revision (7/30/2009)"...) are
// already worked into the entry: the builder and the sheet leave them out (the Compendium tab still shows them)
function stripRevisions(box){
  const kids=[...box.childNodes]; let on=false;
  kids.forEach((n,i)=>{
    if(!on && n.nodeType===3 && /^\s*(Revision|Update|Addition|Deletion)\s*\(\d+\/\d+(\/\d+)?\)/.test(n.nodeValue)){
      on=true; for(let j=i-1;j>=0 && kids[j].nodeName==='BR';j--) kids[j].remove();
    }
    if(on){ if(n.nodeType===1 && n.classList.contains('publishedIn')) on=false; else n.remove(); }
  });
}
