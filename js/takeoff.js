/* ==========================================================================
   BidEst — on-screen drawing take-off (CostX-style)
   Part T1: pure core — geometry, safe formulas, assemblies, quantities.
   Everything in TKCore is side-effect free so it can be tested on its own.
   Page coordinates are PDF user units at scale 1, y running down the sheet.
   ========================================================================== */
'use strict';
const TKCore=(()=>{
  const d2=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
  function signedArea(p){let a=0;for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length];a+=p[i][0]*q[1]-q[0]*p[i][1];}return a/2;}
  const area=p=>(p&&p.length>2)?Math.abs(signedArea(p)):0;
  function pathLen(p,closed){
    if(!p||p.length<2)return 0;
    let L=0;for(let i=1;i<p.length;i++)L+=d2(p[i-1],p[i]);
    if(closed&&p.length>2)L+=d2(p[p.length-1],p[0]);
    return L;
  }
  function centroid(p){
    if(!p||!p.length)return [0,0];
    const A=signedArea(p);
    if(p.length<3||Math.abs(A)<1e-9){
      let x=0,y=0;p.forEach(q=>{x+=q[0];y+=q[1];});return [x/p.length,y/p.length];
    }
    let cx=0,cy=0;
    for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],c=a[0]*b[1]-b[0]*a[1];cx+=(a[0]+b[0])*c;cy+=(a[1]+b[1])*c;}
    return [cx/(6*A),cy/(6*A)];
  }
  function inPoly(pt,p){
    let ins=false;
    for(let i=0,j=p.length-1;i<p.length;j=i++){
      const xi=p[i][0],yi=p[i][1],xj=p[j][0],yj=p[j][1];
      if(((yi>pt[1])!==(yj>pt[1]))&&(pt[0]<(xj-xi)*(pt[1]-yi)/((yj-yi)||1e-12)+xi))ins=!ins;
    }
    return ins;
  }
  /* segment intersection: [x,y,t,u] or null */
  function segX(a,b,c,d){
    const rx=b[0]-a[0],ry=b[1]-a[1],sx=d[0]-c[0],sy=d[1]-c[1];
    const den=rx*sy-ry*sx;
    if(Math.abs(den)<1e-12)return null;
    const qx=c[0]-a[0],qy=c[1]-a[1];
    const t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
    if(t<-1e-9||t>1+1e-9||u<-1e-9||u>1+1e-9)return null;
    return [a[0]+t*rx,a[1]+t*ry,t,u];
  }
  /* true when a closed polygon crosses itself (adjacent edges excluded) */
  function selfCross(p){
    const n=p.length;if(n<4)return false;
    for(let i=0;i<n;i++){
      const a=p[i],b=p[(i+1)%n];
      for(let j=i+2;j<n;j++){
        if(i===0&&j===n-1)continue;
        const r=segX(a,b,p[j],p[(j+1)%n]);
        if(r&&r[2]>1e-6&&r[2]<1-1e-6&&r[3]>1e-6&&r[3]<1-1e-6)return true;
      }
    }
    return false;
  }
  function distSeg(pt,a,b){
    const dx=b[0]-a[0],dy=b[1]-a[1],L2=dx*dx+dy*dy;
    let t=L2?((pt[0]-a[0])*dx+(pt[1]-a[1])*dy)/L2:0;t=Math.max(0,Math.min(1,t));
    const x=a[0]+t*dx,y=a[1]+t*dy;
    return {d:Math.hypot(pt[0]-x,pt[1]-y),x,y,t};
  }
  function distPath(pt,p,closed){
    let best=Infinity;
    for(let i=1;i<p.length;i++)best=Math.min(best,distSeg(pt,p[i-1],p[i]).d);
    if(closed&&p.length>2)best=Math.min(best,distSeg(pt,p[p.length-1],p[0]).d);
    return best;
  }
  /* Douglas–Peucker on a closed ring */
  function simplify(p,tol){
    if(p.length<5)return p.slice();
    const rdp=(pts)=>{
      if(pts.length<3)return pts;
      let dmax=0,idx=0;const a=pts[0],b=pts[pts.length-1];
      for(let i=1;i<pts.length-1;i++){const d=distSeg(pts[i],a,b).d;if(d>dmax){dmax=d;idx=i;}}
      if(dmax<=tol)return [a,b];
      return rdp(pts.slice(0,idx+1)).slice(0,-1).concat(rdp(pts.slice(idx)));
    };
    /* split the ring at its two most distant points so both halves are open chains */
    let far=0,fd=0;for(let i=1;i<p.length;i++){const d=d2(p[0],p[i]);if(d>fd){fd=d;far=i;}}
    const h1=rdp(p.slice(0,far+1)),h2=rdp(p.slice(far).concat([p[0]]));
    return h1.slice(0,-1).concat(h2.slice(0,-1));
  }

  /* move every edge of a polygon outward by d (inward when d < 0) */
  function offsetPoly(p,d){
    const n=p.length;if(n<3||!d)return p.slice();
    const sg=signedArea(p)>0?1:-1;          /* y down: positive = clockwise on screen */
    const nrm=(a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy)||1;return [-dy/L*sg,dx/L*sg];};
    return p.map((q,i)=>{
      const a=p[(i-1+n)%n],b=p[(i+1)%n],n1=nrm(a,q),n2=nrm(q,b);
      let bx=n1[0]+n2[0],by=n1[1]+n2[1];const bl=Math.hypot(bx,by);
      if(bl<1e-9)return [q[0]+n1[0]*d,q[1]+n1[1]*d];
      bx/=bl;by/=bl;const c=bx*n1[0]+by*n1[1];
      const k=d/Math.max(0.25,c);
      return [q[0]-bx*k,q[1]-by*k];
    });
  }

  /* ---------------- safe formula language ----------------
     numbers, variables, + - * / ^, brackets, min() max() abs() round().
     × and ÷ are accepted. No eval, no property access, nothing else. */
  const FNS={min:Math.min,max:Math.max,abs:Math.abs,round:(v,d)=>{const k=Math.pow(10,d||0);return Math.round(v*k)/k;}};
  const CACHE=new Map();
  function tokenize(s){
    const out=[];let i=0;s=String(s).replace(/×/g,'*').replace(/÷/g,'/');
    while(i<s.length){
      const c=s[i];
      if(/\s/.test(c)){i++;continue;}
      const m=/^(\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/.exec(s.slice(i));
      if(m){out.push({t:'n',v:parseFloat(m[0])});i+=m[0].length;continue;}
      const id=/^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
      if(id){out.push({t:'id',v:id[0]});i+=id[0].length;continue;}
      if('+-*/^(),'.indexOf(c)>=0){out.push({t:c});i++;continue;}
      throw new Error('Unexpected “'+c+'” in formula');
    }
    return out;
  }
  function compile(src){
    const key=String(src);
    if(CACHE.has(key))return CACHE.get(key);
    const tk=tokenize(key);let p=0;
    const peek=()=>tk[p],eat=t=>{if(tk[p]&&tk[p].t===t){p++;return true;}return false;};
    const need=t=>{if(!eat(t))throw new Error('Expected “'+t+'” in formula');};
    function expr(){let a=term();for(;;){if(eat('+')){const l=a,r=term();a=v=>l(v)+r(v);}else if(eat('-')){const l=a,r=term();a=v=>l(v)-r(v);}else return a;}}
    function term(){let a=unary();for(;;){if(eat('*')){const l=a,r=unary();a=v=>l(v)*r(v);}else if(eat('/')){const l=a,r=unary();a=v=>{const d=r(v);if(d===0)throw new Error('Division by zero');return l(v)/d;};}else return a;}}
    function unary(){if(eat('-')){const a=unary();return v=>-a(v);}if(eat('+'))return unary();return power();}
    function power(){const b=primary();if(eat('^')){const e=unary();return v=>Math.pow(b(v),e(v));}return b;}
    function primary(){
      const t=peek();
      if(!t)throw new Error('Formula ends too early');
      if(t.t==='n'){p++;const n=t.v;return ()=>n;}
      if(t.t==='('){p++;const a=expr();need(')');return a;}
      if(t.t==='id'){
        p++;
        if(eat('(')){
          const fn=FNS[t.v.toLowerCase()];
          if(!fn)throw new Error('Unknown function '+t.v+'()');
          const args=[];if(!eat(')')){do{args.push(expr());}while(eat(','));need(')');}
          return v=>fn.apply(null,args.map(a=>a(v)));
        }
        const name=t.v;
        return v=>{
          if(!Object.prototype.hasOwnProperty.call(v,name))throw new Error('Unknown value '+name);
          const x=Number(v[name]);if(!isFinite(x))throw new Error(name+' is not set');return x;
        };
      }
      throw new Error('Unexpected “'+t.t+'” in formula');
    }
    const fn=expr();
    if(p<tk.length)throw new Error('Unexpected “'+(tk[p].v||tk[p].t)+'” in formula');
    CACHE.set(key,fn);
    if(CACHE.size>2000)CACHE.delete(CACHE.keys().next().value);
    return fn;
  }
  function evalF(src,vars){
    try{const v=compile(src)(vars||{});if(!isFinite(v))return {ok:false,err:'Result is not a number'};return {ok:true,val:v};}
    catch(e){return {ok:false,err:e.message};}
  }
  function checkF(src,names){
    try{compile(src);}catch(e){return e.message;}
    const ids=tokenize(src).filter(t=>t.t==='id').map(t=>t.v);
    const bad=ids.filter((x,i)=>!FNS[x.toLowerCase()]&&names.indexOf(x)<0&&ids.indexOf(x)===i);
    return bad.length?('Unknown value'+(bad.length>1?'s ':' ')+bad.join(', ')):'';
  }

  /* ---------------- quantities from one trace ----------------
     area/rect: A (net of its cut-outs), P (outer perimeter), Pc (cut-out perimeters), Ag (gross)
     line: L    count: N    all in metres for the sheet's scale. */
  function traceQty(t,mpu,cuts){
    const q={A:0,Ag:0,P:0,Pc:0,L:0,N:0};
    if(t.kind==='count'){q.N=t.pts.length;return q;}
    if(!mpu)return null;
    if(t.kind==='line'){q.L=pathLen(t.pts,false)*mpu;return q;}
    if(t.kind==='area'){
      q.Ag=area(t.pts)*mpu*mpu;q.P=pathLen(t.pts,true)*mpu;
      let ded=0;(cuts||[]).forEach(c=>{ded+=area(c.pts)*mpu*mpu;q.Pc+=pathLen(c.pts,true)*mpu;});
      q.A=q.Ag-ded;return q;
    }
    return q;
  }
  return {d2,signedArea,area,pathLen,centroid,inPoly,segX,selfCross,distSeg,distPath,simplify,offsetPoly,
    compile,evalF,checkF,traceQty,FNS};
})();

/* ==========================================================================
   Assemblies — one trace, several bill items. Seeded for KSA building work;
   every formula is editable. Variables: A net area, Ag gross area, P perimeter,
   Pc cut-out perimeter, L length, N count, plus the assembly's own inputs.
   ========================================================================== */
const TK_TOOLS={area:'Area',line:'Linear',count:'Count'};
function tkSeedAssemblies(){
  const A=(id,name,tool,note,inputs,outs)=>({id,name,tool,note,seed:true,
    inputs:inputs.map(([k,label,def,unit])=>({k,label,def,unit:unit||'m'})),
    outs:outs.map(([wt,f,suffix])=>({wt,f,suffix:suffix||''}))});
  return [
    A('asm.pad','Isolated pad footings','count',
      'Click each footing of one type. Working space 300 mm and blinding projection 100 mm each side.',
      [['L','Footing length',2.0],['W','Footing width',2.0],['D','Footing depth',0.6],['E','Excavation depth below ground',1.8],['K','Reinforcement density',110,'kg/m³']],
      [['exc.pit','N*(L+0.8)*(W+0.8)*E'],['comp.surf','N*(L+0.8)*(W+0.8)'],
       ['conc.blind','N*(L+0.2)*(W+0.2)*0.075'],['conc.pad','N*L*W*D'],['fw.pad','N*2*(L+W)*D'],
       ['rebar.sub','N*L*W*D*K/1000'],
       ['fill.back','N*max(0,(L+0.8)*(W+0.8)*E-(L+0.2)*(W+0.2)*0.075-L*W*D)'],
       ['disp.off','N*((L+0.2)*(W+0.2)*0.075+L*W*min(D,E))']]),
    A('asm.gbeam','Ground beams','line',
      'Trace the beam centre line. Trench 400 mm wider than the beam each side.',
      [['W','Beam width',0.3],['H','Beam depth',0.6],['E','Excavation depth',1.0],['K','Reinforcement density',140,'kg/m³']],
      [['exc.trench','L*(W+0.8)*E'],['conc.blind','L*(W+0.2)*0.075'],['conc.gbeam','L*W*H'],
       ['fw.gbeam','L*2*H'],['rebar.sub','L*W*H*K/1000'],
       ['fill.back','L*max(0,(W+0.8)*E-(W+0.2)*0.075-W*min(H,E))'],
       ['disp.off','L*((W+0.2)*0.075+W*min(H,E))']]),
    A('asm.gslab','Ground bearing slab','area',
      'Trace the slab outline; cut out pits and openings.',
      [['T','Slab thickness',0.2],['Hc','Sub-base thickness',0.3]],
      [['comp.surf','A'],['fill.hard','A*Hc','sub-base under ground slab'],['termite','A'],['dpm','A'],
       ['conc.gslab','A*T'],['mesh','A'],['fw.edge','P*T']]),
    A('asm.sslab','Suspended RC slab','area',
      'Trace the slab edge; cut out shafts and voids. Edge formwork on the outer perimeter only.',
      [['T','Slab thickness',0.2],['K','Reinforcement density',105,'kg/m³']],
      [['conc.slab','A*T'],['fw.soffit','A'],['fw.sedge','P*T'],['rebar.sup','A*T*K/1000']]),
    A('asm.beam','RC downstand beams','line',
      'Trace beam centre lines. Concrete measured below the slab only.',
      [['W','Beam width',0.3],['D','Overall depth',0.6],['T','Slab thickness',0.2],['K','Reinforcement density',160,'kg/m³']],
      [['conc.beam','L*W*(D-T)'],['fw.beam','L*(W+2*(D-T))'],['rebar.sup','L*W*(D-T)*K/1000']]),
    A('asm.col','RC columns','count',
      'Click each column of one size on the plan.',
      [['B','Column width',0.4],['D','Column depth',0.4],['H','Clear height',3.0],['K','Reinforcement density',190,'kg/m³']],
      [['conc.col','N*B*D*H'],['fw.col','N*2*(B+D)*H'],['rebar.sup','N*B*D*H*K/1000']]),
    A('asm.extwall','External blockwork wall','line',
      'Trace the wall centre line. External face finishes included; internal face finishes are measured by room.',
      [['H','Wall height',3.0],['Op','Openings to deduct from each trace',0,'m²']],
      [['wall.ext.block','L*H-Op'],['render.ext','L*H-Op'],['paint.ext','L*H-Op'],['dpc','L']]),
    A('asm.intwall','Internal blockwork wall','line',
      'Trace the wall centre line. Plaster and paint are measured by room.',
      [['H','Wall height',3.0],['Op','Openings to deduct from each trace',0,'m²']],
      [['wall.int.block','L*H-Op']]),
    A('asm.drywall','Drywall partition','line',
      'Trace the partition centre line. Decoration is measured by room.',
      [['H','Partition height',3.0],['Op','Openings to deduct from each trace',0,'m²']],
      [['part.dry','L*H-Op']]),
    A('asm.room','Room finishes','area',
      'Trace the room to the internal face of walls; cut out columns inside it.',
      [['H','Ceiling height',3.0],['Op','Openings to deduct from each trace',0,'m²']],
      [['screed.fl','A'],['tile.floor','A'],['skirt','P+Pc'],['plaster.wall','(P+Pc)*H-Op'],
       ['paint.int','(P+Pc)*H-Op'],['ceil.gyp','A'],['paint.ceil','A']]),
    A('asm.wet','Wet room finishes','area',
      'Toilets, bathrooms and kitchens. Wall tiling to a set height, emulsion above.',
      [['H','Ceiling height',3.0],['Ht','Wall tiling height',2.4],['Op','Openings to deduct from each trace',0,'m²']],
      [['screed.fl','A'],['tile.floor','A'],['plaster.wall','(P+Pc)*H-Op'],['tile.wall','(P+Pc)*Ht-Op'],
       ['paint.int','(P+Pc)*max(0,H-Ht)'],['ceil.gyp','A','moisture resistant board'],['paint.ceil','A']]),
    A('asm.roof','Flat roof build-up','area',
      'Trace the roof to the inside of parapets.',
      [['U','Upstand height',0.3]],
      [['roof.screed','A'],['roof.insul','A'],['roof.memb','A+P*U'],['roof.prot','A'],['roof.flash','P']]),
    A('asm.paving','External paving','area',
      'Trace each paved area. Kf is the share of the perimeter that has a kerb.',
      [['Kf','Kerbed share of perimeter',1,'—']],
      [['ext.paving','A'],['ext.kerb','P*Kf']])
  ];
}
const TK_COLORS=['#2F6FDE','#D9480F','#2B8A3E','#AE3EC9','#C2255C','#1098AD','#E67700','#5F3DC4','#087F5B','#A61E4D','#364FC7','#5C940D'];

/* ==========================================================================
   Part T2: take-off state, storage of drawings and traces, sheet loading,
   vector geometry for snapping, and outline detection for one-click rooms.
   ========================================================================== */
const TK={
  sheet:null,          /* id of the sheet on screen */
  group:null,          /* active dimension group */
  tool:'select',
  pts:[],              /* points of the shape being drawn */
  sel:null,            /* selected trace id */
  hover:null,          /* {x,y,kind} snap or hover point in page units */
  ortho:false, snapOn:true, labels:true,
  view:{z:1,x:0,y:0},  /* screen = page*z + (x,y), CSS pixels */
  docs:{},             /* file key -> {pdf, err, loading:Promise} */
  dxf:{},              /* file key -> parsed DXF geometry */
  geo:{},              /* sheet id -> vector index */
  pageInfo:{},         /* sheet id -> pdf page object */
  undo:[],redo:[],
  dirty:new Set(),     /* sheet ids whose traces need saving */
  root:null,assets:undefined,rseq:0,rtask:null,rtimer:null,raf:0,
  side:'groups'
};
function ensureTK(){
  if(!P.tk||typeof P.tk!=='object')P.tk={v:1,sheets:[],groups:[],asms:tkSeedAssemblies(),traces:[]};
  const t=P.tk;
  t.sheets=t.sheets||[];t.groups=t.groups||[];t.traces=t.traces||[];
  if(!Array.isArray(t.asms)||!t.asms.length)t.asms=tkSeedAssemblies();
  return t;
}
const tkSheet=id=>(ensureTK().sheets.find(s=>s.id===(id===undefined?TK.sheet:id))||null);
const tkGroup=id=>(ensureTK().groups.find(g=>g.id===(id===undefined?TK.group:id))||null);
const tkAsm=id=>(ensureTK().asms.find(a=>a.id===id)||null);
const tkTraces=(sid)=>ensureTK().traces.filter(t=>t.s===sid);
function tkResetSession(){
  TK.sheet=null;TK.group=null;TK.tool='select';TK.pts=[];TK.sel=null;TK.hover=null;
  TK.undo=[];TK.redo=[];TK.dirty=new Set();TK.geo={};TK.pageInfo={};
  /* drawings already opened in this browser session stay cached by file key */
}
function tkMark(sid){if(sid)TK.dirty.add(sid);}

/* ---------- undo: snapshot the traces (and sheet scales) before each change ---------- */
function tkSnap(){
  const t=ensureTK();
  TK.undo.push(JSON.stringify({tr:t.traces,sc:t.sheets.map(s=>({id:s.id,mpu:s.mpu,scale:s.scale,checked:s.checked}))}));
  if(TK.undo.length>80)TK.undo.shift();
  TK.redo=[];
}
function tkRestore(json){
  const t=ensureTK(),o=JSON.parse(json);
  t.traces=o.tr;
  o.sc.forEach(x=>{const s=t.sheets.find(q=>q.id===x.id);if(s){s.mpu=x.mpu;s.scale=x.scale;s.checked=x.checked;}});
  t.sheets.forEach(s=>tkMark(s.id));
}
function tkUndo(){
  if(!TK.undo.length){toast('Nothing to undo');return;}
  const t=ensureTK();
  TK.redo.push(JSON.stringify({tr:t.traces,sc:t.sheets.map(s=>({id:s.id,mpu:s.mpu,scale:s.scale,checked:s.checked}))}));
  tkRestore(TK.undo.pop());TK.sel=null;TK.pts=[];tkChanged();
}
function tkRedo(){
  if(!TK.redo.length){toast('Nothing to redo');return;}
  const t=ensureTK();
  TK.undo.push(JSON.stringify({tr:t.traces,sc:t.sheets.map(s=>({id:s.id,mpu:s.mpu,scale:s.scale,checked:s.checked}))}));
  tkRestore(TK.redo.pop());TK.sel=null;tkChanged();
}

/* ---------- saving: the project document carries groups, assemblies and sheets;
   traces go in their own documents, one or more per sheet, so big jobs never
   hit the size limit of the project record. ---------- */
const TK_CHUNK=190000;
function tkSheetDocs(sid){
  const list=tkTraces(sid).map(t=>({id:t.id,g:t.g,kind:t.kind,n:t.n,parent:t.parent||null,
    pts:t.pts.map(p=>[Math.round(p[0]*100)/100,Math.round(p[1]*100)/100])}));
  const chunks=[];let cur=[],len=2;
  list.forEach(t=>{const s=JSON.stringify(t);
    if(len+s.length>TK_CHUNK&&cur.length){chunks.push(cur);cur=[];len=2;}
    cur.push(t);len+=s.length+1;});
  if(cur.length||!chunks.length)chunks.push(cur);
  return chunks;
}
/* called by saveProject before the project document is written */
async function tkBeforeSave(db,pid){
  const t=P.tk;if(!t||!db)return true;
  const live=new Set(t.sheets.map(s=>s.id));
  /* sheets deleted since the last save: remove their documents */
  for(const sid of Array.from(TK.dirty)){
    if(live.has(sid))continue;
    const n=(TK.deletedChunks&&TK.deletedChunks[sid])||1;
    for(let i=0;i<n;i++){try{await db.doc('projects/'+pid+'/tk/'+sid+'~'+i).delete();}catch(e){}}
    TK.dirty.delete(sid);
  }
  for(const s of t.sheets){
    if(!TK.dirty.has(s.id)&&s.savedTo===pid)continue;
    const chunks=tkSheetDocs(s.id),old=s.chunks||0;
    for(let i=0;i<chunks.length;i++){
      await db.doc('projects/'+pid+'/tk/'+s.id+'~'+i).set({sheet:s.id,part:i,of:chunks.length,
        updated:new Date().toISOString(),data:JSON.stringify(chunks[i])});
    }
    for(let i=chunks.length;i<old;i++){try{await db.doc('projects/'+pid+'/tk/'+s.id+'~'+i).delete();}catch(e){}}
    s.chunks=chunks.length;s.savedTo=pid;
    TK.dirty.delete(s.id);
  }
  return true;
}
/* the project record never carries the traces themselves */
function tkStripReplacer(k,v){return (k==='traces'&&P.tk&&v===P.tk.traces)?undefined:v;}
async function tkAfterOpen(pid){
  tkResetSession();
  const t=ensureTK();t.traces=[];
  if(!t.sheets.length)return;
  const db=await getDB();if(!db)return;
  let missing=0;
  for(const s of t.sheets){
    for(let i=0;i<(s.chunks||0);i++){
      try{
        const snap=await db.doc('projects/'+pid+'/tk/'+s.id+'~'+i).get();
        if(!snap.exists){missing++;continue;}
        const arr=JSON.parse(snap.data().data||'[]');
        arr.forEach(x=>t.traces.push(Object.assign({s:s.id},x)));
      }catch(e){missing++;}
    }
    s.savedTo=pid;
  }
  if(missing)toast(missing+' part'+(missing>1?'s':'')+' of the take-off could not be read back. Check the measurements before relying on them.',5000);
  TK.sheet=t.sheets[0].id;
  render();
}

/* ---------- drawing files ---------- */
async function tkAssets(){
  if(TK.assets!==undefined)return TK.assets;
  try{TK.assets=await claude.use('assets');}catch(e){TK.assets=null;}
  return TK.assets;
}
function tkFileKey(s){return s.src&&(s.src.asset||s.src.url||s.src.key);}
async function tkOpenPdfBytes(buf){
  return pdfjsLib.getDocument({data:buf,isEvalSupported:false}).promise;
}
/* returns the pdf.js document for a sheet, loading it once per file */
function tkDoc(s){
  const key=tkFileKey(s);
  if(!key)return Promise.reject(new Error('This sheet has no drawing attached.'));
  const d=TK.docs[key];
  if(d&&d.loading)return d.loading;
  const rec={};
  rec.loading=(async()=>{
    let buf;
    if(s.src.asset){
      const r=await fetch('/_blob/'+s.src.asset);
      if(!r.ok)throw new Error('The stored drawing could not be loaded ('+r.status+').');
      buf=await r.arrayBuffer();
    }else if(s.src.url){
      const r=await fetch(s.src.url);
      if(!r.ok)throw new Error('The example drawing could not be loaded.');
      buf=await r.arrayBuffer();
    }else throw new Error('This drawing was attached for one session only. Attach the file again to keep measuring.');
    if(s.src.type==='dxf'){const g=tkParseDXF(new TextDecoder().decode(buf));TK.dxf[key]=g;return g;}
    return tkOpenPdfBytes(new Uint8Array(buf));
  })();
  rec.loading.catch(e=>{rec.err=e;delete TK.docs[key];});
  TK.docs[key]=rec;
  return rec.loading;
}

/* ---------- DXF as a sheet: lines, polylines, arcs and circles, y flipped ---------- */
function tkParseDXF(text){
  const lines=text.split(/\r?\n/),segs=[],polys=[];
  let ent=null,c=null,inEnt=false,vx=[];
  const g=(k)=>parseFloat((c[k]||[])[0]);
  const arc=(cx,cy,r,a1,a2)=>{
    let sw=a2-a1;if(sw<=0)sw+=360;
    const n=Math.max(8,Math.ceil(sw/10)),out=[];
    for(let i=0;i<=n;i++){const a=(a1+sw*i/n)*Math.PI/180;out.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]);}
    return out;
  };
  const flush=()=>{
    if(!ent||!c)return;
    if(ent==='LINE'){const a=[g('10'),g('20')],b=[g('11'),g('21')];if(a.concat(b).every(isFinite))segs.push(a.concat(b));}
    else if(ent==='CIRCLE'||ent==='ARC'){
      const cx=g('10'),cy=g('20'),r=g('40');
      if([cx,cy,r].every(isFinite)&&r>0){
        const pts=ent==='CIRCLE'?arc(cx,cy,r,0,360):arc(cx,cy,r,g('50'),g('51'));
        for(let i=1;i<pts.length;i++)segs.push(pts[i-1].concat(pts[i]));
        if(ent==='CIRCLE')polys.push(pts.slice(0,-1));
      }
    }else if(ent==='LWPOLYLINE'||ent==='POLYLINE'){
      const xs=(c['10']||[]).map(parseFloat),ys=(c['20']||[]).map(parseFloat);
      let pts=[];for(let i=0;i<Math.min(xs.length,ys.length);i++)if(isFinite(xs[i])&&isFinite(ys[i]))pts.push([xs[i],ys[i]]);
      if(ent==='POLYLINE'){pts=vx;}
      const closed=(parseInt((c['70']||['0'])[0],10)&1)===1;
      for(let i=1;i<pts.length;i++)segs.push(pts[i-1].concat(pts[i]));
      if(closed&&pts.length>2){segs.push(pts[pts.length-1].concat(pts[0]));polys.push(pts);}
    }
    ent=null;c=null;vx=[];
  };
  for(let i=0;i+1<lines.length;i+=2){
    const code=lines[i].trim(),val=lines[i+1].trim();
    if(code==='0'){
      const v=val.toUpperCase();
      if(v==='VERTEX'&&ent==='POLYLINE'){inEnt=true;continue;}
      if(v==='SEQEND'&&ent==='POLYLINE'){flush();inEnt=false;continue;}
      if(ent==='POLYLINE'&&inEnt)continue;
      flush();
      if({LINE:1,CIRCLE:1,ARC:1,LWPOLYLINE:1,POLYLINE:1}[v]){ent=v;c={};}
      continue;
    }
    if(!c)continue;
    if(ent==='POLYLINE'&&inEnt){
      if(code==='10')vx.push([parseFloat(val),NaN]);
      else if(code==='20'&&vx.length)vx[vx.length-1][1]=parseFloat(val);
      continue;
    }
    (c[code]=c[code]||[]).push(val);
  }
  flush();
  if(!segs.length)throw new Error('No lines, polylines or arcs were found in that DXF.');
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  segs.forEach(s=>{x0=Math.min(x0,s[0],s[2]);x1=Math.max(x1,s[0],s[2]);y0=Math.min(y0,s[1],s[3]);y1=Math.max(y1,s[1],s[3]);});
  const pad=Math.max(x1-x0,y1-y0)*0.03;
  const fx=x=>x-x0+pad,fy=y=>y1-y+pad;
  return {w:x1-x0+2*pad,h:y1-y0+2*pad,
    segs:segs.map(s=>[fx(s[0]),fy(s[1]),fx(s[2]),fy(s[3])]),
    polys:polys.map(p=>p.map(q=>[fx(q[0]),fy(q[1])]))};
}

/* ---------- vector geometry of a PDF page, in page units (y down) ---------- */
async function tkVector(s){
  if(TK.geo[s.id])return TK.geo[s.id];
  let segs=[],polys=[],images=0;
  if(s.src.type==='dxf'){
    const g=await tkDoc(s);segs=g.segs;polys=g.polys;
  }else{
    const pdf=await tkDoc(s);
    const page=await pdf.getPage(s.src.page||1);
    const vp=page.getViewport({scale:1});
    const ops=await page.getOperatorList();
    const OPS=pdfjsLib.OPS;
    const mul=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],
      a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
    let ctm=vp.transform.slice();const stack=[];
    const ap=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
    const need={};need[OPS.moveTo]=2;need[OPS.lineTo]=2;need[OPS.curveTo]=6;
    need[OPS.curveTo2]=4;need[OPS.curveTo3]=4;need[OPS.closePath]=0;need[OPS.rectangle]=4;
    for(let i=0;i<ops.fnArray.length&&segs.length<400000;i++){
      const fn=ops.fnArray[i],args=ops.argsArray[i];
      if(fn===OPS.save){stack.push(ctm.slice());continue;}
      if(fn===OPS.restore){ctm=stack.pop()||vp.transform.slice();continue;}
      if(fn===OPS.transform){ctm=mul(ctm,args);continue;}
      if(fn===OPS.paintImageXObject||fn===OPS.paintInlineImageXObject||fn===OPS.paintJpegXObject){images++;continue;}
      if(fn!==OPS.constructPath)continue;
      const pOps=args[0],co=args[1];
      let k=0,cur=[],start=null;
      const close=(closed)=>{
        if(cur.length>1){
          for(let j=1;j<cur.length;j++)segs.push([cur[j-1][0],cur[j-1][1],cur[j][0],cur[j][1]]);
          if(closed&&cur.length>2){segs.push([cur[cur.length-1][0],cur[cur.length-1][1],cur[0][0],cur[0][1]]);polys.push(cur);}
        }
        cur=[];
      };
      for(let o=0;o<pOps.length;o++){
        const op=pOps[o],n=need[op]===undefined?0:need[op];
        if(op===OPS.rectangle){
          close(false);
          const x=co[k],y=co[k+1],w=co[k+2],h=co[k+3];
          const q=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(p=>ap(ctm,p[0],p[1]));
          for(let j=0;j<4;j++)segs.push([q[j][0],q[j][1],q[(j+1)%4][0],q[(j+1)%4][1]]);
          polys.push(q);
        }else if(op===OPS.moveTo){close(false);cur=[ap(ctm,co[k],co[k+1])];start=cur[0];}
        else if(op===OPS.lineTo){cur.push(ap(ctm,co[k],co[k+1]));}
        else if(op===OPS.curveTo){cur.push(ap(ctm,co[k+4],co[k+5]));}
        else if(op===OPS.curveTo2||op===OPS.curveTo3){cur.push(ap(ctm,co[k+2],co[k+3]));}
        else if(op===OPS.closePath){close(true);}
        k+=n;
      }
      close(false);
    }
  }
  /* drop specks (text glyph fragments, hatch dots) that make snapping noisy */
  segs=segs.filter(q=>Math.hypot(q[2]-q[0],q[3]-q[1])>0.4);
  const idx=tkBuildIndex(segs);
  const g={segs,polys,images,idx,vector:segs.length>=40};
  TK.geo[s.id]=g;
  if(s.vector!==g.vector){s.vector=g.vector;}
  return g;
}
/* grid buckets of segments so snapping only looks at nearby lines */
function tkBuildIndex(segs){
  let x1=0,y1=0;segs.forEach(s=>{x1=Math.max(x1,s[0],s[2]);y1=Math.max(y1,s[1],s[3]);});
  const cell=Math.max(8,Math.sqrt((x1*y1)/Math.max(1,segs.length))*2);
  const map=new Map();
  segs.forEach((s,i)=>{
    const ax=Math.floor(Math.min(s[0],s[2])/cell),bx=Math.floor(Math.max(s[0],s[2])/cell);
    const ay=Math.floor(Math.min(s[1],s[3])/cell),by=Math.floor(Math.max(s[1],s[3])/cell);
    if((bx-ax+1)*(by-ay+1)>400){
      /* very long line: register along its length only */
      const n=Math.ceil(Math.hypot(s[2]-s[0],s[3]-s[1])/cell)+1;
      for(let k=0;k<=n;k++){const x=s[0]+(s[2]-s[0])*k/n,y=s[1]+(s[3]-s[1])*k/n;
        const key=Math.floor(x/cell)+','+Math.floor(y/cell);let a=map.get(key);if(!a)map.set(key,a=[]);if(a[a.length-1]!==i)a.push(i);}
      return;
    }
    for(let x=ax;x<=bx;x++)for(let y=ay;y<=by;y++){const key=x+','+y;let a=map.get(key);if(!a)map.set(key,a=[]);a.push(i);}
  });
  return {cell,map};
}
function tkNearSegs(g,pt,r){
  const {cell,map}=g.idx,out=new Set();
  const ax=Math.floor((pt[0]-r)/cell),bx=Math.floor((pt[0]+r)/cell),ay=Math.floor((pt[1]-r)/cell),by=Math.floor((pt[1]+r)/cell);
  for(let x=ax;x<=bx;x++)for(let y=ay;y<=by;y++){const a=map.get(x+','+y);if(a)a.forEach(i=>out.add(i));}
  return Array.from(out).slice(0,600);
}
/* best snap within r page units: end > intersection > mid > on line */
function tkSnapPoint(s,pt,r){
  const g=TK.geo[s.id];if(!g||!g.vector)return null;
  const ids=tkNearSegs(g,pt,r);if(!ids.length)return null;
  let best=null;
  const consider=(x,y,kind,rank)=>{
    const d=Math.hypot(x-pt[0],y-pt[1]);if(d>r)return;
    const score=d+rank*r*0.35;
    if(!best||score<best.score)best={x,y,kind,score};
  };
  const near=[];
  ids.forEach(i=>{
    const q=g.segs[i];
    consider(q[0],q[1],'end',0);consider(q[2],q[3],'end',0);
    consider((q[0]+q[2])/2,(q[1]+q[3])/2,'mid',1.2);
    const ds=TKCore.distSeg(pt,[q[0],q[1]],[q[2],q[3]]);
    if(ds.d<=r){consider(ds.x,ds.y,'line',2.2);near.push(q);}
  });
  for(let i=0;i<near.length&&i<60;i++)for(let j=i+1;j<near.length&&j<60;j++){
    const a=near[i],b=near[j];
    const x=TKCore.segX([a[0],a[1]],[a[2],a[3]],[b[0],b[1]],[b[2],b[3]]);
    if(x)consider(x[0],x[1],'int',0.1);
  }
  return best;
}

/* ---------- one-click room: flood the enclosed space on a raster of the sheet,
   trace its outline, simplify, then pull corners onto the vector lines ---------- */
async function tkFillAt(s,pt){
  const span=Math.max(s.w,s.h);
  const scale=Math.min(6,Math.max(1.5,3600/span));     /* raster pixels per page unit */
  const W=Math.ceil(s.w*scale),H=Math.ceil(s.h*scale);
  if(W*H>40e6)throw new Error('This sheet is too large to fill automatically. Trace the outline instead.');
  const cv=document.createElement('canvas');cv.width=W;cv.height=H;
  const cx=cv.getContext('2d',{willReadFrequently:true});
  cx.fillStyle='#fff';cx.fillRect(0,0,W,H);
  if(s.src.type==='dxf'){
    const g=await tkVector(s);cx.strokeStyle='#000';cx.lineWidth=1.6;cx.beginPath();
    g.segs.forEach(q=>{cx.moveTo(q[0]*scale,q[1]*scale);cx.lineTo(q[2]*scale,q[3]*scale);});cx.stroke();
  }else{
    const pdf=await tkDoc(s),page=await pdf.getPage(s.src.page||1);
    await page.render({canvasContext:cx,viewport:page.getViewport({scale})}).promise;
  }
  const img=cx.getImageData(0,0,W,H).data;
  /* ink threshold from the sheet itself: paper is the bright bulk of the histogram,
     anything clearly darker is linework (faint anti-aliased arcs on scans included) */
  const lum=new Uint8Array(W*H),hist=new Uint32Array(256);
  for(let i=0,j=0;i<lum.length;i++,j+=4){const l=(0.3*img[j]+0.59*img[j+1]+0.11*img[j+2])|0;lum[i]=l;hist[l]++;}
  let acc=0,paper=255;for(let v=255;v>=0;v--){acc+=hist[v];if(acc>=lum.length*0.5){paper=v;break;}}
  const thr=Math.max(120,paper-Math.max(14,(255-paper)*1.5+10));
  const wall=new Uint8Array(W*H);
  for(let i=0;i<wall.length;i++)wall[i]=lum[i]<thr?1:0;
  /* close hairline gaps of one pixel so dashed or touching lines still bound the room */
  const thick=new Uint8Array(wall);
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;if(wall[i]){thick[i-1]=thick[i+1]=thick[i-W]=thick[i+W]=1;}}
  const sx=Math.round(pt[0]*scale),sy=Math.round(pt[1]*scale);
  if(sx<1||sy<1||sx>=W-1||sy>=H-1||thick[sy*W+sx])throw new Error('Click in the open space of a room, not on a line.');
  const seen=new Uint8Array(W*H),stack=[sy*W+sx];seen[sy*W+sx]=1;
  let count=0,touches=false;const limit=W*H*0.35;
  while(stack.length){
    const i=stack.pop();count++;
    if(count>limit){throw new Error('That space is not closed — the fill ran out through a gap such as a door. Trace it by hand or close the gap with a line.');}
    const x=i%W,y=(i-x)/W;
    if(x<=1||y<=1||x>=W-2||y>=H-2){touches=true;continue;}
    const nb=[i-1,i+1,i-W,i+W];
    for(const k of nb)if(!seen[k]&&!thick[k]){seen[k]=1;stack.push(k);}
  }
  if(touches)throw new Error('That space runs off the edge of the sheet. Trace it by hand.');
  const ring=tkTraceMask(seen,W,H);
  if(ring.length<4)throw new Error('The space is too small to measure.');
  /* back to page units, outward by half a pixel, simplified */
  let poly=TKCore.simplify(ring.map(p=>[p[0]+0.5,p[1]+0.5]),0.9);
  /* how thick is the linework round this room? walk outward across the ink at
     sample points and move the outline to the centre of the line it stopped at */
  const sg=TKCore.signedArea(poly)>0?1:-1,runs=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],L=TKCore.d2(a,b);if(L<4)continue;
    const nx=(b[1]-a[1])/L*sg,ny=-(b[0]-a[0])/L*sg;   /* outward, matching offsetPoly */
    for(let k=1;k<4;k++){
      const px=a[0]+(b[0]-a[0])*k/4,py=a[1]+(b[1]-a[1])*k/4;
      let r=0;
      for(let d=0.5;d<16;d+=0.5){const x=Math.round(px+nx*d),y=Math.round(py+ny*d);
        if(x<0||y<0||x>=W||y>=H)break;if(thick[y*W+x]){r=d;}else if(r)break;}
      if(r)runs.push(r);
    }
  }
  runs.sort((x,y)=>x-y);
  const run=runs.length?runs[Math.floor(runs.length/2)]:2;
  const dil=Math.max(1,Math.min(5,(run-1)/2+0.5));
  poly=TKCore.offsetPoly(poly,dil).map(p=>[p[0]/scale,p[1]/scale]);
  const g=TK.geo[s.id];
  if(g&&g.vector){
    poly=poly.map(p=>{const sn=tkSnapPoint(s,p,4/scale+1.2);return sn&&sn.kind!=='line'?[sn.x,sn.y]:p;});
  }
  poly=poly.filter((p,i)=>TKCore.d2(p,poly[(i+1)%poly.length])>1e-6);
  if(poly.length<3)throw new Error('The outline could not be resolved. Trace it by hand.');
  return poly;
}

/* Moore-neighbour boundary of a filled mask (1 = inside), Jacob's stopping rule.
   Returns pixel centres in order round the outside of the region. */
function tkTraceMask(m,W,H){
  let start=-1;
  for(let i=0;i<m.length;i++){if(m[i]===1){start=i;break;}}
  if(start<0)return [];
  const inR=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&m[y*W+x]===1;
  const dirs=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const sx=start%W,sy=(start-sx)/W;
  let x=sx,y=sy,d=0,first=-1;const ring=[];
  for(let guard=0;guard<4*W*H+8;guard++){
    let moved=-1;
    for(let k=0;k<8;k++){
      const nd=(d+6+k)%8;
      if(inR(x+dirs[nd][0],y+dirs[nd][1])){moved=nd;break;}
    }
    if(moved<0){ring.push([x,y]);break;}            /* single pixel */
    if(x===sx&&y===sy){
      if(first<0)first=moved;
      else if(moved===first)break;
    }
    ring.push([x,y]);
    x+=dirs[moved][0];y+=dirs[moved][1];d=moved;
  }
  return ring;
}

/* ==========================================================================
   Part T3: the measuring canvas — sheet rendering, pan and zoom, tools,
   snapping, ortho, vertex editing. Two stacked canvases: the drawing
   (re-rendered only when the view settles) and the overlay (every frame).
   ========================================================================== */
const TK_TOOLDEF={
  select:{label:'Select',key:'V',hint:'Click a measurement to select it. Drag a corner to move it. Delete removes it.'},
  area:{label:'Area',key:'A',kind:'area',hint:'Click round the outline. Click the first point, double-click or press Enter to close.'},
  rect:{label:'Rectangle',key:'R',kind:'area',hint:'Click two opposite corners.'},
  fill:{label:'Fill room',key:'F',kind:'area',hint:'Click inside an enclosed space to take its outline. A door swing drawn with its arc is taken in too — drag corners to adjust.'},
  cut:{label:'Cut-out',key:'X',kind:'area',hint:'Trace a void inside an area of this group. It is deducted from that area.'},
  line:{label:'Linear',key:'L',kind:'line',hint:'Click along the run. Double-click, right-click or Enter to finish.'},
  count:{label:'Count',key:'C',kind:'count',hint:'Click each item. Enter or Esc ends the count.'},
  chk:{label:'Check',key:'D',hint:'Click both ends of a dimension written on the drawing to check the scale.'},
  cal:{label:'Calibrate',key:'K',hint:'Click both ends of a dimension you know, then type its length.'}
};
const TK_DRAWTOOLS={area:['area','rect','fill','cut'],line:['line'],count:['count']};

function tkDpr(){return Math.min(2.5,window.devicePixelRatio||1);}
function tkToScreen(p){const v=TK.view;return [p[0]*v.z+v.x,p[1]*v.z+v.y];}
function tkToPage(sx,sy){const v=TK.view;return [(sx-v.x)/v.z,(sy-v.y)/v.z];}
function tkStageSize(){const st=TK.stage;return st?{w:st.clientWidth,h:st.clientHeight}:{w:800,h:600};}
function tkSizeCanvases(){
  if(!TK.stage)return false;
  const {w,h}=tkStageSize(),d=tkDpr();
  let changed=false;
  [TK.cv,TK.ov].forEach(c=>{
    const W=Math.max(1,Math.round(w*d)),H=Math.max(1,Math.round(h*d));
    if(c.width!==W||c.height!==H){c.width=W;c.height=H;changed=true;}
    c.style.width=w+'px';c.style.height=h+'px';
  });
  return changed;
}
function tkFit(){
  const s=tkSheet();if(!s||!TK.stage)return;
  const {w,h}=tkStageSize();
  const z=Math.min(w/s.w,h/s.h)*0.96;
  TK.view={z,x:(w-s.w*z)/2,y:(h-s.h*z)/2};
  tkViewChanged(true);
}
function tkFitBox(x0,y0,x1,y1){
  const {w,h}=tkStageSize(),pad=Math.max(x1-x0,y1-y0)*0.08+8;
  x0-=pad;y0-=pad;x1+=pad;y1+=pad;
  const z=Math.min(w/(x1-x0),h/(y1-y0));
  TK.view={z,x:(w-(x1-x0)*z)/2-x0*z,y:(h-(y1-y0)*z)/2-y0*z};
  tkViewChanged(true);
}
function tkFitTraces(){
  const s=tkSheet();if(!s)return false;
  const tr=tkTraces(s.id);if(!tr.length)return false;
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  tr.forEach(t=>t.pts.forEach(p=>{x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]);}));
  if(!(x1>x0)||!(y1>y0))return false;
  tkFitBox(x0,y0,x1,y1);return true;
}
function tkZoomAt(sx,sy,f){
  const v=TK.view,s=tkSheet();if(!s)return;
  const {w,h}=tkStageSize();
  const zmin=Math.min(w/s.w,h/s.h)*0.25,zmax=40;
  const z=Math.max(zmin,Math.min(zmax,v.z*f));
  TK.view={z,x:sx-(sx-v.x)*(z/v.z),y:sy-(sy-v.y)*(z/v.z)};
  tkViewChanged();
}
/* preview the last bitmap at the new view at once, re-render sharp when the view settles */
function tkViewChanged(now){
  tkPaintPreview();tkDrawOverlay();
  clearTimeout(TK.rtimer);
  TK.rtimer=setTimeout(tkRenderSheet,now?0:140);
}
function tkPaintPreview(){
  const c=TK.cv;if(!c)return;
  const cx=c.getContext('2d'),d=tkDpr();
  cx.setTransform(1,0,0,1,0,0);
  cx.fillStyle=getComputedStyle(TK.stage).getPropertyValue('--tk-sheet')||'#fff';
  cx.fillRect(0,0,c.width,c.height);
  const sn=TK.snapBmp;
  if(sn&&sn.sheet===TK.sheet){
    const v=TK.view,k=v.z/sn.z;
    cx.setTransform(k,0,0,k,d*(v.x-sn.x*k),d*(v.y-sn.y*k));
    cx.drawImage(sn.canvas,0,0);
    cx.setTransform(1,0,0,1,0,0);
  }
}
async function tkRenderSheet(){
  const s=tkSheet();if(!s||!TK.cv||!TK.root||!TK.root.isConnected)return;
  tkSizeCanvases();
  const seq=++TK.rseq;
  const v=Object.assign({},TK.view),d=tkDpr(),c=TK.cv;
  const off=document.createElement('canvas');off.width=c.width;off.height=c.height;
  const cx=off.getContext('2d');
  cx.fillStyle='#ffffff';cx.fillRect(0,0,off.width,off.height);
  try{
    if(s.src.type==='dxf'){
      const g=await tkVector(s);
      cx.setTransform(v.z*d,0,0,v.z*d,v.x*d,v.y*d);
      cx.strokeStyle='#1b1f2a';cx.lineWidth=1/(v.z);cx.beginPath();
      const p0=tkToPage(0,0),p1=tkToPage(c.width/d,c.height/d);
      g.segs.forEach(q=>{
        if(Math.max(q[0],q[2])<p0[0]||Math.min(q[0],q[2])>p1[0]||Math.max(q[1],q[3])<p0[1]||Math.min(q[1],q[3])>p1[1])return;
        cx.moveTo(q[0],q[1]);cx.lineTo(q[2],q[3]);});
      cx.stroke();
    }else{
      const pdf=await tkDoc(s);
      if(seq!==TK.rseq)return;
      const page=TK.pageInfo[s.id]||(TK.pageInfo[s.id]=await pdf.getPage(s.src.page||1));
      if(TK.rtask){try{TK.rtask.cancel();}catch(e){}}
      const vp=page.getViewport({scale:v.z*d,offsetX:v.x*d,offsetY:v.y*d});
      TK.rtask=page.render({canvasContext:cx,viewport:vp});
      await TK.rtask.promise;
      TK.rtask=null;
    }
  }catch(e){
    if(e&&e.name==='RenderingCancelledException')return;
    if(seq!==TK.rseq)return;
    TK.loadErr=e.message||String(e);tkRenderSide();tkDrawOverlay();
    return;
  }
  if(seq!==TK.rseq)return;
  TK.loadErr=null;
  const m=c.getContext('2d');m.setTransform(1,0,0,1,0,0);m.drawImage(off,0,0);
  TK.snapBmp={canvas:off,z:v.z,x:v.x,y:v.y,sheet:s.id};
  /* the drawing may have moved while it rendered */
  if(v.z!==TK.view.z||v.x!==TK.view.x||v.y!==TK.view.y){tkPaintPreview();clearTimeout(TK.rtimer);TK.rtimer=setTimeout(tkRenderSheet,60);}
  if(!TK.geo[s.id]){tkVector(s).then(()=>{tkRenderSide();tkDrawOverlay();}).catch(()=>{});}
}

/* ---------- overlay ---------- */
function tkAlpha(hex,a){const n=parseInt(hex.slice(1),16);return 'rgba('+(n>>16&255)+','+(n>>8&255)+','+(n&255)+','+a+')';}
function tkRequestOverlay(){if(TK.raf)return;TK.raf=requestAnimationFrame(()=>{TK.raf=0;tkDrawOverlay();});}
function tkDrawOverlay(){
  const c=TK.ov;if(!c)return;
  const cx=c.getContext('2d'),d=tkDpr(),s=tkSheet();
  cx.setTransform(1,0,0,1,0,0);cx.clearRect(0,0,c.width,c.height);
  if(!s)return;
  cx.setTransform(d,0,0,d,0,0);
  const t=ensureTK(),groups={};t.groups.forEach(g=>groups[g.id]=g);
  const path=(pts,closed)=>{cx.beginPath();pts.forEach((p,i)=>{const q=tkToScreen(p);i?cx.lineTo(q[0],q[1]):cx.moveTo(q[0],q[1]);});if(closed)cx.closePath();};
  const mine=tkTraces(s.id);
  const labels=[];
  /* areas first, then cut-outs over them, then lines and counts on top */
  const order={area:0,cut:1,line:2,count:3};
  mine.slice().sort((a,b)=>order[a.kind]-order[b.kind]).forEach(tr=>{
    const g=groups[tr.g];if(!g||g.hidden)return;
    const col=g.color||'#2F6FDE',sel=TK.sel===tr.id,act=TK.group===g.id;
    cx.lineJoin='round';cx.lineCap='round';
    if(tr.kind==='area'){
      path(tr.pts,true);cx.fillStyle=tkAlpha(col,sel?0.34:0.22);cx.fill('evenodd');
      cx.lineWidth=sel?3:(act?2:1.5);cx.strokeStyle=col;cx.stroke();
    }else if(tr.kind==='cut'){
      path(tr.pts,true);cx.save();cx.clip();cx.clearRect(-1e5,-1e5,2e5,2e5);
      cx.strokeStyle=tkAlpha(col,0.55);cx.lineWidth=1;
      const b=tr.pts.map(tkToScreen);let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
      b.forEach(q=>{x0=Math.min(x0,q[0]);x1=Math.max(x1,q[0]);y0=Math.min(y0,q[1]);y1=Math.max(y1,q[1]);});
      cx.beginPath();for(let k=x0-(y1-y0);k<x1;k+=7){cx.moveTo(k,y1);cx.lineTo(k+(y1-y0),y0);}cx.stroke();cx.restore();
      path(tr.pts,true);cx.setLineDash([5,4]);cx.lineWidth=sel?2.5:1.5;cx.strokeStyle=col;cx.stroke();cx.setLineDash([]);
    }else if(tr.kind==='line'){
      path(tr.pts,false);cx.strokeStyle=tkAlpha(col,0.85);cx.lineWidth=sel?5:(act?4:3);cx.stroke();
    }else if(tr.kind==='count'){
      tr.pts.forEach(p=>{const q=tkToScreen(p);
        cx.beginPath();cx.arc(q[0],q[1],sel?8:6.5,0,Math.PI*2);cx.fillStyle=tkAlpha(col,0.35);cx.fill();
        cx.lineWidth=sel?2.5:1.6;cx.strokeStyle=col;cx.stroke();
        cx.beginPath();cx.moveTo(q[0]-3.5,q[1]);cx.lineTo(q[0]+3.5,q[1]);cx.moveTo(q[0],q[1]-3.5);cx.lineTo(q[0],q[1]+3.5);cx.stroke();});
    }
    if(sel&&tr.kind!=='count'){
      tr.pts.forEach(p=>{const q=tkToScreen(p);cx.fillStyle='#fff';cx.strokeStyle=col;cx.lineWidth=1.5;
        cx.fillRect(q[0]-3.5,q[1]-3.5,7,7);cx.strokeRect(q[0]-3.5,q[1]-3.5,7,7);});
    }
    if(TK.labels&&tr.kind!=='cut'){
      const q=tkTraceQty(tr,s);
      if(q){
        let txt='',at=null;
        const sc=tr.pts.map(tkToScreen);let bx0=Infinity,by0=Infinity,bx1=-Infinity,by1=-Infinity;
        sc.forEach(v=>{bx0=Math.min(bx0,v[0]);bx1=Math.max(bx1,v[0]);by0=Math.min(by0,v[1]);by1=Math.max(by1,v[1]);});
        const big=tr.kind==='area'?Math.min(bx1-bx0,by1-by0)>=54:tr.kind==='line'?TKCore.pathLen(sc,false)>=70:true;
        if(!big){}
        else if(tr.kind==='area'){txt=f(q.A,2)+' m²';at=tkToScreen(TKCore.centroid(tr.pts));at=[at[0],at[1]+Math.min(34,(by1-by0)*0.22)];}
        else if(tr.kind==='line'){txt=f(q.L,2)+' m';const m=tr.pts[Math.floor((tr.pts.length-1)/2)],n=tr.pts[Math.floor((tr.pts.length-1)/2)+1]||m;at=tkToScreen([(m[0]+n[0])/2,(m[1]+n[1])/2]);}
        else if(tr.kind==='count'){txt=q.N+' nr';at=tkToScreen(tr.pts[tr.pts.length-1]);at=[at[0]+12,at[1]-10];}
        if(at&&txt)labels.push({txt,at,col});
      }
    }
  });
  /* the shape being drawn */
  const tool=TK.tool,pts=TK.pts.slice(),hv=TK.hover;
  const g=tkGroup(),col=(g&&g.color)||'#2F6FDE';
  if(pts.length){
    const live=hv?pts.concat([[hv.x,hv.y]]):pts;
    if(tool==='area'||tool==='cut'){
      path(live,true);cx.fillStyle=tkAlpha(col,0.15);cx.fill();
      path(live,false);cx.strokeStyle=col;cx.lineWidth=2;cx.setLineDash(tool==='cut'?[5,4]:[]);cx.stroke();cx.setLineDash([]);
      if(pts.length>2){const q=tkToScreen(pts[0]);cx.beginPath();cx.arc(q[0],q[1],8,0,Math.PI*2);cx.strokeStyle=tkAlpha(col,0.8);cx.lineWidth=1.5;cx.stroke();}
    }else if(tool==='rect'&&hv){
      const r=tkRectPts(pts[0],[hv.x,hv.y]);path(r,true);cx.fillStyle=tkAlpha(col,0.15);cx.fill();cx.strokeStyle=col;cx.lineWidth=2;cx.stroke();
    }else if(tool==='line'||tool==='cal'||tool==='chk'){
      path(live,false);cx.strokeStyle=tool==='line'?col:'#C92A2A';cx.lineWidth=tool==='line'?3:2;
      if(tool!=='line')cx.setLineDash([6,4]);cx.stroke();cx.setLineDash([]);
    }
    pts.forEach(p=>{const q=tkToScreen(p);cx.beginPath();cx.arc(q[0],q[1],3.5,0,Math.PI*2);cx.fillStyle='#fff';cx.fill();cx.strokeStyle=col;cx.lineWidth=1.5;cx.stroke();});
  }
  /* the snap marker */
  if(hv&&hv.kind&&hv.kind!=='free'){
    const q=tkToScreen([hv.x,hv.y]);cx.strokeStyle='#E8590C';cx.lineWidth=1.8;cx.beginPath();
    if(hv.kind==='end')cx.rect(q[0]-6,q[1]-6,12,12);
    else if(hv.kind==='int'){cx.moveTo(q[0]-6,q[1]-6);cx.lineTo(q[0]+6,q[1]+6);cx.moveTo(q[0]+6,q[1]-6);cx.lineTo(q[0]-6,q[1]+6);}
    else if(hv.kind==='mid'){cx.moveTo(q[0],q[1]-7);cx.lineTo(q[0]+7,q[1]+5);cx.lineTo(q[0]-7,q[1]+5);cx.closePath();}
    else if(hv.kind==='line'){cx.arc(q[0],q[1],5,0,Math.PI*2);}
    else if(hv.kind==='ortho'){cx.moveTo(q[0]-7,q[1]);cx.lineTo(q[0]+7,q[1]);cx.moveTo(q[0],q[1]-7);cx.lineTo(q[0],q[1]+7);}
    cx.stroke();
  }
  /* quantity labels last, with a halo so they read on any drawing */
  cx.font='600 11px '+getComputedStyle(document.body).getPropertyValue('--f-num');
  cx.textAlign='center';cx.textBaseline='middle';
  /* value pills; a pill that would sit on another is skipped */
  const placed=[];
  labels.forEach(l=>{
    const w=cx.measureText(l.txt).width+12,h=17,x=l.at[0]-w/2,y=l.at[1]-h/2;
    if(placed.some(r=>x<r[0]+r[2]&&x+w>r[0]&&y<r[1]+r[3]&&y+h>r[1]))return;
    placed.push([x,y,w,h]);
    cx.beginPath();if(cx.roundRect)cx.roundRect(x,y,w,h,8);else cx.rect(x,y,w,h);
    cx.fillStyle='rgba(255,255,255,.94)';cx.fill();cx.lineWidth=1.2;cx.strokeStyle=l.col;cx.stroke();
    cx.fillStyle=l.col;cx.fillText(l.txt,l.at[0],l.at[1]+0.5);
  });
  tkStatus();
}
function tkRectPts(a,b){return [[a[0],a[1]],[b[0],a[1]],[b[0],b[1]],[a[0],b[1]]];}

/* ---------- status line ---------- */
function tkStatus(){
  const b=TK.statusEl;if(!b)return;
  const s=tkSheet(),hv=TK.hover,parts=[];
  if(s&&hv){
    if(s.mpu)parts.push('x '+f(hv.x*s.mpu,3)+'  y '+f(hv.y*s.mpu,3)+' m');
    const nm={end:'Endpoint',int:'Intersection',mid:'Midpoint',line:'On line',ortho:'Ortho'}[hv.kind];
    if(nm)parts.push(nm);
  }
  const live=tkLiveReadout();if(live)parts.push(live);
  b.textContent=parts.join('   ·   ')||(TK_TOOLDEF[TK.tool]||{}).hint||'';
}
function tkLiveReadout(){
  const s=tkSheet();if(!s)return '';
  const pts=TK.pts.slice(),hv=TK.hover;
  if(!pts.length)return '';
  const live=hv?pts.concat([[hv.x,hv.y]]):pts,u=s.mpu;
  if(TK.tool==='count')return pts.length+' nr';
  if(!u&&TK.tool!=='cal')return 'Set the scale to read quantities';
  if(TK.tool==='area'||TK.tool==='cut'){
    const L=TKCore.pathLen(live,false)*u;
    return live.length>2?f(TKCore.area(live)*u*u,2)+' m²  ·  girth '+f(TKCore.pathLen(live,true)*u,2)+' m':f(L,3)+' m';
  }
  if(TK.tool==='rect'&&hv){const r=tkRectPts(pts[0],[hv.x,hv.y]);return f(Math.abs(r[2][0]-r[0][0])*u,3)+' × '+f(Math.abs(r[2][1]-r[0][1])*u,3)+' m = '+f(TKCore.area(r)*u*u,2)+' m²';}
  if(TK.tool==='line'){const g=tkGroup(),L=TKCore.pathLen(live,false)*u;
    const H=g&&tkVars(g).H;return f(L,3)+' m'+(H?'  ·  × '+f(H,2)+' = '+f(L*H,2)+' m²':'');}
  if(TK.tool==='cal')return f(TKCore.pathLen(live,false),1)+' drawing units';
  if(TK.tool==='chk')return f(TKCore.pathLen(live,false)*u,3)+' m';
  return '';
}

/* ---------- pointer input ---------- */
function tkEventPt(e){const r=TK.ov.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];}
function tkResolve(e){
  /* page point under the cursor with snapping and ortho applied */
  const s=tkSheet(),sp=tkEventPt(e);let p=tkToPage(sp[0],sp[1]);
  let kind='free';
  const drawing=['area','rect','cut','line','cal','chk','count'].indexOf(TK.tool)>=0||TK.drag;
  if(drawing&&TK.snapOn&&!e.altKey&&s){
    const sn=tkSnapPoint(s,p,11/TK.view.z);
    if(sn){p=[sn.x,sn.y];kind=sn.kind;}
  }
  const anchor=TK.drag?TK.drag.anchor:TK.pts[TK.pts.length-1];
  const orthoOn=TK.ortho!==e.shiftKey;
  if(anchor&&orthoOn&&(TK.drag||['area','cut','line','cal','chk'].indexOf(TK.tool)>=0)){
    const dx=p[0]-anchor[0],dy=p[1]-anchor[1];
    if(Math.abs(dx)>=Math.abs(dy))p=[p[0],anchor[1]];else p=[anchor[0],p[1]];
    if(kind==='free'||kind==='line')kind='ortho';
  }
  return {x:p[0],y:p[1],kind};
}
function tkBindStage(){
  const ov=TK.ov;
  let down=null;
  ov.addEventListener('contextmenu',e=>{e.preventDefault();});
  ov.addEventListener('pointerdown',e=>{
    ov.setPointerCapture(e.pointerId);
    const sp=tkEventPt(e);
    down={x:sp[0],y:sp[1],vx:TK.view.x,vy:TK.view.y,btn:e.button,moved:false,pan:e.button===1||TK.space};
    if(e.button===2){down.right=true;return;}
    if(!down.pan&&TK.tool==='select'){
      const tr=TK.sel&&ensureTK().traces.find(t=>t.id===TK.sel);
      if(tr&&tr.kind!=='count'){
        const vi=tr.pts.findIndex(p=>{const q=tkToScreen(p);return Math.hypot(q[0]-sp[0],q[1]-sp[1])<8;});
        if(vi>=0){const n=tr.pts.length;TK.drag={tr,vi,orig:tr.pts[vi].slice(),anchor:tr.pts[(vi-1+n)%n]};return;}
      }
      if(!tkHit(sp))down.pan=true;
    }
  });
  ov.addEventListener('pointermove',e=>{
    const sp=tkEventPt(e);
    if(down&&(Math.abs(sp[0]-down.x)>3||Math.abs(sp[1]-down.y)>3))down.moved=true;
    if(down&&down.pan&&down.moved){TK.view.x=down.vx+sp[0]-down.x;TK.view.y=down.vy+sp[1]-down.y;tkViewChanged();ov.style.cursor='grabbing';return;}
    TK.hover=tkResolve(e);
    if(TK.drag&&down&&down.moved){TK.drag.tr.pts[TK.drag.vi]=[TK.hover.x,TK.hover.y];}
    tkRequestOverlay();
  });
  ov.addEventListener('pointerleave',()=>{TK.hover=null;tkRequestOverlay();});
  ov.addEventListener('pointerup',e=>{
    const d=down;down=null;ov.style.cursor='';
    if(!d)return;
    if(TK.drag){
      const dr=TK.drag;TK.drag=null;
      if(d.moved){
        const moved=dr.tr.pts[dr.vi];dr.tr.pts[dr.vi]=dr.orig;tkSnap();dr.tr.pts[dr.vi]=moved;
        tkMark(dr.tr.s);tkChanged();
      }
      return;
    }
    if(d.pan&&d.moved)return;
    if(d.right){tkFinish();return;}
    if(d.moved&&TK.tool==='select')return;
    tkClick(tkResolve(e),tkEventPt(e),e);
  });
  ov.addEventListener('dblclick',e=>{e.preventDefault();if(TK.tool==='area'||TK.tool==='cut'||TK.tool==='line')tkFinish(true);});
  ov.addEventListener('wheel',e=>{
    e.preventDefault();
    const sp=tkEventPt(e);
    if(e.shiftKey){TK.view.x-=(e.deltaX||e.deltaY);TK.view.y-=(e.deltaX?e.deltaY:0);tkViewChanged();return;}
    const dy=e.deltaMode===1?e.deltaY*16:e.deltaY;
    tkZoomAt(sp[0],sp[1],Math.exp(-dy*(e.ctrlKey?0.01:0.0018)));
  },{passive:false});
}

/* ---------- hit testing ---------- */
function tkHit(sp){
  const s=tkSheet();if(!s)return null;
  const p=tkToPage(sp[0],sp[1]),tol=7/TK.view.z;
  const t=ensureTK(),vis={};t.groups.forEach(g=>{if(!g.hidden)vis[g.id]=1;});
  let best=null,bd=Infinity;
  tkTraces(s.id).forEach(tr=>{
    if(!vis[tr.g])return;
    let d=Infinity;
    if(tr.kind==='count')tr.pts.forEach(q=>{d=Math.min(d,TKCore.d2(p,q));});
    else if(tr.kind==='line')d=TKCore.distPath(p,tr.pts,false);
    else{d=TKCore.distPath(p,tr.pts,true);if(TKCore.inPoly(p,tr.pts))d=Math.min(d,tol*0.9+(tr.kind==='cut'?0:TKCore.area(tr.pts)*1e-9));}
    if(d<=tol&&d<bd){bd=d;best=tr;}
  });
  /* prefer the smaller shape when areas nest */
  if(best&&best.kind!=='count'){
    const inside=tkTraces(s.id).filter(tr=>vis[tr.g]&&(tr.kind==='area'||tr.kind==='cut')&&TKCore.inPoly(p,tr.pts));
    if(inside.length>1&&(best.kind==='area'||best.kind==='cut')){inside.sort((a,b)=>TKCore.area(a.pts)-TKCore.area(b.pts));best=inside[0];}
  }
  return best;
}

/* ---------- tools ---------- */
function tkNeedScale(s){
  if(s.mpu)return false;
  toast('Set the scale for this sheet first — calibrate on a dimension or enter its ratio.');
  tkSheetModal(s.id);return true;
}
function tkNeedGroup(kind){
  const g=tkGroup();
  if(g&&g.tool===kind)return g;
  const any=ensureTK().groups.filter(x=>x.tool===kind);
  if(any.length===1){TK.group=any[0].id;tkRenderSide();return any[0];}
  tkGroupModal(null,kind);
  toast(any.length?'Pick or create the '+TK_TOOLS[kind].toLowerCase()+' group to measure into.':'Create a dimension group to measure into.');
  return null;
}
async function tkClick(hv,sp,e){
  const s=tkSheet();if(!s)return;
  const p=[hv.x,hv.y],tool=TK.tool;
  if(tool==='select'){
    const tr=tkHit(sp);TK.sel=tr?tr.id:null;if(tr)TK.group=tr.g;
    tkDrawOverlay();tkRenderSide();return;
  }
  if(tool==='cal'||tool==='chk'){
    if(tool==='chk'&&!s.mpu){tkNeedScale(s);return;}
    TK.pts.push(p);
    if(TK.pts.length===2){const a=TK.pts[0],b=TK.pts[1];TK.pts=[];tkDrawOverlay();tool==='cal'?tkCalModal(s,a,b):tkCheckModal(s,a,b);}
    else tkDrawOverlay();
    return;
  }
  const kind=TK_TOOLDEF[tool].kind;
  if(!kind)return;
  if(kind!=='count'&&tkNeedScale(s))return;
  const g=tkNeedGroup(kind);if(!g)return;
  if(tool==='count'){
    tkSnap();
    let tr=TK.countTr&&ensureTK().traces.find(t=>t.id===TK.countTr&&t.s===s.id&&t.g===g.id);
    if(!tr){tr=tkNewTrace(s,g,'count',[]);TK.countTr=tr.id;}
    tr.pts.push(p);TK.sel=tr.id;tkMark(s.id);tkChanged();return;
  }
  if(tool==='fill'){
    tkBusy('Finding the outline…');
    try{
      await tkVector(s).catch(()=>null);
      const poly=await tkFillAt(s,p);
      tkSnap();const tr=tkNewTrace(s,g,'area',poly);TK.sel=tr.id;tkMark(s.id);tkChanged();
      const q=tkTraceQty(tr,s);toast('Room taken: '+f(q.A,2)+' m², girth '+f(q.P,2)+' m');
    }catch(err){toast(err.message,4200);}
    tkBusy(null);return;
  }
  if(tool==='rect'){
    if(!TK.pts.length){TK.pts=[p];tkDrawOverlay();return;}
    const r=tkRectPts(TK.pts[0],p);TK.pts=[];
    if(TKCore.area(r)<1e-6){tkDrawOverlay();return;}
    tkSnap();const tr=tkNewTrace(s,g,'area',r);TK.sel=tr.id;tkMark(s.id);tkChanged();return;
  }
  /* polygon and polyline: close on the first point */
  if((tool==='area'||tool==='cut')&&TK.pts.length>2){
    const q=tkToScreen(TK.pts[0]);
    if(Math.hypot(q[0]-sp[0],q[1]-sp[1])<9){tkFinish(true);return;}
  }
  const last=TK.pts[TK.pts.length-1];
  if(last&&TKCore.d2(last,p)<1e-6)return;
  TK.pts.push(p);tkDrawOverlay();
}
function tkFinish(){
  const s=tkSheet(),tool=TK.tool;
  if(tool==='count'){TK.countTr=null;toast('Count finished');tkRenderSide();return;}
  if(!s||!TK.pts.length)return;
  const pts=TK.pts.slice();TK.pts=[];
  const g=tkGroup();
  if(!g){tkDrawOverlay();return;}
  if(tool==='line'){
    if(pts.length<2){tkDrawOverlay();return;}
    tkSnap();const tr=tkNewTrace(s,g,'line',pts);TK.sel=tr.id;tkMark(s.id);tkChanged();return;
  }
  if(tool==='area'||tool==='cut'){
    if(pts.length<3||TKCore.area(pts)<1e-6){toast('An area needs at least three points.');tkDrawOverlay();return;}
    if(TKCore.selfCross(pts)){toast('That outline crosses itself. Trace it again without crossing.',3800);tkDrawOverlay();return;}
    if(tool==='cut'){
      const c=TKCore.centroid(pts);
      const hosts=tkTraces(s.id).filter(t=>t.kind==='area'&&TKCore.inPoly(c,t.pts));
      const host=hosts.find(t=>t.g===g.id)||hosts.sort((a,b)=>TKCore.area(a.pts)-TKCore.area(b.pts))[0];
      if(!host){toast('A cut-out must sit inside an area. Draw the area first.',3800);tkDrawOverlay();return;}
      const outside=pts.some(p=>!TKCore.inPoly(p,host.pts));
      tkSnap();const tr=tkNewTrace(s,tkGroup(host.g),'cut',pts);tr.parent=host.id;TK.sel=tr.id;tkMark(s.id);tkChanged();
      if(outside)toast('Part of the cut-out lies outside the area it deducts from. Check it.',4200);
      else if(host.g!==g.id)toast('Deducted from '+(tkGroup(host.g)||{}).name+', the area it sits in.');
      return;
    }
    tkSnap();const tr=tkNewTrace(s,g,'area',pts);TK.sel=tr.id;tkMark(s.id);tkChanged();
  }
}
function tkNewTrace(s,g,kind,pts){
  const t=ensureTK();
  const n=1+t.traces.filter(x=>x.g===g.id&&x.kind!=='cut').reduce((m,x)=>Math.max(m,x.n||0),0);
  const tr={id:uid('t'),s:s.id,g:g.id,kind,pts,n:kind==='cut'?0:n,parent:null};
  t.traces.push(tr);
  return tr;
}
function tkDeleteSel(){
  const t=ensureTK(),tr=t.traces.find(x=>x.id===TK.sel);if(!tr)return;
  tkSnap();
  t.traces=t.traces.filter(x=>x.id!==tr.id&&x.parent!==tr.id);
  TK.sel=null;tkMark(tr.s);tkChanged();toast('Measurement deleted');
}
function tkSetTool(tool){
  if(!TK_TOOLDEF[tool])return;
  if(TK.tool==='count'&&tool!=='count')TK.countTr=null;
  TK.tool=tool;TK.pts=[];
  if(tool!=='select')TK.sel=null;
  tkRenderBar();tkDrawOverlay();
}
function tkKey(e){
  if(!TK.root||!TK.root.isConnected)return;
  if($('#modal').classList.contains('on'))return;
  const tg=e.target,tn=tg&&tg.tagName;
  if(tn==='INPUT'||tn==='SELECT'||tn==='TEXTAREA'||(tg&&tg.isContentEditable))return;
  const k=e.key;
  if(k===' '){TK.space=true;e.preventDefault();return;}
  if((e.ctrlKey||e.metaKey)&&(k==='z'||k==='Z')){e.preventDefault();e.shiftKey?tkRedo():tkUndo();return;}
  if((e.ctrlKey||e.metaKey)&&(k==='y'||k==='Y')){e.preventDefault();tkRedo();return;}
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(k==='Escape'){if(TK.tool==='count'){tkFinish();return;}TK.pts=[];TK.sel=null;tkDrawOverlay();tkRenderSide();return;}
  if(k==='Enter'){tkFinish();return;}
  if(k==='Backspace'){if(TK.pts.length){e.preventDefault();TK.pts.pop();tkDrawOverlay();}else if(TK.sel){e.preventDefault();tkDeleteSel();}return;}
  if(k==='Delete'){if(TK.sel)tkDeleteSel();return;}
  if(k==='+'||k==='='){const {w,h}=tkStageSize();tkZoomAt(w/2,h/2,1.25);return;}
  if(k==='-'){const {w,h}=tkStageSize();tkZoomAt(w/2,h/2,0.8);return;}
  if(k==='0'){tkFit();return;}
  if(k==='o'||k==='O'){TK.ortho=!TK.ortho;tkRenderBar();toast('Ortho '+(TK.ortho?'on':'off'));return;}
  if(k==='n'||k==='N'){TK.snapOn=!TK.snapOn;tkRenderBar();toast('Snap '+(TK.snapOn?'on':'off'));return;}
  if(k==='PageDown'||k===']'){tkStepSheet(1);return;}
  if(k==='PageUp'||k==='['){tkStepSheet(-1);return;}
  const tool=Object.keys(TK_TOOLDEF).find(t=>TK_TOOLDEF[t].key===k.toUpperCase());
  if(tool)tkSetTool(tool);
}
document.addEventListener('keydown',tkKey);
document.addEventListener('keyup',e=>{if(e.key===' ')TK.space=false;});

/* ==========================================================================
   Part T4: groups, assemblies and quantities — and the bridge into the bill.
   ========================================================================== */
const TK_STDVARS=['A','Ag','P','Pc','L','N'];
function tkVars(g){
  const v={};
  if(g.link==='asm'){const a=tkAsm(g.asm);if(a)a.inputs.forEach(i=>{v[i.k]=num(i.def);});}
  Object.keys(g.attrs||{}).forEach(k=>{const x=nn(g.attrs[k]);if(x!==null)v[k]=x;});
  return v;
}
function tkDefaultF(g,wt){
  const u=wt&&WT[wt]?WT[wt].u:'';
  if(g.tool==='area')return u==='m'?'P':(u==='m3'?'A*T':'A');
  if(g.tool==='line')return u==='m2'?'L*H':(u==='m3'?'L*W*H':'L');
  return 'N';
}
function tkGroupOuts(g){
  if(g.link==='asm'){const a=tkAsm(g.asm);return a?a.outs.map(o=>Object.assign({},o)):[];}
  return g.wt?[{wt:g.wt,f:g.f||tkDefaultF(g,g.wt),suffix:''}]:[];
}
function tkTraceQty(tr,s){
  s=s||tkSheet(tr.s);if(!s)return null;
  const cuts=tr.kind==='area'?ensureTK().traces.filter(c=>c.kind==='cut'&&c.parent===tr.id):[];
  return TKCore.traceQty(tr,s.mpu,cuts);
}
function tkSuffix(g,o){return [o.suffix,g.spec].filter(x=>x&&String(x).trim()).join('; ')||null;}
/* every trace × every output, with its value — the single source for the panels and the bill */
function tkGroupRows(g){
  const t=ensureTK(),outs=tkGroupOuts(g),vars=tkVars(g),times=nn(g.times)===null?1:num(g.times);
  const rows=[],errs=[];
  t.traces.forEach(tr=>{
    if(tr.g!==g.id||tr.kind==='cut')return;
    const s=tkSheet(tr.s);if(!s)return;
    const q=tkTraceQty(tr,s);if(!q)return;
    const v=Object.assign({},vars,q);
    outs.forEach((o,oi)=>{
      const r=TKCore.evalF(o.f,v);
      if(!r.ok){errs.push(o.f+': '+r.err);return;}
      rows.push({tr,s,q,o,oi,val:r.val,times});
    });
  });
  return {rows,errs:errs.filter((x,i)=>errs.indexOf(x)===i),outs,times};
}
function tkGroupTotal(g,sid){
  const t=ensureTK();let A=0,L=0,N=0,P=0,n=0;
  t.traces.forEach(tr=>{
    if(tr.g!==g.id||tr.kind==='cut'||(sid&&tr.s!==sid))return;
    const q=tkTraceQty(tr);if(!q)return;n++;A+=q.A;L+=q.L;N+=q.N;P+=q.P;
  });
  const main=g.tool==='area'?A:g.tool==='line'?L:N,unit=g.tool==='area'?'m²':g.tool==='line'?'m':'nr';
  return {A,L,N,P,n,main,unit};
}

/* ---------- called from compute(): adds every traced quantity as a dimension-sheet term ---------- */
function tkAddToBill(add,warn){
  if(!P.tk||!P.tk.traces||!P.tk.traces.length)return;
  const t=ensureTK();
  t.groups.forEach(g=>{
    const G=tkGroupRows(g);
    G.errs.forEach(e=>warn.push('Take-off group “'+g.name+'”: '+e));
    G.rows.forEach(r=>{
      if(!WT[r.o.wt]||Math.abs(r.val)<1e-12)return;
      const lab=g.name+' · '+(r.s.no||r.s.name)+' #'+r.tr.n+(G.outs.length>1?' ['+r.o.f+']':'');
      add(r.o.wt,TM(lab,r.times,[r.val]),{suffix:tkSuffix(g,r.o),flag:'scaled',
        note:'Measured on screen from drawings — scaled, not dimensioned.'});
    });
  });
  tkChecks().filter(c=>c.sev==='cr').forEach(c=>warn.push('Take-off: '+c.msg));
}

/* ---------- checks ---------- */
function tkChecks(){
  const t=ensureTK(),out=[];
  const add=(sev,msg,tr,s,g)=>out.push({sev,msg,tr:tr&&tr.id,s:s||(tr&&tr.s),g:g||(tr&&tr.g)});
  t.sheets.forEach(s=>{
    const n=tkTraces(s.id).filter(x=>x.kind!=='count').length;
    if(n&&!s.mpu)add('cr','Sheet '+(s.no||s.name)+' has '+n+' measurement'+(n>1?'s':'')+' but no scale.',null,s.id);
    else if(n&&!s.checked)add('wn','The scale of sheet '+(s.no||s.name)+' has not been checked against a written dimension.',null,s.id);
  });
  t.groups.forEach(g=>{
    const used=t.traces.some(x=>x.g===g.id);
    if(g.link==='asm'&&!tkAsm(g.asm))add('cr','Group “'+g.name+'” points to an assembly that no longer exists.',null,null,g.id);
    if(g.link!=='asm'&&!g.wt&&used)add('cr','Group “'+g.name+'” is not linked to a bill item, so nothing it measures reaches the bill.',null,null,g.id);
    if(g.link!=='asm'&&g.wt&&WT[g.wt]){
      const u=WT[g.wt].u,f=String(g.f||tkDefaultF(g,g.wt)).replace(/\s/g,'');
      if(g.tool==='line'&&u==='m2'&&f==='L')add('wn','Group “'+g.name+'” measures length into an m² item. Give it a height (L*H).',null,null,g.id);
      if(g.tool==='area'&&u==='m'&&f==='A')add('wn','Group “'+g.name+'” measures area into a linear item.',null,null,g.id);
      if(g.tool==='count'&&u!=='nr'&&f==='N')add('wn','Group “'+g.name+'” counts items into a '+u+' item.',null,null,g.id);
    }
    const names=TK_STDVARS.concat(Object.keys(tkVars(g)));
    tkGroupOuts(g).forEach(o=>{const e=TKCore.checkF(o.f,names);if(e)add('cr','Group “'+g.name+'”, formula '+o.f+': '+e,null,null,g.id);});
  });
  t.traces.forEach(tr=>{
    const s=tkSheet(tr.s);if(!s)return;
    if(!t.groups.some(g=>g.id===tr.g)){add('cr','A measurement on '+(s.no||s.name)+' belongs to a deleted group.',tr);return;}
    if(tr.kind==='cut'){
      const host=t.traces.find(x=>x.id===tr.parent);
      if(!host)add('cr','A cut-out on '+(s.no||s.name)+' is not inside any area, so it deducts nothing.',tr);
      else if(tr.pts.some(p=>!TKCore.inPoly(p,host.pts)))add('wn','A cut-out on '+(s.no||s.name)+' runs outside the area it deducts from.',tr);
      return;
    }
    const q=tkTraceQty(tr,s);if(!q)return;
    const g=tkGroup(tr.g),nm=(g?g.name:'')+' #'+tr.n;
    if(tr.kind==='area'&&TKCore.selfCross(tr.pts))add('wn',nm+' on '+(s.no||s.name)+' crosses itself; its area is unreliable.',tr);
    if(tr.kind==='area'&&q.A<0)add('cr',nm+' has more deducted than measured.',tr);
    else if(tr.kind==='area'&&q.A<0.05)add('wn',nm+' is under 0.05 m². Probably a stray click.',tr);
    if(tr.kind==='line'&&q.L<0.05)add('wn',nm+' is under 50 mm long. Probably a stray click.',tr);
    if(tr.kind==='count'&&!tr.pts.length)add('wn',nm+' counts nothing.',tr);
  });
  return out;
}

/* ---------- groups ---------- */
function tkNewGroup(o){
  const t=ensureTK();
  const used=t.groups.map(g=>g.color);
  const color=TK_COLORS.find(c=>used.indexOf(c)<0)||TK_COLORS[t.groups.length%TK_COLORS.length];
  const g=Object.assign({id:uid('g'),name:'New group',color,tool:'area',level:'',times:1,spec:'',
    link:'asm',asm:'',wt:'',f:'',attrs:{},hidden:false},o||{});
  if(g.link==='asm'&&!g.asm){const a=t.asms.find(x=>x.tool===g.tool);if(a)g.asm=a.id;else g.link='item';}
  t.groups.push(g);
  return g;
}

/* ==========================================================================
   Part T5: the take-off screen — toolbar, sheet list, groups and bill panels,
   and the dialogs for sheets, scale, groups and assemblies.
   ========================================================================== */
(function(){
  const css=`
.tk{--tk-sheet:#D9DCE5;display:flex;flex-direction:column;border:1px solid var(--line);border-radius:var(--r);
  background:var(--surface);box-shadow:var(--shadow);overflow:hidden}
:root[data-theme="dark"] .tk{--tk-sheet:#0B0D13}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .tk{--tk-sheet:#0B0D13}}
.tk-bar{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:7px 10px;border-bottom:1px solid var(--line);background:var(--surface2)}
.tk-seg{display:inline-flex;border:1px solid var(--line);border-radius:var(--r);overflow:hidden;background:var(--surface)}
.tk-seg button{border:0;background:none;padding:4px 8px;font-size:12px;cursor:pointer;color:var(--ink2);border-right:1px solid var(--line2);white-space:nowrap}
.tk-seg button:last-child{border-right:0}
.tk-seg button:hover{background:var(--surface2);color:var(--ink)}
.tk-seg button.on{background:var(--accent);color:var(--surface)}
.tk-seg button kbd{font-family:var(--f-num);font-size:9.5px;opacity:.6;margin-left:4px}
.tk-seg button:disabled{opacity:.35;cursor:not-allowed}
.tk-body{display:grid;grid-template-columns:212px minmax(0,1fr) 304px;height:max(480px,calc(100vh - 300px))}
.tk-sheets,.tk-side{overflow-y:auto;background:var(--surface);min-width:0}
.tk-sheets{border-right:1px solid var(--line)}
.tk-side{border-left:1px solid var(--line)}
.tk-stage{position:relative;overflow:hidden;background:var(--tk-sheet);min-width:0;touch-action:none}
.tk-stage canvas{position:absolute;left:0;top:0;display:block}
.tk-ov{cursor:crosshair;outline:none}
.tk-ov.sel{cursor:default}
.tk-status{position:absolute;left:8px;bottom:8px;right:8px;pointer-events:none;font-size:11.5px;color:var(--ink);
  background:color-mix(in srgb,var(--surface) 88%,transparent);border:1px solid var(--line);border-radius:4px;padding:3px 8px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tk-msg{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none}
.tk-msg>div{pointer-events:auto;background:var(--surface);border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow);
  padding:20px 22px;max-width:440px;text-align:center}
.tk-msg h4{font-size:15px;margin-bottom:6px}
.tk-msg p{margin:0 0 14px;color:var(--ink2);font-size:13px}
.tk-msg .row{justify-content:center}
.tk-busy{position:absolute;top:10px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--ground);
  border-radius:16px;padding:5px 14px;font-size:12px;pointer-events:none}
.tk-h{display:flex;align-items:center;gap:8px;padding:10px 12px 6px;font-size:10px;letter-spacing:.13em;text-transform:uppercase;
  color:var(--ink3);font-family:var(--f-num)}
.tk-h .spacer{flex:1}
.tk-sh{display:grid;grid-template-columns:1fr auto;gap:2px 6px;width:100%;text-align:left;background:none;border:0;
  border-left:2px solid transparent;padding:7px 10px 7px 12px;cursor:pointer;color:var(--ink)}
.tk-sh:hover{background:var(--surface2)}
.tk-sh.on{background:var(--accent-soft);border-left-color:var(--accent)}
.tk-sh b{font-family:var(--f-num);font-size:11.5px;font-weight:600}
.tk-sh span{font-size:12px;color:var(--ink2);grid-column:1/-1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tk-sh i{font-style:normal;font-size:10px;font-family:var(--f-num);color:var(--ink3)}
.tk-dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:4px;vertical-align:1px}
.tk-tabs{display:flex;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--surface);z-index:2}
.tk-tabs button{flex:1;border:0;background:none;padding:9px 4px;font-size:12px;cursor:pointer;color:var(--ink3);border-bottom:2px solid transparent}
.tk-tabs button.on{color:var(--accent-ink);border-bottom-color:var(--accent);font-weight:600}
.tk-grp{display:grid;grid-template-columns:auto 1fr auto;gap:2px 8px;align-items:center;padding:7px 12px;cursor:pointer;border-left:3px solid transparent}
.tk-grp:hover{background:var(--surface2)}
.tk-grp.on{background:var(--accent-soft);border-left-color:var(--accent)}
.tk-grp .sw{width:14px;height:14px;border-radius:3px;border:0;cursor:pointer;padding:0}
.tk-grp .sw.off{opacity:.25}
.tk-grp .nm{font-size:12.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tk-grp .q{font-family:var(--f-num);font-size:11.5px;text-align:right;white-space:nowrap}
.tk-grp .meta{grid-column:2/-1;font-size:10.5px;color:var(--ink3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tk-box{margin:10px 12px;padding:10px 11px;border:1px solid var(--line);border-radius:var(--r);background:var(--surface2)}
.tk-box .lbl{font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink3);margin-bottom:3px}
.tk-out{display:grid;grid-template-columns:1fr auto;gap:2px 8px;padding:4px 12px;font-size:12px}
.tk-out .d{color:var(--ink2);overflow:hidden;text-overflow:ellipsis}
.tk-out .v{font-family:var(--f-num);text-align:right;white-space:nowrap}
.tk-chk{display:flex;gap:8px;padding:8px 12px;font-size:12px;border-bottom:1px solid var(--line2);cursor:pointer}
.tk-chk:hover{background:var(--surface2)}
.tk-sev{flex:none;width:8px;height:8px;border-radius:50%;margin-top:5px}
.tk-swatches{display:flex;gap:6px;flex-wrap:wrap}
.tk-swatches button{width:22px;height:22px;border-radius:4px;border:2px solid transparent;cursor:pointer}
.tk-swatches button.on{border-color:var(--ink)}
.tk-ftab td input{min-width:60px}
.tk-ferr{color:var(--crit);font-size:11px}
@media (max-width:1100px){.tk-body{grid-template-columns:170px minmax(0,1fr) 260px}}
@media (max-width:860px){
  .tk-body{grid-template-columns:1fr;height:auto}
  .tk-sheets{max-height:160px;border-right:0;border-bottom:1px solid var(--line)}
  .tk-stage{height:62vh}
  .tk-side{border-left:0;border-top:1px solid var(--line);max-height:none}
}`;
  const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
})();

function tkBuildRoot(){
  const r=el('div',{class:'tk'});
  TK.barEl=el('div',{class:'tk-bar'});
  TK.sheetsEl=el('aside',{class:'tk-sheets'});
  TK.cv=el('canvas',{});
  TK.ov=el('canvas',{class:'tk-ov',tabindex:'0','aria-label':'Drawing canvas'});
  TK.statusEl=el('div',{class:'tk-status num'});
  TK.msgEl=el('div',{class:'tk-msg',hidden:true});
  TK.busyEl=el('div',{class:'tk-busy',hidden:true});
  TK.stage=el('div',{class:'tk-stage'},TK.cv,TK.ov,TK.msgEl,TK.busyEl,TK.statusEl);
  TK.sideEl=el('aside',{class:'tk-side'});
  r.append(TK.barEl,el('div',{class:'tk-body'},TK.sheetsEl,TK.stage,TK.sideEl));
  TK.fileIn=el('input',{type:'file',accept:'.pdf,.dxf,application/pdf',multiple:true,hidden:true});
  TK.fileIn.addEventListener('change',e=>{const fs=Array.from(e.target.files||[]);e.target.value='';if(fs.length)tkAddFiles(fs);});
  r.append(TK.fileIn);
  tkBindStage();
  if(window.ResizeObserver)new ResizeObserver(()=>{
    if(!TK.root.isConnected)return;
    if(tkSizeCanvases()){
      if(!TK.views[TK.sheet]){if(!tkFitTraces())tkFit();}
      else{tkPaintPreview();tkDrawOverlay();clearTimeout(TK.rtimer);TK.rtimer=setTimeout(tkRenderSheet,90);}
    }
  }).observe(TK.stage);
  TK.root=r;
}
TK.views={};
/* the app's router calls this; the same node is handed back each time so the canvas survives */
function tkView(){
  const t=ensureTK();
  if(!TK.root)tkBuildRoot();
  if(TK.sheet&&!tkSheet())TK.sheet=null;
  if(!TK.sheet&&t.sheets.length)TK.sheet=t.sheets[0].id;
  if(TK.group&&!tkGroup())TK.group=null;
  if(!TK.group&&t.groups.length)TK.group=t.groups[0].id;
  tkRenderAll();
  setTimeout(()=>{
    if(!TK.root.isConnected)return;
    tkSizeCanvases();
    if(TK.sheet&&!TK.views[TK.sheet]){if(!tkFitTraces())tkFit();}else tkViewChanged(true);
  },0);
  return TK.root;
}
function tkRenderAll(){tkRenderBar();tkRenderSheets();tkRenderSide();tkRenderMsg();tkDrawOverlay();}
function tkChanged(){
  SAVED.dirty=true;
  if(typeof scheduleAutosave==='function')scheduleAutosave();
  tkDrawOverlay();tkRenderSide();tkRenderSheets();tkRenderBar();
  try{paintKpis();renderNav();}catch(e){}
}
function tkBusy(msg){if(!TK.busyEl)return;TK.busyEl.textContent=msg||'';TK.busyEl.hidden=!msg;}
function tkOpenSheet(id){
  if(TK.sheet)TK.views[TK.sheet]=Object.assign({},TK.view);
  TK.sheet=id;TK.pts=[];TK.sel=null;TK.countTr=null;TK.snapBmp=null;TK.loadErr=null;
  const s=tkSheet();
  if(s&&s.level===undefined)s.level='';
  tkRenderAll();
  if(TK.views[id]){TK.view=Object.assign({},TK.views[id]);tkViewChanged(true);}else if(!tkFitTraces())tkFit();
}
function tkStepSheet(d){
  const sh=ensureTK().sheets,i=sh.findIndex(s=>s.id===TK.sheet);
  if(i<0||!sh.length)return;
  tkOpenSheet(sh[(i+d+sh.length)%sh.length].id);
}

/* ---------- toolbar ---------- */
function tkRenderBar(){
  const b=TK.barEl;if(!b)return;b.innerHTML='';
  const s=tkSheet(),g=tkGroup();
  const tb=(id)=>{const d=TK_TOOLDEF[id];
    return el('button',{class:TK.tool===id?'on':'',title:d.hint+' ('+d.key+')',disabled:!s?true:null,onclick:()=>tkSetToolSmart(id)},d.label,el('kbd',{},d.key));};
  b.append(
    el('div',{class:'tk-seg'},
      el('button',{title:'Previous sheet ( [ )',disabled:!s?true:null,onclick:()=>tkStepSheet(-1)},'‹'),
      el('button',{title:'Next sheet ( ] )',disabled:!s?true:null,onclick:()=>tkStepSheet(1)},'›')),
    el('div',{class:'tk-seg'},tb('select')),
    el('div',{class:'tk-seg'},['area','rect','fill','cut','line','count'].map(tb)),
    el('div',{class:'tk-seg'},tb('chk'),tb('cal')),
    el('div',{class:'tk-seg'},
      el('button',{class:TK.ortho?'on':'',title:'Lock to horizontal and vertical. Hold Shift to flip it for one point. (O)',onclick:()=>{TK.ortho=!TK.ortho;tkRenderBar();}},'Ortho'),
      el('button',{class:TK.snapOn?'on':'',title:'Snap to line ends, midpoints and intersections on vector drawings. Hold Alt to place freely. (N)',onclick:()=>{TK.snapOn=!TK.snapOn;tkRenderBar();}},'Snap'),
      el('button',{class:TK.labels?'on':'',title:'Show quantities on the drawing',onclick:()=>{TK.labels=!TK.labels;tkRenderBar();tkDrawOverlay();}},'Values')),
    el('div',{class:'tk-seg'},
      el('button',{title:'Undo (Ctrl+Z)',disabled:TK.undo.length?null:true,onclick:tkUndo},'Undo'),
      el('button',{title:'Redo (Ctrl+Y)',disabled:TK.redo.length?null:true,onclick:tkRedo},'Redo')),
    el('div',{class:'tk-seg'},
      el('button',{title:'Zoom out (−)',disabled:!s?true:null,onclick:()=>{const z=tkStageSize();tkZoomAt(z.w/2,z.h/2,0.8);}},'−'),
      el('button',{title:'Fit the sheet (0)',disabled:!s?true:null,onclick:tkFit},'Fit'),
      el('button',{title:'Zoom in (+)',disabled:!s?true:null,onclick:()=>{const z=tkStageSize();tkZoomAt(z.w/2,z.h/2,1.25);}},'+')),
    el('div',{class:'spacer'}),
    s?el('button',{class:'chip '+(s.mpu?(s.checked?'ok':'wn'):'cr'),style:'cursor:pointer',
      title:'Sheet scale — click to change',onclick:()=>tkSheetModal(s.id)},tkScaleText(s)):null,
    g?el('span',{class:'chip',style:'border-color:'+g.color+';color:var(--ink)'},
      el('span',{class:'tk-dot',style:'background:'+g.color}),g.name):null);
  if(TK.ov)TK.ov.classList.toggle('sel',TK.tool==='select');
}
function tkScaleText(s){
  if(!s.mpu)return 'No scale';
  const S=s.scale&&s.scale.ratio?('1:'+s.scale.ratio):(s.src.type==='dxf'?'units '+((s.scale&&s.scale.units)||'mm'):'calibrated');
  return S+(s.checked?' · checked':' · unchecked');
}
/* picking a drawing tool brings the matching group forward, or asks for one */
function tkSetToolSmart(tool){
  const kind=TK_TOOLDEF[tool].kind;
  if(kind){
    const g=tkGroup();
    if(!g||g.tool!==kind){
      const t=ensureTK(),last=TK.lastGroup&&TK.lastGroup[kind];
      const cand=t.groups.find(x=>x.id===last&&x.tool===kind)||t.groups.filter(x=>x.tool===kind).slice(-1)[0];
      if(cand){TK.group=cand.id;}
      else{tkSetTool(tool);tkGroupModal(null,kind);return;}
    }
  }
  tkSetTool(tool);tkRenderSide();
}

/* ---------- sheet list ---------- */
function tkRenderSheets(){
  const w=TK.sheetsEl;if(!w)return;w.innerHTML='';
  const t=ensureTK();
  w.append(el('div',{class:'tk-h'},'Sheets  '+t.sheets.length,el('span',{class:'spacer'}),
    el('button',{class:'btn sm',onclick:()=>TK.fileIn.click()},'Add')));
  t.sheets.forEach(s=>{
    const n=tkTraces(s.id).filter(x=>x.kind!=='cut').length;
    const dot=s.mpu?(s.checked?'var(--good)':'var(--warn)'):'var(--crit)';
    const lv=s.level?((floorByKey(s.level)||{}).name||s.level):'';
    w.append(el('button',{class:'tk-sh'+(s.id===TK.sheet?' on':''),onclick:()=>tkOpenSheet(s.id),ondblclick:()=>tkSheetModal(s.id)},
      el('b',{},el('span',{class:'tk-dot',style:'background:'+dot}),s.no||'—'),
      el('i',{},n?n+' meas.':''),
      el('span',{title:s.name},s.name+(s.rev?' · Rev '+s.rev:'')),
      lv?el('i',{style:'grid-column:1/-1'},lv):null));
  });
  if(t.sheets.length){
    const local=t.sheets.some(s=>!s.src.asset&&!s.src.url);
    w.append(el('div',{class:'hint',style:'padding:10px 12px;font-size:11px'},
      local?'Some drawings are attached for this session only. Use a normal (not private) browser window to keep them with the project.'
        :'Drawings are stored with the project. Double-click a sheet to edit its number, level and scale.'));
  }
}

/* ---------- empty and error states over the canvas ---------- */
function tkRenderMsg(){
  const m=TK.msgEl;if(!m)return;
  const t=ensureTK(),s=tkSheet();m.innerHTML='';
  if(!t.sheets.length){
    m.hidden=false;
    m.append(el('div',{},el('h4',{},'Add the tender drawings'),
      el('p',{},'PDF sets from the consultant (vector or scanned) and DXF exports. Each page becomes a sheet you calibrate, check and measure on.'),
      el('div',{class:'row'},el('button',{class:'btn pri',onclick:()=>TK.fileIn.click()},'Add PDF or DXF drawings'),
        el('button',{class:'btn',onclick:tkLoadExample},'Open the example plan'))));
    return;
  }
  if(s&&TK.loadErr){
    m.hidden=false;
    const re=el('input',{type:'file',accept:s.src.type==='dxf'?'.dxf':'.pdf',hidden:true});
    re.addEventListener('change',async e=>{const fl=e.target.files[0];if(fl)await tkRelink(s,fl);});
    m.append(el('div',{},el('h4',{},'This drawing could not be shown'),el('p',{},TK.loadErr),
      el('div',{class:'row'},el('button',{class:'btn pri',onclick:()=>re.click()},'Attach '+(s.src.file||'the file')),re)));
    return;
  }
  m.hidden=true;
}

/* ---------- right-hand panel ---------- */
function tkRenderSide(){
  const w=TK.sideEl;if(!w)return;
  const keep=w.scrollTop;w.innerHTML='';
  const checks=tkChecks(),nc=checks.filter(c=>c.sev==='cr').length;
  w.append(el('div',{class:'tk-tabs'},[['groups','Groups'],['bill','Bill'],['checks','Checks'+(checks.length?' ('+checks.length+')':'')]]
    .map(([k,l])=>el('button',{class:TK.side===k?'on':'',style:k==='checks'&&nc?'color:var(--crit)':'',onclick:()=>{TK.side=k;tkRenderSide();}},l))));
  if(TK.side==='bill')w.append(tkBillPanel());
  else if(TK.side==='checks')w.append(tkChecksPanel(checks));
  else w.append(tkGroupsPanel());
  w.scrollTop=keep;
  tkRenderMsg();
}
function tkGroupsPanel(){
  const t=ensureTK(),s=tkSheet(),box=el('div',{});
  const sel=TK.sel&&t.traces.find(x=>x.id===TK.sel);
  if(sel){
    const q=tkTraceQty(sel),g=tkGroup(sel.g);
    const txt=!q?'—':sel.kind==='area'?f(q.A,2)+' m² net · girth '+f(q.P,2)+' m'+(q.Ag!==q.A?' · gross '+f(q.Ag,2)+' m²':'')
      :sel.kind==='cut'?f(TKCore.area(sel.pts)*(tkSheet(sel.s).mpu||0)**2,2)+' m² deducted'
      :sel.kind==='line'?f(q.L,3)+' m':q.N+' nr';
    const mv=el('select',{});
    t.groups.filter(x=>x.tool===(sel.kind==='cut'?'area':sel.kind==='area'?'area':sel.kind)).forEach(x=>{
      const o=el('option',{value:x.id},x.name);if(x.id===sel.g)o.selected=true;mv.append(o);});
    mv.addEventListener('change',e=>{tkSnap();sel.g=e.target.value;tkMark(sel.s);tkChanged();});
    box.append(el('div',{class:'tk-box'},
      el('div',{class:'lbl'},sel.kind==='cut'?'Selected cut-out':'Selected measurement'),
      el('div',{style:'font-weight:600;font-size:13px'},(g?g.name:'—')+(sel.n?' #'+sel.n:'')),
      el('div',{class:'num',style:'font-size:12px;margin:3px 0 8px'},txt),
      el('label',{class:'f'},el('span',{},'Move to group'),mv),
      el('div',{class:'row',style:'margin-top:8px'},el('button',{class:'btn sm dgr',onclick:tkDeleteSel},'Delete'),
        el('button',{class:'btn sm gho',onclick:()=>{TK.sel=null;tkRenderSide();tkDrawOverlay();}},'Deselect'))));
  }
  box.append(el('div',{class:'tk-h'},'Dimension groups',el('span',{class:'spacer'}),
    el('button',{class:'btn sm',onclick:()=>tkGroupModal(null,(tkGroup()||{}).tool||'area')},'New'),
    el('button',{class:'btn sm gho',onclick:tkAsmLibrary},'Assemblies')));
  if(!t.groups.length){
    box.append(el('div',{class:'empty',style:'padding:18px 14px'},el('b',{},'No groups yet'),
      'A group is one thing you measure — a slab, a wall type, a room finish. Its colour marks it on every sheet and its assembly turns each trace into bill items.'));
    return box;
  }
  ['area','line','count'].forEach(kind=>{
    const gs=t.groups.filter(g=>g.tool===kind);if(!gs.length)return;
    box.append(el('div',{class:'tk-h',style:'padding-top:8px'},TK_TOOLS[kind]));
    gs.forEach(g=>{
      const tot=tkGroupTotal(g),here=s?tkGroupTotal(g,s.id):null;
      const a=g.link==='asm'?tkAsm(g.asm):null;
      const link=a?a.name:(g.wt&&WT[g.wt]?WT[g.wt].desc.split(';')[0]:'not linked');
      const times=num(g.times)||1;
      box.append(el('div',{class:'tk-grp'+(TK.group===g.id?' on':''),
        onclick:()=>{TK.group=g.id;(TK.lastGroup=TK.lastGroup||{})[g.tool]=g.id;
          if(TK_TOOLDEF[TK.tool].kind&&TK_TOOLDEF[TK.tool].kind!==g.tool)tkSetTool(TK_DRAWTOOLS[g.tool][0]);
          else if(TK.tool==='select'||TK.tool==='chk'||TK.tool==='cal')tkSetTool(TK_DRAWTOOLS[g.tool][0]);
          tkRenderSide();tkRenderBar();tkDrawOverlay();},
        ondblclick:()=>tkGroupModal(g.id)},
        el('button',{class:'sw'+(g.hidden?' off':''),style:'background:'+g.color,title:g.hidden?'Show':'Hide',
          onclick:e=>{e.stopPropagation();g.hidden=!g.hidden;SAVED.dirty=true;tkRenderSide();tkDrawOverlay();}}),
        el('span',{class:'nm',title:g.name},g.name+(times!==1?'  ×'+times:'')),
        el('span',{class:'q'},f(tot.main,g.tool==='count'?0:2)+' '+tot.unit),
        el('span',{class:'meta'},(here&&here.n?f(here.main,g.tool==='count'?0:2)+' '+here.unit+' on this sheet · ':'')+link)));
    });
  });
  const g=tkGroup();
  if(g)box.append(el('div',{class:'row',style:'padding:10px 12px'},
    el('button',{class:'btn sm',onclick:()=>tkGroupModal(g.id)},'Edit “'+g.name+'”')));
  return box;
}
function tkBillPanel(){
  const t=ensureTK(),box=el('div',{});
  if(!t.groups.length){box.append(el('div',{class:'empty'},'Measured items appear here, group by group, as they will reach the bill.'));return box;}
  t.groups.forEach(g=>{
    const G=tkGroupRows(g),by={};
    G.rows.forEach(r=>{const k=r.oi;by[k]=(by[k]||0)+r.val*r.times;});
    box.append(el('div',{class:'tk-h',style:'padding-top:12px'},el('span',{class:'tk-dot',style:'background:'+g.color}),
      g.name+(num(g.times)>1?' ×'+g.times:'')));
    if(!G.outs.length){box.append(el('div',{class:'tk-out'},el('span',{class:'d',style:'color:var(--crit)'},'Not linked to a bill item'),el('span',{})));return;}
    G.outs.forEach((o,i)=>{
      const w=WT[o.wt];
      box.append(el('div',{class:'tk-out',title:(w?w.desc:'')+'\n'+o.f},
        el('span',{class:'d'},w?w.desc.split(';')[0]+(o.suffix?' — '+o.suffix:''):'Unknown item '+o.wt),
        el('span',{class:'v'},w?qfmt(by[i]||0,w.u)+' '+(w.u==='m2'?'m²':w.u==='m3'?'m³':w.u):'—')));
    });
    G.errs.forEach(e=>box.append(el('div',{class:'tk-out'},el('span',{class:'tk-ferr'},e),el('span',{}))));
  });
  /* totals by level */
  const lv={};
  t.traces.forEach(tr=>{if(tr.kind==='cut')return;const s=tkSheet(tr.s),g=tkGroup(tr.g);if(!s||!g)return;
    const L=g.level||s.level||'';const q=tkTraceQty(tr,s);if(!q)return;
    const k=L+'|'+g.id;lv[k]=(lv[k]||0)+(g.tool==='area'?q.A:g.tool==='line'?q.L:q.N)*(num(g.times)||1);});
  const keys=Object.keys(lv).sort();
  if(keys.length){
    box.append(el('div',{class:'tk-h',style:'padding-top:16px'},'By level'));
    keys.forEach(k=>{const [L,gid]=k.split('|'),g=tkGroup(gid);
      box.append(el('div',{class:'tk-out'},el('span',{class:'d'},((floorByKey(L)||{}).name||L||'No level')+' — '+g.name),
        el('span',{class:'v'},f(lv[k],g.tool==='count'?0:2)+' '+(g.tool==='area'?'m²':g.tool==='line'?'m':'nr'))));});
  }
  box.append(el('div',{class:'row',style:'padding:14px 12px'},
    el('button',{class:'btn sm',onclick:()=>{view='takeoff';render();window.scrollTo(0,0);}},'Open the dimension sheet'),
    el('button',{class:'btn sm',onclick:()=>{view='boq';render();window.scrollTo(0,0);}},'Open the bill')));
  return box;
}
function tkChecksPanel(checks){
  const box=el('div',{});
  if(!checks.length){box.append(el('div',{class:'empty'},el('b',{},'No problems found'),'Scales are set and every measurement is closed and linked.'));return box;}
  checks.forEach(c=>box.append(el('div',{class:'tk-chk',onclick:()=>{
      if(c.s&&c.s!==TK.sheet)tkOpenSheet(c.s);
      if(c.tr){TK.sel=c.tr;tkSetTool('select');}
      if(c.g&&!c.tr)TK.group=c.g;
      if(!c.tr&&c.s&&!c.g)tkSheetModal(c.s);
      tkRenderSide();tkDrawOverlay();}},
    el('span',{class:'tk-sev',style:'background:'+(c.sev==='cr'?'var(--crit)':'var(--warn)')}),el('span',{},c.msg))));
  return box;
}

/* ==========================================================================
   Part T6: dialogs — sheets and scale, groups, the assembly library — and
   getting drawings in.
   ========================================================================== */
const TK_PAPER=[{v:'',t:'As the PDF page'},{v:'1189',t:'A0'},{v:'841',t:'A1'},{v:'594',t:'A2'},{v:'420',t:'A3'},{v:'297',t:'A4'}];
const TK_UNITS=[{v:'mm',t:'millimetres',m:0.001},{v:'cm',t:'centimetres',m:0.01},{v:'m',t:'metres',m:1},{v:'in',t:'inches',m:0.0254},{v:'ft',t:'feet',m:0.3048}];

/* ---------- adding drawings ---------- */
async function tkAddFiles(files){
  const t=ensureTK();const added=[];
  const a=await tkAssets();
  let local=0;
  for(const file of files){
    const isDxf=/\.dxf$/i.test(file.name);
    tkBusy('Reading '+file.name+'…');
    try{
      let src={type:isDxf?'dxf':'pdf',file:file.name},key;
      if(a){
        try{
          const blob=isDxf?new Blob([await file.text()],{type:'text/plain'}):file;
          const r=await a.upload(blob,{type:isDxf?'text/plain':'application/pdf'});
          src.asset=r.id;key=r.id;
        }catch(e){
          local++;
          if(e&&e.code==='too_large')toast(file.name+' is over 20 MB, so it is kept for this session only. Split the set into smaller PDFs to store it.',6000);
          else if(e&&e.code==='quota_or_state')toast('Drawing storage is full. '+file.name+' is kept for this session only.',6000);
        }
      }else local++;
      if(!key){key=uid('f');src.key=key;}
      if(isDxf){
        const g=tkParseDXF(await file.text());
        TK.docs[key]={loading:Promise.resolve(g)};TK.dxf[key]=g;
        const s={id:uid('s'),no:'',name:file.name.replace(/\.dxf$/i,''),rev:'',level:'',
          src:Object.assign({},src,{page:1}),w:g.w,h:g.h,mpu:0.001,scale:{mode:'units',units:'mm'},checked:false,vector:true};
        t.sheets.push(s);added.push(s);tkMark(s.id);
        continue;
      }
      const buf=new Uint8Array(await file.arrayBuffer());
      const pdf=await tkOpenPdfBytes(buf);
      TK.docs[key]={loading:Promise.resolve(pdf)};
      for(let p=1;p<=pdf.numPages;p++){
        tkBusy('Reading '+file.name+' — page '+p+' of '+pdf.numPages);
        const page=await pdf.getPage(p),vp=page.getViewport({scale:1});
        let guess={no:'',S:null,title:'',rev:''};
        try{guess=tkGuessSheet(await page.getTextContent(),vp);}catch(e){}
        const s={id:uid('s'),no:guess.no||'',name:guess.title||(file.name.replace(/\.pdf$/i,'')+(pdf.numPages>1?' — page '+p:'')),
          rev:guess.rev||'',level:'',src:Object.assign({},src,{page:p}),w:vp.width,h:vp.height,mpu:null,
          scale:{mode:'ratio',ratio:null,paper:'',suggest:guess.S},checked:false};
        t.sheets.push(s);added.push(s);tkMark(s.id);
      }
    }catch(e){toast('Could not read '+file.name+': '+(e.message||e),5000);}
  }
  tkBusy(null);
  if(!added.length)return;
  SAVED.dirty=true;if(typeof scheduleAutosave==='function')scheduleAutosave();
  if(local&&a===null)toast('Drawings are attached for this session only — use a normal (not private) browser window to store them with the project.',5200);
  tkOpenSheet(added[0].id);
  tkChanged();
  if(!added[0].mpu)setTimeout(()=>tkSheetModal(added[0].id,true),250);
  else toast(added.length+' sheet'+(added.length>1?'s':'')+' added');
}
/* sheet number, title and plotted scale from the title block text */
function tkGuessSheet(tc,vp){
  const items=tc.items.map(i=>{const p=pdfjsLib.Util.applyTransform([i.transform[4],i.transform[5]],vp.transform);
    return {s:String(i.str||'').trim(),x:p[0],y:p[1],h:Math.abs(i.transform[3])||8};}).filter(i=>i.s);
  const S=(typeof detectPlotScale==='function')?detectPlotScale(items):null;
  const tb=items.filter(i=>i.x>vp.width*0.55&&i.y>vp.height*0.6);
  /* the value written under (or beside) a title-block label */
  const under=(re)=>{
    const lab=tb.find(i=>re.test(i.s));if(!lab)return '';
    const c=tb.filter(i=>i!==lab&&i.y>lab.y-2&&i.y<lab.y+lab.h*5+30&&i.x>=lab.x-20&&i.x<lab.x+220&&!/^(project|drawing title|title|scale|drawing no\.?|dwg no\.?|date|rev(ision)?|drawn|checked)$/i.test(i.s))
      .sort((a,b)=>(a.y-lab.y)+Math.abs(a.x-lab.x)*0.3-((b.y-lab.y)+Math.abs(b.x-lab.x)*0.3));
    return c.length?c[0].s:'';
  };
  const re=/^[A-Z]{1,4}[-_. ]?\d{2,4}(?:[-_. ]?\d{1,3})?[A-Z]?$/;
  let no=under(/^(drawing|dwg|sheet)\s*(no\.?|number)$/i);
  if(!re.test(no)){const nos=tb.filter(i=>re.test(i.s)&&!/^1[:\/]/.test(i.s)).sort((a,b)=>b.h-a.h);no=nos.length?nos[0].s:'';}
  let title=under(/^(drawing\s*title|title)$/i);
  if(!title){const big=tb.filter(i=>i.s.length>=8&&i.s.length<=60&&/[a-z]/i.test(i.s)&&!/scale|drawn|date|rev|checked|project|client|sheet|drawing no/i.test(i.s)).sort((a,b)=>b.h-a.h);title=big.length?big[0].s:'';}
  let rev=under(/^rev(ision)?\.?$/i);if(!/^[A-Z0-9]{1,3}$/i.test(rev))rev='';
  const tidy=t=>t?t.charAt(0)+t.slice(1).toLowerCase():'';
  return {no,S,title:/^[^a-z]+$/.test(title)?tidy(title):title,rev};
}
async function tkRelink(s,file){
  const key=tkFileKey(s);
  try{
    if(s.src.type==='dxf'){const g=tkParseDXF(await file.text());TK.docs[key]={loading:Promise.resolve(g)};TK.dxf[key]=g;}
    else{const pdf=await tkOpenPdfBytes(new Uint8Array(await file.arrayBuffer()));TK.docs[key]={loading:Promise.resolve(pdf)};}
    TK.loadErr=null;TK.pageInfo={};TK.geo={};tkRenderMsg();tkViewChanged(true);toast('Drawing attached');
  }catch(e){toast('Could not read that file: '+e.message,4000);}
}

/* ---------- sheet settings and scale ---------- */
function tkSheetModal(sid,isNew){
  const s=tkSheet(sid);if(!s)return;
  const noI=el('input',{id:'tk-s-no',value:s.no||'',placeholder:'e.g. A-101'});
  const nmI=el('input',{id:'tk-s-nm',value:s.name||''});
  const rvI=el('input',{id:'tk-s-rv',value:s.rev||'',placeholder:'e.g. C'});
  const lvS=el('select',{id:'tk-s-lv'});
  [{v:'',t:'—'}].concat(levelOpts()).forEach(o=>{const op=el('option',{value:o.v},o.t);if((s.level||'')===o.v)op.selected=true;lvS.append(op);});
  const n=tkTraces(s.id).length;
  const body=el('div',{class:'stack'});
  body.append(el('div',{class:'grid g4'},
    el('label',{class:'f'},el('span',{},'Sheet number'),noI),
    el('label',{class:'f',style:'grid-column:span 2'},el('span',{},'Title'),nmI),
    el('label',{class:'f'},el('span',{},'Revision'),rvI),
    el('label',{class:'f'},el('span',{},'Level'),lvS)));
  const saveMeta=()=>{s.no=noI.value.trim();s.name=nmI.value.trim()||s.name;s.rev=rvI.value.trim();s.level=lvS.value;};
  const scaleBox=el('div',{class:'card'});
  const sc=s.scale||{};
  if(s.src.type==='dxf'){
    const uS=el('select',{id:'tk-s-u'});
    TK_UNITS.forEach(o=>{const op=el('option',{value:o.v},o.t);if((sc.units||'mm')===o.v)op.selected=true;uS.append(op);});
    scaleBox.append(el('header',{},el('h3',{},'Drawing units'),el('div',{class:'sub'},'A DXF is drawn full size; say what one unit is.')),
      el('div',{class:'pad row'},el('label',{class:'f',style:'max-width:220px'},el('span',{},'One drawing unit is'),uS),
        el('button',{class:'btn pri',onclick:()=>{
          const u=TK_UNITS.find(x=>x.v===uS.value);tkSnap();saveMeta();
          s.scale={mode:'units',units:u.v};s.mpu=u.m;s.checked=false;tkMark(s.id);closeModal();tkChanged();
          toast('Units set — check a written dimension to confirm.');tkSetTool('chk');}},'Apply units')));
  }else{
    const rI=el('input',{id:'tk-s-r',class:'num',value:sc.ratio||sc.suggest||'',placeholder:sc.suggest?String(sc.suggest):'e.g. 100',style:'max-width:120px'});
    const pS=el('select',{id:'tk-s-p'});
    TK_PAPER.forEach(o=>{const op=el('option',{value:o.v},o.t);if((sc.paper||'')===o.v)op.selected=true;pS.append(op);});
    const pageMm=Math.max(s.w,s.h)*25.4/72;
    scaleBox.append(el('header',{},el('h3',{},'Scale'),el('div',{class:'sub'},tkScaleText(s))),
      el('div',{class:'pad stack'},
        sc.suggest?el('div',{class:'flag ac'},el('div',{},'The title block reads ',el('b',{},'1:'+sc.suggest),'. Confirm the paper size it was drawn for.')):null,
        el('div',{class:'row',style:'align-items:flex-end'},
          el('label',{class:'f'},el('span',{},'Scale 1 :'),rI),
          el('label',{class:'f',style:'max-width:200px'},el('span',{},'Drawn for paper'),pS),
          el('button',{class:'btn pri',onclick:()=>{
            const S=num(rI.value||sc.suggest);if(!(S>0)){toast('Enter the scale, for example 100 for 1:100.');return;}
            const paper=num(pS.value);
            tkSnap();saveMeta();
            s.mpu=paper?S*(paper/1000)/Math.max(s.w,s.h):S*0.0254/72;
            s.scale={mode:'ratio',ratio:S,paper:pS.value,suggest:sc.suggest};s.checked=false;tkMark(s.id);
            closeModal();tkChanged();tkSetTool('chk');
            toast('Scale 1:'+S+' set. Now check it — click both ends of a dimension written on the drawing.',5000);
          }},'Use this scale')),
        el('div',{class:'hint'},'This PDF page is '+f(pageMm,0)+' mm on its long side. If the drawing was made for A1 and saved at A3, pick A1 so the ratio still holds.'),
        el('div',{class:'row'},
          el('button',{class:'btn',onclick:()=>{saveMeta();closeModal();tkOpenSheet(s.id);tkSetTool('cal');toast('Click both ends of a dimension you know.',3500);}},'Calibrate on a dimension instead'),
          s.mpu?el('button',{class:'btn',onclick:()=>{saveMeta();closeModal();tkOpenSheet(s.id);tkSetTool('chk');}},'Check a dimension'):null)));
  }
  body.append(scaleBox);
  if(n&&s.mpu)body.append(el('div',{class:'flag wn'},el('div',{},'Changing the scale re-measures the '+n+' measurement'+(n>1?'s':'')+' on this sheet.')));
  openModal(isNew?'New sheet — set its scale':'Sheet '+(s.no||s.name),body,[
    el('button',{class:'btn pri',onclick:()=>{saveMeta();SAVED.dirty=true;tkMark(s.id);closeModal();tkChanged();}},'Save sheet details'),
    el('button',{class:'btn',onclick:closeModal},'Close'),
    el('div',{class:'spacer'}),
    el('button',{class:'btn dgr',onclick:()=>tkRemoveSheet(s)},'Remove sheet')]);
}
function tkRemoveSheet(s){
  const n=tkTraces(s.id).length;
  const shared=ensureTK().sheets.some(x=>x.id!==s.id&&tkFileKey(x)===tkFileKey(s));
  askConfirm('Remove sheet '+(s.no||s.name)+'?',
    (n?'Its '+n+' measurement'+(n>1?'s':'')+' are removed from the take-off and the bill. ':'')+
    (s.src.asset&&!shared?'The stored drawing file is deleted too. ':'')+'This cannot be undone.',
    'Remove sheet',async()=>{
      const t=ensureTK();
      t.traces=t.traces.filter(x=>x.s!==s.id);
      t.sheets=t.sheets.filter(x=>x.id!==s.id);
      (TK.deletedChunks=TK.deletedChunks||{})[s.id]=s.chunks||1;TK.dirty.add(s.id);
      if(s.src.asset&&!shared){const a=await tkAssets();if(a){try{await a.delete(s.src.asset);}catch(e){}}}
      TK.undo=[];TK.redo=[];
      TK.sheet=t.sheets.length?t.sheets[0].id:null;TK.snapBmp=null;
      closeModal();tkChanged();if(TK.sheet)tkOpenSheet(TK.sheet);else tkRenderAll();
      toast('Sheet removed');
    },true);
}
function tkCalModal(s,a,b){
  const dist=TKCore.d2(a,b);
  const inp=el('input',{id:'tk-cal',class:'num',placeholder:'e.g. 6.000',style:'max-width:180px'});
  openModal('Calibrate '+(s.no||s.name),el('div',{class:'stack'},
    el('p',{class:'hint',style:'margin:0'},'Type the real length of the line you picked, in metres. Pick the longest dimension you can find for the best accuracy.'),
    el('label',{class:'f'},el('span',{},'Real length (m)'),inp)),
    [el('button',{class:'btn pri',onclick:()=>{
      const v=parseFloat(inp.value);if(!isFinite(v)||v<=0){toast('Enter a positive length in metres.');return;}
      tkSnap();s.mpu=v/dist;s.scale={mode:'cal',ratio:Math.round(s.mpu/(0.0254/72)),suggest:(s.scale||{}).suggest};s.checked=false;
      tkMark(s.id);closeModal();tkSetTool('chk');tkChanged();
      toast('Calibrated. Now check another written dimension, ideally at right angles to the first.',5000);
    }},'Set scale'),el('button',{class:'btn',onclick:()=>{closeModal();tkSetTool('select');}},'Cancel')]);
  setTimeout(()=>inp.focus(),60);
}
function tkCheckModal(s,a,b){
  const meas=TKCore.d2(a,b)*s.mpu;
  const inp=el('input',{id:'tk-chk',class:'num',placeholder:f(meas,3),style:'max-width:180px'});
  const res=el('div',{});
  const cmp=()=>{
    const v=parseFloat(inp.value);res.innerHTML='';
    if(!isFinite(v)||v<=0)return null;
    const err=(meas-v)/v*100;
    res.append(el('div',{class:'flag '+(Math.abs(err)<=0.5?'ok':Math.abs(err)<=2?'wn':'cr')},
      el('div',{},'Measured ',el('b',{class:'num'},f(meas,3)+' m'),' against ',el('b',{class:'num'},f(v,3)+' m'),
        ' — '+(err>=0?'+':'')+f(err,2)+'%. ',Math.abs(err)<=0.5?'The scale holds.':'Recalibrate from this dimension if you trust it.')));
    return {v,err};
  };
  inp.addEventListener('input',cmp);
  openModal('Check the scale of '+(s.no||s.name),el('div',{class:'stack'},
    el('p',{class:'hint',style:'margin:0'},'What does the drawing say this dimension is? Use a figured dimension, not one you scaled.'),
    el('label',{class:'f'},el('span',{},'Written dimension (m)'),inp),res),
    [el('button',{class:'btn pri',onclick:()=>{
      const r=cmp();if(!r){toast('Enter the written dimension in metres.');return;}
      if(Math.abs(r.err)>1){toast('The difference is over 1%. Recalibrate, or check you picked the right dimension.',4500);return;}
      tkSnap();s.checked=true;tkMark(s.id);closeModal();tkSetTool('select');tkChanged();toast('Scale checked on '+(s.no||s.name));
    }},'Mark scale as checked'),
    el('button',{class:'btn',onclick:()=>{
      const r=cmp();if(!r){toast('Enter the written dimension in metres.');return;}
      tkSnap();s.mpu=r.v/TKCore.d2(a,b);s.scale=Object.assign({},s.scale,{mode:'cal',ratio:Math.round(s.mpu/(0.0254/72))});
      s.checked=true;tkMark(s.id);closeModal();tkSetTool('select');tkChanged();toast('Recalibrated from this dimension and marked checked');
    }},'Recalibrate from it'),
    el('button',{class:'btn',onclick:()=>{closeModal();}},'Cancel')]);
  setTimeout(()=>inp.focus(),60);
}

/* ---------- dimension groups ---------- */
function tkWtOptions(kind,cur){
  const units=kind==='count'?['nr']:kind==='line'?['m','m2','m3','t']:['m2','m3','m','t'];
  const byG={};
  WT_KEYS.filter(k=>units.indexOf(WT[k].u)>=0||k===cur).forEach(k=>{(byG[WT[k].g]=byG[WT[k].g]||[]).push(k);});
  const s=el('select',{});
  s.append(el('option',{value:''},'— choose the bill item —'));
  Object.keys(byG).forEach(gn=>{
    const og=el('optgroup',{label:gn});
    byG[gn].forEach(k=>{const o=el('option',{value:k},WT[k].desc.split(';')[0]+' ('+WT[k].u.replace('m2','m²').replace('m3','m³')+')'+(WT[k].desc.split(';')[1]?' —'+WT[k].desc.split(';')[1]:''));
      if(k===cur)o.selected=true;og.append(o);});
    s.append(og);
  });
  return s;
}
function tkGroupModal(gid,presetKind){
  const t=ensureTK(),ex=gid?tkGroup(gid):null;
  const g=ex?clone(ex):{id:null,name:'',color:null,tool:presetKind||'area',level:'',times:1,spec:'',link:'asm',asm:'',wt:'',f:'',attrs:{},hidden:false};
  if(!g.attrs)g.attrs={};
  const used=ex?t.traces.filter(x=>x.g===ex.id).length:0;
  if(!g.color){const u=t.groups.map(x=>x.color);g.color=TK_COLORS.find(c=>u.indexOf(c)<0)||TK_COLORS[t.groups.length%TK_COLORS.length];}
  if(g.link==='asm'&&!g.asm){const a=t.asms.find(x=>x.tool===g.tool);if(a)g.asm=a.id;else g.link='item';}
  const body=el('div',{class:'stack'});
  const draw=()=>{
    body.innerHTML='';
    const nmI=el('input',{id:'tk-g-nm',value:g.name,placeholder:g.link==='asm'&&tkAsm(g.asm)?tkAsm(g.asm).name:'e.g. GF slab 200 mm'});
    nmI.addEventListener('input',e=>g.name=e.target.value);
    const toolS=el('select',{id:'tk-g-tool',disabled:used?true:null});
    Object.keys(TK_TOOLS).forEach(k=>{const o=el('option',{value:k},TK_TOOLS[k]);if(g.tool===k)o.selected=true;toolS.append(o);});
    toolS.addEventListener('change',e=>{g.tool=e.target.value;const a=t.asms.find(x=>x.tool===g.tool);g.asm=a?a.id:'';g.link=a?'asm':'item';g.wt='';g.f='';draw();});
    const lvS=el('select',{id:'tk-g-lv'});
    [{v:'',t:'From the sheet'}].concat(levelOpts()).forEach(o=>{const op=el('option',{value:o.v},o.t);if((g.level||'')===o.v)op.selected=true;lvS.append(op);});
    lvS.addEventListener('change',e=>g.level=e.target.value);
    const tmI=el('input',{id:'tk-g-tm',class:'num',value:g.times,style:'max-width:90px'});
    tmI.addEventListener('input',e=>g.times=e.target.value);
    const spI=el('input',{id:'tk-g-sp',value:g.spec||'',placeholder:'e.g. ground floor; grade C35/45'});
    spI.addEventListener('input',e=>g.spec=e.target.value);
    body.append(el('div',{class:'grid g3'},
      el('label',{class:'f'},el('span',{},'Group name'),nmI),
      el('label',{class:'f'},el('span',{},'Measured as'+(used?' (fixed — has measurements)':'')),toolS),
      el('label',{class:'f'},el('span',{},'Level'),lvS)));
    body.append(el('div',{class:'grid g3'},
      el('label',{class:'f'},el('span',{},'Times (typical floors)'),tmI),
      el('label',{class:'f',style:'grid-column:span 2'},el('span',{},'Add to the bill description'),spI)));
    body.append(el('div',{},el('div',{class:'hint',style:'margin-bottom:5px'},'Colour'),
      el('div',{class:'tk-swatches'},TK_COLORS.map(c=>el('button',{class:g.color===c?'on':'',style:'background:'+c,title:c,
        onclick:()=>{g.color=c;draw();}})))));
    /* link */
    const modeRow=el('div',{class:'tabs',style:'margin:4px 0 0'},
      [['asm','Assembly — several bill items'],['item','Single bill item']].map(([k,l])=>
        el('button',{class:'tab'+(g.link===k?' on':''),onclick:()=>{g.link=k;draw();}},l)));
    body.append(modeRow);
    const names=TK_STDVARS.slice();
    if(g.link==='asm'){
      const aS=el('select',{id:'tk-g-asm'});
      const list=t.asms.filter(a=>a.tool===g.tool);
      if(!list.length)aS.append(el('option',{value:''},'No '+TK_TOOLS[g.tool].toLowerCase()+' assemblies yet'));
      list.forEach(a=>{const o=el('option',{value:a.id},a.name);if(a.id===g.asm)o.selected=true;aS.append(o);});
      aS.addEventListener('change',e=>{g.asm=e.target.value;g.attrs={};draw();});
      body.append(el('div',{class:'row',style:'align-items:flex-end'},el('label',{class:'f',style:'flex:1'},el('span',{},'Assembly'),aS),
        el('button',{class:'btn',onclick:()=>{tkAsmEditor(null,g.tool,()=>tkGroupModal(gid,presetKind));}},'New assembly')));
      const a=tkAsm(g.asm);
      if(a){
        if(a.note)body.append(el('div',{class:'hint'},a.note));
        if(a.inputs.length)body.append(el('div',{class:'grid g4'},a.inputs.map(i=>{
          const inp=el('input',{class:'num',id:'tk-g-a-'+i.k,value:g.attrs[i.k]!==undefined?g.attrs[i.k]:'',placeholder:String(i.def)});
          inp.addEventListener('input',e=>{if(e.target.value==='')delete g.attrs[i.k];else g.attrs[i.k]=e.target.value;prev();});
          return el('label',{class:'f'},el('span',{},i.label+' ('+i.k+(i.unit&&i.unit!=='—'?', '+i.unit:'')+')'),inp);})));
        a.inputs.forEach(i=>names.push(i.k));
      }
    }else{
      const wS=tkWtOptions(g.tool,g.wt);wS.id='tk-g-wt';
      wS.addEventListener('change',e=>{g.wt=e.target.value;g.f='';draw();});
      const fI=el('input',{id:'tk-g-f',class:'num',value:g.f||'',placeholder:tkDefaultF(g,g.wt)});
      fI.addEventListener('input',e=>{g.f=e.target.value;prev();});
      body.append(el('div',{class:'grid g2'},el('label',{class:'f'},el('span',{},'Bill item'),wS),
        el('label',{class:'f'},el('span',{},'Quantity formula'),fI)));
      const hI=el('input',{class:'num',id:'tk-g-H',value:g.attrs.H!==undefined?g.attrs.H:'',placeholder:'—'});
      hI.addEventListener('input',e=>{if(e.target.value==='')delete g.attrs.H;else g.attrs.H=e.target.value;prev();});
      const tI=el('input',{class:'num',id:'tk-g-T',value:g.attrs.T!==undefined?g.attrs.T:'',placeholder:'—'});
      tI.addEventListener('input',e=>{if(e.target.value==='')delete g.attrs.T;else g.attrs.T=e.target.value;prev();});
      const wI=el('input',{class:'num',id:'tk-g-W',value:g.attrs.W!==undefined?g.attrs.W:'',placeholder:'—'});
      wI.addEventListener('input',e=>{if(e.target.value==='')delete g.attrs.W;else g.attrs.W=e.target.value;prev();});
      body.append(el('div',{class:'grid g4'},
        el('label',{class:'f'},el('span',{},'Height H (m)'),hI),el('label',{class:'f'},el('span',{},'Thickness T (m)'),tI),
        el('label',{class:'f'},el('span',{},'Width W (m)'),wI)));
      names.push('H','T','W');
    }
    const pv=el('div',{});body.append(pv);
    const prev=()=>{
      pv.innerHTML='';
      const outs=g.link==='asm'?(tkAsm(g.asm)||{outs:[]}).outs:(g.wt?[{wt:g.wt,f:g.f||tkDefaultF(g,g.wt),suffix:''}]:[]);
      if(!outs.length)return;
      const vars=tkVars(g),tot=ex?tkGroupTotal(ex):null;
      const avail=TK_STDVARS.concat(Object.keys(vars));
      pv.append(el('div',{class:'tw'},el('table',{class:'mini'},
        el('thead',{},el('tr',{},['Bill item','Formula','Unit'].map(h=>el('th',{},h)))),
        el('tbody',{},outs.map(o=>{const e=TKCore.checkF(o.f,avail),w=WT[o.wt];
          return el('tr',{},el('td',{},w?w.desc.split(';')[0]+(o.suffix?' — '+o.suffix:''):'Unknown '+o.wt),
            el('td',{class:'num'},o.f,e?el('div',{class:'tk-ferr'},e):null),el('td',{},w?w.u:''));})))));
      pv.append(el('div',{class:'hint',style:'margin-top:6px'},'A net area · Ag gross area · P perimeter · Pc cut-out perimeter · L length · N count — each trace, then × times.'+
        (tot&&tot.n?' This group has '+tot.n+' measurement'+(tot.n>1?'s':'')+'.':'')));
    };
    prev();
  };
  draw();
  openModal(ex?'Group — '+ex.name:'New dimension group',body,[
    el('button',{class:'btn pri',onclick:()=>{
      if(g.link==='asm'&&!tkAsm(g.asm)){toast('Pick an assembly, or switch to a single bill item.');return;}
      if(g.link!=='asm'&&!g.wt){toast('Pick the bill item this group measures.');return;}
      if(!String(g.name||'').trim())g.name=g.link==='asm'?tkAsm(g.asm).name:WT[g.wt].desc.split(';')[0];
      g.times=nn(g.times)===null?1:num(g.times);
      if(ex){Object.assign(ex,g);}
      else{const o=Object.assign({},g);delete o.id;const ng=tkNewGroup(o);TK.group=ng.id;(TK.lastGroup=TK.lastGroup||{})[ng.tool]=ng.id;
        if(!TK_TOOLDEF[TK.tool].kind||TK_TOOLDEF[TK.tool].kind!==ng.tool)tkSetTool(TK_DRAWTOOLS[ng.tool][0]);}
      SAVED.dirty=true;closeModal();tkChanged();
      if(!ex)toast('Measuring into “'+(tkGroup()||{}).name+'”. '+TK_TOOLDEF[TK.tool].hint,4200);
    }},ex?'Save group':'Create group'),
    el('button',{class:'btn',onclick:closeModal},'Cancel'),
    el('div',{class:'spacer'}),
    ex?el('button',{class:'btn dgr',onclick:()=>{
      askConfirm('Delete group “'+ex.name+'”?',used?'Its '+used+' measurement'+(used>1?'s':'')+' are deleted with it.':'It has no measurements.','Delete group',()=>{
        tkSnap();const tt=ensureTK();
        tt.traces.filter(x=>x.g===ex.id).forEach(x=>tkMark(x.s));
        const gone=new Set(tt.traces.filter(x=>x.g===ex.id).map(x=>x.id));
        tt.traces=tt.traces.filter(x=>!gone.has(x.id)&&!gone.has(x.parent));
        tt.groups=tt.groups.filter(x=>x.id!==ex.id);
        if(TK.group===ex.id)TK.group=tt.groups.length?tt.groups[0].id:null;
        TK.sel=null;closeModal();tkChanged();toast('Group deleted');
      },true);
    }},'Delete group'):null],true);
}

/* ---------- assembly library ---------- */
function tkAsmLibrary(){
  const t=ensureTK();
  const body=el('div',{});
  const uses=a=>t.groups.filter(g=>g.link==='asm'&&g.asm===a.id).length;
  body.append(el('p',{class:'hint',style:'margin-top:0'},'An assembly turns one trace into several bill items. Formulas use A, Ag, P, Pc, L and N from the trace and the assembly’s own inputs.'));
  body.append(el('div',{class:'tw'},el('table',{},
    el('thead',{},el('tr',{},['Assembly','Measured as','Bill items','Used by',''].map(h=>el('th',{},h)))),
    el('tbody',{},t.asms.map(a=>el('tr',{},
      el('td',{style:'font-weight:600'},a.name),el('td',{},TK_TOOLS[a.tool]),
      el('td',{class:'hint'},a.outs.map(o=>WT[o.wt]?WT[o.wt].desc.split(';')[0]:o.wt).join(' · ')),
      el('td',{class:'n'},uses(a)||''),
      el('td',{style:'white-space:nowrap'},
        el('button',{class:'btn sm',onclick:()=>tkAsmEditor(a.id,a.tool,tkAsmLibrary)},'Edit'),' ',
        el('button',{class:'btn sm gho',onclick:()=>{const c=clone(a);c.id=uid('asm');c.name=a.name+' (copy)';c.seed=false;t.asms.push(c);SAVED.dirty=true;tkAsmEditor(c.id,c.tool,tkAsmLibrary);}},'Duplicate'),' ',
        uses(a)?null:el('button',{class:'btn sm dgr',onclick:()=>{t.asms=t.asms.filter(x=>x.id!==a.id);SAVED.dirty=true;tkChanged();tkAsmLibrary();}},'Delete'))))))));
  openModal('Assemblies',body,[
    el('button',{class:'btn pri',onclick:()=>tkAsmEditor(null,'area',tkAsmLibrary)},'New assembly'),
    el('button',{class:'btn',onclick:()=>{t.asms=t.asms.concat(tkSeedAssemblies().filter(s=>!t.asms.some(a=>a.id===s.id)));SAVED.dirty=true;tkAsmLibrary();}},'Restore missing starter assemblies'),
    el('div',{class:'spacer'}),el('button',{class:'btn',onclick:closeModal},'Close')],true);
}
function tkAsmEditor(aid,tool,back){
  const t=ensureTK(),ex=aid?tkAsm(aid):null;
  const a=ex?clone(ex):{id:uid('asm'),name:'',tool:tool||'area',note:'',inputs:[],outs:[{wt:'',f:'',suffix:''}]};
  const body=el('div',{class:'stack'});
  const draw=()=>{
    body.innerHTML='';
    const nI=el('input',{id:'tk-a-nm',value:a.name,placeholder:'e.g. Precast hollowcore floor'});nI.addEventListener('input',e=>a.name=e.target.value);
    const tS=el('select',{id:'tk-a-tool'});Object.keys(TK_TOOLS).forEach(k=>{const o=el('option',{value:k},TK_TOOLS[k]);if(a.tool===k)o.selected=true;tS.append(o);});
    tS.addEventListener('change',e=>{a.tool=e.target.value;draw();});
    const noI=el('input',{id:'tk-a-note',value:a.note||'',placeholder:'How to trace it'});noI.addEventListener('input',e=>a.note=e.target.value);
    body.append(el('div',{class:'grid g3'},el('label',{class:'f'},el('span',{},'Name'),nI),el('label',{class:'f'},el('span',{},'Measured as'),tS),
      el('label',{class:'f'},el('span',{},'Note'),noI)));
    body.append(el('h4',{style:'font-size:12px;margin:4px 0 0'},'Inputs'));
    body.append(el('div',{class:'tw tk-ftab'},el('table',{class:'mini'},
      el('thead',{},el('tr',{},['Key','Label','Default','Unit',''].map(h=>el('th',{},h)))),
      el('tbody',{},a.inputs.map((i,ix)=>{
        const c=(k,w)=>{const x=el('input',{value:i[k]===undefined?'':i[k],class:k==='def'?'num':'',style:w?'max-width:'+w+'px':''});
          x.addEventListener('input',e=>{i[k]=k==='k'?e.target.value.replace(/[^A-Za-z0-9_]/g,''):e.target.value;if(k==='k'||k==='def')chk();});return x;};
        return el('tr',{},el('td',{},c('k',70)),el('td',{},c('label')),el('td',{},c('def',90)),el('td',{},c('unit',70)),
          el('td',{},el('button',{class:'btn sm gho',onclick:()=>{a.inputs.splice(ix,1);draw();}},'Remove')));})))));
    body.append(el('div',{},el('button',{class:'btn sm',onclick:()=>{a.inputs.push({k:'',label:'',def:0,unit:'m'});draw();}},'Add input')));
    body.append(el('h4',{style:'font-size:12px;margin:8px 0 0'},'Bill items'));
    const errs=[];
    body.append(el('div',{class:'tw tk-ftab'},el('table',{class:'mini'},
      el('thead',{},el('tr',{},['Bill item','Formula','Description suffix',''].map(h=>el('th',{},h)))),
      el('tbody',{},a.outs.map((o,ix)=>{
        const ws=tkWtOptions(a.tool,o.wt);ws.addEventListener('change',e=>{o.wt=e.target.value;});
        const fi=el('input',{class:'num',value:o.f,placeholder:'e.g. A*T'});
        const er=el('div',{class:'tk-ferr'});errs.push({o,er});
        fi.addEventListener('input',e=>{o.f=e.target.value;chk();});
        const si=el('input',{value:o.suffix||''});si.addEventListener('input',e=>o.suffix=e.target.value);
        return el('tr',{},el('td',{style:'max-width:300px'},ws),el('td',{},fi,er),el('td',{},si),
          el('td',{},el('button',{class:'btn sm gho',onclick:()=>{a.outs.splice(ix,1);draw();}},'Remove')));})))));
    const chk=()=>{const names=TK_STDVARS.concat(a.inputs.map(i=>i.k).filter(Boolean));
      errs.forEach(x=>{x.er.textContent=x.o.f?TKCore.checkF(x.o.f,names):'';});};
    chk();
    body.append(el('div',{},el('button',{class:'btn sm',onclick:()=>{a.outs.push({wt:'',f:'',suffix:''});draw();}},'Add bill item')));
  };
  draw();
  openModal(ex?'Assembly — '+ex.name:'New assembly',body,[
    el('button',{class:'btn pri',onclick:()=>{
      if(!a.name.trim()){toast('Give the assembly a name.');return;}
      a.inputs=a.inputs.filter(i=>i.k);
      const keys=a.inputs.map(i=>i.k);
      if(keys.some((k,i)=>keys.indexOf(k)!==i||TK_STDVARS.indexOf(k)>=0)){toast('Input keys must be unique and cannot be A, Ag, P, Pc, L or N.',4000);return;}
      a.outs=a.outs.filter(o=>o.wt||o.f);
      if(!a.outs.length){toast('Add at least one bill item.');return;}
      const names=TK_STDVARS.concat(keys);
      const bad=a.outs.find(o=>!o.wt||!o.f||TKCore.checkF(o.f,names));
      if(bad){toast('Every bill item needs an item and a valid formula.',3800);return;}
      a.inputs.forEach(i=>i.def=num(i.def));
      if(ex)Object.assign(ex,a);else ensureTK().asms.push(a);
      SAVED.dirty=true;tkChanged();
      if(back)back();else closeModal();
    }},'Save assembly'),
    el('button',{class:'btn',onclick:()=>{if(back)back();else closeModal();}},'Cancel')],true);
}

/* ==========================================================================
   Part T7: the example sheet — a vector A3 ground-floor plan at 1:100 with
   a part-measured take-off, so the screen opens in a working state.
   ========================================================================== */
const TK_DEMO={"sheet": {"no": "A-101", "name": "Ground floor plan", "rev": "C", "w": 1190.551, "h": 841.89, "ratio": 100}, "groups": [{"k": "slab", "name": "GF slab on grade", "tool": "area", "link": "asm", "asm": "asm.gslab", "attrs": {"T": 0.2, "Hc": 0.3}, "spec": "ground floor"}, {"k": "ext", "name": "External walls 200", "tool": "line", "link": "asm", "asm": "asm.extwall", "attrs": {"H": 3.6, "Op": 16.2}}, {"k": "int", "name": "Internal walls 150", "tool": "line", "link": "asm", "asm": "asm.intwall", "attrs": {"H": 3.4}}, {"k": "room", "name": "Room finishes", "tool": "area", "link": "asm", "asm": "asm.room", "attrs": {"H": 3.2}}, {"k": "wet", "name": "Wet rooms", "tool": "area", "link": "asm", "asm": "asm.wet", "attrs": {"H": 3.0, "Ht": 2.4}}, {"k": "col", "name": "Columns 400 \u00d7 400", "tool": "count", "link": "asm", "asm": "asm.col", "attrs": {"B": 0.4, "D": 0.4, "H": 3.4}}], "traces": [{"g": "slab", "kind": "area", "pts": [[113.386, 127.559], [566.929, 127.559], [566.929, 467.717], [113.386, 467.717]]}, {"g": "ext", "kind": "line", "pts": [[116.22, 130.394], [564.094, 130.394], [564.094, 464.882], [116.22, 464.882], [116.22, 130.394]]}, {"g": "int", "kind": "line", "pts": [[311.811, 133.228], [311.811, 462.047]]}, {"g": "int", "kind": "line", "pts": [[119.055, 325.984], [309.685, 325.984]]}, {"g": "int", "kind": "line", "pts": [[313.937, 269.291], [561.26, 269.291]]}, {"g": "int", "kind": "line", "pts": [[453.543, 133.228], [453.543, 267.165]]}, {"g": "room", "kind": "area", "pts": [[119.055, 133.228], [309.685, 133.228], [309.685, 323.858], [119.055, 323.858]], "k": "majlis"}, {"g": "room", "kind": "area", "pts": [[119.055, 328.11], [309.685, 328.11], [309.685, 462.047], [119.055, 462.047]]}, {"g": "room", "kind": "area", "pts": [[313.937, 271.417], [561.26, 271.417], [561.26, 462.047], [313.937, 462.047]], "k": "living"}, {"g": "room", "kind": "cut", "parent": "living", "pts": [[405.354, 360.0], [416.693, 360.0], [416.693, 371.339], [405.354, 371.339]]}, {"g": "room", "kind": "cut", "parent": "living", "pts": [[490.394, 360.0], [501.732, 360.0], [501.732, 371.339], [490.394, 371.339]]}, {"g": "wet", "kind": "area", "pts": [[455.669, 133.228], [561.26, 133.228], [561.26, 267.165], [455.669, 267.165]]}, {"g": "col", "kind": "count", "pts": [[411.024, 365.669], [496.063, 365.669]]}]};
function tkLoadExample(fresh){
  const t=ensureTK(),D=TK_DEMO;
  if(!D){toast('The example drawing is not available in this view.');return;}
  const busy=['footings','columns','slabs','walls','rooms'].some(k=>(P[k]||[]).length)||t.traces.length;
  if(busy&&!fresh){
    askConfirm('Open the example in a new project?',
      'The example plan comes part-measured. Opening it in this project would add its quantities to this bill.',
      'Start a new project with it',()=>{closeModal();newProject();view='draw';tab.draw='tk';render();setTimeout(()=>tkLoadExample(true),30);});
    return;
  }
  if(t.sheets.some(s=>s.src&&s.src.url==='assets/demo-gf-plan.pdf')){toast('The example plan is already open.');return;}
  /* make sure the starter assemblies it uses exist */
  tkSeedAssemblies().forEach(a=>{if(!t.asms.some(x=>x.id===a.id))t.asms.push(a);});
  const fl=floors()[0];
  const s={id:uid('s'),no:D.sheet.no,name:D.sheet.name+' (example)',rev:D.sheet.rev,level:fl?fl.key:'',
    src:{type:'pdf',url:'assets/demo-gf-plan.pdf',file:'demo-gf-plan.pdf',page:1},w:D.sheet.w,h:D.sheet.h,
    mpu:D.sheet.ratio*0.0254/72,scale:{mode:'ratio',ratio:D.sheet.ratio,paper:'',suggest:D.sheet.ratio},checked:false};
  t.sheets.push(s);
  const gid={};
  D.groups.forEach(g=>{const o=Object.assign({},g);delete o.k;
    o.attrs=Object.assign({},g.attrs);const ng=tkNewGroup(o);gid[g.k]=ng.id;});
  const tid={};
  D.traces.forEach(x=>{
    const g=tkGroup(gid[x.g]);
    const tr=tkNewTrace(s,g,x.kind,x.pts.map(p=>p.slice()));
    if(x.k)tid[x.k]=tr.id;
    if(x.parent)tr.parent=tid[x.parent]||null;
  });
  TK.group=gid.room;tkMark(s.id);TK.undo=[];TK.redo=[];
  tkOpenSheet(s.id);tkSetTool('select');tkChanged();
  toast('Example loaded. The kitchen is not measured yet — pick “Room finishes”, choose Fill room and click inside the kitchen.',7000);
}
