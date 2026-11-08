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
function elementXml(o){
  // empty details are left out (reading a file drops them too, so a save without changes writes the same file)
  const spec=Object.fromEntries(Object.entries(o.spec||{}).filter(([k,v])=>String(v).trim()!==''));
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
const hbSp=(e,k)=>((e&&e.spec&&e.spec[k])||'').trim();
const slugId=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'')||'X';
const clone=o=>JSON.parse(JSON.stringify(o));
const byName=(a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base',numeric:true});
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
const POWER_LINES_SHOWN={Attack:['Target','Attack','Hit','Miss','Effect'], Utility:['Target','Effect'], Feature:['Target','Effect']};
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
  const managed=c=>/^ID_INTERNAL_CATEGORY_(ATTACK|UTILITY|AT-WILL|ENCOUNTER|DAILY)(_USAGE)?$/.test(c) || /_ACTION$|INTERRUPT$|REACTION$/.test(c) || /^\d+$/.test(c)
    || hbEl(c)?.type==='Class' || hbEl(c)?.type==='Class Feature' || p.keywords.some(k=>catByWord(k)===c);
  p.keep.cats=(e.cats||[]).filter(c=>!managed(c));
  p.orig=JSON.stringify(powerCore(p));
  return p;
}
const powerCore=p=>({name:p.name,flavor:p.flavor,text:p.text,kind:p.kind,usage:p.usage,level:p.level,action:p.action,keywords:p.keywords,attackType:p.attackType,lines:p.lines,custom:p.custom||[]});
function powerEl(p, cls, source, givenBy){
  const o={id:p.id, name:p.name, type:'Power', source, flavor:p.flavor, text:p.text, rules:p.keep.rules};
  const feat=p.kind==='Feature';
  const usageCats=p.kind==='Attack' ? [USAGE_CAT[p.usage], USAGE_CAT[p.usage]+'_USAGE'] : [USAGE_CAT[p.usage]+'_USAGE'];
  // a feature's power: listed under the features that give it, with no class, kind or level (it is never chosen)
  o.cats=[...new Set([...(feat?(givenBy||[]):[p.kind==='Attack'?'ID_INTERNAL_CATEGORY_ATTACK':'ID_INTERNAL_CATEGORY_UTILITY']), ...usageCats, ...(cls&&!feat?[cls.id]:[]),
    ...p.keywords.map(catByWord).filter(Boolean), catByWord(p.action), ...p.keep.cats, ...(feat?[]:[String(p.level||1)])].filter(Boolean))];
  if(feat) o.pre='Unselectable';
  const spec={'Power Usage':p.usage, 'Display':((cls?.name||'')+' '+(feat?'Feature':(p.kind==='Attack'?'Attack':'Utility')+' '+(p.level||1))).trim(),
    'Keywords':p.keywords.join(', '), 'Action Type':p.action, 'Attack Type':p.attackType};
  for(const k of POWER_LINES) if((p.lines[k]||'').trim()) spec[k]=p.lines[k].trim();
  for(const [k,v] of p.custom||[]){ const name=String(k).trim().replace(/\s*:+$/,''); if(name && String(v).trim()) spec[name]=String(v).trim(); }   // the sheet adds the colon
  // a feature's power, as the original's are: "Power Type: Feature" and the feature that gives it (the original
  // builder needs these to print a feature's attack power on the character sheet)
  Object.assign(spec, p.keep.spec, cls?{'Class':cls.id}:{}, feat?{'Power Type':'Feature', ...((givenBy||[]).length?{'_ParentFeature':givenBy.join(',')}:{})}:{'Level':String(p.level||1), 'Power Type':p.kind});
  for(const k of Object.keys(spec)) if(spec[k]==='' && !(k in p.keep.spec)) delete spec[k];
  o.spec=spec;
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
  (t==='statadd' && /^(_LEVEL-ONE-HPS|_PER-LEVEL-HPS|Healing Surges)$/.test(a.name)) ||
  (t==='statadd' && /^(Fortitude|Reflex|Will) Defense Class Bonus$|^AC Class Bonus$/.test(a.name)) ||
  (t==='select' && a.type==='Power' && /at-will,1$/.test(a.category||'') && !a.name) ||
  (t==='select' && a.type==='Build') || (t==='select' && a.type==='Skill Training') || (t==='grant' && a.type==='Skill Training');
const GRANTS_RULE=(t,a)=>(t==='grant' && /^(Role|Power Source|Proficiency|Class Feature)$/.test(a.type)) ||
  (t==='select' && a.type==='Class Feature' && String(a.category||'').split('|').every(x=>hbEl(x.trim())));

function featureFrom(e){
  const f={id:e.id, isNew:false, name:e.name, level:+hbSp(e,'Level')||1, short:hbSp(e,'Short Description'), text:e.text||'', effects:[], keep:[]};
  // a resistance made here: "resist:necrotic" = a helper number (+5, +HALF-LEVEL), as the original writes it
  // (read in order, so a save without changes writes the same file)
  const rules=e.rules||[], helpers=new Set();
  for(const [t,a] of rules) if(t==='statadd' && /^resist:/.test(a.name||'') && a.type==='resist' && /^_hb /.test(a.value||'')) helpers.add(a.value);
  for(const r of rules){
    const [t,a]=r;
    if(t==='statadd' && helpers.has(a.name)) continue;
    if(t==='statadd' && helpers.has(a.value) && /^resist:/.test(a.name||'')){
      const parts=rules.filter(([t2,a2])=>t2==='statadd' && a2.name===a.value);
      const n=parts.map(([,a2])=>a2.value).find(v=>/^\+?\d+$/.test(v));
      f.effects.push({kind:'resist', dmg:a.name.slice(7), amount:+(n||0), half:parts.some(([,a2])=>a2.value==='+HALF-LEVEL')});
    }
    else if(t==='grant' && a.type==='Power' && !a.level) f.effects.push({kind:'power', id:a.name});
    else if(t==='grant' && a.type==='Feat' && !a.level) f.effects.push({kind:'feat', id:a.name});
    else if(t==='textstring' && a.name==='Free Rituals') f.effects.push({kind:'rituals', text:a.value||''});
    else if(t==='grant' && a.type==='Skill Training' && !a.level) f.effects.push({kind:'skill', id:a.name});
    else if(t==='grant' && a.type==='Proficiency' && !a.level) f.effects.push({kind:'prof', id:a.name});
    else if(t==='statadd' && a.name && a.value && Object.keys(a).every(k=>/^(name|value|type|condition)$/.test(k)))
      f.effects.push({kind:'bonus', stat:a.name, value:a.value, type:a.type||'', condition:a.condition||''});
    else if(t==='select' && a.type==='Class Feature'){
      const cat=String(a.category||''), ids=cat.split('|').map(x=>x.trim()).filter(Boolean);
      const opts=ids.every(x=>hbEl(x)) && ids.length>1 ? ids : typeEls('Class Feature').filter(o=>(o.cats||[]).includes(cat)).map(o=>o.id);
      f.effects.push({kind:'choose', number:+a.number||1, ids:opts, rule:r});
    }
    else f.keep.push(r);
  }
  return f;
}
function featureRules(f){
  const out=[];
  for(const x of f.effects){
    if(x.kind==='power' && x.id) out.push(['grant',{name:x.id,type:'Power'}]);
    else if(x.kind==='skill' && x.id) out.push(['grant',{name:x.id,type:'Skill Training'}]);
    else if(x.kind==='prof' && x.id) out.push(['grant',{name:x.id,type:'Proficiency'}]);
    else if(x.kind==='feat' && x.id) out.push(['grant',{name:x.id,type:'Feat'}]);
    else if(x.kind==='rituals' && x.text) out.push(['textstring',{name:'Free Rituals',value:x.text}]);
    else if(x.kind==='resist' && x.dmg && (x.amount || x.half)){
      const helper='_hb '+f.id+' '+x.dmg+' resist';
      if(x.amount) out.push(['statadd',{name:helper,value:'+'+x.amount}]);
      if(x.half) out.push(['statadd',{name:helper,value:'+HALF-LEVEL'}]);
      out.push(['statadd',{name:'resist:'+x.dmg,value:helper,type:'resist'}]);
    }
    else if(x.kind==='bonus' && x.stat && x.value){ const a={name:x.stat,value:/^[+-]/.test(x.value)?x.value:'+'+x.value}; if(x.type) a.type=x.type; if(x.condition) a.condition=x.condition; out.push(['statadd',a]); }
    else if(x.kind==='choose' && x.ids.length){
      const same=x.rule && JSON.stringify(featureFrom({id:'',name:'',rules:[x.rule]}).effects[0]?.ids)===JSON.stringify(x.ids);
      out.push(same ? x.rule : ['select',{type:'Class Feature',number:String(x.number||1),category:x.ids.join('|')}]);
    }
  }
  return out.concat(f.keep);
}
function featureEl(f, source){
  const o=f.isNew ? {id:f.id, name:'', type:'Class Feature', source, cats:[], spec:{}} : clone(baseEl(f.id)||hbEl(f.id)||{id:f.id,type:'Class Feature',spec:{}});
  delete o.hb; delete o.hbMod; delete o.hbReplaces; delete o._cs;
  o.name=f.name; o.spec={...(o.spec||{})}; o.spec['Level']=String(f.level||1);
  if(f.short) o.spec['Short Description']=f.short; else delete o.spec['Short Description'];
  o.text=f.text; o.rules=featureRules(f);
  // the powers it gives, listed the way the original's features list them: the original builder prints a power with
  // no level (a class feature power) on the character sheet only when its feature lists it here
  const pw=f.effects.filter(x=>x.kind==='power' && x.id).map(x=>x.id);
  if(f.isNew || o.spec['_DisplayPowers']!==undefined){ if(pw.length){ o.spec['Powers']=pw.join(','); o.spec['_DisplayPowers']=pw.join(','); } else { if(/^ID_/.test(o.spec['Powers']||'')) delete o.spec['Powers']; delete o.spec['_DisplayPowers']; } }
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
    hp1:0, hpLevel:0, surges:0, def:{Fortitude:0,Reflex:0,Will:0,AC:0}, skillCount:0, atWill:2,
    classSkills:[], autoSkills:[], skillChoices:[], profs:[], features:[], fdefs:{}, builds:[], powers:[],
    grantsId:grants?grants.id:'', keep:{cls:[], grants:[]}, own:new Set([id])};
  if(grants) d.own.add(grants.id);
  for(const r of cls.rules||[]){
    const [t,a]=r;
    if(!CLASS_RULE(t,a)){ d.keep.cls.push(r); continue; }
    const v=parseInt(String(a.value||'').replace(/^\+/,''),10)||0;
    if(a.name==='_LEVEL-ONE-HPS') d.hp1=v; else if(a.name==='_PER-LEVEL-HPS') d.hpLevel=v; else if(a.name==='Healing Surges') d.surges=v;
    else if(/Class Bonus$/.test(a.name||'')) d.def[/^AC/.test(a.name)?'AC':a.name.split(' ')[0]]=v;
    else if(t==='select' && a.type==='Power') d.atWill=+a.number||2;
    else if(t==='select' && a.type==='Skill Training'){
      const ids=String(a.category||'').split('|').map(x=>x.trim()).filter(Boolean);
      if(ids.length>1 && ids.every(x=>hbEl(x)?.type==='Skill Training')) d.skillChoices.push({number:+a.number||1, ids});
      else if(a.category===id) d.skillCount=+a.number||0;
      else d.keep.cls.push(r);
    }
    else if(t==='grant' && a.type==='Skill Training') d.autoSkills.push(a.name);
    else if(t==='grant' && a.type==='Grants' && r!==gRule) d.keep.cls.push(r);
  }
  for(const r of grants?.rules||[]){
    const [t,a]=r;
    if(!GRANTS_RULE(t,a)){ d.keep.grants.push(r); continue; }
    if(a.type==='Role') d.role=a.name; else if(a.type==='Power Source') d.source=a.name;
    else if(a.type==='Proficiency') d.profs.push(a.name);
    else if(t==='grant') d.features.push({kind:'grant', id:a.name, level:+a.level||0});
    else d.features.push({kind:'choose', number:+a.number||1, ids:String(a.category).split('|').map(s=>s.trim()), rule:r});
  }
  if(!d.role){ const m=hbSp(cls,'_RoleElement'); if(m) d.role=m; }
  if(!d.source){ const m=hbSp(cls,'_PowerSourceElement'); if(m) d.source=m; }
  for(const row of d.features) for(const fid of row.kind==='grant'?[row.id]:row.ids){
    const fe=hbEl(fid); if(!fe) continue;
    d.fdefs[fid]={...featureFrom(fe), isNew:!!fe.hb && !fe.hbReplaces};
    if(fe.hb) d.own.add(fid);
    // the options of a feature's own choice (fighter talents) are features of the class too
    for(const x of d.fdefs[fid].effects) if(x.kind==='choose') for(const sub of x.ids){ const se=hbEl(sub); if(se && !d.fdefs[sub]){ d.fdefs[sub]={...featureFrom(se), isNew:!!se.hb && !se.hbReplaces}; if(se.hb) d.own.add(sub); } }
  }
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
  autoSkills:d.autoSkills,profs:[...d.profs].sort(),features:d.features.map(r=>({...r,rule:undefined})),builds:d.builds.map(b=>b.name)});
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
      'ID_INTERNAL_PROFICIENCY_SIMPLE_MELEE','ID_INTERNAL_PROFICIENCY_SIMPLE_RANGED'], features:[], fdefs:{}, builds:[], powers:[], keep:{cls:[],grants:[]}, countsAs:[]};
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
    ['select',{type:'Power',number:String(d.atWill),category:'$$CLASS,at-will,1'}],
    ['textstring',{name:'_CLASSNAME',value:d.id}],
    ['statadd',{name:'_LEVEL-ONE-HPS',value:'+'+d.hp1}],
    ['statadd',{name:'_PER-LEVEL-HPS',value:'+'+d.hpLevel}],
    ['statadd',{name:'Healing Surges',value:'+'+d.surges}],
    ['select',{type:'Build',number:'1',category:'$$CLASS',optional:'true'}],
    ...defRules,
    ['select',{type:'Skill Training',number:String(d.skillCount),category:d.id}],
    ...(d.skillChoices||[]).filter(c=>c.ids.length).map(c=>['select',{type:'Skill Training',number:String(c.number||1),category:c.ids.join('|')}]),
    ...d.autoSkills.map(s=>['grant',{name:s,type:'Skill Training'}]),
    ...d.keep.cls];
  els.push(cls);
  // what the class grants: role, power source, proficiencies, class features
  const g=d.isNew||!d.grantsId ? {id:d.grantsId, name:d.name, type:'Grants', source, spec:{'_SupportsID':d.id}} : clone(baseEl(d.grantsId)||hbEl(d.grantsId));
  delete g.hb; delete g.hbMod; delete g.hbReplaces; delete g._cs;
  g.rules=[
    ...(d.role?[['grant',{name:d.role,type:'Role'}]]:[]),
    ...(d.source?[['grant',{name:d.source,type:'Power Source'}]]:[]),
    ...d.profs.map(p=>['grant',{name:p,type:'Proficiency'}]),
    ...d.features.map(r=>r.kind==='grant'
      ? ['grant',{name:r.id,type:'Class Feature',...(r.level>1?{level:String(r.level)}:{})}]
      : (r.rule && JSON.stringify(String(r.rule[1].category).split('|').map(s=>s.trim()))===JSON.stringify(r.ids) && +r.rule[1].number===r.number
          ? r.rule : ['select',{type:'Class Feature',number:String(r.number),category:r.ids.join('|')}])),
    ...d.keep.grants];
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
  for(const p of Object.values(d.pdefs||{})) if(d.powers.includes(p.id)) els.push(powerEl(p, {id:d.id, name:d.name}, source, givers(p.id)));
  listOps(d.powers.filter(id=>!(d.pdefs||{})[id]),'Power');
  return {els, ops};
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
function usedFeatures(d){
  const seen=new Map(), walk=id=>{ const f=d.fdefs[id]; if(!f || seen.has(id)) return; seen.set(id,f);
    for(const x of f.effects) if(x.kind==='choose') x.ids.forEach(walk); };
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
    const classes=p.els.filter(o=>o.type==='Class');
    const other=p.els.length-p.els.filter(o=>this.ownedByClass(p,o)).length;
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
      (other||otherOps)?el('p',{class:'muted small',text:`This pack also holds ${other+otherOps} other entr${other+otherOps===1?'y':'ies'} (made elsewhere, or for a later part of the workshop). They are kept as they are.`}):null);
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
  openPack(p){ if(this.dirtyPack) this.save(); this.cur=p; this.draft=null; this.status=''; this.render(); },
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
  close(){ this.save(); this.draft=null; this.render(); },

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
      el('div',{class:'wsfield full'}, el('span',{text:'Key abilities'}), this.ticks(ABILITIES.map(a=>[a,a]), d.keys, v=>d.keys=ABILITIES.filter(a=>v.includes(a)))),
      this.field('Short description',d.short,v=>d.short=v,{area:true,rows:2,hint:'One line, shown in lists.'}),
      this.field('Quote',d.flavor,v=>d.flavor=v,{area:true,rows:2}),
      this.field('Description',d.text,v=>d.text=v,{area:true,rows:8}));
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
      el('div',{class:'wsgrid four'}, ...DEFENSES.map(k=>this.field(k,d.def[k],v=>d.def[k]=v,{type:'number'}))));
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
  fdef(id){ const d=this.draft; if(!d.fdefs[id]){ const e=hbEl(id); d.fdefs[id]=e ? {...featureFrom(e), isNew:false, orig:JSON.stringify(featCore(featureFrom(e)))} : {id, isNew:true, name:'New feature', level:1, short:'', text:'', effects:[], keep:[]}; } return d.fdefs[id]; },
  newFeature(){ const d=this.draft, id=uniqueId('ID_HB_'+slugId(this.cur.name)+'_FEATURE_'+slugId(d.name)); const f={id, isNew:true, name:'New feature', level:1, short:'', text:'', effects:[], keep:[], open:true}; d.fdefs[id]=f; d.own.add(id); return f; },
  featureBox(f, row){
    const head=el('div',{class:'brow wrap wsfhead'},
      el('b',{text:f.name||'Unnamed feature'}), el('span',{class:'muted small',text:'level '+(row&&row.level>1?row.level:f.level)}),
      f.isNew?null:el('span',{class:'muted small',text:hbEl(f.id)?.source||''}),
      el('span',{style:'flex:1'}),
      el('button',{class:'btn small',type:'button',text:f.open?'Close':'Edit',onclick:()=>{ f.open=!f.open; this.render(); }}));
    if(!f.open) return el('div',{class:'wsfbox'}, head, f.short?el('div',{class:'muted small',text:f.short}):null);
    const shared=!f.isNew && Object.keys(this.draft.fdefs).length && this.isShared(f.id);
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
  effects(f){
    const box=el('div',{class:'wseffects'});
    const KINDS=[['power','Gives a power'],['bonus','Bonus'],['resist','Resistance'],['skill','Trained in a skill'],['prof','Proficiency'],['feat','Gives a feat'],['rituals','Free rituals (a note in the ritual book)'],['choose','A choice of features']];
    f.effects.forEach((x,i)=>{
      const kind=el('select',{}); for(const [v,t] of KINDS) kind.append(new Option(t,v,false,v===x.kind));
      kind.onchange=()=>{ f.effects[i]={kind:kind.value, ...(kind.value==='bonus'?{stat:'',value:'+1',type:'',condition:''}:kind.value==='choose'?{number:1,ids:[]}
        :kind.value==='resist'?{dmg:'necrotic',amount:5,half:true}:kind.value==='rituals'?{text:''}:{id:''})}; this.changed(); this.render(); };
      const pickBtn=(types,label)=>el('button',{class:'btn small',type:'button',text:x.id?(hbEl(x.id)?.name||x.id):label,onclick:async()=>{ const ids=await pickEls({title:label,types}); if(ids[0]){ x.id=ids[0]; this.changed(); this.render(); } }});
      let rest;
      if(x.kind==='power') rest=el('span',{class:'brow wrap'}, pickBtn(['Power'],'Choose a power…'),
        this.draft.pdefs[x.id] ? el('button',{class:'btn small',type:'button',text:'Edit this power',onclick:()=>{ this.powerOpen=x.id; this.tab='powers'; this.render(); $('#wsMain').scrollTop=0; }})
          : el('button',{class:'btn small',type:'button',text:'+ Make a new power',title:'A class feature power for this feature',onclick:()=>{ x.id=this.newPower('Feature',false); this.changed(); this.powerOpen=x.id; this.tab='powers'; this.render(); $('#wsMain').scrollTop=0; }}));
      else if(x.kind==='skill') rest=pickBtn(['Skill Training'],'Choose a skill…');
      else if(x.kind==='prof') rest=pickBtn(['Proficiency'],'Choose a proficiency…');
      else if(x.kind==='feat') rest=pickBtn(['Feat'],'Choose a feat…');
      else if(x.kind==='rituals'){ const n=el('input',{type:'text',placeholder:'Gentle Repose and Speak with Dead',style:'width:340px'}); n.value=x.text||''; n.oninput=()=>{ x.text=n.value; this.changed(); };
        rest=el('span',{class:'brow wrap'}, n, el('small',{class:'muted',text:'Shown in the ritual book, where they can be added free.'})); }
      else if(x.kind==='resist'){
        const dmg=el('select',{}); for(const t of ['acid','cold','fire','force','lightning','necrotic','poison','psychic','radiant','thunder']) dmg.append(new Option(t,t,false,t===x.dmg));
        dmg.onchange=()=>{ x.dmg=dmg.value; this.changed(); };
        const n=el('input',{type:'number',min:0,class:'num'}); n.value=x.amount||0; n.oninput=()=>{ x.amount=+n.value||0; this.changed(); };
        const h=el('input',{type:'checkbox',checked:!!x.half}); h.onchange=()=>{ x.half=h.checked; this.changed(); };
        rest=el('span',{class:'brow wrap'}, 'resist', n, el('label',{class:'chip'+(x.half?' on':'')}, h, '+ ½ level'), dmg); }
      else if(x.kind==='bonus'){
        const inp=(k,ph,w)=>{ const n=el('input',{type:'text',placeholder:ph,style:'width:'+w}); n.value=x[k]||''; n.oninput=()=>{ x[k]=n.value; this.changed(); }; return n; };
        const st=inp('stat','AC, Speed, Initiative, Stealth…','200px'); st.setAttribute('list','wsStatNames');
        st.onchange=()=>{ const k=BONUS_STATS.find(n=>n.toLowerCase()===st.value.trim().toLowerCase()); x.stat=k||st.value.trim(); st.value=x.stat; this.changed(); };
        rest=el('span',{class:'brow wrap'}, inp('value','+1','70px'), 'to', st, inp('type','type (optional)','130px'), inp('condition','when… (optional)','200px'),
          document.getElementById('wsStatNames')?null:el('datalist',{id:'wsStatNames'}, ...BONUS_STATS.map(n=>el('option',{value:n}))));
      } else {
        rest=el('span',{class:'brow wrap'}, 'choose', (()=>{ const n=el('input',{type:'number',min:1,value:x.number||1,class:'num'}); n.oninput=()=>{ x.number=+n.value||1; this.changed(); }; return n; })(), 'of',
          ...x.ids.map((id,j)=>el('span',{class:'pick'}, this.fdef(id).name, el('button',{class:'x',type:'button',text:'×',onclick:()=>{ x.ids.splice(j,1); this.changed(); this.render(); }}))),
          el('button',{class:'btn small',type:'button',text:'+ New option',onclick:()=>{ x.ids.push(this.newFeature().id); this.changed(); this.render(); }}),
          el('button',{class:'btn small',type:'button',text:'+ Existing…',onclick:async()=>{ const ids=await pickEls({title:'Options',types:['Class Feature'],multi:true,skip:new Set(x.ids)}); ids.forEach(id=>{ this.fdef(id); x.ids.push(id); }); if(ids.length){ this.changed(); this.render(); } }}));
      }
      box.append(el('div',{class:'brow wrap wseff'}, kind, rest, el('button',{class:'x',type:'button',title:'Remove',text:'×',onclick:()=>{ f.effects.splice(i,1); this.changed(); this.render(); }})));
      // the options of a choice are features of the class too: edited right here
      if(x.kind==='choose') for(const id of x.ids) if(this.fdef(id).isNew || this.fdef(id).open) box.append(el('div',{class:'wsopt'}, this.featureBox(this.fdef(id))));
    });
    box.append(el('button',{class:'btn small',type:'button',text:'+ Add',onclick:()=>{ f.effects.push({kind:'bonus',stat:'',value:'+1',type:'',condition:''}); this.changed(); this.render(); }}));
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
    const d=this.draft, id=uniqueId('ID_HB_'+slugId(this.cur.name)+'_POWER_'+slugId(d.name));
    d.pdefs[id]={id, isNew:true, name:'New power', flavor:'', text:'', kind, usage:kind==='Attack'?'At-Will':'Encounter', level:1, action:kind==='Attack'?'Standard action':'Minor action',
      keywords:[], attackType:'', lines:kind==='Attack'?{Attack:(d.keys[0]||'Strength')+' vs. AC'}:{}, custom:[], keep:{spec:{}, cats:[], rules:[]}, orig:''};
    d.powers.push(id); d.own.add(id); this.changed();
    if(open){ this.powerOpen=id; this.tab='powers'; this.render(); $('#wsMain').scrollTop=0; }
    return id;
  },
  powerEditor(p){
    const d=this.draft, preview=el('div',{class:'entry wsprev'});
    const showPrev=()=>{ try{ Builder.renderElement(preview,null,{...powerEl(p,{id:d.id,name:d.name},this.cur.name), hb:this.cur.name}); }catch(e){ preview.textContent=''; } };
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
        el('button',{class:'btn small',type:'button',text:'Done',onclick:()=>{ this.powerOpen=null; this.render(); }})),
      el('div',{class:'wspowergrid'},
        el('div',{},
          el('div',{class:'wsgrid'},
            (()=>{ const box=f('Name','name'), w=el('small',{class:'warn'}); box.append(w);
              const check=()=>{ const o=sameNamePower(p); w.textContent=o?`An official power has this name too (${hbSp(o,'Display')||'power'}, ${o.source}). The original Character Builder can mix them up and leave yours out: give it a name of its own.`:''; };
              box.querySelector('input').addEventListener('input',check); check(); return box; })(),
            p.kind==='Feature' ? el('div',{class:'wsfield'}, el('span',{text:'Level'}), el('small',{class:'muted',text:'None: a class feature gives this power. Add it to the feature under Class features, "What it does", "Gives a power".'})) : f('Level','level',{type:'number',min:1}),
            sel('Kind',p.kind,[['Attack','Attack power'],['Utility','Utility power'],['Feature','Class feature power']],v=>{ p.kind=v; this.changed(); this.render(); }),
            sel('Use',p.usage,[['At-Will','At-will'],['Encounter','Encounter'],['Daily','Daily']],v=>{ p.usage=v; this.changed(); }),
            sel('Action',p.action,POWER_ACTIONS,v=>{ p.action=v; this.changed(); }),
            (()=>{ const x=f('Attack type and range','attackType',{placeholder:'Melee weapon, Ranged 10, Close burst 1…'}); x.querySelector('input').setAttribute('list','wsAtkTypes'); return x; })(),
            f('Flavor','flavor',{area:true,rows:2}), kw),
          lineBox,
          el('div',{class:'wsgrid'}, ...(p.custom||[]).map((pair,i)=>el('div',{class:'wsfield full wscustom'},
            el('div',{class:'brow'}, (()=>{ const n=el('input',{type:'text',placeholder:'Name of the line (Undeath Focus)'}); n.value=pair[0]; n.oninput=()=>{ pair[0]=n.value; this.changed(); re(); }; return n; })(),
              el('button',{class:'x',type:'button',title:'Remove this line',text:'×',onclick:()=>{ p.custom.splice(i,1); this.changed(); this.render(); }})),
            (()=>{ const t=el('textarea',{rows:2}); t.value=pair[1]; t.oninput=()=>{ pair[1]=t.value; this.changed(); re(); }; return t; })()))),
          el('div',{class:'brow wrap'}, el('span',{class:'muted small',text:'Add a line:'}), ...more.map(k=>el('button',{class:'btn small',type:'button',text:'+ '+k,onclick:()=>{ (p.added ||= []).push(k); this.render(); }})),
            el('button',{class:'btn small',type:'button',text:'+ A line of your own…',title:'A line with its own name, like "Undeath Focus:" or "First Failed Saving Throw:"',onclick:()=>{ (p.custom ||= []).push(['','']); this.render(); }})),
          this.field('Text under the power (optional)',p.text,v=>p.text=v,{area:true,rows:2,after:re}), atList),
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
    const shown=()=>{ const words=searchNorm(q.value).split(' ').filter(Boolean), c=cls?.value;
      return all.filter(e=>(!c || (e.cats||[]).includes(c)) && (!kindSel?.value || powerKind(e)===kindSel.value) && (!lvlSel?.value || String(powerLevel(e))===lvlSel.value)
        && (!words.length || wordsIn(words, searchNorm(e.name+' '+(e.source||'')+' '+hbSp(e,'Display'))))); };
    const draw=()=>{ const s=shown(); let last=null; list.replaceChildren(...s.slice(0,400).flatMap(e=>{
        const head=isPow && (last===null || powerLevel(e)!==powerLevel(last) || powerKind(e)!==powerKind(last)) ? el('div',{class:'wsphead',text:(powerLevel(e)?'Level '+powerLevel(e):'No level')+' · '+powerKind(e)}) : null; last=e;
        const cb=el('input',{type:multi?'checkbox':'radio',name:'wsp',checked:chosen.has(e.id)});
        cb.onchange=()=>{ if(!multi) chosen.clear(); cb.checked?chosen.add(e.id):chosen.delete(e.id); };
        const row=el('label',{class:'pkrow'}, cb, el('span',{class:'pkname'}, el('b',{text:e.name}), el('div',{class:'muted small',text:[isPow?hbSp(e,'Power Usage'):'',hbSp(e,'Display'),e.source].filter(Boolean).join(' · ')})));
        return head?[head,row]:[row]; }));
      count.textContent=s.length>400?`${s.length} found, the first 400 shown`:`${s.length} found`; };
    q.oninput=draw; if(cls) cls.onchange=draw; if(kindSel) kindSel.onchange=draw; if(lvlSel) lvlSel.onchange=draw;
    const allBtn=multi?el('button',{class:'btn small',type:'button',text:'Tick all shown',onclick:()=>{ shown().forEach(e=>chosen.add(e.id)); draw(); }}):null;
    dlg.append(el('div',{class:'pkhead'}, head, q, cls, kindSel, lvlSel, allBtn, count), list,
      el('div',{class:'brow wsbtns'}, el('button',{class:'btn',type:'button',text:'Cancel',onclick:()=>res(done([]))}), el('button',{class:'btn primary',type:'button',text:'OK',onclick:()=>res(done([...chosen]))})));
    dlg.addEventListener('cancel',e=>{ e.preventDefault(); res(done([])); });
    dlg.showModal(); draw(); q.focus();
  });
}

// the packs changed (saved here, or a file dropped in the folder): the workshop and the builder follow
document.addEventListener('homebrew-changed',()=>{
  if(!Workshop.dirtyPack){ Workshop.load(); if(S.tab==='brew' && !Workshop.draft) Workshop.render(); }
  if(S.tab==='builder' && typeof Builder!=='undefined' && RULES.db) Builder.render();
});
