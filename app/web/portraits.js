/* Pictures (portraits and journal pictures)
   Portraits live in the "portraits" folder next to the program (subfolders too); a character remembers the
   picture by its name there. A picture added from elsewhere is copied into the folder. Journal pictures are
   kept inside the character. */
const Portraits={
  IMG:/\.(png|jpe?g|gif|webp|bmp)$/i,
  sortNames(a){ return a.sort((x,y)=>x.localeCompare(y,undefined,{numeric:true,sensitivity:'base'})); },
  // the address of a picture in the portraits folder (the program serves it)
  path(name){ return 'portraits/'+String(name).split('/').map(encodeURIComponent).join('/'); },
  // every picture in the portraits folder, as names like "Slayer.jpg" or "SamplePortraits/Aria.png"
  async list(){
    try{ const l=await (await fetch('/_list/portraits')).json(); return this.sortNames(l.map(f=>f.p).filter(n=>this.IMG.test(n))); }
    catch(e){ return []; }
  },
  cleanName(n){ return (n||'picture.png').replace(/[\\/:*?"<>|]+/g,'_'); },
  /* a new picture from the computer: copied into the portraits folder (a different picture with the same name gets
     "(2)" added). Returns {name, data}; data is a copy kept inside the character, only if the folder can't be
     written (a locked flash drive, say). */
  async keep(file, max){
    let name=null;
    try{ name=await OC.savePicture(file.name, await file.arrayBuffer()); }catch(e){ console.warn(e); }
    if(name) return {name, data:''};
    return {name:this.cleanName(file.name), data:await shrinkImage(file,max)};
  },
  // places to try for a picture, in order: the portraits folder, the copy kept inside the character
  sources(p){ return [p.name ? this.path(p.name) : null, p.data||null].filter(Boolean); },
  /* the character's portrait as {name, path, data}. A character imported from the original builder has a full
     path there (path, shown so it can be copied over); the program looks for its file name in the folder. */
  of(ch){
    const p=ch.portrait||'';
    if(/^data:/.test(p)) return {name:'', path:'', data:p};
    return {name:/^[a-z]:|^[\\/]|^file:/i.test(p) ? p.split(/[\\/]/).pop() : p, path:ch.portraitPath||'', data:ch.portraitData||''};
  },
  // the picture's main colour, for the frame and ornament on the sheet (src: an address, or a picture file)
  colourOf(src){
    return new Promise(res=>{
      const url=src instanceof Blob ? URL.createObjectURL(src) : src;
      if(!url) return res(null);
      const im=new Image();
      im.onload=()=>{ try{
        const N=48, c=document.createElement('canvas'); c.width=N; c.height=N;
        const g=c.getContext('2d'); g.drawImage(im,0,0,N,N); const d=g.getImageData(0,0,N,N).data;
        const bins=new Array(24).fill(0).map(()=>({w:0,r:0,g:0,b:0}));
        for(let i=0;i<d.length;i+=4){
          const r=d[i]/255,gg=d[i+1]/255,b=d[i+2]/255, mx=Math.max(r,gg,b), mn=Math.min(r,gg,b), l=(mx+mn)/2, ch=mx-mn;
          if(d[i+3]<128 || ch<0.08) continue;
          const s=ch/(1-Math.abs(2*l-1)||1);
          let h=mx===r?((gg-b)/ch)%6:mx===gg?(b-r)/ch+2:(r-gg)/ch+4; h=(h*60+360)%360;
          const w=s*(1-Math.abs(2*l-1)), bin=bins[Math.floor(h/15)];
          bin.w+=w; bin.r+=d[i]*w; bin.g+=d[i+1]*w; bin.b+=d[i+2]*w;
        }
        const best=bins.reduce((a,b)=>b.w>a.w?b:a);
        if(best.w<1) return res(null);
        // keep the hue, make it strong enough to read as a frame on both light and dark backgrounds
        let [r,g2,b]=[best.r/best.w,best.g/best.w,best.b/best.w].map(x=>x/255);
        const mx=Math.max(r,g2,b), mn=Math.min(r,g2,b), l=(mx+mn)/2;
        const k=l<0.35?0.35/l:l>0.6?0.6/l:1; [r,g2,b]=[r,g2,b].map(x=>Math.min(1,x*k));
        res('#'+[r,g2,b].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join(''));
      }catch(e){ res(null); } finally{ if(src instanceof Blob) URL.revokeObjectURL(url); } };
      im.onerror=()=>res(null); im.src=url;
    });
  },
  // work out the portrait's colour; resolves true if it changed
  async updateColour(ch){
    if(!ch.portrait) return false;
    const P=this.of(ch), src=P.name ? this.path(P.name) : P.data;
    if(!src) return false;
    let c=await this.colourOf(src);
    if(!c && P.name && P.data) c=await this.colourOf(P.data);
    if(c && c!==ch.portraitColor){ ch.portraitColor=c; return true; }
    return false;
  },
};

/* an <img> that tries each place in turn; onMissing runs if none works */
const pictureOk=new Map();   // picture -> the address that loaded, so a redrawn sheet shows it at once
function pictureImg(p, cls, alt, onMissing){
  const key=p.name||(p.data||'').slice(0,64);
  const srcs=Portraits.sources(p); let i=0;
  const known=pictureOk.get(key); if(known){ const k=srcs.indexOf(known); if(k>0){ srcs.splice(k,1); srcs.unshift(known); } }
  const img=el('img',{class:cls, alt:alt||''});
  img.onload=()=>pictureOk.set(key,img.src);
  const fail=()=>{ img.onerror=null; onMissing ? onMissing(img) : img.remove(); };
  img.onerror=()=>{ i++; if(i<srcs.length) img.src=srcs[i]; else fail(); };
  if(srcs.length) img.src=srcs[0]; else setTimeout(fail,0);
  return img;
}
// the sheet's frame colour: the one you chose, otherwise the picture's own
function frameColour(ch){ return ch.portraitColorUser || ch.portraitColor || ''; }
// work out the picture colour of every character that has a portrait but no colour yet (new pictures in the folder)
async function colourAllFromFolder(){
  if(typeof Builder==='undefined') return;
  let n=0;
  for(const c of [...new Set([Builder.ch, ...Object.values(Builder.chars||{})])]){
    if(!c?.portrait || c.portraitColor) continue;
    if(await Portraits.updateColour(c)) n++;
  }
  if(n){ await Builder.saveAllChars(); Builder.renderSheet($('#bSheet')); }
}
function portraitImg(ch, cls, onMissing){ return pictureImg(Portraits.of(ch), cls, 'Portrait of '+(ch.name||'the character'), onMissing); }
