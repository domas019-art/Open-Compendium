"use strict";
/* =====================================================================
   Character Sheet: the play area.
   A vitals bar that is always on top (hit points, surges, second wind, death saves, action points, rests),
   and tabs below it. Rows are short; details open with a click.
   What happens in play (damage, used powers, conditions...) is kept in ch.play and saved with the character.
   Limits are read from the entries' own words ("twice per encounter", "one channel divinity power per encounter");
   counters in the bar (power points, shrouds...) are the core library's "Resource Pool" entries; spells to prepare
   come from spellbook choices or a spellbook table in the library (Prepared Spells tab, ch.prepared).
   ===================================================================== */

const SHEET_TABS=[['combat','Powers & Combat'],['spells','Prepared Spells'],['skills','Skills & Abilities'],['features','Features & Feats'],['gear','Inventory'],['notes','Companions & Notes'],['mounts','Mounts']];
let CONDITIONS=[];
let DURATIONS=[];
// what an effect can change, and the numbers it changes
const EFFECT_STATS=[['AC',['AC']],['Fortitude',['Fortitude Defense']],['Reflex',['Reflex Defense']],['Will',['Will Defense']],
  ['All defenses',['AC','Fortitude Defense','Reflex Defense','Will Defense']],['Attack rolls',['attack rolls']],['Damage rolls',['damage rolls']],
  ['Speed',['Speed']],['Initiative',['Initiative']],['Saving throws',['Saving Throws']],['All skills',SKILLS],...SKILLS.map(k=>[k,[k]])];
const DEF_NAMES=[['AC','AC'],['Fortitude Defense','Fort'],['Reflex Defense','Ref'],['Will Defense','Will']];
// what anyone can do in combat, Charge and Unarmed: from the core library (applyCore)
let COMBAT_ACTIONS=[], CHARGE=null, UNARMED=null;
// charging is a basic action everyone has: it is shown with the at-will attacks (CHARGE, from the core library)

Object.assign(Builder,{
  play(){
    const p=(this.ch.play ||= {});
    p.used ||= {}; p.effects ||= []; p.conditions ||= []; p.itemUsed ||= {};
    return p;
  },
  // a number on the sheet with the play effects on it (and a few conditions: slowed, immobilized, prone...)
  sv(n){
    const P=this.play(); let v=this.st.stat(n);
    for(const e of P.effects){ if(e.kw||e.kws?.length||e.weapon||e.melee||(e.whenBloodied && !P.bloodied)) continue; const row=EFFECT_STATS.find(([k])=>k===e.stat); if(row && row[1].includes(n)) v+=(+e.value||0); }
    const has=c=>P.conditions.some(x=>x.name===c);
    if(n==='Speed'){ if(has('Immobilized')||has('Restrained')||has('Petrified')) v=0; else if(has('Slowed')) v=Math.min(v,2); }
    if(n==='attack rolls' && (has('Prone')||has('Restrained'))) v-=2;
    if(/^(AC|Fortitude Defense|Reflex Defense|Will Defense)$/.test(n) && (has('Unconscious')||has('Petrified')||has('Helpless')&&false)) v-=5;
    return v;
  },
  svDiff(n){ return this.sv(n)-this.st.stat(n); },
  maxHP(){ return this.st.stat('Hit Points'); },
  surgeValue(){ return Math.floor(this.maxHP()/4)+(this.st.stat('Healing Surge Value')||0); },

  sheetStep(){
    if(this.stab==='powers') this.stab='combat';
    this.stab ||= 'combat';
    const hasMounts=this.mounts().length>0; if(this.stab==='mounts' && !hasMounts) this.stab='combat';
    const hasSpells=!!this.spellMode(); if(this.stab==='spells' && !hasSpells) this.stab='combat';
    const tabs=el('nav',{class:'steps sheettabs'}, ...SHEET_TABS.filter(([k])=>(k!=='mounts'||hasMounts)&&(k!=='spells'||hasSpells)).map(([k,l])=>el('button',{type:'button',class:'step'+(this.stab===k?' on':''),onclick:()=>{ this.stab=k; this.render(); }},l)));
    const vit=this.vitals();      // first: it works out being bloodied, which the powers below depend on
    const body=({combat:()=>this.combatTab(), spells:()=>this.spellsTab(), skills:()=>this.skillsTab(), features:()=>this.featuresTab(), gear:()=>this.gearTab(), notes:()=>this.notesTab(), mounts:()=>this.mountsTab()}[this.stab]||(()=>[]))();
    return [el('div',{class:'sheetwrap'}, vit, tabs, ...body.filter(Boolean))];
  },

  /* ---------- the vitals bar ---------- */
  // the genasi's elemental manifestations the character has (Extra Manifestation gives a second one to switch to)
  manifestations(){ return [...this.st.granted.values()].filter(e=>e.type==='Racial Trait' && /soul$/i.test(e.name)).map(e=>e.name); },
  vitals(){
    const ch=this.ch, st=this.st, P=this.play(), max=this.maxHP(), half=Math.floor(max/2);
    if(P.hp==null) P.hp=max;
    // being bloodied switches on "while bloodied" bonuses: the numbers are worked out again when it changes
    const bl=P.hp<=half && P.hp>0;
    if(!!P.bloodied!==bl){ P.bloodied=bl; this.st=evaluate(ch); }
    const hp=P.hp, temp=P.temp||0, sv=this.surgeValue(), surges=st.stat('Healing Surges'), left=surges-(P.surgesUsed||0);
    const set=fn=>{ fn(); this.changed(); };
    // the amount: typed, or built up with +1 / +5 / +10, then turned into damage, healing or temporary hit points
    const amount=el('input',{type:'number',min:0,class:'vnum',value:String(this.hpAmt||0),'aria-label':'Amount'});
    amount.oninput=()=>{ this.hpAmt=Math.max(0,parseInt(amount.value,10)||0); };
    const bump=n=>el('button',{class:'btn small',type:'button',text:'+'+n,onclick:()=>{ this.hpAmt=(parseInt(amount.value,10)||0)+n; amount.value=this.hpAmt; }});
    const take=fn=>{ const n=Math.max(0,parseInt(amount.value,10)||0); if(!n) return; this.hpAmt=0; set(()=>fn(n)); };
    const heal=n=>{ if(P.hp<0) P.hp=0; P.hp=Math.min(max,P.hp+n); if(P.hp>0) P.deathFails=0; };
    const dmg=n=>{ const t=Math.min(P.temp||0,n); P.temp=(P.temp||0)-t; P.hp-=n-t; P.hp=Math.max(P.hp,-half-1); };
    const pct=Math.max(0,Math.min(100,hp/max*100));
    const state=hp<=-half ? 'Dead' : hp<=0 ? 'Dying' : hp<=half ? 'Bloodied' : '';
    const ap=P.ap ?? st.stat('_BaseActionPoints');
    const chip=(label,n)=>{ const d=this.svDiff(n); return el('div',{class:'vchip'+(d>0?' up':d<0?' down':'')}, el('span',{text:label}), el('b',{text:n==='Initiative'?fmt(this.sv(n)):this.sv(n)})); };
    const passive=(label,k)=>el('div',{class:'vchip small'}, el('span',{text:label}), el('b',{text:10+this.sv(k)}));
    const manif=this.manifestations();
    if(manif.length && !manif.some(m=>m.toLowerCase()===(P.manifest||'').toLowerCase())){ P.manifest=manif[0]; this.st=evaluate(ch); }
    const head=el('div',{class:'vhead'},
      ch.portrait && !ch.portraitBlank ? pictureImg(Portraits.of(ch),'vportrait','') : null,
      el('div',{class:'vname'}, el('h2',{text:ch.name||'Unnamed'}),
        el('div',{class:'muted small',text:['Level '+st.level, [...st.granted.values()].find(e=>e.type==='Race')?.name, [...st.granted.values()].find(e=>e.type==='Class')?.name].filter(Boolean).join(' · ')})),
      el('div',{class:'vrest'},
        manif.length>1 ? el('label',{class:'vmanif',title:'Your current elemental manifestation (changing it takes a short rest, or as your power allows)'}, 'Manifestation ',
          el('select',{onchange:e=>set(()=>{ P.manifest=e.target.value; })}, ...manif.map(m=>el('option',{text:m,selected:m===P.manifest})))) : null,
        el('button',{class:'btn',type:'button',title:'Encounter powers and second wind come back; temporary hit points and short effects end',text:'Short rest',onclick:()=>set(()=>this.shortRest())}),
        el('button',{class:'btn',type:'button',title:'Everything comes back: hit points, surges, all powers, action points',text:'Extended rest',onclick:async()=>{ if(await ask('Take an extended rest? Hit points, healing surges and all powers are restored.'+(this.spellMode()?' Afterwards you can prepare your spells again (Prepared Spells tab).':''))) set(()=>this.extendedRest()); }})));
    const hpBox=el('div',{class:'vhp'+(state?' '+state.toLowerCase():'')},
      el('div',{class:'vhptop'}, el('span',{class:'muted small',text:'Hit points'}), state?el('span',{class:'vstate',text:state}):null),
      el('div',{class:'vhpnum'}, el('b',{text:hp}), el('span',{class:'muted',text:' / '+max}), temp?el('span',{class:'vtemp',text:' +'+temp+' temp'}):null),
      el('div',{class:'vbar'}, el('i',{style:`width:${pct}%`}), temp?el('u',{style:`width:${Math.min(100,temp/max*100)}%`}):null),
      el('div',{class:'brow vhpctl'}, bump(1), bump(5), bump(10), amount,
        el('button',{class:'btn small dmg',type:'button',text:'Damage',onclick:()=>take(dmg)}),
        el('button',{class:'btn small heal',type:'button',text:'Heal',onclick:()=>take(heal)}),
        el('button',{class:'btn small temp',type:'button',text:'Temp HP',title:'Temporary hit points don\'t add up: you keep the higher amount',onclick:()=>take(n=>{ P.temp=Math.max(P.temp||0,n); })})));
    const surgeBox=el('div',{class:'vbox'},
      el('span',{class:'muted small',text:'Healing surges'}),
      el('div',{}, el('b',{text:left}), el('span',{class:'muted',text:' / '+surges+' · value '+sv})),
      el('div',{class:'brow'},
        el('button',{class:'btn small',type:'button',disabled:left<=0,text:'Spend surge',title:`Regain ${sv} hit points`,onclick:()=>set(()=>{ P.surgesUsed=(P.surgesUsed||0)+1; heal(sv); })}),
        el('button',{class:'btn small'+(P.secondWind?' used':''),type:'button',disabled:!P.secondWind&&left<=0,text:P.secondWind?'Second wind used':'Second wind',
          title:'Standard action: spend a healing surge and gain +2 to all defenses until the start of your next turn (once per encounter)',
          onclick:()=>set(()=>{ if(P.secondWind){ P.secondWind=false; return; } this.secondWind(); })})));
    const deathBox=el('div',{class:'vbox'+(hp<=0?' alert':'')},
      el('span',{class:'muted small',text:'Death saves failed'}),
      el('div',{class:'vdots'}, ...[1,2,3].map(i=>el('button',{type:'button',class:'vdot'+((P.deathFails||0)>=i?' on':''),'aria-label':'Failed death save '+i,onclick:()=>set(()=>{ P.deathFails=(P.deathFails||0)>=i?i-1:i; })}))),
      el('span',{class:'muted small',text:'3 failures: dead'}));
    const apBox=el('div',{class:'vbox'},
      el('span',{class:'muted small',text:'Action points'}),
      el('div',{}, el('b',{text:ap}), el('span',{class:'muted',text:' · milestones '+(P.milestones||0)})),
      el('div',{class:'brow'},
        el('button',{class:'btn small',type:'button',disabled:ap<=0,text:'Spend',title:'Free action: take an extra action this turn (once per encounter)',onclick:()=>set(()=>{ P.ap=ap-1; const A=this.actions(); A.extra=(A.extra||0)+1; })}),
        el('button',{class:'btn small',type:'button',text:'+ Milestone',title:'Reaching a milestone (two encounters without an extended rest) gives an action point and another daily item power use',onclick:()=>set(()=>{ P.milestones=(P.milestones||0)+1; P.ap=ap+1; })})),
      // pools to keep track of (power points, entropy points, soul shards, shrouds): under the action points
      ...this.pools().map(pool=>{ const v=this.poolVal(pool), pl=(P.pools ||= {});
        const add=d=>set(()=>{ const n=Math.max(0, pool.max!=null ? Math.min(pool.max, v+d) : v+d); pl[pool.key]=pool.spend ? pool.max-n : n; if(!pl[pool.key]) delete pl[pool.key]; });
        return el('div',{class:'vpool',dataset:{pool:pool.key},title:pool.tip},
          el('span',{class:'muted small',text:pool.label}),
          el('b',{text:pool.spend ? v+' / '+pool.max : pool.max!=null ? v+' / '+pool.max : String(v)}),
          el('button',{class:'btn small',type:'button',text:'−',disabled:v<=0,title:pool.spend?'Spend one':'Remove one',onclick:()=>add(-1)}),
          el('button',{class:'btn small',type:'button',text:'+',disabled:pool.max!=null && v>=pool.max,title:pool.spend?'Regain one':'Add one',onclick:()=>add(1)})); }));
    // this turn's actions
    const A=this.actions();
    const act=(k,label,max)=>{ const u=A[k]||0, mx=max+(k==='standard'?(A.extra||0):0);
      return el('button',{type:'button',class:'vact'+(u>=mx?' spent':''),dataset:{act:k},title:`${label}: ${Math.max(0,mx-u)} left (click to mark one used)`,onclick:()=>set(()=>{ A[k]=u>=mx?0:u+1; })},
        el('span',{text:label}), el('b',{text:`${Math.max(0,mx-u)}/${mx}`})); };
    const actions=el('div',{class:'vacts'}, el('span',{class:'muted small',text:'This turn'}),
      act('standard','Standard',1), act('move','Move',1), act('minor','Minor',1),
      el('span',{class:'muted small',text:'Each round'}), act('immediate','Immediate',1),
      el('button',{class:'btn small primary nextturn',type:'button',text:'Next turn ▸',title:'Start of your turn: your actions come back; effects that last until the start of your next turn end',onclick:()=>set(()=>this.nextTurn())}));
    const nums=el('div',{class:'vchips'},
      ...DEF_NAMES.map(([n,l])=>chip(l,n)), chip('Init','Initiative'), chip('Speed','Speed'),
      passive('Pass. Insight','Insight'), passive('Pass. Perception','Perception'),
      el('span',{class:'vsep'}),
      ...ABILITIES.map(a=>{ const v=this.sv(a), m=Math.floor((v-10)/2); return el('div',{class:'vchip abil',title:`${a} ${v}: modifier ${fmt(m)}, with half your level ${fmt(m+Math.floor(st.level/2))}`}, el('span',{text:a.slice(0,3).toUpperCase()+' '+v}), el('b',{text:fmt(m)})); }));
    const cond=P.conditions.length||P.effects.length ? el('div',{class:'vconds'},
      ...P.conditions.map(c=>el('span',{class:'vcond'+(P.remind && c.dur==='save ends'?' remind':'')}, el('span',{text:c.name}), c.note?' '+c.note:'', el('small',{text:' · '+(c.dur||'')}),
        el('button',{class:'x',type:'button','aria-label':'Remove '+c.name,text:'×',onclick:()=>set(()=>{ P.conditions=P.conditions.filter(x=>x!==c); })}))),
      ...P.effects.map(e=>el('span',{class:'vcond eff'+(P.remind && e.dur==='save ends'?' remind':'')}, `${e.stat}${e.kw?' ('+e.kw+')':''}${e.kws?.length?' ('+e.kws.join(', ')+')':''}${e.melee?' (melee)':''} ${fmt(+e.value)}${e.dtype?' '+e.dtype:''}`, e.note?el('small',{text:' '+e.note}):null, el('small',{text:' · '+(e.dur||'')}),
        el('button',{class:'x',type:'button','aria-label':'Remove effect',text:'×',onclick:()=>set(()=>{ P.effects=P.effects.filter(x=>x!==e); })})))) : null;
    // the companions' hit points: smaller bars under yours, using the same amount
    const petBars=[...this.pets(),...this.mounts()].filter(x=>x.max>0).map(x=>{
      const S=((P.pets ||= {})[x.key] ||= {}); if(S.hp==null||S.hp>x.max) S.hp=x.max;
      const ph=Math.max(0,Math.min(100,S.hp/x.max*100)), down=S.hp<=0, bl=!down && S.hp<=Math.floor(x.max/2);
      const takeP=fn=>{ const n=Math.max(0,parseInt(amount.value,10)||0); if(!n) return; this.hpAmt=0; set(()=>fn(n)); };
      return el('div',{class:'vpet'+(down?' dying':bl?' bloodied':'')},
        el('div',{class:'vhptop'}, el('span',{class:'small'}, el('b',{text:x.name}), x.name!==x.kind?el('span',{class:'muted',text:' ('+x.kind+')'}):null), down?el('span',{class:'vstate',text:'Down'}):bl?el('span',{class:'vstate',text:'Bloodied'}):null),
        el('div',{class:'vpetrow'}, el('b',{text:S.hp}), el('span',{class:'muted small',text:' / '+x.max}),
          el('div',{class:'vbar'}, el('i',{style:`width:${ph}%`})),
          el('button',{class:'btn small dmg',type:'button',text:'Damage',title:'Uses the amount above',onclick:()=>takeP(n=>{ S.hp=Math.max(-Math.floor(x.max/2)-1,S.hp-n); })}),
          el('button',{class:'btn small heal',type:'button',text:'Heal',title:'Uses the amount above',onclick:()=>takeP(n=>{ S.hp=Math.min(x.max,Math.max(0,S.hp)+n); })})));
    });
    const box=el('div',{class:'vitals'}, head, el('div',{class:'vgrid'}, hpBox, surgeBox, deathBox, apBox), petBars.length?el('div',{class:'vpets'},...petBars):null, actions, nums, cond);
    if(cond) linkTerms(cond,'');
    return box;
  },
  actions(){ const P=this.play(); return (P.actions ||= {}); },
  // Hunter's Quarry, once used: its extra damage is suggested on your attacks until a rest (not added to the numbers)
  quarryText(){
    const st=this.st, L=st.level, n=st.stat("Hunter's Quarry Dice") || (L>=21?3:L>=11?2:1);
    const d8=[...st.granted.values()].some(e=>e.name==='Lethal Hunter');
    return `+${n}d${d8?8:6} Hunter's Quarry (once per round, if you hit your quarry)`;
  },
  isBeastBasic(p){ return !!p && (p.petBasic || sp(p,'Display')==='Beast Basic Attack' || /^ID_WOG_ANIMAL_ATTACK/.test(p.id||'')); },
  /* second wind: a healing surge, +2 to all defenses until the start of your next turn, and anything that happens
     "whenever you use your second wind" (Firecrafter: +1 power bonus to fire attack rolls until the end of your next turn) */
  secondWind(){
    const P=this.play(), max=this.maxHP(), surges=this.st.stat('Healing Surges');
    if(surges-(P.surgesUsed||0)<=0) return false;
    P.secondWind=true; P.surgesUsed=(P.surgesUsed||0)+1;
    if(P.hp<0) P.hp=0; P.hp=Math.min(max,P.hp+this.surgeValue()); if(P.hp>0) P.deathFails=0;
    this.useAction(sp([...this.st.granted.values()].find(e=>e.name==='Second Wind'),'Action Type')||'standard');
    P.effects.push({id:Date.now(),stat:'All defenses',value:2,note:'Second wind',dur:'start of your next turn'});
    for(const e of this.st.granted.values()){
      const t=[e.text||'', ...e.rules.filter(([k])=>k==='modify').map(([,a])=>a.value||'')].join(' ');
      const m=/whenever you use your second wind, you gain a \+(\d+) (\w+) bonus to attack rolls(?: with (\w+) attacks)? until the (end of your next turn|start of your next turn|end of the encounter)/i.exec(t);
      if(m && !P.effects.some(x=>x.note===e.name && x.from==='secondwind')) P.effects.push({id:Date.now()+1,stat:'Attack rolls',value:+m[1],type:m[2][0].toUpperCase()+m[2].slice(1),kw:(m[3]||'').toLowerCase(),note:e.name,dur:m[4].toLowerCase(),from:'secondwind'});
    }
    return true;
  },
  /* a power's bonuses to you for a while ("you gain a +2 power bonus to AC and Reflex until the end of your next
     turn"), from its Effect: put on the numbers when it's used, until "Next turn" (or a rest) ends them */
  selfEffects(p){
    const P=this.play(), t=sp(p,'Effect'), re=/\byou gain an? \+(\d+) (?:(\w+) )?bonus to (?:the |your )?([^.;]+?) until the (end of your next turn|start of your next turn|end of the encounter)/gi;
    P.effects=P.effects.filter(x=>x.from!=='power:'+p.id);
    for(const m of t.matchAll(re)){
      const v=+m[1], type=m[2]&&!/^an?$/i.test(m[2])?m[2][0].toUpperCase()+m[2].slice(1):'', what=m[3].toLowerCase(), dur=m[4].toLowerCase(), stats=[];
      if(/all defenses/.test(what)) stats.push('All defenses');
      else for(const [w,stat] of [['ac','AC'],['armor class','AC'],['fortitude','Fortitude'],['reflex','Reflex'],['will','Will']]) if(new RegExp('\\b'+w+'\\b').test(what)) stats.push(stat);
      if(/attack rolls?/.test(what)) stats.push('Attack rolls');
      if(/damage rolls?/.test(what)) stats.push('Damage rolls');
      if(/\bspeed\b/.test(what)) stats.push('Speed');
      if(/saving throws?/.test(what)) stats.push('Saving throws');
      for(const k of SKILLS) if(new RegExp('\\b'+k+'\\b','i').test(what)) stats.push(k);
      for(const stat of stats) if(EFFECT_STATS.some(([k])=>k===stat)) P.effects.push({id:Date.now()+P.effects.length, stat, value:v, type, note:p.name, dur, from:'power:'+p.id});
    }
  },
  // mark the action a power takes ("Standard Action", "Minor Action", "Immediate Interrupt"...)
  useAction(t){
    const A=this.actions(), k=/standard/i.test(t)?'standard':/move/i.test(t)?'move':/minor/i.test(t)?'minor':/immediate/i.test(t)?'immediate':'';
    if(k) A[k]=(A[k]||0)+1;
  },
  /* a list of actions to take (['minor','minor']): each one uses its own action if it's still free, otherwise a
     bigger one in its place (a move or standard action can always be used as a minor, a standard as a move).
     Returns where each came from; apply=true also marks them used. */
  planActions(keys, apply){
    const A={...this.actions()}, cap=k=>1+(k==='standard'?(A.extra||0):0), free=k=>(A[k]||0)<cap(k);
    const ORDER={minor:['minor','move','standard'], move:['move','standard'], standard:['standard'], immediate:['immediate']};
    const out=keys.map(k=>{ const from=(ORDER[k]||[k]).find(free); if(from) A[from]=(A[from]||0)+1; return {k, from:from||null}; });
    if(apply) for(const x of out) if(x.from){ const R=this.actions(); R[x.from]=(R[x.from]||0)+1; }
    return out;
  },
  // the actions a plan takes, as words with the action that is actually used underlined
  planWords(plan, whats){
    return plan.flatMap((x,i)=>[i?' and ':'', 'a '+x.k+' action', ' to '+whats[i],
      ...(x.from ? [' (', el('span',{class:'actname',text:'your '+x.from+' action'}), ')'] : [' (none left)'])]);
  },
  // while the mouse is on a Use / Stow button, the action it would take is lit up in the bar
  litActions(btn, plan){
    const on=v=>document.querySelectorAll('.vact').forEach(c=>c.classList.toggle('next', v && plan.some(x=>x.from===c.dataset.act)));
    btn.addEventListener('mouseenter',()=>on(true)); btn.addEventListener('mouseleave',()=>on(false));
    return btn;
  },
  /* stances and rages: using one makes it active (another stance replaces the old one; the same for rages) until
     the encounter ends or you end it. What it gives is added as an effect for as long as it lasts. */
  activeKind(p){ const k=sp(p,'Keywords'); return /\bStance\b/i.test(k) ? 'stance' : /\bRage\b/i.test(k) ? 'rage' : ''; },
  isActive(p){ const A=this.play().active||{}; return Object.values(A).includes(p.id); },
  endActive(kind){
    const P=this.play(), A=(P.active ||= {}), id=A[kind]; if(!id) return;
    delete A[kind]; P.effects=P.effects.filter(e=>e.from!=='active:'+id);
  },
  startActive(p){
    const kind=this.activeKind(p); if(!kind) return;
    this.endActive(kind);
    const P=this.play(); (P.active ||= {})[kind]=p.id;
    for(const e of this.activeBenefits(p,kind)) P.effects.push({id:Date.now()+Math.random(), ...e, note:p.name, dur:'until the '+kind+' ends', from:'active:'+p.id});
  },
  /* what a stance or rage does, as separate benefits with this level's numbers:
     "Until the stance ends, you gain the following benefits: -You gain a +2 power bonus to Stealth checks. -While you
     have combat advantage ..., +2 ... damage rolls. Level 11: The bonus to damage rolls increases to +3." */
  activeClauses(p){
    const L=this.st.level;
    let t=[sp(p,'Effect'), ...['Hit','Miss'].map(k=>sp(p,k)).filter(x=>/until the (?:stance|rage) ends/i.test(x))].join(' ').replace(/\s+/g,' ').trim();
    const u=/until the (?:stance|rage) ends,?\s*/i.exec(t);
    t = u ? t.slice(u.index+u[0].length) : t.replace(/^\s*You (?:enter|assume)[^.]*\.\s*/i,'');
    const ups=[]; t=t.replace(/Level (\d+):\s*([^.]*)\.\s*/g,(m,lv,x)=>{ ups.push([+lv,x]); return ''; }).trim();
    t=t.replace(/^you gain the following benefits:?\s*/i,'');
    let parts=/^\s*-/.test(t) ? t.split(/\s*-\s*(?=[A-Z])/) : t.split(/(?<=\.)\s+(?=[A-Z])/);
    // "a +2 power bonus to your speed when charging and a +2 power bonus to the attack rolls of your charge attacks": two benefits
    parts=parts.flatMap(x=>{ const m=/^(you gain )(an? \+\d+ .*?) and (an? \+\d+ .*)$/i.exec(x.trim()); return m ? [m[1]+m[2]+'.', m[1]+m[3]] : [x]; });
    parts=parts.map(x=>x.trim()).filter(Boolean).map(x=>x[0].toUpperCase()+x.slice(1)).map(x=>/[.!]$/.test(x)?x:x+'.');
    // "Level 11: The bonus to damage rolls increases to +3": the clause it means gets the new number
    for(const [lv,x] of ups.sort((a,b)=>a[0]-b[0])){
      if(L<lv) continue; const n=/\+(\d+)/.exec(x); if(!n) continue;
      const key=/damage/i.test(x)?/damage/i:/attack/i.test(x)?/attack/i:null;
      let i=-1; parts.forEach((c,j)=>{ if(/\+\d+/.test(c) && (!key || key.test(c))) i=j; });
      if(i>=0) parts[i]=parts[i].replace(/\+\d+/,'+'+n[1]);
    }
    return parts;
  },
  // a benefit that only counts sometimes ("while you have combat advantage", "made to climb", "during your first turn")
  isConditional(c){ return /\b(while|when|whenever|if|during|made to|that you provoke|against (?:it|that|an?|the|opportunity)|first turn|instead)\b/i.test(c); },
  // the main weapon's damage dice, for "1[W]"
  weaponDice(){
    const ch=this.ch, it=(ch.items||[]).find(x=>x.uid===ch.equip?.main), base=it && itemParts(it).base;
    return base ? sp(base,'Damage').trim() : '';
  },
  // numbers worked out in a rule's text: "5 + your Strength modifier" -> "10", "1[W]" -> "1[W] (1d12)"
  workOut(t){
    const mod=a=>Math.floor((this.st.stat(a)-10)/2), L=this.st.level, W=this.weaponDice();
    const ab=w=>ABILITIES.find(a=>a.toLowerCase()===w.toLowerCase());
    return t
      .replace(/(\d+)\s*\+\s*your (\w+) modifier/gi,(m0,n,w)=>ab(w) ? `${+n+mod(ab(w))} (${n} + ${w})` : m0)
      .replace(/your (\w+) modifier/gi,(m0,w)=>ab(w) ? `${m0} (${fmt(mod(ab(w)))})` : m0)
      .replace(/one-half your level/gi,`one-half your level (${Math.floor(L/2)})`)
      .replace(/(\d+)\[W\]/g,(m0,n)=>{ const d=/^(\d+)d(\d+)$/.exec(W); return d ? `${m0} (${n*d[1]}d${d[2]})` : m0; });
  },
  /* what an active stance or rage adds to the numbers: each benefit that is a plain bonus ("+2 power bonus to
     Stealth checks", "+4 to grab attacks", "+2 bonus to speed"); a bonus "if you or your target is bloodied" counts
     while you are bloodied. Everything else becomes a reminder. */
  activeBenefits(p,kind){
    const out=[], mod=a=>Math.floor((this.st.stat(a)-10)/2);
    for(const clause of this.activeClauses(p)){
      const bl=/if either you or your target is bloodied|while you are bloodied/i.test(clause);
      // only when charging: speed for the charge's move, attack rolls for the charge attack
      const chg=/\bwhen (?:you )?charg(?:e|ing)\b|\bcharge attacks?\b/i.test(clause);
      if(this.isConditional(clause.replace(/\bwhen (?:you )?charg(?:e|ing)\b/i,'')) && !bl) continue;
      let b=/you gain a \+(\d+) (?:(\w+) )?bonus to (?:the )?(.+?)\.?$/i.exec(clause), v, type, what;
      if(b){ v=+b[1]; type=b[2]; what=b[3]; }
      else { b=/you gain an? (?:(\w+) )?bonus to (?:the )?(.+?) equal to your (\w+) modifier(.*)$/i.exec(clause); if(!b) continue;
        const ab=ABILITIES.find(a=>a.toLowerCase()===b[3].toLowerCase()); if(!ab) continue; v=mod(ab); type=b[1]; what=b[2]+' '+b[4]; }
      if(/following/i.test(type||'')) continue;
      type=type && !/^an?$/i.test(type) ? type[0].toUpperCase()+type.slice(1) : '';
      what=what.toLowerCase();
      const basic=/basic attacks?/.test(what), weapon=/using a weapon|weapon attacks?|with weapons?|weapon damage/.test(what), melee=/melee/.test(what);
      const kws=[basic?'basic attack':'', weapon?'weapon':''].filter(Boolean);
      const add=(stat,extra={})=>out.push({stat, value:v, type, kws:[...new Set([...kws,...(extra.kws||[]),...(chg?['charge']:[])])], melee, whenBloodied:bl});
      let hit=false;
      if(/attack rolls?/.test(what)){ add('Attack rolls'); hit=true; }
      if(/damage rolls?/.test(what)){ add('Damage rolls'); hit=true; }
      if(!hit){ const k=/\b(grab|bull rush|opportunity|charge)(?: attacks?)?\b/.exec(what); if(k && /attack/.test(what)){ add('Attack rolls',{kws:[k[1]==='charge'?'charge':k[1]+' attack']}); hit=true; } }
      if(!hit && /\bmelee attacks?\b/.test(what) && !/damage/.test(what)){ add('Attack rolls'); hit=true; }
      if(/all defenses/.test(what)) add('All defenses');
      else for(const [w,stat] of [['ac','AC'],['armor class','AC'],['fortitude','Fortitude'],['reflex','Reflex'],['will','Will']]) if(new RegExp('\\b'+w+'\\b').test(what)) add(stat);
      if(/\bspeed\b/.test(what)) add('Speed');
      if(/\binitiative\b/.test(what)) add('Initiative');
      if(/saving throws?/.test(what)) add('Saving throws');
      for(const k of SKILLS) if(new RegExp('\\b'+k+'\\b','i').test(what)) add(k);
    }
    return out;
  },
  /* reminders on attack cards: the benefits of what is active that matter for attacks but can't be put in the
     numbers (extra [W], "+2 damage while you have combat advantage"), with this level's numbers worked out */
  activeReminders(how=''){
    const A=this.play().active||{}, out=[], bl=!!this.play().bloodied;
    // a clause only about ranged (or melee) attacks is not shown on the other kind of attack
    const melee=/melee|close/i.test(how), ranged=/ranged|area/i.test(how);
    const fits=c=>!how.trim() || !((/\branged\b/i.test(c) && !/\bmelee\b/i.test(c) && melee && !ranged) || (/\bmelee\b/i.test(c) && !/\branged\b/i.test(c) && ranged && !melee));
    for(const id of Object.values(A)){
      const p=RULES.db.els[id]; if(!p) continue;
      const keep=this.activeClauses(p).filter(c=>fits(c) && /attack roll|damage|\[W\]/i.test(c) &&
        (this.isConditional(c) ? !(/if either you or your target is bloodied|while you are bloodied/i.test(c) && bl) : !/^you gain an? (?:\+\d+ )?(?:\w+ )?bonus to (?:the )?(?:melee |weapon )?(?:damage rolls|attack rolls)/i.test(c)));
      if(keep.length) out.push(p.name.replace(/^Aspect of the /,'')+': '+this.workOut(keep.join(' ')));
    }
    return out;
  },
  // a small mark on a card: the action a Use would take right now (underlined), or that none is left
  usesMark(plan){
    if(!plan.length) return null;
    if(!plan.every(x=>x.from)) return el('span',{class:'usesmark none',text:'no action left'});
    if(plan.length===1 && plan[0].from===plan[0].k) return null;      // its own action: nothing to point out
    return el('span',{class:'usesmark subst'},'→ uses ', ...plan.flatMap((x,i)=>[i?' + ':'', el('span',{class:'actname',text:x.from})]));
  },
  // putting a prepared item away again: a minor action (or a bigger one in its place), or free
  stowButton(it){
    const plan=this.planActions(['minor']), ok=!!plan[0].from;
    return this.litActions(el('button',{class:'btn small pstow',type:'button',text:'Stow',title:'Put it away again',onclick:()=>{
      const P=this.play(), d0=()=>document.getElementById('sheetDetail');
      const done=()=>{ delete P.ready[it.uid]; d0().close(); document.querySelectorAll('.vact.next').forEach(c=>c.classList.remove('next')); this.changed(); };
      const btn=(cls,title,sub,onclick)=>el('button',{class:'btn '+cls,type:'button',onclick}, el('b',{text:title}), sub ? el('span',{class:'small'},...[].concat(sub)) : null);
      this.openDetail(box=>box.append(el('h3',{text:itemName(it)}), el('p',{class:'muted',text:'Put it back in your pack or on your belt. Stowing an item is a minor action.'}),
        el('div',{class:'choicebtns'},
          ok ? btn('primary','Stow',['Uses ', ...this.planWords(plan,['stow it']), '.'],()=>{ this.planActions(['minor'],true); done(); }) : null,
          btn((ok?'':'primary ')+'freeact','Free stow',(ok?'':'No action left this turn. ')+'Put it away without using an action (if your DM allows).',done),
          btn('','Cancel','',()=>d0().close()))));
    }}), plan);
  },
  // what using an item will take: taking it out first if it isn't in hand, then the item's own action
  itemPlan(it, action){
    const k=this.actionKey(action), ready=!!this.play().ready?.[it.uid];
    return this.planActions([...(ready?[]:['minor']), ...(k?[k]:[])]);
  },
  /* using a consumable: it has to be in hand first. Taking it out of a pack or belt is a minor action, so it can be
     prepared ahead of time, or taken out and used in one go. With no action left, it can still be done for free
     (when the DM allows). use() removes one from the inventory. */
  itemChoice(it, action, use){
    const P=this.play(); P.ready ||= {};
    const ready=!!P.ready[it.uid];
    const name=itemName(it), verb=/potion|elixir|draught|philter/i.test(name)?'drink it':'use it';
    const plan=this.itemPlan(it,action), canUse=plan.every(x=>x.from);
    const whats=plan.map((x,i)=>!ready && i===0 ? 'take it out' : verb);
    const prep=this.planActions(['minor']), canPrep=!!prep[0].from;
    const d0=()=>document.getElementById('sheetDetail');
    const done=()=>{ d0().close(); this.changed(); };
    const btn=(cls,title,sub,onclick)=>el('button',{class:'btn '+cls,type:'button',onclick}, el('b',{text:title}), sub ? el('span',{class:'small'},...[].concat(sub)) : null);
    this.openDetail(box=>{
      box.append(el('h3',{text:name+(it.qty>1?' ×'+it.qty:'')}),
        el('p',{class:'muted',text: ready ? 'It is in your hand, ready to use.' : 'It is stowed in your pack or on your belt. Taking it out is a minor action.'}),
        el('div',{class:'choicebtns'},
          ready ? null : canPrep ? btn('','Prepare',['Take it out now: ', ...this.planWords(prep,['take it out']), '.'],()=>{ this.planActions(['minor'],true); P.ready[it.uid]=true; done(); }) : null,
          ready ? null : btn('freeact','Free prepare',(canPrep?'':'No action left this turn. ')+'Take it out without using an action (if your DM allows).',()=>{ P.ready[it.uid]=true; done(); }),
          canUse ? btn('primary','Use',[plan.length ? 'Uses ' : (/free/i.test(action)?'A free action.':'No action needed.'), ...(plan.length?[...this.planWords(plan,whats),'.']:[]), ' One is taken from the inventory.'],()=>{ this.planActions(plan.map(x=>x.k),true); delete P.ready[it.uid]; use(); done(); }) : null,
          plan.length ? btn((canUse?'':'primary ')+'freeact','Free use',[canUse?'':'Not enough actions left this turn. ', 'Use it without using any action (if your DM allows). One is taken from the inventory.'],()=>{ delete P.ready[it.uid]; use(); done(); }) : null,
          btn('','Cancel','',()=>d0().close())));
    });
  },
  nextTurn(){
    const P=this.play(); P.actions={}; delete P.prompt; delete P.petActed;
    const keep=x=>{ if(x.dur==='start of your next turn') return false;
      if(x.dur==='end of your next turn'){ x.turns=(x.turns||0)+1; return x.turns<2; }
      return true; };
    P.effects=P.effects.filter(keep); P.conditions=P.conditions.filter(keep);
    // a reminder to roll saving throws: highlighted until the next click anywhere
    P.remind=[...P.effects,...P.conditions].some(x=>x.dur==='save ends');
    if(P.remind) setTimeout(()=>document.addEventListener('click',()=>{ P.remind=false; document.querySelectorAll('.vcond.remind').forEach(x=>x.classList.remove('remind')); },{once:true}),0);
  },
  shortRest(){
    const P=this.play();
    for(const id of Object.keys(P.used)){ if(/^day:/.test(id)) continue; const e=RULES.db.els[id]; if(!e || !(/daily/i.test(sp(e,'Power Usage')) || this.asDaily(e))) delete P.used[id]; }
    this.restPools('short');
    for(const k of Object.keys(P.itemUsed)) if(!/^daily:/.test(k)) delete P.itemUsed[k];
    P.secondWind=false; P.temp=0; P.actions={};
    // the encounter is over: rages and stances end, except a stance that can be assumed at will
    const st=P.active?.stance, keep=st && /at-will/i.test(sp(RULES.db.els[st],'Power Usage')) ? st : null;
    P.active=keep ? {stance:keep} : {};
    P.effects=P.effects.filter(e=>e.dur==='until removed' || (keep && e.from==='active:'+keep)); P.conditions=P.conditions.filter(c=>c.dur==='until removed');
    if(P.familiar==='destroyed') P.familiar='passive';   // it comes back after a short rest
    // companions from a card (fey beasts) regain all their hit points at the end of a short rest
    for(const pet of this.pets()) if(pet.card && P.pets?.[pet.key]) delete P.pets[pet.key];
    delete P.prompt; delete P.quarry; delete P.petActed;
  },
  extendedRest(){
    const P=this.play();
    this.shortRest();
    P.used={}; P.itemUsed={}; P.pets={}; P.hp=this.maxHP(); P.surgesUsed=0; P.deathFails=0; P.milestones=0; P.dailyItemUses=0;
    P.ap=this.st.stat('_BaseActionPoints');
    P.prepDone=false;     // spells can be prepared again (Prepared Spells tab)
    this.restPools('extended');
  },

  /* ---------- Combat: every power in a column by type, items with attacks, conditions ---------- */
  combatTab(){
    const st=this.st, P=this.play();
    const pets=this.pets();
    // the companions' attacks get their own column: powers that attack with the beast, their cards' attacks and auras
    // (the animal master's distracting attack is made with the animal minion: it is shown with the companions too)
    const beastPower=p=>/beast'?s attack bonus/i.test(sp(p,'Attack')) || /\banimal minion\b/i.test(sp(p,'Requirement')) || /^Familiar:/.test(p.name);
    const all=this.sheetPowers().filter(p=>!((pets.length || [...st.granted.values()].some(e=>e.type==='Familiar')) && beastPower(p))), util=p=>/utility/i.test(sp(p,'Power Type')+' '+sp(p,'Display'));
    const fams=[...st.granted.values()].filter(e=>e.type==='Familiar');
    const petList=pets.length||fams.length ? [...this.sheetPowers().filter(beastPower), ...pets.flatMap(x=>[x.attack,...(x.acts||[]),...(x.auras||[])]).filter(Boolean)] : [];
    const cols=[['At-will',p=>/at-will/i.test(sp(p,'Power Usage'))&&!util(p),'u0'],['Encounter',p=>/encounter/i.test(sp(p,'Power Usage'))&&!util(p)&&!this.asDaily(p),'u1'],
      ['Daily',p=>(/daily/i.test(sp(p,'Power Usage'))||this.asDaily(p))&&!util(p),'u2'],['Utility',util,'u3']];
    const seen=new Set();
    // powers hidden by the player (right-click a power): each column shows either its shown powers or its hidden ones
    const hidden=new Set(this.ch.hiddenPowers||[]), view=(this.hiddenView ||= {});
    const columns=cols.map(([t,f,cls])=>{ const full=all.filter(p=>!seen.has(p.id)&&f(p)); full.forEach(p=>seen.add(p.id));
      if(t==='At-will' && CHARGE) full.splice(full.filter(p=>sp(p,'Display')==='Basic Attack' || /basic attack/i.test(p.name)).length,0,CHARGE);
      const nHid=full.filter(p=>hidden.has(p.id)).length, inHid=!!view[t] && nHid>0;
      const list=full.filter(p=>hidden.has(p.id)===inHid);
      return el('div',{class:'pcol '+cls+(inHid?' hidview':''),dataset:{role:{'At-will':'atwill','Encounter':'encounter','Daily':'daily','Utility':'utility'}[t]}},
        el('h3',{class:'phead'}, el('span',{text:(inHid?t+', hidden ':t+' ')}, el('small',{class:'muted',text:list.length})),
          nHid ? el('button',{class:'btn small phidbtn',type:'button',title:inHid?'Back to the powers shown':'Show the powers you hid (right-click a power to hide or show it)',
            text:inHid?'Back':'Hidden ('+nHid+')',onclick:()=>{ view[t]=!inHid; this.render(); }}) : null),
        this.powerList(list)); });
    if(petList.length) columns.splice(4,0,el('div',{class:'pcol up',dataset:{role:'pets'}}, el('h3',{text:'Companions '}, el('small',{class:'muted',text:[...pets.map(x=>x.name),...fams.map(f=>f.name)].join(' · ')})), this.powerList(petList)));
    const mounts=this.mounts();
    if(mounts.length) columns.splice(petList.length?5:4,0,el('div',{class:'pcol up',dataset:{role:'mounts'}}, el('h3',{text:'Mounts '}, el('small',{class:'muted',text:mounts.map(x=>x.name).join(' · ')})), this.powerList(mounts.flatMap(x=>[...x.powers,...x.traits]))));
    const rest=all.filter(p=>!seen.has(p.id));
    if(rest.length) columns.push(el('div',{class:'pcol u3',dataset:{role:'other'}}, el('h3',{text:'Other'}), this.powerList(rest)));
    const itemPw=this.itemAttacks();
    // a worn item's powers join the column of their kind
    for(const x of itemPw.filter(x=>x.col!=='items')){ const c=columns.find(c=>c.querySelector('h3')?.firstChild?.textContent.trim()===x.col); if(c){ c.querySelector('.prows')?.querySelector(':scope > p.muted')?.remove(); c.append(x.node); } }
    const items=itemPw.filter(x=>x.col==='items').map(x=>x.node);
    if(items.length) columns.push(el('div',{class:'pcol ui',dataset:{role:'items'}}, el('h3',{text:'Consumables '}, el('small',{class:'muted',text:items.length})), ...items));
    // conditions and effects
    const cSel=el('select',{'aria-label':'Condition'}, ...CONDITIONS.map(c=>el('option',{text:c})));
    const cNote=el('input',{type:'text',placeholder:'note (e.g. 5 fire)',class:'detin short'});
    const cDur=el('select',{'aria-label':'Lasts'}, ...DURATIONS.map(d=>el('option',{text:d})));
    const eStat=el('select',{'aria-label':'What it changes'}, ...EFFECT_STATS.map(([k])=>el('option',{text:k})));
    const eVal=el('input',{type:'number',value:'2',class:'vnum','aria-label':'Bonus or penalty'});
    const eNote=el('input',{type:'text',placeholder:'from (e.g. Bless)',class:'detin short'});
    const eDur=el('select',{'aria-label':'Lasts'}, ...DURATIONS.map(d=>el('option',{text:d})));
    const condCard=el('div',{class:'bcard'}, el('h3',{text:'Conditions and effects'}),
      el('p',{class:'muted small',text:'Shown in the bar on top. Speed, prone and restrained are applied to the numbers; bonuses and penalties are added to what they change. “Next turn” ends effects that last until the start of your next turn; a short rest ends everything except “until removed”.'}),
      el('div',{class:'brow wrap'}, cSel, cNote, cDur, el('button',{class:'btn small',type:'button',text:'Add condition',onclick:()=>{ P.conditions.push({name:cSel.value,note:cNote.value.trim(),dur:cDur.value}); this.changed(); }})),
      el('div',{class:'brow wrap',style:'margin-top:8px'}, eStat, eVal, eNote, eDur, el('button',{class:'btn small',type:'button',text:'Add bonus / penalty',onclick:()=>{ const v=parseInt(eVal.value,10); if(!v) return; P.effects.push({id:Date.now(),stat:eStat.value,value:v,note:eNote.value.trim(),dur:eDur.value}); this.changed(); }})));
    // bonuses that only count sometimes ("+2 AC against opportunity attacks"); a manifestation's own bonuses are on while it's chosen
    const manifOther=c=>{ const m=/while manifesting (\w+)/i.exec(c||''); return m && m[1].toLowerCase()!==(P.manifest||'').toLowerCase(); };
    const conds=st.adds.filter(a=>a.cond && !condActive(a.cond,this.ch) && !manifOther(a.cond) && /^(AC|Fortitude Defense|Reflex Defense|Will Defense|Saving Throws|Death Saving Throws|Speed|Initiative|attack rolls|damage rolls|resist:.*)$/i.test(a.stat));
    const valueOf=a=>{ const v=String(a.value).trim(); return /^[+-]?\d+$/.test(v) ? +v : this.st.stat(v.replace(/^\+/,'')); };
    const condList=conds.length ? el('ul',{class:'plainlist'}, ...conds.map(a=>el('li',{}, el('b',{text:`${fmt(valueOf(a))} ${a.stat.replace(' Defense','').replace(/^resist:(.*)$/,'resist $1')}`}), ' '+a.cond.replace(/\s*while manifesting \w+/i,''), el('span',{class:'muted small',text:' — '+(RULES.db.els[a.src]?.name||'')})))) : el('p',{class:'muted small',text:'None.'});
    const resist=st.stat.keys().filter(k=>/^resist:/.test(k)).map(k=>[k.slice(7),st.stat(k)]).filter(([,v])=>v>0);
    const race=[...st.granted.values()].find(e=>e.type==='Race');
    const defCard=el('div',{class:'bcard'}, el('h3',{text:'Defenses, saves and senses'}),
      el('div',{class:'kv'}, ...DEF_NAMES.flatMap(([n,l])=>[el('span',{text:l}), el('b',{text:this.sv(n)})]),
        el('span',{text:'Saving throws'}), el('b',{text:fmt(this.sv('Saving Throws'))}),
        el('span',{text:'Resistances'}), el('b',{text:resist.length?resist.map(([d,v])=>`${v} ${d}`).join(', '):'—'}),
        el('span',{text:'Vision'}), el('b',{text:sp(race,'Vision')||'Normal'}),
        P.manifest ? el('span',{text:'Manifestation'}) : null, P.manifest ? el('b',{text:P.manifest}) : null),
      el('h4',{text:'Bonuses that only count sometimes'}), condList);
    const wrap=el('div',{class:'pcols planed'}, ...columns);
    requestAnimationFrame(()=>layoutPowerCols(wrap));
    return [wrap, el('div',{class:'cols2'}, condCard, defCard)];
  },

  sheetPowers(){
    const order=e=>{ const u=sp(e,'Power Usage').toLowerCase(); return /at-will/.test(u)?0:/encounter/.test(u)?1:/daily/.test(u)?2:3; };
    return this.preparedOnly([...this.st.granted.values()].filter(e=>e.type==='Power' && !sp(e,'Animal Companion') && !/^Companion:/.test(e.name)))
      .sort((a,b)=>order(a)-order(b) || (sp(b,'Display')==='Basic Attack')-(sp(a,'Display')==='Basic Attack') || a.name.localeCompare(b.name));
  },
  // powers usable "in place of a melee basic attack" (for a charge, for example)
  basicSubstitutes(){
    return this.sheetPowers().filter(p=>Object.values(p.spec).concat(p.text||'').some(v=>/in place of a melee basic attack|as a melee basic attack/i.test(v)));
  },
  // when a power can be used: "while bloodied" in its trigger or requirement
  powerGate(p){
    // a genasi manifestation's power works only while manifesting it
    const src=[...this.st.granted.values()].find(e=>e.type==='Racial Trait' && /soul$/i.test(e.name) && e.rules?.some(([t,a])=>t==='grant' && a.name===p.id));
    if(src && this.manifestations().length>1){ const ok=src.name.toLowerCase()===(this.play().manifest||'').toLowerCase(); if(!ok) return {need:'manifest', ok:false, text:'Only while manifesting '+src.name}; }
    const t=(sp(p,'Trigger')+' '+sp(p,'Requirement')).toLowerCase();
    if(/bloodied/.test(t) && /\byou\b|while/.test(t)) return {need:'bloodied', ok:!!this.play().bloodied};
    return null;
  },
  // power cards in a column: name, action and range, the worked-out numbers, and a Use button
  // is the action this power takes still available this turn? (standard, move, minor, immediate)
  actionKey(t){ return /standard/i.test(t)?'standard':/move/i.test(t)?'move':/minor/i.test(t)?'minor':/immediate/i.test(t)?'immediate':''; },
  // right-click a power: hide it from its column (shown again from the column's "Hidden" list)
  powerMenu(e,p){
    if(!p || !p.id) return;
    e.preventDefault();
    document.querySelector('.ctxmenu')?.remove();
    const hid=(this.ch.hiddenPowers||[]).includes(p.id);
    const close=()=>{ m.remove(); document.removeEventListener('mousedown',outside,true); document.removeEventListener('keydown',esc,true); };
    const outside=ev=>{ if(!m.contains(ev.target)) close(); }, esc=ev=>{ if(ev.key==='Escape') close(); };
    const m=el('div',{class:'ctxmenu'}, el('button',{type:'button',text:hid?'Show this power again':'Hide this power',onclick:()=>{
      const l=new Set(this.ch.hiddenPowers||[]); hid?l.delete(p.id):l.add(p.id); this.ch.hiddenPowers=[...l]; close(); this.changed(); }}));
    document.body.append(m);
    m.style.left=Math.min(e.clientX, innerWidth-m.offsetWidth-8)+'px'; m.style.top=Math.min(e.clientY, innerHeight-m.offsetHeight-8)+'px';
    setTimeout(()=>{ document.addEventListener('mousedown',outside,true); document.addEventListener('keydown',esc,true); },0);
  },
  powerList(list){
    const P=this.play(), box=el('div',{class:'prows'});
    for(const p of list){
      const u=sp(p,'Power Usage'), uses=this.powerUses(p), left=uses ? this.usesLeft(p,uses) : null, limited=!!uses || /encounter|daily/i.test(u), used=uses ? left===0 : !!P.used[p.id] || (p.name==='Second Wind' && !!P.secondWind);
      const ppPool=this.pools().find(x=>x.stat==='Power Points'), augs=ppPool ? this.augments(p) : [], ppLeft=ppPool ? this.poolVal(ppPool) : 0;
      const calc=p===CHARGE ? this.chargeCalc() : this.powerCalc(p), first=calc.rows[0], gate=p===CHARGE||p.virtual?null:this.powerGate(p);
      const beastBasic=this.isBeastBasic(p), free=beastBasic && (this.ch.details?.freeBeasts || P.prompt?.free);
      // free-acting companions (house rule): each companion makes one basic attack of its own a turn
      const petKey=p.pet ? 'pet:'+p.pet.name : p.id, ownTurn=beastBasic && this.ch.details?.freeBeasts && !P.prompt, petDone=ownTurn && !!(P.petActed||{})[petKey];
      const owner=p.pet ? p.pet.name+(p.pet.name!==p.pet.kind?' ('+p.pet.kind+')':'') : /beast'?s attack bonus/i.test(sp(p,'Attack')) ? (this.ch.details?.freeBeasts && sp(p,'Display')!=='Beast Basic Attack' && this.pets().length>1 ? 'any beast companion' : this.pets()[0]?.name+(this.pets()[0]&&this.pets()[0].name!==this.pets()[0].kind?' ('+this.pets()[0].kind+')':'')) : '';
      const summary=first ? `${first.weapon!=='—'?first.weapon+': ':''}${fmt(first.atk)} vs ${first.def}${first.dmg?' · '+first.dmg:''}` : calc.summary||'';
      const akind=this.activeKind(p), isAct=akind && this.isActive(p), utype=/at-will/i.test(u)?'atwill':/encounter/i.test(u)?'encounter':/daily/i.test(u)?'daily':'atwill';
      const ak=this.actionKey(sp(p,'Action Type')), pplan=!used && !free && !p.aura && ak ? this.planActions([ak]) : [];
      const noAct=(pplan.length>0 && !pplan[0].from) || petDone;
      const row=el('div',{oncontextmenu:e=>this.powerMenu(e,p),class:'pcard2'+(used?' used':'')+(gate&&!gate.ok?' gated':'')+(gate&&gate.ok?' ready':'')+(noAct?' noact':'')+(beastBasic&&P.prompt&&(!p.pet||this.ch.details?.freeBeasts)?' prompt':'')+(p.aura?' aura':'')+(isAct?' active act-'+utype:''),title:petDone?'This companion has already made its basic attack this turn':noAct?'No '+this.actionKey(sp(p,'Action Type'))+' action left this turn':''},
        el('button',{class:'pmain',type:'button','aria-expanded':'false'},
          el('div',{class:'ptitle'}, p===CHARGE?el('span',{class:'udot u0'}):p.virtual?el('span',{class:'udot '+(p.aura?'ua':'u0')}):usageDot(p), el('b',{text:p.name}), isAct?el('span',{class:'activetag act-'+utype,text:'Active'}):null),
          owner ? el('div',{class:'powner',text:owner}) : null,
          el('div',{class:'muted small'}, p.aura ? String(p.text).slice(0,90)+(String(p.text).length>90?'…':'') : [free?'Free (no action)':sp(p,'Action Type'), sp(p,'Attack Type')].filter(Boolean).join(' · '), ' ', p.aura?null:this.usesMark(pplan),
            uses ? el('span',{class:'usesleft'+(left===0?' none':''),title:(uses.shared?'Shared by your '+uses.shared+'. ':'')+'Only once per round.',text:left+' of '+uses.max+' left'+(uses.per==='day'?' today':'')}) : null,
            uses?.more?.length ? el('span',{class:'usesmore',role:'button',tabindex:0,text:'+1 use',title:'Another use this encounter ('+uses.more.join(', ')+')',
              onclick:ev=>{ ev.stopPropagation(); P.used['+'+uses.key]=(+P.used['+'+uses.key]||0)+1; this.changed(); }}) : null),
          beastBasic&&P.prompt&&(!p.pet||this.ch.details?.freeBeasts) ? el('div',{class:'pgate',text:'Your companion can make this attack now'+(P.prompt.free?' (free action)':'')}) : null,
          summary ? el('div',{class:'patk',text:summary+(calc.rows.length>1?`  +${calc.rows.length-1} more`:'')}) : null,
          calc.rows.length && !p.pet && !p.virtual && p!==CHARGE && this.poolDamageText() ? el('div',{class:'phint',text:this.poolDamageText()}) : null,
          P.quarry && p.name==="Hunter's Quarry" ? el('div',{class:'phint',text:'Quarry designated: suggested on your attacks until a rest'}) : null,
          P.quarry && calc.rows.some(r=>r.dmg) && !p.pet && !/beast'?s attack bonus/i.test(sp(p,'Attack')) ? el('div',{class:'phint',text:this.quarryText()}) : null,
          ...(calc.rows.some(r=>r.dmg) && !p.pet && !isAct ? this.activeReminders(String(sp(p,'Attack Type')||'')+' '+calc.rows.map(r=>r.range||'').join(' ')).map(t=>el('div',{class:'phint rage',text:t})) : []),
          gate ? el('div',{class:'pgate',text:gate.text || (gate.ok?'Available: you are bloodied':'Only while bloodied')}) : null),
        p.aura ? el('span',{class:'muted small',text:'always on'}) : el('button',{class:'btn small puse'+(used||petDone?' on':''),type:'button',text:used||petDone?'Used':'Use',
          title:petDone?'Mark as available again':limited?(used?'Mark as available again':'Mark as used (and the action it takes)'):'Mark the action it takes',
          onclick:()=>{ if(petDone){ delete P.petActed[petKey]; }      // marked by mistake: available again
            else if(used && uses){ P.used[uses.key]=Math.max(0,(+P.used[uses.key]||0)-1); if(!P.used[uses.key]) delete P.used[uses.key]; P.effects=P.effects.filter(x=>x.from!=='power:'+p.id); }
            else if(used){ delete P.used[p.id]; if(p.name==='Second Wind') P.secondWind=false; P.effects=P.effects.filter(x=>x.from!=='power:'+p.id); }
            else if(p.name==='Second Wind'){ if(!this.secondWind()) return; P.used[p.id]=1; }      // the same as the button in the bar
            else doUse();
            this.changed(); }}));
      // using the power (or one of its augmented versions: ver, paid for with power points)
      const doUse=ver=>{
              if(uses) P.used[uses.key]=(+P.used[uses.key]||0)+1; else if(limited) P.used[p.id]=1;
              if(p.name==="Hunter's Quarry") P.quarry=true;
              if(akind) this.startActive(p);
              if(!free) this.planActions(pplan.map(x=>x.k),true);
              this.selfEffects(ver||p);
              if(ownTurn) (P.petActed ||= {})[petKey]=1;
              if(beastBasic) delete P.prompt;
              // "your beast companion makes a melee basic attack against the target (as a free action)"
              const t=sp(p,'Effect')+' '+sp(p,'Hit');
              const m=/beast companion (?:can )?makes? a (?:melee )?basic attack[^.]*?(as a free action)?\./i.exec(t);
              if(m) P.prompt={kind:'beast', free:!!m[1], from:p.name};
      };
      const ab=augs.length ? el('div',{class:'paugs'}) : null;
      if(ab) row.append(ab);
      if(ab) for(const a of augs){ const c=this.powerCalc(a.el), f=c.rows[0], txt=f ? `${fmt(f.atk)} vs ${f.def}${f.dmg && /d\d|\[W\]/i.test(f.dmg)?' · '+f.dmg:''}` : '';
        const b=el('button',{class:'btn small paug',type:'button',disabled:used||noAct||ppLeft<a.cost,
          title:(ppLeft<a.cost?'Not enough power points. ':'')+'Use it augmented: spend '+a.cost+' power point'+(a.cost>1?'s':'')+'.'+['Hit','Effect','Miss'].map(k=>sp(a.el,k)?'\n'+k+': '+sp(a.el,k):'').join(''),
          onclick:ev=>{ ev.stopPropagation(); (P.pools ||= {})[ppPool.key]=(+P.pools[ppPool.key]||0)+a.cost; doUse(a.el); this.changed(); }},
          el('b',{text:'Augment '+a.cost}), txt ? ' '+txt : '');
        ab.append(b); }
      // an active stance or rage: what it does, and a button to end it
      if(isAct){
        const cl=this.activeClauses(p).map(c=>this.workOut(c));
        if(cl.length) row.querySelector('.pmain').append(el('div',{class:'phint'}, el('b',{text:'Active:'}), cl.length>1 ? el('ul',{class:'activelist'}, ...cl.map(c=>el('li',{text:c}))) : ' '+cl[0]));
        const endBtn=el('button',{class:'btn small pend',type:'button',text:'End',title:'End the '+akind+' (no action)',onclick:()=>{ this.endActive(akind); this.changed(); }});
        const use=row.querySelector('.puse'); const col=el('div',{class:'pbtns'}); use.replaceWith(col); col.append(use,endBtn);
      }
      row.querySelector('.pmain').onclick=()=>this.openDetail(box=>this.powerDetail(box,p,calc));
      row.querySelectorAll('.puse').forEach(b=>this.litActions(b,pplan));
      box.append(row);
    }
    if(!list.length) box.append(el('p',{class:'muted small',text:'None.'}));
    return box;
  },
  // a wide window over the sheet for a power's or item's full text
  openDetail(fill){
    let d=document.getElementById('sheetDetail');
    if(!d){ d=el('dialog',{id:'sheetDetail',class:'sheetdlg'}); $('#builder').append(d);
      d.addEventListener('click',e=>{ if(e.target===d) d.close(); }); }
    const body=el('div',{class:'sheetdlgbody'});
    d.replaceChildren(el('button',{class:'x dlgx',type:'button','aria-label':'Close',text:'×',onclick:()=>d.close()}), body);
    fill(body); d.showModal(); d.scrollTop=0;
  },
  // the full power card (without other powers that have their own entry), then the numbers for each weapon
  powerDetail(box,p,calc){
    const card=el('div',{class:'pcard entry'});
    if(p.virtual) card.append(el('h1',{class:p.aura?'player':'atwillpower'},p.name,el('span',{class:'level',text:p.pet.name+(p.pet.name!==p.pet.kind?' ('+p.pet.kind+')':'')})), ...String(p.text).split('\n').map(t=>el('p',{text:t})));
    else if(p===CHARGE) card.append(el('h1',{class:'atwillpower'},CHARGE.name,el('span',{class:'level',text:'Basic action'})), ...CHARGE.text.split('\n').map(t=>el('p',{text:t})));
    else {
      this.renderElement(card,p.id);
      const others=new Set(this.sheetPowers().filter(x=>x!==p).map(x=>x.name.toLowerCase()));
      for(const h of [...card.querySelectorAll('h1')].slice(1)){
        const name=(h.firstChild?.textContent||h.textContent).trim().toLowerCase();
        if(!others.has(name)) continue;
        let n=h.nextElementSibling; h.remove();
        while(n && n.tagName!=='H1'){ const nx=n.nextElementSibling; if(!n.classList.contains('publishedIn')) n.remove(); n=nx; }
      }
    }
    box.append(card);
    if(calc.rows.length){
      const t=el('table',{class:'atktable'}, el('tr',{}, el('th',{text:calc.weaponPower?'Weapon':calc.implPower?'Implement':''}), el('th',{text:'Attack'}), el('th',{text:'Damage'}), el('th',{})));
      for(const r of calc.rows){
        const how=el('tr',{class:'how',hidden:true}, el('td',{colspan:4},
          el('div',{class:'howcols'},
            el('div',{}, el('b',{text:'Attack '+fmt(r.atk)}), el('ul',{}, ...r.atkParts.map(([v,l])=>el('li',{text:`${fmt(v)} ${l}`})))),
            r.dmg ? el('div',{}, el('b',{text:'Damage '+r.dmg}), el('ul',{}, ...(r.dice?[el('li',{text:r.dice+' '+r.diceNote})]:[]), ...r.dmgParts.map(([v,l])=>el('li',{text:`${fmt(v)} ${l}`})))) : null)));
        t.append(el('tr',{}, el('td',{text:r.weapon}), el('td',{text:`${fmt(r.atk)} vs ${r.def}`}), el('td',{text:r.dmg||'—'}),
          el('td',{}, el('button',{class:'linkbtn',type:'button',text:'how?',onclick:()=>{ how.hidden=!how.hidden; }}))), how);
      }
      box.append(t);
    }
    if(calc.note) box.append(el('p',{class:'muted small',text:calc.note}));
    if(this.play().quarry && calc.rows.some(r=>r.dmg) && !p.pet && !/beast'?s attack bonus/i.test(sp(p,'Attack'))) box.append(el('p',{class:'phint',text:'Suggested: '+this.quarryText()+'. Not added to the numbers above.'}));
  },
  // charging: move your speed, then a melee basic attack (or a power usable in its place) with +1 to the attack roll
  chargeCalc(){
    const mba=this.sheetPowers().find(p=>p.id==='ID_INTERNAL_POWER_MELEE_BASIC_ATTACK');
    const rows=[];
    if(mba) for(const r of this.powerCalc(mba,{charge:true}).rows) rows.push({...r, atk:r.atk+1, atkParts:[...r.atkParts,[1,'charging']]});
    const subs=this.basicSubstitutes();
    return {rows, weaponPower:true, note:'Charge: standard action. Move up to your speed (at least 2 squares, toward the nearest square from which you can attack), then make a melee basic attack or a bull rush with +1 to the attack roll. After a charge you can\'t take further actions this turn unless you spend an action point.'
      +(subs.length?` Powers you can use in place of the melee basic attack: ${subs.map(p=>p.name).join(', ')} (+1 to the attack roll when charging).`:'')};
  },

  // what an item's power does to the numbers, where it can be read from its text
  // ("your melee attacks using this weapon deal extra fire damage equal to the weapon's enhancement bonus")
  itemEffect(magic,pw){
    const P=this.play(), enh=+((/\+(\d+)/.exec(sp(magic,'Enhancement'))||[])[1]||0);
    const m=/until the (end of your next turn|start of your next turn|end of the encounter)[^.]*?(?:your )?(melee )?attacks using this weapon deal extra (\w+) damage equal to the weapon's enhancement bonus/i.exec(pw);
    if(m && enh) P.effects.push({id:Date.now(),stat:'Damage rolls',value:enh,weapon:magic.id,melee:!!m[2],dtype:m[3].toLowerCase(),note:magic.name,dur:m[1].toLowerCase()});
  },
  /* ---------- items with attacks or powers (Alchemist's Fire, daily item powers) ---------- */
  itemAttacks(){
    const ch=this.ch, P=this.play(), items=ch.items||[], L=this.st.level, out=[];
    const tier=L>=21?3:L>=11?2:1, dailyMax=tier+(P.milestones||0), used=P.dailyItemUses||0;
    const eqUids=new Set(Object.values(ch.equip||{}));
    for(const it of items){
      const {magic}=itemParts(it); if(!magic) continue;
      const pk=Object.keys(magic.spec).find(k=>/^Power/i.test(k)); const pw=pk ? String(magic.spec[pk]) : '';
      if(!pw) continue;
      const consumable=/consumable/i.test(pk+pw);
      const daily=/daily/i.test(pk+pw), enc=/encounter/i.test(pk+pw);
      if(!consumable && !eqUids.has(it.uid) && itemSlots(it).length) continue;   // a worn item's power works only while worn
      const am=/([+-]\d+)\s*vs\.?\s*(AC|Fortitude|Reflex|Will)/i.exec(pw);
      // which column: consumables with the items; a worn item's power with the powers of its kind
      const head=pw.split('\n')[0];
      const col=consumable ? 'items' : (/utility/i.test(head) || !am) ? 'Utility' : daily ? 'Daily' : enc ? 'Encounter' : 'At-will';
      const dmg=(/(?:deals?|takes?)\s+(ongoing\s+)?(\d+d\d+(?:\s*\+\s*\d+)?|\d+)\s+([a-z ]*?)damage/i.exec(pw)||[]);
      const action=(/(Standard|Minor|Move|Free|Immediate (?:Interrupt|Reaction)|No) Action/i.exec(pw)||[])[0]||'';
      const key=(daily?'daily:':'enc:')+it.uid, u=!!P.itemUsed[key];
      const summary=am ? `${am[1]} vs ${am[2]}${dmg[2]?' · '+(dmg[1]?'ongoing ':'')+dmg[2]+(dmg[3]?' '+dmg[3].trim():''):''}` : '';
      const detail=el('div',{class:'pdetail',hidden:true});
      const inHand=consumable && !!P.ready?.[it.uid];
      const iplan=consumable ? this.itemPlan(it,action) : (this.actionKey(action) && !u ? this.planActions([this.actionKey(action)]) : []);
      const row=el('div',{class:'pcard2'+(u?' used':'')+(inHand?' inhand':'')},
        el('button',{class:'pmain',type:'button'},
          el('div',{class:'ptitle'}, el('span',{class:'udot ui'}), el('b',{text:itemName(it)+(it.qty>1?' ×'+it.qty:'')}), inHand?el('span',{class:'inhandtag',text:'In hand'}):null),
          el('div',{class:'muted small'}, [action, consumable?'consumable':daily?'daily item power':enc?'encounter item power':''].filter(Boolean).join(' · '), ' ', this.usesMark(iplan)),
          summary ? el('div',{class:'patk',text:summary}) : null),
        consumable
          ? el('div',{class:'pbtns'},
              el('button',{class:'btn small puse',type:'button',text:'Use…',title:'Prepare it, or use one',onclick:()=>this.itemChoice(it,action,()=>{
                it.qty=(it.qty||1)-1; if(it.qty<=0){ ch.items=(ch.items||[]).filter(x=>x!==it); for(const [s,uid] of Object.entries(ch.equip||{})) if(uid===it.uid) delete ch.equip[s]; } })}),
              inHand ? this.stowButton(it) : null)
          : el('button',{class:'btn small puse'+(u?' on':''),type:'button',text:u?'Used':'Use',title:daily?`Daily item powers: ${used} of ${dailyMax} used today`:'',onclick:async()=>{
              if(u){ delete P.itemUsed[key]; if(daily) P.dailyItemUses=Math.max(0,used-1); }
              else { if(daily && used>=dailyMax && !await ask('You have used all your daily item powers for today. Use anyway?')) return; P.itemUsed[key]=1; if(daily) P.dailyItemUses=used+1; this.planActions(iplan.map(x=>x.k),true); this.itemEffect(magic,pw); }
              this.changed(); }}));
      if(!u && !inHand && !iplan.every(x=>x.from)) row.classList.add('noact');
      row.querySelectorAll('.puse').forEach(b=>this.litActions(b,iplan));
      row.querySelector('.pmain').onclick=()=>this.openDetail(box=>{ const c=el('div',{class:'pcard entry'}); this.renderElement(c,magic.id); box.append(c); });
      out.push({col, node:el('div',{class:'prows'}, row)});
    }
    return out;
  },

  /* ---------- working out attacks ---------- */
  sheetWeapons(){
    const ch=this.ch, eq=ch.equip||{}, out=[], seen=new Set();
    const add=(base,magic)=>{ if(!base || base.type!=='Weapon') return; const k=base.id+'|'+(magic?.id||''); if(seen.has(k)) return; seen.add(k); out.push({base,magic}); };
    for(const s of ['main','off']){ const it=(ch.items||[]).find(x=>x.uid===eq[s]); if(it){ const {base,magic}=itemParts(it); add(base,magic); } }
    for(const it of ch.items||[]){ if(it.qty<=0) continue; const {base,magic}=itemParts(it); add(base,magic); }
    return out;
  },
  // numbers for powers without an attack roll: "1[W] extra damage" with your weapon, an aura's damage
  effectSummary(p){
    const L=this.st.level, mod=a=>Math.floor((this.sv(a)-10)/2), out=[];
    const text=['Effect','Hit','Secondary Effect'].map(k=>sp(p,k)).join('\n');
    let w=0; const wm=/(\d+)\[W\]/.exec(text); if(wm) w=+wm[1];
    for(const m of text.matchAll(/Level (\d+):\s*(\d+)\[W\]/g)) if(L>=+m[1]) w=+m[2];
    if(w){
      const main=this.sheetWeapons()[0];
      if(main){ const d=/(\d+)d(\d+)/.exec(sp(main.base,'Damage')||''); if(d) out.push(`${w}[W] = ${w*+d[1]}d${d[2]}${/extra/i.test(text)?' extra':''} (${main.base.name})`); }
    }
    const aura=/takes? (\w+(?: and \w+)?) damage equal to (?:your )?([^.,;]+)/i.exec(text);
    if(aura){
      const what=aura[2].toLowerCase(); let v=null;
      if(/primary ability|highest ability/.test(what)) v=Math.max(...ABILITIES.map(mod));
      else { const a=ABILITIES.find(x=>what.includes(x.toLowerCase())); if(a) v=mod(a); if(/one-half your level|half your level/.test(what)) v=(v||0)+Math.floor(L/2); }
      if(v!=null) out.push(`${v} ${aura[1]} damage`);
    }
    return out.join(' · ');
  },
  // the beasts a power can use: the beast companion; with the house rule, any beast companion (a fey beast too)
  allBeasts(anyBeast){
    const out=[]; const b=this.beastStats(); if(b) out.push(b);
    if(anyBeast && this.ch.details?.freeBeasts) for(const pet of this.pets()) if(pet.card && pet.beast) out.push(pet.beast);
    return out;
  },
  // the companions on the sheet: hit points, their attacks and auras
  pets(){
    const st=this.st, L=st.level, db=RULES.db, out=[];
    const bs=n=>st.stat('BEAST.'+n)||0;
    for(const slot of st.slots.filter(s=>s.type==='Companion' && this.picksOf(s).length)){
      const c=db.els[this.picksOf(slot)[0]]; if(!c) continue;
      // (a name brought in from an original save file is used until the Companion tab files it)
      const imp=!out.length ? this.ch.companionInfo?._import : null;
      const ci0=this.ch.companionInfo?.[slot.key]||{}, ci=(ci0.name||ci0.desc||!imp) ? ci0 : imp;
      const num=k=>+String(sp(c,k)).replace(/[^\d-]/g,'')||0;
      const cardId=c.rules.find(([t,a])=>t==='grant' && db.els[a.name]?.type==='Power' && /^Companion:/.test(db.els[a.name].name))?.[1].name;
      const card=db.els[cardId], ms=card?modSpec(card,st):{};
      const max=((+String(ms['Hit Points']||'').replace(/[^\d]/g,''))||(num('Hit Points at 1st Level')+num('Hit Points per Level Gained')*L))+bs('Hit Points');
      out.push({key:slot.key, name:ci.name||ci.desc||c.name, kind:ci.desc||c.name, max, el:c, cardSpec:ms, beast:{...this.beastStats(), name:ci.name||ci.desc||c.name}});
    }
    for(const p of [...st.granted.values()].filter(e=>e.type==='Power' && (sp(e,'Animal Companion') || /^ID_TIV_COMPANION_/.test(e.id) && sp(e,'Defenses')))){
      if(out.some(o=>o.kind===p.name)) continue;
      const key=this.cardPetKey(p,st), ci=this.ch.companionInfo?.[key]||{}, spec=modSpec(p,st);
      const kind=(sp(p,'Animal Companion').split(/\s+-\s+/)[0]||p.name).replace(/^Trained\s+/,'');
      const on=cardPetBonus(), hpb=on ? bs('Hit Points')-(st.stat('Pet Hit Points')||0) : 0;
      const max=/bloodied/i.test(spec['Hit Points']||'') ? Math.floor(this.maxHP()/2)+hpb : (+String(spec['Hit Points']||'').replace(/[^\d]/g,'')||0)+hpb;
      const name=ci.name||kind;
      // its attack ("Claw: ... your level + 5 vs. AC  Hit: 1d8 + one-half your level damage")
      const ak=Object.keys(spec).find(k=>/Attack:[\s\S]*vs\./.test(spec[k]||''));
      const av=String(spec[ak]||''), plus=+((/your level \+ (\d+)/i.exec(av)||[])[1]||0);
      const def=(/vs\.?\s*(AC|Fortitude|Reflex|Will)/i.exec(av)||[])[1]||'AC';
      const hitLines=(/Hit:\s*([\s\S]*)$/.exec(av)||[])[1]?.split('\n').map(x=>x.trim()).filter(Boolean)||[];
      let hit=hitLines.find(x=>!/^Level \d+:/.test(x))||'';
      for(const x of hitLines){ const m=/^Level (\d+):\s*(.*?damage)/i.exec(x); if(m && L>=+m[1]) hit=hit.replace(/^.*?damage/i,m[2]); }
      const die=(/\d+d\d+/.exec(hit)||[])[0]||'1d6', half=Math.floor(L/2);
      const AB={Str:'Strength',Con:'Constitution',Dex:'Dexterity',Int:'Intelligence',Wis:'Wisdom',Cha:'Charisma'}, sc={};
      for(const m of Object.values(spec).join('\n').matchAll(/\b(Str|Con|Dex|Int|Wis|Cha)\b:?\s*(\d+)/g)) sc[AB[m[1]]] ??= +m[2];
      const ab=on ? bs('attack rolls') : 0, atk=L+plus+ab, flat=(/one-half your level/i.test(hit)?half:0);
      const pet={key, name, kind, max, card:p, sc};
      pet.beast={name, atk, die, ability:'Strength', mod:a=>Math.floor(((sc[a]||10)-10)/2)};
      if(ak){
        const aname=ak.replace(/\s*\(.*\)$/,'');
        const dmg=die+(flat?'+'+flat:'');
        pet.attack={id:'pet:'+p.id, virtual:true, petBasic:true, pet, name:aname, type:'Power',
          spec:{'Power Usage':'At-Will','Action Type':(/(Standard|Minor|Move) Action/i.exec(av)||['Standard action'])[0],'Attack Type':(/Attack:\s*(Melee \d+|Ranged \d+)/i.exec(av)||[])[1]||'Melee 1','Display':'Beast Basic Attack'},
          text:`${aname}: ${av}`,
          calc:{rows:[{weapon:name, atk, def:def==='AC'?'AC':def, dmg, dice:die, diceNote:'(the card\'s dice)', atkParts:[[L,'your level'],[plus,'from the card'],...(ab?[[ab,'companion bonuses']]:[])], dmgParts:flat?[[flat,'one-half your level']]:[]}]}};
      }
      // its auras and traits ("Alert Companion (Aura 1): ...")
      // its other actions ("Nimble Fingers: (Move Action; At-Will) ... the master can take a standard action to command it")
      pet.acts=Object.entries(spec).filter(([k,v])=>k!==ak && /^\s*\((?:Move|Minor|Standard|Free|No)\s+Action/i.test(v||'') && !/\(aura \d+\)/i.test(v)).map(([k,v])=>{
        v=String(v).trim(); const m=/^\(([^)]*)\)\s*([\s\S]*)$/.exec(v), bits=(m?m[1]:'').split(/\s*;\s*/);
        return {id:'act:'+p.id+':'+k, virtual:true, pet, name:k, type:'Power', spec:{'Power Usage':bits.find(b=>/at-will|encounter|daily/i.test(b))||'At-Will','Action Type':bits.find(b=>/action/i.test(b))||''}, text:m?m[2]:v}; });
      pet.auras=Object.entries(spec).filter(([k,v])=>/\(aura \d+\)/i.test(v) || /aura/i.test(k)).map(([k,v])=>{ v=String(v).trim(); const m=/^(\([^)]*\))\s*([\s\S]*)$/.exec(v);
        return {id:'aura:'+p.id+':'+k, virtual:true, aura:true, pet, name:m?`${k} ${m[1]}`:k, type:'Power', spec:{'Power Usage':'','Action Type':'Aura'}, text:m?m[2]:v}; });
      out.push(pet);
    }
    return out;
  },
  /* ---------- mounts: the mounts in the inventory, from their creature entry in the compendium ----------
     Each has its hit points (a bar under yours), defenses, speed and its powers. A mount that grows with its rider
     ("HP your bloodied value", "your level + 7 vs. AC", "+ your Strength or Charisma modifier") is worked out
     from the character's own numbers. */
  mounts(){
    const ch=this.ch, st=this.st, L=st.level, db=RULES.db, out=[];
    const AB={strength:'Strength',constitution:'Constitution',dexterity:'Dexterity',intelligence:'Intelligence',wisdom:'Wisdom',charisma:'Charisma'};
    const amod=a=>Math.floor((st.stat(a)-10)/2);
    for(const it of ch.items||[]){
      const e=db?.els[it.ids?.[0]];
      if(!e || e.type!=='Gear' || sp(e,'Category')!=='Mount' || /Category:\s*Companion/i.test(sp(e,'Full Text')) || (it.qty||1)<=0) continue;
      const ref=compendiumRef(e), html=ref ? (lib[ref[0]].data[ref[1]]||'') : '';
      const box=document.createElement('div'); box.innerHTML=html ? sanitize(html) : '';
      const txt=html ? box.textContent : sp(e,'_Monster')||sp(e,'Full Text');
      const kind=(/^(.*?)(?:<br|$)/.exec(box.querySelector('h1')?.innerHTML||'')?.[1]||e.name).replace(/<[^>]+>/g,'').trim();
      const lvl=(/Level (\d+)/.exec(box.querySelector('h1 .level')?.textContent||txt)||[])[1];
      const scaled=/your bloodied value|your defenses|your level/i.test(txt);
      const max=/HP\s*your bloodied value/i.test(txt) ? Math.floor(this.maxHP()/2) : +((/HP\s*(\d+)/.exec(txt)||[])[1]||0);
      const dm=/AC\s*(\d+)[;,]\s*Fortitude\s*(\d+),\s*Reflex\s*(\d+),\s*Will\s*(\d+)/.exec(txt), yd=/Defenses\s*your defenses(?:\s*\+\s*(\d+))?/i.exec(txt);
      const defs=dm ? dm.slice(1,5).map(Number) : yd ? ['AC','Fortitude Defense','Reflex Defense','Will Defense'].map(n=>st.stat(n)+(+yd[1]||0)) : null;
      const grab=re=>{ const m=re.exec(html||txt); return m ? m[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim() : ''; };
      const speed=grab(/<b>Speed<\/b>\s*([^<]*)/)||grab(/Speed\s*([^\n]*)/), init=grab(/<b>Initiative<\/b>\s*([^<]*)/), perc=grab(/Perception(?:<\/b>)?\s*([+-]?\s*\d+)/);
      const m={key:'mount:'+it.uid, uid:it.uid, name:e.name, kind:kind!==e.name?kind:(lvl?'Level '+lvl+' mount':'Mount'), max, defs, speed, init, perc, scaled, ref, el:e, powers:[], traits:[]};
      // its powers: a heading line, then its lines (the newer layout groups them under "Standard Actions" and the like)
      let section='';
      const heads=[];
      for(const n of box.children){
        if(n.tagName==='H2'){ section=n.textContent.trim(); continue; }
        if(n.matches('p.flavor.alt') && n.querySelector('b') && !/^(Str|Alignment|Skills|Equipment)$/.test(n.querySelector('b').textContent.trim())){ heads.push({n, section, lines:[]}); continue; }
        if(n.matches('p.flavorIndent') && heads.length) heads[heads.length-1].lines.push(n.textContent.trim());
      }
      heads.forEach((h,i)=>{
        const head=h.n.textContent.replace(/\s+/g,' ').trim(), name=h.n.querySelector('b').textContent.trim(), body=h.lines.join('\n');
        const usage=(/\b(at-will|encounter|daily|recharge[^;)✦]*)/i.exec(head)||[])[1]||'';
        const act=/standard/i.test(h.section)?'Standard action':/move/i.test(h.section)?'Move action':/minor/i.test(h.section)?'Minor action':/free/i.test(h.section)?'Free action':/triggered/i.test(h.section)?((/\((Immediate (?:Reaction|Interrupt)|Free Action|Opportunity Action|No Action)\)/i.exec(body)||[])[1]||'Triggered'):
          (/\((standard|move|minor|free|immediate reaction|immediate interrupt|opportunity|no action)\b/i.exec(head)||[])[1]||(/\(\s*when\b/i.test(head)?'Triggered':'');
        const isTrait=/trait/i.test(h.section) || (!usage && !act);
        const forRider=/\(mount\)|✦\s*Mount\b|while mounted by/i.test(head);
        const P={id:'mount:'+it.uid+':'+i, virtual:true, pet:m, name:name+(forRider?' (mount)':''), type:'Power', text:head+'\n'+body,
          spec:{'Power Usage':usage.replace(/^./,c=>c.toUpperCase()), 'Action Type':act.replace(/^./,c=>c.toUpperCase()), 'Attack Type':(/((?:Melee|Ranged|Reach) \d+|Close (?:burst|blast) \d+|Area burst \d+ within \d+)/i.exec(body)||[])[1]||''}};
        if(isTrait){ P.aura=true; P.spec['Action Type']='Trait'; P.text=body||head; m.traits.push(P); return; }
        // the attack: "+12 vs. AC" or "your level + 7 vs. AC"; the damage: "2d6 + 10" or "2d6 + your Strength or Charisma modifier"
        const am=/(?:your level\s*\+\s*(\d+)|([+-]\s*\d+))\s*vs\.?\s*(AC|Fortitude|Reflex|Will)?/i.exec(body);
        if(am && am[3]){
          const atkParts=am[1] ? [[L,'your level'],[+am[1],'from its card']] : [[+am[2].replace(/\s/g,''),'its attack bonus']];
          const hitTxt=(/Hit:\s*([^\n]*)/.exec(body)||[])[1] || body.slice(am.index+am[0].length);
          const dmm=/(\d+d\d+)\s*(?:\+\s*(?:(\d+)\b|your (\w+)(?: or (\w+))? modifier|(one-half your level)))?/i.exec(hitTxt);
          let dmg='', dmgParts=[];
          if(dmm){
            let flat=0;
            if(dmm[2]) { flat=+dmm[2]; dmgParts.push([flat,'from its card']); }
            else if(dmm[3]){ const a=[dmm[3],dmm[4]].filter(Boolean).map(x=>AB[x.toLowerCase()]).filter(Boolean), best=a.sort((x,y)=>amod(y)-amod(x))[0]; if(best){ flat=amod(best); dmgParts.push([flat,'your '+best+' modifier']); } }
            else if(dmm[5]){ flat=Math.floor(L/2); dmgParts.push([flat,'one-half your level']); }
            dmg=dmm[1]+(flat?(flat>0?'+':'')+flat:'');
          }
          P.calc={rows:[{weapon:name, atk:atkParts.reduce((t,[v])=>t+v,0), def:am[3], dmg, dice:dmm?.[1]||'', diceNote:'(its card\'s dice)', atkParts, dmgParts}]};
        }
        m.powers.push(P);
      });
      out.push(m);
    }
    return out;
  },
  /* a companion's skills, for the Skills tab: [skill, total, trained, parts]. A beast companion uses one-half your
     level + its ability modifier, +5 when trained, + bonuses from your feats (Beast Guidance: +2 to your trained
     skills). A companion card that prints its skills ("Stealth +9", "Perception equal to yours + 2") shows those. */
  petSkills(pet){
    const st=this.st, half=Math.floor(st.level/2), db=RULES.db, bs=n=>st.stat('BEAST.'+n)||0, out=[];
    if(pet.el){
      const c=pet.el, num=k=>+String(sp(c,k)).replace(/[^\d-]/g,'')||0;
      const score=a=>st.stat('Companion.'+a)||num(a)||10, mod=a=>Math.floor((score(a)-10)/2);
      const names=(String(pet.cardSpec?.['Trained Skills']||'').trim() || sp(c,'Trained Skills').split(',').map(x=>db.els[x.trim()]?.name||x.trim()).join(', '))
        .split(/\s*,\s*/).map(x=>x.trim().toLowerCase()).filter(Boolean);
      for(const k of SKILLS){
        const a=this.skillAbility(k)||'Wisdom', tr=names.includes(k.toLowerCase());
        const extra=st.stat.parts('BEAST.'+k+' misc').filter(x=>x.value).map(x=>[x.value,(x.type?x.type+' bonus - ':'')+(db.els[x.src]?.name||'')]);
        const parts=[[half,'one-half your level'],[mod(a),a+' modifier ('+score(a)+')'],...(tr?[[5,'trained']]:[]),...extra].filter(([v])=>v);
        out.push([k, parts.reduce((t,[v])=>t+v,0), tr, parts]);
      }
      return out;
    }
    const spec=pet.card ? modSpec(pet.card,st) : {}, txt=Object.values(spec).join('\n'), skillsTxt=String(spec['Skills']||'');
    // a card that prints its skills ("Athletics +2, Stealth +9") has only those; otherwise (fey beasts) every skill is
    // one-half your level (its level is yours) + its ability modifier
    const listed=/[A-Za-z]\s*\+\s*\d/.test(skillsTxt), sc=pet.sc||{}, cardHalf=Math.floor((+(/\bLevel (\d+)/i.exec(String(spec['Animal Companion']||''))||[])[1]||0)/2);
    const extra=k=>cardPetBonus() ? st.stat.parts('BEAST.'+k+' misc').filter(x=>x.value).map(x=>[x.value,(x.type?x.type+' bonus - ':'')+(db.els[x.src]?.name||'')]) : [];
    for(const k of SKILLS){
      let m=new RegExp('\\b'+k+'\\s*\\+\\s*(\\d+)','i').exec(skillsTxt), parts;
      if(m) parts=[[+m[1],'from its card']];
      else if((m=new RegExp('\\b'+k+'\\s*\\(?equal to yours(?:\\s*\\+\\s*(\\d+))?','i').exec(txt))) parts=[[this.sv(k),'your '+k],...(m[1]?[[+m[1],'from its card']]:[])];
      else if((m=new RegExp('\\b'+k+'\\s*:?\\s*([+-]\\s*\\d+)','i').exec(String(spec['Statistics']||'')))) parts=[[+m[1].replace(/\s/g,''),'from its card']];
      else if(Object.keys(sc).length){ const a=this.skillAbility(k)||'Wisdom', s=sc[a]??10, h=listed?cardHalf:half; parts=[...(h?[[h,listed?'one-half its level':'one-half your level']]:[]),[Math.floor((s-10)/2),a+' modifier ('+s+')']]; }
      else continue;
      parts=[...parts,...extra(k)].filter(([v])=>v);
      out.push([k, parts.reduce((t,[v])=>t+v,0), !!(m && listed), parts]);
    }
    return out;
  },
  // the beast companion's numbers, for powers it attacks with
  beastStats(){
    const st=this.st, L=st.level;
    const slot=st.slots.find(s=>s.type==='Companion' && this.picksOf(s).length); const c=slot && RULES.db.els[this.picksOf(slot)[0]];
    if(!c) return null;
    const num=k=>+String(sp(c,k)).replace(/[^\d-]/g,'')||0;
    const score=a=>st.stat('Companion.'+a)||num(a)||10;
    const ci=this.ch.companionInfo?.[slot.key]||{};
    const imp=this.ch.companionInfo?._import;
    return {name:ci.name||(!ci.desc&&imp?.name)||c.name, atk:num('Attack Bonus')+L+(st.stat('BEAST.attack rolls')||0), die:sp(c,'Damage')||'1d6',
      ability:ABILITIES.find(a=>new RegExp(a,'i').test(sp(c,'Ability Score'))) || 'Strength', mod:a=>Math.floor((score(a)-10)/2)};
  },
  powerCalc(p,opt={}){
    if(p.virtual) return p.calc || {rows:[]};
    const st=this.st, L=st.level, s=n=>this.sv(n);
    // "Primary Attack" / "Secondary Attack" (Dual Strike): the primary line is worked out; main and off hand get their own rows
    const atkText=sp(p,'Attack')||sp(p,'Primary Attack');
    const handsText=[sp(p,'Attack'),sp(p,'Primary Attack'),sp(p,' Secondary Attack'),sp(p,'Secondary Attack')].join(' ');
    const byHand=/main weapon/i.test(handsText) && /off-hand weapon/i.test(handsText);
    if(!atkText && /make a melee basic attack/i.test(sp(p,'Effect')+' '+sp(p,'Hit'))){
      const mba=this.sheetPowers().find(x=>x.id==='ID_INTERNAL_POWER_MELEE_BASIC_ATTACK');
      if(mba && mba!==p) return {...this.powerCalc(mba,opt), note:'This power makes a melee basic attack: these are its numbers.'};
    }
    if(!atkText){ const x=this.effectSummary(p); return {rows:[], summary:x, note:x?'Worked out: '+x+'.':''}; }
    // the attack line for this level ("Level 21: Your highest ability modifier +6 vs. Reflex")
    let line=atkText.split('\n')[0];
    for(const m of atkText.matchAll(/Level (\d+):\s*([^\n]*)/g)) if(L>=+m[1]) line=m[2];
    const dm=/vs\.?\s*(AC|Fortitude|Reflex|Will)/i.exec(line); if(!dm) return {rows:[]};
    const def=dm[1].toUpperCase()==='AC'?'AC':dm[1][0].toUpperCase()+dm[1].slice(1).toLowerCase();
    const before=line.slice(0,dm.index);
    const mod=a=>Math.floor((s(a)-10)/2);
    let abilities=/highest ability/i.test(before) ? ABILITIES.slice() : ABILITIES.filter(a=>new RegExp('\\b'+a+'\\b','i').test(before));
    const powerBonus=+((/\+\s*(\d+)\s*$/.exec(before.trim())||[])[1]||0);
    let kw=sp(p,'Keywords').toLowerCase().split(/\s*[,;]\s*/).filter(Boolean);
    const type=sp(p,'Attack Type').toLowerCase();
    const kind=/melee/.test(type)&&/ranged/.test(type) ? 'both' : (/^(melee|ranged|close|area)/.exec(type)||[])[1]||'';
    // the beast companion attacks: its own attack bonus and damage ("Beast's attack bonus vs. AC", "1[B] + beast's Strength modifier")
    const beasts=/beast'?s attack bonus/i.test(line) ? this.allBeasts(sp(p,'Display')!=='Beast Basic Attack' && !/^ID_WOG_ANIMAL_ATTACK/.test(p.id)) : null;
    if(beasts && !beasts.length) return {rows:[]};
    const beast=beasts?.[0]||null;
    if(beast) kw=kw.filter(k=>k!=='implement' && k!=='weapon');
    const isWeapon=kw.includes('weapon'), isImpl=kw.includes('implement');
    const basic=sp(p,'Display')==='Basic Attack' || /basic attack/i.test(p.name) || !!sp(p,'_BasicAttack');   // "can be used as a basic attack"
    const half=Math.floor(L/2);
    // damage line for this level
    const hitText=sp(p,'Hit');
    let hit=(hitText.split('\n')[0]||'');
    for(const m of hitText.matchAll(/Level (\d+):\s*([^\n]*)/g)) if(L>=+m[1]) hit=m[2];
    for(const m of hitText.matchAll(/Increase damage to ([^.]*?) at (\d+)(?:st|nd|rd|th) level/gi)) if(L>=+m[2]) hit=m[1]+' damage';
    const dmgExpr=(/^(.*?damage)/i.exec(hit)||[])[1]||'';
    // the damage, term by term: "1[W] + Strength modifier", "1d8 + 2 + your Wisdom modifier", "1[B] + beast's Strength modifier"
    const terms=dmgExpr.replace(/\s*damage$/i,'').split(/\s+\+\s+/).map(t=>t.trim()).filter(Boolean);
    const wCount=terms.reduce((n,t)=>n+(+((/^(\d+)\[W\]/.exec(t)||[])[1]||0)),0);
    const bCount=terms.reduce((n,t)=>n+(+((/^(\d+)\[B\]/.exec(t)||[])[1]||0)),0);
    const dice=terms.map(t=>(/^(\d+d\d+)/.exec(t)||[])[1]).find(Boolean)||'';
    const flatTerms=terms.filter(t=>/^\d+$/.test(t)).map(Number).filter(n=>n>0);
    const beastMods=terms.filter(t=>/^beast'?s /i.test(t) && /modifier/i.test(t));
    // "Strength modifier", "Strength modifier or Wisdom modifier", "highest ability modifier", and the older
    // "Strength, Constitution, Dexterity, Intelligence, Wisdom, or Charisma" (no "modifier"): the best one counts
    const namesIn=t=>ABILITIES.filter(a=>new RegExp('\\b'+a+'\\b','i').test(t));
    const dmgAbils=terms.filter(t=>!/^beast'?s /i.test(t) && (/modifier/i.test(t) || namesIn(t).length>1))
      .map(t=>/highest ability/i.test(t) ? ABILITIES.slice() : namesIn(t)).filter(x=>x.length);
    const halfLevelDmg=terms.some(t=>/one-half your level/i.test(t));
    const hasDamage=!!(wCount||bCount||dice||dmgAbils.length||beastMods.length);
    // bonuses from feats, features and items that apply to this attack (keys like "weapon,heavy blade group:attack")
    const ctxBase=new Set([...kw, opt.charge?'charge':'', kind, isWeapon?'weapon':'', isImpl?'implement':'', basic?(kind+' basic'):'', basic?'basic attack':'', p.name.toLowerCase(), p.id.toLowerCase(), sp(p,'Class').toLowerCase(), def.toLowerCase()].filter(Boolean));
    const gather=(ctx,what)=>{
      const parts=[];
      for(const k of st.stat.keys()){
        let quals;
        if(k===what+' rolls') quals=[];
        else { const m=new RegExp('^(.+):'+what+'$').exec(k); if(!m) continue; quals=m[1].split(',').map(x=>x.trim()); }
        if(!quals.every(q=>ctx.has(q))) continue;
        for(const pt of st.stat.parts(k)) if(pt.value) parts.push({v:pt.value, type:pt.type||'', label:RULES.db.els[pt.src]?.name||''});
      }
      // effects added in play
      for(const e of this.play().effects){
        if(!((what==='attack' && e.stat==='Attack rolls') || (what==='damage' && e.stat==='Damage rolls'))) continue;
        if(e.kw && !ctx.has(e.kw)) continue;
        if(e.kws && !e.kws.every(k=>ctx.has(k))) continue;
        if(e.whenBloodied && !this.play().bloodied) continue;
        if(e.weapon && !ctx.has(e.weapon.toLowerCase())) continue;
        if(e.melee && !(ctx.has('melee'))) continue;
        parts.push({v:+e.value, type:e.type||'', label:(e.note||'effect')+(e.dtype?` (${e.dtype})`:'')});
      }
      return parts;
    };
    const stack=parts=>{ const typed={}, out=[]; for(const x of parts){ if(!x.type){ out.push(x); continue; } if(!typed[x.type] || x.v>typed[x.type].v) typed[x.type]=x; }
      return [...out, ...Object.values(typed)].map(x=>[x.v, (x.type?x.type+' bonus - ':'bonus - ')+x.label]); };
    const condPen=(this.play().conditions.some(c=>c.name==='Prone'||c.name==='Restrained')) ? [[-2,'prone or restrained']] : [];
    // an implement power: the implements in hand ("wand implement", "scythe implement", "light blade implement"),
    // so Implement Expertise and the like count with the implement they name
    const implCtx=new Set();
    if(isImpl) for(const sl of ['main','off','symbol1','symbol2']){
      const it=(this.ch.items||[]).find(x=>x.uid===this.ch.equip?.[sl]); if(!it) continue;
      const {base,magic}=itemParts(it), words=[];
      if(magic && sp(magic,'Magic Item Type')) words.push(sp(magic,'Magic Item Type'));
      if(base){ words.push(base.name); const m=/^(orb|rod|staff|wand|tome|totem|holy symbol|ki focus)/i.exec(base.name); if(m) words.push(m[1]);
        for(const g of sp(base,'Group').split(/\s*,\s*/)) if(g) words.push(g); }
      for(const w of words) implCtx.add(w.toLowerCase()+' implement');
      // a weapon used as the implement: bonuses "through a heavy blade" (Versatile Expertise's group) count too
      if(base && base.type==='Weapon') for(const g of sp(base,'Group').split(/\s*,\s*/)) if(g) implCtx.add(g.toLowerCase()+' group');
    }
    const one=(w,magic,beast=beasts?.[0])=>{
      const ctx=new Set([...ctxBase, ...implCtx]);
      let abil=abilities, dAbils=dmgAbils;
      // "Strength vs. AC (melee) or Dexterity vs. AC (ranged)": a ranged-only weapon uses the ranged ability
      if(w && /\(ranged/i.test(line) && !/melee/i.test(sp(w,'Weapon Category'))){ const r=/(\w+)\s+vs\.?\s*\w+\s*\(ranged/i.exec(line); if(r && ABILITIES.includes(r[1])) abil=[r[1]]; }
      if(w){
        ctx.add(w.name.toLowerCase()); ctx.add(w.id.toLowerCase()); if(magic) ctx.add(magic.id.toLowerCase());
        // fighting with two weapons, or with one in both hands (Two-Weapon Fighting, Tempest Technique, two-handed feats)
        if(w!==UNARMED){
          const wc=wearContext(this.ch), isMelee=x=>x && x.type==='Weapon' && /melee/i.test(sp(x,'Weapon Category'));
          const dual=isMelee(wc.main) && isMelee(wc.off), close=/close/.test(kind);
          if(dual && isMelee(w) && kind!=='ranged'){
            ctx.add('two-weapon'); ctx.add('two-melee'); ctx.add(close?'two-melee-weapon-close':'two-melee-weapon');
            if(/off-?hand/i.test(sp(w,'Properties'))) ctx.add(close?'two-melee-offhand-close':'two-melee-offhand');
          }
          if(/two/i.test(sp(w,'Hands Required'))){ ctx.add('two-hands'); ctx.add('two-handed'); }
        }
        for(const g of sp(w,'Group').split(/\s*,\s*/).filter(Boolean)){ ctx.add(g.toLowerCase()+' group'); ctx.add(g.toLowerCase()); }
        // a ranged basic attack with a heavy thrown weapon uses Strength
        if(basic && kind==='ranged' && /heavy thrown/i.test(sp(w,'Properties'))){ abil=['Strength']; dAbils=dAbils.map(()=>['Strength']); }
      }
      const ab=abil.length ? abil.reduce((a,b)=>mod(b)>mod(a)?b:a) : '';
      for(const a of abil) if(a===ab) ctx.add(a.toLowerCase());
      const ap=[];
      if(beast) ap.push([beast.atk, beast.name+'\'s attack bonus']);
      else { if(ab) ap.push([mod(ab), ab+' modifier']); ap.push([half,'half your level']); }
      if(powerBonus) ap.push([powerBonus,'power bonus']);
      if(w && w!==UNARMED && this.profOk(w) && +sp(w,'Proficiency Bonus')) ap.push([+sp(w,'Proficiency Bonus'),'proficiency bonus']);
      const extra=gather(ctx,'attack'), dextra=gather(ctx,'damage');
      // the magic weapon's (or implement's) enhancement counts as an enhancement bonus; the highest one counts
      const enh=magic ? +((/\+(\d+)/.exec(sp(magic,'Enhancement'))||[])[1]||0) : 0;
      if(enh){ extra.push({v:enh,type:'Enhancement',label:magic.name}); dextra.push({v:enh,type:'Enhancement',label:magic.name}); }
      const atkParts=[...ap, ...stack(extra), ...condPen];
      const atk=atkParts.reduce((t,[v])=>t+v,0);
      let dmg='', dmgParts=[], diceStr='', diceNote='';
      if(hasDamage){
        dmgParts=[];
        for(const list of dAbils){ const best=list.reduce((a,b)=>mod(b)>mod(a)?b:a); dmgParts.push([mod(best), best+' modifier']); }
        for(const t of beastMods){ const a=/ability/i.test(t) ? beast?.ability : ABILITIES.find(x=>new RegExp(x,'i').test(t)); if(beast && a) dmgParts.push([beast.mod(a), `${beast.name}'s ${a} modifier`]); }
        for(const n of flatTerms) dmgParts.push([n,'from the power']);
        if(halfLevelDmg) dmgParts.push([half,'one-half your level']);
        dmgParts.push(...stack(dextra));
        // extra dice from features ("+1d8 with a one-handed weapon, once per turn"); a rider can name the weapon, or its
        // group ("heavy blade:damage"; "blade" for light and heavy blades)
        const wctx=new Set(w && w!==UNARMED ? [w.name.toLowerCase(), ...sp(w,'Group').toLowerCase().split(/\s*,\s*/).filter(Boolean).flatMap(g=>[g, g+' group', ...(/blade$/.test(g)?['blade','blades']:[])])] : []);
        const riders=(st.riders||[]).filter(r=>r.quals.every(q=>ctx.has(q) || wctx.has(q) || wctx.has(q.replace(/ weapons?$/,''))));
        // more [W] with every such attack ("+1W", no "if", "when", "once per turn"...) is added to the weapon dice; the rest is listed
        const always=r=>!/\b(if|when|whenever|while|once per|combat advantage|charg|bloodied|first|against|instead)\b/i.test(r.cond||'');
        const wRiders=wCount && w ? riders.filter(r=>/^\+?\s*\d+\s*\[?W\]?$/i.test(r.value) && always(r)) : [];
        const wMore=wRiders.reduce((n,r)=>n+(+(/\d+/.exec(r.value)[0])),0);
        if(wCount && w){ const m=/(\d+)d(\d+)/.exec(sp(w,'Damage')||'1d4'), wn=wCount+wMore; diceStr=m?`${wn*+m[1]}d${m[2]}`:''; diceNote=`(${wn}[W]${wMore?', with +'+wMore+'[W] from '+wRiders.map(r=>RULES.db.els[r.src]?.name||'a feature').join(', '):''}; ${w.name} ${sp(w,'Damage')})`; }
        else if(bCount && beast){ const m=/(\d+)d(\d+)/.exec(beast.die||'1d6'); diceStr=m?`${bCount*+m[1]}d${m[2]}`:''; diceNote=`(${bCount}[B], ${beast.name} ${beast.die})`; }
        else if(dice){ diceStr=dice; diceNote='(the power\'s dice)'; }
        for(const r of riders) if(!wRiders.includes(r)) dmgParts.push([r.value, (r.cond?r.cond+' - ':'')+(RULES.db.els[r.src]?.name||'')]);
        // Sneak Attack: its dice (d6, d8 with Backstabber) and any extra damage, with the weapons it works with; listed, not added
        const sa=w && w!==UNARMED ? sneakAttack(st, w, ctx) : null;
        if(sa){ dmgParts.push([sa.value, 'Sneak Attack (combat advantage, once per turn)']); for(const x of sa.more) dmgParts.push([x.value, 'Sneak Attack'+(x.cond?', '+x.cond:'')+(RULES.db.els[x.src]?' - '+RULES.db.els[x.src].name:'')]); }
        const flat=dmgParts.reduce((t,[v])=>t+(typeof v==='number'?v:0),0);
        dmg=(diceStr||'')+(flat?(diceStr?(flat>0?'+':''):'')+flat:'');
        if(!dmg) dmg='0';
      }
      return {weapon:w?w.name:'—', magic:magic?.name, atk, def, dmg, dice:diceStr, diceNote, atkParts, dmgParts};
    };
    const rows=[]; let handsNote='';
    if(beasts) for(const b of beasts) rows.push({...one(null,null,b), weapon:b.name});
    else if(isWeapon){
      const ws=this.sheetWeapons().filter(({base})=>{
        const cat=sp(base,'Weapon Category').toLowerCase(), thrown=/thrown/i.test(sp(base,'Properties'));
        return kind==='ranged' ? (/ranged/.test(cat)||thrown) : kind==='melee' ? /melee/.test(cat) : true; });   // 'both', close, area: any weapon
      // a power an item gives (a weapon's own power): used with that item only
      const giver=(()=>{ for(let v=st.via?.get(p.id), n=0; v && n<10; n++){ const e=RULES.db.els[String(v).split('#')[0]]; if(!e) return null; if(/^(Weapon|Magic Item)$/.test(e.type)) return e.id; v=st.via.get(e.id); } return null; })();
      if(giver){ const mine=ws.filter(({base,magic})=>base?.id===giver || magic?.id===giver); if(mine.length) ws.splice(0,ws.length,...mine); }
      const held=s=>{ const it=(this.ch.items||[]).find(x=>x.uid===this.ch.equip?.[s]); return it ? itemParts(it) : null; };
      const same=(h,base,magic)=>h && h.base?.id===base.id && (h.magic?.id||'')===(magic?.id||'');
      if(byHand){
        // one attack with the main-hand weapon, one with the off-hand weapon
        const m=held('main'), o=held('off'), isM=h=>h?.base?.type==='Weapon' && /melee/i.test(sp(h.base,'Weapon Category'));
        if(isM(m) && isM(o)){
          rows.push({...one(m.base,m.magic), weapon:'Main hand: '+(m.magic?itemName({ids:[m.base.id,m.magic.id]}):m.base.name)});
          rows.push({...one(o.base,o.magic), weapon:'Off hand: '+(o.magic?itemName({ids:[o.base.id,o.magic.id]}):o.base.name)});
        } else if(kind!=='both') handsNote='Needs a melee weapon in each hand (Equipment: main hand and off hand).';
      }
      if(!rows.length){
        for(const {base,magic} of ws) rows.push({...one(base,magic), weapon:magic?itemName({ids:[base.id,magic.id]}):base.name});
        if((kind==='melee' || kind==='both') && UNARMED && !giver) rows.push(one(UNARMED,null));
      }
    } else {
      // implement or no keyword: one line; an implement's enhancement counts for implement powers
      let impl=null;
      if(isImpl) for(const sl of ['main','off','symbol1','symbol2']){ const it=(this.ch.items||[]).find(x=>x.uid===this.ch.equip?.[sl]); const m=it&&itemParts(it).magic; if(m && /\+\d/.test(sp(m,'Enhancement'))){ impl=m; break; } }
      // the implement named: the magic one, or else what is in hand (a scythe, a staff), or "none in hand"
      let held=impl?impl.name:'';
      if(!held && isImpl) for(const sl of ['main','off','symbol1','symbol2']){ const it=(this.ch.items||[]).find(x=>x.uid===this.ch.equip?.[sl]); if(it){ const {base,magic}=itemParts(it); held=magic&&base?itemName({ids:[base.id,magic.id]}):(base||magic)?.name||''; if(held) break; } }
      rows.push({...one(null,impl), weapon:held || (isImpl?'none in hand':'—')});
    }
    return {rows, weaponPower:isWeapon, implPower:isImpl && !isWeapon, note: handsNote || (abilities.length>1 && !/highest/i.test(before) ? 'This power lets you choose the ability; the best one is used.' : '')};
  },

  /* ---------- Skills & Abilities ---------- */
  // the ability a skill uses: the highest of its "Ability" bonuses (a feat or house rule can change it)
  skillAbility(k){
    const opts=this.st.adds.filter(a=>a.stat===k && a.type==='Ability').map(a=>ABILITIES.find(x=>new RegExp(x,'i').test(a.value))).filter(Boolean);
    if(!opts.length) return '';
    return opts.reduce((a,b)=>this.sv(b)>this.sv(a)?b:a);
  },
  skillsTab(){
    const st=this.st, L=st.level, half=Math.floor(L/2);
    const ab=el('div',{class:'bcard'}, el('h3',{text:'Ability scores'}),
      el('table',{class:'sktable'}, el('tr',{}, el('th',{text:'Ability'}), el('th',{text:'Score'}), el('th',{text:'Modifier'}), el('th',{text:'+ half level'})),
        ...ABILITIES.map(a=>{ const v=this.sv(a), m=Math.floor((v-10)/2); return el('tr',{}, el('td',{text:a}), el('td',{text:v}), el('td',{text:fmt(m)}), el('td',{class:'strong',text:fmt(m+half)})); })));
    const rows=[];
    for(const k of SKILLS){
      const v=this.sv(k), tr=st.stat(k+' Trained')>0, a=this.skillAbility(k);
      const parts=st.stat.parts(k).filter(x=>x.value).map(x=>`${fmt(x.value)} ${x.type?x.type+' - ':''}${RULES.db.els[x.src]?.name||(x.src==='homebrew'?'house rule':x.src)||''}`);
      const how=el('tr',{class:'how',hidden:true}, el('td',{colspan:4}, el('ul',{class:'plainlist small'}, ...(parts.length?parts:['(no separate parts)']).map(t=>el('li',{text:t})))));
      rows.push(el('tr',{class:tr?'trained':''}, el('td',{}, el('button',{class:'linkbtn',type:'button',text:k,onclick:()=>{ how.hidden=!how.hidden; }})),
        el('td',{class:'muted small',text:a?a.slice(0,3).toUpperCase():''}), el('td',{text:tr?'trained':''}), el('td',{class:'strong',text:fmt(v)})), how);
    }
    const sk=el('div',{class:'bcard'}, el('h3',{text:'Skills'}), el('p',{class:'muted small',text:'Click a skill to see what adds up to it.'}), el('table',{class:'sktable'}, ...rows));
    // the companions' skills, beside yours: a skill that adds up to 0 is left out
    const petCards=this.pets().map(pet=>{
      const list=this.petSkills(pet).filter(([,v])=>v!==0); if(!list.length) return null;
      const prow=[];
      for(const [k,v,tr,parts] of list){
        const how=el('tr',{class:'how',hidden:true}, el('td',{colspan:3}, el('ul',{class:'plainlist small'}, ...parts.map(([x,l])=>el('li',{text:fmt(x)+' '+l})))));
        prow.push(el('tr',{class:tr?'trained':''}, el('td',{}, el('button',{class:'linkbtn',type:'button',text:k,onclick:()=>{ how.hidden=!how.hidden; }})),
          el('td',{text:tr?'trained':''}), el('td',{class:'strong',text:fmt(v)})), how);
      }
      return el('div',{class:'bcard'}, el('h3',{text:pet.name+"'s skills"}), el('p',{class:'muted small',text:pet.name!==pet.kind?pet.kind:'Companion'}), el('table',{class:'sktable'}, ...prow));
    }).filter(Boolean);
    // a familiar uses your bonuses for all skill checks (Arcane Power), plus any bonus given to familiars
    for(const f of [...st.granted.values()].filter(e=>e.type==='Familiar')){
      const prow=[];
      for(const k of SKILLS){
        const parts=[[this.sv(k),'your '+k],...st.stat.parts('FAMILIAR.'+k+' misc').filter(x=>x.value).map(x=>[x.value,RULES.db.els[x.src]?.name||''])].filter(([v])=>v);
        const v=parts.reduce((t,[x])=>t+x,0); if(!v) continue;
        const how=el('tr',{class:'how',hidden:true}, el('td',{colspan:3}, el('ul',{class:'plainlist small'}, ...parts.map(([x,l])=>el('li',{text:fmt(x)+' '+l})))));
        prow.push(el('tr',{}, el('td',{}, el('button',{class:'linkbtn',type:'button',text:k,onclick:()=>{ how.hidden=!how.hidden; }})), el('td',{}), el('td',{class:'strong',text:fmt(v)})), how);
      }
      petCards.push(el('div',{class:'bcard'}, el('h3',{text:f.name+" familiar's skills"}), el('p',{class:'muted small',text:'Familiar: uses your bonuses for all skill checks'}), el('table',{class:'sktable'}, ...prow)));
    }
    // the actions everyone can take in combat, by action type
    const acts=el('div',{class:'bcard wide'}, el('h3',{text:'Actions in combat'}),
      el('p',{class:'muted small',text:'On your turn: a standard, a move and a minor action (you can take a move or minor action instead of a standard, and a minor instead of a move), plus any number of free actions. Immediate actions: one per round, not on your own turn.'}),
      el('div',{class:'actgrid'}, ...COMBAT_ACTIONS.map(([type,list])=>el('div',{}, el('h4',{text:type}),
        el('ul',{class:'plainlist'}, ...list.map(([n,t])=>el('li',{}, el('b',{text:n}), t?' — '+t:'')))))));
    linkTerms(acts,'');
    return [el('div',{class:'cols2 fit'}, ab, sk, ...petCards), acts];
  },

  /* ---------- Features & Feats ---------- */
  featuresTab(){
    const g=[...this.st.granted.values()];
    const sec=(title,list)=>{
      if(!list.length) return null;
      const box=el('div',{class:'prows'});
      for(const e of list){
        const d=el('div',{class:'pdetail',hidden:true});
        const b=el('button',{class:'pmain',type:'button'}, el('b',{text:e.name}), el('span',{class:'muted small',text:sp(e,'Short Description')||''}));
        b.onclick=()=>{ d.hidden=!d.hidden; if(!d.hidden && !d.firstChild){ const c=el('div',{class:'pcard entry'}); this.renderElement(c,e.id); d.append(c); } };
        box.append(el('div',{class:'prow2'}, b), d);
      }
      return el('div',{class:'bcard wide'}, el('h3',{text:title}), box);
    };
    return [
      sec('Racial traits', g.filter(e=>e.type==='Racial Trait')),
      sec('Class, path and destiny features', g.filter(e=>e.type==='Class Feature' && !/^_|^ID_/.test(e.name))),
      sec('Paragon path and epic destiny', g.filter(e=>/^(Paragon Path|Epic Destiny)$/.test(e.type))),
      sec('Feats', g.filter(e=>e.type==='Feat')),
      sec('Background and theme', g.filter(e=>/^(Background|Background Choice|Theme)$/.test(e.type))),
      el('div',{class:'bcard wide'}, el('h3',{text:'Languages and proficiencies'}),
        el('p',{}, el('b',{text:'Languages: '}), g.filter(e=>e.type==='Language').map(e=>e.name).join(', ')||'—'),
        el('p',{}, el('b',{text:'Proficiencies: '}), g.filter(e=>e.type==='Proficiency').map(e=>e.name.replace(/^(Weapon|Armor|Implement) Proficiency \((.*)\)$/,'$2')).join(', ')||'—'))
    ];
  },

  /* ---------- limited uses and resource pools ----------
     The rules come from the entries' own words, not from lists in the program:
     powerUses(p): how many times a power can be used when its card says more than once ("twice per encounter",
     "a number of times per day equal to your Wisdom modifier"), or when it shares its uses with others
     ("you can use only one channel divinity power per encounter", "you can use two Healing Infusion powers per encounter").
     null: the usual once. */
  // everything an entry says (its text and its details), for reading rules out of the words
  wordsOf(e){ return [e?.text||'', ...Object.entries(e?.spec||{}).filter(([k])=>k[0]!=='_').map(([,v])=>v)].join(' '); },
  // the character's entries (features, feats, items...) whose words match
  grantedSaying(re){ return [...this.st.granted.values()].filter(e=>re.test(this.wordsOf(e))); },
  powerUses(p){
    if(!p || p===CHARGE || p.virtual || !p.id) return null;
    const st=this.st, L=st.level, spec=modSpec(p,st), t=String(spec['Special']||'');
    const N={once:1,twice:2,thrice:3,two:2,three:3,four:4,five:5,'three times':3,'four times':4,'five times':5};
    // Channel Divinity: one per encounter in all. A power belongs to it by keyword, by its card, or by being listed under a
    // "Channel Divinity" class feature (some have no keyword). A feature can lift the limit ("use each of your Channel
    // Divinity powers once per encounter"), allow a second one while bloodied, or (items, feats) give one more this encounter.
    const cdFeat=[...st.granted.values()].filter(e=>e.type==='Class Feature' && /^Channel Divinity/i.test(e.name));
    const isCD=/channel divinity/i.test(spec['Keywords']||'') || /only one channel divinity power per encounter/i.test(t) || cdFeat.some(f=>catHas(p,f.id));
    if(isCD && !this.grantedSaying(/use each of your Channel Divinity powers once per encounter/i).length){
      if(!cdFeat.length) return {max:1, key:'day:'+p.id, per:'day'};     // without the class feature (a feat gave it): once per day
      const second=this.play().bloodied && this.grantedSaying(/bloodied[^.]*second Channel Divinity power/i).length>0;
      const extra=+this.play().used['+grp:cd']||0;
      const more=[...new Set(this.grantedSaying(/additional use of Channel Divinity/i).map(e=>e.name.replace(/ \+\d$/,'')))];
      return {max:1+(second?1:0)+extra, key:'grp:cd', per:'encounter', shared:'Channel Divinity powers (one per encounter'+(second?', two while bloodied':'')+')', more};
    }
    const ab=/a number of times per day equal to your (\w+) modifier/i.exec(t);
    if(ab){ const a=ABILITIES.find(x=>x.toLowerCase()===ab[1].toLowerCase()); if(a) return {max:Math.max(1,Math.floor((this.sv(a)-10)/2)), key:'day:'+p.id, per:'day'}; }
    let best=null;
    for(const sen of t.split(/(?<=\.)\s+/)){
      const lv=/\bAt (\d+)(?:st|nd|rd|th) level\b/i.exec(sen); if(lv && L<+lv[1]) continue;
      // shared: "you can use two Healing Infusion powers per encounter"
      const g=/\buse (two|three|four|five) ([A-Z][\w' ]*?) powers per (encounter|day)\b/.exec(sen);
      if(g){ best={max:N[g[1]], per:g[3], key:'grp:'+g[2].toLowerCase(), shared:g[2]+' powers'}; continue; }
      const m=/\b(once|twice|thrice|three times|four times|five times)\s+(?:per|each|a)\s+(encounter|day)\b/i.exec(sen); if(!m) continue;
      if(/\bonly (?:once|one) per (?:round|turn)\b/i.test(sen) && !/\b(?:twice|three|four|five)\b/i.test(sen)) continue;
      if(/\bpowers\b/i.test(sen.slice(0,m.index)) && !/this power/i.test(sen)) continue;     // about several powers, not this one alone
      const n=N[m[1].toLowerCase()]; if(n>1) best={max:n, per:m[2].toLowerCase()};
    }
    if(!best) return null;
    return {key:(best.per==='day'?'day:':'')+p.id, ...best};
  },
  usesLeft(p,u){ u ||= this.powerUses(p); if(!u) return null; return Math.max(0, u.max-(+this.play().used[u.key]||0)); },
  /* pools kept in the bar under the action points: the "Resource Pool" entries of the core library (power points,
     entropy points, soul shards, shrouds...). A pool shows when the character has its stat or one of its entries. */
  pools(){
    const st=this.st, out=[];
    for(const r of RESOURCE_POOLS){
      const max=r.stat ? st.stat(r.stat)||0 : r.max;
      if(r.stat ? max<=0 : !r.by.some(id=>st.granted.has(id))) continue;
      out.push({...r, max, spend:!!r.stat});
    }
    return out;
  },
  // the number shown: what is left of a pool that is spent (power points), or the count of one that builds up
  poolVal(pool){ const v=(this.play().pools ||= {})[pool.key]; return pool.spend ? Math.max(0,pool.max-(+v||0)) : (+v||0); },
  // a rest: each pool as its entry says ("Full" or a number; nothing: kept)
  restPools(kind){
    const pl=(this.play().pools ||= {});
    for(const r of this.pools()){ const how=kind==='short' ? r.shortRest : r.extendedRest; if(!how) continue;
      if(/^full$/i.test(how) || +how===0) delete pl[r.key]; else pl[r.key]=r.spend ? Math.max(0,r.max-(+how)) : +how; }
  },
  // a pool that adds damage when invoked (the assassin's shrouds): the suggestion shown on attack cards
  poolDamageText(){
    const L=this.st.level;
    for(const r of this.pools()){ if(!r.damage.length) continue;
      const n=this.poolVal(r); if(!n) continue;
      const [dice,flat]=(r.damage.filter(d=>L>=d.level).pop()||r.damage[0]).per;
      const [cnt,die]=dice.split('d'), part=k=>k>0 ? `${k*(+cnt||1)}d${die}${flat?'+'+k*flat:''}` : 'nothing';
      return `If you invoke your ${n} ${n>1?r.unitPlural:r.unit}: +${part(n)} damage (${part(n-r.missLess)} on a miss)`;
    }
    return '';
  },
  // the augmentable versions of a psionic power: [{el, cost}], from its "_AugmentVersions" entries
  augments(p){
    if(!p?.id || p.virtual) return [];
    return String(sp(p,'_AugmentVersions')||'').split(',').map(x=>x.trim()).map(id=>RULES.db.els[id]).filter(Boolean)
      .map(e=>({el:e, cost:+(/\(Augment (\d+)\)/i.exec(e.name)||[])[1]||0})).filter(x=>x.cost>0).sort((a,b)=>a.cost-b.cost);
  },

  /* ---------- Prepared Spells ----------
     wizard: spellbook picks (selects marked "spellbook") hold two spells of each daily and utility level; one of each prepared
     mage:   a spellbook power with a "Spellbook" table (the mage, the bladesinger): every leveled spell of the class in the
             book, as many of each kind prepared as the table says for the level, no two of a kind sharing a level
     witch:  a feature that lets you "replace one of your wizard daily attack powers or wizard utility powers with another"
     The choices are kept in ch.prepared; spells not prepared are left off the Powers tab. */
  spellMode(){
    if(this.spellTable()) return 'mage';
    // a witch keeps her familiar's swap; a spellbook feat adds wizard-style pairs to it
    if(this.swapFeature()) return 'witch';
    if(this.st.slots.some(s=>s.spellbook)) return 'wizard';
    return null;
  },
  spellKind(p){ return /utility/i.test(sp(p,'Power Type')+' '+sp(p,'Display')) ? 'utility' : /encounter/i.test(sp(p,'Power Usage')) ? 'encounter' : /daily/i.test(sp(p,'Power Usage')) ? 'daily' : 'at-will'; },
  spellLevel(p){ return parseInt(sp(p,'Level'),10)||0; },
  // a power of the character's class (or parent class: a mage's or witch's spells are wizard powers)
  ofMyClass(p){ return classIds(this.st).includes(String(sp(p,'Class')).trim()); },
  // the character's own leveled class spells of these kinds
  classSpells(kinds){ return [...this.st.granted.values()].filter(e=>e.type==='Power' && this.ofMyClass(e) && this.spellLevel(e)>0 && kinds.includes(this.spellKind(e))); },
  // the witch's familiar: "replace one of your wizard daily attack powers or wizard utility powers with another wizard power"
  swapFeature(){ return this.grantedSaying(/replace one of your \w+ daily attack powers or \w+ utility powers with another \w+ power/i)[0]||null; },
  // the spellbook table of a mage-style class, read from its spellbook power ("Spellbook": Level, Encounter, Daily, Utility):
  // {name, kinds:[kind...], asDaily, rows:[[from level, to level, counts...]]}
  spellTable(){
    const e=[...this.st.granted.values()].find(x=>x.type==='Power' && /\d/.test(sp(x,'Spellbook'))); if(!e) return null;
    const lines=String(sp(e,'Spellbook')).replace(/<\/?table>/gi,'\n').split(/\n/).map(x=>x.trim()).filter(Boolean);
    const head=lines.find(x=>/^level\b/i.test(x))||'', asDaily=/encounter as daily/i.test(head);
    const kinds=(head.replace(/encounter as daily/i,'encounter').match(/encounter|daily|utility/gi)||[]).map(x=>x.toLowerCase());
    const rows=lines.filter(x=>/^\d/.test(x)).map(x=>{ const w=x.split(/\s+/), [a,b]=w[0].split('-').map(Number); return [a, b||a, ...w.slice(1).map(v=>+v||0)]; });
    return kinds.length && rows.length ? {name:e.name, kinds, asDaily, rows} : null;
  },
  wizardBook(){
    const st=this.st, groups={};
    for(const s of st.slots){
      if(s.type!=='Power' || s.swap) continue;
      const cat=String(s.cat||'').replace(/ID_INTERNAL_CATEGORY_/g,''), u=/\b(daily|utility)\b/i.exec(cat), l=/(\d+)\s*$/.exec(cat);
      if(!u || !l) continue;
      const usage=u[1].toLowerCase(), key=usage+' '+(+l[1]);
      const g=(groups[key] ||= {key, usage, level:+l[1], slots:[], sb:false}); g.slots.push(s); if(s.spellbook) g.sb=true;
    }
    return Object.values(groups).filter(g=>g.sb).map(g=>{
      const picksOf=s=>(this.ch.picks[s.key]||[]).slice(0,s.number).filter(id=>st.granted.has(id));
      const members=[...new Set(g.slots.flatMap(picksOf))];
      const n=Math.max(1, g.slots.filter(s=>!s.spellbook).reduce((a,s)=>a+s.number,0));
      let sel=this.ch.prepared?.wizard?.[g.key];
      if(!Array.isArray(sel) || sel.length!==Math.min(n,members.length) || !sel.every(id=>members.includes(id))){
        sel=[...new Set(g.slots.filter(s=>!s.spellbook).flatMap(picksOf))];
        for(const id of members) if(sel.length<n && !sel.includes(id)) sel.push(id);
        sel=sel.slice(0,n);
      }
      return {...g, members, n, sel};
    }).sort((a,b)=>(a.usage>b.usage?1:a.usage<b.usage?-1:0) || a.level-b.level);
  },
  // a mage-style spellbook: [{kind, lim, dup, members, sel, dupLeft}] for the character's level. A feature that lets you
  // "prepare one additional ... power from your spellbook ... the same level" (the bladesinger's Boon Spell) adds one
  // more of the first kind, which may share a level.
  mageBook(){
    const T=this.spellTable(); if(!T) return [];
    const L=this.st.level, row=T.rows.find(r=>L>=r[0] && L<=r[1]) || T.rows[T.rows.length-1];
    const boon=this.grantedSaying(/prepare one additional \w+ \w+ power from your spellbook/i).some(e=>/same level/i.test(this.wordsOf(e)));
    const kinds=T.kinds.map((k,i)=>({kind:k, lim:(row[2+i]||0)+(boon&&i===0?1:0), dup:boon&&i===0?1:0,
      members:this.classSpells([k]).sort((a,b)=>this.spellLevel(a)-this.spellLevel(b)||a.name.localeCompare(b.name))}));
    const stored=this.ch.prepared?.mage;
    for(const k of kinds){
      const ok=id=>k.members.some(p=>p.id===id), sel=[], seen={}; let dup=k.dup;
      const take=id=>{ const l=this.spellLevel(RULES.db.els[id]); if(sel.length>=k.lim) return;
        if(seen[l]){ if(dup<=0) return; dup--; } seen[l]=(seen[l]||0)+1; sel.push(id); };
      if(Array.isArray(stored)) stored.filter(ok).forEach(take);
      else [...k.members].reverse().forEach(p=>take(p.id));
      k.sel=sel; k.dupLeft=dup;
    }
    return kinds;
  },
  // encounter spells that work as daily powers (the bladesinger's table: "Encounter as Daily")
  asDaily(p){ return !!this.spellTable()?.asDaily && this.ofMyClass(p) && this.spellLevel(p)>0 && this.spellKind(p)==='encounter'; },
  witchSwap(){
    const s=this.ch.prepared?.swap, db=RULES.db;
    if(!s || !this.st.granted.has(s.out) || this.st.granted.has(s.in) || !db.els[s.in]) return null;
    const a=db.els[s.out], b=db.els[s.in];
    return this.spellKind(a)===this.spellKind(b) && this.spellLevel(a)===this.spellLevel(b) ? s : null;
  },
  witchChoices(p){
    const k=this.spellKind(p), l=this.spellLevel(p), st=this.st;
    return Object.values(RULES.db.els).filter(e=>e.type==='Power' && this.ofMyClass(e) && this.spellLevel(e)===l && this.spellKind(e)===k
      && !st.granted.has(e.id) && this.bookOk(e) && !isHouseRule(e) && prereqOk(e,st)).sort((a,b)=>a.name.localeCompare(b.name));
  },
  // the powers on the sheet, without the spells that aren't prepared today
  preparedOnly(list){
    const mode=this.spellMode(); if(!mode) return list;
    const off=new Set();
    if(mode==='wizard' || mode==='witch') for(const g of this.wizardBook()) for(const id of g.members) if(!g.sel.includes(id)) off.add(id);
    if(mode==='mage') for(const k of this.mageBook()) for(const p of k.members) if(!k.sel.includes(p.id)) off.add(p.id);
    const out=list.filter(p=>!off.has(p.id));
    // the witch's swap: the new spell takes the old one's place (in a pair too: prepared only if the old one was)
    const sw=mode==='witch' && this.witchSwap();
    return sw && out.some(p=>p.id===sw.out) ? [...out.filter(p=>p.id!==sw.out), RULES.db.els[sw.in]] : out.filter(p=>!sw || p.id!==sw.out);
  },
  spellsTab(){
    const mode=this.spellMode(), P=this.play(), locked=!!P.prepDone;
    const save=fn=>{ fn(this.ch.prepared ||= {}); this.changed(); };
    const detail=(p,extra)=>{
      const d=el('div',{class:'pdetail',hidden:true});
      const b=el('button',{class:'pmain',type:'button'}, el('b',{text:p.name}), el('span',{class:'muted small',text:'Level '+this.spellLevel(p)+' · '+sp(p,'Power Usage')+(sp(p,'Action Type')?' · '+sp(p,'Action Type'):'')}));
      b.onclick=()=>{ d.hidden=!d.hidden; if(!d.hidden && !d.firstChild){ const c=el('div',{class:'pcard entry'}); this.renderElement(c,p.id); d.append(c); } };
      return [b,d];
    };
    const row=(p,ctl,...after)=>{ const [b,d]=detail(p); return [el('div',{class:'prow2 spellrow'}, ctl, b, ...after.filter(Boolean)), d]; };
    const info={wizard:['Spellbook','Your spellbook holds two spells of each daily and utility level. After each extended rest, choose which one of each level you prepare. Only prepared spells can be used that day.'],
      mage:[this.spellTable()?.name||'Spellbook','After each extended rest, prepare spells from your spellbook. Your level sets how many of each kind, and no two spells of the same kind may share a level.'
        +(this.spellTable()?.asDaily?' Your encounter attack spells can each be used once per day.':'')],
      witch:["Witch's familiar",'After each extended rest, you can swap one of your wizard daily or utility spells for another wizard spell of the same kind and level.'
        +(this.st.slots.some(s=>s.spellbook)?' Your spellbook feat also gives you two spells of some levels: prepare one of each.':'')]}[mode];
    const head=el('div',{class:'bcard wide'}, el('h3',{text:info[0]}), el('p',{class:'muted',text:info[1]}),
      el('div',{class:'spellstate'},
        el('span',{text:locked?'Prepared for today. You can change them after your next extended rest.':'You can prepare your spells now. When you are done, press Done preparing.'}),
        locked ? el('button',{class:'btn small',type:'button',text:'Change anyway',title:'Change your spells before the next extended rest (if your DM allows)',onclick:()=>{ P.prepDone=false; this.changed(); }})
               : el('button',{class:'btn small primary',type:'button',text:'Done preparing',title:'Keep these spells until your next extended rest',onclick:()=>{ P.prepDone=true; this.changed(); }})));
    const out=[head];
    const swap=mode==='witch' ? this.witchSwap() : null;
    // the witch's Swap… button and its list of wizard spells of the same kind and level, for one of her spells
    const swapCtl=p=>{
      const isOut=swap?.out===p.id, pick=el('div',{class:'spellpick',hidden:true});
      const fill=()=>{
        const list=this.witchChoices(p), q=el('input',{type:'search',placeholder:'Search '+list.length+' spells…',class:'spellsearch'}), rows=el('div',{class:'prows'});
        const draw=()=>{ rows.replaceChildren(); const t=q.value.trim().toLowerCase();
          for(const c of list.filter(c=>!t || c.name.toLowerCase().includes(t))){ const [b,d]=detail(c);
            rows.append(el('div',{class:'prow2'}, b, el('button',{class:'btn small primary',type:'button',text:'Choose',onclick:()=>save(o=>{ o.swap={out:p.id,in:c.id}; })})), d); }
          if(!rows.firstChild) rows.append(el('p',{class:'muted small',text:'No other wizard spells of this kind and level.'})); };
        q.oninput=draw; draw(); pick.append(q, rows);
      };
      const btn=isOut ? el('button',{class:'btn small',type:'button',text:'Undo swap',disabled:locked,onclick:()=>save(o=>{ delete o.swap; })})
        : el('button',{class:'btn small',type:'button',text:'Swap…',disabled:locked,title:swap?'Your other swap is undone: only one spell can be swapped':'Choose another wizard spell of the same kind and level',
            onclick:()=>{ pick.hidden=!pick.hidden; if(!pick.hidden && !pick.firstChild) fill(); }});
      return {isOut, shown:isOut ? RULES.db.els[swap.in] : p, extra:[isOut ? el('span',{class:'muted small',text:'in place of '+p.name}) : null, btn], pick};
    };
    const inBook=new Set();
    if(mode==='wizard' || mode==='witch'){
      const book=this.wizardBook(); book.forEach(g=>g.members.forEach(id=>inBook.add(id)));
      if(!book.length && mode==='wizard') out.push(el('div',{class:'bcard wide'}, el('p',{class:'muted',text:'Your spellbook has no daily or utility spells yet.'})));
      for(const g of book){
        const box=el('div',{class:'prows'});
        for(const id of g.members){ const p=RULES.db.els[id], on=g.sel.includes(id), sw=mode==='witch' ? swapCtl(p) : null;
          const inp=el('input',{type:g.n===1?'radio':'checkbox',name:'sb-'+g.key,checked:on,disabled:locked,'aria-label':'Prepare '+p.name});
          inp.onchange=()=>save(o=>{ o.wizard ||= {}; let s=[...g.sel];
            if(g.n===1) s=[id]; else if(inp.checked){ s.push(id); if(s.length>g.n) s.shift(); } else s=s.filter(x=>x!==id);
            if(s.length<Math.min(g.n,g.members.length)) for(const m of g.members) if(s.length<g.n && !s.includes(m) && m!==id) s.push(m);
            o.wizard[g.key]=s; });
          if(sw){ const [b,d]=detail(sw.shown); box.append(el('div',{class:'prow2 spellrow'+(sw.isOut?' swapped':'')}, inp, b, on ? el('span',{class:'spellon',text:'Prepared'}) : null, ...sw.extra.filter(Boolean)), d, sw.pick); }
          else box.append(...row(p, inp, on ? el('span',{class:'spellon',text:'Prepared'}) : null)); }
        const title=(g.usage==='daily'?'Daily':'Utility')+' spells, level '+g.level;
        out.push(el('div',{class:'bcard wide'}, el('h3',{}, title+' ', el('small',{class:'muted',text:'prepare '+g.n+' of '+g.members.length})),
          g.members.length<=g.n ? el('p',{class:'muted small',text:'Only one spell of this level is in your book. Pick the second one in the builder (Powers) to have a choice here.'}) : null, box));
      }
    }
    if(mode==='mage'){
      const kinds=this.mageBook(), T=this.spellTable(), all=kinds.flatMap(k=>k.sel);
      for(const k of kinds){
        if(!k.members.length && !k.lim) continue;
        const box=el('div',{class:'prows'}), lv=new Set(k.sel.map(id=>this.spellLevel(RULES.db.els[id]))), boonTxt=k.dup ? (k.dupLeft>0?' (one may share a level)':' (one shares a level)') : '';
        for(const p of k.members){ const on=k.sel.includes(p.id), sameLv=!on && lv.has(this.spellLevel(p)) && !(k.dupLeft>0), full=!on && k.sel.length>=k.lim;
          const inp=el('input',{type:'checkbox',checked:on,disabled:locked||sameLv||full,'aria-label':'Prepare '+p.name,
            title:sameLv?'You already prepared '+(k.kind==='daily'?'a':'an')+' '+k.kind+' spell of level '+this.spellLevel(p):full?'You prepared as many '+k.kind+' spells as you can':''});
          inp.onchange=()=>save(o=>{ o.mage=inp.checked ? [...all,p.id] : all.filter(x=>x!==p.id); });
          box.append(...row(p, inp, on ? el('span',{class:'spellon',text:'Prepared'}) : null)); }
        const title={encounter:T.asDaily?'Attack spells (once per day each)':'Encounter attack spells',daily:'Daily attack spells',utility:'Utility spells'}[k.kind];
        out.push(el('div',{class:'bcard wide'}, el('h3',{}, title+' ', el('small',{class:'muted',text:k.sel.length+' of '+k.lim+' prepared'+boonTxt})),
          !k.members.length ? el('p',{class:'muted small',text:'None in your spellbook yet.'}) : null, box));
      }
    }
    if(mode==='witch'){
      const mine=this.classSpells(['daily','utility']).filter(p=>!inBook.has(p.id)).sort((a,b)=>this.spellKind(a).localeCompare(this.spellKind(b))||this.spellLevel(a)-this.spellLevel(b)||a.name.localeCompare(b.name));
      const box=el('div',{class:'prows'});
      for(const p of mine){ const sw=swapCtl(p), [b,d]=detail(sw.shown);
        box.append(el('div',{class:'prow2 spellrow'+(sw.isOut?' swapped':'')}, b, ...sw.extra.filter(Boolean)), d, sw.pick); }
      if(!mine.length && !inBook.size) box.append(el('p',{class:'muted',text:'You have no wizard daily or utility spells yet.'}));
      if(mine.length || !inBook.size) out.push(el('div',{class:'bcard wide'}, el('h3',{}, (inBook.size?'Other daily and utility spells ':'Daily and utility spells '), el('small',{class:'muted',text:swap && !inBook.has(swap.out)?'1 swapped':'none swapped'})), box));
    }
    return out;
  },

  /* ---------- Inventory ---------- */
  gearTab(){
    const ch=this.ch, P=this.play(), items=ch.items||[], eq=ch.equip||{}, L=this.st.level;
    const eqUids=new Set(Object.values(eq));
    const slotName={main:'Main hand',off:'Off hand',body:'Armor',arms:'Arms',feet:'Feet',hands:'Hands',head:'Head',neck:'Neck',ring1:'Ring',ring2:'Ring',waist:'Waist',symbol1:'Holy symbol / ki focus',symbol2:'Holy symbol / ki focus',tattoo:'Tattoo'};
    const tier=L>=21?3:L>=11?2:1, dailyMax=tier+(P.milestones||0);
    const used=P.dailyItemUses||0;
    const itemRow=(it,label)=>{
      const {base,magic}=itemParts(it), e=magic||base;
      const pw=magic && /power/i.test(Object.keys(magic.spec).join(' ')+sp(magic,'Full Text')) ? Object.entries(magic.spec).filter(([k])=>/^Power/i.test(k)) : [];
      const isDaily=pw.some(([k,v])=>/daily/i.test(k+v)), isEnc=pw.some(([k,v])=>/encounter/i.test(k+v));
      const key=(isDaily?'daily:':'enc:')+it.uid, u=!!P.itemUsed[key];
      const consumable=/consumable/i.test(Object.values(magic?.spec||{}).join(' ')) || /^(Alchemical Item|Consumable|Potion|Elixir|Ammunition)$/i.test(sp(magic,'Magic Item Type'));
      const d=el('div',{class:'pdetail',hidden:true});
      const b=el('button',{class:'pmain',type:'button'}, label?el('span',{class:'muted small slotname',text:label}):null, el('b',{text:itemName(it)+(it.qty>1?' ×'+it.qty:'')}), consumable&&P.ready?.[it.uid]?el('span',{class:'inhandtag',text:'In hand'}):null, el('span',{class:'muted small',text:sp(e,'Magic Item Type')||e?.type||''}));
      b.onclick=()=>{ d.hidden=!d.hidden; if(!d.hidden && !d.firstChild){ const c=el('div',{class:'pcard entry'}); this.renderElement(c,e.id); d.append(c); } };
      const act=(/(Standard|Minor|Move|Free|Immediate (?:Interrupt|Reaction)|No) Action/i.exec(pw.map(([,v])=>v).join(' '))||[])[0]||'';
      const ctl=consumable ? el('button',{class:'btn small',type:'button',text:'Use…',title:'Prepare it, or use one',onclick:()=>this.itemChoice(it,act,()=>{ it.qty=(it.qty||1)-1; if(it.qty<=0){ ch.items=(ch.items||[]).filter(x=>x!==it); for(const [s,uid] of Object.entries(eq)) if(uid===it.uid) delete eq[s]; } })})
        : (isDaily||isEnc) ? el('button',{class:'btn small puse'+(u?' on':''),type:'button',text:u?'Power used':(isDaily?'Use daily power':'Use power'),onclick:async()=>{ if(u){ delete P.itemUsed[key]; if(isDaily) P.dailyItemUses=Math.max(0,used-1); } else { if(isDaily && used>=dailyMax && !await ask('You have used all your daily item powers for today. Use anyway?')) return; P.itemUsed[key]=1; if(isDaily) P.dailyItemUses=used+1; } this.changed(); }}) : el('span',{});
      const inHand=consumable && !!P.ready?.[it.uid];
      return [el('div',{class:'prow2'+(u?' used':'')+(inHand?' inhand':'')}, b, inHand ? el('div',{class:'pbtns'}, ctl, this.stowButton(it)) : ctl), d];
    };
    const worn=Object.entries(eq).filter(([s,uid])=>items.some(x=>x.uid===uid) && !(s==='ring2'&&eq.ring1===uid) && !(s==='symbol2'&&eq.symbol1===uid))
      .flatMap(([s,uid])=>itemRow(items.find(x=>x.uid===uid),slotName[s]||s));
    const other=items.filter(x=>!eqUids.has(x.uid)).flatMap(it=>itemRow(it,''));
    const weight=items.reduce((t,it)=>t+(+sp(itemParts(it).base||itemParts(it).magic,'Weight')||0)*(it.qty||1),0), str=this.sv('Strength');
    return [
      el('div',{class:'bcard wide'}, el('div',{class:'stephead'}, el('h3',{text:'Equipped'}),
          el('span',{class:'muted small',text:`Daily item powers: ${used} of ${dailyMax} used today (${['','heroic','paragon','epic'][tier]}: ${tier}${P.milestones?` + ${P.milestones} for milestones`:''})`})),
        el('div',{class:'prows'}, ...(worn.length?worn:[el('p',{class:'muted small',text:'Nothing equipped. Use the Shop to equip items.'})]))),
      el('div',{class:'bcard wide'}, el('h3',{text:'Carried'}), el('div',{class:'prows'}, ...(other.length?other:[el('p',{class:'muted small',text:'Nothing else.'})]))),
      el('div',{class:'cols2'},
        el('div',{class:'bcard'}, el('h3',{text:'Money'}), el('p',{}, el('b',{text:'Carried: '}), fmtMoney(ch.money||0)), el('p',{}, el('b',{text:'Stored: '}), fmtMoney(ch.stored||0)),
          el('p',{class:'muted small',text:'Change money in the Shop (Total money).'})),
        el('div',{class:'bcard'}, el('h3',{text:'Encumbrance'}), el('p',{}, el('b',{text:`${weight} lb`}), ` carried · normal load ${str*10} lb · heavy ${str*20} lb · maximum drag ${str*50} lb`),
          weight>str*10 ? el('p',{class:'warn',text:weight>str*20?'Over a heavy load: you can only drag it.':'Heavy load: you are slowed.'}) : null))];
  },

  /* ---------- Mounts ---------- */
  mountsTab(){
    const P=this.play();
    return this.mounts().map(m=>{
      const S=(P.pets||{})[m.key]||{}, hp=S.hp??m.max;
      const kv=(k,v)=>v||v===0 ? [el('span',{text:k}), el('div',{text:String(v)})] : [];
      const card=el('div',{class:'bcard wide compcard'},
        el('div',{class:'stephead'}, el('h3',{text:m.name+(m.kind?' — '+m.kind:'')})),
        el('div',{class:'kv'}, ...kv('Hit points',`${hp} / ${m.max} (bloodied ${Math.floor(m.max/2)})`),
          ...kv('Defenses', m.defs ? `AC ${m.defs[0]}, Fortitude ${m.defs[1]}, Reflex ${m.defs[2]}, Will ${m.defs[3]}` : ''),
          ...kv('Speed',m.speed), ...kv('Initiative',m.init), ...kv('Perception',m.perc),
          ...kv('Powers', m.powers.map(p=>p.calc?.rows[0] ? `${p.name} (${fmt(p.calc.rows[0].atk)} vs ${p.calc.rows[0].def}${p.calc.rows[0].dmg?', '+p.calc.rows[0].dmg:''})` : p.name).join(' · '))),
        m.scaled ? el('p',{class:'muted small',text:'This mount grows with its rider: its numbers above are worked out from yours.'}) : null);
      if(m.ref){ const ent=el('div',{class:'entry compsheet'}); renderInto(ent,m.ref[0],m.ref[1]); card.append(ent); }
      return card;
    });
  },
  /* ---------- Companions & Notes ---------- */
  notesTab(){
    const ch=this.ch, st=this.st, P=this.play();
    const out=[];
    const fam=st.slots.find(s=>s.type==='Familiar' && this.picksOf(s).length);
    const famEl=fam && RULES.db.els[this.picksOf(fam)[0]];
    if(fam && famEl){
      const mode=P.familiar||'passive';
      const btn=(m,l,t)=>el('button',{class:'btn small'+(mode===m?' primary':''),type:'button',text:l,title:t,onclick:()=>{ P.familiar=m; this.changed(); }});
      out.push(el('div',{class:'bcard wide'}, el('div',{class:'stephead'}, el('h3',{text:'Familiar: '+famEl.name}),
          el('div',{class:'brow'}, btn('passive','Passive','On your person; can\'t be targeted or damaged'), btn('active','Active','Moves around; gives its active benefits; 1 hit point'), btn('destroyed','Destroyed','No benefits until after your next short or extended rest'))),
        el('p',{class:'muted small',text: mode==='destroyed' ? 'Destroyed: its constant benefits are off until it comes back after a short or extended rest (the rest buttons bring it back).' : mode==='active' ? 'Active: constant and active benefits apply. Switching modes is a minor action.' : 'Passive: constant benefits apply. Switching to active is a minor action.'}),
        el('div',{class:'kv'}, el('span',{text:'Constant benefits'}), el('div',{class:mode==='destroyed'?'muted strike':'',text:sp(famEl,'Constant Benefits')||'—'}),
          el('span',{text:'Active benefits'}), el('div',{class:mode==='active'?'':'muted',text:sp(famEl,'Power')||sp(famEl,'Active Benefits')||'—'}))));
    }
    // the companions, as on Manage > Companion
    const comp=document.createElement('div'); const saveTab=this.mtab;
    const ct=this.companionTab().filter(x=>x && x.classList?.contains('compcard'));
    // only the title and the stat block: choices (level-up increases, category) stay on Manage > Companion
    for(const c of ct){ const h=c.querySelector('.stephead h3'); out.push(el('div',{class:'bcard wide compcard'}, h?el('div',{class:'stephead'},h):null, ...c.querySelectorAll(':scope > .compsheet'))); }
    this.mtab=saveTab;
    const info=ch.info||{};
    const text=(t,v)=>v ? el('div',{class:'bcard'}, el('h3',{text:t}), el('p',{class:'prel',text:v})) : null;
    const j=(ch.journal||[]).slice(-3).reverse();
    out.push(el('div',{class:'cols2'},
      text('Personality traits',info.traits), text('Mannerisms and appearance',info.appearance), text('Companions and allies',info.companions), text('Session and campaign notes',info.notes),
      j.length ? el('div',{class:'bcard'}, el('h3',{text:'Latest journal entries'}), ...j.map(x=>el('div',{}, el('b',{text:(x.title||'Untitled')+' '}), el('span',{class:'muted small',text:x.date||''}), el('p',{class:'prel',text:(x.text||'').slice(0,400)})))) : null));
    out.push(el('p',{class:'muted small',text:'Edit these under Manage (Information, Journal, Companion).'}));
    return out;
  },
});

/* The power columns: At-will, Encounter and Daily always side by side, in that order. The other groups (Utility,
   Companions and Mounts one under the other, Consumables, Other) each go into whichever column is shortest at that
   point, so the whole takes as little height as it can. When Companions and Mounts together would make their column
   taller than the first three, the smaller of the two goes under Utility instead. */
function layoutPowerCols(wrap){
  if(!wrap.isConnected) return;
  const blocks=[...wrap.querySelectorAll(':scope > .pcol, :scope > .plane > .pcol')];
  const W=wrap.clientWidth, GAP=10, n=Math.max(3, Math.floor((W+GAP)/(250+GAP)));
  const lanes=[...Array(n)].map(()=>el('div',{class:'plane'}));
  wrap.classList.add('laned'); wrap.replaceChildren(...lanes);
  const by=r=>blocks.find(b=>b.dataset.role===r);
  // measure each block at the column width
  lanes.forEach((l,i)=>{ if(i>2) return; const b=by(['atwill','encounter','daily'][i]); if(b) l.append(b); });
  const rest=blocks.filter(b=>!['atwill','encounter','daily'].includes(b.dataset.role));
  rest.forEach(b=>lanes[0].append(b));
  const h=new Map(blocks.map(b=>[b,b.offsetHeight]));
  rest.forEach(b=>b.remove());
  const H=lanes.map(l=>[...l.children].reduce((t,b,i)=>t+h.get(b)+(i?GAP:0),0));
  const shortest=()=>H.reduce((bi,v,i)=>v<H[bi]?i:bi,0);
  const put=(b,i)=>{ H[i]+=h.get(b)+(lanes[i].children.length?GAP:0); lanes[i].append(b); return i; };
  const top=Math.max(H[0],H[1],H[2]);
  let uLane=null; const u=by('utility'); if(u) uLane=put(u,shortest());
  const pc=by('pets'), mo=by('mounts');
  if(pc && mo){
    const i=shortest(), both=h.get(pc)+GAP+h.get(mo);
    if(H[i]+(H[i]?GAP:0)+both>top && uLane!=null){ const [small,big]=h.get(pc)<=h.get(mo)?[pc,mo]:[mo,pc]; put(small,uLane); put(big,shortest()); }
    else { put(pc,i); put(mo,i); }
  } else if(pc||mo) put(pc||mo,shortest());
  for(const r of ['items','other']){ const b=by(r); if(b) put(b,shortest()); }
}
let _plTimer=null;
addEventListener('resize',()=>{ clearTimeout(_plTimer); _plTimer=setTimeout(()=>document.querySelectorAll('.planed').forEach(layoutPowerCols),150); });


// Sneak Attack for one weapon: null if the character has none, or it doesn't work with this weapon
function sneakAttack(st, w, ctx){
  const n=st.stat('Sneak Attack Dice'); if(!(n>0)) return null;
  const groups=sp(w,'Group').toLowerCase().split(/\s*,\s*/), name=w.name.toLowerCase();
  let ok=groups.includes('light blade') || /^(hand crossbow|shortbow|sling)$/.test(name);
  for(const t of st.textList?.['Sneak Attack Weapons']||[]){ if(ok) break;
    const m=/^(.*?)\s*(?:\((heroic|paragon|epic) tier\))?$/i.exec(t.value), v=m[1].toLowerCase(), tier=(m[2]||'').toLowerCase();
    if(tier==='heroic' && st.level>10 || tier==='paragon' && st.level<11 || tier==='epic' && st.level<21) continue;
    if(/ group$/.test(v) ? groups.includes(v.replace(/ group$/,'')) : (v===name || ctx.has(v))) ok=true; }
  if(!ok) return null;
  const die=(String(st.texts['Sneak Attack Die']||'').trim()||'d6').replace(/^1?d/,'d'), flat=st.stat('Sneak Attack')||0;
  const more=(st.textList?.['Sneak Attack']||[]).filter(x=>/d\d/.test(x.value));
  return {value:'+'+n+die+(flat?(flat>0?'+':'')+flat:''), more};
}
