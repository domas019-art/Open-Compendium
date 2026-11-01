"use strict";
/* =====================================================================
   Rules engine for the character builder.
   Data comes from the user's own Character Builder file
   (combined.dnd40.merged.xml). Nothing is bundled with the app.

   How the data works, in short:
   - Every thing in the game is a "rules element" (race, class, feat, power…).
   - An element can GRANT other elements, ADD to stats (statadd),
     and ask the player to SELECT elements of some type.
   - Level 1 itself is an element ("ID_INTERNAL_LEVEL_1") that asks for
     a race, a class, a feat, powers, and so on. So building a character
     is just: start at Level 1, follow grants, and fill the selections.
   ===================================================================== */

const RULES = {
  raw: null,     // compact element list, stored locally
  db: null,      // lookups built from raw

  // Read the XML text into a compact form (runs once when the file is loaded).
  load(text){ this.use(this.parse(text)); },
  // add the entries of a CBLoader .part file. An entry with an ID that already exists replaces it only when
  // `replace` is set (our own additions file); otherwise only new entries are added. Nothing is ever doubled.
  /* a .part file on top of the rules. mode 'ours': our additions file, the whole truth for its entries (a newer
     version replaces the older one completely); 'newer': a part changed after the merged file was made: new
     entries are added, and what an entry gained (rules, categories, details) is added to the merged one, so
     nothing other files added to it is lost; 'add': only entries not there yet are added. */
  addPart(text, mode){
    const add=this.parse(text,true), at={};
    let raw=this.raw ? [...this.raw] : [];
    if(mode==='ours') raw=raw.filter(o=>!/^ID_OC_/.test(o.id));
    raw.forEach((o,i)=>at[o.id]=i);
    let n=0;
    for(const o of add){
      if(!(o.id in at)){ at[o.id]=raw.length; raw.push(o); n++; continue; }
      if(mode==='ours'){ raw[at[o.id]]=o; n++; }
      else if(mode==='newer'){
        const m=raw[at[o.id]], has=new Set((m.rules||[]).map(x=>JSON.stringify(x)));
        const rules=(o.rules||[]).filter(x=>!has.has(JSON.stringify(x))), cats=(o.cats||[]).filter(c=>!(m.cats||[]).includes(c));
        const spec=Object.keys(o.spec||{}).some(k=>!(k in (m.spec||{})));
        if(rules.length || cats.length || spec){ raw[at[o.id]]={...m, rules:[...(m.rules||[]),...rules], cats:[...(m.cats||[]),...cats], spec:{...(o.spec||{}),...(m.spec||{})}}; n++; }
      }
    }
    this.use(raw); return n;
  },
  parse(text, part){
    const doc=new DOMParser().parseFromString(text,'application/xml');
    if(doc.getElementsByTagName('parsererror').length) throw new Error('The builder file could not be read as XML.');
    const out=[];
    for(const e of doc.documentElement.children){
      if(e.tagName!=='RulesElement') continue;
      const id=e.getAttribute('internal-id'); if(!id) continue;
      const o={id, name:e.getAttribute('name')||'', type:e.getAttribute('type')||'', source:e.getAttribute('source')||''};
      const spec={}, rules=[]; let text='';
      for(const n of e.childNodes){
        if(n.nodeType===3){ text+=n.nodeValue; continue; }
        if(n.nodeType!==1) continue;
        const t=n.tagName;
        if(t==='Category') o.cats=(n.textContent||'').split(',').map(x=>x.trim()).filter(Boolean);
        else if(t==='Prereqs') o.pre=(n.textContent||'').trim();
        else if(t==='print-prereqs') o.ppre=(n.textContent||'').trim();
        else if(t==='Flavor') o.flavor=(n.textContent||'').trim();
        else if(t==='specific'){ const k=n.getAttribute('name'), v=(n.textContent||'').trim(); if(k && v) spec[k]=v; }
        else if(t==='rules'){
          for(const r of n.children){ const a={}; for(const at of r.attributes) a[at.name.toLowerCase()]=at.value; rules.push([r.tagName.toLowerCase(),a]); }
        }
      }
      if(Object.keys(spec).length) o.spec=spec;
      if(rules.length) o.rules=rules;
      text=text.trim(); if(text) o.text=text;
      out.push(o);
    }
    if(!out.length && !part) throw new Error('No rules found in that file.');
    return out;
  },

  // Build the lookup tables.
  use(raw){
    const els={}, byType={}, catByName={}, nameIdx={};
    for(const o of raw){
      o.cats ||= []; o.rules ||= []; o.spec ||= {};
      els[o.id]=o;
      (byType[o.type] ||= []).push(o.id);
      (nameIdx[o.name.toLowerCase()] ||= []).push(o.id);
      if(o.type==='Category') (catByName[o.name.toLowerCase()] ||= []).push(o.id.toLowerCase());
    }
    // patrons added in a library file (the sorcerer-kings in the additions file): a list group and related words
    for(const o of raw) if(o.spec['_Related Words']){
      o.group=o.spec['_Group']||o.group;
      o.added={city:o.spec['Patron of']||'', title:o.spec['_Patron Title']||'Patron of', words:o.spec['_Related Words'].split(',').map(x=>x.trim()).filter(Boolean)};
    }
    this.raw=raw;
    this.db={els, byType, catByName, nameIdx};
  }
};

const ABILITIES=['Strength','Constitution','Dexterity','Intelligence','Wisdom','Charisma'];
const ABIL_SHORT={str:'Strength',con:'Constitution',dex:'Dexterity',int:'Intelligence',wis:'Wisdom',cha:'Charisma'};
// The original builder's "Optional Details" (check all that apply)
const OPTIONAL_DETAILS=[
  {key:'inherent', id:'ID_INTERNAL_INTERNAL_INHERENT_BONUSES', name:'Inherent Bonuses', text:'Your character gets inherent enhancement bonuses to attacks, damage and defenses as you level, instead of relying on magic items.'},
  // the "feat tax" fix: the two consolidated feats (Essentials era) that keep attacks and defenses up with the
  // monster math, given for free instead of costing two feat choices
  {key:'featTax', ids:['ID_FMP_FEAT_2785','ID_FMP_FEAT_3143'], name:'Expertise and Defenses for free', text:'The common fix for the later 4e math: every character gets Versatile Expertise and Improved Defenses without spending feats on them (+1 to attacks and to Fortitude, Reflex and Will, rising to +2 at 11th and +3 at 21st level).'},
  {key:'darksun', id:'ID_INTERNAL_INTERNAL_DARK_SUN', name:'Dark Sun', text:'A Dark Sun campaign on the continent of Athas. Adds a wild talent choice.'},
  {key:'spellscar', id:'ID_FMP_PSEUDO_CLASS_216', name:'Spellscarred', text:'Forgotten Realms characters can optionally start with a spellscar.'},
  {key:'harper', id:'ID_INTERNAL_INTERNAL_HARPER', name:'Harper', text:'Forgotten Realms characters who gain membership in the Harpers.'},
  {key:'vadalis', id:'ID_INTERNAL_INTERNAL_HOUSE_VADALIS', name:'House Vadalis', text:'Eberron characters who are members of House Vadalis.'},
  {key:'smoke', id:'ID_INTERNAL_INTERNAL_CIRCLE_OF_SMOKE_AND_WHISPERS', name:'Circle of Smoke and Whispers', text:'Membership in the Circle of Smoke and Whispers.'},
  // house rules (not from a book): marked as homebrew
  {key:'intimHighest', id:'', homebrew:true, name:'Intimidate with your best ability (house rule)', text:'Intimidate uses your highest ability modifier instead of Charisma.'},
  {key:'freeBeasts', id:'', homebrew:true, name:'Free-acting companions (house rule)', text:'Your companions\' basic attacks don\'t use your actions, and attack powers with the Beast keyword can be used by any of your beast companions.'},
];

// experience needed to reach each level (from the data; the standard table if missing)
function xpTable(){
  const t=[0,0]; let sum=0;
  for(let n=1;n<30;n++){ const e=RULES.db?.els['ID_INTERNAL_LEVEL_'+n]; const v=+(e?.spec['XP Needed']||0); sum+=v; t[n+1]=sum; }
  return sum>0 ? t : [0,0,1000,2250,3750,5500,7500,10000,13000,16500,20500,26000,32000,39000,47000,57000,69000,83000,99000,119000,143000,175000,210000,255000,310000,375000,450000,550000,675000,825000,1000000];
}
function levelForXp(xp){ const t=xpTable(); let l=1; for(let n=2;n<=30;n++) if(xp>=t[n]) l=n; return l; }
const SKILLS=['Acrobatics','Arcana','Athletics','Bluff','Diplomacy','Dungeoneering','Endurance','Heal','History','Insight','Intimidate','Nature','Perception','Religion','Stealth','Streetwise','Thievery'];

/* ---------- evaluating a character ----------
   ch = { level, abilities:{Strength:…}, picks:{ slotKey:[elementId,…] } }
   Returns the full state: granted elements, open selections, and a stat() function.
   Some rules only apply "if you have X", so we repeat until nothing changes. */
function evaluate(ch){
  const db=RULES.db; let prev=null;
  for(let pass=0; pass<8; pass++){
    const st={level:Math.min(30,Math.max(1,ch.level||1)), granted:new Map(), via:new Map(), lvl:new Map(), order:[], slots:[], adds:[], texts:{}, alias:{}, replaced:new Set()};
    // at: the character level this element was gained at
    const visit=(id,via,at)=>{
      if(st.granted.has(id)) return;
      const el=db.els[id]; if(!el) return;
      st.granted.set(id,el); st.via.set(id,via); st.lvl.set(id,at); st.order.push(id);
      el.rules.forEach(([tag,a],i)=>{
        const lvl=+(a.level||0); if(lvl && lvl>st.level) return;
        const here=Math.max(at,lvl);
        // "WearingOffHandAxe", "WearingRod": what the character holds, checked against the equipment like "wearing"
        const wearReq=/^Wearing/.test(a.requires||'') ? wearingReq(a.requires) : null;
        if(a.requires && !wearReq && !reqOk(a.requires, prev)) return;
        if(tag==='grant') visit(a.name, id, here);
        else if(tag==='statadd') st.adds.push({stat:a.name, value:a.value, type:a.type||'', cond:a.condition, wearing:a.wearing, wearReq, notWearing:a['not-wearing'], skip:('zero' in a)||('non-zero' in a), src:id});
        else if(tag==='textstring') st.texts[a.name]=a.value;
        else if(tag==='statalias') st.alias[(a.alias||'').toLowerCase()]=a.name;
        else if(tag==='select'){
          const slot={key:id+'#'+i, owner:id, type:a.type, number:Math.max(1,+(a.number||1)), cat:a.category||'', optional:a.optional==='true', label:a.name||'', level:here};
          st.slots.push(slot);
          let picks=ch.picks[slot.key];
          if(!picks && a.default){            // e.g. wizards get Ritual Caster unless something else is chosen
            const d=(db.nameIdx[a.default.toLowerCase()]||[]).find(x=>db.els[x].type===a.type);
            if(d){ picks=[d]; slot.def=d; }
          }
          // a destroyed familiar gives none of its benefits until it comes back (Character Sheet)
          if(a.type==='Familiar' && ch.play?.familiar==='destroyed') picks=[];
          for(const pid of (picks||[]).slice(0,slot.number)) visit(pid, slot.key, here);
        }
        else if(tag==='replace' && a.powerswap){
          // levels 13/17/23/27: take a new encounter power in place of one you have
          const slot={key:id+'#'+i, owner:id, type:'Power', number:1, cat:a.powerswap, optional:false, label:a.name||'', level:here, swap:true};
          st.slots.push(slot);
          for(const pid of (ch.picks[slot.key]||[]).slice(0,1)) visit(pid, slot.key, here);
          const out=ch.swaps?.[slot.key]; if(out) st.replaced.add(out);
        }
      });
    };
    visit('ID_INTERNAL_LEVEL_1','start',1);
    for(let n=2;n<=st.level;n++) visit('ID_INTERNAL_LEVEL_'+n,'start',n);
    // optional details chosen for this character (inherent bonuses, Dark Sun, memberships...)
    for(const d of OPTIONAL_DETAILS) if(ch.details?.[d.key]) for(const id of d.ids||[d.id]) if(id) visit(id,'start',1);
    // house rule: Intimidate uses the best ability (ability bonuses don't stack, so the highest counts)
    if(ch.details?.intimHighest) for(const a of ABILITIES) st.adds.push({stat:'Intimidate', value:'+'+a+' modifier', type:'Ability', src:'homebrew'});
    for(const [type,list] of Object.entries(ch.extra||{})) for(const uid of (Array.isArray(list)?list:[])){
      const at=ch.extraLevel?.[uid]||1;
      // an extra feat that needs a higher level than the character has stays in its slot but doesn't count
      const slot={key:'extra:'+type+':'+uid, uid, owner:'', type, number:1, cat:'', optional:true, extra:true, label:'', level:at, inactive:at>st.level};
      st.slots.push(slot);
      if(!slot.inactive && !(type==='Familiar' && ch.play?.familiar==='destroyed')) for(const pid of (ch.picks[slot.key]||[]).slice(0,1)) visit(pid, slot.key, at);
    }
    // equipped items: armor, shields and magic items add their rules
    st.wear=wearContext(ch);
    for(const [slot,uid] of Object.entries(ch.equip||{})){
      const it=(ch.items||[]).find(x=>x.uid===uid); if(!it) continue;
      for(const iid of it.ids) visit(iid,'item:'+uid,st.level);
    }
    // items that work just by being owned, with no equipment slot (boons, The Nine Swords of Tyr entries...)
    for(const it of ch.items||[]){
      if(it.qty<=0 || itemSlots(it).length) continue;
      const m=itemParts(it).magic; if(!m) continue;
      if(!(BOON_TYPES.test(sp(m,'Magic Item Type')) || /^(Special|Any)$/.test(sp(m,'Magic Item Type')))) continue;
      // an entry tied to other items (The Nine Swords of Tyr -> its swords) only works while one of them is equipped
      const tied=[...sp(m,'_DisplayPowers').split(','), ...m.rules.filter(([t,a])=>t==='statadd' && /^FREEBEE:/.test(a.name||'')).map(([,a])=>a.name.slice(8))]
        .map(x=>x.trim()).filter(x=>db.els[x]?.type==='Magic Item');
      if(tied.length){
        const worn=new Set(Object.values(ch.equip||{}).flatMap(u=>(ch.items||[]).find(x=>x.uid===u)?.ids||[]));
        if(!tied.some(x=>worn.has(x))) continue;
      }
      visit(m.id,'item:'+it.uid,st.level);
    }
    // item sets: wearing enough pieces of a set gives its benefits
    { const count={};
      for(const uid of new Set(Object.values(ch.equip||{}))){ const it=(ch.items||[]).find(x=>x.uid===uid); if(!it) continue;
        const set=itemEls(it).map(e=>sp(e,'_Item_Set_ID')).find(Boolean); if(set) count[set]=(count[set]||0)+1; }
      for(const [setId,n] of Object.entries(count)) for(const bid of sp(db.els[setId],'Benefits').split(',').map(x=>x.trim()).filter(Boolean)){
        const b=db.els[bid]; if(b && (+sp(b,'Piece Count')||99)<=n) visit(bid,'set:'+setId,st.level); } }
    for(const r of st.replaced) st.granted.delete(r);          // powers swapped out at 13/17/23/27
    // Versatile Expertise's implement choice can't matter for a character with no implement proficiency (a ranger):
    // it becomes optional, so it isn't asked for
    if(![...st.granted.values()].some(e=>e.type==='Proficiency' && /^Implement Proficiency/i.test(e.name)))
      for(const s of st.slots) if(s.cat==='Versatile Expertise Implement'){ s.optional=true; s.noImplements=true; }
    st.stat=makeStat(st,ch);
    st.names=new Set([...st.granted.values()].map(e=>e.name.toLowerCase()));
    st.sig=st.order.join('|');
    if(prev && prev.sig===st.sig) return st;
    prev=st;
  }
  return prev;
}

/* Versatile Expertise lists every weapon group among its implement choices too, because some characters use
   weapons as implements (a swordmage's blade, a wizard's staff or dagger). A weapon group counts as an implement
   choice only for a character with implement proficiency in that group; otherwise it would quietly give a second
   weapon group. */
const VE_WEAPON_GROUP='ID_INTERNAL_CATEGORY_VERSATILE_EXPERTISE_WEAPON_GROUP';
function implementGroups(st){
  if(st._implGroups) return st._implGroups;
  const g=new Set(), db=RULES.db;
  for(const e of st.granted.values()){
    const m=e.type==='Proficiency' && /^Implement Proficiency \((.+)\)$/i.exec(e.name); if(!m) continue;
    const x=m[1].trim();
    if(/\s+group$/i.test(x)){ g.add(x.replace(/\s+group$/i,'').toLowerCase()); continue; }
    g.add(x.toLowerCase());                     // "Staff": the staff implement is the staff group
    for(const id of db.nameIdx[x.toLowerCase()]||[]){ const w=db.els[id]; if(w?.type==='Weapon') sp(w,'Group').split(',').forEach(t=>t.trim() && g.add(t.trim().toLowerCase())); }
  }
  return st._implGroups=g;
}
/* Versatile Expertise lists every weapon group and implement type. Only the ones the character can actually use are
   offered: weapon groups with at least one weapon they're proficient with, implements they're proficient with. (The
   others are still legal, so "Show everything available" lists them without marking them homebrew.) */
function veRelevant(slot,e,st){
  if(!/^Versatile Expertise (Weapon Group|Implement)$/.test(slot.cat)) return true;
  const what=((/\(([^)]+)\)\s*$/.exec(e.name)||[])[1]||'').toLowerCase(), base=w=>w.replace(/(es|s)$/,'');
  if(slot.cat==='Versatile Expertise Weapon Group' || (e.cats||[]).includes(VE_WEAPON_GROUP)){
    if(slot.cat==='Versatile Expertise Implement') return true;          // weapon groups as implements: checked by veImplementOk
    if(!st._profGroups){ st._profGroups=new Set();
      for(const id of RULES.db.byType.Weapon||[]){ const w=RULES.db.els[id]; if(!w || /\+\d|secondary end|shield|rod of seven|\((heroic|paragon|epic) tier\)/i.test(w.name) || !Builder.profOk(w)) continue;
        sp(w,'Group').split(',').forEach(g=>g.trim() && st._profGroups.add(g.trim().toLowerCase())); } }
    return st._profGroups.has(what);
  }
  const ig=implementGroups(st);
  return [...ig].some(x=>base(x)===base(what) || x.startsWith(base(what)) || base(what).startsWith(base(x)));
}
function veImplementOk(slot,e,st){
  if(slot.cat!=='Versatile Expertise Implement' || !(e.cats||[]).includes(VE_WEAPON_GROUP)) return true;
  const grp=(/\(([^)]+)\)\s*$/.exec(e.name)||[])[1]||'';
  return implementGroups(st).has(grp.toLowerCase());
}

/* "while manifesting voidsoul", "while bloodied": bonuses that count while that is true in play (Character Sheet) */
function condActive(c,ch){
  c=String(c||'').trim().toLowerCase();
  const m=/^while manifesting (\w+)$/.exec(c); if(m) return (ch.play?.manifest||'').toLowerCase()===m[1];
  if(c==='while bloodied' || c==='while you are bloodied') return !!ch.play?.bloodied;
  if(/^while (?:you are )?raging$/.test(c)) return !!ch.play?.active?.rage;
  if(/^while (?:you are )?in a stance$/.test(c)) return !!ch.play?.active?.stance;
  return false;
}
// Stats: untyped bonuses add up; bonuses of the same type don't stack (the highest counts).
function makeStat(st,ch){
  const cache={}, busy={}, by={};
  const norm=n=>{ n=String(n).trim(); const a=st.alias[n.toLowerCase()]; return (a||n).toLowerCase(); };
  const push=(n,ad)=>(by[norm(n)] ||= []).push(ad);
  const w=st.wear||wearContext(ch);
  const on=c=>condActive(c,ch);
  for(const ad of st.adds) if((!ad.cond || on(ad.cond)) && !ad.skip && (!ad.wearing || w.ok(ad.wearing)) && (!ad.wearReq || ad.wearReq.every(x=>w.ok(x))) && (!ad.notWearing || !w.ok(ad.notWearing))) push(ad.stat,ad);
  for(const a of ABILITIES) push(a,{value:'+'+(+ch.abilities?.[a]||10), type:'Base'});
  const term=v=>{
    v=String(v).trim(); let sign=1;
    if(v[0]==='+') v=v.slice(1); else if(v[0]==='-'){ sign=-1; v=v.slice(1); }
    v=v.trim();
    if(/^\d+$/.test(v)) return sign*(+v);
    const m=/^ABILITYMOD\((.+)\)$/i.exec(v);
    if(m) return sign*Math.floor((stat(m[1])-10)/2);
    return sign*stat(v);
  };
  function stat(n){
    const k=norm(n); if(k in cache) return cache[k]; if(busy[k]) return 0; busy[k]=1;
    let sum=0; const typed={};
    for(const ad of by[k]||[]){ const x=term(ad.value); if(!ad.type) sum+=x; else typed[ad.type] = ad.type in typed ? Math.max(typed[ad.type],x) : x; }
    for(const v of Object.values(typed)) sum+=v;
    busy[k]=0; return cache[k]=sum;
  }
  stat.has=n=>norm(n) in by;
  stat.keys=()=>Object.keys(by);
  stat.parts=n=>(by[norm(n)]||[]).map(ad=>({value:term(ad.value), type:ad.type, src:ad.src}));
  return stat;
}

/* ---------- "requires" on a rule (machine format) ---------- */
function reqOk(expr, st){
  return String(expr).split(',').every(part=>{
    part=part.trim(); if(!part) return true;
    let neg=false; if(part[0]==='!'){ neg=true; part=part.slice(1); }
    const any=part.split('|').some(x=>reqAtom(x.trim(),st));
    return neg ? !any : any;
  });
}
function reqAtom(a,st){
  if(!st) return false;                       // first pass: nothing is known yet
  let m=/^(\d+)\s*level$/i.exec(a); if(m) return st.level>=+m[1];
  if(/^heroic tier$/i.test(a)) return st.level<11;
  if(/^paragon tier$/i.test(a)) return st.level>=11 && st.level<21;
  if(/^epic tier$/i.test(a)) return st.level>=21;
  if(st.granted.has(a) || st.names.has(a.toLowerCase())) return true;
  return st.stat.has(a) && st.stat(a)>0;
}

/* ---------- prerequisites (written for people, e.g. "Dwarf, Str 13, trained in Athletics") ----------
   Returns true when met. Anything we can't interpret is allowed rather than blocked. */
function prereqOk(el, st){
  const p=el.pre; if(!p) return true;
  if(/unselectable|not selectable/i.test(p)) return false;
  // feats of a higher tier need that tier
  if(el.type==='Feat'){ const t=(el.spec['Tier']||'').trim(); if(t==='Paragon' && st.level<11) return false; if(t==='Epic' && st.level<21) return false; }
  // "Dragonborn, genasi, half-orc, or human": a clause starting with "or" makes the list before it alternatives
  // a semicolon separates requirements that are all needed: "Shadar-kai; bard, sorcerer, or warlock class"
  const groups=[];
  for(const part of p.split(';')){
    const start=groups.length;
    for(let c of part.split(',')){
      c=c.trim(); if(!c) continue;
      if(/^or\s+/i.test(c) && groups.length>start){
        const alts=[c.replace(/^or\s+/i,'')];
        while(groups.length>start && !/\d|tier|level/i.test(groups[groups.length-1].join(' '))) alts.unshift(...groups.pop());
        alts.strict=true;                       // in such lists, an item we can't recognise doesn't count
        groups.push(alts);
      } else groups.push(c.split(/\s+or\s+/i));
    }
  }
  return groups.every(alts=>alts.some(x=>preAll(x.trim(),st,alts.strict)));
}
// "Warlord and fighter" needs both, unless the whole phrase is a name ("Circle of Smoke and Whispers")
function preAll(a,st,strict){
  if(/\s+and\s+/i.test(a) && !RULES.db.nameIdx[a.toLowerCase().replace(/^(membership in )?(the )?/,'')])
    return a.split(/\s+and\s+/i).every(x=>preAtom(x.trim(),st,strict));
  return preAtom(a,st,strict);
}
function preAtom(a,st,strict){
  if(!a || a[0]==='~') return true;
  if(a[0]==='!') return !preAtom(a.slice(1).trim(),st);
  a=a.replace(/^(you )?must (be|have) (an? |the )?/i,'').replace(/^membership in (the )?/i,'').replace(/[.;:]+$/,'').trim();   // "...training in Intimidate." -> no full stop
  const al=[...st.granted.values()].find(e=>e.type==='Alignment');
  if(/nongood alignment/i.test(a)) return !!al && !/good/i.test(al.name);
  if(/non-?evil alignment/i.test(a)) return !!al && !/evil/i.test(al.name);
  if(/alchemical items/i.test(a)) return st.names.has('alchemist');
  // "a military melee weapon": the original builder doesn't check this part
  if(/\b(simple|military|superior)\s+(melee|ranged)\b/i.test(a) && /weapon/i.test(a)) return true;
  // "21st-level wizard"
  const lv=/^(\d+)(?:st|nd|rd|th)[- ]level\s+(.+)$/i.exec(a);
  if(lv) return st.level>=+lv[1] && preAtom(lv[2],st,strict);
  // "fey origin" (a racial trait such as Fey Origin)
  const org=/^(\w+) origin$/i.exec(a);
  if(org) return st.names.has(org[1].toLowerCase()+' origin');
  // "tome implement mastery" -> Tome of Binding, Tome of Readiness...
  const im=/^(\w+) implement mastery$/i.exec(a);
  if(im) return [...st.granted.values()].some(e=>e.type==='Class Feature' && e.name.toLowerCase().startsWith(im[1].toLowerCase()+' of'));
  // "fey pact with the Winter Fey": the pact is what counts
  const pact=/^([\w-]+) pact with .+$/i.exec(a);
  if(pact) return st.names.has(pact[1].toLowerCase()+' pact');
  if(/paragon multiclassing/i.test(a)) return [...st.names].some(n=>n.includes('paragon multiclass'));
  // "proficiency with longsword(s)": a specific weapon
  const pw=/^(?:proficiency|proficient) with\s+(?:a |an |the )?(.+?)s?$/i.exec(a);
  if(pw && !/armor|shield/i.test(pw[1])){
    const w=pw[1].toLowerCase();
    if((RULES.db.nameIdx[w]||RULES.db.nameIdx[w+'s']||[]).some(id=>RULES.db.els[id].type==='Weapon'))
      return st.names.has('weapon proficiency ('+w+')') || st.names.has('weapon proficiency ('+w+'s)');
  }
  const aff=/^affiliated with\s+(.+)$/i.exec(a);
  if(aff){ const place=aff[1].trim().toLowerCase(); return [...st.granted.values()].some(e=>/Background/.test(e.type) && e.name.toLowerCase().includes(place)); }
  if(/^ID_/.test(a)) return st.granted.has(a);
  let m=/^(str|con|dex|int|wis|cha)[a-z]*\s+(\d+)$/i.exec(a);
  if(m) return st.stat(ABIL_SHORT[m[1].toLowerCase()])>=+m[2];
  m=/^(\d+)(?:st|nd|rd|th)?\s+level$/i.exec(a) || /^level\s+(\d+)$/i.exec(a); if(m) return st.level>=+m[1];
  if(/^heroic tier$/i.test(a)) return st.level<11;
  if(/^paragon tier$/i.test(a)) return st.level>=11;
  if(/^epic tier$/i.test(a)) return st.level>=21;
  m=/^(?:trained|training) in\s+(.+)$/i.exec(a); if(m) return st.stat(m[1].trim()+' Trained')>0;
  m=/^(?:must )?worships?\s+(.+)$/i.exec(a); if(m) return st.names.has(m[1].trim().toLowerCase());
  // "you have a spellscar", "any class-specific multiclassing feat ..." need something the character must already have
  if(/spellscar/i.test(a)) return [...st.granted.values()].some(e=>/spellscar/i.test(e.name));
  if(/multiclass/i.test(a) && /feat/i.test(a)) return [...st.granted.values()].some(e=>e.type==='Feat' && (/multiclass/i.test(e.spec['type']||e.spec['Type']||'') || /\[multiclass/i.test(e.name)));
  m=/^(.+?)\s+background association$/i.exec(a);
  if(m) return [...st.granted.values()].some(e=>e.type==='Background Association' && e.name.toLowerCase()===m[1].trim().toLowerCase());
  // armor and shield proficiency ("proficiency with leather armor", "proficient with light shields")
  m=/^(?:proficiency|proficient) with\s+(?:a |an |any |the )?(.+)$/i.exec(a);
  if(m && /armor|shield|cloth|leather|hide|chainmail|scale|plate/i.test(m[1])){
    const t=m[1].toLowerCase();
    if(/heavy armor/.test(t)) return [...st.granted.values()].some(e=>e.type==='Proficiency' && /armor proficiency \((chainmail|scale|plate)\)/i.test(e.name));
    if(/light armor/.test(t)) return [...st.granted.values()].some(e=>e.type==='Proficiency' && /armor proficiency \((cloth|leather|hide)\)/i.test(e.name));
    const words=t.replace(/armor/g,'').replace(/shields?/g,'shield').split(/\s+/).filter(Boolean);
    return [...st.granted.values()].some(e=>e.type==='Proficiency' && words.every(w=>e.name.toLowerCase().includes(w)));
  }
  const sk=SKILLS.find(x=>x.toLowerCase()===a.toLowerCase());
  if(sk) return st.stat(sk+' Trained')>0;            // a bare skill name means "trained in"
  const n=a.replace(/^(any|an?)\s+/i,'')
           .replace(/\s+(class feature|racial power|racial trait|power source|power|feat|class|theme|background|role|countsasclass|paragon path|epic destiny|feature|origin|race|size|regional background|regional benefit|alignment|character|language)$/i,'')
           .trim().toLowerCase();
  if(st.names.has(n)) return true;
  if(RULES.db.nameIdx[n]) return false;     // a real game element the character doesn't have
  // "Blood Thirst [Multiclass Vampire]" -> "Blood Thirst"
  const nb=n.replace(/\s*\[[^\]]*\]\s*/g,' ').trim();
  if(nb!==n){ if(st.names.has(nb)) return true; if(RULES.db.nameIdx[nb]) return false; }
  // "Dwarf fighter": every word is a race or class, so all are needed
  const words=n.split(/\s+/);
  if(words.length>1 && words.length<=3 && words.every(w=>(RULES.db.nameIdx[w]||[]).some(id=>/^(Race|Class|Hybrid Class|Power Source)$/.test(RULES.db.els[id].type))))
    return words.every(w=>st.names.has(w));
  // a family of races, e.g. "shifter" covers Longtooth Shifter and Razorclaw Shifter
  const races=(RULES.db.byType['Race']||[]).map(id=>RULES.db.els[id].name.toLowerCase());
  if(races.some(r=>new RegExp('\\b'+n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b').test(r)))
    return [...st.granted.values()].some(e=>e.type==='Race' && e.name.toLowerCase().includes(n));
  // Like the original builder: a named class feature, power, feat or ability that doesn't exist can't be met
  if(/\s(class feature|racial power|power|feat|racial trait)$/i.test(a)) return false;
  return !strict;                           // can't tell: don't block (unless it's one item in a list of names)
}

/* ---------- which elements fit a selection ---------- */
function catHas(el,tok){
  const l=tok.toLowerCase();
  if(el.id.toLowerCase()===l || el.name.toLowerCase()===l) return true;
  const cs = el._cs ||= new Set(el.cats.map(c=>c.toLowerCase()));
  if(cs.has(l)) return true;
  for(const id of RULES.db.catByName[l]||[]) if(cs.has(id)) return true;
  for(const id of RULES.db.nameIdx[l]||[]) if(cs.has(id.toLowerCase())) return true;   // e.g. "Ritual Casting" = the feature's ID
  return false;
}
const HIDDEN_CLASS=/^ID_WOG_COMPANION|^ID_INTERNAL_CLASS_HYBRID$|^ID_FMP_CLASS_0$|ORDER_ADEPT/;

function classIds(st){ return String(st.texts['_CLASSNAME']||'').split(/[\s()]+/).filter(Boolean); }
function slotCandidates(slot, st){
  // Essentials sub-classes name two classes: "ID_FMP_CLASS_3 (ID_FMP_CLASS_716)" is fighter (slayer); either counts
  const db=RULES.db, cls=classIds(st).join('|')||'__none__';
  // tokens: "$$LEVEL" = a level up to the character's, "$$CLASS" = your class, "$$NOT_CLASS" = any other class, "!X" = must not be X
  const hybrids=[...st.granted.values()].filter(e=>e.type==='Hybrid Class').map(e=>e.id).join('|')||'__none__';
  const toks=slot.cat ? slot.cat.split(',').map(t=>t.trim()).filter(Boolean)
    .map(t=>t.replace(/\$\$NOT_CLASS/g,'!'+cls).replace(/\$\$CLASS_OR_MULTICLASS/g,cls).replace(/\$\$HYBRID/g,hybrids)
              .replace(/\$\$LEVEL/g,Array.from({length:st.level},(_,i)=>i+1).join('|')).replace(/\$\$CLASS/g,cls+'|ID_FMP_CLASS_0')) : [];   // ID_FMP_CLASS_0: skill powers, open to every class
  // things the character already has from somewhere else can't be picked again
  const elsewhere=new Set(); for(const [id,via] of st.via) if(via!==slot.key) elsewhere.add(id);
  const out=[];
  for(const id of db.byType[slot.type]||[]){
    const el=db.els[id];
    if(slot.type==='Class' && HIDDEN_CLASS.test(id)) continue;
    if(toks.length && !toks.every(t=> t[0]==='!' ? !t.slice(1).split('|').some(alt=>catHas(el,alt.trim()))
                                               : t.split('|').some(alt=>catHas(el,alt.trim())))) continue;
    if(elsewhere.has(id)) continue;
    out.push(el);
  }
  return out;
}

/* ---------- equipment ----------
   ch.items: [{uid, ids:[base item, magic item], qty}]   ch.equip: {slot: uid}
   A magic weapon or armor is a base item plus the magic item, like the original builder. */
const EQUIP_SLOTS=[['body','Body'],['main','Main hand'],['off','Off hand'],['head','Head'],['neck','Neck'],['arms','Arms'],['hands','Hands'],
  ['ring1','Ring'],['ring2','Ring'],['waist','Waist'],['feet','Feet'],['symbol1','Symbol / Ki'],['symbol2','Symbol / Ki'],['tattoo','Tattoo']];
const IMPLEMENT_TYPES=/^(Orb|Rod|Staff|Wand|Tome|Totem|Holy Symbol|Ki Focus)$/;
const sp=(e,k)=>((e && e.spec && e.spec[k])||'').trim();
function itemEls(it){ return (it?.ids||[]).map(id=>RULES.db.els[id]).filter(Boolean); }
// the plain item (armor, weapon, gear) and the magic item, if any
function itemParts(it){ const els=itemEls(it); return {base:els.find(e=>e.type!=='Magic Item')||null, magic:els.find(e=>e.type==='Magic Item')||null}; }
function itemName(it){
  const {base,magic}=itemParts(it);
  // "Lifestealer Weapon +1" with a greataxe -> "Lifestealer Greataxe +1"
  if(magic && base) return /\b(Armor|Weapon)\b/.test(magic.name) ? magic.name.replace(/\b(Armor|Weapon)\b/, base.name) : magic.name+' ('+base.name+')';
  return (magic||base)?.name||'(unknown item)';
}
// which equipment slots an item can go in
function itemSlots(it){
  const {base,magic}=itemParts(it), e=base||magic; if(!e) return [];
  const isShield=x=>x && x.type==='Armor' && /shield/i.test(sp(x,'Armor Type')+' '+sp(x,'Armor Category'));
  if(base && base.type==='Armor') return isShield(base) ? ['off'] : ['body'];
  if(base && base.type==='Weapon') return /two/i.test(sp(base,'Hands Required')+sp(base,'Item Slot')) ? ['main'] : ['main','off'];
  const slot=sp(e,'Item Slot').toLowerCase(), mt=sp(magic,'Magic Item Type');
  if(/ki focus/.test(slot) || /^(Holy Symbol|Ki Focus)$/.test(mt) || /holy symbol|ki focus/i.test(e.name) && e.type!=='Magic Item') return ['symbol1','symbol2'];
  if(/primordial shard/.test(slot)) return ['symbol1','symbol2'];
  if(/off-hand/.test(slot) || IMPLEMENT_TYPES.test(mt) || e.type==='Superior Implement') return ['main','off'];
  if(/^neck/.test(slot)) return ['neck']; if(/^head and neck/.test(slot)) return ['head','neck']; if(/^head/.test(slot)) return ['head'];
  if(/^arms/.test(slot)) return ['arms']; if(/^hands/.test(slot)) return ['hands']; if(/^feet/.test(slot)) return ['feet'];
  if(/^waist/.test(slot)) return ['waist']; if(/^ring/.test(slot)) return ['ring1','ring2']; if(/^tattoo/.test(slot)) return ['tattoo'];
  return [];
}
const twoHanded=it=>{ const {base}=itemParts(it); return !!base && base.type==='Weapon' && /two/i.test(sp(base,'Hands Required')+sp(base,'Item Slot')); };
// a magic weapon or armor needs a base item; which ones fit?
function baseKind(m){
  if(!m || m.type!=='Magic Item') return '';
  const t=sp(m,'Magic Item Type');
  // artifacts that are a weapon or armor (Soul Sword: a greatsword) are made from that item too
  if((t==='Armor'||t==='Artifact') && sp(m,'Armor')) return 'Armor';
  if((t==='Weapon'||t==='Artifact') && sp(m,'Weapon')) return 'Weapon';
  return '';
}
// superior armor (Drakescale, Elderhide...) needs at least a +2 or better enchantment
function minEnhancement(b){
  const v=sp(b,'Minimum Enhancement Bonus') || (/Minimum Enhancement (?:Value|Bonus):\s*\+?(\d+)/i.exec(sp(b,'Full Text'))||[])[1] || '';
  return +String(v).replace(/[^\d]/g,'')||0;
}
function enhancementOf(m){ const x=/\+(\d+)\s*$/.exec(m.name); return x ? +x[1] : Math.ceil((+sp(m,'Level')||1)/5); }
function baseFits(m,b){
  const kind=baseKind(m); if(!kind || b.type!==kind) return false;
  const min=minEnhancement(b); if(min && enhancementOf(m)<min) return false;
  const want=sp(m,kind).toLowerCase().replace(/\(.*?\)/g,'').split(/,|\bor\b/).map(x=>x.trim()).filter(Boolean);
  if(kind==='Armor'){
    const shield=/shield/i.test(sp(b,'Armor Type')), cat=sp(b,'Armor Category').toLowerCase();
    return want.some(w=> w==='any' ? !shield : /shield/.test(w) ? shield && (w==='any shield' || cat.startsWith(w.replace(/s$/,''))) : !shield && cat===w);
  }
  const grp=sp(b,'Group').toLowerCase(), cat=sp(b,'Weapon Category').toLowerCase(), props=sp(b,'Properties').toLowerCase(), nm=b.name.toLowerCase();
  if(/ammunition/i.test(sp(b,'Weapon Category')+grp) || /improvised/.test(cat)) return false;
  return want.some(w=> w==='any' || (w==='any melee' && /melee/.test(cat)) || (w==='any ranged' && /ranged/.test(cat)) || (w==='any thrown' && /thrown/.test(props))
    || grp.split(/,\s*/).includes(w) || grp.split(/,\s*/).includes(w.replace(/s$/,'')) || nm===w || nm===w.replace(/s$/,''));
}
// price in copper pieces
function itemCost(e){
  if(!e) return 0;
  const n=k=>+String(sp(e,k)).replace(/[^\d.]/g,'')||0;
  let cp=n('Gold')*100+n('Silver')*10+n('Copper');
  if(!cp && sp(e,'Market Price')) cp=parseMoney(sp(e,'Market Price'));
  return cp;
}
function parseMoney(s){
  let cp=0; String(s).replace(/,/g,'').replace(/(\d+(?:\.\d+)?)\s*(ad|pp|gp|sp|cp|g)\b/gi,(m,v,u)=>{ cp+=+v*({ad:1000000,pp:10000,gp:100,g:100,sp:10,cp:1}[u.toLowerCase()]); });
  if(!cp && /^\s*\d+\s*$/.test(s)) cp=+s*100;
  return Math.round(cp);
}
function fmtMoney(cp){
  cp=Math.round(cp||0); const neg=cp<0; cp=Math.abs(cp);
  const gp=Math.floor(cp/100), r=cp%100, parts=[];
  if(gp||!r) parts.push(gp.toLocaleString()+' gp'); if(Math.floor(r/10)) parts.push(Math.floor(r/10)+' sp'); if(r%10) parts.push(r%10+' cp');
  return (neg?'−':'')+parts.join(' ');
}
const itemWeight=it=>{ const {base,magic}=itemParts(it); return +(sp(base||magic,'Weight').replace(/[^\d.]/g,''))||0; };

/* "requires" written as WearingOffHandLightBlade&WearingRod: a list of "wearing" conditions (one we can't check never holds) */
function wearingReq(r){
  return String(r).split('&').map(x=>{ x=x.trim().replace(/^Wearing/,'');
    let m=/^OffHand(.+)$/.exec(x); if(m) return 'offhand:'+m[1].replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase();
    if(/^(Rod|Wand|Staff|Orb|Tome|Totem)$/.test(x)) return 'implement:'+x.toLowerCase();
    return 'never:'+x; });
}
/* "wearing" conditions on rules: armor:heavy, weapon:light blade, SLOT:off hand, an item's name... */
function wearContext(ch){
  const db=RULES.db, eq=ch.equip||{}, items=ch.items||[];
  const at=s=>items.find(x=>x.uid===eq[s]);
  const body=at('body') && itemParts(at('body')).base;
  const offIt=at('off'), mainIt=at('main');
  const off=offIt && itemParts(offIt).base, main=mainIt && itemParts(mainIt).base;
  const shield=off && off.type==='Armor' ? off : null;
  const weapons=[main,off].filter(x=>x && x.type==='Weapon');
  const names=new Set(), filled=new Set();
  for(const [s,uid] of Object.entries(eq)){ const it=items.find(x=>x.uid===uid); if(!it) continue; filled.add(s); itemEls(it).forEach(e=>names.add(e.name.toLowerCase())); }
  if(mainIt && twoHanded(mainIt)) filled.add('off');
  const implKinds=new Set();
  for(const s of ['main','off','symbol1','symbol2']){ const it=at(s); if(!it) continue; const {base,magic}=itemParts(it);
    const t=sp(magic,'Magic Item Type'); if(IMPLEMENT_TYPES.test(t)) implKinds.add(t.toLowerCase());
    if(base){ const m=/^(orb|rod|staff|wand|tome|totem|holy symbol|ki focus)/i.exec(base.name); if(m) implKinds.add(m[1].toLowerCase()); if(/staff/i.test(sp(base,'Group'))) implKinds.add('staff'); } }
  const wfit=(w,c)=>{ c=c.trim().toLowerCase(); if(!c) return true; if(c[0]==='!') return !wfit(w,c.slice(1));
    const hands=sp(w,'Hands Required').toLowerCase(), grp=sp(w,'Group').toLowerCase().split(/,\s*/), props=sp(w,'Properties').toLowerCase(), cat=sp(w,'Weapon Category').toLowerCase();
    if(c==='two-handed') return /two/.test(hands); if(c==='one-handed') return /one/.test(hands);
    if(c==='melee'||c==='ranged') return cat.includes(c);
    return grp.includes(c) || grp.includes(c.replace(/s$/,'')) || w.name.toLowerCase()===c || props.includes(c); };
  const ok=expr=>{
    const m=/^([^:]*):(.*)$/.exec(String(expr).trim());
    if(!m) return names.has(String(expr).trim().toLowerCase());
    const kind=m[1].trim().toLowerCase(), rest=m[2].trim().toLowerCase();
    if(kind==='armor'){
      if(!rest) return !!body; if(rest==='*') return !!(body||shield);
      if(/shield/.test(rest)){ if(!shield) return false; return rest==='shield' || sp(shield,'Armor Category').toLowerCase().startsWith(rest.replace(/s$/,'')); }
      if(!body) return false;
      if(rest==='heavy'||rest==='light') return sp(body,'Armor Type').toLowerCase()===rest;
      return sp(body,'Armor Category').toLowerCase()===rest || body.name.toLowerCase().startsWith(rest);
    }
    if(kind==='weapon') return weapons.some(w=>rest.split(',').every(c=>wfit(w,c)));
    if(kind==='offhand') return !!(off && off.type==='Weapon' && rest.split(',').every(c=>wfit(off,c)));
    if(kind==='only-weapon') return weapons.length===1 && rest.split(',').every(c=>wfit(weapons[0],c));
    if(kind==='implement') return implKinds.has(rest);
    if(kind==='slot') return filled.has({'off hand':'off','off-hand':'off','main hand':'main'}[rest]||rest);
    if(kind==='versatile'||kind==='defensive') return weapons.some(w=>sp(w,'Properties').toLowerCase().includes(kind));
    if(kind==='dual-wielding') return weapons.length===2 && (!rest || weapons.every(w=>rest.split(',').some(c=>wfit(w,c.replace(/-blade$/,'')))));
    return false;
  };
  return {ok, body, shield, weapons, main, off};
}

/* A power card as the character has it now: level entries such as "Fey Beast Companion: Fey Panther 3"
   rewrite fields of the card ("modify ... Field=Defenses"); the latest one granted wins. */
function modSpec(e, st){
  const spec={...e.spec}; if(!st) return spec;
  for(const id of st.order){ const g=st.granted.get(id); if(!g) continue;
    for(const [t,a] of g.rules||[]) if(t==='modify' && a.field && (a.name===e.name || a.name===e.id)) spec[a.field]=String(a.value); }
  return spec;
}
