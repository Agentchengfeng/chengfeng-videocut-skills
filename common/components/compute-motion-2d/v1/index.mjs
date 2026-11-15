/** Common compute illustrations v1: orthographic SVG, logical pixels and seconds.
 * All layouts are generic metaphors, never a product die shot or benchmark.
 * Stateless: host frame/fps is the only clock. No DOM, CSS animation or RNG.
 */
export const VERSION='1.0.0';
export const C=Object.freeze({bg:'#07111a',panel:'#101f2d',edge:'#344b5d',white:'#ecf3f8',muted:'#91a8ba',cyan:'#77d6ed',mint:'#91ddbf',amber:'#edbd80',red:'#ec8794',purple:'#b9a7ec'});
export const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
export const ease=n=>{n=clamp(n);return n*n*(3-2*n)};
export const phase=(time,offset=0,speed=.22)=>((time*speed+offset)%1+1)%1;
export const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export const text=(x,y,s,size=26,color=C.white,attrs='')=>`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${attrs}>${esc(s)}</text>`;
export const center=(x,y,s,size=26,color=C.white,attrs='')=>text(x,y,s,size,color,`text-anchor="middle" ${attrs}`);
export const rect=(x,y,w,h,color=C.panel,r=12,attrs='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${color}" ${attrs}/>`;
export const line=(x,y,xx,yy,color=C.edge,width=2,attrs='')=>`<path d="M${x} ${y}L${xx} ${yy}" fill="none" stroke="${color}" stroke-width="${width}" ${attrs}/>`;
export const path=(d,color=C.cyan,width=3,attrs='')=>`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${attrs}/>`;
export const circle=(x,y,r,color,attrs='')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" ${attrs}/>`;
export const group=(s,x=0,y=0,scale=1,opacity=1)=>`<g transform="translate(${x} ${y}) scale(${scale})" opacity="${clamp(opacity)}">${s}</g>`;
function validate({x=0,y=0,time=0,width=1,height=1,size=1}={}){if([x,y,time,width,height,size].some(v=>!Number.isFinite(v))||Math.min(width,height,size)<=0)throw Error('Finite position/time and positive dimensions required')}
function state(...values){if(values.some(v=>!Number.isFinite(v)))throw Error('Finite normalized state required')}
function namespace(id){if(!/^[a-zA-Z][\w-]*$/.test(id))throw Error('SVG namespace must be an identifier');return id}
export function defs(id='compute'){
 namespace(id);return `<defs>
 <linearGradient id="${id}-substrate" x2="0" y2="1"><stop stop-color="#2b4353"/><stop offset=".46" stop-color="#152d3c"/><stop offset="1" stop-color="#0b1b27"/></linearGradient>
 <linearGradient id="${id}-rim" x2="1" y2="1"><stop stop-color="#8ba9b8"/><stop offset=".26" stop-color="#4c6b7d"/><stop offset=".61" stop-color="#192d3e"/><stop offset="1" stop-color="#5f7a8c"/></linearGradient>
 <linearGradient id="${id}-silicon" x2="1" y2="1"><stop stop-color="#15243b"/><stop offset=".5" stop-color="#263650"/><stop offset="1" stop-color="#111c2b"/></linearGradient>
 <linearGradient id="${id}-glass" x2=".6" y2="1"><stop stop-color="#7bafbd"/><stop offset=".35" stop-color="#18364c"/><stop offset=".65" stop-color="#071321"/><stop offset="1" stop-color="#345f75"/></linearGradient>
 <radialGradient id="${id}-wash"><stop stop-color="#30556b" stop-opacity=".22"/><stop offset="1" stop-color="${C.bg}" stop-opacity="0"/></radialGradient>
 <pattern id="${id}-grid" width="36" height="36" patternUnits="userSpaceOnUse"><path d="M36 0H0V36" fill="none" stroke="#96c4dd" stroke-opacity=".065" stroke-width="1"/></pattern>
 <pattern id="${id}-grain" width="39" height="43" patternUnits="userSpaceOnUse"><path d="M3 7h1M23 16h1M13 35h2M35 41h1" stroke="#aacada" stroke-opacity=".07" stroke-width="1"/></pattern>
 </defs>`;
}
export function backdrop({x=0,y=0,width=1000,height=800,id='compute',grid=true}={}){
 validate({x,y,width,height});namespace(id);
 return rect(x,y,width,height,`url(#${id}-wash)`,24)+(grid?rect(x,y,width,height,`url(#${id}-grid)`,24):'')+rect(x,y,width,height,`url(#${id}-grain)`,24);
}
export function panel({x=0,y=0,width=100,height=100,id='compute',color=C.edge}={}){
 validate({x,y,width,height});namespace(id);
 return rect(x,y,width,height,'#0b1a27',18,`stroke="${color}" stroke-opacity=".55" stroke-width="1.4"`)+rect(x+2,y+2,width-4,height-4,`url(#${id}-grain)`,16)+line(x+18,y+2,x+width-18,y+2,'#8daaba',1,'opacity=".22"');
}
function shell(width,height,id,color){
 let s=rect(-width/2-8,-height/2-8,width+16,height+16,'#030910',19,'opacity=".6"');
 const nx=Math.max(4,Math.floor(width/18)),ny=Math.max(4,Math.floor(height/18));
 for(let i=0;i<nx;i++){const x=-width*.4+i*width*.8/(nx-1);for(const side of [-1,1])s+=rect(x-2.4,side<0?-height/2-12:height/2-1,4.8,13,'#a3a493',1)}
 for(let i=0;i<ny;i++){const y=-height*.4+i*height*.8/(ny-1);for(const side of [-1,1])s+=rect(side<0?-width/2-12:width/2-1,y-2.4,13,4.8,'#a3a493',1)}
 s+=rect(-width/2,-height/2,width,height,`url(#${id}-substrate)`,14,`stroke="${color}" stroke-opacity=".7" stroke-width="1.5"`);
 s+=rect(-width/2+9,-height/2+9,width-18,height-18,`url(#${id}-rim)`,9)+rect(-width/2+13,-height/2+13,width-26,height-26,`url(#${id}-silicon)`,7);
 for(const a of [-1,1])for(const b of [-1,1])s+=circle(a*(width/2-7),b*(height/2-7),1.8,'#c5d8df','opacity=".6"');
 return s;
}
function lanes(x,y,w,h,columns,rows,time,color,load,stalled){
 let s='';const cw=w/columns,ch=h/rows,gap=Math.min(4,cw*.3,ch*.3);
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
  const active=stalled?.08:.12+clamp(load)*(.2+.65*Math.pow((Math.sin(time*3-col*.55-row*.9)+1)/2,3));
  s+=rect(x+col*cw,y+row*ch,cw-gap,ch-gap,color,2,`fill-opacity="${active}" stroke="${color}" stroke-opacity=".25" stroke-width=".8"`);
  if(cw>28&&ch>24)s+=line(x+col*cw+4,y+row*ch+ch*.65,x+col*cw+cw-9,y+row*ch+ch*.65,color,.8,'opacity=".32"');
 }
 return s;
}
export function cpu({x=0,y=0,width=250,height=250,time=0,load=.7,stalled=false,color=C.cyan,id='compute',label='CPU'}={}){
 validate({x,y,width,height,time});state(load);if(typeof stalled!=='boolean')throw Error('Boolean stalled state required');if(width<160||height<160)return `<g transform="translate(${x} ${y}) scale(${width/250} ${height/250})">${cpu({width:250,height:250,time,load,stalled,color,id,label})}</g>`;let s=shell(width,height,id,color),left=-width/2+28,top=-height/2+42,w=width-56,h=height-108;
 s+=center(0,-height/2+34,label,30,color,'font-weight="700" letter-spacing="2"');
 s+=lanes(left,top,w,h,2,2,time,color,load,stalled);
 s+=rect(left,height/2-53,w,21,'#0b1d2a',3,`stroke="${color}" stroke-opacity=".45"`);
 for(let i=0;i<12;i++)s+=rect(left+4+i*(w-8)/12,height/2-49,Math.max(2,(w-8)/12-3),13,color,1,`opacity="${stalled?.18:.2+.5*phase(time,i/12)}"`);
 s+=center(0,height/2-13,stalled?'等待数据':'共享缓存',16,stalled?C.amber:C.muted);
 return group(s,x,y);
}
export function gpu({x=0,y=0,width=250,height=250,time=0,load=.7,stalled=false,color=C.purple,id='compute',label='GPU'}={}){
 validate({x,y,width,height,time});state(load);if(typeof stalled!=='boolean')throw Error('Boolean stalled state required');if(width<160||height<160)return `<g transform="translate(${x} ${y}) scale(${width/250} ${height/250})">${gpu({width:250,height:250,time,load,stalled,color,id,label})}</g>`;let s=shell(width,height,id,color),left=-width/2+26,top=-height/2+47,w=width-52,h=height-99;
 s+=center(0,-height/2+34,label,30,color,'font-weight="700" letter-spacing="2"');
 s+=lanes(left,top,w,h,6,4,time,color,load,stalled);
 const yy=height/2-39;s+=line(left,yy,left+w,yy,color,3,'opacity=".3"');
 if(!stalled)s+=circle(left+w*phase(time,0,.35),yy,3,color);
 s+=center(0,height/2-13,stalled?'等待数据':'并行计算阵列',16,stalled?C.amber:C.muted);
 return group(s,x,y);
}
export function chipPackage({x=0,y=0,size=220,time=0,load=.7,label='AI',color=C.mint,id='compute'}={}){
 validate({x,y,size,time});state(load);let s=shell(220,220,id,color);
 s+=lanes(-76,-76,152,152,6,6,time,color,load,false);
 s+=rect(-90,-21,180,42,'#102332',5,`stroke="${color}" stroke-opacity=".3"`)+center(0,9,label,29,color,'font-weight="700"');
 s+=line(-74,91,74,91,color,1,'opacity=".45"')+circle(-74+148*phase(time),91,3,color);
 return group(s,x,y,size/220);
}
export function memoryBank({x=0,y=0,width=200,height=420,time=0,label='存储',color=C.purple,id='compute'}={}){
 validate({x,y,width,height,time});let s=panel({x:-width/2,y:-height/2,width,height,id});
 if(label)s+=center(0,-height/2+40,label,Math.min(28,width*.17),color,'font-weight="700"');
 const compact=height<260,rows=compact?3:5,top=compact?18:66,h=(height-(compact?35:94))/rows;
 for(let i=0;i<rows;i++){
  const yy=-height/2+top+i*h;
  s+=rect(-width/2+18,yy,width-36,h-10,'#15303f',6,`stroke="${color}" stroke-opacity=".24"`);
  for(let j=0;j<4;j++)s+=rect(-width/2+28+j*(width-60)/4,yy+9,(width-60)/4-5,Math.max(3,h-30),'#0b1927',3,`stroke="${color}" stroke-opacity=".35"`);
  s+=line(-width/2+28,yy+h-16,width/2-28,yy+h-16,color,1,'opacity=".3"');
  s+=circle(width/2-27,yy+10,2.6,color,`opacity="${.25+.75*phase(time,i/5)}"`);
 }
 return group(s,x,y);
}
export function cacheBuffer({x=0,y=0,width=150,height=220,time=0,fill=.6,label='缓存',color=C.cyan,id='compute'}={}){
 validate({x,y,width,height,time});state(fill);let s=panel({x:-width/2,y:-height/2,width,height,id,color});
 s+=center(0,-height/2+36,label,25,color);
 const h=(height-76)/7;
 for(let i=0;i<7;i++){const yy=-height/2+55+i*h,active=i/7<clamp(fill);s+=rect(-width/2+18,yy,width-36,h-5,active?color:'#1c3342',3,`fill-opacity="${active?.3+.35*phase(time,i/7):.55}"`)}
 return group(s,x,y);
}
export function computeTile({x=0,y=0,width=190,height=130,time=0,load=.7,label='计算单元',color=C.mint,id='compute'}={}){
 validate({x,y,width,height,time});state(load);if(width<120||height<90){let a=rect(-width/2,-height/2,width,height,'#112838',7,`stroke="${color}" stroke-opacity=".6" stroke-width="1.2"`)+lanes(-width*.34,-height*.3,width*.68,height*.6,3,2,time,color,load,false);return group(a,x,y)}let s=panel({x:-width/2,y:-height/2,width,height,id,color});
 s+=center(0,-height/2+35,label,24,C.white,'font-weight="400"');
 s+=lanes(-width/2+17,-height/2+52,width-34,height-72,6,2,time,color,load,false);
 for(let a of [-1,1]){s+=line(a*width/2,-13,a*(width/2+8),-13,color,3)+line(a*width/2,13,a*(width/2+8),13,color,3)}
 return group(s,x,y);
}
/** Distances are arc length along a finite polyline, including reverse directions. */
export function pointAlong(points,p){
 if(!points||points.length<2||points.some(q=>q.length!==2||q.some(v=>!Number.isFinite(v)))||!Number.isFinite(p))throw Error('Finite polyline and progress required');
 const lengths=points.slice(1).map((q,i)=>Math.hypot(q[0]-points[i][0],q[1]-points[i][1]));
 const total=lengths.reduce((a,b)=>a+b,0);if(total===0)throw Error('Nonzero path length required');
 let d=clamp(p)*total,i=0;
 while(i<lengths.length-1&&(d>lengths[i]||lengths[i]===0))d-=lengths[i++];
 const q=lengths[i]===0?0:d/lengths[i],a=points[i],b=points[i+1];return {x:a[0]+(b[0]-a[0])*q,y:a[1]+(b[1]-a[1])*q,heading:Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI};
}
export function dataBus({points,time=0,color=C.cyan,count=3,speed=.25,active=1,width=2.5,arrow=true}={}){
 validate({time});if(!Number.isInteger(count)||count<0||count>32||!Number.isFinite(speed)||!Number.isFinite(active))throw Error('Invalid bus count/speed/state');
 pointAlong(points,0);const d='M'+points.map(p=>p.join(' ')).join('L');
 let s=path(d,color,width*4,'stroke-opacity=".06"')+path(d,color,width,'stroke-opacity=".28"');
 if(arrow){const q=pointAlong(points,.98);s+=`<path d="M-8-5L0 0-8 5" transform="translate(${q.x} ${q.y}) rotate(${q.heading})" fill="none" stroke="${color}" stroke-width="1.6" opacity="${.3+.5*clamp(active)}"/>`}
 for(let i=0;i<count;i++){const q=pointAlong(points,phase(time,i/count,speed));s+=`<g transform="translate(${q.x} ${q.y}) rotate(${q.heading})" opacity="${clamp(active)}">${rect(-8,-3,16,6,color,2)}${line(-20,0,-11,0,color,2,'opacity=".4"')}</g>`}
 return s;
}
export function modelNetwork({x=0,y=0,width=420,height=280,time=0,color=C.purple,layers=4,rows=4}={}){
 validate({x,y,width,height,time});if(!Number.isInteger(layers)||!Number.isInteger(rows)||layers<2||layers>8||rows<2||rows>10)throw Error('Network visual grid out of range');
 let s='';const points=Array.from({length:layers},(_,col)=>Array.from({length:rows},(_,r)=>[x-width/2+col*width/(layers-1),y-height/2+r*height/(rows-1)]));
 points.forEach((column,i)=>{if(i===layers-1)return;column.forEach((a,r)=>{for(let j=Math.max(0,r-1);j<=Math.min(rows-1,r+1);j++){const b=points[i+1][j];s+=line(...a,...b,color,1.2,'opacity=".19"');if(j===r)s+=dataBus({points:[a,b],time:time-i*.35,color,count:1,speed:.22,width:1.5,arrow:false})}})});
 points.forEach((column,i)=>column.forEach(([xx,yy],r)=>{const p=.3+.7*(Math.sin(time*2.5-i*.8-r*.4)+1)/2;s+=circle(xx,yy,12,C.bg,`stroke="${color}" stroke-width="1.5"`)+circle(xx,yy,6,color,`opacity="${p}"`)}));return s;
}
export function cameraSensor({x=0,y=0,size=140,time=0,color=C.cyan,id='compute'}={}){
 validate({x,y,size,time});let s=rect(-70,-55,140,110,`url(#${id}-substrate)`,17,`stroke="${color}" stroke-opacity=".5" stroke-width="2"`);
 for(const a of [-1,1])for(const b of [-1,1])s+=circle(a*59,b*43,2,'#bdd3dd');
 s+=circle(0,0,45,'#07121e','stroke="#748c9e" stroke-width="3"')+circle(0,0,35,`url(#${id}-glass)`,`stroke="${color}" stroke-opacity=".4" stroke-width="1.5"`);
 for(let i=0;i<6;i++){const a=i*Math.PI/3;s+=path(`M${Math.cos(a)*27} ${Math.sin(a)*27}L${Math.cos(a+.8)*15} ${Math.sin(a+.8)*15}`,color,1,'opacity=".3"')}
 s+=circle(-9,-10,8,'#d9f4fa','opacity=".14"')+circle(0,0,7,'#060e19')+circle(52,-36,3,color,`opacity="${.3+.7*phase(time)}"`);
 return group(s,x,y,size/140);
}
/** Two actual callers: a memory wall explanation and a compiler/dataflow fabric.
 * Fixed logical bounds allow scaling as a unit without a second timeline.
 */
export function memoryWall({x=0,y=0,width=1000,time=0,stalled=0,id='compute'}={}){
 validate({x,y,width,time});state(stalled);const b=clamp(stalled),isWaiting=b>.5;
 let s=backdrop({width:1000,height:740,id})+memoryBank({x:125,y:350,width:205,height:440,time,id});
 s+=dataBus({points:[[230,290],[405,290]],time,color:C.purple,active:1-b*.3,count:3})+dataBus({points:[[405,390],[230,390]],time,color:C.amber,active:1-b*.3,count:3});
 s+=dataBus({points:[[560,290],[620,290],[620,180],[685,180]],time,color:C.cyan,active:1-b*.85,count:2})+dataBus({points:[[560,390],[620,390],[620,505],[685,505]],time,color:C.cyan,active:1-b*.85,count:2});
 s+=cacheBuffer({x:485,y:340,width:150,height:250,time,fill:.35+b*.6,id})+cpu({x:825,y:180,width:250,height:250,time,stalled:isWaiting,id})+gpu({x:825,y:505,width:250,height:250,time,stalled:isWaiting,id});
 s+=center(315,253,'权重',25,C.purple)+center(315,438,'中间结果',25,C.amber);
 if(b>0){s+=group(line(638,260,638,420,C.red,4)+circle(638,340,13,'#291e2b',`stroke="${C.red}" stroke-width="2"`)+center(638,347,'!',20,C.red),0,0,1,b);for(let i=0;i<4;i++)s+=group(rect(574+i*11,324,6,11,C.amber,1),0,0,1,b)}
 s+=center(500,710,isWaiting?'计算单元有余量，数据仍在路上':'数据搬运与计算共同影响效率',29,isWaiting?C.amber:C.muted);
 return group(s,x,y,width/1000);
}
export function dataflowFabric({x=0,y=0,width=1000,time=0,reuse=1,columns=3,rows=3,color=C.mint,id='compute',label='编译规划 · 计算与数据路径'}={}){
 validate({x,y,width,time});state(reuse);if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<2||columns>4||rows<2||rows>4)throw Error('Fabric grid out of range');
 let s=backdrop({width:1000,height:820,id})+panel({x:90,y:0,width:820,height:75,id,color})+center(500,47,label,28,color);
 const xs=Array.from({length:columns},(_,i)=>145+i*710/(columns-1)),ys=Array.from({length:rows},(_,i)=>205+i*455/(rows-1));
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
  const xx=xs[col],yy=ys[row];
  if(col<columns-1)s+=dataBus({points:[[xx+102,yy],[xs[col+1]-102,yy]],time:time-row*.23-col*.17,color,count:2});
  if(row<rows-1)s+=dataBus({points:[[xx,yy+69],[xx,ys[row+1]-69]],time:time-row*.3-col*.21,color:C.cyan,count:1});
 }
 for(const xx of xs)s+=dataBus({points:[[xx,75],[xx,130]],time,color:C.purple,count:1,width:1.6});
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++)s+=computeTile({x:xs[col],y:ys[row],width:190,height:126,time:time-row*.2-col*.3,color,id});
 s+=group(dataBus({points:[[952,ys.at(-1)],[982,ys.at(-1)],[982,770],[18,770],[18,ys.at(-1)],[42,ys.at(-1)]],time,color:C.amber,count:4,width:2.2})+center(500,815,'中间结果 · 传递与复用',28,C.amber),0,0,1,reuse);
 return group(s,x,y,width/1000);
}
export function svgDoc(body,{width=1080,height=1280,viewWidth=width,viewHeight=height,id='compute',transparent=false}={}){
 validate({width,height});namespace(id);return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${viewWidth} ${viewHeight}" font-family="Noto Sans CJK SC, sans-serif">${defs(id)}${transparent?'':rect(0,0,viewWidth,viewHeight,C.bg,0)}${body}</svg>`;
}
