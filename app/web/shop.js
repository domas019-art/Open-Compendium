"use strict";
/* =====================================================================
   Shop: Equipment | Rituals | Alchemy | Martial Practices
   Works like the original Character Builder's shop: pick a category,
   pick an item, then Buy (pays with the character's money) or Add (found
   items, free). Your equipment, selling, and the equipped slots below.
   ===================================================================== */

const SHOP_TABS=[['equipment','Equipment'],['rituals','Rituals'],['alchemy','Alchemy'],['practices','Martial Practices']];
const SHOP_CATS=['Adventuring Gear','Armor','Magic Armor','Weapons','Magic Weapons','Ki Focuses','Dragonshard Augments','Ammunition','Superior Implements','Magic Implements',
  'Orbs','Rods','Staffs','Wands','Tomes','Holy Symbols','Totems','Reagents','Arms Slot Items','Feet Slot Items','Hands Slot Items','Head Slot Items',
  'Neck Slot Items','Rings','Waist Slot Items','Wondrous Items','Tattoos','Potions','Whetstones','Consumables','Soulfangs','Alchemical Items','Scrolls',
  'Artifacts','Intelligent Items','Boons','Item Sets','Mounts','Mount Slot Items','Barding','Companion Slot Items','Familiar Slot Items','Other'];
const MIT_CAT={'Armor':'Magic Armor','Weapon':'Magic Weapons','Ki Focus':'Ki Focuses','Dragonshard Augment':'Dragonshard Augments','Ammunition':'Ammunition',
  'Orb':'Orbs','Rod':'Rods','Staff':'Staffs','Wand':'Wands','Tome':'Tomes','Holy Symbol':'Holy Symbols','Totem':'Totems','Reagent':'Reagents',
  'Arms Slot Item':'Arms Slot Items','Arms Slot':'Arms Slot Items','Feet Slot Item':'Feet Slot Items','Hands Slot Item':'Hands Slot Items','Head Slot Item':'Head Slot Items',
  'Neck Slot Item':'Neck Slot Items','Ring':'Rings','Waist Slot Item':'Waist Slot Items','Wondrous Item':'Wondrous Items','Potion':'Potions','Elixir':'Potions',
  'Whetstones':'Whetstones','Consumable':'Consumables','Other Consumable':'Consumables','Soulfang':'Soulfangs','Alchemical':'Alchemical Items',
  'Artifact':'Artifacts','Intelligent Item':'Intelligent Items','Mount Slot Item':'Mount Slot Items','Companion Slot Item':'Companion Slot Items','Familiar Slot Item':'Familiar Slot Items'};
const BOON_TYPES=/Boon|Gift|Blessing|Training|Talent|Mystery|Secret|Brand|Echo of Power|Alternative Reward/;
// price of a typical magic item of each level; used for starting money above 1st level
const ITEM_VALUE=[0,360,520,680,840,1000,1800,2600,3400,4200,5000,9000,13000,17000,21000,25000,45000,65000,85000,105000,125000,
  225000,325000,425000,525000,625000,1125000,1625000,2125000,2625000,3125000];
// Starting money, as the original builder gives it: 100 gp at 1st level; above that, the price of a magic item one level lower.
// (A character made above 1st level also gets three magic items, of levels +1, same and -1: that's what Auto Add gives.)
function startingMoney(L){ return L<=1 ? 100*100 : ITEM_VALUE[Math.max(1,L-1)]*100; }

function levelMoney(L){ return startingMoney(L); }
/* coins: the character keeps astral diamonds, platinum, gold, silver and copper separately, carried and banked */
const COINS=[['ad','AD',1000000],['pp','PP',10000],['gp','GP',100],['sp','SP',10],['cp','CP',1]];
const coinTotal=c=>COINS.reduce((a,[k,,v])=>a+(+c?.[k]||0)*v,0);
function breakdown(cp){ cp=Math.max(0,Math.round(cp)); return {ad:0,pp:0,gp:Math.floor(cp/100),sp:Math.floor(cp%100/10),cp:cp%10}; }
// after spending or earning: keep the bigger coins the character has as far as possible, the rest in gold, silver and copper
function rebalance(prev,total){
  let rem=Math.max(0,Math.round(total)); const out={ad:0,pp:0,gp:0,sp:0,cp:0};
  for(const [k,,v] of COINS.slice(0,2)){ const n=Math.min(+prev?.[k]||0, Math.floor(rem/v)); out[k]=n; rem-=n*v; }
  const b=breakdown(rem); out.gp=b.gp; out.sp=b.sp; out.cp=b.cp; return out;
}
// "Convert all to…": as many of that coin as possible, what's left over in smaller coins
function convertCoins(c,to){
  let rem=coinTotal(c); const out={ad:0,pp:0,gp:0,sp:0,cp:0}, i=COINS.findIndex(x=>x[0]===to);
  for(const [k,,v] of COINS.slice(i)){ out[k]=Math.floor(rem/v); rem-=out[k]*v; }
  return out;
}
function parseCoins(str){ const out={ad:0,pp:0,gp:0,sp:0,cp:0};
  String(str||'').replace(/,/g,'').replace(/(\d+)\s*(ad|pp|gp|sp|cp)\b/gi,(m,v,u)=>{ out[u.toLowerCase()]+=+v; }); return out; }
// money changed by buying or selling: bring the coins in line with the totals
function syncCoins(ch){
  ch.coins ||= {carried:breakdown(ch.money||0), banked:breakdown(ch.stored||0)};
  if(coinTotal(ch.coins.carried)!==(ch.money||0)) ch.coins.carried=rebalance(ch.coins.carried,ch.money||0);
  if(coinTotal(ch.coins.banked)!==(ch.stored||0)) ch.coins.banked=rebalance(ch.coins.banked,ch.stored||0);
}
// rod, wand, orb... for proficiency checks
function implKind(e){
  const t=sp(e,'Magic Item Type'); if(IMPLEMENT_TYPES.test(t)) return t==='Ki Focus' ? 'ki focuses' : t.toLowerCase();
  if(e.type==='Gear'||e.type==='Superior Implement'){ const m=/^(orb|rod|staff|wand|tome|totem|holy symbol|ki focus)/i.exec(e.name) || /(orb|rod|staff|wand|tome|totem|symbol)\b/i.exec(e.name);
    if(m){ const k=m[1].toLowerCase(); return k==='symbol'?'holy symbol':k==='ki focus'?'ki focuses':k; } }
  return '';
}
const IMPL_GROUPS=['Holy Symbol','Orb','Rod','Staff','Tome','Totem','Wand','Ki Focus'];
// a superior implement's kind, from its name ("Accurate orb" -> Orb)
function implGroup(b){ const n=b.name.toLowerCase();
  return /ki focus/.test(n)?'Ki Focus' : /symbol/.test(n)?'Holy Symbol' : /dagger/.test(n)?'Dagger' : (IMPL_GROUPS.find(g=>n.endsWith(g.toLowerCase()))||''); }
function implFits(m,b){ const g=implGroup(b), t=sp(m,'Magic Item Type');
  if(g==='Dagger') return t==='Weapon' && baseFits(m,{type:'Weapon',name:'Dagger',spec:{Group:'Light Blade','Weapon Category':'Simple Melee'}});
  return t===g; }
function shopCat(e){
  if(e.type==='Gear') return sp(e,'Category')==='Mount' ? 'Mounts' : sp(e,'Category')==='Ammunition' ? 'Ammunition' : 'Adventuring Gear';
  if(e.type==='Armor') return /barding/i.test(e.name) ? 'Barding' : 'Armor';
  if(e.type==='Item Set') return 'Item Sets';
  if(e.type==='Weapon') return 'Weapons';
  if(e.type==='Superior Implement') return 'Superior Implements';
  if(e.type==='Ritual Scroll') return 'Scrolls';
  if(e.type!=='Magic Item') return '';
  if(/tattoo/i.test(sp(e,'Item Slot'))) return 'Tattoos';
  const t=sp(e,'Magic Item Type');
  if(MIT_CAT[t]) return MIT_CAT[t];
  if(BOON_TYPES.test(t)) return 'Boons';
  return 'Other';
}
let _shopIdx=null;
function shopIndex(){
  if(_shopIdx && _shopIdx.db===RULES.db) return _shopIdx;
  const byCat={};
  for(const t of ['Gear','Armor','Weapon','Superior Implement','Ritual Scroll','Magic Item','Item Set'])
    for(const id of RULES.db.byType[t]||[]){
      const e=RULES.db.els[id], c=shopCat(e); if(!c || /workaround/i.test(e.name)) continue;
      // the other end of double weapons isn't a separate item; size variants ("(Large)") show only with "Show large weapons"
      if((e.type==='Weapon'||e.type==='Armor') && /secondary end/i.test(e.name)) continue;
      const large=(e.type==='Weapon'||e.type==='Armor') && /\((large|huge|small|tiny)( creature)?\)/i.test(e.name) && !/barding/i.test(e.name);
      const r={e, large, cost:itemCost(e), level:+sp(e,'Level')||0, weight:+(sp(e,'Weight').replace(/[^\d.]/g,''))||0};
      (byCat[c] ||= []).push(r);
      // implements that can be made from a superior implement also show under Magic Implements
      if(IMPL_GROUPS.includes(sp(e,'Magic Item Type')) || (sp(e,'Magic Item Type')==='Weapon' && /any|dagger|light blade/i.test(sp(e,'Weapon')) && !/ranged|thrown/i.test(sp(e,'Weapon')))) (byCat['Magic Implements'] ||= []).push(r);
    }
  _shopIdx={db:RULES.db, byCat};
  return _shopIdx;
}
// rituals, alchemical formulas and martial practices are all "Ritual" elements
function ritualKind(e){
  const t=sp(e,'type'), c=sp(e,'Category');
  if(t==='Martial Practice' || c==='Martial Practice') return 'practices';
  if(t==='Alchemical Formula' || (!t && /^(Volatile|Oil|Curative|Poison|Other)$/.test(c))) return 'alchemy';
  return 'rituals';
}

Object.assign(Builder,{
  shop:{tab:'equipment', cat:'Adventuring Gear', q:'', sel:null, base:null, qty:1, sort:'name', dir:1, limit:200, all:false, inv:null},

  shopStep(){
    const S=this.shop, ch=this.ch;
    // a different character: start fresh on what that character wears
    if(S.charId!==ch.id){ S.charId=ch.id; S.base=null; S.sel=null; S.inv=null; this.shopMsg=''; }
    const tabs=el('nav',{class:'steps'});
    for(const [k,label] of SHOP_TABS) tabs.append(el('button',{type:'button',class:'step'+(S.tab===k?' on':''),onclick:()=>{ S.tab=k; S.sel=null; S.q=''; this.shopMsg=''; this.render(); }},label));
    const out=[tabs, this.moneyCard()];
    if(S.tab==='equipment') out.push(this.storeCard(), el('div',{class:'shopbottom'}, this.inventoryCard(), this.equippedCard()));
    else out.push(...this.knownCards(S.tab));
    return out;
  },

  // true when the same row was clicked twice within half a second
  dbl(id){ const now=Date.now(), was=this._lastClick; this._lastClick={id,t:now};
    if(was && was.id===id && now-was.t<500){ this._lastClick=null; return true; } return false; },

  /* ---------- money ---------- */
  moneyCard(){
    const ch=this.ch, L=this.st.level; syncCoins(ch);
    return el('div',{class:'bcard wide'},
      el('div',{class:'brow wrap'},
        el('button',{class:'btn primary moneybtn',type:'button',title:'Show and change the coins the character has',onclick:()=>this.openMoney()},
          el('span',{text:'Total money: '}), el('b',{text:fmtMoney((ch.money||0)+(ch.stored||0))})),
        el('span',{class:'muted small',text:`Carried ${fmtMoney(ch.money||0)} · Banked ${fmtMoney(ch.stored||0)}`})));
  },
  // the original's "Total Money Breakdown" window
  openMoney(){
    const ch=this.ch; syncCoins(ch);
    let dlg=document.getElementById('moneyDlg');
    if(!dlg){ dlg=el('dialog',{id:'moneyDlg',class:'moneydlg'}); document.body.append(dlg); }
    const draw=()=>{
      const c=ch.coins, grid=el('div',{class:'coingrid'},
        el('span'), el('b',{text:'Carried'}), el('span'), el('b',{text:'Banked'}), el('span'), el('b',{text:'Total'}));
      for(const [k,label] of COINS){
        const inp=(side)=>{ const i=el('input',{type:'number',min:0,step:1,value:c[side][k]||0,'aria-label':label+' '+side});
          i.onchange=()=>{ c[side][k]=Math.max(0,Math.floor(+i.value||0)); ch.money=coinTotal(c.carried); ch.stored=coinTotal(c.banked); this.changed(); draw(); }; return i; };
        grid.append(el('b',{text:label}), inp('carried'), el('span',{text:'+'}), inp('banked'), el('span',{text:'='}),
          el('input',{type:'number',value:(c.carried[k]||0)+(c.banked[k]||0),readonly:true,tabindex:-1,'aria-label':label+' total'}));
      }
      const conv=el('select',{'aria-label':'Convert all to'}, el('option',{value:''},'Convert all to…'), ...COINS.map(([k,label])=>el('option',{value:k},label)));
      conv.onchange=()=>{ if(!conv.value) return; c.carried=convertCoins(c.carried,conv.value); c.banked=convertCoins(c.banked,conv.value); this.changed(); draw(); };
      dlg.replaceChildren(el('h3',{text:'Total money'}), grid,
        el('p',{class:'muted small',text:'1 astral diamond = 100 pp = 10,000 gp. 1 gp = 10 sp = 100 cp.'}),
        el('div',{class:'brow wrap',style:'justify-content:center'}, conv,
          el('button',{class:'btn',type:'button',title:'Set the money to the amount for the character\'s level (banked money is cleared)',text:'Level-Appropriate',onclick:()=>{
            const amt=startingMoney(this.st.level);
            if(!confirm(`Set the money to ${fmtMoney(amt)}, the amount for level ${this.st.level}?\n\nThis replaces all the character's money now (${fmtMoney((ch.money||0)+(ch.stored||0))}, carried and banked). Items are kept.`)) return;
            c.carried=breakdown(amt); c.banked=breakdown(0); ch.money=amt; ch.stored=0; this.changed(); draw(); }})),
        el('div',{class:'brow',style:'justify-content:flex-end;margin-top:10px'}, el('button',{class:'btn primary',type:'button',text:'Close',onclick:()=>dlg.close()})));
    };
    draw(); dlg.showModal();
  },

  /* ---------- the store ---------- */
  // is the character proficient with this item? Items shown in red when not (like the original)
  profOk(e){
    if(!e) return true;
    const names=this.st.names, has=n=>names.has(n.toLowerCase());
    if(e.type==='Armor'){
      for(const [t,a] of e.rules) if(t==='statadd' && /proficiency/i.test(a.requires||'')){ const n=a.requires.replace(/^!/,'').trim(); return has(n); }
      return true;
    }
    if(e.type==='Weapon'){
      // a weapon sized for Large creatures: proficiency with the normal weapon, plus being able to wield bigger weapons
      // (bugbear "Oversized", Eternal Defender's "Godlike Stature", or the house-rule feat)
      if(/large/i.test(sp(e,'Size')) || /\(large\)/i.test(e.name)){
        const base=RULES.db.els[sp(e,'_SupportsID')];
        return (has('oversized') || has('one size larger')) && (!base || this.profOk(base));
      }
      const n='weapon proficiency ('+e.name.toLowerCase()+')'; return !RULES.db.nameIdx[n] || has(n); }
    const kind=implKind(e); if(!kind) return true;
    const n='implement proficiency ('+kind+')'; return !RULES.db.nameIdx[n] || has(n);
  },
  storeCard(){
    const S=this.shop, idx=shopIndex();
    S.sorts ||= {};
    // keep the chosen weapon, armor or set visible in its list
    setTimeout(()=>{ const b=document.querySelector('.shopbases button.on'), box=b?.parentElement; if(b && (b.offsetTop<box.scrollTop || b.offsetTop>box.scrollTop+box.clientHeight-30)) box.scrollTop=b.offsetTop-box.clientHeight/2; },0);
    const cats=SHOP_CATS.filter(c=>idx.byCat[c]?.length);
    const q=S.q.trim().toLowerCase();
    const visible=r=>(S.all||this.bookOk(r.e)) && (!q || r.e.name.toLowerCase().includes(q)) && (!S.profOnly || this.profOk(r.e)) && (S.large || !r.large);
    const counts={}; for(const c of cats) counts[c]=idx.byCat[c].filter(visible).length;
    const shown=q ? cats.filter(c=>counts[c]) : cats;
    if(!shown.includes(S.cat)) S.cat=shown[0]||cats[0];      // a search jumps to the first category that has matches
    const catList=el('div',{class:'shopcats',dataset:{keep:'cats'}});
    for(const c of shown) catList.append(el('button',{type:'button',class:S.cat===c?'on':'',onclick:()=>{ S.cat=c; S.sel=null; S.base=null; S.limit=200; this.shopMsg=''; this.render(); }},
      c, el('small',{text:counts[c]})));
    // magic armor, weapons and implements: first the item it's made from, then the enchantment
    const magic={'Magic Armor':'Armor','Magic Weapons':'Weapon','Magic Implements':'Superior Implement'}[S.cat]||'';
    let mid=null, base=null, set=null;
    if(magic){
      const list=this.baseList(magic);
      base=list.find(b=>b.id===S.base) || this.defaultBase(magic,list);
      S.base=base?.id||null;
      mid=el('div',{class:'shopbases',dataset:{keep:'bases:'+S.cat}});
      let grp=null;
      for(const b of list){
        const g=magic==='Armor' ? (sp(b,'Armor Category')||'Other') : magic==='Superior Implement' ? implGroup(b) : '';
        if(g!==grp){ grp=g; if(g) mid.append(el('div',{class:'bgroup',text:g})); }
        mid.append(el('button',{type:'button',class:(b.id===S.base?'on ':'')+(this.profOk(b)?'':'noprof'),title:this.profOk(b)?'':'Not proficient',
          onclick:()=>{ S.base=b.id; S.sel=null; this.render(); }}, b.name));
      }
    }
    if(S.cat==='Item Sets'){
      const sets=(idx.byCat['Item Sets']||[]).filter(visible).map(r=>r.e);
      set=sets.find(x=>x.id===S.set) || sets[0]; S.set=set?.id||null;
      mid=el('div',{class:'shopbases',dataset:{keep:'sets'}});
      for(const tier of ['Heroic','Paragon','Epic','Group']){
        const inTier=sets.filter(x=>(sp(x,'Tier')||'Group')===tier).sort((a,b)=>a.name.localeCompare(b.name)); if(!inTier.length) continue;
        mid.append(el('div',{class:'bgroup',text:tier}));
        for(const x of inTier) mid.append(el('button',{type:'button',class:x.id===S.set?'on':'',onclick:()=>{ S.set=x.id; S.sel=null; this.render(); }},x.name));
      }
    }
    // rows and columns for this category
    let rows;
    if(set) rows=sp(set,'Set Items').split(',').map(x=>RULES.db.els[x.trim()]).filter(Boolean).map(e=>({e, cost:itemCost(e), level:+sp(e,'Level')||0, weight:0}));
    else rows=(idx.byCat[S.cat]||[]).filter(visible);
    if(magic && base) rows=rows.filter(r=>magic==='Superior Implement' ? implFits(r.e,base) : baseFits(r.e,base));
    const view=set ? 'sets' : magic ? 'magic' : S.cat==='Armor'||S.cat==='Barding' ? 'armor' : S.cat==='Weapons' ? 'weapon'
      : /^(Adventuring Gear|Ammunition|Mounts|Superior Implements|Scrolls)$/.test(S.cat) ? 'gear' : 'magic';
    const num=x=>+String(x).replace(/[^\d.-]/g,'')||0, dash=v=>(v && v!=='-') ? v : '—';
    const nameCell=r=>el('td',{}, r.e.name, sp(r.e,'_Item_Set_ID') && view!=='sets' ? el('span',{class:'settag',title:'Part of an item set',text:'SET'}) : null,
      this.bookOk(r.e)?null:el('span',{class:'hb small',title:'book not in this campaign',text:'HB'}));
    const COLS={
      armor:[['name','Armor',nameCell,r=>r.e.name],['bonus','Armor Bonus',r=>'+'+(num(sp(r.e,'Armor Bonus'))),r=>num(sp(r.e,'Armor Bonus'))],
        ['check','Check',r=>dash(sp(r.e,'Check')),r=>num(sp(r.e,'Check'))],['speed','Speed',r=>dash(sp(r.e,'Speed')),r=>num(sp(r.e,'Speed'))],
        ['price','Price',r=>r.cost?fmtMoney(r.cost):'—',r=>r.cost,1],['weight','Weight',r=>r.weight?r.weight+' lb':'—',r=>r.weight,1]],
      weapon:[['name','Weapon',nameCell,r=>r.e.name],['wcat','Category',r=>sp(r.e,'Weapon Category'),r=>sp(r.e,'Weapon Category')],
        ['prof','Prof.',r=>sp(r.e,'Proficiency Bonus')?'+'+sp(r.e,'Proficiency Bonus'):'—',r=>num(sp(r.e,'Proficiency Bonus'))],['damage','Damage',r=>sp(r.e,'Damage')||'—',r=>sp(r.e,'Damage')],
        ['price','Price',r=>r.cost?fmtMoney(r.cost):'—',r=>r.cost,1],['group','Group',r=>sp(r.e,'Group'),r=>sp(r.e,'Group')],
        ['props','Properties',r=>sp(r.e,'Properties'),r=>sp(r.e,'Properties')],['weight','Weight',r=>r.weight?r.weight+' lb':'—',r=>r.weight,1]],
      gear:[['name','Item',nameCell,r=>r.e.name],['price','Price',r=>r.cost?fmtMoney(r.cost):'—',r=>r.cost,1],['weight','Weight',r=>r.weight?r.weight+' lb':'—',r=>r.weight,1]],
      magic:[['level','Lvl',r=>r.level||'*',r=>r.level,1],['name',magic?'Enchantment':'Name',nameCell,r=>r.e.name],['price','Price',r=>r.cost?fmtMoney(r.cost):'—',r=>r.cost,1]],
      sets:[['level','Lvl',r=>r.level||'*',r=>r.level,1],['name','Name',nameCell,r=>r.e.name],['price','Price',r=>r.cost?fmtMoney(r.cost):'—',r=>r.cost,1],
        ['slot','Item slot',r=>sp(r.e,'Item Slot').replace(/^Off-hand$/i,'')||'',r=>sp(r.e,'Item Slot')]],
    }[view];
    const DEF={armor:'bonus',weapon:'name',gear:'name',magic:'level',sets:'level'};
    let [sk,dir]=S.sorts[view]||[DEF[view],1];
    const col=COLS.find(c=>c[0]===sk)||COLS[0];
    rows=[...rows].sort((a,b)=>{ const x=col[3](a), y=col[3](b);
      return dir*(typeof x==='string' ? String(x).localeCompare(y,undefined,{numeric:true}) : (x-y)) || (a.level-b.level) || a.e.name.localeCompare(b.e.name,undefined,{numeric:true}); });
    const head=el('tr',{}, ...COLS.map(([k,label,,,right])=>el('th',{class:(sk===k?'on ':'')+(right?'r':''),onclick:()=>{ S.sorts[view]=[k, sk===k ? -dir : 1]; this.render(); }},label+(sk===k?(dir>0?' ▲':' ▼'):''))));
    const body=el('tbody');
    for(const r of rows.slice(0,S.limit)){
      const prof=view==='magic'&&magic || view==='sets' || this.profOk(r.e);
      const tr=el('tr',{class:'row'+(S.sel===r.e.id?' on':'')+(prof?'':' noprof'),title:prof?'':'Not proficient',dataset:{id:r.e.id}},
        ...COLS.map(([k,,get,,right])=>{ const v=get(r); return v && v.nodeType ? v : el('td',{class:right?'num':'',text:v}); }));
      // a second click on the same item soon after the first adds it (a double-click; the list is redrawn in between)
      tr.onclick=()=>{ if(this.dbl(r.e.id)){ S.sel=r.e.id; this.buy(false); return; } S.sel=r.e.id; S.qty=1; this.shopMsg=''; this.render(); };
      body.append(tr);
    }
    const more=rows.length>S.limit ? el('button',{class:'btn small',type:'button',text:`Show more (${rows.length-S.limit} left)`,onclick:()=>{ S.limit+=400; this.render(); }}) : null;
    const search=el('input',{type:'search',placeholder:'Search all items…',value:S.q,'aria-label':'Search items'});
    search.oninput=()=>{ S.q=search.value; S.limit=200; clearTimeout(this._sq); this._sq=setTimeout(()=>{ this.render(); const s=document.querySelector('.shopsearch input'); if(s){ s.focus(); s.setSelectionRange(s.value.length,s.value.length); } },200); };
    const total=shown.reduce((a,c)=>a+counts[c],0);
    return el('div',{class:'bcard wide'},
      el('div',{class:'stephead'}, el('h3',{text:'Equipment and magic items'}),
        el('span',{class:'brow',style:'gap:16px;margin:0'},
          el('label',{class:'chk',title:'Also list the versions of weapons made for Large (or Small) creatures'},
            el('input',{type:'checkbox',checked:S.large,onchange:e=>{ S.large=e.target.checked; this.render(); }}),' Show large weapons'),
          el('label',{class:'chk',title:'Hide weapons, armor and implements the character is not proficient with'},
            el('input',{type:'checkbox',checked:S.profOnly,onchange:e=>{ S.profOnly=e.target.checked; this.render(); }}),' Only proficient items'),
          el('label',{class:'chk',title:'Also list items from books not in this campaign. They are marked HB.'},
            el('input',{type:'checkbox',checked:S.all,onchange:e=>{ S.all=e.target.checked; this.render(); }}),' Show everything available'))),
      el('div',{class:'brow shopsearch'}, search, el('span',{class:'muted small',text:q?`${total} found in ${shown.length} categor${shown.length===1?'y':'ies'}`:`${rows.length} items`})),
      (()=>{ const [controls,details]=this.buyBar(set);
        // like the original: categories | (armor/weapon/set) | items with Buy and Add | the item's description
        return el('div',{class:'shopgrid'+(mid?' three':'')}, catList, mid,
          el('div',{class:'shopcenter'},
            el('div',{class:'shoplist',dataset:{keep:'list:'+S.cat+':'+(S.base||S.set||'')}}, rows.length ? el('table',{class:'shoptable'}, el('thead',{},head), body)
              : el('p',{class:'muted pad',text:'Nothing here.'}), more),
            controls,
            el('div',{class:'brow wrap',style:'margin-top:8px'},
              el('button',{class:'btn small',type:'button',title:'Buy a magic weapon or implement, magic armor and a magic amulet suited to the character\'s level',text:'Auto Buy',onclick:()=>this.autoItems(true)}),
              el('button',{class:'btn small',type:'button',title:'Add those items for free, and set the money to the level\'s amount',text:'Auto Add',onclick:()=>this.autoItems(false)}),
              el('span',{class:'muted small',text:'Red: not proficient.'}))),
          el('div',{class:'shopdetail',dataset:{keep:'detail:'+(S.sel||S.set||'')}}, details)); })());
  },
  // armor (grouped by type), weapons or superior implements that magic items can be made from
  baseList(kind){
    const S=this.shop;
    const order=['Cloth','Leather','Hide','Chain','Scale','Plate','Light Shields','Light Shield','Heavy Shields','Heavy Shield'];
    const rank=b=>{ const i=order.indexOf(sp(b,'Armor Category')); return i<0?50:i; };
    const irank=b=>{ const i=[...IMPL_GROUPS,'Dagger'].indexOf(implGroup(b)); return i<0?50:i; };
    return (RULES.db.byType[kind]||[]).map(id=>RULES.db.els[id])
      .filter(b=>(S.all||this.bookOk(b)) && (kind!=='Weapon' || !/improvised/i.test(sp(b,'Weapon Category'))) && !/ammunition/i.test(sp(b,'Group')+sp(b,'Weapon Category'))
        && !/secondary end|barding/i.test(b.name) && (S.large || !/\((large|huge|small|tiny)\)/i.test(b.name)))       // size variants, the other end of double weapons, and barding aren't listed here
      .filter(b=>!S.profOnly || this.profOk(b))
      .sort((a,b)=>(kind==='Armor' ? rank(a)-rank(b) || (+sp(a,'Armor Bonus')||0)-(+sp(b,'Armor Bonus')||0) : kind==='Superior Implement' ? irank(a)-irank(b) : 0) || a.name.localeCompare(b.name));
  },
  // what the character wears or wields now, otherwise the first one they are proficient with
  defaultBase(kind,list){
    const w=this.st.wear;
    const cur=kind==='Armor' ? w.body : kind==='Weapon' ? w.weapons[0] : null;
    return (cur && list.find(b=>b.id===cur.id)) || list.find(b=>this.profOk(b)) || list[0] || null;
  },
  // which base the selected item will be made from: the one picked in the middle column, or (in item sets) a choice here
  baseFor(e){
    const S=this.shop, b=S.base && RULES.db.els[S.base];
    if(S.cat==='Magic Implements') return b && implFits(e,b) ? b : null;
    const kind=baseKind(e); if(!kind) return null;
    if((S.cat==='Magic Armor'||S.cat==='Magic Weapons') && b && baseFits(e,b)) return b;
    const pickB=S.setBase && RULES.db.els[S.setBase];
    if(pickB && baseFits(e,pickB)) return pickB;
    return this.baseList(kind).filter(x=>baseFits(e,x)).sort((x,y)=>this.profOk(y)-this.profOk(x))[0]||null;
  },

  // the selected item: quantity, cost, Buy and Add, and its full description
  buyBar(set){
    const S=this.shop, e=S.sel && RULES.db.els[S.sel];
    if(!e){
      if(set){ const box=el('div',{class:'entry shopentry'}); this.renderElement(box,set.id);
        // the set's bonuses for wearing several of its items
        const ben=sp(set,'Benefits').split(',').map(x=>RULES.db.els[x.trim()]).filter(Boolean);
        if(ben.length){ box.append(el('h3',{text:'Set benefits'})); for(const b of ben) box.append(el('p',{},el('b',{text:(sp(b,'Piece Count') ? sp(b,'Piece Count')+' pieces' : b.name)+': '}), b.text||sp(b,'Short Description')||'')); }
        return [el('p',{class:'muted small',style:'margin:8px 0 0',text:'Pick an item in the set to buy it or add it.'}), box]; }
      return [el('p',{class:'muted small',style:'margin:8px 0 0',text:'Pick an item to see it, and to buy it or add it. Double-click adds it for free (a found item).'}),
        el('p',{class:'muted pad',text:'The selected item is described here.'})];
    }
    const kind=baseKind(e), base=this.baseFor(e);
    const needsBase=!!kind || S.cat==='Magic Implements';
    const fits=!needsBase || !!base;
    // inside item sets, magic armor and weapons need a choice of armor or weapon here
    const baseSel=kind && !(S.cat==='Magic Armor'||S.cat==='Magic Weapons') ? el('select',{'aria-label':'Made from',onchange:ev=>{ S.setBase=ev.target.value; this.render(); }},
      ...this.baseList(kind).filter(x=>baseFits(e,x)).map(x=>el('option',{value:x.id,selected:x.id===base?.id,class:this.profOk(x)?'':'noprof'},x.name+(this.profOk(x)?'':' (not proficient)')))) : null;
    const qty=el('input',{type:'number',min:1,value:S.qty,class:'qty','aria-label':'Quantity'});
    qty.onchange=()=>{ S.qty=Math.max(1,Math.floor(+qty.value||1)); this.render(); };
    const cost=itemCost(e)*S.qty, money=this.ch.money||0;
    const details=el('div',{class:'entry shopentry'});
    this.renderElement(details,e.id);
    if(base){
      // "Made from": click to go to that armor, weapon or implement in its own list
      const go=()=>{ S.cat=base.type==='Armor' ? (/barding/i.test(base.name)?'Barding':'Armor') : base.type==='Weapon' ? 'Weapons' : 'Superior Implements';
        S.sel=base.id; S.q=''; S.base=null; this.render();
        setTimeout(()=>document.querySelector(`.shoptable tr.row[data-id="${CSS.escape(base.id)}"]`)?.scrollIntoView({block:'center'}),0); };
      const bx=el('div',{class:'entry shopentry'}); this.renderElement(bx,base.id);
      details.append(el('h4',{class:'lvlhead'},'Made from: ', el('span',{class:'madefrom',role:'link',tabindex:0,title:'Show '+base.name+' in its list',onclick:go,onkeydown:ev=>{ if(ev.key==='Enter') go(); }},base.name)), bx);
    }
    return [el('div',{class:'buybar'},
      el('div',{class:'brow wrap'},
        el('b',{text: fits && base ? itemName({ids:[base.id,e.id]}) : e.name}),
        baseSel ? el('span',{class:'muted small',text:'made from'}) : null, baseSel,
        el('span',{class:'muted small',text:'Quantity'}), qty,
        el('span',{class:'muted small',text:'Cost '+fmtMoney(cost)}),
        el('span',{style:'flex:1'}),
        el('button',{class:'btn primary',type:'button',disabled:!fits || cost>money,title:cost>money?'Not enough money':'Pay for it with the character\'s money',text:'Buy',onclick:()=>this.buy(true)}),
        el('button',{class:'btn',type:'button',disabled:!fits,title:'Add it without paying (found or given)',text:'Add',onclick:()=>this.buy(false)})),
      cost>money ? el('p',{class:'warn small',style:'margin:4px 0 0',text:`Not enough money: you have ${fmtMoney(money)}.`}) : null,
      !fits ? el('p',{class:'warn small',style:'margin:4px 0 0',text:'Pick what this is made from first.'}) : null), details];
  },

  buy(pay){
    const S=this.shop, e=RULES.db.els[S.sel]; if(!e) return;
    const needsBase=!!baseKind(e) || S.cat==='Magic Implements', base=this.baseFor(e);
    if(needsBase && !base) return;
    const r=this.giveItem(base ? [base.id, e.id] : [e.id], S.qty||1, pay);
    if(r) this.shopMsg=r; this.changed();
  },
  // put an item in the character's equipment; returns a message, or '' when it can't be paid for
  giveItem(ids,qty,pay){
    const ch=this.ch, e=RULES.db.els[ids[ids.length-1]], cost=itemCost(e)*qty;
    if(pay){ if(cost>(ch.money||0)) return ''; ch.money=(ch.money||0)-cost; }
    ch.items ||= [];
    const equipped=new Set(Object.values(ch.equip||{}));
    let it=ch.items.find(x=>x.ids.join()===ids.join() && !equipped.has(x.uid));
    if(it) it.qty+=qty; else { it={uid:Math.random().toString(36).slice(2,9), ids, qty}; ch.items.push(it); }
    this._lastItem=it;
    let extra='';
    // some entries come with another item for free (The Nine Swords of Tyr (Lvl 24) -> The 9th Sword of Tyr)
    for(const [tag,a] of e.rules) if(tag==='statadd' && /^FREEBEE:/.test(a.name||'')){
      const fe=RULES.db.els[a.name.slice(8)]; if(!fe) continue;
      const kind=baseKind(fe), want=sp(fe,kind).toLowerCase();
      const b=kind ? ((RULES.db.byType[kind]||[]).map(id=>RULES.db.els[id]).find(x=>x.name.toLowerCase()===want) || this.baseList(kind).find(x=>baseFits(fe,x))) : null;
      const fids=b ? [b.id,fe.id] : [fe.id];
      const n=qty*(+String(a.value).replace(/[^\d]/g,'')||1);
      const f=ch.items.find(x=>x.ids.join()===fids.join() && !equipped.has(x.uid));
      if(f) f.qty+=n; else ch.items.push({uid:Math.random().toString(36).slice(2,9), ids:fids, qty:n});
      extra+=` It comes with ${itemName({ids:fids})}.`;
    }
    this._lastItem=it;
    return `${pay?'Bought':'Added'} ${qty>1?qty+' × ':''}${itemName({ids})}${pay&&cost?' for '+fmtMoney(cost):''}.`+extra;
  },

  /* Auto Buy / Auto Add, like the original: a magic weapon or implement (level +1), magic armor (character's level)
     and a magic amulet (level -1), picked at random among the ones that suit the character */
  autoItems(pay){
    const ch=this.ch, L=this.st.level;
    const msg=pay ? 'This will try to buy a magic weapon or implement, magic armor and a magic amulet of a suitable level for the character. Items the character can\'t afford are skipped.\n\nGo ahead?'
      : 'This will add a level-appropriate magic weapon or implement, magic armor and magic amulet to the character, and set the money to the amount for this level. Items the character already has are kept.\n\nGo ahead?';
    if(!confirm(msg)) return;
    const pick=a=>a[Math.floor(Math.random()*a.length)];
    const ok=e=>this.bookOk(e) && itemCost(e)>0 && !/cursed/i.test(e.name) && !/^Rare|Unique/.test(sp(e,'Rarity'));
    const mags=t=>(RULES.db.byType['Magic Item']||[]).map(id=>RULES.db.els[id]).filter(e=>ok(e) && sp(e,'Magic Item Type')===t);
    // the closest level at or below the wanted one that has something
    const atLevel=(list,lv)=>{ for(let l=Math.min(30,lv); l>=1; l--){ const a=list.filter(e=>(+sp(e,'Level')||0)===l); if(a.length) return a; } return []; };
    const plan=[];
    // 1. weapon or implement
    const implKinds=['Rod','Wand','Orb','Staff','Tome','Totem','Holy Symbol','Ki Focus'].filter(k=>this.st.names.has('implement proficiency ('+(k==='Ki Focus'?'ki focuses':k.toLowerCase())+')'));
    if(implKinds.length){
      const e=pick(atLevel(mags(pick(implKinds)),L+1)); if(e) plan.push({ids:[e.id], slot:'main'});
    } else {
      const ws=this.baseList('Weapon').filter(b=>this.profOk(b) && /melee|ranged/i.test(sp(b,'Weapon Category')));
      const base=this.st.wear.weapons[0] || pick(ws);
      const e=base && pick(atLevel(mags('Weapon').filter(m=>baseFits(m,base)),L+1)); if(e) plan.push({ids:[base.id,e.id], slot:'main'});
    }
    // 2. armor: what the character wears, otherwise the heaviest body armor they are proficient with
    // only armor that can take an enchantment of this level (superior armor needs a higher minimum)
    const body=this.baseList('Armor').filter(b=>!/shield/i.test(sp(b,'Armor Type')) && this.profOk(b) && minEnhancement(b)<=Math.ceil(L/5));
    body.sort((a,b)=>(+sp(b,'Armor Bonus')||0)-(+sp(a,'Armor Bonus')||0) || minEnhancement(b)-minEnhancement(a) || itemCost(b)-itemCost(a));
    const best=body[0];
    const worn=this.st.wear.body && minEnhancement(this.st.wear.body)<=Math.ceil(L/5) ? this.st.wear.body : null;
    const armor=worn || best;
    if(armor){ const e=pick(atLevel(mags('Armor').filter(m=>baseFits(m,armor)),L)); if(e) plan.push({ids:[armor.id,e.id], slot:'body'}); }
    // 3. amulet
    { const e=pick(atLevel(mags('Neck Slot Item'),Math.max(1,L-1))); if(e) plan.push({ids:[e.id], slot:'neck'}); }
    const done=[], skipped=[];
    for(const x of plan){
      const r=this.giveItem(x.ids,1,pay);
      if(!r){ skipped.push(itemName({ids:x.ids})); continue; }
      done.push(itemName({ids:x.ids}));
      ch.equip ||= {}; ch.equip[x.slot]=this._lastItem.uid;
      if(x.slot==='main' && twoHanded(this._lastItem)) delete ch.equip.off;
    }
    if(!pay){ ch.money=levelMoney(L); ch.stored=0; }
    this.shopMsg=(done.length ? (pay?'Bought and equipped: ':'Added and equipped: ')+done.join(', ')+'.' : 'Nothing was '+(pay?'bought':'added')+'.')
      + (skipped.length ? ' Not enough money for: '+skipped.join(', ')+'.' : '') + (!pay ? ' Money set to '+fmtMoney(ch.money)+'.' : '');
    this.changed();
  },

  /* ---------- your equipment ---------- */
  inventoryCard(){
    const S=this.shop, ch=this.ch, items=ch.items||[];
    const where={}; for(const [s,u] of Object.entries(ch.equip||{})) (where[u] ||= []).push(EQUIP_SLOTS.find(x=>x[0]===s)?.[1]||s);
    const total=items.reduce((a,it)=>a+itemWeight(it)*it.qty,0), str=this.st.stat('Strength');
    const load=total>str*20 ? 'over your heavy load (slowed)' : total>str*10 ? 'heavy load (slowed)' : 'normal load';
    const body=el('tbody');
    for(const it of items){
      const tr=el('tr',{class:'row'+(S.inv===it.uid?' on':'')},
        el('td',{}, el('span',{class:'term',dataset:{rid:itemParts(it).magic?.id||it.ids[0]},text:itemName(it)})),
        el('td',{class:'num',text:it.qty}), el('td',{class:'num',text:itemWeight(it)?(itemWeight(it)*it.qty)+' lb':'—'}),
        el('td',{class:'muted small',text:(where[it.uid]||[]).join(', ')}));
      tr.onclick=ev=>{ if(ev.target.closest('.term')) return; S.inv=S.inv===it.uid?null:it.uid; this.render(); };
      body.append(tr);
    }
    const sel=items.find(it=>it.uid===S.inv);
    const sell=pct=>{ const value=Math.floor(itemCost(itemParts(sel).magic||itemParts(sel).base)*pct/100);
      ch.money=(ch.money||0)+value; this.removeOne(sel); this.shopMsg=`Sold ${itemName(sel)} for ${fmtMoney(value)}.`; this.changed(); };
    const actions=el('div',{class:'brow wrap',style:'margin-top:8px'},
      el('span',{class:'muted small',text:sel?itemName(sel)+':':'Pick an item to sell or delete it.'}),
      sel ? [el('span',{class:'muted small',text:'Sell one at'}),
        ...[20,50,100].map(p=>el('button',{class:'btn small',type:'button',text:p+'%',title:`Sell for ${p}% of its price (${fmtMoney(Math.floor(itemCost(itemParts(sel).magic||itemParts(sel).base)*p/100))})`,onclick:()=>sell(p)})),
        el('button',{class:'btn small',type:'button',text:'Delete one',title:'Remove one without getting money for it',onclick:()=>{ this.removeOne(sel); this.changed(); }})] : null);
    return el('div',{class:'bcard wide'},
      el('div',{class:'stephead'}, el('h3',{text:'Your equipment'}), el('span',{class:'muted small',text:`${total} lb · ${load} (Str ${str}: normal ${str*10} lb, heavy ${str*20} lb)`})),
      this.shopMsg ? el('p',{class:'lvlmsg',text:this.shopMsg}) : null,
      items.length ? el('table',{class:'shoptable'}, el('thead',{},el('tr',{},el('th',{text:'Item'}),el('th',{text:'Qty'}),el('th',{text:'Weight'}),el('th',{text:'Equipped'}))), body)
        : el('p',{class:'muted',text:'Nothing yet. Buy or add items above.'}),
      items.length ? actions : null);
  },
  removeOne(it){
    const ch=this.ch; it.qty--;
    if(it.qty<=0){ ch.items=ch.items.filter(x=>x!==it); for(const [s,u] of Object.entries(ch.equip||{})) if(u===it.uid) delete ch.equip[s]; this.shop.inv=null; }
  },

  /* ---------- equipped slots ---------- */
  equippedCard(){
    const ch=this.ch, items=ch.items||[]; ch.equip ||= {};
    const mainIt=items.find(x=>x.uid===ch.equip.main), twoH=mainIt && twoHanded(mainIt);
    const grid=el('div',{class:'equipgrid'});
    for(const [slot,label] of EQUIP_SLOTS){
      const fits=items.filter(it=>itemSlots(it).includes(slot));
      const cur=ch.equip[slot];
      const s=el('select',{'aria-label':label,disabled:(slot==='off' && twoH) || (!fits.length && !cur),class:fits.length?'can':'',title:fits.length?'':'Nothing in the inventory fits here'},
        el('option',{value:''}, slot==='off'&&twoH ? '(two-handed weapon)' : '—'),
        ...fits.map(it=>el('option',{value:it.uid,selected:it.uid===cur},itemName(it)+(it.qty>1?` (${it.qty})`:''))));
      s.onchange=()=>{
        const v=s.value;
        for(const [k,u] of Object.entries(ch.equip)) if(u===v && k!==slot){ const it=items.find(x=>x.uid===v); if(!(it && it.qty>1)) delete ch.equip[k]; }
        if(v) ch.equip[slot]=v; else delete ch.equip[slot];
        if(slot==='main' && v && twoHanded(items.find(x=>x.uid===v))) delete ch.equip.off;
        this.changed(); };
      grid.append(el('label',{text:label,class:fits.length?'':'off'}), s);
    }
    return el('div',{class:'bcard wide'}, el('h3',{text:'Equipped'}),
      el('p',{class:'muted small',text:'Armor, shields and magic items count toward the numbers on the sheet once they are equipped here.'}), grid);
  },

  /* ---------- rituals, alchemical formulas, martial practices ---------- */
  knownCards(kind){
    const S=this.shop, ch=this.ch, st=this.st, L=st.level;
    const listKey={rituals:'rituals',alchemy:'formulas',practices:'practices'}[kind];
    const known=(ch[listKey] ||= []);
    const label={rituals:'ritual',alchemy:'alchemical formula',practices:'martial practice'}[kind];
    const can={rituals:st.names.has('ritual caster'), alchemy:st.names.has('alchemist'), practices:st.names.has('practiced study')||st.names.has('practiced prodigy')}[kind];
    const need={rituals:'the Ritual Caster feat (or a class feature that grants it)', alchemy:'the Alchemist feat or theme', practices:'the Practiced Study feat'}[kind];
    // "free rituals" notes from the class or feats
    const free=[...st.granted.values()].flatMap(e=>e.rules.filter(([t,a])=>t==='textstring' && a.name==='Free Rituals').map(([,a])=>a.value))
      .filter(t=>kind==='practices' ? /practice/i.test(t) : kind==='alchemy' ? /alchemi/i.test(t) : !/practice|alchemi/i.test(t));
    const skillOk=e=>kind!=='practices' || SKILLS.filter(k=>new RegExp('\\b'+k+'\\b').test(sp(e,'Key Skill'))).some(k=>st.stat(k+' Trained')>0);
    // like the original, everything up to the character's level is listed; the feat and key skill are only reminders
    const why=e=>(+sp(e,'Level')||0)>L ? 'higher level than the character' : !this.bookOk(e) ? 'book not in this campaign' : '';
    const all=(RULES.db.byType['Ritual']||[]).map(id=>RULES.db.els[id]).filter(e=>ritualKind(e)===kind);
    const q=S.q.trim().toLowerCase();
    const rows=all.filter(e=>!known.includes(e.id) && (S.all || !why(e)) && (!q || e.name.toLowerCase().includes(q)))
      .sort((a,b)=>(+sp(a,'Level')||0)-(+sp(b,'Level')||0) || a.name.localeCompare(b.name));
    const nameCol={rituals:'Ritual',alchemy:'Formula',practices:'Practice'}[kind];
    const body=el('tbody');
    for(const e of rows.slice(0,400)){
      const w=why(e), price=itemCost(e);
      const tr=el('tr',{class:'row'+(S.rsel===e.id?' on':''),dataset:{id:e.id}},
        el('td',{class:'num',text:sp(e,'Level')}), el('td',{class:'num',text:price?fmtMoney(price):'—'}),
        el('td',{}, e.name, w?el('span',{class:'hb small',title:w,text:'HB'}):null),
        el('td',{class:'muted small'+(skillOk(e)?'':' noprof'),title:skillOk(e)?'':'Not trained in this skill',text:sp(e,'Key Skill')}),
        el('td',{class:'acts'},
          el('button',{class:'btn small',type:'button',disabled:price>(ch.money||0),title:price>(ch.money||0)?'Not enough money':'Pay its market price',text:'Buy',onclick:ev=>{ ev.stopPropagation(); ch.money=(ch.money||0)-price; known.push(e.id); this.shopMsg=`Learned ${e.name} for ${fmtMoney(price)}.`; this.changed(); }}),
          el('button',{class:'btn small',type:'button',title:'Learn it for free (a class or feat gives it, or you found it)',text:'Add',onclick:ev=>{ ev.stopPropagation(); known.push(e.id); this.shopMsg=`Added ${e.name}.`; this.changed(); }})));
      tr.onclick=()=>{ if(this.dbl(e.id)){ known.push(e.id); S.rsel=e.id; this.shopMsg=`Added ${e.name}.`; this.changed(); return; } S.rsel=e.id; this.render(); };
      body.append(tr);
    }
    const search=el('input',{type:'search',placeholder:'Search…',value:S.q,'aria-label':'Search'});
    search.oninput=()=>{ S.q=search.value; clearTimeout(this._sq); this._sq=setTimeout(()=>{ this.render(); const s=document.querySelector('.shopsearch input'); if(s){ s.focus(); s.setSelectionRange(s.value.length,s.value.length); } },200); };
    // left: what the character knows
    const knownCol=el('div',{class:'knowncol',dataset:{keep:'known:'+kind}},
      el('h4',{class:'lvlhead',text:{rituals:'Your rituals',alchemy:'Your formulas',practices:'Your practices'}[kind]}),
      !can ? el('p',{class:'warn small',text:`Needs ${need}.`+(kind==='practices'?' Each practice also needs training in its key skill.':'')}) : null,
      ...free.map(t=>el('p',{class:'muted small',text:t.replace(/^\*\s*/,'')})),
      this.shopMsg ? el('p',{class:'lvlmsg small',text:this.shopMsg}) : null,
      known.length ? el('div',{class:'knownlist'}, ...known.map(id=>{ const e=RULES.db.els[id]; if(!e) return null; const w=why(e);
        return el('div',{class:'knownrow'+(S.rsel===id?' on':''),onclick:()=>{ S.rsel=id; this.render(); }},
          el('span',{text:e.name}), w?el('span',{class:'hb small',title:w,text:'HB'}):null,
          el('button',{class:'x',type:'button','aria-label':'Remove '+e.name,title:'Remove (no refund)',text:'×',onclick:ev=>{ ev.stopPropagation(); ch[listKey]=known.filter(x=>x!==id); this.changed(); }})); }))
        : el('p',{class:'muted small',text:`No ${label}s yet.`}));
    // right: the selected one's description
    const detail=el('div',{class:'shopdetail',dataset:{keep:'rdetail:'+(S.rsel||'')}});
    const sel=S.rsel && RULES.db.els[S.rsel];
    if(sel && ritualKind(sel)===kind){
      // a known alchemical formula: make its items (components cost the item's market price; 30 minutes each)
      if(kind==='alchemy' && known.includes(sel.id)){
        const vars=String(sp(sel,'_RELATED_ITEMS')).split(',').map(x=>RULES.db.els[x.trim()]).filter(Boolean)
          .sort((a,b)=>(+sp(a,'Level')||0)-(+sp(b,'Level')||0));
        if(vars.length) detail.append(el('div',{class:'makebox'},
          el('h4',{class:'lvlhead',text:'Make'}),
          !can ? el('p',{class:'warn small',text:'Making alchemical items needs the Alchemist feat or theme.'}) : null,
          ...vars.map(v=>{ const lv=+sp(v,'Level')||0, price=itemCost(v), hi=lv>L;
            return el('div',{class:'brow makerow'},
              el('span',{class:'grow',text:v.name}), el('span',{class:'muted small',text:fmtMoney(price)}),
              el('button',{class:'btn small',type:'button',disabled:!can||hi||price>(ch.money||0),
                title:hi?'Higher level than the character':price>(ch.money||0)?'Not enough money for the components':'Pay for the components ('+fmtMoney(price)+') and add the item',
                text:'Make',onclick:()=>{ this.shopMsg=this.giveItem([v.id],1,true).replace(/^Bought/,'Made'); this.changed(); }})); })));
      }
      const box=el('div',{class:'entry shopentry'}); this.renderElement(box,sel.id); detail.append(box); }
    else detail.append(el('p',{class:'muted pad',text:`Pick a ${label} to read it here.`}));
    return [el('div',{class:'bcard wide'},
      el('div',{class:'stephead'}, el('h3',{text:{rituals:'Rituals',alchemy:'Alchemical formulas',practices:'Martial practices'}[kind]}),
        el('label',{class:'chk',title:`Also list ${label}s above the character's level or from books not in the campaign. They are marked HB.`},
          el('input',{type:'checkbox',checked:S.all,onchange:e=>{ S.all=e.target.checked; this.render(); }}),' Show everything available')),
      el('div',{class:'brow shopsearch'}, search, el('span',{class:'muted small',text:rows.length+' listed'})),
      el('div',{class:'shopgrid'}, knownCol,
        el('div',{class:'shopcenter'}, el('div',{class:'shoplist',dataset:{keep:'rlist:'+kind}},
          rows.length ? el('table',{class:'shoptable'}, el('thead',{},el('tr',{},el('th',{class:'r',text:'Lvl'}),el('th',{class:'r',text:'Price'}),el('th',{text:nameCol}),el('th',{text:'Key skill'}),el('th',{}))), body)
            : el('p',{class:'muted pad',text: S.all ? 'Nothing found.' : `Nothing the character can learn right now. Tick “Show everything available” to see all ${label}s.`}))),
        detail))];
  },
});
