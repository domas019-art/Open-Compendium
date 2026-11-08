/* ---------- monster math: older monsters with the newer (Monster Manual 3) numbers ----------
   One engine for everything that needs a monster's numbers: the compendium's switch now, DM tools later.
   MonsterMath.update(cat, id) -> {record, html, changes} or null when nothing changes.
     record:  level, group (Standard / Elite / Solo / Minion), role, brute, and each attack with its damage
              as printed and as updated (dice, average, why)
     html:    the entry with the updated numbers, for the screen
     changes: one line per change ("Claw: 1d6 + 3 -> 2d8 + 4"), so it is always clear what was calculated
   The rules are tables in the core library (applyCore fills MONSTER_MATH): nothing here is a game number.
   - damage: the Dungeon Master's Kit damage by level (one target, or two or more for close and area attacks),
     x Brute factor for brutes, x Limited factor for encounter and recharge powers; minions deal a flat share
   - an attack that dealt less than the original table's value for its kind (usually because of an effect)
     keeps that cut, never more than Effect Floor below
   - elites and solos from books before Monster Manual 2: the defenses that carry the old +2 lose it
   - solos built with the old x5 hit points get the newer x4 (8 + 8 per level + Constitution score, x4)
   Only the older stat block layout is changed: newer monsters already use these numbers. */
let MONSTER_MATH=null;   // from the core library

const MonsterMath={
  _cache:new Map(),
  // damage expression helpers
  avg(d){ return d.n*(d.s+1)/2+d.b; },
  parse(e){ const m=/^(\d+)d(\d+)(?:\+(\d+))?$/.exec(String(e).replace(/\s+/g,'')); return m?{n:+m[1],s:+m[2],b:+(m[3]||0)}:null; },
  fmt(d){ return d.n+'d'+d.s+(d.b>0?' + '+d.b:d.b<0?' − '+(-d.b):''); },
  lv(level){ return Math.max(1,Math.min(30,+level||1)); },
  // the newer table: the value for one target or for two or more
  newDice(level,multi){ const t=MONSTER_MATH[multi?'multi':'single']; return this.parse(t[this.lv(level)-1]); },
  // the original Dungeon Master's Guide table, by column (0 low, 1 medium, 2 high; +3 for limited)
  oldAvg(level,col){ const L=this.lv(level); const b=MONSTER_MATH.oldBands.findIndex(([lo,hi])=>L>=lo&&L<=hi); return this.avg(this.parse(MONSTER_MATH.oldCols[col][b])); },

  update(cat,id){
    if(!MONSTER_MATH || cat!=='monster') return null;
    const key=id; if(this._cache.has(key)) return this._cache.get(key);
    const c=lib.monster, html=c && c.data[id]; let res=null;
    if(html && !/class=bodytable/.test(html)){ const row=c.rows.find(r=>r[0]===id); res=this.compute(html,row,c.cols); }
    this._cache.set(key,res); return res;
  },
  reset(){ this._cache.clear(); },

  compute(html,row,cols){
    const col=k=>row?String(row[cols.indexOf(k)]??''):'';
    const lvlM=/Level (\d+)/.exec(html), level=+(col('Level')||lvlM?.[1]||1);
    const group=col('GroupRole')||'Standard', role=col('CombatRole').split(',')[0].trim();
    const rec={level, group, role, brute:role==='Brute', attacks:[]}, changes=[];
    const M=MONSTER_MATH;
    // each power: its heading line and the text under it, up to the next power or the end block
    let out=html.replace(/(<p class='flavor alt'>)(.*?)(<\/p>)((?:\s*<p class=flavorIndent>.*?<\/p>)*)/gs,(all,o,head,c2,body)=>{
      const name=(/<b>([^<]+)<\/b>/.exec(head)||[])[1]||'';
      if(!name || /^(Alignment|Skills|Str|Con|Equipment)$/.test(name.trim())) return all;
      const use=(/<\/b>\s*\(([^)<]*)/.exec(head)||[])[1]||'';
      const limited=/encounter|recharge|daily/i.test(use) && !/at-will/i.test(use);
      let changedBody=body.replace(/(vs\.?\s*(?:AC|Fortitude|Reflex|Will)\s*[;,]\s*)([^.<]*)/g,(m0,lead,clause)=>{
        const r=this.clause(clause,{name,level,group,brute:rec.brute,limited,multi:/\b(close|area)\s+(burst|blast|wall)\b|\bburst \d|\bblast \d/i.test(body)});
        if(!r) return m0;
        rec.attacks.push(r.attack); changes.push(r.change);
        return lead+r.text;
      });
      // the later older layout: "Attack: ... vs. AC" and the damage on its own "Hit:" line
      changedBody=changedBody.replace(/(<i>Hit:<\/i>\s*)([^<]*?)(?=\.\s*<|<|$)/g,(m0,lead,clause)=>{
        const r=this.clause(clause,{name,level,group,brute:rec.brute,limited,multi:/\b(close|area)\s+(burst|blast|wall)\b|\bburst \d|\bblast \d/i.test(body)});
        if(!r) return m0;
        rec.attacks.push(r.attack); changes.push(r.change);
        return lead+r.text;
      });
      return o+head+c2+changedBody;
    });
    // elites and solos from before Monster Manual 2: the defenses that carry the old elite/solo +2
    const books=col('SourceBook').split(',').map(s=>s.trim()).filter(Boolean);
    const preMM2=books.length && books.every(b=>M.preMM2.some(x=>b===x || b.startsWith(x+' ')));   // "DDN 2008-10 Tower of Maraj"
    if((group==='Elite'||group==='Solo') && preMM2){
      out=out.replace(/(<b>AC<\/b>\s*)(\d+)((?:\s*\([^)]*\))?[;,]\s*<b>Fortitude<\/b>\s*)(\d+)((?:\s*\([^)]*\))?,\s*<b>Reflex<\/b>\s*)(\d+)((?:\s*\([^)]*\))?,\s*<b>Will<\/b>\s*)(\d+)/,(m0,a,ac,b,f,c3,r,d,w)=>{
        // only the defenses 2 or more above the role's value
        const base=[M.baseAC[role]??14,M.baseNAD,M.baseNAD,M.baseNAD];
        const n=[ac,f,r,w].map((x,i)=>+x-level-base[i]>=-M.eliteDefense ? +x+M.eliteDefense : +x);
        if(n.every((x,i)=>x===+[ac,f,r,w][i])) return m0;
        changes.push(`Defenses: AC ${ac}, Fortitude ${f}, Reflex ${r}, Will ${w} → AC ${n[0]}, Fortitude ${n[1]}, Reflex ${n[2]}, Will ${n[3]}`);
        rec.defenses={ac:n[0],fortitude:n[1],reflex:n[2],will:n[3]};
        return a+n[0]+b+n[1]+c3+n[2]+d+n[3];
      });
    }
    // solos, from any book: one built with the old x5 hit points gets the newer x4
    // (Base + Per Level x level + Constitution score); one already at x4 or below stays as printed
    const [hb,hl,hNew,hOld]=M.soloHp||[];
    const con=+((/<b>Con<\/b>\s*(\d+)/.exec(html)||[])[1]||0);
    if(group==='Solo' && hNew && hOld && con){
      const unit=hb+hl*level+con;
      out=out.replace(/(<b>HP<\/b>\s*)([\d,]+)(;\s*<b>Bloodied<\/b>\s*)([\d,]+)/,(m0,a,hpS,b)=>{
        const hp=+hpS.replace(/,/g,''), n=unit*hNew;
        if(hp < unit*(hNew+hOld)/2) return m0;            // closer to x4 than to x5: already the newer standard
        changes.push(`Hit points: ${hpS} → ${n}`); rec.hp=n;
        return a+n+b+Math.floor(n/2);
      });
    }
    if(!changes.length) return {record:rec, html:null, changes:[]};
    return {record:rec, html:out, changes};
  },

  // one attack's damage: "2d6 + 4 damage plus 1d6 fire damage, and ..." or a minion's "5 damage"
  clause(text,p){
    const M=MONSTER_MATH, L=p.level, multi=p.multi;
    const dice=[...text.matchAll(/(\d+)d(\d+)(?:\s*\+\s*(\d+))?/g)].filter(m=>!/crit(?:ical)?(?: hit)?:?\s*$/i.test(text.slice(Math.max(0,m.index-14),m.index)));   // not the critical-hit dice
    if(!dice.length){
      // a minion: a flat number before "damage"
      const fm=p.group==='Minion' && /^\s*(\d+)(\s+(?:[a-z]+\s+)?damage)/i.exec(text);
      if(!fm) return null;
      let v=Math.max(+fm[1],Math.round(this.avg(this.newDice(L,false))*M.minion*(p.brute?M.brute:1)));
      if(v===+fm[1]) return null;
      return {text:text.replace(/\d+/,String(v)), attack:{power:p.name,from:fm[1],to:String(v),avgFrom:+fm[1],avgTo:v},change:`${p.name}: ${fm[1]} → ${v} damage`};
    }
    // the main expression is the first. Extra dice in the same hit ("plus 1d6 fire") stay as they are and count
    // toward the total; an alternative ("or 3d6 + 9 if bloodied") moves by the same amount as the main one
    const main=dice[0], d0={n:+main[1],s:+main[2],b:+(main[3]||0)};
    const before=m=>text.slice(Math.max(0,m.index-12),m.index), after=m=>text.slice(m.index,m.index+60);
    const extraM=dice.slice(1).filter(m=>/plus\s*$/i.test(before(m)) && !/extra\s*$/i.test(before(m)));
    const altM=dice.slice(1).filter(m=>/\bor\s*$/i.test(before(m)) && !/critical/i.test(after(m)));
    const extras=extraM.reduce((t,m)=>t+this.avg({n:+m[1],s:+m[2],b:+(m[3]||0)}),0);
    const oldTotal=this.avg(d0)+extras;
    const base=this.newDice(L,multi);
    let target=this.avg(base)*(p.brute?M.brute:1)*(p.limited?M.limited:1);
    // an attack that was below the original table for its kind keeps that cut (at most Effect Floor)
    const oldKind=this.oldAvg(L,(p.limited?3:0)+(multi?0:1));
    const cut=Math.max(M.effectFloor,Math.min(1,oldTotal/oldKind));
    target*=cut;
    target=Math.max(target,oldTotal);      // never lower: Wizards' own updates kept damage that was already above the table
    // the main expression uses the table's dice; its bonus makes up the rest of the total
    const nd={n:base.n,s:base.s,b:0}; nd.b=Math.round(target-extras-this.avg(nd));
    if(nd.b<0){ nd.n=d0.n; nd.s=d0.s; nd.b=Math.max(0,Math.round(target-extras-this.avg({n:d0.n,s:d0.s,b:0}))); }
    const from=main[0], to=this.fmt(nd);
    if(this.fmt(d0)===to || this.avg(nd)<=this.avg(d0)+0.5) return null;      // no real increase: keep it as printed
    const delta=Math.round(this.avg(nd)-this.avg(d0));
    // rewrite from the end so the positions stay right
    let out=text;
    for(const m of [...altM].reverse()){ const d={n:+m[1],s:+m[2],b:Math.max(0,+(m[3]||0)+delta)}; out=out.slice(0,m.index)+this.fmt(d)+out.slice(m.index+m[0].length); }
    out=out.slice(0,main.index)+to+out.slice(main.index+from.length);
    return {text:out,
      attack:{power:p.name,from,to,avgFrom:oldTotal,avgTo:this.avg(nd)+extras,mainTo:this.avg(nd),multi,limited:p.limited,cut:+cut.toFixed(2)},
      change:`${p.name}: ${from.replace(/\s*\+\s*/,' + ')} → ${to}`};
  }
};
