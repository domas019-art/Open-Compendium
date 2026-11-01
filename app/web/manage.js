"use strict";
/* =====================================================================
   Manage: Details | Level Up | Portrait | Information | Journal | Companion | Summary | Campaign Settings
   Like the original Character Builder's Manage section.
   ===================================================================== */

const MANAGE_TABS=[['details','Details'],['levelup','Level Up'],['portrait','Portrait'],['info','Information'],['journal','Journal'],
  ['companion','Companion'],['summary','Summary'],['campaign','Campaign Settings']];
const INFO_FIELDS=[['traits','Personality Traits'],['appearance','Mannerisms and Appearance'],['companions','Companions and Allies'],['notes','Session and Campaign Notes']];
const PLAYER_KEY='open-compendium-player';

Object.assign(Builder,{
  mtab:'details',

  manageStep(){
    const ch=this.ch; ch.info ||= {}; ch.journal ||= [];
    const nav=el('nav',{class:'steps'});
    for(const [k,label] of MANAGE_TABS){
      const n=k==='companion' ? this.openIn('companion') : 0;
      nav.append(el('button',{type:'button',class:'step'+(this.mtab===k?' on':''),onclick:()=>{ this.mtab=k; this.render(); }},label, n?el('span',{class:'need',text:n}):null));
    }
    const body={details:()=>this.detailsTab(), levelup:()=>this.levelUpTab(), portrait:()=>this.portraitTab(), info:()=>this.infoTab(),
      journal:()=>this.journalTab(), companion:()=>this.companionTab(), summary:()=>this.summaryTab(), campaign:()=>[this.campaignCard()]}[this.mtab]();
    return [nav, ...body];
  },
  // typing in a text field saves without redrawing the screen (so the cursor stays where it is)
  softChange(){ this.dirty=true; clearTimeout(this.saveTimer); this.saveTimer=setTimeout(()=>this.persist(),500); },
  field(obj,key,label,opts={}){
    const i=el(opts.area?'textarea':'input',{type:opts.area?null:'text',value:obj[key]||'',placeholder:opts.ph||'','aria-label':label,class:opts.area?'infoarea':'detin'});
    if(opts.area) i.value=obj[key]||'';
    i.oninput=()=>{ obj[key]=i.value; if(opts.after) opts.after(i.value); this.softChange(); };
    return i;
  },

  /* ---------- Details ---------- */
  detailsTab(){
    const ch=this.ch, info=ch.info, st=this.st;
    const race=[...st.granted.values()].find(e=>e.type==='Race');
    const slot=t=>st.slots.find(s=>s.type===t);
    const row=(label,...kids)=>el('div',{class:'detrow'}, el('label',{text:label}), el('div',{class:'detval'},...kids));
    const name=this.field(ch,'name','Name',{after:()=>{ const h=document.querySelector('#bSheet .shead h2'); if(h) h.textContent=ch.name||'Unnamed'; }});
    const randomName=()=>{
      if(!race) return alert('Choose a race first: names come from the race.');
      const g=(slot('Gender') && RULES.db.els[this.picksOf(slot('Gender'))[0]]?.name)||'';
      const list=s=>(sp(race,s)||'').replace(/\.\s*$/,'').split(/,\s*/).map(x=>x.trim()).filter(Boolean);
      const names=/female/i.test(g) ? list('Female Names') : /male/i.test(g) ? list('Male Names') : [...list('Male Names'),...list('Female Names'),...list('Names')];
      if(!names.length) return alert('The race has no name list.');
      ch.name=names[Math.floor(Math.random()*names.length)]; this.changed(); };
    const remember=el('input',{type:'checkbox',checked:(()=>{ try{ return !!localStorage.getItem(PLAYER_KEY); }catch(e){ return false; } })()});
    remember.onchange=()=>{ try{ if(remember.checked) localStorage.setItem(PLAYER_KEY,info.player||''); else localStorage.removeItem(PLAYER_KEY); }catch(e){} };
    const pick=t=>{ const s=slot(t); return s ? this.slotRow(s) : el('span',{class:'muted small',text: t==='Deity'?'Choose a class first.':'—'}); };
    return [el('div',{class:'bcard'}, el('h3',{text:'Character details'}),
      el('div',{class:'detgrid'},
        row('Name', name, el('button',{class:'btn small',type:'button',text:'Random Name',title:'A name from the race\'s list (by gender, if chosen)',onclick:randomName})),
        row('Gender', pick('Gender')),
        row('Alignment', pick('Alignment')),
        row('Deity', pick('Deity')),
        row('Height', this.field(info,'height','Height',{ph:race?Units.text(sp(race,'Average Height')):''})),
        row('Weight', this.field(info,'weight','Weight',{ph:race?Units.text(sp(race,'Average Weight'),'weight'):''})),
        row('Age', this.field(info,'age','Age'))),
      el('div',{class:'detgrid',style:'margin-top:14px'},
        row('Adventuring Company', this.field(info,'company','Adventuring Company')),
        row('Player Name', this.field(info,'player','Player Name',{after:v=>{ if(remember.checked) try{ localStorage.setItem(PLAYER_KEY,v); }catch(e){} }}))),
      el('label',{class:'chk small',style:'margin-top:8px'}, remember, ' Remember player name for new characters'))];
  },

  /* ---------- Level Up ---------- */
  levelUpTab(){
    const st=this.st, problems=[];
    if(this.abilityProblem && this.abilityProblem()) problems.push({text:'The ability scores are not legal by the chosen method ('+({array:'standard array',points:'point buy',manual:'entered by hand'}[this.ch.method]||this.ch.method)+').'});
    for(const s of st.slots) for(const id of this.picksOf(s)){ const w=this.hbWhy(s,id); if(w) problems.push({text:`House rule: ${RULES.db.els[id]?.name||id} (${w}).`, slot:s, id}); }
    const status=el('div',{class:'bcard'}, el('h3',{text:'Character status'}),
      problems.length ? el('ul',{class:'statuslist'}, ...problems.map(p=>el('li',{text:p.text}))) : el('p',{class:'muted',text:'Everything follows the rules and the campaign books.'}),
      problems.some(p=>p.slot) ? el('button',{class:'btn small',type:'button',text:'Erase house rules',title:'Remove every house-rule choice and extra slot',onclick:()=>{
        if(!confirm('Remove all house-rule choices (marked HB) and extra house-rule slots from this character?')) return;
        const ch=this.ch;
        for(const p of problems) if(p.slot){ ch.picks[p.slot.key]=(ch.picks[p.slot.key]||[]).filter(x=>x!==p.id); delete ch.hb[p.slot.key+'|'+p.id]; }
        for(const t of Object.keys(ch.extra||{})){ for(const u of ch.extra[t]) delete ch.picks['extra:'+t+':'+u]; ch.extra[t]=[]; }
        this.changed(); }}) : null);
    return [...this.levelUpCards(), status];
  },

  /* ---------- Portrait ---------- */
  portraitTab(){
    const ch=this.ch, P=Portraits.of(ch);
    const put=async f=>{
      if(!f || !isPicture(f)) return;
      const k=await Portraits.keep(f,640);
      ch.portrait=k.name; ch.portraitData=k.data; delete ch.portraitPath; ch.portraitBlank=false;
      ch.portraitColor=await Portraits.colourOf(f)||'';
      this.changed();
    };
    const choose=async n=>{ ch.portrait=n; delete ch.portraitPath; delete ch.portraitData; ch.portraitBlank=false;
      ch.portraitColor=await Portraits.colourOf(Portraits.path(n))||'';
      this.changed(); };
    // the colour of the frame and ornament on the sheet: taken from the picture, or chosen
    const fc=frameColour(ch);
    const colIn=el('input',{type:'color',value:fc||'#8f2a3a','aria-label':'Frame colour'});
    colIn.oninput=()=>{ ch.portraitColorUser=colIn.value; this.softChange(); document.querySelector('#bSheet .shead')?.style.setProperty('--pcol',colIn.value); };
    colIn.onchange=()=>this.changed();
    const colRow=el('div',{class:'brow wrap'}, el('label',{class:'muted small',text:'Frame colour'}), colIn,
      el('span',{class:'muted small',text: ch.portraitColorUser ? 'chosen by you' : ch.portraitColor ? 'taken from the picture' : 'the app\'s colour'}),
      ch.portraitColorUser ? el('button',{class:'btn small',type:'button',text:'Use the picture\'s colour',onclick:async()=>{ delete ch.portraitColorUser; if(!ch.portraitColor) await Portraits.updateColour(ch); this.changed(); }}) : null);
    const input=el('input',{type:'file',accept:'image/*',hidden:true});
    input.onchange=()=>put(input.files[0]);
    const missing=el('div',{class:'pmissing',hidden:true},
      el('b',{text:`“${P.name}” is not in your portraits folder.`}),
      el('div',{class:'muted small',text: P.path ? `The original builder had it here: ${decodeURI(P.path.replace(/^file:\/\/\//,'')).replace(/\//g,'\\')}. Copy it into the portraits folder, or drag it onto this box.` : 'Copy it into the portraits folder, or drag it onto this box.'}));
    const pic=ch.portrait ? portraitImg(ch,'portraitmid',img=>{ img.remove(); missing.hidden=false; }) : null;
    const frame=el('div',{class:'pframe'}, pic || el('div',{class:'muted',text:'No portrait chosen.'}), missing,
      el('div',{class:'muted small droptip',text:'Drag a picture here'}));
    dropTarget(frame, put);
    const gallery=el('div',{class:'pgallery'});
    folderGallery(gallery,P.name,choose);
    return [el('div',{class:'bcard wide'}, el('h3',{text:'Character portrait'}),
      el('div',{class:'prow'}, frame,
        el('div',{class:'pside'},
          el('div',{class:'brow wrap'},
            el('button',{class:'btn',type:'button',text:'Add a picture…',onclick:()=>input.click()}),
            el('button',{class:'btn',type:'button',text:'Remove portrait',disabled:!ch.portrait,onclick:()=>{ delete ch.portrait; delete ch.portraitPath; delete ch.portraitData; this.changed(); }})),
          el('label',{class:'chk'}, el('input',{type:'checkbox',checked:!!ch.portraitBlank,onchange:e=>{ ch.portraitBlank=e.target.checked; this.changed(); }}),' Blank on sheet'),
          ch.portrait ? colRow : null,
          el('p',{class:'muted small',text:'Pictures live in the portraits folder next to the program. Any picture you put there shows up below by itself; “Add a picture” copies one in. A character uses its picture by the file name.'}),
          input)),
      gallery)];
  },

  /* ---------- Information ---------- */
  infoTab(){
    const info=this.ch.info;
    return [el('div',{class:'bcard wide'}, el('h3',{text:'Character information'}),
      ...INFO_FIELDS.map(([k,label])=>el('div',{class:'infoblock'}, el('label',{class:'muted small',text:label}), this.field(info,k,label,{area:true}))))];
  },

  /* ---------- Journal ---------- */
  journalTab(){
    const ch=this.ch, list=ch.journal;
    if(!list.some(j=>j.id===this.jsel)) this.jsel=list[list.length-1]?.id||null;
    const cur=list.find(j=>j.id===this.jsel);
    const entries=el('div',{class:'jlist'},
      ...list.map(j=>el('div',{class:'knownrow'+(j.id===this.jsel?' on':''),onclick:()=>{ this.jsel=j.id; this.render(); }},
        el('span',{text:(j.title||'Untitled')}), el('span',{class:'muted small',text:j.date||''}))),
      list.length ? null : el('p',{class:'muted small',text:'No entries yet.'}));
    const imgIn=el('input',{type:'file',accept:'image/*',hidden:true});
    const newEntry=()=>{ const id='j'+Date.now().toString(36), e={id,title:'',date:new Date().toLocaleDateString(),text:''}; list.push(e); this.jsel=id; return e; };
    // a picture from the computer, kept inside the character (journal pictures don't use the portraits folder)
    const addPic=async f=>{ if(!f||!isPicture(f)) return; const e=cur||newEntry(); (e.images ||= []).push({name:Portraits.cleanName(f.name), data:await shrinkImage(f,900)}); this.changed(); };
    imgIn.onchange=()=>addPic(imgIn.files[0]);
    const editor=cur ? el('div',{class:'jedit'},
      el('div',{class:'brow'}, this.field(cur,'title','Entry title',{ph:'Title',after:()=>{ const r=document.querySelector('.jlist .knownrow.on span'); if(r) r.textContent=cur.title||'Untitled'; }}),
        this.field(cur,'date','Date',{ph:'Date'})),
      this.field(cur,'text','Journal entry',{area:true}),
      ...(cur.images||[]).map((x,i)=>el('div',{class:'jimg'}, el('img',{src:typeof x==='string'?x:(x.data||Portraits.sources(x)[0]||''),alt:'Journal picture '+(i+1)}),
        el('button',{class:'x',type:'button','aria-label':'Remove picture',text:'×',onclick:()=>{ cur.images.splice(i,1); this.changed(); }}))))
      : el('p',{class:'muted pad',text:'Add an entry to start the journal.'});
    
    const card=el('div',{class:'bcard wide jcard'}, el('h3',{text:'Journal'}),
      el('div',{class:'jgrid'}, entries, editor),
      el('div',{class:'brow wrap',style:'margin-top:10px'},
        el('button',{class:'btn',type:'button',text:'Add entry',onclick:()=>{ const id='j'+Date.now().toString(36); list.push({id,title:'',date:new Date().toLocaleDateString(),text:''}); this.jsel=id; this.changed(); }}),
        el('button',{class:'btn',type:'button',text:'Add image…',title:'Pick a picture from your computer, or drag one onto the journal',onclick:()=>imgIn.click()}), imgIn,
        el('span',{style:'flex:1'}),
        el('button',{class:'btn',type:'button',text:'Delete entry',disabled:!cur,onclick:()=>{ if(!confirm('Delete this journal entry?')) return; ch.journal=list.filter(j=>j!==cur); this.changed(); }})));
    dropTarget(card, addPic);   // drop a picture anywhere on the journal
    return [card];
  },

  /* ---------- Companion ---------- */
  companionTab(){
    const st=this.st, ch=this.ch; ch.companionInfo ||= {};
    const main=st.slots.filter(s=>/^(Familiar|Companion)$/.test(s.type));
    const incs=st.slots.filter(s=>/^Companion Ability Increase/.test(s.type)).sort((a,b)=>a.level-b.level);
    const cards=[];
    // a companion that rides along on its own card (Fey Beast Tamer, Primal Guardian, Animal Master...)
    const g=[...st.granted.values()];
    // (left out when the same creature is already chosen as a companion above, e.g. the Living Zephyr)
    const chosen=new Set(main.flatMap(s=>this.picksOf(s)).map(id=>RULES.db.els[id]?.name).filter(Boolean));
    const cardPets=g.filter(e=>e.type==='Power' && (sp(e,'Animal Companion') || /^ID_TIV_COMPANION_/.test(e.id) && sp(e,'Defenses')) && !chosen.has(e.name));
    // the name and description brought in from an original save file go to the first companion
    const imp=ch.companionInfo._import;
    if(imp){ const first=main.find(s=>s.type==='Companion')?.key || this.cardPetKey(cardPets[0],st);
      if(first){ const ci=(ch.companionInfo[first] ||= {}); if(!ci.name && !ci.desc){ ci.name=imp.name; ci.desc=imp.desc; } delete ch.companionInfo._import; } }
    for(const s of main){
      const picked=RULES.db.els[this.picksOf(s)[0]];
      const owner=RULES.db.els[s.owner];
      const title=s.extra ? (s.type==='Familiar'?'Familiar (house rule)':'Companion (house rule)') : s.type==='Familiar' ? 'Familiar' : (owner ? owner.name.replace(/\s*\(.*\)$/,'').replace(/^.*:\s*/,'') : 'Companion');
      const card=el('div',{class:'bcard wide compcard'},
        el('div',{class:'stephead'}, el('h3',{text:title}), s.extra ? el('button',{class:'x',type:'button','aria-label':'Remove',title:'Remove this house-rule slot',text:'×',onclick:()=>{
          ch.extra[s.type]=(ch.extra[s.type]||[]).filter(u=>u!==s.uid); delete ch.picks[s.key]; this.changed(); }}) : null),
        el('p',{class:'muted small',text: s.type==='Familiar'
          ? 'A familiar is a spirit that accompanies you as your friend and ally. It is not a real creature, and it doesn\'t need to eat or breathe.'
          : 'Your companion\'s category decides its combat statistics. You can describe it more specifically (a bear companion may be a polar bear) and give it a name.'}));
      if(s.type==='Companion'){
        const ci=(ch.companionInfo[s.key] ||= {});
        let sheet=null; const after=()=>sheet?._retitle();
        card.append(el('div',{class:'detgrid'},
          el('div',{class:'detrow'}, el('label',{text:'Name'}), el('div',{class:'detval'}, this.field(ci,'name','Companion name',{after}))),
          el('div',{class:'detrow'}, el('label',{text:'Category'}), el('div',{class:'detval'}, this.slotRow(s))),
          el('div',{class:'detrow'}, el('label',{text:'Describe'}), el('div',{class:'detval'}, this.field(ci,'desc','Describe your companion',{ph:'e.g. Forest Owl',after})))));
        if(picked && incs.length) card.append(el('h4',{class:'lvlhead',text:'Level-up increases'}), ...incs.map(x=>this.slotRow(x)));
        if(picked) card.append(sheet=companionSheet(picked, ci, st));
      } else {
        card.append(this.slotRow(s));
        if(picked) card.append(familiarSheet(picked, st));
      }
      cards.push(card);
    }
    for(const p of cardPets){
      const [cname,kind]=sp(p,'Animal Companion') ? sp(p,'Animal Companion').split(/\s+-\s+/) : [p.name,'Animal Companion'];
      const src=g.find(x=>x.rules?.some(([t,a])=>t==='grant' && a.name===p.id));
      const slot=src && st.slots.find(s=>this.picksOf(s).includes(src.id));
      const ci=(ch.companionInfo[this.cardPetKey(p,st)] ||= {});
      let sheet=null; const after=()=>sheet?._retitle();
      cards.push(el('div',{class:'bcard wide compcard'},
        el('div',{class:'stephead'}, el('h3',{text:kind||'Companion'})),
        el('p',{class:'muted small',text:'This companion '+(src?'comes from '+src.name.replace(/\s*\(.*\)$/,'').replace(/\s+Companion$/,'').replace(/:.*$/,'')+'. Its':'\'s')+' statistics come from its card and rise with your level. You can describe it more specifically and give it a name.'}),
        el('div',{class:'detgrid'},
          el('div',{class:'detrow'}, el('label',{text:'Name'}), el('div',{class:'detval'}, this.field(ci,'name','Companion name',{after}))),
          el('div',{class:'detrow'}, el('label',{text:'Category'}), el('div',{class:'detval'}, slot ? this.slotRow(slot) : el('span',{text:p.name}))),
          el('div',{class:'detrow'}, el('label',{text:'Describe'}), el('div',{class:'detval'}, this.field(ci,'desc','Describe your companion',{ph:'e.g. Shadow Panther',after})))),
        sheet=cardPetSheet(p, cname, ci, st)));
    }
    const none=!main.length && !cardPets.length ? el('div',{class:'bcard'}, el('p',{class:'muted',text:'This character has no companion or familiar. Beastmaster rangers, Sentinel druids, characters with the Arcane Familiar feat and some themes get one. You can also add one as a house rule.'})) : null;
    const add=el('div',{class:'brow wrap'},
      el('button',{class:'btn small',type:'button',text:'+ Add companion (house rule)',onclick:()=>{ (ch.extra.Companion ||= []).push(Date.now().toString(36)); this.changed(); }}),
      el('button',{class:'btn small',type:'button',text:'+ Add familiar (house rule)',onclick:()=>{ (ch.extra.Familiar ||= []).push(Date.now().toString(36)); this.changed(); }}),
      el('span',{class:'muted small',text:'For characters who don\'t normally get one. Marked as homebrew.'}));
    return [none, ...cards, el('div',{class:'bcard'}, add)];
  },

  // where a card companion's name is kept: with the choice that gave it, so changing beast keeps the name
  cardPetKey(p,st){
    if(!p) return null;
    const src=[...st.granted.values()].find(x=>x.rules?.some(([t,a])=>t==='grant' && a.name===p.id));
    const slot=src && st.slots.find(s=>this.picksOf(s).includes(src.id));
    return slot?.key || 'card:'+p.id;
  },

  /* ---------- Summary ---------- */
  summaryTab(){
    const text=characterSummary(this);
    const box=el('textarea',{class:'summarybox',readonly:true,'aria-label':'Character summary'}); box.value=text;
    return [el('div',{class:'bcard wide'}, el('div',{class:'stephead'}, el('h3',{text:'Character summary'}),
        el('button',{class:'btn small',type:'button',text:'Copy to clipboard',onclick:async e=>{
          try{ await navigator.clipboard.writeText(text); e.target.textContent='Copied ✓'; }catch(err){ box.select(); document.execCommand('copy'); e.target.textContent='Copied ✓'; } }})),
      box)];
  },
});

function isPicture(f){ return /^image\//.test(f.type||'') || Portraits.IMG.test(f.name||''); }
/* dropping a picture file onto a box */
function dropTarget(box, put){
  box.addEventListener('dragover',e=>{ e.preventDefault(); box.classList.add('drag'); });
  box.addEventListener('dragleave',()=>box.classList.remove('drag'));
  box.addEventListener('drop',e=>{ e.preventDefault(); box.classList.remove('drag'); const f=[...(e.dataTransfer?.files||[])].find(isPicture); if(f) put(f); });
}
/* thumbnails of the portraits folder (pictures load as they scroll into view) */
async function folderGallery(box, current, choose){
  const list=await Portraits.list();
  box.replaceChildren(el('p',{class:'muted small',style:'grid-column:1/-1;margin:0'}, `Portraits folder · ${list.length} picture${list.length===1?'':'s'} · click one to use it`),
    ...list.map(n=>el('button',{class:'pthumb'+(n===current?' on':''),type:'button',title:n,onclick:()=>choose(n)},
      el('img',{alt:'',loading:'lazy',src:Portraits.path(n)}), el('span',{text:n}))));
  if(!list.length) box.append(el('p',{class:'muted small',text:'The portraits folder has no pictures yet. Put some there and they appear here.'}));
}

/* the beast companion's statistics at the character's level: the companion's own card, updated by its level entries */
function companionSheet(c, ci, st){
  const db=RULES.db, L=st.level;
  // its power card ("Companion: Raptor") and the level entries that change it ("Companion Raptor 3")
  const cardId=c.rules.find(([t,a])=>t==='grant' && db.els[a.name]?.type==='Power' && /^Companion:/.test(db.els[a.name].name))?.[1].name;
  const card=db.els[cardId], f={};
  if(card){ const ms=modSpec(card,st);
    for(const k of ['Companion','Statistics','Defenses','Hit Points','Healing Surge Value','Attack','Hit','Trained Skills']) f[k]=String(ms[k]||'').trim().replace(/^Healing Surge Value:\s*/,''); }
  // feats that improve the beast ("Human Beast Mastery": +1 to all its defenses)
  const {bs,bump,surges,speedUp}=beastBonus(st);
  const num=k=>+String(sp(c,k)).replace(/[^\d-]/g,'')||0;
  const abil=ABILITIES.map(a=>{ const v=st.stat('Companion.'+a)||num(a); return [a,v]; });
  const ab=sp(c,'Ability Score');
  const atk=num('Attack Bonus')+L+bs('attack rolls');
  // without a card, the companion rules: defenses and attack bonus rise with level, hit points by a set amount per level
  const def=f['Defenses'] || `AC ${num('Armor Class')+L}, Fortitude ${num('Fortitude Defense')+L}, Reflex ${num('Reflex Defense')+L}, Will ${num('Will Defense')+L}`;
  const hp=(+(f['Hit Points']||0) || (num('Hit Points at 1st Level')+num('Hit Points per Level Gained')*L)) + bs('Hit Points');
  const surge=surges(f['Healing Surge Value'] || `${Math.floor(hp/4)} (2 surges per day)`);
  const vision=(/(low-light|darkvision|blindsight[^,]*)/i.exec(f['Statistics']||sp(c,'Senses'))||[])[1]?.toLowerCase()||'low-light';
  const skills=(f['Trained Skills']||'') || sp(c,'Trained Skills').split(',').map(x=>db.els[x.trim()]?.name||x.trim()).filter(Boolean).join(', ');
  const abName=/your/i.test(ab) ? (ab.match(/Strength|Constitution|Dexterity|Intelligence|Wisdom|Charisma/g)||[]).map(a=>'your '+a).join(' + ') : (ab||'ability');
  return standardBlock(ci, L, c.name, {
    abil, size:sp(c,'Size'), speed:speedUp([sp(c,'Speed'), sp(c,'Secondary Speed')].filter(Boolean).join(', ')), vision,
    def:bump(def.replace(/;/,',')), hp, surge, atk, dmg:sp(c,'Damage'),
    basic:`${sp(c,'Attack')||'Attack'}; ${atk} vs. AC; ${sp(c,'Damage')} + ${abName} modifier damage.`,
    powers:sp(c,'Power') ? [sp(c,'Power')] : [], skills}, st);
}

/* every companion is shown the same way, like the original builder's creature block:
   Level N Name, ability scores, size, speed, vision, defenses, hit points, surges, attack, damage,
   basic attack, its powers ("Debris Cloud (Aura 2): ..."), trained skills */
function standardBlock(ci, L, kind, o, st){
  const line=(k,v)=>el('div',{}, el('b',{text:k+': '}), String(v??''));
  const named=t=>{ const m=/^([^:]{1,60}):\s*([\s\S]*)$/.exec(String(t).trim()); return m ? el('div',{class:'prel'}, el('b',{text:m[1]+': '}), m[2]) : el('div',{class:'prel',text:t}); };
  const head=el('div',{class:'comphead'}), title=()=>head.textContent=(ci.name?ci.name+' - ':'')+`Level ${L} ${ci.desc||kind}`; title();
  const {extras}=beastBonus(st);
  const box=el('div',{class:'compsheet'}, head,
    line('Ability Scores', o.abil.map(([a,v])=>a+': '+v).join(', ')),
    line('Size', o.size), line('Speed', o.speed), line('Vision', o.vision),
    line('Defenses', o.def), line('Hit Points', o.hp), line('Healing Surge Value', o.surge),
    line('Attack Bonus', o.atk), line('Damage', o.dmg),
    el('div',{class:'prel'}, el('b',{text:'Melee Basic Attack: '}), o.basic),
    ...(o.powers||[]).map(named), line('Trained Skills', o.skills||''),
    ...extras((k,v)=>v ? line(k,v) : null));
  box._retitle=title; return box;
}
/* bonuses feats, features and items give a beast companion (BEAST.AC, BEAST.Hit Points...);
   only the ones that always apply, not "while adjacent to you" */
function beastBonus(st, pre='BEAST.'){
  const bs=n=>st.stat(pre+n)||0;
  const DEF={AC:['AC'],Fortitude:['Fortitude Defense','Fortitude'],Reflex:['Reflex Defense','Reflex'],Will:['Will Defense','Will']};
  const bump=d=>String(d).replace(/\b(AC|Fortitude|Reflex|Will)\s+(\d+)/g,(m,k,n)=>k+' '+(+n+DEF[k].reduce((t,x)=>t+bs(x),0)));
  const surges=t=>String(t).replace(/\((\d+) surges per day\)/i,(m,n)=>`(${Math.max(0,+n+bs('Healing Surges'))} surges per day)`);
  const speedUp=t=>{ const b=bs('Speed'); return b ? String(t).replace(/\d+/,n=>+n+b) : t; };
  const extras=line=>{
    const out=[];
    const sk=SKILLS.map(k=>[k,bs(k+' misc')]).filter(([,v])=>v).map(([k,v])=>k+' '+fmt(v));
    if(sk.length) out.push(line('Skill bonuses', sk.join(', ')));
    const rs=['acid','cold','fire','lightning','necrotic','poison','psychic','radiant','thunder','force'].map(d=>[d,bs('resist:'+d)]).filter(([,v])=>v>0).map(([d,v])=>v+' '+d);
    if(rs.length) out.push(line('Resist', rs.join(', ')));
    const sv=bs('Saving Throws'), ds=bs('Death Saving Throws');
    if(sv) out.push(line('Saving throws', fmt(sv)));
    if(ds) out.push(line('Death saving throws', fmt(ds)));
    const dm=bs('damage rolls'); if(dm) out.push(line('Damage rolls', fmt(dm)));
    return out;
  };
  return {bs,bump,surges,speedUp,extras};
}
/* a companion that has its own card (fey beast, living zephyr...), turned into the standard creature block */
function cardPetSheet(p, cname, ci, st){
  const spec=modSpec(p,st), L=st.level, {bs,bump,speedUp}=beastBonus(st);
  const all=Object.values(spec).join('\n');
  // the sentinel's "Pet Hit Points" belong to its wolf or bear, not to a card companion
  const hpb=bs('Hit Points')-(st.stat('Pet Hit Points')||0);
  const hpText=String(spec['Hit Points']||'');
  const hp=/bloodied/i.test(hpText) ? Math.floor((st.stat('Hit Points')||0)/2)+hpb : (+hpText.replace(/[^\d]/g,'')||0)+hpb;
  const AB={Str:'Strength',Con:'Constitution',Dex:'Dexterity',Int:'Intelligence',Wis:'Wisdom',Cha:'Charisma'}, sc={};
  for(const m of all.matchAll(/\b(Str|Con|Dex|Int|Wis|Cha)\b:?\s*(\d+)/g)) sc[AB[m[1]]] ??= +m[2];
  const stats=String(spec['Statistics']||spec['Summoned Creature']||'');
  const size=(/\b(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/.exec(stats)||[])[1]||'';
  let speed=String(spec['Speed']||(/Speed\s+([^\n]*)/.exec(stats)||[])[1]||'').trim().replace(/^land\s+/i,'').replace(/\s+,/g,',');
  speed=speedUp(speed);
  const vision=(/(low-light|darkvision|blindsight\s*\d*|tremorsense\s*\d*)/i.exec(stats+' '+(spec['Senses']||''))||[])[1]?.toLowerCase()||'low-light';
  let def=String(spec['Defenses']||'');
  if(/add your level/i.test(def)) def=def.replace(/\(add your level to each defense\)\s*/i,'').replace(/\b(AC|Fortitude|Reflex|Will)\s+(\d+)/g,(m,a,n)=>a+' '+(+n+L));
  def=bump(def.replace(/\s+/g,' ').trim());
  // its attack: the field that reads "Attack: Melee 1 ...; your level + 5 vs. AC  Hit: ..."
  const ak=Object.keys(spec).find(k=>/Attack:[\s\S]*vs\./.test(spec[k]||''));
  const av=String(spec[ak]||''), plus=+((/your level \+ (\d+)/i.exec(av)||[])[1]||0);
  const atk=L+plus+bs('attack rolls');
  const hitLines=(/Hit:\s*([\s\S]*)$/.exec(av)||[])[1]?.split('\n').map(x=>x.trim()).filter(Boolean)||[];
  // the damage for this level ("Level 21: 2d8 + one-half your level damage.")
  let hit=hitLines.find(x=>!/^Level \d+:/.test(x))||'';
  for(const x of hitLines){ const m=/^Level (\d+):\s*(.*?damage)/i.exec(x); if(m && L>=+m[1]) hit=hit.replace(/^.*?damage/i,m[2]); }
  const dmg=(/\d+d\d+/.exec(hit)||[])[0]||'';
  const name=(ak||'Attack').replace(/\s*\(.*\)$/,'');
  const skip=new Set([ak,'Statistics','Summoned Creature','Hit Points','Initiative','Defenses','Perception','Speed','Skills','Ability Scores','Senses','Power Usage','Animal Companion','Display','Level','Class','Short Description','type','Type']);
  const powers=Object.entries(spec).filter(([k,v])=>k[0]!=='_' && v && !/^ID_/.test(v) && !skip.has(k)).map(([k,v])=>{ v=String(v).trim().replace(/\s*\n\s*/g,' '); const m=/^(\([^)]*\))\s*(.*)$/.exec(v); return m ? `${k} ${m[1]}: ${m[2]}` : k+': '+v; });
  return standardBlock(ci, L, cname.replace(/^Trained\s+/,''), {
    abil:ABILITIES.map(a=>[a,sc[a]??10]), size, speed, vision, def, hp,
    surge:`${Math.floor(hp/4)} (${Math.max(0,bs('Healing Surges'))} surges per day)`,
    atk, dmg, basic:`${name}; ${atk} vs. AC; ${hit}`, powers, skills:''}, st);
}
function familiarSheet(f, st){
  // a familiar's defenses equal yours, +1 for each familiar feat beyond the first, plus FAMILIAR.* bonuses
  const {bs,bump,speedUp}=beastBonus(st,'FAMILIAR.');
  const feats=[...st.granted.values()].filter(e=>e.type==='Feat' && /\bfamiliar\b/i.test(sp(e,'type'))).length;
  const more=Math.max(0,feats-1), s=n=>st.stat(n);
  const def=bump(`AC ${s('AC')+more}, Fortitude ${s('Fortitude Defense')+more}, Reflex ${s('Reflex Defense')+more}, Will ${s('Will Defense')+more}`);
  return el('div',{class:'compsheet'},
    el('div',{class:'comphead'}, el('span',{text:f.name}), el('span',{text:'Familiar'})),
    f.text ? el('div',{class:'muted'},el('i',{text:f.text})) : null,
    el('div',{}, el('b',{text:'Senses '}), sp(f,'Senses')||'—'),
    el('div',{}, el('b',{text:'Speed '}), [speedUp(sp(f,'Speed')),speedUp(sp(f,'Secondary Speed'))].filter(Boolean).join(', ')),
    el('div',{}, el('b',{text:'Hit Points '}), '1', el('span',{class:'muted small',text:' (a missed attack never damages it)'})),
    el('div',{}, el('b',{text:'Defenses '}), def, more ? el('span',{class:'muted small',text:` (yours, +${more} for ${more>1?'extra familiar feats':'an extra familiar feat'})`}) : el('span',{class:'muted small',text:' (equal to yours)'})),
    el('div',{}, el('b',{text:'Constant Benefits'})), el('div',{class:'indent',text:sp(f,'Constant Benefits')||'—'}),
    el('div',{}, el('b',{text:'Active Benefits'})), el('div',{class:'indent',text:sp(f,'Power')||'—'}));
}

/* a plain-text summary, like the original's Summary tab */
function characterSummary(B){
  const st=B.st, ch=B.ch, s=n=>st.stat(n), g=t=>[...st.granted.values()].filter(e=>e.type===t);
  const out=['====== Created using Open Compendium ======'];
  out.push(`${ch.name||'Unnamed'}, level ${st.level}`);
  out.push([g('Race')[0]?.name, g('Class')[0]?.name].filter(Boolean).join(', '));
  const named=st.slots.filter(sl=>!/^(Power|Feat|Skill Training|Language|Race Ability Bonus|Ability Increase|Race|Class)$/.test(sl.type) && !/^Ability Increase/.test(sl.type) && B.picksOf(sl).length)
    .map(sl=>`${slotTitle(sl)}: ${B.picksOf(sl).map(id=>RULES.db.els[id]?.name).join(', ')}`);
  out.push(...named, '');
  out.push('FINAL ABILITY SCORES', ABILITIES.map(a=>`${a.slice(0,3)} ${s(a)}`).join(', ')+'.', '');
  out.push('STARTING ABILITY SCORES', ABILITIES.map(a=>`${a.slice(0,3)} ${ch.abilities?.[a]??10}`).join(', ')+'.', '');
  out.push(`AC: ${s('AC')} Fort: ${s('Fortitude Defense')} Reflex: ${s('Reflex Defense')} Will: ${s('Will Defense')}`);
  out.push(`HP: ${s('Hit Points')} Surges: ${s('Healing Surges')} Surge Value: ${Math.floor(s('Hit Points')/4)}`, '');
  const tr=SKILLS.filter(k=>s(k+' Trained')>0), un=SKILLS.filter(k=>!(s(k+' Trained')>0));
  out.push('TRAINED SKILLS', tr.map(k=>`${k} ${fmt(s(k))}`).join(', '), '', 'UNTRAINED SKILLS', un.map(k=>`${k} ${fmt(s(k))}`).join(', '), '');
  const feats=st.slots.filter(sl=>sl.type==='Feat').flatMap(sl=>B.picksOf(sl).map(id=>[sl.level||1,RULES.db.els[id]?.name])).sort((a,b)=>a[0]-b[0]);
  out.push('FEATS', ...feats.map(([l,n])=>`Level ${l}: ${n}`), '');
  const pw=st.slots.filter(sl=>sl.type==='Power').flatMap(sl=>B.picksOf(sl).map(id=>[sl.level||1,slotTitle(sl),RULES.db.els[id]])).filter(x=>x[2]).sort((a,b)=>a[0]-b[0]);
  out.push('POWERS', ...pw.map(([l,t,e])=>`${(e.spec['Display']||t).replace(/\s+/g,' ').trim()}: ${e.name}`), '');
  const items=(ch.items||[]).map(it=>itemName(it)+(it.qty>1?' ('+it.qty+')':''));
  if(items.length) out.push('ITEMS', items.join(', '), '');
  out.push('====== End ======');
  return out.join('\n');
}

/* pictures are made smaller before they are stored, so characters stay light */
function shrinkImage(file,max){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>{ const img=new Image(); img.onload=()=>{
        const k=Math.min(1,max/Math.max(img.width,img.height)), c=document.createElement('canvas');
        c.width=Math.round(img.width*k); c.height=Math.round(img.height*k);
        c.getContext('2d').drawImage(img,0,0,c.width,c.height); res(c.toDataURL('image/jpeg',0.85)); };
      img.onerror=rej; img.src=r.result; };
    r.onerror=rej; r.readAsDataURL(file);
  });
}
