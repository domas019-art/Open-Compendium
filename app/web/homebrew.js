"use strict";
/* =====================================================================
   Homebrew workshop: make your own content, or change official content, without touching any file by hand.

   - A pack is one .part file in Libraries\Homebrew (as big as its maker wants). It is written in the original
     Character Builder's own format (CBLoader's), so old homebrew files load here and packs made here can be used
     with CBLoader too.
   - New entries get IDs of their own (ID_HB_...). A change to an official entry is written as a replacement with
     the same ID, or as AppendNodes / RemoveNodes (a class added to Athletics' class skills, a power taken off a
     class's list). The official files are never changed: delete the pack and everything is as it was.
   - The workshop works on a "draft" of each class: the parts a player knows (hit points, skills, features, powers)
     in plain fields. Anything in an entry the draft doesn't show is kept exactly as it was.
   - Saving is automatic, a moment after each change, like characters.
   ===================================================================== */

/* ---------- writing the CBLoader format ---------- */
const xesc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const ATTR_CASE={category:'Category',field:'Field',level:'Level',prepare:'Prepare'};   // the original's spelling
function ruleXml([tag,a]){ return '<'+tag+Object.entries(a).map(([k,v])=>' '+(ATTR_CASE[k]||k)+'="'+xesc(v)+'"').join('')+' />'; }
function bodyXml(o){
  const out=[];
  if(o.cats && o.cats.length) out.push('<Category>'+xesc(o.cats.join(','))+'</Category>');
  if(o.pre) out.push('<Prereqs>'+xesc(o.pre)+'</Prereqs>');
  if(o.ppre) out.push('<print-prereqs>'+xesc(o.ppre)+'</print-prereqs>');
  if(o.flavor) out.push('<Flavor>'+xesc(o.flavor)+'</Flavor>');
  for(const [k,v] of Object.entries(o.spec||{})) out.push('<specific name="'+xesc(k)+'">'+xesc(v)+'</specific>');
  if(o.rules && o.rules.length) out.push('<rules>\n      '+o.rules.map(ruleXml).join('\n      ')+'\n    </rules>');
  if(o.text) out.push(xesc(o.text));
  return out.map(x=>'    '+x).join('\n');
}
// the details the original Character Builder expects every race to have, even empty (it stops on a race without them)
const RACE_SPEC_KEYS=['Short Description','Size','Speed','Characteristics','Physical Qualities','Playing','Vision','Average Height','Average Weight','Ability Scores','Languages','Skill Bonuses','Racial Traits','Male Names','Female Names'];
function elementXml(o){
  // empty details are left out (reading a file drops them too, so a save without changes writes the same file);
  // a race keeps the ones the original builder needs
  const spec=Object.fromEntries(Object.entries(o.spec||{}).filter(([k,v])=>String(v).trim()!==''));
  if(o.type==='Race') for(const k of RACE_SPEC_KEYS) if(!(k in spec)) spec[k]='';
  return '  <RulesElement name="'+xesc(o.name)+'" type="'+xesc(o.type)+'" internal-id="'+xesc(o.id)+'" source="'+xesc(o.source||'')+'">\n'+bodyXml({...o,spec})+'\n  </RulesElement>';
}
function opXml(p){
  if(p.op==='delete') return '  <DeleteElement internal-id="'+xesc(p.id)+'" />';
  if(p.op==='remove'){
    const kids=[p.clearCats&&'<Category />', p.clearRules&&'<rules />', p.clearText&&'<MainText />', p.clearPre&&'<Prereqs />', p.clearPpre&&'<print-prereqs />',
      p.clearFlavor&&'<Flavor />', ...Object.keys(p.spec||{}).map(k=>'<specific name="'+xesc(k)+'" />')].filter(Boolean);
    return '  <RemoveNodes internal-id="'+xesc(p.id)+'">\n'+kids.map(x=>'    '+x).join('\n')+'\n  </RemoveNodes>';
  }
  return '  <AppendNodes internal-id="'+xesc(p.id)+'">\n'+bodyXml(p)+'\n  </AppendNodes>';
}
function packXml(pack){
  return '<?xml version="1.0" encoding="utf-8"?>\n<D20Rules game-system="D&amp;D4E">\n'+
    '  <!-- Homebrew pack "'+xesc(pack.name).replace(/--/g,'- -')+'", made with Open Compendium. Put this file in Libraries\\Homebrew (or in CBLoader\'s custom folder). -->\n'+
    pack.els.map(elementXml).join('\n')+(pack.els.length&&pack.ops.length?'\n':'')+pack.ops.map(opXml).join('\n')+'\n</D20Rules>\n';
}

/* ---------- small helpers ---------- */
const hbEl=id=>RULES.db?.els[id];
// "half level", "+½ level", "one-half your level" → the builders' +HALF-LEVEL; "level" → +LEVEL
const hbHalfWords=v=>{ const t=String(v||'').trim();
  if(/^\+?\s*(one[- ]?half|half|½|1\/2)\s*(of\s*)?(your\s*)?level$/i.test(t)) return '+HALF-LEVEL';
  if(/^\+?\s*(your\s*)?level$/i.test(t)) return '+LEVEL'; return v; };
// a group the builders search, in words: "at-will,1,ID_FMP_CLASS_9" → "at-will, level 1, Wizard"
const hbCatWords=c=>String(c||'').split(/[,|]/).map(t=>t.trim()).filter(Boolean).map(t=>/^\d+$/.test(t)?'level '+t:(hbEl(t)?.name||t.replace(/^ID_INTERNAL_(CATEGORY_)?/,'').replace(/_/g,' ').toLowerCase())).join(', ');
// what an advanced builder rule does, in plain words
const hbNm=v=>{ v=String(v||'').trim(); return hbEl(v)?.name || v; };
function hbRawPlain(x, prev){
  const a=x.attrs||{}, g=k=>a[k]??a[k.toLowerCase()]??'';
  const fld=g('Field'), val=g('value'), nm=g('name'), ty=g('type');
  const target=nm ? hbNm(nm) : prev ? 'the '+prev+' chosen just above' : 'the entry itself';
  switch(x.tag){
    case 'grant':
      if(ty==='CountsAsClass') return 'Counts as a '+hbNm(nm).replace(/ CountsAsClass$/i,'')+' for anything that needs that class (paragon multiclassing, other feats).';
      if(ty==='Multiclass') return 'Marks the character as multiclassed, so they can\'t take a multiclass feat for another class.';
      if(ty==='Grants') return 'Gives the rules in "'+hbNm(nm)+'".';
      return 'Gives '+hbNm(nm)+(ty?' ('+ty+')':'')+'.';
    case 'modify':
      if(/power usage/i.test(fld)) return 'Makes '+target+' usable '+(/encounter/i.test(val)?'once per encounter':/daily/i.test(val)?'once per day':'as '+val)+'.';
      return 'Changes '+target+': its "'+(fld||'?')+'" becomes '+(g('value')||'?')+'.';
    case 'select': return 'Choose '+(g('number')||1)+' '+(ty||'option')+(g('Category')||g('category')?' from: '+hbCatWords(g('Category')||g('category')):'')+'.';
    case 'statadd': return 'Adds '+(val||'?')+' to '+hbNm(nm)+(ty?' ('+ty+' bonus)':'')+(g('requires')?', when: '+g('requires'):'')+'.';
    case 'drop': return 'Takes away '+hbNm(nm)+'.';
    case 'replace': return 'Puts '+hbNm(g('powerreplace')||nm)+' in place of '+hbNm(g('powerremove')||g('remove'))+'.';
    case 'textstring': return 'Sets the builder text "'+nm+'" to '+val+'.';
    case 'suggest': return 'Suggests '+hbNm(nm)+'.';
    case 'statalias': return 'Treats '+hbNm(g('alias'))+' as another name for '+hbNm(nm)+'.';
  }
  return '';
}
const hbSp=(e,k)=>((e&&e.spec&&e.spec[k])||'').trim();
const slugId=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'')||'X';
const clone=o=>JSON.parse(JSON.stringify(o));
const byName=(a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base',numeric:true});
// the longer texts of a class, each under its own heading in the class's entry
const CLASS_SECTIONS=[['Creating','Creating a character'],['Class Features','Class features (introduction)'],['Implement','Implements'],['Powers','Powers (introduction)'],['Supplemental','More (sidebars)']];
const ABBR={Strength:'Str',Constitution:'Con',Dexterity:'Dex',Intelligence:'Int',Wisdom:'Wis',Charisma:'Cha'};
const DEFENSES=['Fortitude','Reflex','Will','AC'];
// the base rules (without homebrew), looked up by ID: what a change is measured against
let _baseIdx=null, _baseFor=null;
function baseEl(id){ if(_baseFor!==RULES.base){ _baseIdx={}; for(const o of RULES.base||RULES.raw||[]) _baseIdx[o.id]=o; _baseFor=RULES.base; } return _baseIdx[id]; }
const typeEls=t=>(RULES.db?.byType[t]||[]).map(hbEl).filter(Boolean);
const powerKind=e=>{ const u=hbSp(e,'Power Usage').toLowerCase(), d=hbSp(e,'Display').toLowerCase();
  return /utility/.test(d)||(e.cats||[]).includes('ID_INTERNAL_CATEGORY_UTILITY') ? 'Utility' : /at-will/.test(u) ? 'At-will' : /encounter/.test(u) ? 'Encounter' : /daily/.test(u) ? 'Daily' : 'Other'; };
const powerLevel=e=>{ const n=(e.cats||[]).map(c=>+c).filter(n=>n>0&&n<=30); return n.length?Math.min(...n):+(/\d+/.exec(hbSp(e,'Display'))||[0])[0]||0; };
// the proficiencies a class is offered as tick boxes (others can be added from the full list)
const PROF_GROUPS=[
  ['Armor',['CLOTH','LEATHER','HIDE','CHAINMAIL','SCALE','PLATE'].map(x=>'ID_INTERNAL_PROFICIENCY_ARMOR_PROFICIENCY_('+x+')')],
  ['Shields',['LIGHT','HEAVY'].map(x=>'ID_INTERNAL_PROFICIENCY_SHIELD_PROFICIENCY_('+x+')')],
  ['Weapons',['SIMPLE_MELEE','MILITARY_MELEE','SIMPLE_RANGED','MILITARY_RANGED'].map(x=>'ID_INTERNAL_PROFICIENCY_'+x)],
  ['Implements',['WAND','ROD','ORB','STAFF','TOME','HOLY_SYMBOL','TOTEM','KI_FOCUSES','INSTRUMENT'].map(x=>'ID_INTERNAL_PROFICIENCY_IMPLEMENT_PROFICIENCY_('+x+')')],
];
function profWord(e){
  const g=/^Weapon Group \((.+)\)$/i.exec(e.name); if(g) return g[1].toLowerCase()+(/s$/i.test(g[1])?'':'s');   // "Weapon Group (Flail)" -> flails
  const m=/^(Armor|Shield|Implement|Weapon) Proficiency \((.+)\)$/i.exec(e.name);
  if(!m) return e.name.toLowerCase();
  const w=m[2].toLowerCase();
  return /shield/i.test(m[1]) ? w+' shields' : w;
}

/* ---------- a power as the workshop sees it ----------
   pdef: {id, isNew, name, flavor, kind ('Attack'|'Utility'), usage ('At-Will'|'Encounter'|'Daily'), level, action,
     keywords[], attackType, lines{Target, Attack, Hit, ...}, text, keep{spec, cats, rules} (what the editor doesn't show) }
   Written the way the original's powers are, so the builder's lists and the character sheet's numbers work:
   categories (attack/utility, usage, class, keywords, action, level) and the details in the books' order. */
const POWER_KEYWORDS=['Martial','Arcane','Divine','Primal','Psionic','Shadow','Weapon','Implement',
  'Acid','Cold','Fire','Force','Lightning','Necrotic','Poison','Psychic','Radiant','Thunder',
  'Augmentable','Aura','Beast','Beast Form','Channel Divinity','Charm','Conjuration','Elemental','Evocation','Fear','Full Discipline',
  'Healing','Illusion','Invigorating','Polymorph','Rage','Rattling','Reliable','Runic','Sleep','Spirit','Stance','Summoning','Teleportation','Zone'];
// what a bonus can be to: the names the rules use (a bonus to anything else is kept as written)
const BONUS_STATS=['AC','Fortitude Defense','Reflex Defense','Will Defense','Speed','Initiative','Hit Points','Healing Surges','Saving Throws','Death Saving Throws',
  'attack rolls','damage rolls','Passive Perception','Passive Insight', ...SKILLS];
// every keyword offered: the usual ones, the ones homebrew made (in any pack), and any on the power, alphabetically
function keywordList(extra=[]){
  const set=new Map();
  for(const k of [...POWER_KEYWORDS, ...typeEls('Category').filter(e=>e.hb).map(e=>e.name), ...(Workshop.cur?.els||[]).filter(o=>o.type==='Category').map(o=>o.name), ...extra])
    if(k && !set.has(k.toLowerCase())) set.set(k.toLowerCase(),k);
  return [...set.values()].sort((a,b)=>a.localeCompare(b));
}
// an official power with the same name: the original builder finds some things by name and mixes them up
function sameNamePower(p){
  const n=String(p.name||'').trim().toLowerCase(); if(!n) return null;
  return typeEls('Power').find(e=>e.id!==p.id && !e.hb && e.name.toLowerCase()===n)||null;
}
// a keyword of your own becomes an entry of the pack (as the original's keywords are entries), so every power can use it
function ensureKeyword(pack, word){
  if(!word || catByWord(word)) return;
  pack.els.push({id:uniqueId('ID_HB_'+slugId(pack.name)+'_KEYWORD_'+slugId(word)), name:word, type:'Category', source:pack.name, text:'A keyword made in this homebrew pack.'});
}
const POWER_ACTIONS=['Standard action','Move action','Minor action','Free action','Immediate interrupt','Immediate reaction','Opportunity action','No action'];
// the lines of a power, in the books' order; the first ones are always offered, the rest when added
const POWER_LINES=['Trigger','Requirement','Target','Attack','Hit','Miss','Effect','Secondary Target','Secondary Attack','Aftereffect','Sustain Minor','Sustain Move','Sustain Standard','Special'];
const POWER_LINES_SHOWN={Attack:['Target','Attack','Hit','Miss','Effect'], Utility:['Target','Effect'], Feature:['Target','Effect'], None:['Target','Attack','Hit','Miss','Effect']};
const POWER_MANAGED=new Set(['Power Usage','Display','Keywords','Action Type','Attack Type','Targets','Class','Level','Power Type','_ParentFeature',...POWER_LINES]);
const ATTACK_TYPES=['Melee weapon','Melee touch','Melee 1','Ranged weapon','Ranged 5','Ranged 10','Ranged 20','Ranged sight','Close burst 1','Close burst 2','Close burst 3','Close blast 3','Close blast 5','Area burst 1 within 10','Area burst 2 within 10','Area wall 5 within 10','Personal'];
const USAGE_CAT={'At-Will':'ID_INTERNAL_CATEGORY_AT-WILL','Encounter':'ID_INTERNAL_CATEGORY_ENCOUNTER','Daily':'ID_INTERNAL_CATEGORY_DAILY'};
let _catNames=null;
function catByWord(w){   // a keyword's or action's category entry ("Martial" -> ID_FMP_CATEGORY_36)
  const own=(Workshop.cur?.els||[]).find(o=>o.type==='Category' && o.name.toLowerCase()===String(w).toLowerCase());
  if(own) return own.id;
  if(!_catNames || _catNames.db!==RULES.db){ const m={}; for(const e of typeEls('Category')) m[e.name.toLowerCase()] ||= e.id; _catNames={db:RULES.db, m}; }
  return _catNames.m[String(w).toLowerCase()]||'';
}
// a theme's power: no class of its own (the theme may be named as its "Class")
const isThemePower=e=>!!(hbSp(e,'_ThemePower') || hbEl(hbSp(e,'Class'))?.type==='Theme');
// a paragon path's or epic destiny's power: listed under it
const isPathOwnedPower=e=>(e.cats||[]).some(c=>/^(Paragon Path|Epic Destiny)$/.test(hbEl(c)?.type||''));
function powerFrom(e){
  const u=hbSp(e,'Power Usage').toLowerCase();
  const p={id:e.id, isNew:!!e.hb && !e.hbReplaces, name:e.name, flavor:e.flavor||'', text:e.text||'',
    // a power a class feature gives (the paladin's Divine Challenge): nobody chooses it, so it is "Unselectable"
    kind:/unselectable/i.test(e.pre||'') || /feature/i.test(hbSp(e,'Display')) ? 'Feature'
      : /utility/i.test(hbSp(e,'Power Type'))||(e.cats||[]).includes('ID_INTERNAL_CATEGORY_UTILITY') ? 'Utility' : 'Attack',
    usage:/encounter/.test(u)?'Encounter':/daily/.test(u)?'Daily':'At-Will', level:+hbSp(e,'Level')||powerLevel(e)||1,
    action:POWER_ACTIONS.find(a=>a.toLowerCase()===hbSp(e,'Action Type').toLowerCase())||hbSp(e,'Action Type')||'Standard action',
    keywords:hbSp(e,'Keywords').split(/\s*[,;]\s*/).filter(k=>k && !/^none$/i.test(k)), attackType:hbSp(e,'Attack Type'), lines:{},
    keep:{spec:{}, cats:[], rules:e.rules||[]}};
  for(const k of POWER_LINES){ const v=hbSp(e,k)||(k==='Target'?hbSp(e,'Targets'):''); if(v) p.lines[k]=v; }
  // a line of the power's own ("Undeath Focus: ...") is shown and edited; details starting with _ are the builder's
  p.custom=[];
  for(const [k,v] of Object.entries(e.spec||{})) if(!POWER_MANAGED.has(k)){ if(k[0]!=='_' && !/^(Associated|Tier|type)/i.test(k)) p.custom.push([k,v]); else p.keep.spec[k]=v; }
  // usable as a basic attack ("_BasicAttack: Ranged", with the rule the original writes for it)
  p.basic=String(e.spec?.['_BasicAttack']||'').trim(); delete p.keep.spec['_BasicAttack'];
  // secondary powers it gives (Flameburst Armor's attack): granted by it, and listed for the original's sheet
  p.children=(e.rules||[]).filter(([t,a])=>t==='grant' && a.type==='Power' && Object.keys(a).length===2).map(([,a])=>a.name);
  p.keep.rules=(e.rules||[]).filter(([t,a])=>!(t==='modify' && a.name==='this' && /^_BasicAttack$/i.test(String(a.field||'').trim())) && !(t==='grant' && a.type==='Power' && Object.keys(a).length===2));
  if(p.children.length){ delete p.keep.spec['_ChildPower']; if(String(p.keep.spec['_DisplayPowers']||'').split(',').map(x=>x.trim()).join(',')===p.children.join(',')) delete p.keep.spec['_DisplayPowers']; }
  p.augment=(e.cats||[]).includes('ID_INTERNAL_CATEGORY_AUGMENTABLE_AT-WILL');
  // its other rules (Divine Sanction on a paladin power, a bonus while it lasts), edited like a feature's
  p.more=featureFrom({id:e.id, name:'', spec:{}, rules:p.keep.rules});
  // a power of no class (feat, racial, skill power): shown as the original shows it, with or without a level and kind
  if(!hbSp(e,'Class') || isThemePower(e)){ p.standalone=true; if(hbSp(e,'Class')) p.keep.spec['Class']=e.spec['Class']; p.display=hbSp(e,'Display'); p.level=+hbSp(e,'Level')||0; p.pre=String(e.pre||'').trim(); p.ptype=e.spec?.['Power Type'];
    p.actionRaw=hbSp(e,'Action Type'); p.kwRaw=e.spec?.['Keywords'];
    p.kind=(e.cats||[]).includes('ID_INTERNAL_CATEGORY_ATTACK') ? 'Attack' : (e.cats||[]).includes('ID_INTERNAL_CATEGORY_UTILITY') ? 'Utility' : 'None'; }
  const managed=c=>/^ID_INTERNAL_CATEGORY_(ATTACK|UTILITY|AT-WILL|ENCOUNTER|DAILY|AUGMENTABLE_AT-WILL)(_USAGE)?$/.test(c) || /_ACTION$|INTERRUPT$|REACTION$/.test(c) || /^\d+$/.test(c)
    || hbEl(c)?.type==='Class' && !p.standalone || hbEl(c)?.type==='Class Feature' || p.keywords.some(k=>catByWord(k)===c);
  p.keep.cats=(e.cats||[]).filter(c=>!managed(c));
  p.orig=JSON.stringify(powerCore(p));
  return p;
}
const powerCore=p=>({display:p.display,pre:p.pre,name:p.name,flavor:p.flavor,text:p.text,kind:p.kind,usage:p.usage,level:p.level,action:p.action,keywords:p.keywords,attackType:p.attackType,lines:p.lines,custom:p.custom||[],basic:p.basic||'',children:p.children||[],augment:!!p.augment,more:(p.more?.effects||[]).map(x=>({...x,rule:undefined}))});
function powerEl(p, cls, source, givenBy){
  if(p.standalone && !cls) return standalonePowerEl(p, source);
  const o={id:p.id, name:p.name, type:'Power', source, flavor:p.flavor, text:p.text,
    rules:[...(p.children||[]).map(c=>['grant',{name:c,type:'Power'}]), ...(p.basic?[['modify',{name:'this',field:'_BasicAttack',value:p.basic}]]:[]), ...(p.more?featureRules(p.more):p.keep.rules)]};
  const feat=p.kind==='Feature';
  const usageCats=p.kind==='Attack' ? [USAGE_CAT[p.usage], USAGE_CAT[p.usage]+'_USAGE'] : [USAGE_CAT[p.usage]+'_USAGE'];
  // a feature's power: listed under the features that give it, with no class, kind or level (it is never chosen)
  o.cats=[...new Set([...(feat?(givenBy||[]):[p.kind==='Attack'?'ID_INTERNAL_CATEGORY_ATTACK':'ID_INTERNAL_CATEGORY_UTILITY']), ...usageCats, ...(cls&&!feat?[cls.id]:[]),
    ...p.keywords.map(catByWord).filter(Boolean), catByWord(p.action), ...(p.augment && p.usage==='At-Will'?['ID_INTERNAL_CATEGORY_AUGMENTABLE_AT-WILL']:[]), ...p.keep.cats, ...(feat?[]:[String(p.level||1)])].filter(Boolean))];
  if(feat) o.pre='Unselectable';
  const spec={'Power Usage':p.usage, 'Display':((cls?.name||'')+' '+(feat?'Feature':(p.kind==='Attack'?'Attack':'Utility')+' '+(p.level||1))).trim(),
    'Keywords':p.keywords.join(', '), 'Action Type':p.action, 'Attack Type':p.attackType};
  for(const k of POWER_LINES) if((p.lines[k]||'').trim()) spec[k]=p.lines[k].trim();
  for(const [k,v] of p.custom||[]){ const name=String(k).trim().replace(/\s*:+$/,''); if(name && String(v).trim()) spec[name]=String(v).trim(); }   // the sheet adds the colon
  // a feature's power, as the original's are: "Power Type: Feature" and the feature that gives it (the original
  // builder needs these to print a feature's attack power on the character sheet)
  if(p.basic) spec['_BasicAttack']=p.basic;
  if((p.children||[]).length){ spec['_ChildPower']=p.children.join(','); spec['_DisplayPowers']=p.children.join(','); }
  Object.assign(spec, p.keep.spec, cls?{'Class':cls.id}:{}, feat?{'Power Type':'Feature', ...((givenBy||[]).length?{'_ParentFeature':givenBy.join(',')}:{})}:{'Level':String(p.level||1), 'Power Type':p.kind});
  for(const k of Object.keys(spec)) if(spec[k]==='' && !(k in p.keep.spec)) delete spec[k];
  o.spec=spec;
  return o;
}

// a power of no class
function standalonePowerEl(p, source){
  if(!p.isNew && p.orig && hbEl(p.id)) return patchedPowerEl(p);
  const o={id:p.id, name:p.name, type:'Power', source, flavor:p.flavor, text:p.text,
    rules:[...(p.children||[]).map(c=>['grant',{name:c,type:'Power'}]), ...(p.basic?[['modify',{name:'this',field:'_BasicAttack',value:p.basic}]]:[]), ...(p.more?featureRules(p.more):p.keep.rules)]};
  const U=USAGE_CAT[p.usage];
  o.cats=[...new Set([...(p.kind==='Attack'?['ID_INTERNAL_CATEGORY_ATTACK']:p.kind==='Utility'?['ID_INTERNAL_CATEGORY_UTILITY']:[]), ...(p.kind==='Attack'?[U,U+'_USAGE']:[U+'_USAGE']),
    ...p.keywords.map(catByWord).filter(Boolean), catByWord(p.action), ...(p.augment && p.usage==='At-Will'?['ID_INTERNAL_CATEGORY_AUGMENTABLE_AT-WILL']:[]), ...p.keep.cats, ...(p.level>0?[String(p.level)]:[])].filter(Boolean))];
  if(p.pre) o.pre=p.pre;
  const kw=p.keywords.join(', '), act=p.actionRaw && p.actionRaw.toLowerCase()===String(p.action).toLowerCase() ? p.actionRaw : p.action;
  const spec={'Power Usage':p.usage, 'Display':p.display||'', 'Keywords':p.kwRaw!==undefined && p.kwRaw.split(/\s*[,;]\s*/).filter(k=>k && !/^none$/i.test(k)).join(', ')===kw ? p.kwRaw : kw,
    'Action Type':act, 'Attack Type':p.attackType};
  for(const k of POWER_LINES) if((p.lines[k]||'').trim()) spec[k]=p.lines[k].trim();
  for(const [k,v] of p.custom||[]){ const name=String(k).trim().replace(/\s*:+$/,''); if(name && String(v).trim()) spec[name]=String(v).trim(); }
  if(p.basic) spec['_BasicAttack']=p.basic;
  if((p.children||[]).length){ spec['_ChildPower']=p.children.join(','); spec['_DisplayPowers']=p.children.join(','); }
  Object.assign(spec, p.keep.spec);
  if(p.level>0) spec['Level']=String(p.level);
  if(p.ptype!==undefined) spec['Power Type']=p.ptype; else if(p.isNew && p.kind!=='None') spec['Power Type']=p.kind;
  for(const k of Object.keys(spec)) if(spec[k]==='' && !(k in p.keep.spec) && !(k==='Keywords' && p.kwRaw!==undefined) && !(k==='Display' && !p.isNew)) delete spec[k];
  o.spec=spec;
  return o;
}

// an official (or earlier) power changed: the entry as it is, with only what was changed written again
function patchedPowerEl(p){
  const o=clone(hbEl(p.id)); delete o.hb; delete o.hbMod; delete o.hbReplaces; delete o._cs;
  const was=JSON.parse(p.orig), now=powerCore(p), ch=k=>JSON.stringify(was[k])!==JSON.stringify(now[k]);
  o.spec={...(o.spec||{})}; let cats=[...(o.cats||[])];
  const swapCat=(from,to)=>{ cats=cats.filter(c=>!from.includes(c)); for(const c of to) if(c && !cats.includes(c)) cats.push(c); };
  if(ch('name')) o.name=p.name;
  if(ch('flavor')){ if(p.flavor) o.flavor=p.flavor; else delete o.flavor; }
  if(ch('text')) o.text=p.text;
  if(ch('display')) o.spec['Display']=p.display||'';
  if(ch('pre')){ if(p.pre) o.pre=p.pre; else delete o.pre; }
  if(ch('attackType')) o.spec['Attack Type']=p.attackType||'';
  for(const k of POWER_LINES){ if((was.lines[k]||'')!==(now.lines[k]||'')){ if((p.lines[k]||'').trim()) o.spec[k]=p.lines[k].trim(); else delete o.spec[k]; } }
  if(ch('custom')){ for(const [k] of was.custom) delete o.spec[String(k).trim().replace(/\s*:+$/,'')]; for(const [k,v] of p.custom){ const n=String(k).trim().replace(/\s*:+$/,''); if(n && String(v).trim()) o.spec[n]=String(v).trim(); } }
  if(ch('usage')){ o.spec['Power Usage']=p.usage; const all=Object.values(USAGE_CAT).flatMap(c=>[c,c+'_USAGE']); const U=USAGE_CAT[p.usage];
    swapCat(all, p.kind==='Attack'?[U,U+'_USAGE']:[U+'_USAGE']); }
  if(ch('action')){ o.spec['Action Type']=p.action; swapCat([catByWord(was.action)], [catByWord(p.action)]); }
  if(ch('keywords')){ o.spec['Keywords']=p.keywords.join(', '); swapCat(was.keywords.map(catByWord), p.keywords.map(catByWord)); }
  if(ch('level')){ if(p.level>0) o.spec['Level']=String(p.level); else delete o.spec['Level']; swapCat([String(was.level)], p.level>0?[String(p.level)]:[]); }
  if(ch('kind')) swapCat(['ID_INTERNAL_CATEGORY_ATTACK','ID_INTERNAL_CATEGORY_UTILITY'], p.kind==='Attack'?['ID_INTERNAL_CATEGORY_ATTACK']:p.kind==='Utility'?['ID_INTERNAL_CATEGORY_UTILITY']:[]);
  if(ch('augment')) swapCat(['ID_INTERNAL_CATEGORY_AUGMENTABLE_AT-WILL'], p.augment?['ID_INTERNAL_CATEGORY_AUGMENTABLE_AT-WILL']:[]);
  if(ch('basic')){ if(p.basic) o.spec['_BasicAttack']=p.basic; else delete o.spec['_BasicAttack']; }
  if(ch('children')){ if(p.children.length){ o.spec['_ChildPower']=p.children.join(','); o.spec['_DisplayPowers']=p.children.join(','); } else { delete o.spec['_ChildPower']; delete o.spec['_DisplayPowers']; } }
  if(ch('children') || ch('basic') || ch('more'))
    o.rules=[...(p.children||[]).map(c=>['grant',{name:c,type:'Power'}]), ...(p.basic?[['modify',{name:'this',field:'_BasicAttack',value:p.basic}]]:[]), ...(p.more?featureRules(p.more):p.keep.rules)];
  o.cats=cats;
  return o;
}

/* ---------- a class as the workshop sees it ----------
   draft: {id, isNew, base (the official ID it changes, or ''), name, role, source (power source), keys[], powerName,
     short, flavor, text, roleText, sourceText, hp1, hpLevel, surges, def{Fortitude,Reflex,Will,AC}, skillCount,
     classSkills[] (Skill Training IDs), autoSkills[], profs[], atWill, features[] (rows), builds[], powers[],
     keep{cls, grants} (rules the draft doesn't show), orig (the draft as it was loaded, to see what changed),
     own (IDs of the pack's entries that belong to this class) }
   feature row: {kind:'grant', id, level} or {kind:'choose', number, ids[], rule (the original, while unchanged)}
   feature (draft.fdefs[id]): {id, isNew, name, level, short, text, effects[], keep[] (other rules), changed} */
const CLASS_RULE=(t,a)=>
  (t==='grant' && a.type==='Grants') || (t==='textstring' && a.name==='_CLASSNAME') ||
  (t==='statadd' && /^(_LEVEL-ONE-HPS|_PER-LEVEL-HPS|Healing Surges)$/.test(a.name) && /^\+?\d+$/.test(String(a.value||'').trim()) && !a.requires) ||
  (t==='statadd' && /^(Fortitude|Reflex|Will) Defense Class Bonus$|^AC Class Bonus$/.test(a.name)) ||
  (t==='select' && a.type==='Power' && /^\$\$CLASS,at-will,1$/i.test(a.category||'') && (!a.name || /Augmented At-Will$/.test(a.name))) ||
  (t==='statadd' && a.name==='_WeaponsAsImplements') ||
  (t==='select' && a.type==='Build') || (t==='select' && a.type==='Skill Training') || (t==='grant' && a.type==='Skill Training');
const GRANTS_RULE=(t,a)=>(t==='grant' && /^(Role|Power Source|Proficiency|Class Feature|Internal|Skill Training)$/.test(a.type) && Object.keys(a).every(k=>/^(name|type|level)$/.test(k)) && (a.level===undefined || /^\d+$/.test(String(a.level).trim()))) ||
  (t==='grant' && a.type==='Grants' && /_IMPLEMENTS$/.test(a.name||'')) ||
  (t==='statadd' && /^FREEBEE:/.test(a.name||'') && Object.keys(a).length===2) || (t==='textstring' && a.name==='Free Rituals') ||
  (t==='select' && a.type==='Class Feature' && String(a.category||'').split('|').every(x=>hbEl(x.trim())));

/* ---------- what a class feature does ----------
   effect: {kind, ...what it gives, plus when it applies:}
     at (from level N; on a grant the rule's "level", otherwise requires="N level"), atReq (the original wrote it in requires),
     need (only with this feature/feat/race... = requires="ID"), needNot (only without it = "!ID"),
     untrained (only if not trained in this skill = "!Skill Skill Training"), reqMore[] (other requires parts, kept),
     wear: {mode:'wearing'|'not-wearing', what:'armor:heavy'} (bonuses only)
   a rule we can't show this way is kept as it is (feature.keep). */
const ARMOR_WHEN=[['wearing','armor:','in any armor'],['not-wearing','armor:','in no armor'],['not-wearing','armor:heavy','in light armor or none'],
  ['wearing','armor:heavy','in heavy armor'],['wearing','armor:light','in light armor'],['wearing','armor:cloth','in cloth armor'],['wearing','armor:shield','with a shield'],['not-wearing','armor:shield','without a shield']];
const COND_ATTRS=['level','requires','wearing','not-wearing','zero','non-zero'];
function condFrom(a, x){
  if(a.wearing!==undefined) x.wear={mode:'wearing', what:a.wearing}; else if(a['not-wearing']!==undefined) x.wear={mode:'not-wearing', what:a['not-wearing']};
  if(a.wearing!==undefined && a['not-wearing']!==undefined) x.wear2={mode:'not-wearing', what:a['not-wearing']};
  for(const k of ['zero','non-zero']) if(a[k]!==undefined) (x.flags ||= {})[k]=a[k];
  if(a.level!==undefined){ if(!/^\d+$/.test(String(a.level).trim())) return null; x.at=+a.level; if(x.at===1) x.at1=true; }
  if(a.requires){
    const more=[];
    for(let p of String(a.requires).split('&')){ p=p.trim(); let m;
      if((m=/^(\d+)\s*level$/i.exec(p)) && !x.at){ x.at=+m[1]; x.atReq=true; if(x.at===1) x.at1=true; }
      else if((m=/^!(.+) Skill Training$/i.exec(p)) && !x.untrained) x.untrained=m[1];
      else if((m=/^(!?)(ID_\S+)$/.exec(p)) && !x.need && hbEl(m[2])){ x.need=m[2]; x.needNot=!!m[1]; }
      else more.push(p); }
    if(more.length) x.reqMore=more;
    x.reqRaw=String(a.requires); x.reqSig=condSig(x);
  }
  return x;
}
const condSig=x=>JSON.stringify([x.at||0,!!x.atReq,x.need||'',!!x.needNot,x.untrained||'',x.reqMore||[]]);
function condAttrs(x, grant){
  const a={}, req=[];
  if(x.at>1 || (x.at===1 && x.at1)){ if(grant && !x.atReq) a.level=String(x.at); else req.push(x.at+' level'); }
  if(x.need) req.push((x.needNot?'!':'')+x.need);
  if(x.untrained) req.push('!'+x.untrained+' Skill Training');
  req.push(...(x.reqMore||[]));
  if(req.length) a.requires=x.reqRaw && x.reqSig===condSig(x) ? x.reqRaw : req.join('&');
  if(x.wear && x.wear.what!==undefined && x.wear.mode) a[x.wear.mode]=x.wear.what;
  if(x.wear2 && x.wear2.mode!==x.wear?.mode) a[x.wear2.mode]=x.wear2.what;
  for(const [k,v] of Object.entries(x.flags||{})) a[k]=v;      // "zero" and the like, kept as they were
  return a;
}
const onlyAttrs=(a,ok)=>Object.keys(a).every(k=>ok.includes(k) || COND_ATTRS.includes(k));
const POWER_SLOT_RE=/^\$\$CLASS,(at-will|encounter|daily|utility),(\d+)$/i;
function featureFrom(e){
  const f={id:e.id, isNew:false, name:e.name, level:+hbSp(e,'Level')||1, short:hbSp(e,'Short Description'), text:e.text||'', effects:[], keep:[]};
  // a resistance made here: "resist:necrotic" = a helper number (+5, +HALF-LEVEL), as the original writes it
  // (read in order, so a save without changes writes the same file)
  const rules=e.rules||[], helpers=new Set();
  for(const [t,a] of rules) if(t==='statadd' && /^resist:/.test(a.name||'') && a.type==='resist' && /^_hb /.test(a.value||'')) helpers.add(a.value);
  // "A|B": these; "A,B" (or "A, B"): everything listed under all of them (a group)
  const ids=cat=>{ if(/,/.test(cat||'')) return null; const l=String(cat||'').split('|').map(x=>x.trim()).filter(Boolean); return l.length && l.every(x=>hbEl(x)) ? l : null; };
  for(const r of rules){
    const [t,a]=r; let x=null;
    const GRANT={'Power':'power','Feat':'feat','Skill Training':'skill','Proficiency':'prof','Class Feature':'feature','Vision':'vision','Internal':'special','internal':'special','Language':'language','CountsAsFeature':'countsAs','Background Association':'assoc'};
    if(t==='statadd' && helpers.has(a.name)) continue;
    if(t==='statadd' && helpers.has(a.value) && /^resist:/.test(a.name||'')){
      const parts=rules.filter(([t2,a2])=>t2==='statadd' && a2.name===a.value);
      const n=parts.map(([,a2])=>a2.value).find(v=>/^\+?\d+$/.test(v));
      x={kind:'resist', dmg:a.name.slice(7), amount:+(n||0), half:parts.some(([,a2])=>a2.value==='+HALF-LEVEL')};
    }
    else if(t==='grant' && GRANT[a.type] && onlyAttrs(a,['name','type'])) x={kind:GRANT[a.type], id:a.name, ...(a.type==='internal'?{lower:true}:{})};
    else if(t==='drop' && a.name && a.type && onlyAttrs(a,['name','type'])) x={kind:'drop', id:a.name, type:a.type};
    else if(t==='suggest' && a.name && a.type && onlyAttrs(a,['name','type'])) x={kind:'suggest', id:a.name, type:a.type};
    else if(t==='textstring' && a.name==='Free Rituals' && onlyAttrs(a,['name','value'])) x={kind:'rituals', text:a.value||''};
    else if(t==='textstring' && /:damage$/i.test(a.name||'') && /^[+-]?\s*(\d*d\d|\d+\s*\[?W\]?\s*$)/i.test(a.value||'') && onlyAttrs(a,['name','value','condition'])) x={kind:'rider', on:a.name.replace(/:damage$/i,''), value:a.value||'', condition:a.condition||''};
    else if(t==='textstring' && a.name && a.name!=='_CLASSNAME' && onlyAttrs(a,['name','value','condition'])) x={kind:'text', name:a.name, value:a.value||'', condition:a.condition||''};
    else if(t==='statadd' && /^FREEBEE:./.test(a.name||'') && onlyAttrs(a,['name','value'])) x={kind:'gear', id:a.name.slice(8), qty:parseInt(String(a.value).replace('+',''),10)||1};
    else if(t==='statadd' && a.name && a.value && onlyAttrs(a,['name','value','type','condition']))
      x={kind:'bonus', stat:a.name, value:a.value, type:a.type||'', condition:a.condition||'', ...(/^[+-]/.test(a.value)?{}:{bare:a.value})};
    else if(t==='select' && a.type==='Class Feature' && onlyAttrs(a,['type','number','category'])){
      const cat=String(a.category||''), l=ids(cat), multi=l && (l.length>1 || hbEl(l[0])?.type!=='Class Feature' || !typeEls('Class Feature').some(o=>(o.cats||[]).includes(cat)));
      // a list of features, or a group: every feature listed under it ("Kensei Focus", a feature's ID), written back as the group
      const inGroup=multi ? null : typeEls('Class Feature').filter(o=>cat.split(',').map(c=>c.trim()).every(c=>(o.cats||[]).includes(c))).map(o=>o.id);
      x={kind:'choose', number:(String(a.number).trim()==='0'?0:+a.number||1), ids:multi ? l : inGroup, rule:r, ...(multi?{}:{cat, catIds:JSON.stringify(inGroup)})};
    }
    else if(t==='select' && a.type==='Power' && POWER_SLOT_RE.test(a.category||'') && onlyAttrs(a,['type','number','category','spellbook','name'])){
      const m=POWER_SLOT_RE.exec(a.category); x={kind:'slot', number:(String(a.number).trim()==='0'?0:+a.number||1), usage:m[1].toLowerCase(), plevel:+m[2], spellbook:a.spellbook!==undefined, label:a.name||''};
    }
    else if(t==='select' && (a.type==='Power'||a.type==='Feat') && onlyAttrs(a,['type','number','category','default'])){
      const l=ids(a.category);
      x={kind:a.type==='Power'?'choosePower':'chooseFeat', number:(String(a.number).trim()==='0'?0:+a.number||1), ids:l||[], cat:l?'':String(a.category||''), def:a.default||''};
    }
    else if(t==='select' && a.type && !['Power','Feat','Class Feature'].includes(a.type) && onlyAttrs(a,['type','number','category','optional']))
      x={kind:'pick', type:a.type, number:(String(a.number).trim()==='0'?0:+a.number||1), cat:a.category||'', optional:a.optional==='true'};
    else if(t==='modify' && a.type!=='Weapon' && a.name && a.field && onlyAttrs(a,['name','type','field','value']))
      x={kind:'change', power:a.name, field:String(a.field), value:a.value||'', ptype:a.type||''};
    else if(t==='modify' && a.type==='Weapon' && onlyAttrs(a,['name','type','field','value','die-increase']) && ((a.field==='Damage' && a['die-increase']) || a.field==='_ImplementEquiv'))
      x={kind:'weapon', weapon:a.name, mode:a.field==='Damage'?'die':'impl', impl:a.value||'', steps:String(a['die-increase']||'1')};
    if(x && x.kind!=='resist' && x.kind!=='raw' && !condFrom(a,x)) x=null;
    if(x && x.kind==='choose') x.ruleSig=JSON.stringify([x.number,x.ids,condSig(x),x.at||0]);
    // anything else: the rule as it is, its parts shown and editable (multiclass swaps, list additions...)
    if(!x) x={kind:'raw', tag:t, attrs:{...a}};
    f.effects.push(x);
  }
  return f;
}
function featureRules(f){
  const out=[];
  const GRANT={power:'Power',feat:'Feat',skill:'Skill Training',prof:'Proficiency',feature:'Class Feature',vision:'Vision',special:'Internal',language:'Language',countsAs:'CountsAsFeature',assoc:'Background Association'};
  for(const x of f.effects){
    let r=null;
    if(GRANT[x.kind] && x.id) r=['grant',{name:x.id,type:x.kind==='special'&&x.lower?'internal':GRANT[x.kind]}];
    else if(x.kind==='rituals' && x.text) r=['textstring',{name:'Free Rituals',value:x.text}];
    else if(x.kind==='rider' && x.value) r=['textstring',{name:(x.on||'weapon')+':damage',...(x.condition?{condition:x.condition}:{}),value:x.value}];
    else if(x.kind==='gear' && x.id) r=['statadd',{name:'FREEBEE:'+x.id,value:'+'+(x.qty||1)}];
    else if(x.kind==='resist' && x.dmg && (x.amount || x.half)){
      const helper='_hb '+f.id+' '+x.dmg+' resist';
      if(x.amount) out.push(['statadd',{name:helper,value:'+'+x.amount}]);
      if(x.half) out.push(['statadd',{name:helper,value:'+HALF-LEVEL'}]);
      out.push(['statadd',{name:'resist:'+x.dmg,value:helper,type:'resist'}]);
    }
    else if(x.kind==='bonus' && x.stat && x.value){ r=['statadd',{name:x.stat,value:/^[+-]/.test(x.value)||x.value===x.bare?x.value:'+'+x.value}]; if(x.type) r[1].type=x.type; if(x.condition) r[1].condition=x.condition; }
    else if(x.kind==='choose' && (x.ids.length || x.rule || x.cat)){
      const same=x.rule && x.ruleSig===JSON.stringify([x.number,x.ids,condSig(x),x.at||0]);
      out.push(same ? x.rule : ['select',{type:'Class Feature',number:String(x.number===0||x.number==='0'?0:(x.number||1)),category:x.cat && x.catIds===JSON.stringify(x.ids) ? x.cat : x.ids.join('|'),...condAttrs(x,true)}]);
    }
    else if(x.kind==='slot' && x.plevel) r=['select',{type:'Power',...(x.label?{name:x.label}:{}),number:String(x.number===0||x.number==='0'?0:(x.number||1)),category:'$$CLASS,'+(x.usage||'daily')+','+x.plevel,
      ...(x.spellbook?{spellbook:'Power '+((x.usage||'daily')[0].toUpperCase()+(x.usage||'daily').slice(1))+' '+x.plevel}:{})}];
    else if(x.kind==='choosePower'||x.kind==='chooseFeat')      // no options listed: any power or feat
      r=['select',{type:x.kind==='choosePower'?'Power':'Feat',number:String(x.number===0||x.number==='0'?0:(x.number||1)),...(x.ids.length||x.cat?{category:x.ids.length?x.ids.join('|'):x.cat}:{}),...(x.def?{default:x.def}:{})}];
    else if(x.kind==='change' && x.power && x.field) r=['modify',{name:x.power,...(x.ptype===undefined?{type:hbEl(x.power)?.type||'Power'}:x.ptype?{type:x.ptype}:{}),field:x.field,value:x.value||''}];
    else if(x.kind==='drop' && x.id) r=['drop',{name:x.id,type:x.type||hbEl(x.id)?.type||'Class Feature'}];
    else if(x.kind==='raw' && x.tag){ out.push([x.tag, {...x.attrs}]); continue; }
    else if(x.kind==='suggest' && x.id) r=['suggest',{name:x.id,type:x.type||hbEl(x.id)?.type||'Feat'}];
    else if(x.kind==='text' && x.name) r=['textstring',{name:x.name,...(x.condition?{condition:x.condition}:{}),value:x.value||''}];
    else if(x.kind==='pick' && x.type) r=['select',{type:x.type,number:String(x.number===0||x.number==='0'?0:(x.number||1)),...(x.cat?{category:x.cat}:{}),...(x.optional?{optional:'true'}:{})}];
    else if(x.kind==='weapon' && x.weapon) r=x.mode==='impl' ? ['modify',{name:x.weapon,type:'Weapon',field:'_ImplementEquiv',value:x.impl||'Wand'}]
      : ['modify',{name:x.weapon,type:'Weapon',field:'Damage','die-increase':String(x.steps||'1')}];
    if(r){ Object.assign(r[1], condAttrs(x, r[0]==='grant' || r[0]==='select')); out.push(r); }
  }
  return out.concat(f.keep);
}
// in words: when an effect applies ("from level 11 · only with Wolf Companion · in light armor or none")
function condText(x){
  const t=[];
  if(x.at>1) t.push('from level '+x.at);
  if(x.need) t.push((x.needNot?'only without ':'only with ')+(hbEl(x.need)?.name||x.need));
  if(x.untrained) t.push('only if untrained in '+x.untrained);
  if(x.wear){ const k=ARMOR_WHEN.find(([m,w])=>m===x.wear.mode && w===x.wear.what); t.push(k?k[2]:x.wear.mode+' '+x.wear.what); }
  if(x.wear2) t.push(x.wear2.mode+' '+x.wear2.what);
  if(x.reqMore?.length) t.push('also: '+x.reqMore.join(' and '));
  return t.join(' · ');
}
function featureEl(f, source, theme){
  const o=f.isNew ? {id:f.id, name:'', type:'Class Feature', source, cats:[], spec:{}} : clone(baseEl(f.id)||hbEl(f.id)||{id:f.id,type:'Class Feature',spec:{}});
  delete o.hb; delete o.hbMod; delete o.hbReplaces; delete o._cs;
  o.name=f.name; o.spec={...(o.spec||{})}; o.spec['Level']=String(f.level||1);
  if(f.short) o.spec['Short Description']=f.short; else delete o.spec['Short Description'];
  o.text=f.text; o.rules=featureRules(f);
  // the powers it gives, listed the way the original's features list them: the original builder prints a power with
  // no level (a class feature power) on the character sheet only when its feature lists it here
  const pw=f.effects.filter(x=>x.kind==='power' && x.id).map(x=>x.id);
  if(theme){ if(f.isNew ? pw.length : pw.join(',')!==(f.pw0||'')){ if(pw.length) o.spec['_DisplayPowers']=pw.join(','); else delete o.spec['_DisplayPowers']; } }
  else if(f.isNew || o.spec['_DisplayPowers']!==undefined){ if(pw.length){ o.spec['Powers']=pw.join(','); o.spec['_DisplayPowers']=pw.join(','); } else { if(/^ID_/.test(o.spec['Powers']||'')) delete o.spec['Powers']; delete o.spec['_DisplayPowers']; } }
  if(f.isNew) o.source=source;
  return o;
}

function classDraft(id){
  const cls=hbEl(id); if(!cls) return null;
  const gRule=(cls.rules||[]).find(([t,a])=>t==='grant'&&a.type==='Grants'), grants=gRule?hbEl(gRule[1].name):null;
  const d={id, isNew:!!cls.hb && !cls.hbReplaces, base:cls.hb && !cls.hbReplaces ? '' : id, name:cls.name,
    role:'', source:'', keys:hbSp(cls,'Key Abilities').split(',').map(s=>s.trim()).filter(Boolean),
    powerName:hbSp(cls,'Power Name'), short:hbSp(cls,'Short Description'), flavor:cls.flavor||'', text:cls.text||'',
    roleText:hbSp(cls,'Role').replace(/^[^.]*\.\s*/,''), sourceText:hbSp(cls,'Power Source').replace(/^[^.]*\.\s*/,''),
    hp1:0, hpLevel:0, surges:0, def:{Fortitude:0,Reflex:0,Will:0,AC:0}, skillCount:0, atWill:cls.hb && !cls.hbReplaces ? 2 : 0,
    psionic:false, gear:[], rituals:'', special:[], weaponsImpl:false, implGrants:[],
    sections:Object.fromEntries(CLASS_SECTIONS.map(([k])=>[k, hbSp(cls,k)])),
    classSkills:[], autoSkills:[], skillChoices:[], profs:[], features:[], fdefs:{}, builds:[], powers:[],
    grantsId:grants?grants.id:'', keep:{cls:[], grants:[]}, own:new Set([id])};
  if(grants) d.own.add(grants.id);
  for(const r of cls.rules||[]){
    const [t,a]=r;
    if(!CLASS_RULE(t,a)){ d.keep.cls.push(r); continue; }
    const v=parseInt(String(a.value||'').replace(/^\+/,''),10)||0;
    if(a.name==='_LEVEL-ONE-HPS') d.hp1=v; else if(a.name==='_PER-LEVEL-HPS') d.hpLevel=v; else if(a.name==='Healing Surges') d.surges=v;
    else if(/Class Bonus$/.test(a.name||'')) d.def[/^AC/.test(a.name)?'AC':a.name.split(' ')[0]]=v;
    else if(t==='select' && a.type==='Power' && a.name){ d.psionic=true; d.atWill++; }      // a psion's "First Augmented At-Will"
    else if(t==='select' && a.type==='Power'){ d.atWill=+a.number||2; d.atWillCat=a.category; }
    else if(t==='statadd' && a.name==='_WeaponsAsImplements') d.weaponsImpl=true;
    else if(t==='select' && a.type==='Skill Training'){
      const ids=String(a.category||'').split('|').map(x=>x.trim()).filter(Boolean);
      if(ids.length>1 && ids.every(x=>hbEl(x)?.type==='Skill Training')) d.skillChoices.push({number:(String(a.number).trim()==='0'?0:+a.number||1), ids});
      else if(a.category===id) d.skillCount=+a.number||0;
      else d.keep.cls.push(r);
    }
    else if(t==='grant' && a.type==='Skill Training') d.autoSkills.push(a.name);
    else if(t==='grant' && a.type==='Grants' && r!==gRule) d.keep.cls.push(r);
    else if(t==='textstring' && a.name==='_CLASSNAME') d.className=a.value;
    else if(t==='select' && a.type==='Build') d.hasBuildPick=true;
  }
  for(const r of grants?.rules||[]){
    const [t,a]=r;
    if(!GRANTS_RULE(t,a)){ d.keep.grants.push(r); continue; }
    if(a.type==='Role'){ if(d.role) d.roles2=[...(d.roles2||[]), a.name]; else d.role=a.name; } else if(a.type==='Power Source'){ if(d.source) d.sources2=[...(d.sources2||[]), a.name]; else d.source=a.name; }
    else if(a.type==='Proficiency') d.profs.push(a.name);
    else if(a.type==='Skill Training') d.autoSkills.push(a.name);
    else if(a.type==='Internal'){ if(a.name==='ID_INTERNAL_INTERNAL_PSIONIC_FIRST_CLASS') d.psionic=true; else if(a.name==='ID_INTERNAL_INTERNAL_AUGMENT_POWERS') d.psionic=true; else d.special.push(a.name); }
    // the class's implements, listed in an entry of their own (Wizard Implements): shown with the other proficiencies
    else if(a.type==='Grants'){ const ig=hbEl(a.name); const pr=(ig?.rules||[]).filter(([t2,a2])=>t2==='grant' && a2.type==='Proficiency').map(([,a2])=>a2.name);
      if(ig && pr.length===(ig.rules||[]).length){ d.implGrants.push({id:a.name, profs:pr}); d.profs.push(...pr.filter(x=>!d.profs.includes(x))); } else d.keep.grants.push(r); }
    else if(t==='statadd') d.gear.push({id:a.name.slice(8), qty:parseInt(String(a.value).replace('+',''),10)||1});
    else if(t==='textstring') d.rituals=a.value||'';
    else if(t==='grant') d.features.push({kind:'grant', id:a.name, level:+a.level||0, ...(a.level!==undefined?{rawLevel:a.level}:{})});
    else d.features.push({kind:'choose', number:(String(a.number).trim()==='0'?0:+a.number||1), ids:String(a.category).split('|').map(s=>s.trim()), rule:r});
  }
  // the class's other rules (a druid's beast form at-will pick), edited like a feature's
  d.clsMore=featureFrom({id:d.id, name:'', spec:{}, rules:d.keep.cls}); d.grMore=featureFrom({id:d.grantsId||d.id, name:'', spec:{}, rules:d.keep.grants});
  if(!d.role){ const m=hbSp(cls,'_RoleElement'); if(m) d.role=m; }
  if(!d.source){ const m=hbSp(cls,'_PowerSourceElement'); if(m) d.source=m; }
  // the features, and the features they give or offer (fighter talents, a pact's own features), at any depth
  const load=fid=>{ if(d.fdefs[fid]) return; const fe=hbEl(fid); if(!fe || fe.type!=='Class Feature') return;
    d.fdefs[fid]={...featureFrom(fe), isNew:!!fe.hb && !fe.hbReplaces}; if(fe.hb) d.own.add(fid);
    for(const x of d.fdefs[fid].effects) for(const sub of subFeatures(x)) load(sub); };
  for(const row of d.features) for(const fid of row.kind==='grant'?[row.id]:row.ids) load(fid);
  d.classSkills=typeEls('Skill Training').filter(e=>(e.cats||[]).includes(id)).map(e=>e.id);
  d.builds=typeEls('Build').filter(e=>(e.cats||[]).includes(id)).sort(byName).map(e=>{ if(e.hb) d.own.add(e.id);
    return {id:e.id, isNew:!!e.hb && !e.hbReplaces, name:e.name, keys:hbSp(e,'Key Abilities'), text:e.text||'', el:e}; });
  d.powers=typeEls('Power').filter(e=>(e.cats||[]).includes(id)).map(e=>e.id);
  // the class's own homebrew powers (made in a pack for it) can be edited here
  d.pdefs={};
  for(const e of typeEls('Power')) if(e.hb && !e.hbReplaces && hbSp(e,'Class')===id && !d.powers.includes(e.id)) d.powers.push(e.id);
  for(const pid of d.powers){ const e=hbEl(pid); if(e && e.hb && !e.hbReplaces && hbSp(e,'Class')===id){ d.pdefs[pid]=powerFrom(e); d.own.add(pid); } }
  d.countsAs=typeEls('CountsAsClass').filter(e=>hbSp(e,'_SupportsID')===id).map(e=>e.id);
  for(const c of d.countsAs) if(hbEl(c)?.hb) d.own.add(c);
  d.orig=JSON.stringify(draftCore(d));
  for(const f of Object.values(d.fdefs)) f.orig=JSON.stringify(featCore(f));
  for(const b of d.builds) b.orig=JSON.stringify([b.name,b.keys,b.text]);
  return d;
}
const draftCore=d=>({name:d.name,role:d.role,source:d.source,keys:d.keys,powerName:d.powerName,short:d.short,flavor:d.flavor,text:d.text,roleText:d.roleText,
  sourceText:d.sourceText,hp1:d.hp1,hpLevel:d.hpLevel,surges:d.surges,def:d.def,skillCount:d.skillCount,atWill:d.atWill,classSkills:[...d.classSkills].sort(),skillChoices:d.skillChoices||[],
  autoSkills:d.autoSkills,profs:[...d.profs].sort(),features:d.features.map(r=>({...r,rule:undefined})),builds:d.builds.map(b=>b.name),
  psionic:!!d.psionic,gear:d.gear||[],rituals:d.rituals||'',special:d.special||[],weaponsImpl:!!d.weaponsImpl,sections:d.sections||{}});
const featCore=f=>({name:f.name,level:f.level,short:f.short,text:f.text,effects:f.effects.map(x=>({...x,rule:undefined}))});

function newClassDraft(pack, name, fromId){
  const id=uniqueId('ID_HB_'+slugId(pack.name)+'_CLASS_'+slugId(name));
  let d;
  if(fromId){
    d=classDraft(fromId);
    // a copy: the official features stay as they are (shared), the builds become the copy's own
    d.builds=d.builds.map(b=>({...b, isNew:true, id:uniqueId(id.replace('_CLASS_','_BUILD_')+'_'+slugId(b.name)), orig:''}));
    d.countsAs=[]; d.pdefs={};   // a copy shares the original's powers; powers made for it are its own
  } else {
    d={role:'ID_FMP_ROLE_3', source:'ID_FMP_POWER_SOURCE_1', keys:['Strength'], powerName:'Exploits', short:'', flavor:'', text:'',
      roleText:'', sourceText:'', hp1:12, hpLevel:5, surges:7, def:{Fortitude:0,Reflex:0,Will:0,AC:0}, skillCount:3, atWill:2, skillChoices:[],
      pdefs:{}, classSkills:[], autoSkills:[], profs:['ID_INTERNAL_PROFICIENCY_ARMOR_PROFICIENCY_(CLOTH)','ID_INTERNAL_PROFICIENCY_ARMOR_PROFICIENCY_(LEATHER)',
      'ID_INTERNAL_PROFICIENCY_SIMPLE_MELEE','ID_INTERNAL_PROFICIENCY_SIMPLE_RANGED'], features:[], fdefs:{}, builds:[], powers:[], keep:{cls:[],grants:[]}, countsAs:[],
      psionic:false, gear:[], rituals:'', special:[], weaponsImpl:false, implGrants:[], sections:{}, clsMore:{id:'',name:'',effects:[],keep:[]}, grMore:{id:'',name:'',effects:[],keep:[]}};
  }
  Object.assign(d,{id, isNew:true, base:'', name, grantsId:id.replace('_CLASS_','_GRANTS_'), own:new Set([id, id.replace('_CLASS_','_GRANTS_'), id.replace('_CLASS_','_COUNTSAS_')]), orig:''});
  for(const b of d.builds) d.own.add(b.id);
  return d;
}
// an ID nothing else uses (in the rules, or in packs still being edited)
function uniqueId(stem){
  let id=stem, n=2;
  const used=x=>hbEl(x) || Workshop.packs.some(p=>p.els.some(o=>o.id===x)) || Workshop.taken.has(x);
  while(used(id)) id=stem+'_'+(n++);
  Workshop.taken.add(id);
  return id;
}

/* the pack's entries for a class draft: its own entries, and the changes to official ones */
function draftEntries(d, source){
  const els=[], ops=[];
  const role=hbEl(d.role), src=hbEl(d.source);
  const skillName=id=>{ const e=hbEl(id); if(!e) return ''; const sk=typeEls('Skill').find(s=>s.name===e.name); const k=sk?hbSp(sk,'Key Ability'):''; return e.name+(k?' ('+(ABBR[k]||k.slice(0,3))+')':''); };
  const profsOf=re=>d.profs.map(hbEl).filter(e=>e && re.test(e.id)).map(profWord);
  // the details the original shows for a class, made from the draft (for an official class only those that changed)
  const specOf=x=>{
    const defs=DEFENSES.filter(k=>x.def[k]).map(k=>(x.def[k]>0?'+':'')+x.def[k]+' '+k);
    return {
      'Key Abilities':x.keys.join(', '),
      'Armor Proficiencies':profsOf(/ARMOR|SHIELD/).join(', '),
      'Weapon Proficiencies':profsOf(/_SIMPLE_|_MILITARY_|WEAPON_PROFICIENCY|WEAPON_GROUP|SUPERIOR/).join(', '),
      'Implements':profsOf(/IMPLEMENT_PROFICIENCY/).join(', '),
      'Bonus to Defense':defs.join(', '),
      'Hit Points at 1st Level':x.hp1+' + Constitution score',
      'Hit Points per Level Gained':String(x.hpLevel),
      'Healing Surges':x.surges+' + Constitution modifier',
      'Trained Skills':[x.autoSkills.length?x.autoSkills.map(i=>hbEl(i)?.name).filter(Boolean).join(', ')+'.':'',
        ...(x.skillChoices||[]).map(c=>c.ids.map(i=>hbEl(i)?.name).filter(Boolean).join(' or ')+' (your choice).'),
        'From the class skills list below, choose '+x.skillCount+((x.autoSkills.length||(x.skillChoices||[]).length)?' more':'')+' trained skills at 1st level.'].filter(Boolean).join(' '),
      'Class Skills':x.classSkills.map(skillName).filter(Boolean).sort().join(', '),
      'Build Options':x.builds.map(b=>b.name).join(', '),
      '_PARSED_CLASS_FEATURE':x.features.flatMap(r=>r.kind==='grant'?[r.id]:r.ids).map(i=>d.fdefs[i]?.name||hbEl(i)?.name).filter(Boolean).join(', '),
      'Role':(role?.name||'')+'.'+(x.roleText?' '+x.roleText:''),
      'Power Source':(src?.name||'')+'.'+(x.sourceText?' '+x.sourceText:''),
      '_RoleElement':x.role, '_PowerSourceElement':x.source,
      'Power Name':x.powerName, 'Short Description':x.short,
      ...Object.fromEntries(CLASS_SECTIONS.map(([k])=>[k, (x.sections||{})[k]||''])),
    };
  };
  const cur=specOf(d);
  const was=d.isNew ? null : (()=>{ try{ return specOf({...JSON.parse(d.orig), builds:JSON.parse(d.orig).builds.map(n=>({name:n})), features:JSON.parse(d.orig).features}); }catch(e){ return null; } })();
  // the class
  const cls=d.isNew ? {id:d.id, name:'', type:'Class', source, spec:{}} : clone(baseEl(d.id)||hbEl(d.id));
  delete cls.hb; delete cls.hbMod; delete cls.hbReplaces; delete cls._cs;
  // its details as they are now (with this pack's earlier changes); only what the draft changed since is written again
  cls.name=d.name; cls.flavor=d.flavor; cls.text=d.text; cls.spec={...(hbEl(d.id)?.spec||cls.spec||{})};
  for(const [k,v] of Object.entries(cur)) if(d.isNew || !was || was[k]!==v){ if(v && v!=='.') cls.spec[k]=v; else delete cls.spec[k]; }
  const defRules=DEFENSES.filter(k=>d.def[k]).map(k=>['statadd',{name:k==='AC'?'AC Class Bonus':k+' Defense Class Bonus',value:(d.def[k]>0?'+':'')+d.def[k]}]);
  cls.rules=[
    ['grant',{name:d.grantsId,type:'Grants'}],
    ...(d.psionic ? Array.from({length:d.atWill},(_,i)=>['select',{type:'Power',name:(['First','Second','Third','Fourth'][i]||('Number '+(i+1)))+' Augmented At-Will',number:'1',category:'$$CLASS,at-will,1'}])
      : d.atWill>0 ? [['select',{type:'Power',number:String(d.atWill),category:d.atWillCat||'$$CLASS,at-will,1'}]] : []),
    ['textstring',{name:'_CLASSNAME',value:d.className && d.className.split(/[\s()]+/).includes(d.id) ? d.className : d.id}],
    ['statadd',{name:'_LEVEL-ONE-HPS',value:'+'+d.hp1}],
    ['statadd',{name:'_PER-LEVEL-HPS',value:'+'+d.hpLevel}],
    ['statadd',{name:'Healing Surges',value:'+'+d.surges}],
    ...(d.isNew || d.hasBuildPick || d.builds.length ? [['select',{type:'Build',number:'1',category:'$$CLASS',optional:'true'}]] : []),
    ...defRules,
    ...(d.skillCount>0 || d.isNew ? [['select',{type:'Skill Training',number:String(d.skillCount),category:d.id}]] : []),
    ...(d.skillChoices||[]).filter(c=>c.ids.length).map(c=>['select',{type:'Skill Training',number:String(c.number||1),category:c.ids.join('|')}]),
    ...d.autoSkills.map(s=>['grant',{name:s,type:'Skill Training'}]),
    ...(d.weaponsImpl?[['statadd',{name:'_WeaponsAsImplements',value:'+1'}]]:[]),
    ...(d.clsMore?featureRules(d.clsMore):d.keep.cls)];
  els.push(cls);
  // what the class grants: role, power source, proficiencies, class features
  const g=d.isNew||!d.grantsId ? {id:d.grantsId, name:d.name, type:'Grants', source, spec:{'_SupportsID':d.id}} : clone(baseEl(d.grantsId)||hbEl(d.grantsId));
  delete g.hb; delete g.hbMod; delete g.hbReplaces; delete g._cs;
  g.rules=[
    ...(d.role?[['grant',{name:d.role,type:'Role'}]]:[]), ...(d.roles2||[]).map(x=>['grant',{name:x,type:'Role'}]),
    ...(d.source?[['grant',{name:d.source,type:'Power Source'}]]:[]), ...(d.sources2||[]).map(x=>['grant',{name:x,type:'Power Source'}]),
    // an implements entry stays while all its proficiencies are still the class's; the rest are listed here
    ...d.implGrants.filter(g=>g.profs.every(x=>d.profs.includes(x))).map(g=>['grant',{name:g.id,type:'Grants'}]),
    ...d.profs.filter(p=>!d.implGrants.some(g=>g.profs.includes(p) && g.profs.every(x=>d.profs.includes(x)))).map(p=>['grant',{name:p,type:'Proficiency'}]),
    ...(d.psionic?[['grant',{name:'ID_INTERNAL_INTERNAL_PSIONIC_FIRST_CLASS',type:'Internal'}],
      ...(usedFeatures(d).some(f=>f.effects.some(x=>x.kind==='special' && x.id==='ID_INTERNAL_INTERNAL_AUGMENT_POWERS')) ? [] : [['grant',{name:'ID_INTERNAL_INTERNAL_AUGMENT_POWERS',type:'Internal'}]])]:[]),
    ...d.special.map(id=>['grant',{name:id,type:'Internal'}]),
    ...d.gear.filter(x=>x.id).map(x=>['statadd',{name:'FREEBEE:'+x.id,value:'+'+(x.qty||1)}]),
    ...(d.rituals?[['textstring',{name:'Free Rituals',value:d.rituals}]]:[]),
    ...d.features.map(r=>r.kind==='grant'
      ? ['grant',{name:r.id,type:'Class Feature',...(r.level>1?{level:String(r.level)}:r.rawLevel!==undefined&&!(r.level>1)&&+r.rawLevel<=1?{level:String(r.rawLevel)}:{})}]
      : (r.rule && JSON.stringify(String(r.rule[1].category).split('|').map(s=>s.trim()))===JSON.stringify(r.ids) && (+r.rule[1].number||1)===r.number
          ? r.rule : ['select',{type:'Class Feature',number:String(r.number),category:r.ids.join('|')}])),
    ...(d.grMore?featureRules(d.grMore):d.keep.grants)];
  els.push(g);
  els.push(...expertiseFor(d, source));
  if(d.isNew) els.push({id:d.id.replace('_CLASS_','_COUNTSAS_'), name:d.name, type:'CountsAsClass', source, spec:{'_SupportsID':d.id}, text:'You count as a '+d.name.toLowerCase()+' for meeting prerequisites.'});
  // class features: new ones, and official ones that were changed
  for(const f of usedFeatures(d)) if(f.isNew || JSON.stringify(featCore(f))!==f.orig) els.push(featureEl(f, source));
  // builds
  for(const b of d.builds) if(b.isNew || JSON.stringify([b.name,b.keys,b.text])!==b.orig){
    const o=b.isNew ? {id:b.id, name:'', type:'Build', source, cats:[d.id], spec:{}} : clone(baseEl(b.id)||b.el);
    delete o.hb; delete o.hbMod; delete o.hbReplaces; delete o._cs;
    o.name=b.name; o.text=b.text; o.spec={...(o.spec||{}), 'Key Abilities':b.keys, 'Class':d.id}; els.push(o);
  }
  if(!d.isNew){ const origBuilds=typeEls('Build').filter(e=>!e.hb && (baseEl(e.id)?.cats||[]).includes(d.id)).map(e=>e.id);
    for(const id of origBuilds) if(!d.builds.some(b=>b.id===id)) ops.push({op:'delete', id}); }
  // class skills and powers: listed in the skill's or power's own categories, as in the original
  const listOps=(ids, type)=>{
    const want=new Set(ids), had=new Set(d.isNew ? [] : (RULES.base||[]).filter(o=>o.type===type && (o.cats||[]).includes(d.id)).map(o=>o.id));
    for(const id of [...want].sort()) if(!had.has(id)) ops.push({op:'append', id, cats:[d.id]});   // sorted: a save without changes writes the same file
    // taking a class off an entry: as CBLoader does it, its categories are cleared and the others put back
    for(const id of [...had].sort()) if(!want.has(id)){ const cats=(baseEl(id)?.cats||[]).filter(c=>c!==d.id);
      ops.push({op:'remove', id, clearCats:true, spec:{}}, {op:'append', id, cats, taking:d.id}); }
  };
  listOps(d.classSkills,'Skill Training');
  // powers made for this class are written whole (their categories list the class); the others are listed
  const givers=pid=>usedFeatures(d).filter(f=>f.effects.some(x=>x.kind==='power' && x.id===pid)).map(f=>f.id);
  // (in ID order, so the file is the same however the draft was put together)
  for(const p of Object.values(d.pdefs||{}).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)) if(d.powers.includes(p.id)) els.push(powerEl(p, {id:d.id, name:d.name}, source, givers(p.id)));
  listOps(d.powers.filter(id=>!(d.pdefs||{})[id]),'Power');
  return {els, ops};
}


/* ---------- backgrounds ----------
   draft: {id, isNew, name, kind ("type": Geography, Racial…), campaign, short, ck (Common Knowledge), benefit (its text),
     pre (prerequisite), skills[] / langs[] (Background Association IDs), options[] (its own benefits to choose from:
     Background Choice entries), optRule (the original pick of them), more (other rules, as a feature's), orig } */
const BG_SPEC={kind:'type', ck:'Common Knowledge', benefit:'Benefit', short:'Short Description', campaign:'Campaign'};
const isSkillAssoc=e=>SKILLS.includes(e.name);
const BG_BENEFIT='ID_INTERNAL_INTERNAL_BACKGROUND_BENEFIT';     // the general benefit list (+2 to a skill, a language...)
function bgOptionFrom(e){ const f=featureFrom(e); return {id:e.id, isNew:!!e.hb && !e.hbReplaces, name:e.name, pre:e.pre||'', text:e.text||'', effects:f.effects, keep:f.keep, cats:e.cats||[]}; }
const bgOptCore=o=>JSON.stringify([o.name,o.pre,o.text,o.effects.map(x=>({...x,rule:undefined}))]);
function bgDraft(id){
  const e=hbEl(id); if(!e) return null;
  const typeKey=Object.keys(e.spec||{}).find(k=>/^type$/i.test(k))||'type';
  const d={id, isNew:!!e.hb && !e.hbReplaces, name:e.name, typeKey, pre:e.pre||'', skills:[], langs:[], options:[], optRule:null, pdefs:{}, fdefs:{}, own:new Set([id])};
  for(const [k,s] of Object.entries(BG_SPEC)) d[k]=k==='kind' ? hbSp(e,typeKey) : hbSp(e,s);
  d.skillsText=hbSp(e,'Associated Skills'); d.langsText=hbSp(e,'Associated Languages');
  const rest=[];
  for(const r of e.rules||[]){ const [t,a]=r;
    if(t==='grant' && a.type==='Background Association' && Object.keys(a).length===2){ const ae=hbEl(a.name); (ae && isSkillAssoc(ae) ? d.skills : d.langs).push(a.name); }
    // its own options: the pick of them names the background (by ID, or by its name, the official name if it was renamed)
    else if(t==='select' && a.type==='Background Choice' && !d.optRule && (a.category===id || a.category===e.name || a.category===baseEl(id)?.name || typeEls('Background Choice').some(o=>(o.cats||[]).includes(a.category) && hbSp(o,'_SupportsID')===id))) d.optRule=r;
    else rest.push(r); }
  // its options: listed under the pick's group, the background's ID, or made for it ("_SupportsID")
  if(d.optRule){ const c=d.optRule[1].category; d.options=typeEls('Background Choice').filter(o=>(o.cats||[]).includes(c) || (o.cats||[]).includes(id) || hbSp(o,'_SupportsID')===id).map(bgOptionFrom); }
  for(const o of d.options) if(o.isNew) d.own.add(o.id);
  // a benefit of its own, picked instead of a skill or language: an entry in the general benefit list, only for it
  const sb=typeEls('Background Choice').find(o=>(o.cats||[]).includes(BG_BENEFIT) && (hbSp(o,'_SupportsID')===id || String(o.pre||'').trim()===id));
  d.special=sb ? bgOptionFrom(sb) : null; if(d.special){ d.special.orig=bgOptCore(d.special); if(d.special.isNew) d.own.add(sb.id); }
  d.more=featureFrom({id, name:'', spec:{}, rules:rest});
  d.orig=JSON.stringify(bgCore(d)); for(const o of d.options) o.orig=bgOptCore(o);
  return d;
}
const bgCore=d=>({name:d.name,kind:d.kind,campaign:d.campaign,short:d.short,ck:d.ck,benefit:d.benefit,pre:d.pre,skills:d.skills,langs:d.langs,skillsText:d.skillsText,langsText:d.langsText,options:d.options.map(o=>o.id),special:d.special?bgOptCore(d.special):'',more:d.more.effects.map(x=>({...x,rule:undefined}))});
function newBgDraft(pack, name, fromId){
  const id=uniqueId('ID_HB_'+slugId(pack.name)+'_BACKGROUND_'+slugId(name));
  const d=fromId ? bgDraft(fromId) : {typeKey:'type', kind:'Occupation', campaign:'General', short:'', ck:'', benefit:'', pre:'', skills:[], langs:[], skillsText:'', langsText:'', options:[], optRule:null, pdefs:{}, fdefs:{}, more:{id,name:'',effects:[],keep:[]}};
  // a copy's own options are copies too
  if(fromId) d.options=d.options.map(o=>({...o, isNew:true, id:uniqueId(id.replace('_BACKGROUND_','_BGCHOICE_')+'_'+slugId(o.name)), orig:''}));
  if(fromId && d.special) d.special={...d.special, isNew:true, name:name+' Benefit', id:uniqueId(id.replace('_BACKGROUND_','_BGBENEFIT_')), orig:''};
  if(!fromId) d.special=null;
  Object.assign(d,{id, isNew:true, name, optRule:null, own:new Set([id, ...d.options.map(o=>o.id), ...(d.special?[d.special.id]:[])]), orig:''});
  return d;
}
function bgEntries(d, source){
  const base=d.isNew ? null : (baseEl(d.id)||hbEl(d.id));
  const o=d.isNew ? {id:d.id, name:'', type:'Background', source, spec:{}} : clone(hbEl(d.id)||base);
  delete o.hb; delete o.hbMod; delete o.hbReplaces; delete o._cs;
  o.name=d.name; o.spec={...(o.spec||{})};
  const was=d.orig ? JSON.parse(d.orig) : null;
  for(const [k,s] of Object.entries(BG_SPEC)){ const key=k==='kind'?d.typeKey:s; if(d.isNew || !was || was[k]!==d[k]){ if(String(d[k]||'').trim() || k==='ck' || key in o.spec) o.spec[key]=d[k]||''; } }
  const names=ids=>ids.map(i=>hbEl(i)?.name).filter(Boolean).join(', ');
  // the associated skills and languages in words (usually the ticked ones; some say "any one other than Abyssal")
  for(const [k,key] of [['skillsText','Associated Skills'],['langsText','Associated Languages']])
    if(d.isNew || !was || was[k]!==d[k]){ const v=d[k]??''; if(v || key in o.spec) o.spec[key]=v; }
  if(d.pre) o.pre=d.pre; else delete o.pre;
  // the options' group: as the original has it, unless that is the name and the name changed (then the ID, which the
  // official options carry too, so they stay with it)
  const oc=d.optRule ? d.optRule[1].category : '', renamed=d.optRule && oc!==d.id && !/^ID_/.test(oc) && oc!==d.name;
  const optCat=d.optRule && !renamed ? oc : d.id;
  o.rules=[...[...d.skills,...d.langs].map(a=>['grant',{name:a,type:'Background Association'}]),
    ...(d.options.length ? [d.optRule && !renamed && +d.optRule[1].number===1 ? d.optRule : ['select',{type:'Background Choice',number:'1',category:optCat}]] : []),
    ...featureRules(d.more)];
  const els=[o]; els.ops=[];
  for(const x of d.options){
    // an official option this background only borrows: listed under it (AppendNodes), the option itself left as it is
    const official=!x.isNew && !/^ID_HB_/.test(x.id) && baseEl(x.id);
    if(official && bgOptCore(x)===bgOptCore(bgOptionFrom(baseEl(x.id)))){ if(!(baseEl(x.id).cats||[]).includes(optCat)) els.ops.push({op:'append', id:x.id, cats:[optCat]}); continue; }
    if(!(x.isNew || bgOptCore(x)!==x.orig || !(x.cats||[]).includes(optCat) && !(hbEl(x.id)?.cats||[]).includes(optCat))) continue;
    const c=x.isNew ? {id:x.id, name:'', type:'Background Choice', source, cats:[optCat], spec:{'_SupportsID':d.id}} : clone(hbEl(x.id)||baseEl(x.id));
    delete c.hb; delete c.hbMod; delete c.hbReplaces; delete c._cs;
    c.name=x.name; c.text=x.text; if(x.pre) c.pre=x.pre; else delete c.pre; c.rules=featureRules(x);
    if(!(c.cats||[]).includes(optCat)) c.cats=[...(c.cats||[]), optCat];
    els.push(c);
  }
  const sp=d.special;
  if(sp && (sp.isNew || bgOptCore(sp)!==sp.orig)){
    const c=sp.isNew ? {id:sp.id, name:'', type:'Background Choice', source, cats:[BG_BENEFIT], spec:{'_SupportsID':d.id, '_IsBenefit':'1'}} : clone(hbEl(sp.id)||baseEl(sp.id));
    delete c.hb; delete c.hbMod; delete c.hbReplaces; delete c._cs;
    c.name=sp.name; c.text=sp.text; c.pre=d.id; c.rules=featureRules(sp);
    els.push(c);
  }
  return els;
}


/* ---------- feats ----------
   draft: {id, isNew, name, tier, ppre (prerequisites as shown), pre (as the builders check them), short, special,
     group (the "type": Divinity, Multiclass…), assoc (Associated Powers, as shown), flavor, text, cats[], more (rules, as a
     feature's), orig } */
const FEAT_SPEC={tier:'Tier', short:'Short Description', special:'Special', assoc:'Associated Powers'};
const FEAT_TIERS=['Heroic','Paragon','Epic'];
const featPreFrom=(ppre,tier)=>[ppre, tier && tier!=='Heroic' ? tier+' Tier' : ''].filter(Boolean).join('; ');
function featDraft(id){
  const e=hbEl(id); if(!e) return null;
  const typeKey=Object.keys(e.spec||{}).find(k=>/^type$/i.test(k))||'type';
  const d={id, isNew:!!e.hb && !e.hbReplaces, name:e.name, typeKey, group:hbSp(e,typeKey), pre:String(e.pre||'').trim(), ppre:String(e.ppre||'').trim(),
    hasPre:e.pre!==undefined, hasPpre:e.ppre!==undefined, flavor:e.flavor||'', text:e.text||'', cats:[...(e.cats||[])], pdefs:{}, fdefs:{}, own:new Set([id])};
  for(const [k,s] of Object.entries(FEAT_SPEC)) d[k]=hbSp(e,s);
  d.more=featureFrom({id, name:'', spec:{}, rules:e.rules||[]});
  d.pw0=d.more.effects.filter(x=>x.kind==='power' && x.id).map(x=>x.id).join(',');
  d.orig=JSON.stringify(featDraftCore(d));
  return d;
}
const featDraftCore=d=>({name:d.name,group:d.group,pre:d.pre,ppre:d.ppre,flavor:d.flavor,text:d.text,cats:d.cats,tier:d.tier,short:d.short,special:d.special,assoc:d.assoc,more:d.more.effects.map(x=>({...x,rule:undefined}))});
function newFeatDraft(pack, name, fromId){
  const id=uniqueId('ID_HB_'+slugId(pack.name)+'_FEAT_'+slugId(name));
  const d=fromId ? featDraft(fromId) : {typeKey:'type', group:'', pre:'', ppre:'', hasPre:false, hasPpre:false, flavor:'', text:'', cats:[], tier:'Heroic', short:'', special:'', assoc:'', pdefs:{}, fdefs:{}, more:{id,name:'',effects:[],keep:[]}};
  Object.assign(d,{id, isNew:true, name, own:new Set([id]), orig:''});
  return d;
}
function featEntries(d, source){
  const o=d.isNew ? {id:d.id, name:'', type:'Feat', source, spec:{}} : clone(hbEl(d.id)||baseEl(d.id));
  delete o.hb; delete o.hbMod; delete o.hbReplaces; delete o._cs;
  const was=d.orig ? JSON.parse(d.orig) : null, ch=k=>d.isNew || !was || JSON.stringify(was[k])!==JSON.stringify(d[k]);
  o.name=d.name; o.spec={...(o.spec||{})};
  for(const [k,s] of Object.entries(FEAT_SPEC)) if(ch(k)){ if(String(d[k]||'').trim() || s in o.spec) o.spec[s]=d[k]||''; }
  if(ch('group')){ if(d.group || d.typeKey in o.spec) o.spec[d.typeKey]=d.group||''; }
  if(ch('ppre')){ if(d.ppre || d.hasPpre) o.ppre=d.ppre; else delete o.ppre; }
  if(ch('pre')){ if(d.pre || d.hasPre) o.pre=d.pre; else delete o.pre; }
  if(ch('flavor')){ if(d.flavor) o.flavor=d.flavor; else delete o.flavor; }
  if(ch('text')) o.text=d.text;
  if(ch('cats')){ if(d.cats.length) o.cats=[...d.cats]; else delete o.cats; }
  o.rules=featureRules(d.more);
  // the powers it gives, listed as the original's feats list them (the original builder prints them on the sheet)
  const pw=d.more.effects.filter(x=>x.kind==='power' && x.id).map(x=>x.id);
  if(d.isNew || pw.join(',')!==(d.pw0||'')){ if(pw.length) o.spec['_DisplayPowers']=pw.join(','); else delete o.spec['_DisplayPowers']; }
  return [o];
}

// the prerequisites as the builders read them: filled in from the ones players read, so folded away
const preAdv=(field, open)=>el('details',{class:'wsfield full wspmore',open}, el('summary',{text:'Prerequisites as the builders read them (advanced)'}),
  field, el('small',{class:'muted',text:'Players see the prerequisites above; the builders check these. They are filled in for you; change them only for something the builders can\'t read from the wording.'}));
/* ---------- themes, paragon paths and epic destinies ----------
   draft: {id, kind, isNew, name, pre (as the builders check it), ppre (as shown), flavor, text, imm (an epic destiny's
     Immortality), rows [{id, level}] (its features), utils [] (a theme's utility powers, picked at the utility levels),
     gpowers [{id, level}] (a path's or destiny's powers, given at their level), more (other rules), fdefs/pdefs (features
     and powers being edited)}.
   A theme power has no class, is open to all ("Any Class"), and needs the theme; a path's or destiny's power is listed
   under it (its category) and needs it. */
const PATH_KINDS={
  'Theme':{label:'theme', plural:'Themes', slug:'THEME', feats:[1,5,10],
    help:'What the theme gives, by level. Official themes give a power at level 1 (under "What it does", "Gives a power"), and a benefit at levels 5 and 10.'},
  'Paragon Path':{label:'paragon path', plural:'Paragon paths', slug:'PARAGON_PATH', feats:[11,11,16], pre:'Fighter class',
    powers:[[11,'Attack','Encounter'],[12,'Utility','Daily'],[20,'Attack','Daily']],
    help:'What the path gives, by level. Official paths give two features at 11th level and one at 16th.'},
  'Epic Destiny':{label:'epic destiny', plural:'Epic destinies', slug:'EPIC_DESTINY', feats:[21,24,30], pre:'21st level',
    powers:[[26,'Utility','Daily']],
    help:'What the destiny gives, by level. Official destinies give features at 21st, 24th and 30th level.'}};
const pathKind=d=>PATH_KINDS[d.kind||'Theme'];
const isPathPower=(e,d)=>!!e && (d.kind==='Theme' ? isThemePower(e) : (e.cats||[]).includes(d.id) || String(e.pre||'').trim()===d.name);
function themeDraft(id){
  const e=hbEl(id); if(!e || !PATH_KINDS[e.type]) return null;
  const d={id, kind:e.type, isNew:!!e.hb && !e.hbReplaces, name:e.name, pre:String(e.pre||'').trim(), ppre:String(e.ppre||'').trim(), hasPre:e.pre!==undefined, hasPpre:e.ppre!==undefined,
    flavor:e.flavor||'', text:e.text||'', imm:hbSp(e,'Immortality'), rows:[], utils:[], gpowers:[], fdefs:{}, pdefs:{}, powers:[], own:new Set([id]), keys:['Strength']};
  const rest=[], plain=a=>Object.keys(a).every(k=>k==='name'||k==='type'||k==='level');
  for(const r of e.rules||[]){ const [t,a]=r;
    if(t==='grant' && a.type==='Class Feature' && plain(a) && hbEl(a.name)){ d.rows.push({id:a.name, level:+a.level||1, ...(a.level!==undefined && +a.level<=1?{lv1:true}:{})}); continue; }
    if(d.kind!=='Theme' && t==='grant' && a.type==='Power' && plain(a) && hbEl(a.name)){ d.gpowers.push({id:a.name, level:+a.level||0}); continue; }
    rest.push(r); }
  for(const r of d.rows){ const fe=hbEl(r.id); d.fdefs[r.id]={...featureFrom(fe), isNew:!!fe.hb && !fe.hbReplaces}; d.fdefs[r.id].pw0=d.fdefs[r.id].effects.filter(x=>x.kind==='power' && x.id).map(x=>x.id).join(','); d.fdefs[r.id].level=r.level; d.fdefs[r.id].orig=JSON.stringify(featCore(d.fdefs[r.id])); if(fe.hb && !fe.hbReplaces) d.own.add(r.id); }
  if(d.kind==='Theme') d.utils=hbSp(e,'_DisplayPowers').split(',').map(x=>x.trim()).filter(x=>hbEl(x));
  for(const u of [...d.utils, ...d.gpowers.map(g=>g.id)]) if(hbEl(u).hb && !hbEl(u).hbReplaces) d.own.add(u);
  d.more=featureFrom({id, name:'', spec:{}, rules:rest});
  d.orig=JSON.stringify(themeCore(d));
  return d;
}
const themeCore=d=>({name:d.name,pre:d.pre,ppre:d.ppre,flavor:d.flavor,text:d.text,imm:d.imm||'',rows:d.rows.map(r=>[r.id,+r.level||1]),utils:d.utils,
  gpowers:(d.gpowers||[]).map(g=>[g.id,+g.level||0]),more:d.more.effects.map(x=>({...x,rule:undefined}))});
function newThemeDraft(pack, name, fromId, kind='Theme'){
  if(fromId) kind=hbEl(fromId).type;
  const id=uniqueId('ID_HB_'+slugId(pack.name)+'_'+PATH_KINDS[kind].slug+'_'+slugId(name));
  const pre='';   // no prerequisites to start with: the placeholder shows the usual kind
  const d=fromId ? themeDraft(fromId) : {kind, pre, ppre:pre, hasPre:!!pre, hasPpre:!!pre, flavor:'', text:'', imm:'', rows:[], utils:[], gpowers:[], fdefs:{}, pdefs:{}, powers:[], keys:['Strength'], more:{id,name:'',effects:[],keep:[]}};
  Object.assign(d,{id, isNew:true, name, own:new Set([id]), orig:''});
  if(fromId){ if(d.pre===String(hbEl(fromId).name).trim()) d.pre=name; if(d.ppre===String(hbEl(fromId).name).trim()) d.ppre=name; }
  return d;
}
function themeEntries(d, source){
  const K=d.kind||'Theme';
  const o=d.isNew ? {id:d.id, name:'', type:K, source, spec:{}} : clone(hbEl(d.id)||baseEl(d.id));
  delete o.hb; delete o.hbMod; delete o.hbReplaces; delete o._cs;
  const was=d.orig ? JSON.parse(d.orig) : null, now=themeCore(d), ch=k=>d.isNew || !was || JSON.stringify(was[k])!==JSON.stringify(now[k]);
  o.name=d.name; o.spec={...(o.spec||{})};
  if(ch('ppre')){ if(d.ppre || d.hasPpre) o.ppre=d.ppre; else delete o.ppre; }
  if(ch('pre')){ if(d.pre || d.hasPre) o.pre=d.pre; else delete o.pre; }
  if(ch('flavor')){ if(d.flavor) o.flavor=d.flavor; else delete o.flavor; }
  if(ch('text')) o.text=d.text;
  if(K==='Epic Destiny' && ch('imm')){ if(d.imm) o.spec['Immortality']=d.imm; else delete o.spec['Immortality']; }
  if(ch('rows')||ch('more')||ch('gpowers')) o.rules=[...d.rows.map(r=>['grant',{name:r.id,type:'Class Feature',...(+r.level>1 || r.lv1 || K!=='Theme'?{level:String(+r.level||1)}:{})}]),
    ...(d.gpowers||[]).map(g=>['grant',{name:g.id,type:'Power',...(+g.level?{level:String(+g.level)}:{})}]), ...featureRules(d.more)];
  const ids=x=>JSON.stringify((x||[]).map(r=>r[0]).sort());
  const byLevel=xs=>[...xs].sort((a,b)=>(+a.level||1)-(+b.level||1)).map(r=>r.id);
  const list=(key, items, wasItems, sep)=>{ const old=String(o.spec[key]||'').split(',').map(x=>x.trim()).filter(Boolean), gone=new Set((wasItems||[]).map(r=>r[0])), nowIds=byLevel(items);
    const out=[...old.filter(x=>nowIds.includes(x) || !gone.has(x)), ...nowIds.filter(x=>!old.includes(x))];
    const raw=String(o.spec[key]||''); if(raw.includes(',')) sep=/,\s/.test(raw)?', ':',';
    if(out.length) o.spec[key]=out.join(sep); else delete o.spec[key]; };
  if(d.isNew || !was || ids(was.rows)!==ids(now.rows)) list(K==='Theme'?'_PARSED_SUB_FEATURES':'Class Features', d.rows, was?.rows, K==='Theme'?',':', ');
  if(K==='Theme'){ if(ch('utils')){ if(d.utils.length) o.spec['_DisplayPowers']=d.utils.join(','); else delete o.spec['_DisplayPowers']; } }
  else if(d.isNew || !was || ids(was.gpowers)!==ids(now.gpowers)) for(const k of ['Powers','_DisplayPowers']) list(k, d.gpowers, was?.gpowers, ',');
  const els=[o];
  // its features: listed under their level
  for(const r of d.rows){ const f=d.fdefs[r.id]; if(!f) continue; f.level=+r.level||1;
    if(!f.isNew && JSON.stringify(featCore(f))===f.orig) continue;
    const fe=featureEl(f, source, true); if(f.isNew) fe.cats=[String(f.level)]; else if(/^\d+$/.test((fe.cats||[])[0]||'')) fe.cats=[String(f.level), ...fe.cats.slice(1)];
    els.push(fe); }
  return els;
}

/* ---------- races ----------
   A race is two entries: the race (its text, speed, the ability score it lets you choose, its average height…), and
   its "Grants" (size, vision, the ability bonuses and languages it always gives, its skill bonuses and racial traits).
   The draft has them as plain fields; anything else in either is kept as it was. Its traits are racial traits (like
   features), its powers racial powers ("Dragonborn Racial Attack"). */
const ABIL6=['Strength','Constitution','Dexterity','Intelligence','Wisdom','Charisma'];
const RACE_TEXT=[['Short Description','Short description','text'],['Characteristics','Characteristics','text'],['Physical Qualities','Physical qualities','area'],
  ['Playing','Playing one','area'],['Male Names','Male names','text'],['Female Names','Female names','text']];
const RACE_VISION=[['ID_INTERNAL_VISION_NORMAL','Normal'],['ID_INTERNAL_VISION_LOW-LIGHT','Low-light'],['ID_INTERNAL_VISION_DARKVISION','Darkvision']];
const skillTraitId=k=>'ID_INTERNAL_RACIAL_TRAIT_'+k.toUpperCase()+'_BONUS';
function raceDraft(id){
  const e=hbEl(id); if(!e || e.type!=='Race') return null;
  const spec={}; for(const [k,v] of Object.entries(e.spec||{})) spec[k]=String(v??'').trim();
  const d={id, kind:'Race', isNew:!!e.hb && !e.hbReplaces, name:e.name, pre:String(e.pre||'').trim(), hasPre:e.pre!==undefined, flavor:String(e.flavor||'').trim(), text:e.text||'', spec,
    grantsId:'', size:'', vision:[], speed:'', avgH:'', avgW:'', abilFixed:[], abilChoose:[], skills:[], langs:[], langChoice:0, rows:[], utils:[], gpowers:[],
    fdefs:{}, pdefs:{}, powers:[], own:new Set([id]), keys:['Strength']};
  const raceRest=[], gRest=[];
  for(const r of e.rules||[]){ const [t,a]=r, ks=Object.keys(a);
    if(t==='grant' && a.type==='Grants' && ks.length===2 && !d.grantsId){ d.grantsId=a.name; continue; }
    if(t==='statadd' && a.name==='Speed' && ks.every(k=>k==='name'||k==='value') && d.speed===''){ d.speed=String(a.value).replace(/^\+/,''); continue; }
    if(t==='textstring' && /^(Average Height|Average Weight|Size)$/.test(a.name) && ks.length===2){ if(a.name==='Average Height') d.avgH=a.value; else if(a.name==='Average Weight') d.avgW=a.value; else d.sizeText=a.value; continue; }
    if(t==='select' && a.type==='Race Ability Bonus' && String(a.number||'1')==='1' && ks.every(k=>/^(type|number|category)$/i.test(k)) && !d.abilChoose.length && !d.abilAny){
      d.abilChoose=String(a.category||'').split('|').map(x=>x.trim()).filter(Boolean); if(!d.abilChoose.length) d.abilAny=true; continue; }
    if(t==='select' && a.type==='Language' && ks.every(k=>/^(type|number|category)$/i.test(k)) && /^(starting)?$/i.test(String(a.category||'').trim()) && +(a.number||1)>=1 && !d.langChoice){ d.langChoice=+(a.number||1); d.langCat=a.category!==undefined; continue; }
    raceRest.push(r); }
  const g=hbEl(d.grantsId);
  for(const r of g?.rules||[]){ const [t,a]=r;
    if(t!=='grant' || Object.keys(a).length!==2){ gRest.push(r); continue; }
    if(a.type==='Size' && !d.size) d.size=a.name;
    else if(a.type==='Vision') d.vision.push(a.name);
    else if(a.type==='Race Ability Bonus') d.abilFixed.push(hbEl(a.name)?.name.replace(/^.*?(\w+)$/,'$1')||a.name);
    else if(a.type==='Language') d.langs.push(a.name);
    else if(a.type==='Racial Trait' && /^ID_INTERNAL_RACIAL_TRAIT_(\w+)_BONUS$/.test(a.name) && hbEl(a.name)?.cats?.includes('ID_INTERNAL_CATEGORY_SKILL_BONUS')) d.skills.push(SKILLS.find(k=>skillTraitId(k)===a.name)||a.name);
    else if(a.type==='Racial Trait' && hbEl(a.name)) d.rows.push({id:a.name, level:1});
    else gRest.push(r); }
  d.abilFixed=d.abilFixed.map(x=>ABIL6.find(a=>a.toLowerCase()===String(x).toLowerCase())||x);
  // subraces: a trait of the race's own whose only rule is a choice of the racial traits listed under it
  d.subraces=[]; d.subChoice='';
  for(const r of [...d.rows]){ const t=hbEl(r.id), sel=t?.rules?.length===1 && t.rules[0][0]==='select' && t.rules[0][1].type==='Racial Trait' ? t.rules[0][1] : null;
    if(!sel || !t.id.startsWith('ID_HB_') || String(sel.category||'').trim()!==t.id) continue;
    d.subChoice=t.id; d.rows=d.rows.filter(x=>x!==r); d.own.add(t.id);
    for(const o of typeEls('Racial Trait').filter(x=>(x.cats||[]).includes(t.id))) d.subraces.push(subraceFrom(o, d)); }
  d.newLangs=d.langs.filter(l=>String(l).startsWith('ID_HB_') && hbEl(l)).map(l=>({id:l, name:hbEl(l).name, text:hbEl(l).text||''}));
  for(const r of d.rows){ const fe=hbEl(r.id); d.fdefs[r.id]={...featureFrom(fe), isNew:!!fe.hb && !fe.hbReplaces, etype:'Racial Trait'}; d.fdefs[r.id].orig=JSON.stringify(featCore(d.fdefs[r.id])); if(fe.hb && !fe.hbReplaces) d.own.add(r.id); }
  if(g && g.hb && !g.hbReplaces) d.own.add(g.id);
  d.more=featureFrom({id, name:'', spec:{}, rules:raceRest}); d.gmore=featureFrom({id:d.grantsId, name:'', spec:{}, rules:gRest});
  d.orig=JSON.stringify(raceCore(d));
  return d;
}
// a subrace: its own bonuses and traits, chosen at the race's subrace choice
function subraceFrom(o, d){
  const x={id:o.id, isNew:!!o.hb && !o.hbReplaces, name:o.name, short:String(o.spec?.['Short Description']||o.spec?.['_CS_ShortDescription']||'').trim(), text:o.text||'', abilFixed:[], abilChoose:[], abilAny:false, skills:[], traits:[]};
  const rest=[];
  for(const r of o.rules||[]){ const [t,a]=r, ks=Object.keys(a);
    if(t==='grant' && ks.length===2 && a.type==='Race Ability Bonus'){ x.abilFixed.push(ABIL6.find(b=>'ID_INTERNAL_RACE_ABILITY_BONUS_'+b.toUpperCase()===a.name)||a.name); continue; }
    if(t==='select' && a.type==='Race Ability Bonus' && ks.every(k=>/^(type|number|category)$/i.test(k)) && !x.abilChoose.length && !x.abilAny){ x.abilChoose=String(a.category||'').split('|').map(v=>v.trim()).filter(Boolean); if(!x.abilChoose.length) x.abilAny=true; continue; }
    if(t==='grant' && ks.length===2 && a.type==='Racial Trait' && SKILLS.some(k=>skillTraitId(k)===a.name)){ x.skills.push(SKILLS.find(k=>skillTraitId(k)===a.name)); continue; }
    if(t==='grant' && ks.length===2 && a.type==='Racial Trait' && hbEl(a.name)){ x.traits.push(a.name);
      const fe=hbEl(a.name); if(!d.fdefs[a.name]){ d.fdefs[a.name]={...featureFrom(fe), isNew:!!fe.hb && !fe.hbReplaces, etype:'Racial Trait'}; d.fdefs[a.name].orig=JSON.stringify(featCore(d.fdefs[a.name])); if(fe.hb && !fe.hbReplaces) d.own.add(a.name); }
      continue; }
    rest.push(r); }
  x.more=featureFrom({id:o.id, name:'', spec:{}, rules:rest});
  if(x.isNew) d.own.add(o.id);
  // the description written for it (not by the user) stays automatic
  const a=subraceAuto(x,d), plain=t=>t.replace(/ \(powers?: [^)]*\)$/gm,'').trim(); if(x.text.trim()===a.auto.trim() || plain(x.text)===plain(a.auto)) x.text=''; if(x.short===a.gives || x.short===x.name) x.short='';
  x.orig=JSON.stringify(subraceCore(x));
  return x;
}
// what a subrace gives, in words: its description when none is written
function subraceAuto(x,d){
  const gives=[x.abilFixed.map(a=>'+2 '+a).join(', '), x.abilAny?'+2 to one ability score of your choice':x.abilChoose.length?x.abilChoose.map(a=>'+2 '+a).join(' or '):'',
    x.skills.length?'+2 '+x.skills.join(', +2 '):''].filter(Boolean).join('; ');
  const pw=t=>{ const f=d.fdefs[t]; return f ? f.effects.filter(x=>x.kind==='power' && x.id).map(x=>x.id) : (hbEl(t)?.rules||[]).filter(([k,a])=>k==='grant' && hbEl(a.name)?.type==='Power').map(([,a])=>a.name); };
  const pname=id=>d.pdefs?.[id]?.name||hbEl(id)?.name||id;
  const traitLines=x.traits.map(t=>{ const f=d.fdefs[t], e=hbEl(t); const nm=f?.name||e?.name||t, sh=f?.short||hbSp(e,'Short Description'), ps=pw(t);
    return nm+(sh?': '+sh:'')+(ps.length?' ('+(ps.length>1?'powers':'power')+': '+ps.map(pname).join(', ')+')':''); });
  return {gives, auto:[gives?gives+'.':'', ...traitLines].filter(Boolean).join('\n'), powers:x.traits.flatMap(pw)};
}
const subraceCore=x=>({name:x.name, short:x.short, text:x.text, abilFixed:x.abilFixed, abilChoose:x.abilChoose, abilAny:x.abilAny, skills:x.skills, traits:x.traits, more:x.more.effects.map(e=>({...e,rule:undefined}))});
const raceCore=d=>({name:d.name, subraces:(d.subraces||[]).map(subraceCore), newLangs:(d.newLangs||[]).map(l=>[l.id,l.name,l.text]), pre:d.pre, flavor:d.flavor, text:d.text, spec:Object.fromEntries(RACE_TEXT.map(([k])=>[k,d.spec[k]||''])),
  size:d.size, sizeText:d.sizeText||'', abilAny:!!d.abilAny, vision:d.vision, speed:d.speed, avgH:d.avgH, avgW:d.avgW, abilFixed:d.abilFixed, abilChoose:d.abilChoose, skills:d.skills, langs:d.langs, langChoice:d.langChoice,
  rows:d.rows.map(r=>r.id), more:d.more.effects.map(x=>({...x,rule:undefined})), gmore:d.gmore.effects.map(x=>({...x,rule:undefined}))});
function newRaceDraft(pack, name, fromId){
  const slug=slugId(name), id=uniqueId('ID_HB_'+slugId(pack.name)+'_RACE_'+slug);
  const d=fromId ? raceDraft(fromId) : {kind:'Race', pre:'', hasPre:false, flavor:'', text:'', spec:{}, grantsId:'', size:'ID_INTERNAL_SIZE_MEDIUM', vision:['ID_INTERNAL_VISION_NORMAL'], speed:'6', avgH:'', avgW:'',
    abilFixed:[], abilChoose:[], skills:[], langs:[typeEls('Language').find(l=>l.name==='Common')?.id].filter(Boolean), langChoice:1, rows:[], utils:[], gpowers:[], fdefs:{}, pdefs:{}, powers:[], keys:['Strength'], subraces:[], subChoice:'', newLangs:[],
    more:{id,name:'',effects:[],keep:[]}, gmore:{id:'',name:'',effects:[],keep:[]}};
  Object.assign(d,{id, isNew:true, name, own:new Set([id]), orig:'', grantsId:uniqueId('ID_HB_'+slugId(pack.name)+'_GRANTS_'+slug)});
  d.own.add(d.grantsId); d.pre='~'+name.toUpperCase().replace(/[^A-Z0-9]+/g,'_'); d.hasPre=true;
  return d;
}
const raceSize=d=>d.sizeText||hbEl(d.size)?.name||'Medium';
const raceAbilText=d=>[...d.abilFixed.map(a=>'+2 '+a), d.abilAny?'+2 to one ability score of your choice':d.abilChoose.length?d.abilChoose.map(a=>'+2 '+a).join(' or '):''].filter(Boolean).join(', ');
const raceLangText=d=>[...d.langs.map(l=>hbEl(l)?.name||(d.newLangs||[]).find(x=>x.id===l)?.name||l), d.langChoice?(d.langChoice>1?'choice of '+['','one','two','three','four'][d.langChoice]+' others':'choice of one other'):''].filter(Boolean).join(', ');
function raceEntries(d, source){
  const was=d.orig ? JSON.parse(d.orig) : null, now=raceCore(d), ch=k=>d.isNew || !was || JSON.stringify(was[k])!==JSON.stringify(now[k]);
  const base=hbEl(d.id)||baseEl(d.id);
  const o=d.isNew ? {id:d.id, name:'', type:'Race', source, spec:{}} : clone(base);
  delete o.hb; delete o.hbMod; delete o.hbReplaces; delete o._cs;
  o.name=d.name; o.spec={...(o.spec||{})};
  if(ch('pre')){ if(d.pre || d.hasPre) o.pre=d.pre; else delete o.pre; }
  if(ch('flavor')){ if(d.flavor) o.flavor=d.flavor; else delete o.flavor; }
  if(ch('text')) o.text=d.text;
  for(const [k] of RACE_TEXT) if(d.isNew || (was?.spec?.[k]||'')!==(now.spec[k]||'')){ if(d.spec[k]) o.spec[k]=d.spec[k]; else delete o.spec[k]; }
  // the details players read, written from the fields when those changed
  if(ch('size')||ch('sizeText')) o.spec['Size']=raceSize(d);
  if(ch('speed')) o.spec['Speed']=(d.speed||'6')+' squares';
  if(ch('vision')) o.spec['Vision']=d.vision.map(v=>hbEl(v)?.name||v).join(', ')||'Normal';
  if(ch('avgH')) { if(d.avgH) o.spec['Average Height']=d.avgH; else delete o.spec['Average Height']; }
  if(ch('avgW')) { if(d.avgW) o.spec['Average Weight']=d.avgW; else delete o.spec['Average Weight']; }
  if(ch('abilFixed')||ch('abilChoose')||ch('abilAny')||ch('subraces')) o.spec['Ability Scores']=raceAbilText(d)||((d.subraces||[]).length?'See the subrace chosen':'');
  if(ch('langs')||ch('langChoice')) o.spec['Languages']=raceLangText(d);
  if(ch('skills')) { if(d.skills.length) o.spec['Skill Bonuses']=d.skills.map(k=>'+2 '+k).join(', '); else delete o.spec['Skill Bonuses']; }
  if(ch('rows')||ch('subraces')){ const old=String(o.spec['Racial Traits']||'').split(',').map(x=>x.trim()).filter(Boolean), gone=new Set([...(was?.rows||[]), d.subChoice||d.id+'_SUBRACE']);
    const now=[...d.rows.map(r=>r.id), ...((d.subraces||[]).length?[d.subChoice||d.id+'_SUBRACE']:[])];
    const out=[...old.filter(x=>now.includes(x) || !gone.has(x)), ...now.filter(x=>!old.includes(x))];
    if(out.length) o.spec['Racial Traits']=out.join(', '); else delete o.spec['Racial Traits']; }
  // the race's own rules
  if(['speed','avgH','avgW','size','sizeText','abilChoose','abilAny','langChoice','more'].some(ch) || d.isNew){
    o.rules=[['grant',{name:d.grantsId,type:'Grants'}], ['statadd',{name:'Speed',value:'+'+(d.speed||'6')}],
      ...(d.avgH?[['textstring',{name:'Average Height',value:d.avgH}]]:[]), ...(d.avgW?[['textstring',{name:'Average Weight',value:d.avgW}]]:[]),
      ['textstring',{name:'Size',value:raceSize(d)}],
      ...(d.abilAny?[['select',{type:'Race Ability Bonus',number:'1'}]]:d.abilChoose.length?[['select',{type:'Race Ability Bonus',number:'1',category:d.abilChoose.join('|')}]]:[]),
      ...(d.langChoice?[['select',{type:'Language',number:String(d.langChoice),category:'Starting'}]]:[]),
      ...featureRules(d.more)];
    // an official race keeps the order and spelling of what didn't change
    if(!d.isNew && base){ const key=r=>r[0]+JSON.stringify(Object.fromEntries(Object.entries(r[1]).map(([k,v])=>[k.toLowerCase(),String(v).trim()]).sort()));
      const bk=new Map(base.rules.map(r=>[key(r),r])); o.rules=o.rules.map(r=>bk.get(key(r))||r);
      const order=new Map(base.rules.map((r,i)=>[key(r),i])); o.rules.sort((a,b)=>(order.get(key(a))??999)-(order.get(key(b))??999)); }
  }
  const els=[o];
  // its Grants: size, vision, ability bonuses and languages it always gives, skill bonuses, racial traits
  if(['size','vision','abilFixed','langs','skills','rows','gmore'].some(ch) || d.isNew || (d.subraces||[]).length && !(was?.subraces||[]).length || !(d.subraces||[]).length && (was?.subraces||[]).length){
    const gb=hbEl(d.grantsId)||baseEl(d.grantsId);
    const go=gb && !d.isNew ? clone(gb) : {id:d.grantsId, name:d.name, type:'Grants', source, spec:{'_SupportsID':d.id}};
    delete go.hb; delete go.hbMod; delete go.hbReplaces; delete go._cs;
    go.rules=[...(d.size?[['grant',{name:d.size,type:'Size'}]]:[]), ...d.vision.map(v=>['grant',{name:v,type:'Vision'}]),
      ...d.rows.map(r=>['grant',{name:r.id,type:'Racial Trait'}]), ...((d.subraces||[]).length?[['grant',{name:d.subChoice||d.id+'_SUBRACE',type:'Racial Trait'}]]:[]),
      ...d.abilFixed.map(a=>['grant',{name:'ID_INTERNAL_RACE_ABILITY_BONUS_'+a.toUpperCase(),type:'Race Ability Bonus'}]),
      ...d.langs.map(l=>['grant',{name:l,type:'Language'}]), ...d.skills.map(k=>['grant',{name:skillTraitId(k),type:'Racial Trait'}]), ...featureRules(d.gmore)];
    if(gb && !d.isNew){ const key=r=>r[0]+JSON.stringify(Object.fromEntries(Object.entries(r[1]).map(([k,v])=>[k.toLowerCase(),String(v).trim()]).sort()));
      const bk=new Map(gb.rules.map(r=>[key(r),r])); go.rules=go.rules.map(r=>bk.get(key(r))||r);
      const order=new Map(gb.rules.map((r,i)=>[key(r),i])); go.rules.sort((a,b)=>(order.get(key(a))??999)-(order.get(key(b))??999)); }
    els.push(go);
  }
  const traitIds=[...d.rows.map(r=>r.id), ...(d.subraces||[]).flatMap(x=>x.traits)];
  for(const id of [...new Set(traitIds)]){ const f=d.fdefs[id]; if(!f) continue;
    if(!f.isNew && JSON.stringify(featCore(f))===f.orig) continue;
    const fe=featureEl(f, source); fe.type='Racial Trait'; if(f.isNew){ fe.cats=[]; fe.spec['Class']=d.id; }
    els.push(fe); }
  // subraces: the choice (a trait the Grants give), and each subrace listed under it
  if((d.subraces||[]).length){
    if(!d.subChoice) d.subChoice=d.id.replace(/^ID_HB_/,'ID_HB_')+'_SUBRACE';
    els.push({id:d.subChoice, name:d.name+' Subrace', type:'Racial Trait', source, cats:[], spec:{'Short Description':'Choose your subrace','Level':'1','_PARSED_SUB_FEATURES':d.subraces.map(x=>x.id).join(',')},
      rules:[['select',{type:'Racial Trait',number:'1',category:d.subChoice}]]});
    for(const x of d.subraces){ if(!x.isNew && JSON.stringify(subraceCore(x))===x.orig) continue;
      const {gives, auto, powers}=subraceAuto(x,d);
      els.push({id:x.id, name:x.name, type:'Racial Trait', source, cats:[d.subChoice], spec:{'Short Description':x.short||gives||x.name,'Level':'1',...(x.traits.length?{'_PARSED_CHILD_FEATURES':x.traits.join(',')}:{}),...(powers.length?{'_DisplayPowers':powers.join(',')}:{})},
        rules:[...x.skills.map(k=>['grant',{name:skillTraitId(k),type:'Racial Trait'}]),
          ...(x.abilAny?[['select',{type:'Race Ability Bonus',number:'1'}]]:x.abilChoose.length?[['select',{type:'Race Ability Bonus',number:'1',category:x.abilChoose.join('|')}]]:[]),
          ...x.abilFixed.map(a=>['grant',{name:'ID_INTERNAL_RACE_ABILITY_BONUS_'+a.toUpperCase(),type:'Race Ability Bonus'}]),
          ...x.traits.map(t=>['grant',{name:t,type:'Racial Trait'}]), ...featureRules(x.more)], text:x.text||auto}); }
  }
  // languages of its own: any character can learn them later; the race knows them from the start
  for(const l of d.newLangs||[]) els.push({id:l.id, name:l.name, type:'Language', source, cats:['ID_INTERNAL_CATEGORY_STARTING'], spec:{}, rules:[['statadd',{name:'Language Count',value:'+1'}]], ...(l.text?{text:l.text}:{})});
  return els;
}

/* ---------- items: magic items, weapons, armor and gear ----------
   An item is mostly its details ("Level", "Gold", "Enhancement", "Power"…), plus a few rules (bonuses). The draft
   keeps every detail as text; a change of an official item writes only what changed. A new weapon also gets what
   being proficient with it takes: a proficiency entry, listed under its kind ("Military Melee"), and the entry the
   Weapon Proficiency feat offers. */
const STD_PRICE=[0,360,520,680,840,1000,1800,2600,3400,4200,5000,9000,13000,17000,21000,25000,45000,65000,85000,105000,125000,225000,325000,425000,525000,625000,1125000,1625000,2125000,2625000,3125000];
const MAGIC_TYPES=['Weapon','Armor','Neck Slot Item','Arms Slot Item','Head Slot Item','Hands Slot Item','Feet Slot Item','Waist Slot Item','Ring','Wondrous Item',
  'Staff','Rod','Orb','Wand','Holy Symbol','Totem','Ki Focus','Tome','Potion','Elixir','Alchemical','Consumable','Ammunition','Reagent','Artifact','Divine Boon','Legendary Boon','Grandmaster Training'];
const SLOT_OF={'Neck Slot Item':'Neck','Arms Slot Item':'Arms','Head Slot Item':'Head','Hands Slot Item':'Hands','Feet Slot Item':'Feet','Waist Slot Item':'Waist','Ring':'Ring',
  'Staff':'Off-hand','Holy Symbol':'Off-hand','Rod':'Off-hand','Orb':'Off-hand','Wand':'Off-hand','Totem':'Off-hand','Ki Focus':'Off-hand','Tome':'Off-hand'};
const ITEM_KINDS={
  'Magic Item':{label:'magic item', fields:[
    ['Magic Item Type','Kind','select',MAGIC_TYPES],
    ['Level','Level','number'], ['Gold','Price (gp)','number','The usual price for its level is filled in when you change the level.'],
    ['Rarity','Rarity','select',['Common','Uncommon','Rare','Unique']],
    ['Item Slot','Slot','select',['','Head','Neck','Arms','Hands','Waist','Feet','Ring','Off-hand','Tattoo'],'Body slots: what it is worn on. Weapons and armor have none.'],
    ['Weapon','Weapons it can be','text','Any; Any melee; Heavy Blade, Light Blade',d=>d.spec['Magic Item Type']==='Weapon'],
    ['Armor','Armor it can be','text','Any; Leather, Hide; Chain, Scale, Plate',d=>d.spec['Magic Item Type']==='Armor'],
    ['Enhancement','Enhancement','text','+1 attack rolls and damage rolls; +1 AC; +1 Fortitude, Reflex, and Will'],
    ['Critical','Critical','text','+1d6 fire damage per plus'],
    ['Property','Property','area','What it always does.'],
    ['Power','Power','area','Power (Daily • Fire): Free Action. Use this power when you hit with the weapon…'],
    ['Requirement','Requirement','text'],
    ['Special','Special','area']]},
  'Weapon':{label:'weapon', fields:[
    ['Weapon Category','Category','select',['Simple Melee','Military Melee','Superior Melee','Simple Ranged','Military Ranged','Superior Ranged','Improvised Melee','Improvised Ranged']],
    ['Hands Required','Hands','select',['One-Handed','Two-Handed']],
    ['Proficiency Bonus','Proficiency bonus','number'], ['Damage','Damage','text','1d8'], ['Range','Range','text','10/20 (thrown and ranged weapons)'],
    ['Group','Group','text','Heavy Blade; Axe, Heavy Blade'], ['Properties','Properties','text','Versatile; High crit; Off-hand'],
    ['Weight','Weight (lb.)','number'], ['Gold','Price (gp)','number'], ['Full Text','Description','area']]},
  'Armor':{label:'armor', fields:[
    ['Armor Type','Type','select',['Light','Heavy','Shield']],
    ['Armor Category','Category','select',['Cloth','Leather','Hide','Chain','Scale','Plate','Light Shields','Heavy Shields']],
    ['Armor Bonus','Armor bonus','number'], ['Minimum Enhancement Bonus','Minimum enhancement','number','For masterwork armor.'],
    ['Check','Check penalty','number','0, or a minus: -1'], ['Speed','Speed penalty','number','0, or a minus: -1'],
    ['Weight','Weight (lb.)','number'], ['Gold','Price (gp)','number'], ['Special','Special','area'], ['Full Text','Description','area']]},
  'Gear':{label:'gear', fields:[
    ['Category','Category','select',['Gear','Mount','Building','Transportation','Ammunition','Musical Instrument','Component','Drink','Food']],
    ['Gold','Price (gp)','number'], ['Silver','Price (sp)','number'], ['Copper','Price (cp)','number'], ['Weight','Weight (lb.)','number'],
    ['count','How many come together','number'], ['Full Text','Description','area']]}};
const ITEM_WEAPON_PROF={'Simple Melee':'SIMPLE_MELEE','Military Melee':'MILITARY_MELEE','Superior Melee':'SUPERIOR_MELEE','Simple Ranged':'SIMPLE_RANGED','Military Ranged':'MILITARY_RANGED','Superior Ranged':'SUPERIOR_RANGED'};
function itemDraft(id){
  const e=hbEl(id); if(!e || !ITEM_KINDS[e.type]) return null;
  const spec={}; for(const [k,v] of Object.entries(e.spec||{})) spec[k]=String(v??'').trim();
  const d={id, type:e.type, isNew:!!e.hb && !e.hbReplaces, name:e.name, flavor:String(e.flavor||'').trim(), text:e.text||'', spec, cats:[...(e.cats||[])],
    more:featureFrom({id, name:'', spec:{}, rules:e.rules||[]}), own:new Set([id])};
  if(d.type==='Weapon'){ for(const x of itemWeaponExtras(d,'')) if(hbEl(x.id)) d.own.add(x.id);
    // a copy of an official weapon: the one whose proficiency lists it
    const pid=id+'_PROFICIENCY'; for(const o of (Workshop.cur?.ops||[])) if(o.op==='append' && /^ID_INTERNAL_PROFICIENCY_WEAPON_PROFICIENCY_/.test(o.id) && (o.rules||[]).some(([t,a])=>t==='grant' && a.name===pid))
      d.copyOf=typeEls('Weapon').find(w=>weaponProfOf(w)?.id===o.id)?.id; }
  d.orig=JSON.stringify(itemCore(d));
  return d;
}
const itemCore=d=>({name:d.name, flavor:d.flavor, text:d.text, spec:Object.fromEntries(Object.entries(d.spec).filter(([k,v])=>v!=='').sort()), more:d.more.effects.map(x=>({...x,rule:undefined}))});
function newItemDraft(pack, type, name, fromId){
  const id=uniqueId('ID_HB_'+slugId(pack.name)+'_'+(type==='Magic Item'?'MAGIC_ITEM':type.toUpperCase())+'_'+slugId(name));
  const d=fromId ? itemDraft(fromId) : {type, flavor:'', text:'', spec:{}, cats:[], more:{id,name:'',effects:[],keep:[]}};
  if(!fromId){
    if(type==='Magic Item') Object.assign(d.spec,{'Magic Item Type':'Wondrous Item','Level':'1','Gold':'360','Rarity':'Uncommon'});
    if(type==='Weapon'){ Object.assign(d.spec,{'Weapon Category':'Military Melee','Hands Required':'One-Handed','Proficiency Bonus':'2','Damage':'1d8','Group':'Heavy Blade','Weight':'4','Gold':'15'}); d.cats=['ID_INTERNAL_CATEGORY_SELECTABLE']; }
    if(type==='Armor') Object.assign(d.spec,{'Armor Type':'Light','Armor Category':'Leather','Armor Bonus':'2','Check':'0','Speed':'0','Weight':'15','Gold':'25','Item Slot':'Body'});
    if(type==='Gear') Object.assign(d.spec,{'Category':'Gear','Gold':'1','Weight':'1','count':'1'});
  }
  else if(type==='Weapon') d.cats=d.cats.filter(c=>!/^ID_INTERNAL_CATEGORY_(SELECTABLE)$/.test(c)).concat('ID_INTERNAL_CATEGORY_SELECTABLE');
  delete d.spec['_SupportsID']; delete d.spec['InternalOnly'];
  Object.assign(d,{id, type:fromId?hbEl(fromId).type:type, isNew:true, name, own:new Set([id]), orig:''});
  if(fromId && d.type==='Weapon') d.copyOf=fromId;
  return d;
}
// a weapon's groups as the builders list them (its categories)
const weaponGroupIds=g=>String(g||'').split(/\s*,\s*/).filter(Boolean).map(n=>typeEls('Weapon Group').find(x=>x.name.toLowerCase()===n.toLowerCase())?.id).filter(Boolean);
// what being proficient with a new weapon takes: the proficiency, the Weapon Proficiency feat's entry for it
function itemWeaponExtras(d, source){
  const nm=d.name, slug=String(nm).toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,''), cat=d.spec['Weapon Category']||'';
  const pid=d.id+'_PROFICIENCY', fid=d.id+'_PROFICIENCY_FEAT';
  const kind=/^(simple|military|superior|improvised)/i.exec(cat)?.[1]?.toUpperCase(), range=/ranged/i.test(cat)?'RANGED':'MELEE';
  return [
    {id:pid, name:`Weapon Proficiency (${nm})`, type:'Proficiency', source, spec:{}, cats:[...weaponGroupIds(d.spec['Group']), ...(kind?['ID_INTERNAL_CATEGORY_'+kind]:[]), 'ID_INTERNAL_CATEGORY_'+range]},
    {id:fid, name:`Weapon Proficiency (${nm})`, type:'Feat', source, spec:{'_SupportsID':'ID_FMP_FEAT_178','_RequiresID':d.id,'Short Description':`Gain proficiency with the ${nm}`,'Tier':'Heroic'},
      rules:[['grant',{name:pid,type:'Proficiency'}]], text:`You gain proficiency with the ${nm}.`}];
}
function itemEntries(d, source){
  const K=ITEM_KINDS[d.type], base=hbEl(d.id)||baseEl(d.id);
  const o=d.isNew ? {id:d.id, name:'', type:d.type, source, spec:{}, cats:[...d.cats]} : clone(base);
  delete o.hb; delete o.hbMod; delete o.hbReplaces; delete o._cs;
  const was=d.orig ? JSON.parse(d.orig) : null, now=itemCore(d), ch=k=>d.isNew || !was || JSON.stringify(was[k])!==JSON.stringify(now[k]);
  o.name=d.name;
  if(ch('flavor')){ if(d.flavor) o.flavor=d.flavor; else delete o.flavor; }
  if(ch('text')){ if(d.text) o.text=d.text; else delete o.text; }
  // details: a new item's in the usual order; a changed one keeps its own, and only the changed ones are written
  o.spec={...(o.spec||{})};
  const keys=d.isNew ? [...K.fields.map(f=>f[0]).filter(k=>k in d.spec), ...Object.keys(d.spec).filter(k=>!K.fields.some(f=>f[0]===k))] : Object.keys(d.spec);
  if(d.isNew){ o.spec={}; for(const k of keys) if(d.spec[k]!=='') o.spec[k]=d.spec[k]; }
  else { for(const k of keys) if(String(o.spec[k]??'').trim()!==d.spec[k]) { if(d.spec[k]==='' ) delete o.spec[k]; else o.spec[k]=d.spec[k]; }
    for(const k of Object.keys(o.spec)) if(!(k in d.spec)) delete o.spec[k]; }
  // rules: its bonuses; armor's own (armor bonus, check, speed) follow the details
  const armorCh=k=>d.type==='Armor' && (d.isNew || was && (was.spec?.[k]||'')!==(now.spec[k]||''));
  if(ch('more') || ['Armor Bonus','Check','Speed'].some(armorCh)){
    let rules=featureRules(d.more);
    if(d.type==='Armor'){
      const num=v=>/^[+-]?\d+$/.test(String(v||'').trim());
      const set=(name,type,v)=>{ v=String(v||'').trim(); const i=rules.findIndex(([t,a])=>t==='statadd' && a.name===name && (!type || a.type===type) && !a.requires);
        if(i>=0){ if(!v || +v===0) rules.splice(i,1); else rules[i]=['statadd',{...rules[i][1], value:v}]; } else if(v && +v!==0) rules.unshift(['statadd',{name, value:v, type:type||'Armor'}]); };
      if(armorCh('Armor Bonus') && num(d.spec['Armor Bonus'])) set('Armor Class','Armor',d.spec['Armor Bonus']);
      const pen=rules.findIndex(([t,a])=>t==='statadd' && a.name==='Armor Penalty'); const cv=String(d.spec['Check']||'').trim();
      if(armorCh('Check') && (num(cv)||!cv)){ if(pen>=0){ if(!cv || +cv===0) rules.splice(pen,1); else rules[pen]=['statadd',{...rules[pen][1], value:cv}]; } else if(cv && +cv!==0) rules.push(['statadd',{name:'Armor Penalty', value:cv, type:d.spec['Armor Category']||'Armor'}]); }
      if(armorCh('Speed') && (num(d.spec['Speed'])||!d.spec['Speed'])) set('Speed','Armor',d.spec['Speed']);
    }
    // new armor of its own: wearing it without proficiency costs -2 to attack rolls and Reflex, as with official armor
    if(d.type==='Armor' && d.isNew && !rules.some(([t,a])=>/proficiency/i.test(a.requires||''))){
      const c=d.spec['Armor Category']||'', prof=/shield/i.test(c)?'Shield Proficiency ('+(/heavy/i.test(c)?'Heavy':'Light')+')':'Armor Proficiency ('+({Chain:'Chainmail'}[c]||c)+')';
      if(c && c!=='Cloth') rules.push(['statadd',{name:'attack rolls',value:'-2',requires:'!'+prof}],['statadd',{name:'Reflex Defense',value:'-2',requires:'!'+prof}]);
    }
    if(rules.length) o.rules=rules; else delete o.rules;
  }
  // new armor's categories: its type and kind
  if(d.type==='Armor' && d.isNew && !o.cats.length){
    const up=x=>'ID_INTERNAL_CATEGORY_'+String(x||'').toUpperCase().replace(/ /g,'_');
    o.cats=[up(d.spec['Armor Type']), up(d.spec['Armor Category'])].filter(c=>hbEl(c));
  }
  // a weapon's categories: its groups and hands
  if(d.type==='Weapon' && (d.isNew || ['Group','Hands Required'].some(k=>(was?.spec?.[k]||'')!==(now.spec[k]||'')))){
    const groups=weaponGroupIds(d.spec['Group']), two=/two/i.test(d.spec['Hands Required']||'');
    o.cats=[...(o.cats||[]).filter(c=>hbEl(c)?.type!=='Weapon Group' && !/^ID_INTERNAL_CATEGORY_(ONE|TWO)-HAND(ED)?$/.test(c)),
      ...(two?['ID_INTERNAL_CATEGORY_TWO-HANDED']:['ID_INTERNAL_CATEGORY_ONE-HAND','ID_INTERNAL_CATEGORY_ONE-HANDED']), ...groups];
    o.cats=[...new Set(o.cats)];
    const was0=(base?.cats||[]); if(!d.isNew && o.cats.length===was0.length && o.cats.every(c=>was0.includes(c))) o.cats=[...was0];
  }
  if(d.isNew && d.type==='Magic Item' && !o.spec['Magic Item Type']) o.spec['Magic Item Type']='Wondrous Item';
  const els=[o];
  if(d.type==='Weapon' && d.id.startsWith('ID_HB_')) els.push(...itemWeaponExtras(d, source));
  return els;
}
// a new weapon's kind ("Military Melee") makes those proficient with that kind proficient with it too; a copy of a
// weapon, those proficient with that weapon (a fullblade's copy: whoever can use a fullblade)
const weaponProfOf=w=>w && typeEls('Proficiency').find(x=>x.name.toLowerCase()==='weapon proficiency ('+w.name.toLowerCase()+')' && !x.id.startsWith('ID_HB_'));
function itemOps(d){
  if(d.type!=='Weapon' || !d.id.startsWith('ID_HB_')) return [];
  const g=['grant',{name:d.id+'_PROFICIENCY',type:'Proficiency'}], out=[];
  const k=ITEM_WEAPON_PROF[d.spec['Weapon Category']]; if(k && hbEl('ID_INTERNAL_PROFICIENCY_'+k)) out.push({op:'append', id:'ID_INTERNAL_PROFICIENCY_'+k, rules:[g]});
  const src=d.copyOf && weaponProfOf(hbEl(d.copyOf)); if(src) out.push({op:'append', id:src.id, rules:[g]});
  return out;
}

/* an implement the rules have no expertise for (a scythe): Implement Expertise and Versatile Expertise get an option
   for it, made like the official ones (a +1/+2/+3 feat bonus with that implement), so the feats work with it */
let _baseNames=null;
function expertiseFor(d, source){
  if(!_baseNames || _baseNames.base!==RULES.base){ _baseNames={base:RULES.base, set:new Set((RULES.base||RULES.raw||[]).filter(o=>o.type==='Feat'||o.type==='Class Feature').map(o=>o.name.toLowerCase()))}; }
  const out=[], pk=slugId(Workshop.cur?.name||source);
  for(const e of d.profs.map(hbEl)){
    const m=/^Implement Proficiency \((.+)\)$/i.exec(e?.name||''); if(!m) continue;
    const X=m[1], x=X.toLowerCase(), pl=/s$/.test(x)?x:x+'s';
    // a weapon used as an implement (scythe, dagger) already has its group's expertise (Heavy Blade, Light Blade)
    if((RULES.db.nameIdx[x]||[]).some(id=>RULES.db.els[id]?.type==='Weapon') || /\sgroup$/i.test(x)) continue;
    const tiers=(stat,label)=>[['statadd',{name:stat,value:'+1',type:'Feat'}],['statadd',{name:stat,value:'+2',type:'Feat',requires:'11 level'}],['statadd',{name:stat,value:'+3',type:'Feat',requires:'21 level'}]];
    if(!_baseNames.set.has(`implement expertise (${x})`)) out.push({id:'ID_HB_'+pk+'_FEAT_IMPLEMENT_EXPERTISE_'+slugId(X), name:`Implement Expertise (${X})`, type:'Feat', source,
      spec:{'Tier':'Heroic','Short Description':`+1 to implement power attacks with ${pl} (+2 at 11th, +3 at 21st level)`,'_SupportsID':'ID_FMP_FEAT_734'},
      rules:tiers(`${x} implement,implement:attack`), text:`You gain a +1 feat bonus to attack rolls with any implement power you use through a ${x}. The bonus increases to +2 at 11th level and +3 at 21st level.`});
    if(!_baseNames.set.has(`versatile expertise (${x})`)) out.push({id:'ID_HB_'+pk+'_VERSATILE_EXPERTISE_'+slugId(X), name:`Versatile Expertise (${X})`, type:'Class Feature', source,
      cats:['Versatile Expertise Implement'], spec:{'Tier':'Heroic','Short Description':`+1/+2/+3 (by tier) to attack rolls with ${pl}`,'_SupportsID':'ID_FMP_FEAT_2785'},
      rules:tiers(`${x} implement:attack`), text:`You gain a +1 feat bonus to attack rolls with ${pl}. The bonus increases to +2 at 11th level and +3 at 21st level.`});
  }
  return out;
}
// the class features a class uses: its rows, and the options of choices inside them (removed ones are not written)
// the features an effect gives or offers
const subFeatures=x=>x.kind==='choose' ? x.ids : x.kind==='feature' && x.id ? [x.id] : [];
function usedFeatures(d){
  const seen=new Map(), walk=id=>{ const f=d.fdefs[id]; if(!f || seen.has(id)) return; seen.set(id,f);
    for(const x of f.effects) subFeatures(x).forEach(walk); };
  for(const r of d.features) (r.kind==='grant'?[r.id]:r.ids).forEach(walk);
  return [...seen.values()];
}
/* the pack's changes that belong to a class: listing it in an entry; taking it off one (the clear and put-back pair:
   the entry had the class, and what is put back is everything else it had); deleting one of its builds */
function classOwnsOp(cid, o, mine){
  const had=baseEl(o.id)?.cats||[], hadIt=had.includes(cid);
  if(o.op==='append' && (o.cats||[]).includes(cid)) return true;
  if(o.op==='remove') return hadIt && o.clearCats;
  if(o.op==='append' && hadIt){ const rest=had.filter(c=>c!==cid); return (o.cats||[]).length===rest.length && rest.every(c=>o.cats.includes(c)); }
  if(o.op==='delete') return mine.has(o.id) || hadIt;
  return false;
}

/* ---------- the workshop ---------- */
const Workshop={
  packs:[],          // [{name, els, ops, error}]
  cur:null,          // the pack open
  draft:null,        // the class being edited
  tab:'basics',
  taken:new Set(),
  saveTimer:null, status:'',

  load(){
    this.packs=HOMEBREW.packs.map(p=>{ let els=[], ops=[], error=p.error||'';
      try{ els=RULES.parse(p.text,true); ops=els.ops||[]; }catch(e){ error=e.message; }
      return {name:p.name, els:[...els], ops:[...ops], error}; });
    if(this.cur) this.cur=this.packs.find(p=>p.name===this.cur.name)||null;
  },
  show(){
    if(!this.dirtyPack) this.load();
    this.render();
  },

  /* ---------- saving: a moment after the last change ---------- */
  changed(){ this.dirtyPack=this.cur; this.setStatus('Saving…'); clearTimeout(this.saveTimer); this.saveTimer=setTimeout(()=>this.save(),700); },
  async save(){
    clearTimeout(this.saveTimer);
    const p=this.dirtyPack; if(!p) return;
    if(this.draft && p===this.cur) this.applyDraft();
    if(this.bg && p===this.cur) this.applyBg();
    if(this.feat && p===this.cur) this.applyFeat();
    if(this.sp && p===this.cur) this.applySp();
    if(this.th && p===this.cur) this.applyTh();
    if(this.item && p===this.cur) this.applyItem();
    try{ await OC.savePack(p.name, packXml(p)); this.dirtyPack=null; await loadHomebrew(true); this.setStatus('Saved'); }
    catch(e){ this.setStatus('Could not save: '+e.message); }
  },
  // put the draft's entries in the pack, in place of what it had for the class before
  applyDraft(){
    const d=this.draft, p=this.cur;
    for(const pd of Object.values(d.pdefs||{})) for(const k of pd.keywords) ensureKeyword(p,k);
    const {els,ops}=draftEntries(d, p.name);
    const mine=new Set([...d.own, ...els.map(o=>o.id)]);
    p.els=p.els.filter(o=>!mine.has(o.id)).concat(els);
    p.ops=p.ops.filter(o=>!classOwnsOp(d.id,o,mine)).concat(ops);
    // a homebrew class feature in this pack that nothing refers to any more (removed while editing) goes
    const refs=new Set(); for(const o of p.els) for(const [t,a] of o.rules||[]){ refs.add(a.name); String(a.category||'').split('|').forEach(x=>refs.add(x.trim())); }
    p.els=p.els.filter(o=>!(o.type==='Class Feature' && o.id.startsWith('ID_HB_') && !(o.cats||[]).length && !refs.has(o.id)));
    d.own=mine;
  },
  setStatus(t){ this.status=t; const s=document.getElementById('wsStatus'); if(s) s.textContent=t; },

  /* ---------- page ---------- */
  render(){
    const root=$('#workshop'); if(!root) return;
    if(!RULES.db){ root.replaceChildren(el('div',{class:'bnote'},el('h2',{text:'Builder data not loaded'}),el('p',{text:'The workshop needs the Character Builder files in your Libraries folder.'}))); return; }
    const y=$('#wsMain')?.scrollTop||0;
    root.replaceChildren(this.side(), el('section',{id:'wsMain'}, this.main()));
    $('#wsMain').scrollTop=y;
  },
  side(){
    const packs=el('div',{class:'wslist'});
    for(const p of this.packs) packs.append(el('button',{type:'button',class:'wsrow'+(p===this.cur?' on':''),onclick:()=>this.openPack(p)},
      el('span',{class:'fname',text:p.name}), el('small',{text:p.error?'!':String(p.els.length+p.ops.length)})));
    if(!this.packs.length) packs.append(el('p',{class:'muted small',text:'No homebrew yet. A pack is one file holding as much as you like: new classes, changes to official ones, and more later.'}));
    return el('nav',{id:'wsSide'},
      el('div',{class:'wshead'}, el('b',{text:'Homebrew packs'})),
      packs,
      el('button',{class:'btn small',type:'button',text:'+ New pack',onclick:()=>this.newPack()}),
      el('p',{class:'muted small',text:'Packs are files in Libraries\\Homebrew, in the original Character Builder\'s format. Share a pack by giving someone its file; take one out of the folder to switch it off.'}));
  },
  main(){
    const p=this.cur;
    if(!p) return el('div',{class:'bnote'}, el('h2',{text:'Homebrew workshop'}),
      el('p',{text:'Make your own classes, or change official ones. Everything you make goes into a pack, and characters using it are marked homebrew.'}),
      el('button',{class:'btn primary',type:'button',text:'+ New pack',onclick:()=>this.newPack()}));
    if(this.draft) return this.classEditor();
    if(this.bg) return this.bgEditor();
    if(this.feat) return this.featEditor();
    if(this.sp) return this.spEditor();
    if(this.th) return this.themeEditor();
    if(this.item) return this.itemEditor();
    const classes=p.els.filter(o=>o.type==='Class');
    const other=p.els.length-p.els.filter(o=>this.ownedByClass(p,o) || /^(Background|Background Choice|Feat|Theme|Paragon Path|Epic Destiny|Magic Item|Weapon|Armor|Gear|Race|Grants|Racial Trait)$/.test(o.type) || /_PROFICIENCY(_FEAT)?$/.test(o.id) || (o.type==='Power' && (!hbSp(o,'Class') || isThemePower(o) || isPathOwnedPower(o)))).length;
    const otherOps=p.ops.filter(o=>!classes.some(c=>classOwnsOp(c.id,o,new Set()))).length;
    const list=el('div',{class:'cards'});
    for(const c of classes){
      const off=!c.id.startsWith('ID_HB_');
      list.append(el('div',{class:'ccard'},
        el('div',{}, el('b',{class:'cname',text:c.name}), off?el('span',{class:'hb small',text:'changed'}):el('span',{class:'hb small',text:'new'})),
        el('div',{class:'muted small',text:[hbEl(hbSp(c,'_RoleElement'))?.name, hbEl(hbSp(c,'_PowerSourceElement'))?.name].filter(Boolean).join(' · ')||'Class'}),
        el('div',{class:'brow wrap'},
          el('button',{class:'btn small',type:'button',text:'Edit',onclick:()=>this.editClass(c.id)}),
          el('button',{class:'btn small',type:'button',text:'Delete',title:off?'Delete this pack\'s changes: the official class is back as it was':'Delete this class',onclick:()=>this.removeClass(c.id)}))));
    }
    if(!classes.length) list.append(el('p',{class:'muted',text:'No classes in this pack yet.'}));
    return el('div',{class:'bcard wide'},
      el('div',{class:'stephead'}, el('h3',{text:p.name}), el('span',{id:'wsStatus',class:'muted small',text:this.status}),
        el('button',{class:'btn small',type:'button',text:'Rename',onclick:()=>this.renamePack()}),
        el('button',{class:'btn small',type:'button',text:'Show file',onclick:()=>OC.showPack(p.name)}),
        el('button',{class:'btn small',type:'button',text:'Delete pack',onclick:()=>this.deletePack()})),
      p.error?el('p',{class:'warn',text:'This file could not be read: '+p.error}):null,
      el('h4',{class:'wssub',text:'Classes'}),
      el('div',{class:'brow wrap'},
        el('button',{class:'btn primary small',type:'button',text:'+ New class',onclick:()=>this.newClassDlg()}),
        el('button',{class:'btn small',type:'button',text:'Change an official class',onclick:()=>this.changeClassDlg()})),
      list,
      el('h4',{class:'wssub',text:'Backgrounds'}),
      el('div',{class:'brow wrap'},
        el('button',{class:'btn primary small',type:'button',text:'+ New background',onclick:()=>this.newBgDlg()}),
        el('button',{class:'btn small',type:'button',text:'Change an official background',onclick:()=>this.changeBgDlg()})),
      (()=>{ const bl=el('div',{class:'cards'}); const bgs=p.els.filter(o=>o.type==='Background');
        for(const b of bgs){ const off=!b.id.startsWith('ID_HB_');
          bl.append(el('div',{class:'ccard'}, el('div',{}, el('b',{class:'cname',text:b.name}), el('span',{class:'hb small',text:off?'changed':'new'})),
            el('div',{class:'muted small',text:[hbSp(b,'type')||hbSp(b,'Type'), hbSp(b,'Campaign')].filter(Boolean).join(' · ')||'Background'}),
            el('div',{class:'brow wrap'}, el('button',{class:'btn small',type:'button',text:'Edit',onclick:()=>this.editBg(b.id)}),
              el('button',{class:'btn small',type:'button',text:'Delete',onclick:()=>this.removeBg(b.id)})))); }
        if(!bgs.length) bl.append(el('p',{class:'muted',text:'No backgrounds in this pack yet.'})); return bl; })(),
      el('h4',{class:'wssub',text:'Feats'}),
      el('div',{class:'brow wrap'},
        el('button',{class:'btn primary small',type:'button',text:'+ New feat',onclick:()=>this.newFeatDlg()}),
        el('button',{class:'btn small',type:'button',text:'Change an official feat',onclick:()=>this.changeFeatDlg()})),
      this.entryCards(p.els.filter(o=>o.type==='Feat'), e=>hbSp(e,'Tier')||'Feat', id=>this.editFeat(id), id=>this.removeFeat(id), 'No feats in this pack yet.'),
      el('h4',{class:'wssub',text:'Powers (not of a class)'}),
      el('p',{class:'muted small',text:'Feat powers, racial powers, skill powers, and any power a feat, background or race gives. A class\'s own powers are made in the class.'}),
      el('div',{class:'brow wrap'},
        el('button',{class:'btn primary small',type:'button',text:'+ New power',onclick:()=>this.newSpDlg()}),
        el('button',{class:'btn small',type:'button',text:'Change an official power',onclick:()=>this.changeSpDlg()})),
      this.entryCards(p.els.filter(o=>o.type==='Power' && !hbSp(o,'Class') && !isThemePower(o) && !isPathOwnedPower(o)), e=>hbSp(e,'Display')||'Power', id=>this.editSp(id), id=>this.removeSp(id), 'No powers of this kind in this pack yet.'),
      el('h4',{class:'wssub',text:'Themes'}),
      el('div',{class:'brow wrap'},
        el('button',{class:'btn primary small',type:'button',text:'+ New theme',onclick:()=>this.newThemeDlg()}),
        el('button',{class:'btn small',type:'button',text:'Change an official theme',onclick:()=>this.changeThemeDlg()})),
      this.entryCards(p.els.filter(o=>o.type==='Theme'), e=>e.ppre||'Theme', id=>this.editTheme(id), id=>this.removeTheme(id), 'No themes in this pack yet.'),
      ...['Paragon Path','Epic Destiny'].flatMap(k=>{ const K=PATH_KINDS[k]; return [
        el('h4',{class:'wssub',text:K.plural}),
        el('div',{class:'brow wrap'},
          el('button',{class:'btn primary small',type:'button',text:'+ New '+K.label,onclick:()=>this.newThemeDlg(k)}),
          el('button',{class:'btn small',type:'button',text:'Change an official '+K.label,onclick:()=>this.changeThemeDlg(k)})),
        this.entryCards(p.els.filter(o=>o.type===k), e=>e.ppre||K.label, id=>this.editTheme(id), id=>this.removeTheme(id), 'None in this pack yet.')]; }),
      el('h4',{class:'wssub',text:'Races'}),
      el('div',{class:'brow wrap'},
        el('button',{class:'btn primary small',type:'button',text:'+ New race',onclick:()=>this.newRaceDlg()}),
        el('button',{class:'btn small',type:'button',text:'Change an official race',onclick:()=>this.changeRaceDlg()})),
      this.entryCards(p.els.filter(o=>o.type==='Race'), e=>hbSp(e,'Short Description')||'Race', id=>this.editRace(id), id=>this.removeRace(id), 'No races in this pack yet.'),
      el('h4',{class:'wssub',text:'Items'}),
      el('div',{class:'brow wrap'},
        el('button',{class:'btn primary small',type:'button',text:'+ New item',onclick:()=>this.newItemDlg()}),
        el('button',{class:'btn small',type:'button',text:'Change an official item',onclick:()=>this.changeItemDlg()})),
      this.entryCards(p.els.filter(o=>ITEM_KINDS[o.type]), e=>[hbSp(e,'Magic Item Type')||ITEM_KINDS[e.type].label, hbSp(e,'Level')&&'level '+hbSp(e,'Level')].filter(Boolean).join(', '), id=>this.editItem(id), id=>this.removeItem(id), 'No items in this pack yet.'),
      (other||otherOps)?el('p',{class:'muted small',text:`This pack also holds ${other+otherOps} other entr${other+otherOps===1?'y':'ies'} (made elsewhere, or for a later part of the workshop). They are kept as they are.`}):null);
  },
  // a list of a pack's entries of one kind, with Edit and Delete
  entryCards(list, sub, edit, remove, none){
    const bl=el('div',{class:'cards'});
    for(const b of list){ const off=!b.id.startsWith('ID_HB_');
      bl.append(el('div',{class:'ccard'}, el('div',{}, el('b',{class:'cname',text:b.name}), el('span',{class:'hb small',text:off?'changed':'new'})),
        el('div',{class:'muted small',text:sub(b)}),
        el('div',{class:'brow wrap'}, el('button',{class:'btn small',type:'button',text:'Edit',onclick:()=>edit(b.id)}),
          el('button',{class:'btn small',type:'button',text:'Delete',onclick:()=>remove(b.id)})))); }
    if(!list.length) bl.append(el('p',{class:'muted',text:none}));
    return bl;
  },
  ownedByClass(p,o){ const cls=p.els.filter(x=>x.type==='Class'); return o.type==='Class' || o.type==='Category' || /^ID_HB_.*_(FEAT_IMPLEMENT|VERSATILE)_EXPERTISE_/.test(o.id) || cls.some(c=>o.id===c.id.replace('_CLASS_','_GRANTS_') || o.id===c.id.replace('_CLASS_','_COUNTSAS_') || (o.cats||[]).includes(c.id) || hbSp(o,'_SupportsID')===c.id) ||
    (o.type==='Class Feature'); },

  /* ---------- packs ---------- */
  async newPack(){
    const name=await hbAsk('Name of the new pack','My homebrew'); if(!name) return;
    if(this.packs.some(p=>p.name.toLowerCase()===name.toLowerCase())) return alertMsg('There is already a pack with that name.');
    const p={name, els:[], ops:[]}; this.packs.push(p); this.cur=p; this.draft=null;
    this.dirtyPack=p; await this.save(); this.render();
  },
  openPack(p){ if(this.dirtyPack) this.save(); this.cur=p; this.draft=null; this.bg=null; this.feat=null; this.sp=null; this.th=null; this.item=null; this.status=''; this.render(); },
  async renamePack(){
    const p=this.cur, name=await hbAsk('New name for the pack',p.name); if(!name || name===p.name) return;
    if(this.packs.some(x=>x!==p && x.name.toLowerCase()===name.toLowerCase())) return alertMsg('There is already a pack with that name.');
    const old=p.name; p.name=name;
    try{ await OC.savePack(name, packXml(p), old); await loadHomebrew(true); }catch(e){ p.name=old; return alertMsg('Could not rename: '+e.message); }
    this.render();
  },
  async deletePack(){
    const p=this.cur; if(!await confirmMsg(`Delete the pack "${p.name}"? Its file is moved to Libraries\\Homebrew\\Deleted, so it can be brought back.`)) return;
    await OC.deletePack(p.name); this.packs=this.packs.filter(x=>x!==p); this.cur=null; this.draft=null; await loadHomebrew(true); this.render();
  },

  /* ---------- classes ---------- */
  classOptions(){ return typeEls('Class').filter(e=>!HIDDEN_CLASS.test(e.id)).sort(byName); },
  async newClassDlg(){
    const r=await formDlg('New class',[
      {key:'name',label:'Name',value:''},
      {key:'from',label:'Start from',type:'select',options:[['','Nothing (a blank class)'],...this.classOptions().map(e=>[e.id,'A copy of '+e.name+(e.hb?' (homebrew)':'')])]}]);
    if(!r || !r.name.trim()) return;
    this.draft=newClassDraft(this.cur, r.name.trim(), r.from||'');
    this.tab='basics'; this.changed(); this.render();
  },
  async changeClassDlg(){
    const r=await formDlg('Change an official class',[{key:'id',label:'Class',type:'select',options:this.classOptions().filter(e=>!e.hb||e.hbReplaces).map(e=>[e.id,e.name])}],
      'Your changes go into this pack. The official class itself is not touched: take the pack away and it is as it was.');
    if(!r || !r.id) return;
    this.editClass(r.id);
  },
  editClass(id){ const d=classDraft(id); if(!d) return alertMsg('That class is not in the rules any more.'); this.draft=d; this.tab='basics'; this.status=''; this.render(); },
  async removeClass(id){
    const p=this.cur, e=p.els.find(o=>o.id===id), off=!id.startsWith('ID_HB_');
    if(!await confirmMsg(off?`Delete this pack's changes to ${e.name}? The official ${e.name} is back as it was.`:`Delete ${e.name} from this pack? Characters with this class lose it.`)) return;
    const d=classDraft(id); this.draft=null;
    const mine=new Set(d?d.own:[id]);
    p.els=p.els.filter(o=>!mine.has(o.id) && !(o.type==='Build' && (o.cats||[]).includes(id)));
    p.ops=p.ops.filter(o=>!classOwnsOp(id,o,mine));
    this.dirtyPack=p; await this.save(); this.render();
  },
  close(){ this.save(); this.draft=null; this.bg=null; this.feat=null; this.sp=null; this.th=null; this.item=null; this.powerOpen=null; this.render(); },

  /* ---------- powers of no class ---------- */
  spContext(main, pdefs){ return {main, pdefs, powers:Object.keys(pdefs), own:new Set(Object.keys(pdefs)), keys:['Strength'], id:'', name:''}; },
  async newSpDlg(){
    const r=await formDlg('New power',[{key:'name',label:'Name',value:''},
      {key:'from',label:'Start from',type:'select',options:[['Attack','A blank attack power'],['Utility','A blank utility power'],['copy','A copy of a power (choose it next)…']]}]);
    if(!r || !r.name.trim()) return;
    this.draft=null; this.bg=null; this.feat=null;
    if(r.from==='copy'){
      const src=(await pickEls({title:'A copy of which power?',types:['Power']}))[0]; if(!src) return;
      const q=powerFrom(hbEl(src)), id=uniqueId('ID_HB_'+slugId(this.cur.name)+'_POWER_'+slugId(r.name.trim()));
      Object.assign(q,{id, isNew:true, name:r.name.trim(), standalone:true, children:[], orig:''});
      if(q.display===undefined){ q.display=hbSp(hbEl(src),'Display').replace(/^\S+\s+(?=(Attack|Utility|Feature))/,'Feat ').replace(/Feat (Attack|Feature)\b.*/,'Feat Power').replace(/Feat Utility.*/,'Feat Utility'); q.level=0; q.pre=''; delete q.ptype; }
      this.sp=this.spContext(id,{[id]:q});
    } else {
      this.sp=this.spContext('',{}); this.sp.name=r.name.trim(); const id=this.newPower(r.from,false); const q=this.sp.pdefs[id]; q.name=r.name.trim(); this.sp.main=id;
    }
    this.powerOpen=this.sp.main; this.changed(); this.render();
  },
  async changeSpDlg(){ const ids=await pickEls({title:'Change an official power',types:['Power']}); if(ids[0]) this.editSp(ids[0]); },
  editSp(id){
    const e=hbEl(id); if(!e) return alertMsg('That power is not in the rules any more.');
    const pdefs={[id]:{...powerFrom(e), isNew:!!e.hb && !e.hbReplaces}};
    for(const c of pdefs[id].children){ const ce=hbEl(c); if(ce) pdefs[c]={...powerFrom(ce), isNew:!!ce.hb && !ce.hbReplaces}; }
    this.draft=null; this.bg=null; this.feat=null; this.sp=this.spContext(id,pdefs); this.powerOpen=id; this.status=''; this.render();
  },
  applySp(){
    const p=this.cur;
    for(const q of Object.values(this.sp.pdefs)){
      if(!q.isNew && JSON.stringify(powerCore(q))===q.orig) continue;
      const cls=hbSp(hbEl(q.id),'Class'), o=powerEl(q, q.standalone||!cls ? null : {id:cls, name:hbEl(cls)?.name||''}, p.name);
      for(const k of q.keywords) ensureKeyword(p,k);
      p.els=p.els.filter(x=>x.id!==q.id).concat([o]);
    }
  },
  async removeSp(id){
    const p=this.cur, e=p.els.find(o=>o.id===id), off=!id.startsWith('ID_HB_');
    if(!await confirmMsg(off?`Delete this pack's changes to ${e.name}? The official ${e.name} is back as it was.`:`Delete ${e.name} from this pack? Characters lose it.`)) return;
    this.sp=null; const kids=new Set((e.rules||[]).filter(([t,a])=>t==='grant' && a.type==='Power' && String(a.name).startsWith('ID_HB_')).map(([,a])=>a.name));
    p.els=p.els.filter(o=>o.id!==id && !kids.has(o.id)); this.dirtyPack=p; await this.save(); this.render();
  },
  spEditor(){
    const q=this.sp.pdefs[this.powerOpen] || this.sp.pdefs[this.sp.main];
    return el('div',{},
      el('div',{class:'stepwrap'}, el('div',{class:'stephead wsbar'},
        el('button',{class:'btn small',type:'button',text:'← '+this.cur.name,onclick:()=>this.close()}),
        el('h3',{text:q.name||'Unnamed power'}), el('span',{class:'hb small',text:q.isNew?'new power':'changing an official power'}),
        el('span',{id:'wsStatus',class:'muted small',text:this.status}), el('span',{style:'flex:1'}),
        el('button',{class:'btn primary small',type:'button',text:'Done',title:'Save and go back to the pack',onclick:()=>this.close()}))),
      this.powerEditor(q));
  },

  /* ---------- themes, paragon paths and epic destinies (one screen for the three) ---------- */
  async newThemeDlg(kind='Theme'){
    const K=PATH_KINDS[kind];
    const r=await formDlg('New '+K.label,[{key:'name',label:'Name',value:''},
      {key:'from',label:'Start from',type:'select',options:[['','Nothing (a blank '+K.label+')'],['copy','A copy of a '+K.label+' (choose it next)…']]}]);
    if(!r || !r.name.trim()) return;
    let from=''; if(r.from==='copy'){ from=(await pickEls({title:'A copy of which '+K.label+'?',types:[kind]}))[0]; if(!from) return; }
    this.draft=null; this.bg=null; this.feat=null; this.sp=null; this.item=null;
    const d=newThemeDraft(this.cur, r.name.trim(), from, kind);
    this.th=d;
    if(!from){ // a blank one starts with the features the official ones have
      for(const L of K.feats){ const fid=uniqueId('ID_HB_'+slugId(this.cur.name)+'_FEATURE_'+slugId(d.name)+'_'+L);
        d.fdefs[fid]={id:fid, isNew:true, name:K.feats.filter(x=>x===L).length>1?`${d.name} Feature ${L}${'abc'[d.rows.filter(x=>x.level===L).length]}`:`Level ${L} ${d.name} Feature`, level:L, short:'', text:'', effects:[], keep:[]}; d.own.add(fid); d.rows.push({id:fid, level:L}); }
    }
    else { // a copy's features and powers are copies too, under the new name
      const old=hbEl(from).name, rn=t=>String(t||'').split(old).join(d.name);
      d.rows=d.rows.map(r=>{ const f=d.fdefs[r.id], fid=uniqueId('ID_HB_'+slugId(this.cur.name)+'_FEATURE_'+slugId(rn(f.name)));
        d.fdefs[fid]={...JSON.parse(JSON.stringify({...f, own:undefined})), id:fid, isNew:true, name:rn(f.name), orig:''}; delete d.fdefs[r.id]; d.own.add(fid); return {id:fid, level:r.level}; });
      const copyPower=src=>{ const e=hbEl(src); if(!e || !isPathPower(e,{...d,id:from,name:old}) && !(e.cats||[]).includes('ID_FMP_CLASS_0')) return src;
        const q=powerFrom(e), pid=uniqueId('ID_HB_'+slugId(this.cur.name)+'_POWER_'+slugId(e.name));
        Object.assign(q,{id:pid, isNew:true, standalone:true, name:e.name, display:rn(q.display), pre:rn(q.pre)||d.name, children:[], orig:''}); delete q.keep.spec['Class'];
        if(kind==='Theme'){ q.keep.spec={...q.keep.spec, '_ThemePower':d.id}; if(!q.keep.cats.includes('ID_FMP_CLASS_0')) q.keep.cats.push('ID_FMP_CLASS_0'); }
        else q.keep.cats=[...q.keep.cats.filter(c=>c!==from), d.id];
        d.pdefs[pid]=q; d.powers.push(pid); d.own.add(pid); return pid; };
      for(const f of Object.values(d.fdefs)) for(const x of f.effects) if(x.kind==='power' && x.id) x.id=copyPower(x.id);
      d.utils=d.utils.map(copyPower); d.gpowers=d.gpowers.map(g=>({...g, id:copyPower(g.id)})); }
    this.powerOpen=null; this.changed(); this.render();
  },
  async changeThemeDlg(kind='Theme'){ const ids=await pickEls({title:'Change an official '+PATH_KINDS[kind].label,types:[kind]}); if(ids[0]) this.editTheme(ids[0]); },
  // the powers of a theme, path or destiny: its utilities, the ones it gives, and the ones its features give
  thPowerIds(d){ return [...d.utils, ...(d.gpowers||[]).map(g=>g.id), ...Object.values(d.fdefs).flatMap(f=>f.effects.filter(x=>x.kind==='power' && x.id).map(x=>x.id))]; },
  editTheme(id){ const d=themeDraft(id); if(!d) return alertMsg('That is not in the rules any more.'); this.draft=null; this.bg=null; this.feat=null; this.sp=null; this.item=null; this.th=d; this.powerOpen=null; this.status='';
    // an official one renamed before its powers followed the name: they follow now
    const was=baseEl(id)?.name;
    if(was && was!==d.name) for(const pid of this.thPowerIds(d)){ const e=hbEl(pid);
      if(e && isPathPower(e,{...d,name:was}) && String(e.pre||'').trim()===was){ const q=this.thPower(pid); q.pre=d.name; if(String(q.display||'').startsWith(was+' ')) q.display=d.name+q.display.slice(was.length); this.changed(); } }
    this.render(); },
  // whether a power is this one's own (a theme's: no class, open to all, needing the theme; a path's: listed under it)
  isThPower(id){ const e=hbEl(id), d=this.th; if(d?.pdefs[id]?.isNew) return true; if(!e || !d) return false;
    if(d.kind==='Race') return (e.cats||[]).some(c=>c===d.id || d.rows.some(r=>r.id===c)) || hbSp(e,'Class')===d.id;
    return d.kind==='Theme' ? isThemePower(e) && (String(e.pre||'').trim()===d.name || hbSp(e,'_ThemePower')===d.id || hbSp(e,'Class')===d.id) : isPathPower(e,d) && !hbSp(e,'Class'); },
  // a power chosen for it: a class power becomes its own copy (or, if so chosen, is used as it is)
  async asThemePower(id, util, level){
    const d=this.th, e=hbEl(id); if(!d || !e || this.isThPower(id)) return id;
    const K=pathKind(d), cls=hbEl(hbSp(e,'Class'))?.name;
    const r=await formDlg('Use '+e.name+' in '+d.name,[
      {key:'how',label:'How',type:'select',options:[['copy',`${d.name}'s own power (a copy, with no class)`],['keep','As it is'+(cls?` (it stays a ${cls} power)`:'')]]},
      {key:'name',label:'Name of the copy',value:e.name}],
      (util?`Characters with ${d.name} can choose ${d.name}'s own utility powers at their level; a power of a class stays that class's. `:d.kind==='Theme'?`${d.name}'s own power is shown as "${d.name} Attack", not as a power of a class. `:`${d.name}'s own power is shown as "${d.name} Attack ${level||''}" (or Utility), not as a power of a class. `)+'The copy can be changed without changing the official power. An official power with the same name as yours can confuse the original Character Builder, so give the copy a name of its own if you use CBLoader.');
    if(!r) return null; if(r.how==='keep') return id;
    const q=powerFrom(e), name=r.name.trim()||e.name, pid=uniqueId('ID_HB_'+slugId(this.cur.name)+'_POWER_'+slugId(name));
    let lvl=level||+q.level||0; if(util){ q.kind='Utility'; if(lvl<2) lvl=2; } else if(!lvl) lvl=1;
    const kw=q.kind==='Utility'?'Utility':'Attack';
    Object.assign(q,{id:pid, isNew:true, standalone:true, name, pre:d.name, level:lvl, display:d.kind==='Theme'?d.name+(util?' Utility '+lvl:' Attack'):`${d.name} ${kw} ${lvl}`, children:[], orig:''});
    if(d.kind==='Race') Object.assign(q,{pre:'', level:0, display:`${d.name} Racial ${kw}`});
    delete q.keep.spec['Class'];
    if(d.kind==='Theme'){ q.keep.cats=[...q.keep.cats.filter(c=>hbEl(c)?.type!=='Class'),'ID_FMP_CLASS_0']; q.keep.spec={...q.keep.spec,'_ThemePower':d.id}; }
    else q.keep.cats=[...q.keep.cats.filter(c=>hbEl(c)?.type!=='Class' && !PATH_KINDS[hbEl(c)?.type]), d.id];
    d.pdefs[pid]=q; d.powers.push(pid); d.own.add(pid); this.changed(); return pid;
  },
  // a power of it, made ready to edit
  thPower(id){ const d=this.th; if(d.pdefs[id]) return d.pdefs[id]; const e=hbEl(id); if(!e) return null;
    d.pdefs[id]={...powerFrom(e), isNew:!!e.hb && !e.hbReplaces}; if(!d.powers.includes(id)) d.powers.push(id); return d.pdefs[id]; },
  applyTh(){
    const d=this.th, p=this.cur;
    for(const q of Object.values(d.pdefs)) for(const k of q.keywords) ensureKeyword(p,k);
    const changedPw=Object.values(d.pdefs).filter(q=>q.isNew || JSON.stringify(powerCore(q))!==q.orig);
    const core=d.kind==='Race'?raceCore:themeCore;
    if(!d.isNew && JSON.stringify(core(d))===d.orig && !changedPw.length && Object.values(d.fdefs).every(f=>f.isNew?false:JSON.stringify(featCore(f))===f.orig)) return;
    const pwEl=q=>{ const cls=hbSp(hbEl(q.id),'Class'); return powerEl(q, q.standalone||!cls ? null : {id:cls, name:hbEl(cls)?.name||''}, p.name); };
    const te=d.kind==='Race'?raceEntries(d, p.name):themeEntries(d, p.name); if(!d.isNew && JSON.stringify(core(d))===d.orig) te.shift();   // only its features changed: it stays as it is
    const els=[...te, ...changedPw.map(pwEl)];
    // a feature or power of its own taken off it goes with it
    const used=new Set([d.id, ...(d.grantsId?[d.grantsId]:[]), ...d.rows.map(r=>r.id), ...this.thPowerIds(d),
      ...((d.subraces||[]).length?[d.subChoice||d.id+'_SUBRACE', ...d.subraces.flatMap(x=>[x.id, ...x.traits])]:[]), ...(d.newLangs||[]).map(l=>l.id)]);
    const mine=new Set([...d.own, ...els.map(o=>o.id)]);
    // entries already in the pack keep their place (a save without changes writes the same file)
    const keep=els.filter(o=>used.has(o.id) || !o.id.startsWith('ID_HB_')), by=new Map(keep.map(o=>[o.id,o]));
    p.els=p.els.map(o=>by.has(o.id) ? by.get(o.id) : o).filter(o=>by.has(o.id) || !mine.has(o.id) || used.has(o.id));
    for(const o of keep) if(!p.els.includes(o)) p.els.push(o);
    d.own=new Set([...mine].filter(i=>used.has(i)));
  },
  async removeTheme(id){
    const p=this.cur, e=p.els.find(o=>o.id===id), off=!id.startsWith('ID_HB_'), K=PATH_KINDS[e.type]||PATH_KINDS.Theme;
    if(!await confirmMsg(off?`Delete this pack's changes to ${e.name}? The official ${e.name} is back as it was.`:`Delete ${e.name} from this pack? Characters with this ${K.label} lose it.`)) return;
    const d=themeDraft(id); this.th=null;
    const mine=new Set(d ? [...d.own].filter(i=>i===id || i.startsWith('ID_HB_')) : [id]);
    if(d) for(const f of Object.values(d.fdefs)) if(f.isNew) for(const x of f.effects) if(x.kind==='power' && String(x.id).startsWith('ID_HB_')) mine.add(x.id);
    p.els=p.els.filter(o=>!mine.has(o.id)); this.dirtyPack=p; await this.save(); this.render();
  },
  themeEditor(){
    const d=this.th; if(d.kind==='Race' && !this.powerOpen) return this.raceEditor();
    const K=d.kind==='Race'?{label:'race'}:pathKind(d), theme=d.kind==='Theme';
    if(this.powerOpen && (d.pdefs[this.powerOpen] || this.thPower(this.powerOpen))) return el('div',{},
      el('div',{class:'stepwrap'}, el('div',{class:'stephead wsbar'},
        el('button',{class:'btn small',type:'button',text:'← '+(d.name||K.label),onclick:()=>{ this.powerOpen=null; this.render(); }}),
        el('h3',{text:d.pdefs[this.powerOpen].name||'Unnamed power'}), el('span',{class:'hb small',text:'a power of the '+K.label}),
        el('span',{id:'wsStatus',class:'muted small',text:this.status}), el('span',{style:'flex:1'}),
        el('button',{class:'btn primary small',type:'button',text:'Done',title:'Save and go back to the '+K.label,onclick:async()=>{ this.powerOpen=null; this.changed(); await this.save(); this.render(); $('#wsMain').scrollTop=0; }}))),
      this.powerEditor(d.pdefs[this.powerOpen]));
    const preview=el('div',{class:'entry wsprev'});
    const show=()=>{ try{ Builder.renderElement(preview,null,{...themeEntries({...d, orig:d.orig||''},this.cur.name)[0], hb:this.cur.name}); }catch(e){ preview.textContent=''; } };
    const f=(label,key,opts={})=>this.field(label,d[key],v=>d[key]=v,{...opts,after:show});
    const ppreF=this.field(theme?'Prerequisites (optional)':'Prerequisites',d.ppre,v=>{ const auto=d.pre===d.ppre; d.ppre=v; if(auto){ d.pre=v; const t=document.getElementById('wsThPre'); if(t) t.value=v; } },
      {placeholder:theme?'Elf or half-elf; trained in Nature':K.pre,hint:theme?'As players read them. Most themes have none.':d.kind==='Paragon Path'?'As players read them: usually a class ("Fighter class"), sometimes a race or a feat too.':'As players read them: usually "21st level".',after:show});
    const preF=this.field('Prerequisites the builders check',d.pre,v=>d.pre=v,{hint:'Filled in from the ones above.',after:show}); preF.querySelector('input').id='wsThPre';
    const go=id=>{ this.thPower(id); this.powerOpen=id; this.render(); $('#wsMain').scrollTop=0; };
    // its features, by level
    const rows=el('div',{});
    [...d.rows].sort((a,b)=>(+a.level||1)-(+b.level||1)).forEach(r=>{ const ft=this.fdef(r.id); ft.level=+r.level||1;
      const box=this.featureBox(ft, r);
      box.querySelector('.wsfhead')?.append(el('button',{class:'btn small',type:'button',text:'Remove',onclick:()=>{ d.rows.splice(d.rows.indexOf(r),1); this.changed(); this.render(); }}));
      rows.append(el('div',{class:'wsfeat'}, box)); });
    const card=(id, extra, onOwn, remove)=>{ const q=d.pdefs[id], e=hbEl(id), own=this.isThPower(id);
      return el('div',{class:'ccard'}, el('div',{}, el('b',{class:'cname',text:q?.name||e?.name||id})),
        el('div',{class:'muted small',text:q?.display||hbSp(e,'Display')||''}), extra||null,
        own ? null : el('div',{class:'warn small',text:theme?'A power of another class: characters can\'t choose it for the theme.':'A power of another class: it shows as that class\'s.'}),
        el('div',{class:'brow wrap'}, own ? el('button',{class:'btn small',type:'button',text:'Edit',onclick:()=>go(id)})
          : el('button',{class:'btn small',type:'button',text:'Make it '+(d.name||'the '+K.label)+'\'s own',onclick:onOwn}),
          el('button',{class:'btn small',type:'button',text:'Remove',onclick:remove}))); };
    let powersPart;
    if(theme){
      const utils=el('div',{class:'cards'}, ...d.utils.map((u,i)=>card(u, null, async()=>{ const v=await this.asThemePower(u,true); if(v){ d.utils[i]=v; this.render(); } }, ()=>{ d.utils.splice(i,1); this.changed(); this.render(); })));
      if(!d.utils.length) utils.append(el('p',{class:'muted',text:'No utility powers yet.'}));
      powersPart=[el('h4',{class:'wssub',text:'Utility powers'}),
        el('p',{class:'muted small',text:'Chosen at the utility levels (2, 6, 10…) by characters with the theme, in place of a class utility power. Their level says when.'}),
        utils,
        el('div',{class:'brow wrap'},
          el('button',{class:'btn small',type:'button',text:'+ New utility power',onclick:()=>{ const id=this.newPower('Utility',false); const q=d.pdefs[id];
            const L=[2,6,10].find(l=>!d.utils.some(u=>(d.pdefs[u]?.level||+hbSp(hbEl(u),'Level'))===l))||2; q.level=L; q.display=d.name+' Utility '+L;
            d.utils.push(id); this.changed(); go(id); }}),
          el('button',{class:'btn small',type:'button',text:'+ Existing…',onclick:async()=>{ const ids=await pickEls({title:'Utility powers',types:['Power'],multi:true,skip:new Set(d.utils)});
            for(const id of ids){ const v=await this.asThemePower(id,true); if(v) d.utils.push(v); } if(ids.length){ this.changed(); this.render(); } }}))];
    } else {
      // a path's or destiny's powers: given at their level, not chosen
      const lvlIn=g=>el('label',{class:'brow small'}, 'Gained at level ', el('input',{type:'number',min:1,max:30,value:g.level||'',style:'width:60px',onchange:ev=>{ const v=+ev.target.value||0, q=this.isThPower(g.id)?this.thPower(g.id):null;
        if(q){ const was=q.level; q.level=v; if(String(q.display||'').endsWith(' '+was)) q.display=q.display.slice(0,-String(was).length)+v; } g.level=v; this.changed(); this.render(); }}));
      const list=el('div',{class:'cards'}, ...[...d.gpowers].sort((a,b)=>(+a.level||0)-(+b.level||0)).map(g=>card(g.id, lvlIn(g),
        async()=>{ const v=await this.asThemePower(g.id,undefined,+g.level||0); if(v){ g.id=v; this.render(); } }, ()=>{ d.gpowers.splice(d.gpowers.indexOf(g),1); this.changed(); this.render(); })));
      if(!d.gpowers.length) list.append(el('p',{class:'muted',text:'No powers yet.'}));
      const next=()=>(K.powers||[]).find(([L])=>!d.gpowers.some(g=>+g.level===L))||[d.kind==='Epic Destiny'?26:11,'Attack','Encounter'];
      powersPart=[el('h4',{class:'wssub',text:'Powers'}),
        el('p',{class:'muted small',text:d.kind==='Paragon Path'?'Given at their level, not chosen: official paths give an encounter attack at 11th level, a utility at 12th and a daily attack at 20th.':'Given at their level, not chosen: official destinies give a utility at 26th level.'}),
        list,
        el('div',{class:'brow wrap'},
          el('button',{class:'btn small',type:'button',text:'+ New power',onclick:()=>{ const [L,kindP,usage]=next(); const id=this.newPower(kindP,false), q=d.pdefs[id];
            q.level=L; q.usage=usage; q.display=`${d.name} ${kindP} ${L}`; d.gpowers.push({id, level:L}); this.changed(); go(id); }}),
          el('button',{class:'btn small',type:'button',text:'+ Existing…',onclick:async()=>{ const ids=await pickEls({title:'Powers',types:['Power'],multi:true,skip:new Set(d.gpowers.map(g=>g.id))});
            for(const id of ids){ const L=next()[0], v=await this.asThemePower(id,undefined,L); if(v) d.gpowers.push({id:v, level:+(d.pdefs[v]?.level||hbSp(hbEl(v),'Level'))||L}); } if(ids.length){ this.changed(); this.render(); } }}))];
    }
    const box=el('div',{},
      el('div',{class:'stepwrap'}, el('div',{class:'stephead wsbar'},
        el('button',{class:'btn small',type:'button',text:'← '+this.cur.name,onclick:()=>this.close()}),
        el('h3',{text:d.name||'Unnamed '+K.label}), el('span',{class:'hb small',text:d.isNew?'new '+K.label:'changing an official '+K.label}),
        el('span',{id:'wsStatus',class:'muted small',text:this.status}), el('span',{style:'flex:1'}),
        el('button',{class:'btn primary small',type:'button',text:'Done',title:'Save and go back to the pack',onclick:()=>this.close()}))),
      el('div',{class:'bcard wide'}, el('div',{class:'wspowergrid'},
        el('div',{},
          el('div',{class:'wsgrid'},
            this.field('Name',d.name,v=>{ const old=d.name; d.name=v; if(d.pre===old) d.pre=v; if(d.ppre===old) d.ppre=v;
              // its powers need it by name: they follow the new one
              for(const id of this.thPowerIds(d)) if(d.pdefs[id] || hbEl(id) && isPathPower(hbEl(id),{...d,name:old})) this.thPower(id);
              for(const q of Object.values(d.pdefs)){ if(String(q.pre||'').trim()===old) q.pre=v; if(String(q.display||'').startsWith(old+' ')) q.display=v+q.display.slice(old.length); }
              const h=$('.wsbar h3'); if(h) h.textContent=v||'Unnamed '+K.label; },{after:show}),
            ppreF, preAdv(preF, d.pre!==d.ppre),
            f('Flavor (optional)','flavor',{area:true,rows:2}),
            f('Description','text',{area:true,rows:6,hint:theme?'What the theme is, and the advice for making one ("Creating a Guardian: …").':'What the '+K.label+' is.'}),
            d.kind==='Epic Destiny' ? f('Immortality','imm',{area:true,rows:4,hint:'How the character leaves the world at the end of the destiny.'}) : null),
          el('h4',{class:'wssub',text:'Features'}),
          el('p',{class:'muted small',text:K.help}),
          rows,
          el('div',{class:'brow wrap'},
            el('button',{class:'btn small',type:'button',text:'+ New feature',onclick:()=>{ const L=K.feats.find(l=>!d.rows.some(r=>+r.level===l))||K.feats[0];
              const fid=uniqueId('ID_HB_'+slugId(this.cur.name)+'_FEATURE_'+slugId(d.name)+'_'+L); d.fdefs[fid]={id:fid, isNew:true, name:`Level ${L} ${d.name} Feature`, level:L, short:'', text:'', effects:[], keep:[], open:true};
              d.own.add(fid); d.rows.push({id:fid, level:L}); this.changed(); this.render(); }}),
            el('button',{class:'btn small',type:'button',text:'+ Existing…',onclick:async()=>{ const ids=await pickEls({title:'Features',types:['Class Feature'],multi:true,skip:new Set(d.rows.map(r=>r.id))});
              for(const id of ids){ const ft=this.fdef(id); d.rows.push({id, level:+ft.level||K.feats[0]}); } if(ids.length){ this.changed(); this.render(); } }})),
          ...powersPart,
          el('details',{class:'wspmore',open:!!d.more.effects.length},
            el('summary',{text:'Other rules (advanced)'+(d.more.effects.length?' ('+d.more.effects.length+')':'')}),
            el('p',{class:'muted small',text:'Rules of the '+K.label+' itself, outside its features. A few official ones have some.'}),
            this.effects(d.more,{noSpellbook:true}))),
        el('div',{}, el('div',{class:'muted small',text:'How it looks'}), preview))));
    show(); return box;
  },

  /* ---------- races (on the theme screen's footing: its traits are features, its powers racial powers) ---------- */
  async newRaceDlg(){
    const r=await formDlg('New race',[{key:'name',label:'Name',value:''},
      {key:'from',label:'Start from',type:'select',options:[['','Nothing (a blank race)'],['copy','A copy of a race (choose it next)…']]}]);
    if(!r || !r.name.trim()) return;
    let from=''; if(r.from==='copy'){ from=(await pickEls({title:'A copy of which race?',types:['Race']}))[0]; if(!from) return; }
    this.draft=null; this.bg=null; this.feat=null; this.sp=null; this.item=null;
    const d=newRaceDraft(this.cur, r.name.trim(), from); this.th=d;
    if(from){ // a copy's racial traits and powers are copies too, under the new name
      const old=hbEl(from).name, rn=t=>String(t||'').split(old).join(d.name), oldTraits=new Set(d.rows.map(r=>r.id));
      const copyPower=src=>{ const e=hbEl(src); if(!e || hbSp(e,'Class') && hbEl(hbSp(e,'Class'))?.type==='Class') return src;
        const q=powerFrom(e), pid=uniqueId('ID_HB_'+slugId(this.cur.name)+'_POWER_'+slugId(e.name));
        Object.assign(q,{id:pid, isNew:true, standalone:true, name:e.name, display:rn(q.display), children:[], orig:''}); delete q.keep.spec['Class'];
        q.keep.cats=[...q.keep.cats.filter(c=>!oldTraits.has(c)), d.id]; d.pdefs[pid]=q; d.powers.push(pid); d.own.add(pid); return pid; };
      d.rows=d.rows.map(r=>{ const f=d.fdefs[r.id], fid=uniqueId('ID_HB_'+slugId(this.cur.name)+'_RACIAL_TRAIT_'+slugId(rn(f.name)));
        d.fdefs[fid]={...JSON.parse(JSON.stringify({...f, own:undefined})), id:fid, isNew:true, name:rn(f.name), orig:'', etype:'Racial Trait'}; delete d.fdefs[r.id]; d.own.add(fid);
        for(const x of d.fdefs[fid].effects) if(x.kind==='power' && x.id) x.id=copyPower(x.id);
        return {id:fid, level:1}; });
    }
    this.powerOpen=null; this.changed(); this.render();
  },
  async changeRaceDlg(){ const ids=await pickEls({title:'Change an official race',types:['Race']}); if(ids[0]) this.editRace(ids[0]); },
  editRace(id){ const d=raceDraft(id); if(!d) return alertMsg('That race is not in the rules any more.'); this.draft=null; this.bg=null; this.feat=null; this.sp=null; this.item=null; this.th=d; this.powerOpen=null; this.status=''; this.render(); },
  async removeRace(id){
    const p=this.cur, e=p.els.find(o=>o.id===id), off=!id.startsWith('ID_HB_');
    if(!await confirmMsg(off?`Delete this pack's changes to ${e.name}? The official ${e.name} is back as it was.`:`Delete ${e.name} from this pack? Characters of this race lose it.`)) return;
    const d=raceDraft(id); this.th=null;
    const mine=new Set(d ? [...d.own].filter(i=>i===id || i.startsWith('ID_HB_')) : [id]);
    if(d){ if(String(d.grantsId).startsWith('ID_HB_')) mine.add(d.grantsId);
      for(const f of Object.values(d.fdefs)) if(f.isNew) for(const x of f.effects) if(x.kind==='power' && String(x.id).startsWith('ID_HB_')) mine.add(x.id); }
    // an official race changed here: its changed Grants and traits go too, so it is all back as it was
    if(off && d){ const own=new Set([d.grantsId, ...d.rows.map(r=>r.id), ...(d.subraces||[]).flatMap(x=>[x.id,...x.traits])]);
      for(const o of p.els) if(own.has(o.id)) mine.add(o.id); }
    p.els=p.els.filter(o=>!mine.has(o.id)); this.dirtyPack=p; await this.save(); this.render();
  },
  // average height and weight: kept as the books write them (5' 6"-6' 2", 135-220 lb.); typed and shown in
  // centimetres and kilograms when Metric is on
  raceSizeFields(d, show){
    const metric=typeof Units!=='undefined' && Units.metric;
    if(!metric) return [this.field('Average height',d.avgH,v=>d.avgH=v,{placeholder:'5\' 6"-6\' 2"',after:show}), this.field('Average weight',d.avgW,v=>d.avgW=v,{placeholder:'135-220 lb.',after:show})];
    const inch=t=>{ const m=/(\d+)\s*'\s*(\d+)?/.exec(t); return m ? +m[1]*12+(+m[2]||0) : null; };
    const toCm=t=>{ const parts=String(t||'').split(/\s*[-–]\s*(?=\d+\s*')/); const v=parts.map(inch).filter(x=>x!=null); return v.length ? v.map(x=>Math.round(x*2.54)).join('-') : t; };
    const toFt=t=>{ const v=String(t||'').match(/\d+(\.\d+)?/g); if(!v || /'/.test(t)) return t; return v.map(n=>{ const i=Math.round(+n/2.54); return Math.floor(i/12)+"' "+(i%12)+'"'; }).join('-'); };
    const toKg=t=>{ const v=String(t||'').match(/\d+(\.\d+)?/g); return v ? v.map(n=>Math.round(+n*0.45359237)).join('-') : t; };
    const toLb=t=>{ const v=String(t||'').match(/\d+(\.\d+)?/g); return v ? v.map(n=>Math.round(+n/0.45359237)).join('-')+' lb.' : t; };
    return [this.field('Average height (cm)',d.avgH?toCm(d.avgH):'',v=>d.avgH=String(v).trim()?toFt(v):'',{placeholder:'168-188',hint:'Saved in feet and inches, as the books and CBLoader use.',after:show}),
      this.field('Average weight (kg)',d.avgW?toKg(d.avgW):'',v=>d.avgW=String(v).trim()?toLb(v):'',{placeholder:'61-100',hint:'Saved in pounds, as the books and CBLoader use.',after:show})];
  },
  // a subrace, as a card: its bonuses and traits
  subraceBox(d, x, show){
    const chips=(list,get,set)=>{ const box=el('div',{class:'chips'});
      for(const v of list){ const lab=el('label',{class:'chip'+(get().includes(v)?' on':'')}, el('input',{type:'checkbox',checked:get().includes(v),onchange:ev=>{ set(ev.target.checked?[...get().filter(y=>y!==v),v]:get().filter(y=>y!==v)); lab.classList.toggle('on',ev.target.checked); this.changed(); }}), v); box.append(lab); }
      return box; };
    const traits=el('div',{});
    for(const id of x.traits){ const ft=this.fdef(id); ft.etype='Racial Trait'; const b=this.featureBox(ft,null);
      b.querySelector('.wsfhead')?.append(el('button',{class:'btn small',type:'button',text:'Remove',onclick:()=>{ x.traits=x.traits.filter(t=>t!==id); this.changed(); this.render(); }}));
      traits.append(el('div',{class:'wsfeat'}, b)); }
    return el('details',{class:'wsfeat',open:!!x.open,ontoggle:ev=>x.open=ev.target.open},
      el('summary',{}, el('b',{text:x.name||'Unnamed subrace'}), ' ', el('span',{class:'muted small',text:x.short||''})),
      el('div',{class:'wsgrid'},
        this.field('Name',x.name,v=>x.name=v,{after:show}), this.field('Short description',x.short,v=>x.short=v,{after:show}),
        this.field('Description',x.text,v=>x.text=v,{area:true,rows:3,after:show,hint:'Shown when it is chosen. Left empty, it lists what the subrace gives: its bonuses and its traits.'})),
      el('div',{class:'wsfield full'}, el('span',{text:'Always +2 to'}), chips(ABIL6,()=>x.abilFixed,v=>x.abilFixed=v)),
      el('label',{class:'chip'+(x.abilAny?' on':'')}, el('input',{type:'checkbox',checked:x.abilAny,onchange:ev=>{ x.abilAny=ev.target.checked; if(x.abilAny) x.abilChoose=[]; this.changed(); this.render(); }}), '+2 to any one ability score of the player\'s choice'),
      x.abilAny ? null : el('div',{class:'wsfield full'}, el('span',{text:'+2 to one of these (the player chooses)'}), chips(ABIL6,()=>x.abilChoose,v=>x.abilChoose=v)),
      el('div',{class:'wsfield full'}, el('span',{text:'+2 racial bonus to'}), chips(SKILLS,()=>x.skills,v=>x.skills=v)),
      el('div',{class:'muted small',text:'Its racial traits (and powers):'}), traits,
      el('div',{class:'brow wrap'},
        el('button',{class:'btn small',type:'button',text:'+ New racial trait',onclick:()=>{ const fid=uniqueId('ID_HB_'+slugId(this.cur.name)+'_RACIAL_TRAIT_'+slugId(x.name||d.name));
          d.fdefs[fid]={id:fid, isNew:true, name:'New trait', level:1, short:'', text:'', effects:[], keep:[], open:true, etype:'Racial Trait'}; d.own.add(fid); x.traits.push(fid); x.open=true; this.changed(); this.render(); }}),
        el('button',{class:'btn small',type:'button',text:'+ Existing…',onclick:async()=>{ const ids=await pickEls({title:'Racial traits',types:['Racial Trait'],multi:true,skip:new Set(x.traits)}); for(const id of ids){ this.fdef(id); x.traits.push(id); } if(ids.length){ this.changed(); this.render(); } }}),
        el('span',{style:'flex:1'}),
        el('button',{class:'btn small',type:'button',text:'Remove this subrace',onclick:()=>{ d.subraces=d.subraces.filter(y=>y!==x); this.changed(); this.render(); }})),
      el('details',{class:'wspmore'}, el('summary',{text:'Other rules (advanced)'}), this.effects(x.more,{noSpellbook:true})));
  },
  raceEditor(){
    const d=this.th;
    const preview=el('div',{class:'entry wsprev'});
    const show=()=>{ try{ Builder.renderElement(preview,null,{...raceEntries({...d, orig:d.orig||''},this.cur.name)[0], hb:this.cur.name}); }catch(e){ preview.textContent=''; } };
    const sf=(k,label,kind)=>this.field(label,d.spec[k]||'',v=>d.spec[k]=v,{area:kind==='area',rows:kind==='area'?3:undefined,after:show});
    const chips=(list,chosen,set,words)=>{ const box=el('div',{class:'chips'});
      for(const v of list){ const lab=el('label',{class:'chip'+(chosen().includes(v)?' on':'')}, el('input',{type:'checkbox',checked:chosen().includes(v),onchange:ev=>{ set(ev.target.checked?[...chosen().filter(x=>x!==v),v]:chosen().filter(x=>x!==v)); lab.classList.toggle('on',ev.target.checked); this.changed(); show(); }}), words?words(v):v); box.append(lab); }
      return box; };
    const sizeSel=el('select',{}, ...[['ID_INTERNAL_SIZE_SMALL','Small'],['ID_INTERNAL_SIZE_MEDIUM','Medium']].map(([v,t])=>el('option',{value:v,text:t,selected:d.size===v})));
    sizeSel.onchange=()=>{ d.size=sizeSel.value; d.sizeText=''; this.changed(); show(); };
    const vis=RACE_VISION.find(([v])=>d.vision.includes(v))?.[0]||'ID_INTERNAL_VISION_NORMAL';
    const visSel=el('select',{}, ...RACE_VISION.map(([v,t])=>el('option',{value:v,text:t,selected:v===vis})));
    visSel.onchange=()=>{ d.vision=[visSel.value, ...d.vision.filter(v=>!RACE_VISION.some(([x])=>x===v))]; this.changed(); show(); };
    const langs=el('div',{class:'chosen'}, ...d.langs.map(l=>el('span',{class:'pill'}, hbEl(l)?.name||(d.newLangs||[]).find(x=>x.id===l)?.name||l, el('button',{class:'x',type:'button',text:'×',onclick:()=>{ d.langs=d.langs.filter(x=>x!==l); d.newLangs=(d.newLangs||[]).filter(x=>x.id!==l); this.changed(); this.render(); }}))),
      el('button',{class:'btn small',type:'button',text:'+ Language…',onclick:async()=>{ const ids=await pickEls({title:'Languages',types:['Language'],multi:true,skip:new Set(d.langs)}); if(ids.length){ d.langs.push(...ids); this.changed(); this.render(); } }}),
      el('button',{class:'btn small',type:'button',text:'+ A new language…',title:'A language of your own: the race knows it, and others can learn it as any language',onclick:async()=>{
        const r=await formDlg('A new language',[{key:'name',label:'Name',value:''},{key:'text',label:'About it (optional)',value:''}]); if(!r || !r.name.trim()) return;
        const id=uniqueId('ID_HB_'+slugId(this.cur.name)+'_LANGUAGE_'+slugId(r.name)); (d.newLangs ||= []).push({id, name:r.name.trim(), text:(r.text||'').trim()}); d.langs.push(id); d.own.add(id); this.changed(); this.render(); }}));
    const langN=el('select',{}, ...[0,1,2,3].map(n=>el('option',{value:n,text:n?String(n):'none',selected:+d.langChoice===n})));
    langN.onchange=()=>{ d.langChoice=+langN.value; this.changed(); show(); };
    const anyAb=el('input',{type:'checkbox',checked:!!d.abilAny,onchange:ev=>{ d.abilAny=ev.target.checked; if(d.abilAny) d.abilChoose=[]; this.changed(); this.render(); }});
    // racial traits
    const rows=el('div',{});
    for(const r of d.rows){ const ft=this.fdef(r.id); ft.etype='Racial Trait';
      const box=this.featureBox(ft, null);
      box.querySelector('.wsfhead')?.append(el('button',{class:'btn small',type:'button',text:'Remove',onclick:()=>{ d.rows.splice(d.rows.indexOf(r),1); this.changed(); this.render(); }}));
      rows.append(el('div',{class:'wsfeat'}, box)); }
    const box=el('div',{},
      el('div',{class:'stepwrap'}, el('div',{class:'stephead wsbar'},
        el('button',{class:'btn small',type:'button',text:'← '+this.cur.name,onclick:()=>this.close()}),
        el('h3',{text:d.name||'Unnamed race'}), el('span',{class:'hb small',text:d.isNew?'new race':'changing an official race'}),
        el('span',{id:'wsStatus',class:'muted small',text:this.status}), el('span',{style:'flex:1'}),
        el('button',{class:'btn primary small',type:'button',text:'Done',title:'Save and go back to the pack',onclick:()=>this.close()}))),
      el('div',{class:'bcard wide'}, el('div',{class:'wspowergrid'},
        el('div',{},
          el('div',{class:'wsgrid'},
            this.field('Name',d.name,v=>{ const old=d.name, up=x=>'~'+String(x).toUpperCase().replace(/[^A-Z0-9]+/g,'_'); if(d.pre===up(old)) d.pre=up(v); d.name=v;
              for(const q of Object.values(d.pdefs)) if(q.isNew && String(q.display||'').startsWith(old+' ')) q.display=v+q.display.slice(old.length);
              const h=$('.wsbar h3'); if(h) h.textContent=v||'Unnamed race'; },{after:show}),
            sf('Short Description','Short description'),
            el('label',{class:'wsfield'}, el('span',{text:'Size'}), sizeSel),
            this.field('Speed (squares)',d.speed,v=>d.speed=String(v).trim(),{after:show}),
            el('label',{class:'wsfield'}, el('span',{text:'Vision'}), visSel),
            ...this.raceSizeFields(d, show),
            this.field('Flavor (optional)',d.flavor,v=>d.flavor=v,{area:true,rows:2,after:show}),
            this.field('Description',d.text,v=>d.text=v,{area:true,rows:5,after:show}),
            sf('Characteristics','Characteristics'), sf('Physical Qualities','Physical qualities','area'), sf('Playing','Playing one','area'),
            sf('Male Names','Male names'), sf('Female Names','Female names')),
          el('h4',{class:'wssub',text:'Ability scores'}),
          el('p',{class:'muted small',text:'Official races give +2 to one ability, and +2 to one of two more that the player chooses. Humans give +2 to any one ability.'}),
          el('div',{class:'wsfield full'}, el('span',{text:'Always +2 to'}), chips(ABIL6,()=>d.abilFixed,v=>d.abilFixed=v)),
          el('label',{class:'chip'+(d.abilAny?' on':'')}, anyAb, '+2 to any one ability score of the player\'s choice'),
          d.abilAny ? null : el('div',{class:'wsfield full'}, el('span',{text:'+2 to one of these (the player chooses)'}), chips(ABIL6,()=>d.abilChoose,v=>d.abilChoose=v)),
          el('h4',{class:'wssub',text:'Skills and languages'}),
          el('div',{class:'wsfield full'}, el('span',{text:'+2 racial bonus to'}), chips(SKILLS,()=>d.skills,v=>d.skills=v)),
          el('div',{class:'wsfield full'}, el('span',{text:'Languages it always knows'}), langs),
          el('label',{class:'wsfield'}, el('span',{text:'Languages of the player\'s choice'}), langN),
          el('h4',{class:'wssub',text:'Racial traits'}),
          el('p',{class:'muted small',text:'What the race can do, each like a feature. A racial power: in a trait, "Gives a power", then "+ Make a new power".'}),
          rows,
          el('div',{class:'brow wrap'},
            el('button',{class:'btn small',type:'button',text:'+ New racial trait',onclick:()=>{ const fid=uniqueId('ID_HB_'+slugId(this.cur.name)+'_RACIAL_TRAIT_'+slugId(d.name));
              d.fdefs[fid]={id:fid, isNew:true, name:'New trait', level:1, short:'', text:'', effects:[], keep:[], open:true, etype:'Racial Trait'}; d.own.add(fid); d.rows.push({id:fid, level:1}); this.changed(); this.render(); }}),
            el('button',{class:'btn small',type:'button',text:'+ Existing…',onclick:async()=>{ const ids=await pickEls({title:'Racial traits',types:['Racial Trait'],multi:true,skip:new Set(d.rows.map(r=>r.id))});
              for(const id of ids){ this.fdef(id); d.rows.push({id, level:1}); } if(ids.length){ this.changed(); this.render(); } }})),
          el('h4',{class:'wssub',text:'Subraces'}),
          el('p',{class:'muted small',text:'Optional: kinds of the race the player chooses one of (as the dragonborn\'s draconians), each with its own bonuses, traits and powers. With subraces, the race\'s own ability and skill bonuses are usually left empty.'}),
          ...(d.subraces||[]).map(x=>this.subraceBox(d,x,show)),
          el('div',{class:'brow wrap'}, el('button',{class:'btn small',type:'button',text:'+ New subrace',onclick:()=>{ const id=uniqueId('ID_HB_'+slugId(this.cur.name)+'_SUBRACE_'+slugId(d.name));
            (d.subraces ||= []).push({id, isNew:true, name:'New subrace', short:'', text:'', abilFixed:[], abilChoose:[], abilAny:false, skills:[], traits:[], more:{id,name:'',effects:[],keep:[]}, open:true, orig:''}); d.own.add(id); this.changed(); this.render(); }})),
          el('details',{class:'wspmore',open:!!(d.more.effects.length||d.gmore.effects.length)},
            el('summary',{text:'Other rules (advanced)'+((d.more.effects.length+d.gmore.effects.length)?' ('+(d.more.effects.length+d.gmore.effects.length)+')':'')}),
            this.field('Prerequisites the builders check',d.pre,v=>d.pre=v,{hint:'"~'+String(d.name).toUpperCase().replace(/[^A-Z0-9]+/g,'_')+'": a character can\'t take it as a second race.',after:show}),
            el('p',{class:'muted small',text:'Rules of the race itself (a choice of racial trait, a bonus…):'}), this.effects(d.more,{noSpellbook:true}),
            el('p',{class:'muted small',text:'Rules it always gives with its traits:'}), this.effects(d.gmore,{noSpellbook:true}))),
        el('div',{}, el('div',{class:'muted small',text:'How it looks'}), preview))));
    show(); return box;
  },

  /* ---------- items ---------- */
  async newItemDlg(){
    const r=await formDlg('New item',[{key:'name',label:'Name',value:''},
      {key:'type',label:'Kind',type:'select',options:[['Magic Item','A magic item'],['Weapon','A weapon'],['Armor','Armor or a shield'],['Gear','Gear (rope, a mount, food…)']]},
      {key:'from',label:'Start from',type:'select',options:[['','Nothing (a blank one)'],['copy','A copy of an item (choose it next)…']]}]);
    if(!r || !r.name.trim()) return;
    let from=''; if(r.from==='copy'){ from=(await pickEls({title:'A copy of which '+ITEM_KINDS[r.type].label+'?',types:[r.type]}))[0]; if(!from) return; }
    this.draft=null; this.bg=null; this.feat=null; this.sp=null; this.th=null;
    this.item=newItemDraft(this.cur, r.type, r.name.trim(), from); this.changed(); this.render();
  },
  async changeItemDlg(){ const ids=await pickEls({title:'Change an official item',types:['Magic Item','Weapon','Armor','Gear']}); if(ids[0]) this.editItem(ids[0]); },
  editItem(id){ const d=itemDraft(id); if(!d) return alertMsg('That item is not in the rules any more.'); this.draft=null; this.bg=null; this.feat=null; this.sp=null; this.item=null; this.th=null; this.item=d; this.status=''; this.render(); },
  applyItem(){
    const d=this.item, p=this.cur;
    if(!d.isNew && JSON.stringify(itemCore(d))===d.orig) return;
    const els=itemEntries(d, p.name), mine=new Set([...d.own, ...els.map(o=>o.id)]), by=new Map(els.map(o=>[o.id,o]));
    p.els=p.els.map(o=>by.has(o.id)?by.get(o.id):o).filter(o=>by.has(o.id) || !mine.has(o.id));
    for(const o of els) if(!p.els.includes(o)) p.els.push(o);
    // the proficiency listed under the weapon's kind: the one for its kind now
    const pid=d.id+'_PROFICIENCY';
    p.ops=(p.ops||[]).filter(o=>!(o.op==='append' && (o.rules||[]).some(([t,a])=>t==='grant' && a.name===pid))).concat(itemOps(d));
    d.own=new Set(els.map(o=>o.id));
  },
  async removeItem(id){
    const p=this.cur, e=p.els.find(o=>o.id===id), off=!id.startsWith('ID_HB_');
    if(!await confirmMsg(off?`Delete this pack's changes to ${e.name}? The official ${e.name} is back as it was.`:`Delete ${e.name} from this pack? Characters who have it lose it.`)) return;
    this.item=null; const pid=id+'_PROFICIENCY';
    p.els=p.els.filter(o=>o.id!==id && o.id!==pid && o.id!==pid+'_FEAT');
    p.ops=(p.ops||[]).filter(o=>!(o.op==='append' && (o.rules||[]).some(([t,a])=>t==='grant' && a.name===pid)));
    this.dirtyPack=p; await this.save(); this.render();
  },
  // the other enhancement bonuses of a "+1" item: +2 to +6, five levels apart, at the usual prices
  async itemSeries(){
    const d=this.item, p=this.cur; this.applyItem();
    const lvl=+d.spec['Level']||1, made=[];
    for(let n=2;n<=6;n++){ const L=lvl+5*(n-1); if(L>30) break;
      const name=d.name.replace(/\+1\s*$/,'+'+n); if(p.els.some(o=>o.name===name && o.type===d.type)) continue;
      const x=newItemDraft(p, d.type, name, null); Object.assign(x,{flavor:d.flavor, text:d.text, cats:[...d.cats], spec:{...d.spec}, more:JSON.parse(JSON.stringify(d.more))});
      x.more.id=x.id; x.spec['Level']=String(L); x.spec['Gold']=String(STD_PRICE[L]||x.spec['Gold']);
      if(x.spec['Enhancement']) x.spec['Enhancement']=x.spec['Enhancement'].replace(/\+1\b/g,'+'+n);
      for(const ef of x.more.effects){ if(/^\+?1$/.test(String(ef.value||'').trim()) && /enhancement/i.test(ef.type||'')) ef.value='+'+n; delete ef.rule; }
      for(const o of itemEntries(x, p.name)) p.els.push(o); made.push(name); }
    this.changed(); await this.save(); this.render();
    alertMsg(made.length ? 'Made '+made.join(', ')+'. Each is an item of its own: open one to change it.' : 'They are in the pack already.');
  },
  itemEditor(){
    const d=this.item, K=ITEM_KINDS[d.type];
    const preview=el('div',{class:'entry wsprev'});
    const show=()=>{ try{ Builder.renderElement(preview,null,{...itemEntries({...d, orig:d.orig||''},this.cur.name)[0], hb:this.cur.name}); }catch(e){ preview.textContent=''; } };
    const spf=([k,label,kind,opts,cond])=>{
      if(typeof opts==='function'){ cond=opts; opts=null; } if(typeof cond==='function' && !cond(d)) return null;
      if(kind==='select'){ const list=[...opts]; if(d.spec[k] && !list.includes(d.spec[k])) list.push(d.spec[k]);
        const sl=el('select',{}, ...list.map(o=>el('option',{value:o,text:o||'(none)',selected:o===(d.spec[k]||'')})));
        sl.onchange=()=>{ d.spec[k]=sl.value; if(k==='Magic Item Type' && SLOT_OF[sl.value]!==undefined) d.spec['Item Slot']=SLOT_OF[sl.value]; else if(k==='Magic Item Type' && /^(Weapon|Armor)$/.test(sl.value)) d.spec['Item Slot']='';
          this.changed(); this.render(); };
        return el('label',{class:'wsfield'}, el('span',{text:label}), sl); }
      if(k==='Weight' && typeof Units!=='undefined' && Units.metric){ const kg=Units.U.pound[0], v0=d.spec[k];
        return this.field('Weight (kg)', v0 && !isNaN(+v0) ? String(Math.round(+v0*kg*100)/100) : v0||'', v=>{ const t=String(v).trim(); d.spec[k]=t && !isNaN(+t) ? String(Math.round(+t/kg*100)/100) : t; },
          {hint:'Shown in kilograms because Metric is on; saved in pounds, as the books and CBLoader use.', after:show}); }
      const fl=this.field(label, d.spec[k]||'', v=>{ const was=d.spec[k]; d.spec[k]=String(v).trim();
          // the usual price for the level, unless a price of its own was set
          if(k==='Level' && d.type==='Magic Item' && (!d.spec['Gold'] || +d.spec['Gold']===STD_PRICE[+was])){ d.spec['Gold']=String(STD_PRICE[+v]||''); const g=document.getElementById('wsItemGold'); if(g) g.value=d.spec['Gold']; } },
        {area:kind==='area', rows:kind==='area'?3:undefined, placeholder:kind!=='number'&&opts&&!Array.isArray(opts)?opts:'', hint:kind==='number'&&typeof opts==='string'?opts:undefined, after:show});
      if(k==='Gold') fl.querySelector('input').id='wsItemGold'; return fl;
    };
    const known=new Set(K.fields.map(f=>f[0]));
    const others=Object.keys(d.spec).filter(k=>!known.has(k) && d.spec[k]!=='');
    const box=el('div',{},
      el('div',{class:'stepwrap'}, el('div',{class:'stephead wsbar'},
        el('button',{class:'btn small',type:'button',text:'← '+this.cur.name,onclick:()=>this.close()}),
        el('h3',{text:d.name||'Unnamed item'}), el('span',{class:'hb small',text:d.isNew?'new '+K.label:'changing an official '+K.label}),
        el('span',{id:'wsStatus',class:'muted small',text:this.status}), el('span',{style:'flex:1'}),
        el('button',{class:'btn primary small',type:'button',text:'Done',title:'Save and go back to the pack',onclick:()=>this.close()}))),
      el('div',{class:'bcard wide'}, el('div',{class:'wspowergrid'},
        el('div',{},
          el('div',{class:'wsgrid'},
            this.field('Name',d.name,v=>{ d.name=v; const h=$('.wsbar h3'); if(h) h.textContent=v||'Unnamed item'; },{after:show}),
            ...K.fields.map(spf).filter(Boolean),
            this.field('Flavor (optional)',d.flavor,v=>d.flavor=v,{area:true,rows:2,after:show}),
            d.text || d.type!=='Magic Item' ? this.field('Text (optional)',d.text,v=>d.text=v,{area:true,rows:3,after:show,hint:'Shown under the details.'}) : null),
          d.type==='Magic Item' && d.isNew && /\+1\s*$/.test(d.name) ? el('div',{class:'brow wrap',style:'margin:8px 0'},
            el('button',{class:'btn small',type:'button',text:'Make the +2 to +6 versions',title:'Each five levels higher, at the usual price; "+1" in its enhancement and enhancement bonuses becomes +2, +3…',onclick:()=>this.itemSeries()}),
            el('small',{class:'muted',text:'Official magic weapons, armor and neck items come in each enhancement bonus, as items of their own.'})) : null,
          d.type==='Weapon' && d.id.startsWith('ID_HB_') ? el('p',{class:'muted small',text:'Characters proficient with its category ("'+(d.spec['Weapon Category']||'')+'")'+(d.copyOf&&hbEl(d.copyOf)?' or with the '+hbEl(d.copyOf).name.toLowerCase()+' it was copied from':'')+' are proficient with it; the Weapon Proficiency feat can choose it too.'}) : null,
          el('h4',{class:'wssub',text:'What it does'}),
          el('p',{class:'muted small',text:d.type==='Armor'?'Its armor bonus, check and speed penalties follow the details above. Add other bonuses here.':'Bonuses the builders add up (an enhancement bonus to defenses, a skill bonus…). Powers and conditional benefits are written in the details above.'}),
          this.effects(d.more,{noSpellbook:true}),
          el('details',{class:'wspmore',open:false},
            el('summary',{text:'Other details (advanced)'+(others.length?' ('+others.length+')':'')}),
            el('p',{class:'muted small',text:'Details the builders keep that aren\'t above, one "name = value" a line. Change with care.'}),
            (()=>{ const ta=el('textarea',{rows:Math.max(3,others.length+1),value:others.map(k=>k+' = '+d.spec[k]).join('\n')});
              ta.onchange=()=>{ for(const k of others) delete d.spec[k]; for(const line of ta.value.split('\n')){ const m=/^\s*([^=]+?)\s*=\s*(.*)$/.exec(line); if(m && !known.has(m[1])) d.spec[m[1]]=m[2].trim(); } this.changed(); show(); };
              return ta; })())),
        el('div',{}, el('div',{class:'muted small',text:'How it looks'}), preview))));
    show(); return box;
  },

  /* ---------- feats ---------- */
  async newFeatDlg(){
    const r=await formDlg('New feat',[{key:'name',label:'Name',value:''},
      {key:'from',label:'Start from',type:'select',options:[['','Nothing (a blank feat)'],['copy','A copy of a feat (choose it next)…']]}]);
    if(!r || !r.name.trim()) return;
    let from=''; if(r.from==='copy'){ from=(await pickEls({title:'A copy of which feat?',types:['Feat']}))[0]; if(!from) return; }
    this.feat=newFeatDraft(this.cur, r.name.trim(), from); this.changed(); this.render();
  },
  async changeFeatDlg(){ const ids=await pickEls({title:'Change an official feat',types:['Feat']}); if(ids[0]) this.editFeat(ids[0]); },
  editFeat(id){ const d=featDraft(id); if(!d) return alertMsg('That feat is not in the rules any more.'); this.feat=d; this.draft=null; this.bg=null; this.status=''; this.render(); },
  applyFeat(){
    const d=this.feat, p=this.cur;
    if(!d.isNew && JSON.stringify(featDraftCore(d))===d.orig) return;
    const els=featEntries(d, p.name); p.els=p.els.filter(o=>o.id!==d.id).concat(els);
  },
  async removeFeat(id){
    const p=this.cur, e=p.els.find(o=>o.id===id), off=!id.startsWith('ID_HB_');
    if(!await confirmMsg(off?`Delete this pack's changes to ${e.name}? The official ${e.name} is back as it was.`:`Delete ${e.name} from this pack? Characters with this feat lose it.`)) return;
    this.feat=null; p.els=p.els.filter(o=>o.id!==id); this.dirtyPack=p; await this.save(); this.render();
  },
  featEditor(){
    const d=this.feat, preview=el('div',{class:'entry wsprev'});
    const show=()=>{ try{ Builder.renderElement(preview,null,{...featEntries({...d, orig:d.orig||''},this.cur.name)[0], hb:this.cur.name}); }catch(e){ preview.textContent=''; } };
    const f=(label,key,opts={})=>this.field(label,d[key],v=>d[key]=v,{...opts,after:show});
    const groups=[...new Set(typeEls('Feat').map(e=>hbSp(e,'type')||hbSp(e,'Type')).filter(g=>g && !g.includes(',')))].sort();
    const featCats=[...new Set(typeEls('Feat').flatMap(e=>e.cats||[]))].map(id=>[id,hbEl(id)?.name||id]).sort((a,b)=>a[1].localeCompare(b[1]));
    const ppreF=this.field('Prerequisites',d.ppre,v=>{ const auto=d.pre===featPreFrom(d.ppre,d.tier) || !d.pre; d.ppre=v; if(auto){ d.pre=featPreFrom(v,d.tier); const t=document.getElementById('wsFeatPre'); if(t) t.value=d.pre; } },
      {placeholder:'Str 13, trained in Athletics, fighter',hint:'As players read them.',after:show});
    const preF=this.field('Prerequisites the builders check',d.pre,v=>d.pre=v,{hint:'Filled in from the ones above and the tier. Official feats sometimes add codes here ("~MULTICLASS": not having a multiclass feat).',after:show});
    preF.querySelector('input').id='wsFeatPre';
    const tierSel=this.select('Tier',d.tier,FEAT_TIERS.map(t=>[t,t]),v=>{ const auto=d.pre===featPreFrom(d.ppre,d.tier) || !d.pre; d.tier=v; if(auto){ d.pre=featPreFrom(d.ppre,v); const t=document.getElementById('wsFeatPre'); if(t) t.value=d.pre; } show(); });
    // the group: its label on the entry ("Divinity"), and the category of the same name rules look for, kept together
    const catOf=name=>typeEls('Category').find(c=>c.name.toLowerCase()===String(name).trim().toLowerCase())?.id;
    const grp=(()=>{ const sl=el('select',{}); sl.append(new Option('(none)','')); for(const g of groups) sl.append(new Option(g,g,false,g===d.group));
      if(d.group && !groups.includes(d.group)) sl.append(new Option(d.group,d.group,false,true));
      sl.append(new Option('Another (type it)…','\u0001'));
      sl.onchange=async()=>{ let v=sl.value; if(v==='\u0001'){ const r=await formDlg('Feat group',[{key:'g',label:'Name of the group',value:''}]); v=r?.g?.trim()||d.group; }
        const oc=catOf(d.group); if(oc) d.cats=d.cats.filter(c=>c!==oc); d.group=v; const nc=catOf(v); if(nc && !d.cats.includes(nc)) d.cats.push(nc); this.changed(); this.render(); };
      return el('label',{class:'wsfield'}, el('span',{text:'Feat group (optional)'}), sl,
        el('small',{class:'muted',text:'Feats that belong together (Divinity, Multiclass Wizard, Dragonmark…), shown on the entry; other rules can look for the group. Racial feats have no group of their own: they name the race under Prerequisites.'})); })();
    const box=el('div',{},
      el('div',{class:'stepwrap'}, el('div',{class:'stephead wsbar'},
        el('button',{class:'btn small',type:'button',text:'← '+this.cur.name,onclick:()=>this.close()}),
        el('h3',{text:d.name||'Unnamed feat'}), el('span',{class:'hb small',text:d.isNew?'new feat':'changing an official feat'}),
        el('span',{id:'wsStatus',class:'muted small',text:this.status}), el('span',{style:'flex:1'}),
        el('button',{class:'btn primary small',type:'button',text:'Done',title:'Save and go back to the pack',onclick:()=>this.close()}))),
      el('div',{class:'bcard wide'}, el('div',{class:'wspowergrid'},
        el('div',{},
          el('div',{class:'wsgrid'},
            this.field('Name',d.name,v=>{ d.name=v; const h=$('.wsbar h3'); if(h) h.textContent=v||'Unnamed feat'; },{after:show}),
            tierSel, ppreF, preAdv(preF, d.pre!==featPreFrom(d.ppre,d.tier)),
            f('Short description','short',{area:true,rows:2,hint:'One line: lists, and the character sheet (the original builder prints only this).'}),
            f('Flavor (optional)','flavor',{area:true,rows:2}),
            f('Benefit','text',{area:true,rows:5,hint:'What the feat does, in words.'}),
            f('Special (optional)','special',{area:true,rows:2,hint:'"You can take this feat more than once…"'}),
            grp,
            f('Associated powers (optional)','assoc',{hint:'Named in the entry ("Avenging Charge, Toppling Rush").'}),
            el('details',{class:'wsfield full wspmore'}, el('summary',{text:'Also listed under (advanced)'+(d.cats.length?' ('+d.cats.length+')':'')}), el('div',{class:'chosen'},
              ...d.cats.map((c,i)=>el('span',{class:'pick'}, hbEl(c)?.name||c, el('button',{class:'x',type:'button',text:'×',onclick:()=>{ d.cats.splice(i,1); this.changed(); this.render(); }}))),
              (()=>{ const sl=el('select',{}); sl.append(new Option('+ Add…','')); for(const [id,n] of featCats) if(!d.cats.includes(id)) sl.append(new Option(n,id));
                sl.onchange=()=>{ if(sl.value){ d.cats.push(sl.value); this.changed(); this.render(); } }; return sl; })()),
              el('small',{class:'muted',text:'The categories other rules search ("a multiclass feat"). The feat group above adds its own; most feats need nothing more here.'}))),
          el('h4',{class:'wssub',text:'What it does'}), this.effects(d.more,{noSpellbook:true})),
        el('div',{}, el('div',{class:'muted small',text:'How it looks'}), preview))));
    show(); return box;
  },

  /* ---------- backgrounds ---------- */
  async newBgDlg(){
    const r=await formDlg('New background',[{key:'name',label:'Name',value:''},
      {key:'from',label:'Start from',type:'select',options:[['','Nothing (a blank background)'],['copy','A copy of a background (choose it next)…']]}]);
    if(!r || !r.name.trim()) return;
    let from='';
    if(r.from==='copy'){ from=(await pickEls({title:'A copy of which background?',types:['Background']}))[0]; if(!from) return; }
    this.bg=newBgDraft(this.cur, r.name.trim(), from); this.changed(); this.render();
  },
  async changeBgDlg(){
    const ids=await pickEls({title:'Change an official background',types:['Background']}); if(!ids[0]) return;
    this.editBg(ids[0]);
  },
  editBg(id){ const d=bgDraft(id); if(!d) return alertMsg('That background is not in the rules any more.'); this.bg=d; this.draft=null; this.status=''; this.render(); },
  applyBg(){
    const d=this.bg, p=this.cur;
    // an official background unchanged: nothing written (and an earlier change of it in this pack stays)
    const oc=d.optRule?.[1].category, broken=!!oc && oc!==d.id && !/^ID_/.test(oc) && oc!==d.name;   // renamed earlier: its options' link is fixed
    if(!d.isNew && !broken && JSON.stringify(bgCore(d))===d.orig && d.options.every(o=>bgOptCore(o)===o.orig) && (!d.special || bgOptCore(d.special)===d.special.orig)) return;
    const els=bgEntries(d, p.name), mine=new Set([...d.own, ...els.map(o=>o.id), ...d.options.map(o=>o.id)]);
    p.els=p.els.filter(o=>!mine.has(o.id)).concat(els);
    p.ops=(p.ops||[]).filter(o=>!(o.op==='append' && (o.cats||[]).length===1 && o.cats[0]===d.id)).concat(els.ops);
    d.own=mine;
  },
  async removeBg(id){
    const p=this.cur, e=p.els.find(o=>o.id===id), off=!id.startsWith('ID_HB_');
    if(!await confirmMsg(off?`Delete this pack's changes to ${e.name}? The official ${e.name} is back as it was.`:`Delete ${e.name} from this pack? Characters with this background lose it.`)) return;
    this.bg=null;
    // its own options go with it; official options it borrowed are left as they were
    const nm=e?.name;
    p.els=p.els.filter(o=>o.id!==id && !(o.type==='Background Choice' && ((hbSp(o,'_SupportsID')===id || (o.cats||[]).includes(id) || String(o.pre||'').trim()===id) && o.id.startsWith('ID_HB_')
      || !o.id.startsWith('ID_HB_') && ((o.cats||[]).includes(id) || nm && (o.cats||[]).includes(nm) && !(baseEl(o.id)?.cats||[]).includes(nm)))));
    p.ops=(p.ops||[]).filter(o=>!(o.op==='append' && (o.cats||[]).length===1 && o.cats[0]===id));
    this.dirtyPack=p; await this.save(); this.render();
  },
  bgEditor(){
    const d=this.bg;
    const assoc=typeEls('Background Association').filter(e=>e.name!=='All').sort(byName);
    const opt=(o,i)=>{
      const head=el('div',{class:'brow wrap wsfhead'}, el('b',{text:o.name||'Unnamed option'}), el('span',{style:'flex:1'}),
        el('button',{class:'btn small',type:'button',text:o.open?'Close':'Edit',onclick:()=>{ o.open=!o.open; this.render(); }}),
        el('button',{class:'btn small',type:'button',text:'Remove',onclick:()=>{ d.options.splice(i,1); this.changed(); this.render(); }}));
      if(!o.open) return el('div',{class:'wsfeat'}, head, o.text?el('div',{class:'muted small',text:String(o.text).slice(0,160)}):null);
      return el('div',{class:'wsfeat'}, head, el('div',{class:'wsgrid'},
          this.field('Name',o.name,v=>{ o.name=v; head.querySelector('b').textContent=v||'Unnamed option'; }),
          this.field('Prerequisite',o.pre,v=>o.pre=v,{placeholder:'Optional: Dwarf, trained in History…',hint:'"~" means "not": ~DWARF is for characters who aren\'t dwarves.'}),
          this.field('Description',o.text,v=>o.text=v,{area:true,rows:3})),
        el('h4',{class:'wssub',text:'What it does'}), this.effects(o,{noSpellbook:true}));
    };
    const names=ids=>ids.map(i=>hbEl(i)?.name).filter(Boolean).join(', ');
    const list=(label,items,key,tkey)=>el('div',{class:'wsfield full'}, el('span',{text:label}),
      this.ticks(items.map(e=>[e.id,e.name]), d[key], v=>{ const auto=d[tkey]===names(d[key]) || !d[tkey]; d[key]=v; if(auto){ d[tkey]=names(v); const t=document.getElementById('ws_'+tkey); if(t) t.value=d[tkey]; } }),
      (()=>{ const f=this.field('As written in the entry',d[tkey],v=>d[tkey]=v,{hint:'Filled in from the ticks; write your own if they need words ("any one other than Abyssal or Supernal").'}); f.querySelector('input').id='ws_'+tkey; return f; })());
    const kinds=[...new Set(typeEls('Background').map(e=>hbSp(e,'type')||hbSp(e,'Type')).filter(Boolean))].sort();
    const camps=[...new Set(typeEls('Background').map(e=>hbSp(e,'Campaign')).filter(Boolean))].sort();
    const dl=(id,vals)=>document.getElementById(id)?null:el('datalist',{id}, ...vals.map(v=>el('option',{value:v})));
    const withList=(node,id)=>{ node.querySelector('input')?.setAttribute('list',id); return node; };
    return el('div',{},
      el('div',{class:'stepwrap'}, el('div',{class:'stephead wsbar'},
        el('button',{class:'btn small',type:'button',text:'← '+this.cur.name,onclick:()=>this.close()}),
        el('h3',{text:d.name||'Unnamed background'}), el('span',{class:'hb small',text:d.isNew?'new background':'changing an official background'}),
        el('span',{id:'wsStatus',class:'muted small',text:this.status}), el('span',{style:'flex:1'}),
        el('button',{class:'btn primary small',type:'button',text:'Done',title:'Save and go back to the pack',onclick:()=>this.close()}))),
      el('div',{class:'bcard wide'},
        el('div',{class:'wsgrid'},
          this.field('Name',d.name,v=>{ d.name=v; const h=$('.wsbar h3'); if(h) h.textContent=v||'Unnamed background'; }),
          withList(this.field('Kind',d.kind,v=>d.kind=v,{placeholder:'Geography, Occupation, Racial, Birth…'}),'wsBgKinds'),
          withList(this.field('Campaign setting',d.campaign,v=>d.campaign=v,{placeholder:'General, Forgotten Realms, Eberron…'}),'wsBgCamps'),
          this.field('Prerequisite',d.pre,v=>d.pre=v,{placeholder:'Optional: Dwarf; Dragonborn or tiefling…',hint:'A race background names its race here.'}),
          this.field('Short description',d.short,v=>d.short=v,{area:true,rows:2,hint:'Shown in lists.'}),
          this.field('Common knowledge',d.ck,v=>d.ck=v,{area:true,rows:5,hint:'What the character knows of the place, people or trade.'}),
          this.field('Benefit (text)',d.benefit,v=>d.benefit=v,{area:true,rows:3,hint:'Optional: a benefit of its own, in words, as the background\'s entry shows it. What it does goes under "Its own benefit" below.'}),
          dl('wsBgKinds',kinds), dl('wsBgCamps',camps)),
        el('h4',{class:'wssub',text:'Associated skills and languages'}),
        el('p',{class:'muted small',text:'The usual benefit of a background, picked by the player: +2 to one associated skill, training in it as a class skill, or one associated language.'}),
        list('Skills',assoc.filter(isSkillAssoc),'skills','skillsText'),
        list('Languages',assoc.filter(e=>!isSkillAssoc(e)),'langs','langsText'),
        el('h4',{class:'wssub',text:'Its own benefit (optional)'}),
        el('p',{class:'muted small',text:'An unusual benefit (Auspicious Birth: your highest ability score in place of Constitution for hit points). The player can take it instead of a skill or language benefit: it joins the usual benefit pick, for this background only.'}),
        d.special ? el('div',{class:'wsfeat'},
          el('div',{class:'brow wrap wsfhead'}, el('b',{text:d.special.name||'Unnamed benefit'}), el('span',{style:'flex:1'}),
            el('button',{class:'btn small',type:'button',text:'Remove',onclick:()=>{ d.special=null; this.changed(); this.render(); }})),
          el('div',{class:'wsgrid'},
            this.field('Name',d.special.name,v=>d.special.name=v,{hint:'As the benefit pick lists it ("Auspicious Birth Benefit").'}),
            this.field('Description',d.special.text,v=>d.special.text=v,{area:true,rows:3})),
          el('h4',{class:'wssub',text:'What it does'}), this.effects(d.special,{noSpellbook:true}))
        : el('button',{class:'btn small',type:'button',text:'+ A benefit of its own',onclick:()=>{ const id=uniqueId('ID_HB_'+slugId(this.cur.name)+'_BGBENEFIT_'+slugId(d.name));
            d.special={id,isNew:true,name:(d.name||'Background')+' Benefit',pre:'',text:d.benefit||'',effects:[],keep:[],orig:''}; d.own.add(id); this.changed(); this.render(); }}),
        el('h4',{class:'wssub',text:'Its own benefits to choose from (optional)'}),
        el('p',{class:'muted small',text:'For backgrounds with a list of their own (Birth: Among Another Race): the player picks one of these, on top of the usual benefit above (that one is optional, and offers only the associated skills and languages). An option can give associated skills itself ("Associated skill or language"), or rules of its own.'}),
        ...d.options.map(opt),
        el('button',{class:'btn small',type:'button',text:'+ New option',onclick:()=>{ const id=uniqueId('ID_HB_'+slugId(this.cur.name)+'_BGCHOICE_'+slugId(d.name));
          d.options.push({id,isNew:true,name:'New option',pre:'',text:'',effects:[],keep:[],open:true,orig:''}); d.own.add(id); this.changed(); this.render(); }}),
        el('h4',{class:'wssub',text:'What it does (optional)'}),
        el('p',{class:'muted small',text:'Rules of its own, besides the usual benefit: a bonus, a language, a skill made a class skill, a suggested feat.'}),
        this.effects(d.more,{noSpellbook:true})));
  },

  /* ---------- the class editor ---------- */
  classEditor(){
    const d=this.draft;
    const TABS=[['basics','Basics'],['numbers','Hit points & defenses'],['profs','Proficiencies'],['skills','Skills'],['features','Class features'],['builds','Builds'],['powers','Powers']];
    const tabs=el('nav',{class:'steps'}, ...TABS.map(([k,l])=>el('button',{type:'button',class:'step'+(this.tab===k?' on':''),onclick:()=>{ this.tab=k; this.render(); }},l)));
    const body={basics:()=>this.tBasics(), numbers:()=>this.tNumbers(), profs:()=>this.tProfs(), skills:()=>this.tSkills(),
      features:()=>this.tFeatures(), builds:()=>this.tBuilds(), powers:()=>this.tPowers()}[this.tab]();
    return el('div',{},
      el('div',{class:'stepwrap'},
        el('div',{class:'stephead wsbar'},
          el('button',{class:'btn small',type:'button',text:'← '+this.cur.name,onclick:()=>this.close()}),
          el('h3',{text:d.name||'Unnamed class'}), d.isNew?el('span',{class:'hb small',text:'new class'}):el('span',{class:'hb small',text:'changing an official class'}),
          el('span',{id:'wsStatus',class:'muted small',text:this.status})),
        tabs),
      el('div',{class:'bcard wide'}, body),
      this.warnings());
  },
  // what would leave a character stuck: shown under the editor
  warnings(){
    const d=this.draft, w=[];
    if(!d.name.trim()) w.push('The class has no name.');
    if(!d.isNew && (hbSp(hbEl(d.id),'_ParentClass') || /COUNTSASCLASS|ESSENTIALS_CLASS/.test(JSON.stringify(d.keep)))) w.push('An Essentials class: this workshop doesn\'t handle all of its rules yet, so test a character after changing it.');
    const pw=d.powers.map(hbEl).filter(Boolean);
    const has=(k,l)=>pw.some(e=>powerKind(e)===k && powerLevel(e)===l);
    if(!pw.some(e=>powerKind(e)==='At-will' && powerLevel(e)<=1)) w.push('No at-will attack powers: characters can\'t fill their at-will picks at 1st level.');
    else if(pw.filter(e=>powerKind(e)==='At-will').length<d.atWill) w.push(`Characters choose ${d.atWill} at-will powers, but the class has fewer.`);
    if(!has('Encounter',1)) w.push('No 1st-level encounter attack power.');
    if(!has('Daily',1)) w.push('No 1st-level daily attack power.');
    if(d.skillCount>d.classSkills.length) w.push(`Characters train ${d.skillCount} skills, but only ${d.classSkills.length} are class skills.`);
    const clash=Object.values(d.pdefs||{}).filter(p=>d.powers.includes(p.id) && sameNamePower(p)).map(p=>p.name);
    if(clash.length) w.push('Same name as an official power (the original Character Builder can mix them up): '+clash.join(', ')+'.');
    const noShort=usedFeatures(d).filter(f=>(f.isNew || JSON.stringify(featCore(f))!==f.orig) && !String(f.short||'').trim()).map(f=>f.name);
    if(noShort.length) w.push('No short description (character sheets print only the name): '+noShort.join(', ')+'.');
    if(!w.length) return null;
    return el('div',{class:'bcard wide wswarn'}, el('b',{text:'To check'}), el('ul',{}, ...w.map(t=>el('li',{text:t}))));
  },
  // a labelled field; set(value) stores it and saves
  field(label, value, set, opts={}){
    const inp=opts.area ? el('textarea',{rows:opts.rows||4}) : el('input',{type:opts.type||'text'});
    inp.value=value??''; if(opts.min!=null) inp.min=opts.min; if(opts.placeholder) inp.placeholder=opts.placeholder;
    inp.oninput=()=>{ set(opts.type==='number' ? (+inp.value||0) : inp.value); this.changed(); if(opts.after) opts.after(); };
    return el('label',{class:'wsfield'+(opts.area?' full':'')}, el('span',{text:label}), inp, opts.hint?el('small',{class:'muted',text:opts.hint}):null);
  },
  select(label, value, options, set){
    const s=el('select',{}); for(const [v,t] of options) s.append(new Option(t,v,false,v===value));
    s.onchange=()=>{ set(s.value); this.changed(); };
    return el('label',{class:'wsfield'}, el('span',{text:label}), s);
  },
  ticks(options, chosen, set){
    const box=el('div',{class:'chips'});
    for(const [v,t] of options){ const cb=el('input',{type:'checkbox',checked:chosen.includes(v)});
      cb.onchange=()=>{ set(cb.checked ? [...chosen.filter(x=>x!==v), v] : chosen.filter(x=>x!==v)); chosen=cb.checked?[...chosen,v]:chosen.filter(x=>x!==v); this.changed(); lab.classList.toggle('on',cb.checked); };
      const lab=el('label',{class:'chip'+(chosen.includes(v)?' on':'')},cb,t); box.append(lab); }
    return box;
  },
  tBasics(){
    const d=this.draft;
    return el('div',{class:'wsgrid'},
      this.field('Name',d.name,v=>{ d.name=v; const h=$('.wsbar h3'); if(h) h.textContent=v||'Unnamed class'; }),
      this.field('Power name',d.powerName,v=>d.powerName=v,{placeholder:'Exploits, Spells, Prayers…'}),
      this.select('Role',d.role,typeEls('Role').map(e=>[e.id,e.name]),v=>d.role=v),
      this.field('Role, in a sentence',d.roleText,v=>d.roleText=v,{placeholder:'You are very tough and…'}),
      this.select('Power source',d.source,typeEls('Power Source').map(e=>[e.id,e.name]),v=>d.source=v),
      this.field('Power source, in a sentence',d.sourceText,v=>d.sourceText=v),
      // in order of importance (a necromancer's Intelligence, Charisma, Constitution): ticked ones are added last, the arrows move them
      el('div',{class:'wsfield full'}, el('span',{text:'Key abilities, most important first'}),
        el('div',{class:'chosen'}, ...d.keys.map((k,i)=>el('span',{class:'pick'}, (i+1)+'. '+k,
          i?el('button',{class:'x',type:'button',title:'Move earlier',text:'◀',onclick:()=>{ [d.keys[i-1],d.keys[i]]=[d.keys[i],d.keys[i-1]]; this.changed(); this.render(); }}):null,
          i<d.keys.length-1?el('button',{class:'x',type:'button',title:'Move later',text:'▶',onclick:()=>{ [d.keys[i+1],d.keys[i]]=[d.keys[i],d.keys[i+1]]; this.changed(); this.render(); }}):null))),
        (()=>{ const t=this.ticks(ABILITIES.map(a=>[a,a]), d.keys, v=>{ d.keys=[...d.keys.filter(k=>v.includes(k)), ...v.filter(k=>!d.keys.includes(k))]; }); t.addEventListener('change',()=>this.render()); return t; })()),
      this.field('Short description',d.short,v=>d.short=v,{area:true,rows:2,hint:'One line, shown in lists.'}),
      this.field('Quote',d.flavor,v=>d.flavor=v,{area:true,rows:2}),
      this.field('Description',d.text,v=>d.text=v,{area:true,rows:8}),
      el('h4',{class:'wssub full',text:'More text (optional), each under its own heading in the class\'s entry'}),
      ...CLASS_SECTIONS.map(([k,label])=>this.field(label,d.sections[k]||'',v=>d.sections[k]=v,{area:true,rows:3})));
  },
  tNumbers(){
    const d=this.draft;
    return el('div',{},
      el('div',{class:'wsgrid'},
        this.field('Hit points at 1st level',d.hp1,v=>d.hp1=v,{type:'number',min:0,hint:'+ Constitution score'}),
        this.field('Hit points per level gained',d.hpLevel,v=>d.hpLevel=v,{type:'number',min:0}),
        this.field('Healing surges per day',d.surges,v=>d.surges=v,{type:'number',min:0,hint:'+ Constitution modifier'}),
        this.field('At-will attack powers at 1st level',d.atWill,v=>d.atWill=v,{type:'number',min:0,hint:'2 for most classes'})),
      el('h4',{class:'wssub',text:'Bonus to defenses'}),
      el('div',{class:'wsgrid four'}, ...DEFENSES.map(k=>this.field(k,d.def[k],v=>d.def[k]=v,{type:'number'}))),
      el('h4',{class:'wssub',text:'Special'}),
      el('div',{class:'wsgrid'},
        el('div',{class:'wsfield full'}, el('span',{text:'Psionic class'}), (()=>{ const c=el('input',{type:'checkbox',checked:!!d.psionic}); c.onchange=()=>{ d.psionic=c.checked; this.changed(); this.render(); };
          return el('label',{class:'chip'+(d.psionic?' on':'')}, c, 'augmentable at-will powers and power points in place of encounter attack powers (psion, ardent, battlemind)'); })(),
          d.psionic?el('small',{class:'muted',text:'Its at-will picks are augmentable ones; mark its at-will powers "augmentable" (Powers).'}):null),
        el('div',{class:'wsfield full'}, el('span',{text:'Weapons as implements'}), (()=>{ const c=el('input',{type:'checkbox',checked:!!d.weaponsImpl}); c.onchange=()=>{ d.weaponsImpl=c.checked; this.changed(); this.render(); };
          return el('label',{class:'chip'+(d.weaponsImpl?' on':'')}, c, 'its implement powers can be used through weapons (monk, assassin)'); })()),
        el('div',{class:'wsfield full'}, el('span',{text:'Starting gear'}), el('div',{class:'chosen'},
          ...d.gear.map((g,i)=>el('span',{class:'pick'}, (g.qty>1?g.qty+' × ':'')+(hbEl(g.id)?.name||g.id), el('button',{class:'x',type:'button',title:'Remove',text:'×',onclick:()=>{ d.gear.splice(i,1); this.changed(); this.render(); }}))),
          el('button',{class:'btn small',type:'button',text:'+ Add…',onclick:async()=>{ const ids=await pickEls({title:'Starting gear',types:['Gear','Weapon','Armor','Implement'],multi:true}); if(ids.length){ d.gear.push(...ids.map(id=>({id,qty:1}))); this.changed(); this.render(); } }})),
          el('small',{class:'muted',text:'Given free at 1st level (a ritual caster\'s ritual book).'})),
        this.field('Free rituals',d.rituals,v=>d.rituals=v,{area:true,rows:2,hint:'A note in the ritual book (a cleric\'s two free rituals).'}),
        el('div',{class:'wsfield full'}, el('span',{text:'Special rules'}), el('div',{class:'chosen'},
          ...d.special.map((id,i)=>el('span',{class:'pick'}, hbEl(id)?.name||id, el('button',{class:'x',type:'button',title:'Remove',text:'×',onclick:()=>{ d.special.splice(i,1); this.changed(); this.render(); }}))),
          el('button',{class:'btn small',type:'button',text:'+ Add…',onclick:async()=>{ const ids=await pickEls({title:'Special rules',types:['Internal'],multi:true,skip:new Set(d.special)}); if(ids.length){ d.special.push(...ids); this.changed(); this.render(); } }})),
          el('small',{class:'muted',text:'Rules the builders know by name (Ki Focus User).'}))),
      el('h4',{class:'wssub',text:'Other rules of the class'}),
      el('p',{class:'muted small',text:'Picks and rules every character of the class has at 1st level, besides the ones above (a druid\'s at-will pick of a beast form power). Most classes need none.'}),
      this.effects(d.clsMore ||= {id:d.id,name:'',effects:[],keep:[]}, {noSpellbook:true}),
      (d.grMore?.effects||[]).length ? el('div',{}, el('h4',{class:'wssub',text:'Rules in the class\'s grants entry'}),
        el('p',{class:'muted small',text:'Given with the class\'s role and power source (official classes have some here).'}), this.effects(d.grMore,{noSpellbook:true})) : null);
  },
  tProfs(){
    const d=this.draft, out=el('div',{});
    for(const [label,ids] of PROF_GROUPS){
      out.append(el('h4',{class:'wssub',text:label}), this.ticks(ids.filter(hbEl).map(id=>[id,profWord(hbEl(id))]), d.profs, v=>{ d.profs=[...d.profs.filter(x=>!ids.includes(x)), ...v.filter(x=>ids.includes(x))]; }));
    }
    const listed=new Set(PROF_GROUPS.flatMap(g=>g[1])), extra=d.profs.filter(x=>!listed.has(x));
    out.append(el('h4',{class:'wssub',text:'Other proficiencies'}),
      el('div',{class:'chosen'}, ...extra.map(id=>el('span',{class:'pick'}, hbEl(id)?.name||id,
        el('button',{class:'x',type:'button',title:'Remove',text:'×',onclick:()=>{ d.profs=d.profs.filter(x=>x!==id); this.changed(); this.render(); }}))),
        el('button',{class:'btn small',type:'button',text:'+ Add…',onclick:async()=>{ const ids=await pickEls({title:'Add proficiencies',types:['Proficiency'],multi:true,skip:new Set(d.profs)}); if(ids.length){ d.profs.push(...ids); this.changed(); this.render(); } }})));
    return out;
  },
  tSkills(){
    const d=this.draft;
    const skills=typeEls('Skill Training').sort(byName);
    return el('div',{},
      el('div',{class:'wsgrid'}, this.field('Trained skills chosen at 1st level',d.skillCount,v=>d.skillCount=v,{type:'number',min:0,after:()=>{}})),
      el('h4',{class:'wssub',text:'Class skills'}), el('p',{class:'muted small',text:'The skills characters of this class can choose to be trained in.'}),
      this.ticks(skills.map(e=>[e.id,e.name]), d.classSkills, v=>d.classSkills=v),
      el('h4',{class:'wssub',text:'Always trained'}), el('p',{class:'muted small',text:'Skills every character of this class is trained in, on top of the ones chosen (a wizard\'s Arcana).'}),
      this.ticks(skills.map(e=>[e.id,e.name]), d.autoSkills, v=>d.autoSkills=v),
      el('h4',{class:'wssub',text:'Trained, the player\'s choice'}), el('p',{class:'muted small',text:'One of a few skills, trained on top of the ones chosen (a ranger\'s Dungeoneering or Nature).'}),
      ...d.skillChoices.map((c,i)=>el('div',{class:'wsfeat'},
        el('div',{class:'brow wrap'}, 'Choose', (()=>{ const n=el('input',{type:'number',min:1,class:'num'}); n.value=c.number; n.oninput=()=>{ c.number=+n.value||1; this.changed(); }; return n; })(), 'of these:',
          el('span',{style:'flex:1'}), el('button',{class:'btn small',type:'button',text:'Remove',onclick:()=>{ d.skillChoices.splice(i,1); this.changed(); this.render(); }})),
        this.ticks(skills.map(e=>[e.id,e.name]), c.ids, v=>c.ids=v))),
      el('button',{class:'btn small',type:'button',text:'+ Add a choice',onclick:()=>{ d.skillChoices.push({number:1,ids:[]}); this.changed(); this.render(); }}));
  },

  /* class features */
  tFeatures(){
    const d=this.draft, out=el('div',{});
    out.append(el('p',{class:'muted small',text:'What every character of this class has. A choice lets the player pick one of several features (a fighter\'s Combat Agility or Combat Superiority).'}));
    d.features.forEach((row,i)=>{
      const rm=el('button',{class:'btn small',type:'button',text:'Remove',onclick:()=>{ d.features.splice(i,1); this.changed(); this.render(); }});
      if(row.kind==='grant'){
        const f=this.fdef(row.id);
        out.append(el('div',{class:'wsfeat'}, this.featureBox(f, row), rm));
      } else {
        const box=el('div',{class:'wsfeat choice'},
          el('div',{class:'brow wrap'}, el('b',{text:'Choice:'}), 'choose',
            (()=>{ const n=el('input',{type:'number',min:1,value:row.number,class:'small num'}); n.oninput=()=>{ row.number=+n.value||1; this.changed(); }; return n; })(),
            'of these', el('span',{style:'flex:1'}), rm));
        row.ids.forEach((fid,j)=>{ const f=this.fdef(fid);
          box.append(el('div',{class:'wsopt'}, this.featureBox(f), el('button',{class:'btn small',type:'button',text:'Remove option',onclick:()=>{ row.ids.splice(j,1); this.changed(); this.render(); }}))); });
        box.append(el('div',{class:'brow wrap'},
          el('button',{class:'btn small',type:'button',text:'+ New option',onclick:()=>{ row.ids.push(this.newFeature().id); this.changed(); this.render(); }}),
          el('button',{class:'btn small',type:'button',text:'+ Existing feature…',onclick:async()=>{ const ids=await pickEls({title:'Add options',types:['Class Feature'],multi:true,skip:new Set(row.ids)}); for(const id of ids){ this.fdef(id); row.ids.push(id); } if(ids.length){ this.changed(); this.render(); } }})));
        out.append(box);
      }
    });
    out.append(el('div',{class:'brow wrap'},
      el('button',{class:'btn primary small',type:'button',text:'+ New feature',onclick:()=>{ const f=this.newFeature(); d.features.push({kind:'grant',id:f.id,level:0}); f.open=true; this.changed(); this.render(); }}),
      el('button',{class:'btn small',type:'button',text:'+ Existing feature…',onclick:async()=>{ const ids=await pickEls({title:'Add class features',types:['Class Feature'],multi:true}); for(const id of ids){ this.fdef(id); d.features.push({kind:'grant',id,level:0}); } if(ids.length){ this.changed(); this.render(); } }}),
      el('button',{class:'btn small',type:'button',text:'+ Choice between features',onclick:()=>{ d.features.push({kind:'choose',number:1,ids:[this.newFeature().id,this.newFeature().id]}); this.changed(); this.render(); }})));
    return out;
  },
  fdef(id){ const d=this.draft||this.th||this.bg; if(!d.fdefs[id]){ const e=hbEl(id); d.fdefs[id]=e ? {...featureFrom(e), isNew:false, orig:JSON.stringify(featCore(featureFrom(e)))} : {id, isNew:true, name:'New feature', level:1, short:'', text:'', effects:[], keep:[]}; } return d.fdefs[id]; },
  newFeature(){ const d=this.draft||this.th, id=uniqueId('ID_HB_'+slugId(this.cur.name)+'_FEATURE_'+slugId(d.name)); const f={id, isNew:true, name:'New feature', level:1, short:'', text:'', effects:[], keep:[], open:true}; d.fdefs[id]=f; d.own.add(id); return f; },
  featureBox(f, row){
    const head=el('div',{class:'brow wrap wsfhead'},
      el('b',{text:f.name||'Unnamed feature'}), el('span',{class:'muted small',text:'level '+(row&&row.level>1?row.level:f.level)}),
      f.isNew?null:el('span',{class:'muted small',text:hbEl(f.id)?.source||''}),
      el('span',{style:'flex:1'}),
      el('button',{class:'btn small',type:'button',text:f.open?'Close':'Edit',onclick:()=>{ f.open=!f.open; this.render(); }}));
    if(!f.open) return el('div',{class:'wsfbox'}, head, f.short?el('div',{class:'muted small',text:f.short}):null);
    const shared=!f.isNew && this.draft && Object.keys(this.draft.fdefs).length && this.isShared(f.id);
    return el('div',{class:'wsfbox open'}, head,
      shared?el('p',{class:'warn small',text:'Other classes have this feature too: a change here changes it for them as well (in this pack).'}):null,
      el('div',{class:'wsgrid'},
        this.field('Name',f.name,v=>{ f.name=v; head.querySelector('b').textContent=v||'Unnamed feature'; }),
        this.field('Level',f.level,v=>{ f.level=v; if(row) row.level=v>1?v:0; },{type:'number',min:1,hint:'The level a character gains it'}),
        this.field('Short description',f.short,v=>f.short=v,{area:true,rows:2,placeholder:'Necrotic resistance 5 + ½ level; +5 Religion to identify undead',
          hint:'One line, printed after the name on character sheets (the original builder prints only this) and shown in lists.'}),
        this.field('Description',f.text,v=>f.text=v,{area:true,rows:5})),
      el('h4',{class:'wssub',text:'What it does'}), this.effects(f),
      f.keep.length?el('p',{class:'muted small',text:`Plus ${f.keep.length} more rule${f.keep.length===1?'':'s'} from the original, kept as they are.`}):null);
  },
  isShared(fid){ return typeEls('Grants').some(g=>g.id!==this.draft.grantsId && (g.rules||[]).some(([t,a])=>a.name===fid || String(a.category||'').split('|').includes(fid))); },
  effects(f, opts={}){
    const box=el('div',{class:'wseffects'});
    const KINDS=[['power','Gives a power'],['feature','Gives another feature'],['bonus','Bonus'],['resist','Resistance'],['skill','Trained in a skill'],['prof','Proficiency'],
      ['feat','Gives a feat'],['choose','A choice of features'],['choosePower','A choice of powers'],['chooseFeat','A choice of feats'],['slot','An extra power pick'],
      ['change','Changes a power'],['rider','Extra damage dice'],['weapon','Changes a weapon'],['vision','Vision'],['language','Language'],['gear','Starting gear'],
      ['rituals','Free rituals (a note in the ritual book)'],['pick','Another choice (companion, skill…)'],['countsAs','Counts as having a feature'],
      ['drop','Takes away a feature or power'],['suggest','Suggests a feat'],['assoc','Associated skill or language (backgrounds)'],['special','Special rule (built-in)'],['text','Builder text (advanced)'],['raw','Builder rule (advanced)']];
    const FRESH={bonus:{stat:'',value:'+1',type:'',condition:''}, choose:{number:1,ids:[]}, choosePower:{number:1,ids:[],cat:'',def:''}, chooseFeat:{number:1,ids:[],cat:'',def:''},
      resist:{dmg:'necrotic',amount:5,half:true}, rituals:{text:''}, slot:{number:1,usage:'daily',plevel:1,spellbook:false,label:''}, change:{power:'',field:'Special',value:''},
      rider:{on:'weapon',value:'+1d6',condition:'once per turn'}, weapon:{weapon:'',mode:'impl',impl:'Wand',steps:'1'}, gear:{id:'',qty:1},
      text:{name:'',value:'',condition:''}, raw:{tag:'grant',attrs:{name:'',type:''}}, pick:{type:'Companion',number:1,cat:'',optional:false}, drop:{id:'',type:''}};
    const redo=()=>{ this.changed(); this.render(); };
    f.effects.forEach((x,i)=>{
      const kind=el('select',{}); for(const [v,t] of KINDS) kind.append(new Option(t,v,false,v===x.kind));
      kind.onchange=()=>{ f.effects[i]={kind:kind.value, ...JSON.parse(JSON.stringify(FRESH[kind.value]||{id:''}))}; redo(); };
      const pickBtn=(types,label,key='id')=>el('button',{class:'btn small',type:'button',text:x[key]?(this.th?.pdefs[x[key]]?.name||hbEl(x[key])?.name||x[key]):label,onclick:async()=>{ const ids=await pickEls({title:label,types}); if(ids[0]){
        const v=this.th && !this.draft && x.kind==='power' ? await this.asThemePower(ids[0],false) : ids[0]; if(v){ x[key]=v; redo(); } } }});
      const inp=(k,ph,w,set)=>{ const n=el('input',{type:'text',placeholder:ph,style:'width:'+w}); n.value=x[k]??''; n.oninput=()=>{ x[k]=n.value; if(set) set(n.value); this.changed(); }; return n; };
      const num=(k,min=1)=>{ const n=el('input',{type:'number',min,class:'num'}); n.value=x[k]||min; n.oninput=()=>{ x[k]=+n.value||min; this.changed(); }; return n; };
      const list=(type,label)=>[...x.ids.map((id,j)=>el('span',{class:'pick'}, (type==='Class Feature'?this.fdef(id).name:hbEl(id)?.name)||id, el('button',{class:'x',type:'button',text:'×',onclick:()=>{ x.ids.splice(j,1); if(x.def && !x.ids.some(i=>hbEl(i)?.name===x.def)) x.def=''; redo(); }}))),
        el('button',{class:'btn small',type:'button',text:'+ Add…',onclick:async()=>{ const ids=await pickEls({title:label,types:[type],multi:true,skip:new Set(x.ids)}); if(ids.length){ x.cat=''; ids.forEach(id=>{ if(type==='Class Feature') this.fdef(id); x.ids.push(id); }); redo(); } }})];
      let rest;
      if(x.kind==='power'){ const dd=this.draft||this.th;
        rest=el('span',{class:'brow wrap'}, pickBtn(['Power'],'Choose a power…'), !dd ? null :
        this.th && !this.draft && x.id && !this.isThPower(x.id) ? el('button',{class:'btn small',type:'button',text:'Make it '+(this.th.name||'the theme')+'\'s own',title:'A copy of this power for the theme, with no class',onclick:async()=>{ const v=await this.asThemePower(x.id,false); if(v){ x.id=v; redo(); } }})
        : dd.pdefs[x.id] || this.th && x.id && hbEl(x.id) ? el('button',{class:'btn small',type:'button',text:'Edit this power',onclick:()=>{ if(this.th) this.thPower(x.id); this.powerOpen=x.id; this.tab='powers'; this.render(); $('#wsMain').scrollTop=0; }})
          : el('button',{class:'btn small',type:'button',text:'+ Make a new power',title:this.th?'The theme\'s attack (or other) power, given by this feature':'A class feature power for this feature',onclick:()=>{ x.id=this.newPower(this.th?'Attack':'Feature',false); this.changed(); this.powerOpen=x.id; this.tab='powers'; this.render(); $('#wsMain').scrollTop=0; }})); }
      else if(x.kind==='feature') rest=el('span',{class:'brow wrap'}, pickBtn(['Class Feature'],'Choose a feature…'), !this.draft ? null :
        el('button',{class:'btn small',type:'button',text:'+ Make a new feature',onclick:()=>{ const nf=this.newFeature(); nf.level=x.at||f.level||1; x.id=nf.id; redo(); }}));
      else if(x.kind==='skill') rest=pickBtn(['Skill Training'],'Choose a skill…');
      else if(x.kind==='prof') rest=pickBtn(['Proficiency'],'Choose a proficiency…');
      else if(x.kind==='feat') rest=pickBtn(['Feat'],'Choose a feat…');
      else if(x.kind==='vision') rest=pickBtn(['Vision'],'Choose a vision…');
      else if(x.kind==='language') rest=pickBtn(['Language'],'Choose a language…');
      else if(x.kind==='special') rest=el('span',{class:'brow wrap'}, pickBtn(['Internal'],'Choose a rule…'),
        el('small',{class:'muted',text:'Rules the builders know by name, such as Augment Powers (psionic power points, augmentable at-wills in place of encounter powers).'}));
      else if(x.kind==='gear') rest=el('span',{class:'brow wrap'}, num('qty'), pickBtn(['Gear','Weapon','Armor','Implement'],'Choose an item…'), el('small',{class:'muted',text:'Given free (the ritual book of a ritual caster).'}));
      else if(x.kind==='rituals') rest=el('span',{class:'brow wrap'}, inp('text','Gentle Repose and Speak with Dead','340px'), el('small',{class:'muted',text:'Shown in the ritual book, where they can be added free.'}));
      else if(x.kind==='resist'){
        const dmg=el('select',{}); for(const t of ['acid','cold','fire','force','lightning','necrotic','poison','psychic','radiant','thunder']) dmg.append(new Option(t,t,false,t===x.dmg));
        dmg.onchange=()=>{ x.dmg=dmg.value; this.changed(); };
        const n=el('input',{type:'number',min:0,class:'num'}); n.value=x.amount||0; n.oninput=()=>{ x.amount=+n.value||0; this.changed(); };
        const h=el('input',{type:'checkbox',checked:!!x.half}); h.onchange=()=>{ x.half=h.checked; this.changed(); };
        rest=el('span',{class:'brow wrap'}, 'resist', n, el('label',{class:'chip'+(x.half?' on':'')}, h, '+ ½ level'), dmg); }
      else if(x.kind==='bonus'){
        const st=inp('stat','AC, Speed, Initiative, Stealth…','200px'); st.setAttribute('list','wsStatNames');
        st.onchange=()=>{ const k=BONUS_STATS.find(n=>n.toLowerCase()===st.value.trim().toLowerCase()); x.stat=k||st.value.trim(); st.value=x.stat; this.changed(); };
        rest=el('span',{class:'brow wrap'}, inp('value','+1','70px',v=>{ const w=hbHalfWords(v); if(w!==v){ x.value=w; } }), 'to', st, inp('type','type (optional)','130px'), inp('condition','when… (optional)','200px'),
          document.getElementById('wsStatNames')?null:el('datalist',{id:'wsStatNames'}, ...BONUS_STATS.map(n=>el('option',{value:n}))),
          el('small',{class:'muted',text:'Half your level: type "half level" (the builders\' "+HALF-LEVEL"); your level: "level". Attacks or damage of some powers only: "weapon:damage", "fire:attack", "melee basic:damage".'}));
      }
      else if(x.kind==='choose') rest=el('span',{class:'brow wrap'}, 'choose', num('number'), 'of',
          ...x.ids.map((id,j)=>el('span',{class:'pick'}, this.fdef(id).name, el('button',{class:'x',type:'button',text:'×',onclick:()=>{ x.ids.splice(j,1); redo(); }}))),
          el('button',{class:'btn small',type:'button',text:'+ New option',onclick:()=>{ x.ids.push(this.newFeature().id); redo(); }}),
          el('button',{class:'btn small',type:'button',text:'+ Existing…',onclick:async()=>{ const ids=await pickEls({title:'Options',types:['Class Feature'],multi:true,skip:new Set(x.ids)}); ids.forEach(id=>{ this.fdef(id); x.ids.push(id); }); if(ids.length) redo(); }}));
      else if(x.kind==='choosePower' || x.kind==='chooseFeat'){
        const type=x.kind==='choosePower'?'Power':'Feat';
        const def=el('select',{}); def.append(new Option('nothing chosen in advance','')); for(const id of x.ids){ const n=hbEl(id)?.name; if(n) def.append(new Option('chosen in advance: '+n,n,false,n===x.def)); }
        if(x.def && !x.ids.some(i=>hbEl(i)?.name===x.def)) def.append(new Option('chosen in advance: '+x.def,x.def,false,true));
        def.onchange=()=>{ x.def=def.value; this.changed(); };
        rest=el('span',{class:'brow wrap'}, 'choose', num('number'), 'of',
          x.cat&&!x.ids.length ? el('span',{class:'pick',title:'Everything listed in this group; add options to pick them one by one instead'}, hbCatWords(x.cat)+' (the whole group)') : null,
          ...list(type, type==='Power'?'Powers to choose from':'Feats to choose from'), x.ids.length||x.def?def:null);
      }
      else if(x.kind==='slot'){
        const u=el('select',{}); for(const k of ['at-will','encounter','daily','utility']) u.append(new Option(k,k,false,k===x.usage)); u.onchange=()=>{ x.usage=u.value; this.changed(); };
        const sb=el('input',{type:'checkbox',checked:!!x.spellbook}); sb.onchange=()=>{ x.spellbook=sb.checked; this.changed(); this.render(); };
        rest=el('span',{class:'brow wrap'}, 'choose', num('number'), u, 'power(s) of level', num('plevel'), 'from the class\'s list',
          el('label',{class:'chip'+(x.spellbook?' on':''),title:'For a wizard-style spellbook: the extra spell kept in the book'}, sb, 'spellbook'),
          el('small',{class:'muted',text:'Gained at the level under "When" (or the feature\'s level).'}));
      }
      else if(x.kind==='raw'){
        const tg=el('select',{}); for(const t of ['grant','select','statadd','modify','replace','drop','textstring','suggest','statalias']) tg.append(new Option(t,t,false,t===x.tag));
        if(![...tg.options].some(o=>o.value===x.tag)) tg.append(new Option(x.tag,x.tag,false,true));
        tg.onchange=()=>{ x.tag=tg.value; this.changed(); };
        const ta=el('textarea',{rows:Math.max(2,Object.keys(x.attrs).length),style:'width:420px;font-family:monospace;font-size:12px'});
        ta.value=Object.entries(x.attrs).map(([k,v])=>k+' = '+v).join('\n');
        ta.oninput=()=>{ const a={}; for(const line of ta.value.split('\n')){ const m=/^\s*([\w-]+)\s*=\s*(.*?)\s*$/.exec(line); if(m) a[m[1]]=m[2]; } x.attrs=a; this.changed(); };
        const prevK=f.effects[i-1]?.kind, prev=prevK==='choosePower'?'power':prevK==='chooseFeat'?'feat':prevK==='choose'?'option':'';
        const plain=hbRawPlain(x,prev);
        rest=el('span',{class:'brow wrap'}, tg, ta, plain?el('div',{class:'wsplain',text:'What this does: '+plain}):null,
          el('small',{class:'muted',text:'A rule in the builders\' own terms, one "part = value" a line (as in the official entries: multiclassing, power swaps, list additions). Change with care.'}));
      }
      else if(x.kind==='countsAs') rest=el('span',{class:'brow wrap'}, pickBtn(['CountsAsFeature'],'Choose…'), el('small',{class:'muted',text:'For feats that need a feature by name (Healing Word, Dragon Magic).'}));
      else if(x.kind==='assoc') rest=pickBtn(['Background Association'],'Choose a skill or language…');
      else if(x.kind==='suggest') rest=el('span',{class:'brow wrap'}, pickBtn(['Feat','Power'],'Choose a feat…'), el('small',{class:'muted',text:'Shown as a suggestion when choosing feats.'}));
      else if(x.kind==='drop') rest=el('span',{class:'brow wrap'}, pickBtn(['Class Feature','Power'],'Choose what it takes away…'), el('small',{class:'muted',text:'A feature that replaces another (Subversive Word in place of Healing Word).'}));
      else if(x.kind==='text') rest=el('span',{class:'brow wrap'}, inp('name','Sneak Attack Weapons','200px'), '=', inp('value','Club','220px'), inp('condition','condition (optional)','160px'),
        el('small',{class:'muted',text:'A text the builders read by name, as in the official entries.'}));
      else if(x.kind==='pick'){
        const ty=inp('type','Companion','170px'); ty.setAttribute('list','wsPickTypes');
        rest=el('span',{class:'brow wrap'}, 'choose', num('number'), ty, 'from', inp('cat','(any; or a group / class ID)','220px'),
          document.getElementById('wsPickTypes')?null:el('datalist',{id:'wsPickTypes'}, ...['Companion','Familiar','Skill Training','Language','Trait Package','Deity','Domain'].map(n=>el('option',{value:n}))));
      }
      else if(x.kind==='change'){
        const fl=inp('field','Special','140px'); fl.setAttribute('list','wsPowerLines');
        rest=el('span',{class:'brow wrap'}, x.power==='this'?el('span',{class:'pick',text:'itself'}, el('button',{class:'x',type:'button',text:'×',onclick:()=>{ x.power=''; redo(); }})):el('span',{class:'brow'}, pickBtn(['Power','Class Feature'],'Choose a power…','power'),
          el('button',{class:'btn small',type:'button',text:'itself',title:'The feature or power this rule belongs to',onclick:()=>{ x.power='this'; x.ptype=''; redo(); }})), 'line', fl, 'becomes', inp('value','the new text','300px'),
          document.getElementById('wsPowerLines')?null:el('datalist',{id:'wsPowerLines'}, ...[...POWER_LINES,'Power Type','Power Usage','Action Type','Keywords','Attack Type'].map(n=>el('option',{value:n}))),
          el('small',{class:'muted',text:'A line the power doesn\'t have yet is added to it (Improved Shroud of Shadow).'}));
      }
      else if(x.kind==='rider') rest=el('span',{class:'brow wrap'}, inp('value','+1d8','70px'), 'damage with', inp('on','weapon, light blade, one-hand, melee basic','220px'), inp('condition','when… (once per turn)','220px'));
      else if(x.kind==='weapon'){
        const m=el('select',{}); for(const [v,t] of [['impl','can be used as an implement'],['die','deals a larger damage die']]) m.append(new Option(t,v,false,v===x.mode));
        m.onchange=()=>{ x.mode=m.value; redo(); };
        rest=el('span',{class:'brow wrap'}, pickBtn(['Weapon'],'Choose a weapon…','weapon'), m,
          x.mode==='impl' ? el('span',{class:'brow'}, '(as a', inp('impl','Wand','90px'), ')') : el('span',{class:'brow'}, 'by', inp('steps','1','50px'), 'size(s), or to a die (1d10)'));
      }
      // when it applies
      const cw=el('details',{class:'wscond'+(condText(x)?' on':'')}, el('summary',{text:condText(x)||'When: always'}));
      if(x.kind!=='resist' && x.kind!=='raw'){
        const sum=()=>{ cw.querySelector('summary').textContent=condText(x)||'When: always'; cw.classList.toggle('on',!!condText(x)); };
        const at=el('input',{type:'number',min:1,max:30,class:'num',placeholder:'1'}); at.value=x.at>1?x.at:''; at.oninput=()=>{ x.at=+at.value>1?+at.value:0; sum(); this.changed(); };
        const notC=el('input',{type:'checkbox',checked:!!x.needNot}); notC.onchange=()=>{ x.needNot=notC.checked; sum(); this.changed(); };
        const sk=el('select',{}); sk.append(new Option('(any)','')); for(const k of SKILLS) sk.append(new Option(k,k,false,k===x.untrained)); sk.onchange=()=>{ x.untrained=sk.value; sum(); this.changed(); };
        const wear=el('select',{}); wear.append(new Option('(any)',''));
        const wk=x.wear?x.wear.mode+'|'+x.wear.what:'';
        for(const [m,w,t] of ARMOR_WHEN) wear.append(new Option(t,m+'|'+w,false,wk===m+'|'+w));
        if(wk && !ARMOR_WHEN.some(([m,w])=>m+'|'+w===wk)) wear.append(new Option(x.wear.mode+' '+x.wear.what,wk,false,true));
        wear.onchange=()=>{ const [m,...w]=wear.value.split('|'); x.wear=wear.value?{mode:m,what:w.join('|')}:null; sum(); this.changed(); };
        const more=el('input',{type:'text',placeholder:'Paragon Tier, Kensei Mastery… (& between)',style:'width:260px'}); more.value=(x.reqMore||[]).join('&');
        more.oninput=()=>{ x.reqMore=more.value.split('&').map(s=>s.trim()).filter(Boolean); sum(); this.changed(); };
        const bonusLike=['bonus','rider'].includes(x.kind);
        cw.append(el('div',{class:'wsgrid small'},
          el('label',{}, 'From level', at, el('small',{class:'muted',text:' (11 = paragon, 21 = epic)'})),
          el('label',{}, 'Only with', el('button',{class:'btn small',type:'button',text:x.need?(hbEl(x.need)?.name||x.need):'Choose…',onclick:async()=>{ const ids=await pickEls({title:'Only with…',types:['Class Feature','Feat','Race','Class','Power','Proficiency','Skill Training']}); if(ids[0]){ x.need=ids[0]; redo(); } }}),
            x.need?el('button',{class:'x',type:'button',text:'×',title:'No condition',onclick:()=>{ x.need=''; x.needNot=false; redo(); }}):null,
            el('label',{class:'chip'+(x.needNot?' on':'')}, notC, 'without it instead')),
          el('label',{}, 'Only if untrained in', sk),
          bonusLike ? el('label',{}, 'Armor', wear) : null,
          el('label',{}, 'Other conditions', more)));
      } else cw.hidden=true;
      box.append(el('div',{class:'wseffrow'}, el('div',{class:'brow wseff'}, kind, el('span',{style:'flex:1'}), el('button',{class:'x',type:'button',title:'Remove',text:'×',onclick:()=>{ f.effects.splice(i,1); redo(); }})),
        el('div',{class:'brow wrap wseff wseffbody'}, rest), cw));
      // features it gives or offers are features of the class too: edited right here
      if(this.draft) for(const id of subFeatures(x)) if(this.fdef(id).isNew || this.fdef(id).open) box.append(el('div',{class:'wsopt'}, this.featureBox(this.fdef(id))));
      else if(x.kind==='feature') box.append(el('div',{class:'wsopt'}, this.featureBox(this.fdef(id))));
    });
    box.append(el('div',{class:'brow wrap'},
      el('button',{class:'btn small',type:'button',text:'+ Add',onclick:()=>{ f.effects.push({kind:'bonus',stat:'',value:'+1',type:'',condition:''}); redo(); }}),
      opts.noSpellbook?null:el('button',{class:'btn small',type:'button',text:'+ Spellbook (wizard-style)',title:'An extra daily or utility spell to keep in the book at each level that gives one',onclick:()=>{
        for(const l of [1,5,9,15,19,25,29]) f.effects.push({kind:'slot',number:1,usage:'daily',plevel:l,spellbook:true,label:'',at:l});
        for(const l of [2,6,10,16,22]) f.effects.push({kind:'slot',number:1,usage:'utility',plevel:l,spellbook:true,label:'',at:l});
        redo(); }})));
    return box;
  },

  /* builds */
  tBuilds(){
    const d=this.draft, out=el('div',{});
    out.append(el('p',{class:'muted small',text:'Suggested ways to play the class. A build is optional for characters.'}));
    d.builds.forEach((b,i)=>{
      out.append(el('div',{class:'wsfeat'}, el('div',{class:'wsgrid'},
        this.field('Name',b.name,v=>b.name=v), this.field('Key abilities',b.keys,v=>b.keys=v,{placeholder:'Str, Con, Wis'}),
        this.field('Description',b.text,v=>b.text=v,{area:true,rows:3})),
        el('button',{class:'btn small',type:'button',text:'Remove',onclick:()=>{ d.builds.splice(i,1); this.changed(); this.render(); }})));
    });
    out.append(el('button',{class:'btn primary small',type:'button',text:'+ New build',onclick:()=>{
      const id=uniqueId('ID_HB_'+slugId(this.cur.name)+'_BUILD_'+slugId(d.name)); d.builds.push({id,isNew:true,name:'New build',keys:'',text:'',orig:''}); d.own.add(id); this.changed(); this.render(); }}));
    return out;
  },

  /* powers */
  tPowers(){
    const d=this.draft, out=el('div',{});
    const pw=d.powers.map(id=>d.pdefs[id] ? powerEl(d.pdefs[id],{id:d.id,name:d.name},this.cur.name) : hbEl(id)).filter(Boolean);
    out.append(el('p',{class:'muted small',text:'The powers characters of this class can choose. Make new ones, or add existing powers from any class (adding one here does not take it away from its own class).'}),
      el('div',{class:'brow wrap'},
        el('button',{class:'btn primary small',type:'button',text:'+ New power',onclick:()=>this.newPower()}),
        el('button',{class:'btn small',type:'button',text:'+ Add existing powers…',onclick:async()=>{ const ids=await pickEls({title:'Add powers',types:['Power'],multi:true,skip:new Set(d.powers),classFilter:true}); if(ids.length){ d.powers.push(...ids); this.changed(); this.render(); } }}),
        el('span',{class:'muted small',text:pw.length+' powers'})));
    if(this.powerOpen && d.pdefs[this.powerOpen]) out.append(this.powerEditor(d.pdefs[this.powerOpen]));
    // what a character can choose, level by level
    const LEVELS=[1,2,3,5,6,7,9,10,13,15,16,17,19,20,22,23,25,27,29];
    const grid=el('table',{class:'wscover'}, el('thead',{}, el('tr',{}, el('th',{text:'Level'}), ...LEVELS.map(l=>el('th',{text:String(l)})))));
    const tb=el('tbody',{});
    for(const k of ['At-will','Encounter','Daily','Utility']) tb.append(el('tr',{}, el('th',{text:k}), ...LEVELS.map(l=>{ const n=pw.filter(e=>powerKind(e)===k && powerLevel(e)===l).length; return el('td',{class:n?'':'zero',text:n?String(n):'·'}); })));
    grid.append(tb); out.append(el('div',{class:'wscoverwrap'},grid));
    const ORDER=['At-will','Encounter','Daily','Utility','Other'], groups={};
    for(const e of pw) (groups[powerKind(e)+'|'+String(powerLevel(e)).padStart(2,'0')] ||= []).push(e);
    const lvk=k=>+k.split('|')[1]||99;
    for(const key of Object.keys(groups).sort((a,b)=>lvk(a)-lvk(b) || ORDER.indexOf(a.split('|')[0])-ORDER.indexOf(b.split('|')[0]))){
      const [k,l]=key.split('|');
      out.append(el('h4',{class:'wssub',text:+l ? `Level ${+l} · ${k}` : `${k}, no level (powers that features give)`}),
        el('div',{class:'chosen'}, ...groups[key].sort(byName).map(e=>{ const own=!!d.pdefs[e.id];
          return el('span',{class:'pick'+(own?' own':''),title:own?'Made for this class: click to edit':hbSp(e,'Display')+' · '+e.source},
            own ? el('button',{class:'linkish',type:'button',text:e.name||'Unnamed power',onclick:()=>{ this.powerOpen=e.id; this.render(); $('#wsMain').scrollTop=0; }}) : e.name,
            el('button',{class:'x',type:'button',title:own?'Delete this power':'Take it off this class\'s list',text:'×',onclick:()=>{ d.powers=d.powers.filter(x=>x!==e.id); if(own){ delete d.pdefs[e.id]; if(this.powerOpen===e.id) this.powerOpen=null; } this.changed(); this.render(); }})); })));
    }
    return out;
  },
  newPower(kind='Attack', open=true){
    const d=this.draft||this.th||this.sp, id=uniqueId('ID_HB_'+slugId(this.cur.name)+'_POWER_'+slugId(d.name||'power'));
    d.pdefs[id]={id, isNew:true, name:'New power', flavor:'', text:'', kind, usage:kind==='Attack'?'At-Will':'Encounter', level:1, action:kind==='Attack'?'Standard action':'Minor action',
      keywords:[], attackType:'', lines:kind==='Attack'?{Attack:(d.keys[0]||'Strength')+' vs. AC'}:{}, custom:[], keep:{spec:{}, cats:[], rules:[]}, orig:'',
      basic:'', children:[], augment:false, more:{id, name:'', effects:[], keep:[]}};
    d.powers.push(id); d.own.add(id); this.changed();
    if(this.th && !this.draft && this.th.kind==='Race'){ const q=d.pdefs[id]; q.standalone=true; q.pre=''; q.keep.cats=[d.id]; q.keep.spec={};
      q.kind=kind==='Utility'?'Utility':'Attack'; q.level=0; q.usage='Encounter'; q.display=`${d.name} Racial ${q.kind==='Utility'?'Utility':'Attack'}`; }
    else if(this.th && !this.draft && this.th.kind && this.th.kind!=='Theme'){ const q=d.pdefs[id]; q.standalone=true; q.pre=d.name; q.keep.cats=[d.id]; q.keep.spec={};
      q.kind=kind==='Utility'?'Utility':'Attack'; q.level=d.kind==='Epic Destiny'?26:11; q.usage=kind==='Utility'?'Daily':'Encounter'; q.display=`${d.name} ${q.kind} ${q.level}`; }
    else if(this.th && !this.draft){ const q=d.pdefs[id]; q.standalone=true; q.pre=d.name; q.keep.cats=['ID_FMP_CLASS_0']; q.keep.spec={'_ThemePower':d.id};
      if(kind==='Utility'){ q.level=2; q.display=d.name+' Utility 2'; q.usage='Encounter'; }
      else { q.kind='None'; q.level=1; q.display=d.name+' Attack'; q.usage='Encounter'; } }
    else if(!this.draft){ const q=d.pdefs[id]; q.standalone=true; q.display=kind==='Utility'?'Feat Utility':kind==='Feature'?'':'Feat Power'; q.level=0; if(kind==='Feature'){ q.kind='None'; } }
    if(open){ this.powerOpen=id; this.tab='powers'; this.render(); $('#wsMain').scrollTop=0; }
    return id;
  },
  powerEditor(p){
    const d=this.draft||this.th||this.sp, cls=this.draft?{id:d.id,name:d.name}:null, preview=el('div',{class:'entry wsprev'});
    const showPrev=()=>{ try{ Builder.renderElement(preview,null,{...powerEl(p,cls,this.cur.name), hb:this.cur.name}); }catch(e){ preview.textContent=''; } };
    const re=()=>{ showPrev(); };
    const f=(label,key,opts={})=>this.field(label,p[key],v=>p[key]=v,{...opts,after:re});
    const line=(k,opts={})=>this.field(k,p.lines[k]||'',v=>{ p.lines[k]=v; },{area:true,rows:opts.rows||2,hint:opts.hint,after:re});
    const sel=(label,value,options,set)=>{ const x=this.select(label,value,options.map(o=>Array.isArray(o)?o:[o,o]),v=>{ set(v); re(); }); return x; };
    // the attack line: ability vs. defense, as the character sheet reads it
    const am=/^\s*(Strength|Constitution|Dexterity|Intelligence|Wisdom|Charisma)\s+vs\.?\s+(AC|Fortitude|Reflex|Will)\b\s*(.*)$/i.exec(p.lines.Attack||'');
    const atk={ab:am?am[1]:(p.lines.Attack||'').trim()?'Strength':'', def:am?am[2]:'AC', more:am?am[3]:(p.lines.Attack||'')};
    // no ability: the power has no attack roll (the line is left out)
    const setAtk=()=>{ p.lines.Attack=atk.ab ? `${atk.ab} vs. ${atk.def}${atk.more?' '+atk.more.trim():''}` : ''; this.changed(); this.render(); };
    const atkRow=el('div',{class:'wsfield full'}, el('span',{text:'Attack'}), el('div',{class:'brow wrap'},
      (()=>{ const s=el('select',{}); s.append(new Option('No attack roll','',false,!atk.ab)); for(const a of ABILITIES) s.append(new Option(a,a,false,a.toLowerCase()===atk.ab.toLowerCase())); s.onchange=()=>{ atk.ab=s.value; setAtk(); }; return s; })(), atk.ab?'vs.':null,
      atk.ab?(()=>{ const s=el('select',{}); for(const a of ['AC','Fortitude','Reflex','Will']) s.append(new Option(a,a,false,a.toLowerCase()===atk.def.toLowerCase())); s.onchange=()=>{ atk.def=s.value; setAtk(); }; return s; })():null,
      atk.ab?(()=>{ const n=el('input',{type:'text',placeholder:'more (optional): "(main weapon), two attacks"'}); n.value=atk.more||''; n.style.flex='1';
        n.oninput=()=>{ atk.more=n.value; p.lines.Attack=`${atk.ab} vs. ${atk.def}${atk.more?' '+atk.more.trim():''}`; this.changed(); re(); }; return n; })():null));
    const shown=new Set([...POWER_LINES_SHOWN[p.kind], ...(p.added||[])]); for(const k of POWER_LINES) if((p.lines[k]||'').trim()) shown.add(k);
    const lineBox=el('div',{class:'wsgrid'});
    for(const k of POWER_LINES){ if(!shown.has(k)) continue;
      if(k==='Attack'){ lineBox.append(atkRow); continue; }
      lineBox.append(line(k,{rows:k==='Hit'||k==='Effect'?3:2,
        hint:k==='Hit'?'Write damage as the books do, "2[W] + Strength modifier damage" or "1d8 + Wisdom modifier radiant damage": the character sheet works the numbers out.':''}));
    }
    const more=POWER_LINES.filter(k=>!shown.has(k));
    // keywords: search (or type your own and press Enter); the ones ticked are listed first, then the rest alphabetically
    const kwList=keywordList(p.keywords), chosenBox=el('div',{class:'chips'}), found=el('div',{class:'chips'});
    const kwIn=el('input',{type:'search',placeholder:'Search keywords, or type a new one and press Enter'});
    const drawKw=()=>{
      const q=kwIn.value.trim().toLowerCase();
      const chip=(k,on)=>{ const cb=el('input',{type:'checkbox',checked:on});
        cb.onchange=()=>{ p.keywords=cb.checked?[...p.keywords,k]:p.keywords.filter(x=>x!==k); this.changed(); re(); drawKw(); };
        return el('label',{class:'chip'+(on?' on':'')},cb,k); };
      chosenBox.replaceChildren(...p.keywords.map(k=>chip(k,true)));
      const rest=kwList.filter(k=>!p.keywords.includes(k) && (!q || k.toLowerCase().includes(q)));
      found.replaceChildren(...rest.map(k=>chip(k,false)),
        q && !kwList.some(k=>k.toLowerCase()===q) ? el('button',{class:'btn small',type:'button',text:'+ New keyword "'+kwIn.value.trim()+'"',onclick:()=>addKw()}) : null);
    };
    const addKw=()=>{ const t=kwIn.value.trim(); if(!t) return; const known=kwList.find(x=>x.toLowerCase()===t.toLowerCase())||t;
      if(!p.keywords.includes(known)) p.keywords.push(known); ensureKeyword(this.cur, known); kwIn.value=''; this.changed(); this.render(); };
    kwIn.oninput=drawKw;
    kwIn.onkeydown=e=>{ if(e.key==='Enter'){ e.preventDefault(); const q=kwIn.value.trim().toLowerCase(); const one=kwList.filter(k=>!p.keywords.includes(k) && k.toLowerCase().includes(q));
      if(one.length===1 && !kwList.some(k=>k.toLowerCase()===q)){ kwIn.value=one[0]; } addKw(); } };
    drawKw();
    const kw=el('div',{class:'wsfield full'}, el('span',{text:'Keywords'}), chosenBox, el('div',{class:'brow wsaddkw'}, kwIn), el('div',{class:'wskwlist'}, found));
    const atList=el('datalist',{id:'wsAtkTypes'}, ...ATTACK_TYPES.map(t=>el('option',{value:t})));
    const box=el('div',{class:'wsfeat wspower'},
      el('div',{class:'brow wrap wsfhead'}, el('b',{text:'Power'}), el('span',{style:'flex:1'}),
        this.sp && p.id===this.sp.main || this.th && !this.draft ? null : el('button',{class:'btn small',type:'button',text:this.draft?'Done':this.th?'Back to '+(this.th.name||'the theme'):'Back to '+(d.pdefs[this.sp.main]?.name||'the power'),onclick:()=>{ if(this.draft||this.th){ this.powerOpen=null; this.render(); $('#wsMain').scrollTop=0; return; } this.powerOpen=this.sp.main; this.render(); }})),
      el('div',{class:'wspowergrid'},
        el('div',{},
          el('div',{class:'wsgrid'},
            (()=>{ const box=f('Name','name'), w=el('small',{class:'warn'}); box.append(w);
              const check=()=>{ const o=sameNamePower(p); w.textContent=o?`An official power has this name too (${hbSp(o,'Display')||'power'}, ${o.source}). The original Character Builder can mix them up and leave yours out: give it a name of its own.`:''; };
              box.querySelector('input').addEventListener('input',check); check(); return box; })(),
            ...(p.standalone ? [
              f('Shown as','display',{placeholder:'Feat Power, Feat Utility, Dwarf Racial Power, Arcana Utility 2',hint:'The line at the top right of the card.'}),
              f('Level (optional)','level',{type:'number',min:0,hint:this.th?'A theme\'s utility powers are chosen at that level (2, 6, 10…), in place of a class utility power.':'0: no level (feat and racial powers). Skill and theme powers have one.'}),
              sel('Kind',p.kind,[['Attack','Attack power'],['Utility','Utility power'],['None','Not set (like most feat and racial powers)']],v=>{ p.kind=v; this.changed(); this.render(); }),
              f('Prerequisite (optional)','pre',{placeholder:'Trained in Arcana',hint:this.th?'The theme\'s name: only characters with the theme can take it.':'A skill power names its skill here.'})] : [
            p.kind==='Feature' ? el('div',{class:'wsfield'}, el('span',{text:'Level'}), el('small',{class:'muted',text:'None: a class feature gives this power. Add it to the feature under Class features, "What it does", "Gives a power".'})) : f('Level','level',{type:'number',min:1}),
            sel('Kind',p.kind,[['Attack','Attack power'],['Utility','Utility power'],['Feature','Class feature power']],v=>{ p.kind=v; this.changed(); this.render(); })]),
            sel('Use',p.usage,[['At-Will','At-will'],['Encounter','Encounter'],['Daily','Daily']],v=>{ p.usage=v; this.changed(); }),
            sel('Action',p.action,POWER_ACTIONS,v=>{ p.action=v; this.changed(); }),
            sel('Usable as a basic attack',p.basic||'',[['','No'],['Melee','Yes, a melee basic attack'],['Ranged','Yes, a ranged basic attack']],v=>{ p.basic=v; this.changed(); }),
            p.usage==='At-Will' ? (()=>{ const c=el('input',{type:'checkbox',checked:!!p.augment}); c.onchange=()=>{ p.augment=c.checked; if(c.checked && !p.keywords.includes('Augmentable')) p.keywords.push('Augmentable'); this.changed(); this.render(); };
              return el('div',{class:'wsfield'}, el('span',{text:'Psionic'}), el('label',{class:'chip'+(p.augment?' on':'')}, c, 'augmentable at-will'),
                el('small',{class:'muted',text:'Write its augments as lines of your own: "Augment 1", "Augment 2".'})); })() : null,
            el('div',{class:'wsfield full'}, el('span',{text:'Secondary powers'}), el('div',{class:'brow wrap'},
              ...(p.children||[]).map((cid,j)=>{ const own=d.pdefs[cid];
                return el('span',{class:'pick'+(own?' own':'')}, own ? el('button',{class:'linkish',type:'button',text:own.name||'Unnamed power',onclick:()=>{ this.powerOpen=cid; this.render(); $('#wsMain').scrollTop=0; }}) : (hbEl(cid)?.name||cid),
                  el('button',{class:'x',type:'button',title:'Take it off',text:'×',onclick:()=>{ p.children.splice(j,1); this.changed(); this.render(); }})); }),
              el('button',{class:'btn small',type:'button',text:'+ New secondary power',title:'An attack or effect this power lets you use (Flameburst Armor gives Fireburst Armor Attack)',onclick:()=>{
                const cid=this.newPower('Feature',false), c=d.pdefs[cid]; c.name=(p.name||'Power')+' Attack'; c.usage=p.usage; c.keywords=[...p.keywords]; c.keep.spec['_ParentPower']=p.id;
                (p.children ||= []).push(cid); this.changed(); this.powerOpen=cid; this.render(); $('#wsMain').scrollTop=0; }}),
              el('small',{class:'muted',text:'Characters with this power have these too.'}))),
            (()=>{ const x=f('Attack type and range','attackType',{placeholder:'Melee weapon, Ranged 10, Close burst 1…'}); x.querySelector('input').setAttribute('list','wsAtkTypes'); return x; })(),
            f('Flavor','flavor',{area:true,rows:2}), kw),
          lineBox,
          el('div',{class:'wsgrid'}, ...(p.custom||[]).map((pair,i)=>el('div',{class:'wsfield full wscustom'},
            el('div',{class:'brow'}, (()=>{ const n=el('input',{type:'text',placeholder:'Name of the line (Undeath Focus)'}); n.value=pair[0]; n.oninput=()=>{ pair[0]=n.value; this.changed(); re(); }; return n; })(),
              el('button',{class:'x',type:'button',title:'Remove this line',text:'×',onclick:()=>{ p.custom.splice(i,1); this.changed(); this.render(); }})),
            (()=>{ const t=el('textarea',{rows:2}); t.value=pair[1]; t.oninput=()=>{ pair[1]=t.value; this.changed(); re(); }; return t; })()))),
          el('div',{class:'brow wrap'}, el('span',{class:'muted small',text:'Add a line:'}), ...more.map(k=>el('button',{class:'btn small',type:'button',text:'+ '+k,onclick:()=>{ (p.added ||= []).push(k); this.render(); }})),
            el('button',{class:'btn small',type:'button',text:'+ A line of your own…',title:'A line with its own name, like "Undeath Focus:" or "First Failed Saving Throw:"',onclick:()=>{ (p.custom ||= []).push(['','']); this.render(); }})),
          this.field('Text under the power (optional)',p.text,v=>p.text=v,{area:true,rows:2,after:re}), atList,
          el('details',{class:'wspmore',open:!!(p.more?.effects||[]).length},
            el('summary',{text:'Rules (advanced): what having the power does for the builders'+((p.more?.effects||[]).length?' ('+p.more.effects.length+')':'')}),
            el('p',{class:'muted small',text:'Most powers need none. Examples: a paladin power\'s Divine Sanction line ("Changes a power": this power, line Divine Sanction), a bonus the power gives.'}),
            this.effects(p.more ||= {id:p.id,name:'',effects:[],keep:[]}, {noSpellbook:true}))),
        el('div',{}, el('div',{class:'muted small',text:'How it looks'}), preview)));
    showPrev();
    return box;
  },
};

/* ---------- small dialogs (no browser pop-ups: they would block the program) ---------- */
function dlgShell(title){
  const dlg=el('dialog',{class:'wsdlg'}); document.body.append(dlg);
  const done=v=>{ dlg.close(); dlg.remove(); return v; };
  return {dlg, done, head:el('h3',{text:title})};
}
function formDlg(title, fields, note){
  return new Promise(res=>{
    const {dlg,done,head}=dlgShell(title), inputs={};
    const rows=fields.map(f=>{ let inp;
      if(f.type==='select'){ inp=el('select',{}); for(const [v,t] of f.options) inp.append(new Option(t,v)); }
      else { inp=el('input',{type:'text'}); inp.value=f.value||''; }
      inputs[f.key]=inp; return el('label',{class:'wsfield full'}, el('span',{text:f.label}), inp); });
    const ok=el('button',{class:'btn primary',type:'button',text:'OK',onclick:()=>res(done(Object.fromEntries(Object.entries(inputs).map(([k,i])=>[k,i.value]))))});
    const cancel=el('button',{class:'btn',type:'button',text:'Cancel',onclick:()=>res(done(null))});
    dlg.append(head, ...(note?[el('p',{class:'muted small',text:note})]:[]), ...rows, el('div',{class:'brow wsbtns'}, cancel, ok));
    dlg.addEventListener('cancel',e=>{ e.preventDefault(); res(done(null)); });
    dlg.addEventListener('keydown',e=>{ if(e.key==='Enter' && e.target.tagName==='INPUT'){ e.preventDefault(); ok.click(); } });
    dlg.showModal(); (rows[0]?.querySelector('input,select'))?.focus();
  });
}
async function hbAsk(title, value){ const r=await formDlg(title,[{key:'v',label:'',value}]); return r ? r.v.trim() : ''; }
function confirmMsg(text){
  return new Promise(res=>{ const {dlg,done}=dlgShell('');
    dlg.append(el('p',{text}), el('div',{class:'brow wsbtns'}, el('button',{class:'btn',type:'button',text:'Cancel',onclick:()=>res(done(false))}), el('button',{class:'btn primary',type:'button',text:'OK',onclick:()=>res(done(true))})));
    dlg.addEventListener('cancel',e=>{ e.preventDefault(); res(done(false)); }); dlg.showModal(); });
}
function alertMsg(text){ return new Promise(res=>{ const {dlg,done}=dlgShell(''); dlg.append(el('p',{text}), el('div',{class:'brow wsbtns'}, el('button',{class:'btn primary',type:'button',text:'OK',onclick:()=>res(done())}))); dlg.showModal(); }); }
/* choose entries of some types from the rules: search, tick, OK. For powers, a class filter. */
function pickEls({title, types, multi, skip, classFilter}){
  return new Promise(res=>{
    const {dlg,done,head}=dlgShell(title); dlg.classList.add('wspick');
    const all=types.flatMap(typeEls).filter(e=>!skip || !skip.has(e.id)).sort(byName);
    const q=el('input',{type:'search',placeholder:'Search…'}), chosen=new Set();
    let cls=null;
    if(classFilter){ cls=el('select',{}); cls.append(new Option('Any class','')); for(const e of Workshop.classOptions()) cls.append(new Option(e.name,e.id)); }
    // powers: by level, then at-will / encounter / daily / utility, with filters for both
    const isPow=types.includes('Power'); let kindSel=null, lvlSel=null;
    const KORDER=['At-will','Encounter','Daily','Utility','Other'];
    if(isPow){
      const lv=e=>powerLevel(e)||99;   // powers with no level (given by features) last
      all.sort((a,b)=>lv(a)-lv(b) || KORDER.indexOf(powerKind(a))-KORDER.indexOf(powerKind(b)) || byName(a,b));
      kindSel=el('select',{}); kindSel.append(new Option('Any kind','')); for(const k of KORDER.slice(0,4)) kindSel.append(new Option(k,k));
      lvlSel=el('select',{}); lvlSel.append(new Option('Any level','')); for(const l of [...new Set(all.map(powerLevel))].sort((a,b)=>a-b)) lvlSel.append(new Option(l?'Level '+l:'No level',String(l)));
    }
    const list=el('div',{class:'wsplist'}), count=el('span',{class:'muted small'});
    // the entry itself, beside the list: the one pointed at or ticked last
    const prev=el('div',{class:'entry wspkprev'}, el('p',{class:'muted small',text:'Point at an entry (or tick it) to see it here.'}));
    let shownId=null; const preview=id=>{ if(id===shownId) return; shownId=id; try{ Builder.renderElement(prev, id); prev.scrollTop=0; }catch(e){ prev.textContent=''; } };
    const shown=()=>{ const words=searchNorm(q.value).split(' ').filter(Boolean), c=cls?.value;
      return all.filter(e=>(!c || (e.cats||[]).includes(c)) && (!kindSel?.value || powerKind(e)===kindSel.value) && (!lvlSel?.value || String(powerLevel(e))===lvlSel.value)
        && (!words.length || wordsIn(words, searchNorm(e.name)))); };
    const draw=()=>{ const s=shown(); let last=null; list.replaceChildren(...s.slice(0,400).flatMap(e=>{
        const head=isPow && (last===null || powerLevel(e)!==powerLevel(last) || powerKind(e)!==powerKind(last)) ? el('div',{class:'wsphead',text:(powerLevel(e)?'Level '+powerLevel(e):'No level')+' · '+powerKind(e)}) : null; last=e;
        const cb=el('input',{type:multi?'checkbox':'radio',name:'wsp',checked:chosen.has(e.id)});
        cb.onchange=()=>{ if(!multi) chosen.clear(); cb.checked?chosen.add(e.id):chosen.delete(e.id); preview(e.id); };
        const row=el('label',{class:'pkrow',onmouseenter:()=>preview(e.id)}, cb, el('span',{class:'pkname'}, el('b',{text:e.name}), el('div',{class:'muted small',text:[isPow?hbSp(e,'Power Usage'):'',hbSp(e,'Display'),e.source].filter(Boolean).join(' · ')})));
        return head?[head,row]:[row]; }));
      count.textContent=s.length>400?`${s.length} found, the first 400 shown`:`${s.length} found`; };
    q.oninput=draw; if(cls) cls.onchange=draw; if(kindSel) kindSel.onchange=draw; if(lvlSel) lvlSel.onchange=draw;
    const allBtn=multi?el('button',{class:'btn small',type:'button',text:'Tick all shown',onclick:()=>{ shown().forEach(e=>chosen.add(e.id)); draw(); }}):null;
    dlg.append(el('div',{class:'pkhead'}, head, q, cls, kindSel, lvlSel, allBtn, count), el('div',{class:'pkbody'}, list, prev),
      el('div',{class:'brow wsbtns'}, el('button',{class:'btn',type:'button',text:'Cancel',onclick:()=>res(done([]))}), el('button',{class:'btn primary',type:'button',text:'OK',onclick:()=>res(done([...chosen]))})));
    dlg.addEventListener('cancel',e=>{ e.preventDefault(); res(done([])); });
    dlg.showModal(); draw(); q.focus();
  });
}

// the packs changed (saved here, or a file dropped in the folder): the workshop and the builder follow
document.addEventListener('homebrew-changed',()=>{
  if(!Workshop.dirtyPack){ Workshop.load(); if(S.tab==='brew' && !Workshop.draft && !Workshop.bg && !Workshop.feat && !Workshop.sp && !Workshop.th && !Workshop.item) Workshop.render(); }
  if(S.tab==='builder' && typeof Builder!=='undefined' && RULES.db) Builder.render();
});
