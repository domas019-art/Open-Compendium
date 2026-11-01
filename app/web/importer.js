"use strict";
/* =====================================================================
   Import characters saved by the original Character Builder (.dnd4e).

   A .dnd4e file contains:
   - <Level> blocks: the tree of choices. Each element's children are what
     it granted or what was picked for its selections, in order.
     Empty picks appear as nameless elements. House-rule extras are in <UserEdit>.
   - <StatBlock>: every final number with its parts, each tagged with the
     level it was gained at. From that we work out the level 1 numbers
     (without equipment) to compare against ours.
   ===================================================================== */

const COMPARE_STATS=['Hit Points','Healing Surges','AC','Fortitude Defense','Reflex Defense','Will Defense','Initiative','Speed',
  ...ABILITIES, ...SKILLS];

function importDnd4e(text){
  const db=RULES.db; if(!db) throw new Error('Load the builder data first.');
  // the original's campaign restriction list can contain names that aren't valid XML; it isn't needed here
  text=text.replace(/<Restricted>[\s\S]*?<\/Restricted>/g,'<Restricted/>');
  const doc=new DOMParser().parseFromString(text,'application/xml');
  const root=doc.documentElement;
  if(!root || root.tagName!=='D20Character') throw new Error('This is not a Character Builder save file.');
  const kids=(n,tag)=>[...n.children].filter(c=>c.tagName===tag);
  const sheet=kids(root,'CharacterSheet')[0];
  const det=sheet && kids(sheet,'Details')[0];
  const txt=(n,tag)=>((n && kids(n,tag)[0]?.textContent)||'').trim();

  const ch=newChar(); ch.campaign={name:'All books', books:null};
  ch.name=txt(det,'name')||'Imported character';
  const savedLevel=Math.min(30,+txt(det,'Level')||1);
  // optional details are stored in the <Grabbag> section
  const bag=[...root.children].find(c=>c.tagName==='Grabbag');
  const bagIds=new Set(bag ? [...bag.querySelectorAll('grant')].map(g=>g.getAttribute('name')) : []);
  ch.details={}; for(const o of OPTIONAL_DETAILS) if(bagIds.has(o.id)) ch.details[o.key]=true;
  ch.level=savedLevel; ch.xp=+txt(det,'Experience')||0;
  const abil=sheet && kids(sheet,'AbilityScores')[0];
  if(abil) for(const a of abil.children) if(ABILITIES.includes(a.tagName)) ch.abilities[a.tagName]=+a.getAttribute('score')||10;
  // which method fits these scores?
  const sorted=ABILITIES.map(a=>ch.abilities[a]).sort((x,y)=>y-x).join();
  const ai=ARRAYS.findIndex(arr=>arr.join()===sorted);
  if(ai>=0){ ch.method='array'; ch.arrayIdx=ai; }
  else{ const pb=pointBuy(ch.abilities); ch.method = !pb.bad && pb.cost===22 ? 'points' : 'manual'; }

  const picks=ch.picks, hb=ch.hb, missing=new Set();
  const isHouse=n=>n.getAttribute('legality')==='houserule';

  // Walk the choice tree: children that the element doesn't grant itself were picked for one of its selections.
  function walk(node){
    const id=node.getAttribute('internal-id'), def=db.els[id];
    const children=kids(node,'RulesElement');
    if(!def){ if(id) missing.add(node.getAttribute('name')||id); return; }
    const grants=new Set(def.rules.filter(r=>r[0]==='grant').map(r=>r[1].name));
    const used={};
    for(const c of children){
      const cid=c.getAttribute('internal-id'); if(!cid) continue;          // an empty pick
      if(grants.has(cid)){ walk(c); continue; }
      const ctype=c.getAttribute('type');
      let idx=-1;
      def.rules.forEach(([tag,a],i)=>{ if(idx<0 && tag==='select' && a.type===ctype && (used[i]||0)<Math.max(1,+(a.number||1))) idx=i; });
      if(idx<0){ walk(c); continue; }                                       // granted in some other way
      const key=id+'#'+idx;
      (picks[key] ||= []).push(cid); used[idx]=(used[idx]||0)+1;
      if(isHouse(c)) hb[key+'|'+cid]=1;
      if(!db.els[cid]) missing.add(c.getAttribute('name')||cid);
      walk(c);
    }
  }
  const levels=kids(root,'Level');
  if(!levels.length) throw new Error('No choices found in this file.');
  const lv1=levels[0];
  for(const L of levels) for(const top of kids(L,'RulesElement')) walk(top);
  // house-rule extras (the original's "add another choice" button), on any level
  for(const ue of levels.flatMap(L=>kids(L,'UserEdit'))){
    const type=ue.querySelector('select')?.getAttribute('type')||'Feat';
    for(const holder of kids(ue,'RulesElement')) for(const c of kids(holder,'RulesElement')){
      const cid=c.getAttribute('internal-id'); if(!cid) continue;
      const uid=Math.random().toString(36).slice(2,8);
      (ch.extra[type] ||= []).push(uid);
      picks['extra:'+type+':'+uid]=[cid]; hb['extra:'+type+':'+uid+'|'+cid]=1;
      if(!db.els[cid]) missing.add(c.getAttribute('name')||cid);
      walk(c);
    }
  }
  // Some selections only exist under conditions; move picks to the selection that is actually open.
  for(let pass=0; pass<4; pass++){
    const st=evaluate(ch), live=new Set(st.slots.map(s=>s.key));
    let moved=false;
    for(const key of Object.keys(picks)){
      if(live.has(key) || key.startsWith('extra:')) continue;
      const owner=key.split('#')[0]; if(!st.granted.has(owner)) continue;
      for(const pid of picks[key]){
        const t=db.els[pid]?.type;
        const s=st.slots.find(s=>s.owner===owner && s.type===t && (picks[s.key]||[]).length<s.number && !(picks[s.key]||[]).includes(pid));
        if(s){ (picks[s.key] ||= []).push(pid); if(hb[key+'|'+pid]){ hb[s.key+'|'+pid]=1; delete hb[key+'|'+pid]; } moved=true; }
      }
      delete picks[key];
    }
    if(!moved) break;
  }

  // equipment and money
  const loot=sheet ? [...sheet.querySelectorAll('LootTally > loot, loot')] : [];
  const seenLoot=new Set(), wornCharelems=new Set();
  ch.items=[]; ch.equip={};
  for(const l of loot){
    if(seenLoot.has(l)) continue; seenLoot.add(l);
    const qty=+l.getAttribute('count')||0; if(qty<=0) continue;
    const parts=kids(l,'RulesElement'); const ids=parts.map(r=>r.getAttribute('internal-id')).filter(id=>id && db.els[id]);
    parts.forEach(r=>{ if(r.getAttribute('internal-id') && !db.els[r.getAttribute('internal-id')]) missing.add(r.getAttribute('name')); });
    if(!ids.length) continue;
    ids.sort((a,b)=>(db.els[a].type==='Magic Item')-(db.els[b].type==='Magic Item'));   // base item first
    const it={uid:Math.random().toString(36).slice(2,9), ids, qty};
    ch.items.push(it);
    if((+l.getAttribute('equip-count')||0)>0){
      const free=itemSlots(it).find(s=>!ch.equip[s] && !(s==='off' && ch.equip.main && twoHanded(ch.items.find(x=>x.uid===ch.equip.main))));
      if(free){ ch.equip[free]=it.uid; parts.forEach(r=>wornCharelems.add(r.getAttribute('charelem'))); }
    }
  }
  const q=t=>(sheet?.querySelector(t)?.textContent||'').trim();
  // the text on the original's Details and Information pages
  ch.info={player:txt(det,'Player'), height:txt(det,'Height'), weight:txt(det,'Weight'), age:txt(det,'Age'), company:txt(det,'Company'),
    traits:txt(det,'Traits'), appearance:txt(det,'Appearance'), companions:txt(det,'Companions'), notes:txt(det,'Notes')};
  // the beast companion's name and description, saved as "Glock - Level 3 Forest Owl"
  const beast=(sheet?.querySelector('Companions > Beast > ID')?.textContent||'').trim();
  const bm=/^(?:(.*?)\s+-\s+)?Level\s+\d+\s+(.*)$/.exec(beast);
  if(bm) ch.companionInfo={_import:{name:(bm[1]||'').trim(), desc:(bm[2]||'').trim()}};
  const por=txt(det,'Portrait');      // a picture file on this computer, e.g. file://C:\Users\...\Slayer.jpg
  // the picture is looked for in the portraits folder by its file name; the original place is kept as a fallback
  if(por){ ch.portraitPath=por.replace(/^file:\/\/(?!\/)/i,'file:///').replace(/\\/g,'/'); ch.portrait=ch.portraitPath.split('/').pop(); }
  ch.coins={carried:parseCoins(q('CarriedMoney')), banked:parseCoins(q('StoredMoney'))};
  ch.money=coinTotal(ch.coins.carried); ch.stored=coinTotal(ch.coins.banked);
  ch.importInfo={file:'', savedLevel, legality:root.getAttribute('legality')||'', compare:oldStats(sheet,levels,savedLevel,wearContext(ch),wornCharelems), later:[], missing:[...missing]};
  return ch;
}

/* The original builder's numbers at the character's level, without equipment:
   add up the parts of each stat, leaving out anything that comes from items. */
function oldStats(sheet,levels,maxL,wear,worn){
  const out={}; if(!sheet) return out;
  const block=[...sheet.children].find(c=>c.tagName==='StatBlock'); if(!block) return out;
  const tally=new Set();
  levels.forEach(L=>L.querySelectorAll('RulesElement').forEach(e=>{ const id=e.getAttribute('internal-id'); if(id){ tally.add(id); tally.add((e.getAttribute('name')||'').toLowerCase()); } }));
  const loot=new Set(); sheet.querySelectorAll('loot RulesElement').forEach(e=>loot.add(e.getAttribute('charelem')));
  const stats={};
  for(const s of block.children){ if(s.tagName!=='Stat') continue; for(const a of s.children) if(a.tagName==='alias') stats[a.getAttribute('name').toLowerCase()]=s; }
  const atom=a=>{ a=a.trim(); const m=/^(\d+)\s*level$/i.exec(a); if(m) return +m[1]<=maxL;
    if(/^heroic tier$/i.test(a)) return maxL<11; if(/^paragon tier$/i.test(a)) return maxL>=11&&maxL<21; if(/^epic tier$/i.test(a)) return maxL>=21;
    return tally.has(a) || tally.has(a.toLowerCase()); };
  const req=r=>r.split(',').every(p=>{ p=p.trim(); const neg=p[0]==='!'; if(neg) p=p.slice(1); const v=p.split('|').some(atom); return neg?!v:v; });
  const cache={};
  const val=(n,d=0)=>{
    n=n.toLowerCase(); if(n in cache) return cache[n];
    const s=stats[n]; if(!s || d>40) return 0;
    let sum=0; const typed={};
    for(const a of s.children){
      if(a.tagName!=='statadd') continue;
      if(+(a.getAttribute('Level')||0)>maxL) continue;
      if(a.getAttribute('conditional')) continue;
      if(a.getAttribute('wearing') && !(wear && wear.ok(a.getAttribute('wearing')))) continue;
      if(a.getAttribute('not-wearing') && wear && wear.ok(a.getAttribute('not-wearing'))) continue;
      if(loot.has(a.getAttribute('charelem')) && !(worn && worn.has(a.getAttribute('charelem')))) continue;   // items carried but not worn
      const r=a.getAttribute('requires'); if(r && !req(r)) continue;
      let v=+a.getAttribute('value');
      const link=a.getAttribute('statlink');
      if(link){ let x=val(link,d+1); if(a.getAttribute('abilmod')==='true') x=Math.floor((x-10)/2); v=v*x; }
      const t=a.getAttribute('type');
      if(t) typed[t]= t in typed ? Math.max(typed[t],v) : v; else sum+=v;
    }
    for(const v of Object.values(typed)) sum+=v;
    return cache[n]=Math.floor(sum);
  };
  for(const n of COMPARE_STATS) if(stats[n.toLowerCase()]) out[n]=val(n);
  return out;
}
