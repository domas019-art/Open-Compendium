/* Imperial or metric: measurements in any text on screen (compendium entries, the builder, the sheet) are shown
   in metres, kilograms and so on when "Metric" is chosen. The books' own text is never changed: what is shown is
   converted as it appears, and switching back restores it.
   - rounded to the nearest half (1.5 m, 3 m, 22.5 kg); below 1, to one decimal (0.3 m)
   - heights like 6'2" become centimetres (188 cm)
   - areas measured on the grid ("a 5-foot radius", "a 10-foot-wide wall") become squares, as on the battle grid */
const Units={
  KEY:'open-compendium-units',
  metric:false,
  orig:new WeakMap(),          // text node -> its original text
  SKIP:'input,textarea,select,script,style,[contenteditable],.nounits',
  num(s){ s=String(s).replace(/,/g,'').replace('½','.5').trim();
    const f=/^(\d+)?\s*(\d+)\/(\d+)$/.exec(s); if(f) return (+(f[1]||0))+(+f[2])/(+f[3]);
    return parseFloat(s); },
  fmt(x){ if(x<1) return String(Math.max(0.1,Math.round(x*10)/10));
    const r=Math.round(x*2)/2; return (r>=1000?r.toLocaleString('en-US'):String(r)); },
  // name -> [factor, singular, plural, short]
  U:{ foot:[0.3048,'meter','meters','m'], mile:[1.609344,'kilometer','kilometers','km'], inch:[2.54,'centimeter','centimeters','cm'],
      yard:[0.9144,'meter','meters','m'], pound:[0.45359237,'kilogram','kilograms','kg'], gallon:[3.785,'liter','liters','L'],
      pint:[0.473,'liter','liters','L'], ounce:[28.35,'gram','grams','g'], cubic:[0.0283168,'cubic meter','cubic meters','m³'], sqft:[0.092903,'square meter','square meters','m²'] },
  unitOf(w){ w=w.toLowerCase().replace(/\.$/,'');
    if(/^(cubic (feet|foot))$/.test(w)) return ['cubic',false];
    if(/^(square (feet|foot))$/.test(w)) return ['sqft',false];
    if(/^(feet|foot)$/.test(w)) return ['foot',false]; if(w==='ft') return ['foot',true];
    if(/^miles?$/.test(w)) return ['mile',false]; if(w==='mi') return ['mile',true];
    if(/^(inch|inches)$/.test(w)) return ['inch',false]; if(w==='in') return ['inch',true];
    if(/^yards?$/.test(w)) return ['yard',false]; if(w==='yd') return ['yard',true];
    if(/^pounds?$/.test(w)) return ['pound',false]; if(/^lbs?$/.test(w)) return ['pound',true];
    if(/^gallons?$/.test(w)) return ['gallon',false]; if(/^pints?$/.test(w)) return ['pint',false];
    if(/^ounces?$/.test(w)) return ['ounce',false]; if(w==='oz') return ['ounce',true];
    return null; },
  N:'(\\d[\\d,]*(?:\\.\\d+)?(?:\\s*\\d+\\/\\d+)?|\\d+\\/\\d+|½)',
  W:"(cubic (?:feet|foot)|square (?:feet|foot)|feet|foot|ft\\.?|miles?|mi\\.|inch(?:es)?|in\\.|yards?|yd\\.?|pounds?|lbs?\\.?|gallons?|pints?|ounces?|oz\\.?)(?![a-z])",
  init(){
    try{ this.metric=localStorage.getItem(this.KEY)==='metric'; }catch(e){}
    const N=this.N, W=this.W;
    this.reHeight=/\b(\d)\s*['′]\s*(\d{1,2})\s*(?:"|″|'')/g;
    this.reGrid=new RegExp('\\b(\\d+)-(?:foot|ft\\.?)(-|\\s)(radius|square|cube|burst|blast|wide|long|high|tall|deep|area|zone|line|wall|emanation)\\b','gi');
    this.reRange=new RegExp('\\b'+N+'(\\s*(?:-|–|—|to|or|and)\\s*)'+N+'(\\s*-\\s*|\\s+)'+W,'gi');
    this.reOne=new RegExp('\\b'+N+'(\\s*-\\s*|\\s+|(?=[a-z]))'+W,'gi');
    this.quick=/\d\s*(?:-|\s)?(?:feet|foot|ft|mile|mi\.|inch|in\.|yard|yd|pound|lb|gallon|pint|ounce|oz|cubic|square)|\d\s*['′]\s*\d/i;
    const btn=$('#unitsBtn'); if(btn){ btn.onclick=()=>this.set(!this.metric); this.label(); }
    new MutationObserver(ms=>{ if(!this.metric) return; for(const m of ms) for(const n of m.addedNodes) this.walk(n); })
      .observe(document.body,{childList:true,subtree:true});
    if(this.metric) this.walk(document.body);
  },
  label(){ const b=$('#unitsBtn'); if(!b) return; b.textContent=this.metric?'Metric':'Imperial'; b.title='Measurements are shown in '+(this.metric?'metric (meters, kilograms)':'imperial (feet, pounds)')+'. Click to switch.'; },
  set(on){
    this.metric=on; try{ localStorage.setItem(this.KEY,on?'metric':'imperial'); }catch(e){}
    this.label();
    if(typeof Builder!=='undefined' && Builder.ch && RULES.db) Builder.render();     // hints in input boxes
    if(on) this.walk(document.body);
    else { const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT); while(w.nextNode()){ const n=w.currentNode, o=this.orig.get(n); if(o!=null){ n.nodeValue=o; this.orig.delete(n); } } }
  },
  walk(root){
    if(root.nodeType===3){ this.fix(root); return; }
    if(root.nodeType!==1 || root.closest?.(this.SKIP)) return;
    const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT); const list=[];
    while(w.nextNode()) list.push(w.currentNode);
    for(const n of list) this.fix(n);
  },
  fix(n){
    const t=n.nodeValue; if(!t || this.orig.has(n)) return;
    if(!this.quick.test(t) && !/^\s*Average Weight\s*$/i.test(n.previousSibling?.textContent||'')) return;
    if(n.parentElement?.closest(this.SKIP)) return;
    let out=this.convert(t);
    // "Average Weight: 160 - 220" (pounds, with no unit written)
    if(/^\s*Average Weight\s*$/i.test(n.previousSibling?.textContent||'') && /^\s*:?\s*\d+\s*-\s*\d+\s*$/.test(out))
      out=out.replace(/(\d+)\s*-\s*(\d+)/,(m,a,b)=>this.fmt(a*this.U.pound[0])+' - '+this.fmt(b*this.U.pound[0])+' kg');
    if(out!==t){ this.orig.set(n,t); n.nodeValue=out; }
  },
  // one converted value with its unit word, in the original's style (abbreviated, hyphenated, singular/plural)
  word(key,abbr,val,hyphen){
    const [,sg,pl,sh]=this.U[key];
    if(abbr) return sh;
    return hyphen || val===1 ? sg : pl;
  },
  // text shown some other way (an input's hint): converted when metric is on. kind 'weight': bare numbers are pounds
  text(t,kind){
    t=String(t||''); if(!this.metric || !t) return t;
    let out=this.convert(t);
    if(kind==='weight' && out===t) out=t.replace(/(\d+)\s*(-|–|to)\s*(\d+)(?!\s*\w)/,(m,a,mid,b)=>this.fmt(a*this.U.pound[0])+' '+mid+' '+this.fmt(b*this.U.pound[0])+' kg');
    return out;
  },
  convert(t){
    // heights: 6'2" -> 188 cm
    t=t.replace(this.reHeight,(m,f,i)=>Math.round((+f*12+(+i))*2.54)+' cm');
    // grid areas: "5-foot radius" -> "1-square radius" (a square is 5 feet)
    t=t.replace(this.reGrid,(m,n,sep,what)=>+n%5===0 ? (+n/5)+'-square'+sep+what : m);
    // ranges: "160 - 210 lb." / "10 to 20 feet"
    t=t.replace(this.reRange,(...args)=>{ const [m,a,mid,b,sep,w]=args; const u=this.unitOf(w); if(!u) return m;
      const k=this.U[u[0]][0], x=this.num(a)*k, y=this.num(b)*k; if(isNaN(x)||isNaN(y)) return m;
      const hy=/-/.test(sep); return this.fmt(x)+mid+this.fmt(y)+(hy?'-':' ')+this.word(u[0],u[1],2,hy); });
    // single values: "30 feet", "a 10-foot pole", "50 lb.", "1 mile"
    t=t.replace(this.reOne,(...args)=>{ const [m,a,sep,w]=args; const u=this.unitOf(w); if(!u) return m;
      const x=this.num(a)*this.U[u[0]][0]; if(isNaN(x)) return m;
      const hy=/-/.test(sep), v=this.fmt(x);
      return v+(hy?'-':' ')+this.word(u[0],u[1],+v,hy); });
    return t;
  },
};
Units.init();
