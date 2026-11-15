/** Original, orthographic 2D SVG components. No brand or internal-model claims.
 * Time is seconds; geometry is SVG pixels; heading is clockwise from north.
 * Every function is stateless, seedless/deterministic and seek-order independent.
 */
export const VERSION='1.0.0';
export const C={bg:'#0b1020',surface:'#111e30',road:'#202b3a',blue:'#57d8ef',amber:'#efbf70',green:'#65d9aa',red:'#ee7b83',purple:'#b5a0f3',white:'#eef3f8',muted:'#91a4b9',line:'#324359'};
export const clamp=x=>Math.max(0,Math.min(1,x));
export const ease=x=>{const t=clamp(x);return t*t*(3-2*t);};
export const mix=(a,b,t)=>a+(b-a)*t;
export const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export const text=(x,y,s,size=24,fill=C.white,extra='')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${esc(s)}</text>`;
export const line=(x1,y1,x2,y2,stroke=C.line,width=2,extra='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" ${extra}/>`;
export const rect=(x,y,w,h,fill,rx=12,extra='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;
export const circle=(x,y,r,fill,extra='')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
export function cubic(points,t){
  if(points.length!==4||points.some(p=>p.length!==2||p.some(v=>!Number.isFinite(v))))throw Error('Trajectory requires four finite [x,y] control points');
  const u=1-t;return [0,1].map(k=>u*u*u*points[0][k]+3*u*u*t*points[1][k]+3*u*t*t*points[2][k]+t*t*t*points[3][k]);
}
export function pose(points,t){const p=cubic(points,clamp(t)),a=cubic(points,Math.max(0,t-.001)),b=cubic(points,Math.min(1,t+.001));return {x:p[0],y:p[1],heading:Math.atan2(b[0]-a[0],a[1]-b[1])*180/Math.PI};}
export const curve=points=>`M${points[0].join(' ')} C${points.slice(1).map(p=>p.join(' ')).join(' ')}`;
export function defs(){return `<defs>
  <linearGradient id="paint-blue" x1="0" y1="0" x2="1" y2=".1"><stop stop-color="#1b687f"/><stop offset=".24" stop-color="#b3e5ed"/><stop offset=".54" stop-color="#6eb5c7"/><stop offset=".8" stop-color="#407e93"/><stop offset="1" stop-color="#173e56"/></linearGradient>
  <linearGradient id="paint-silver"><stop stop-color="#4d5d70"/><stop offset=".3" stop-color="#e0e5e9"/><stop offset=".65" stop-color="#9daab9"/><stop offset="1" stop-color="#485a70"/></linearGradient>
  <linearGradient id="paint-amber"><stop stop-color="#806033"/><stop offset=".3" stop-color="#f3d4a0"/><stop offset=".6" stop-color="#ceaa70"/><stop offset="1" stop-color="#786045"/></linearGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#446078"/><stop offset=".35" stop-color="#172a3b"/><stop offset=".65" stop-color="#091622"/><stop offset="1" stop-color="#2f465d"/></linearGradient>
  <linearGradient id="road-sheen" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#172130"/><stop offset=".5" stop-color="#26323f"/><stop offset="1" stop-color="#172130"/></linearGradient>
  <linearGradient id="sensor-fade" x1="0" y1="1" x2="0" y2="0"><stop stop-color="${C.blue}" stop-opacity=".25"/><stop offset="1" stop-color="${C.blue}" stop-opacity="0"/></linearGradient>
  <radialGradient id="surface-light"><stop stop-color="#234052" stop-opacity=".25"/><stop offset="1" stop-color="${C.bg}" stop-opacity="0"/></radialGradient>
  <pattern id="road-grain" width="43" height="51" patternUnits="userSpaceOnUse"><path d="M2 4h2M23 16h1M12 35h3M38 48h1" stroke="#b3c5ce" stroke-opacity=".065"/></pattern>
  <pattern id="quiet-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#6f94ae" stroke-opacity=".065" stroke-width="1"/></pattern>
  </defs>`;}
export function svgDoc(body,{width=1080,height=1600,viewWidth=width,viewHeight=height,transparent=false,namespace='adas-v1'}={}){
  if(!/^[a-zA-Z][\w-]*$/.test(namespace))throw Error('namespace must be an SVG-safe identifier');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${viewWidth} ${viewHeight}" font-family="Noto Sans CJK SC, PingFang SC, sans-serif">${defs()}${transparent?'':rect(0,0,viewWidth,viewHeight,C.bg,0)}${body}</svg>`;
  return svg.replace(/\bid="([^"]+)"/g,(_,id)=>`id="${namespace}-${id}"`).replace(/url\(#([^)]+)\)/g,(_,id)=>`url(#${namespace}-${id})`);
}

/** Detailed generic sedan/SUV/van, true top view. No image or branded geometry. */
export function vehicle({x=0,y=0,heading=0,scale=1,paint='blue',kind='suv',steering=0,brake=0,signal=false,time=0,opacity=1,ghost=false}={}){
  if(!['suv','sedan','van'].includes(kind))throw Error(`Unsupported vehicle kind ${kind}`);
  if(!['blue','silver','amber'].includes(paint))throw Error(`Unsupported vehicle paint ${paint}`);
  const body=kind==='sedan'?'M-34 101Q-48 87-49 50L-47-51Q-44-91-27-106Q0-116 27-106Q44-91 47-51L49 50Q48 87 34 101Q0 111-34 101Z':'M-38 98Q-51 90-51 57L-50-50Q-49-92-31-105Q0-114 31-105Q49-92 50-50L51 57Q51 90 38 98Q0 107-38 98Z';
  let s=`<g transform="translate(${x} ${y}) rotate(${heading}) scale(${scale})" opacity="${opacity}">`;
  if(ghost)return s+`<path d="${body}" fill="none" stroke="${C.blue}" stroke-width="2" stroke-dasharray="6 5"/><path d="M-34-50H34L29-18H-29Z" fill="none" stroke="${C.blue}" stroke-width="2"/></g>`;
  s+=`<ellipse cx="2" cy="8" rx="61" ry="117" fill="#03070d" opacity=".45"/>`;
  for(const side of [-1,1])for(const axle of [-1,1]){
    s+=`<g transform="translate(${side*50} ${axle<0?-57:59}) rotate(${axle<0?steering:0})">${rect(-10,-23,20,46,'#070c13',6,'stroke="#3d4651" stroke-width="1.5"')}${line(side*5,-17,side*5,17,'#6a7787',1.5)}${[-12,-4,4,12].map(z=>line(-6,z,6,z,'#29333d',1)).join('')}</g>`;
  }
  s+=`<path d="${body}" fill="url(#paint-${paint})" stroke="#b9d0da" stroke-opacity=".7" stroke-width="1.6"/>`;
  s+=`<path d="M-39-50Q-40-84-24-96Q0-104 24-96Q40-84 39-50L32-40H-32Z" fill="none" stroke="#e6f8ff" stroke-opacity=".38" stroke-width="1.3"/>`;
  s+=`<path d="M-37-49Q0-59 37-49L29-17Q0-12-29-17Z" fill="url(#glass)" stroke="#67808d" stroke-width="1.5"/>`;
  s+=`<path d="M-32-45Q-16-48 2-47L-22-22H-28Z" fill="#c5e5ef" opacity=".13"/>`;
  s+=rect(-31,-10,62,63,`url(#paint-${paint})`,13,'stroke="#f0fbff" stroke-opacity=".2"');
  s+=rect(-25,-4,50,34,'url(#glass)',8,'stroke="#8199a4" stroke-opacity=".65"');
  s+=`<path d="M-20 0H12L-16 24H-20Z" fill="#bbdce7" opacity=".1"/>`;
  s+=`<path d="M-29 57Q0 53 29 57L33 81Q0 87-33 81Z" fill="url(#glass)" stroke="#67808d" stroke-width="1.3"/>`;
  for(const side of [-1,1]){
    s+=`<path d="M${side*36}-12L${side*39}47" stroke="#d9edf1" stroke-opacity=".32" stroke-width="2"/>`;
    s+=`<path d="M${side*41}-32L${side*58}-27Q${side*63}-18 ${side*48}-18Z" fill="#688d9f" stroke="#a3c0cb" stroke-width="1"/>`;
    s+=line(side*44,5,side*44,17,'#d9eaf0',2)+line(side*44,48,side*44,59,'#d9eaf0',2);
    s+=`<path d="M${side*32}-91L${side*42}-80" stroke="#e9fbff" stroke-width="4" stroke-linecap="round"/>`;
    s+=line(side*26,92,side*43,87,brake?C.red:'#af5961',4,'stroke-linecap="round"');
  }
  s+=`<path d="M-24-101Q0-106 24-101" fill="none" stroke="#eafaff" stroke-width="1.6"/>`;
  s+=line(-19,96,19,96,brake?C.red:'#8b5a66',3)+line(0,-92,0,-62,'#e5f7ff',1,'opacity=".16"');
  if(kind==='van')s+=rect(-29,1,58,65,`url(#paint-${paint})`,9)+line(-20,15,20,15,'#d1e3e8',1.4,'opacity=".35"');
  if(signal&&Math.floor(time*3)%2===0)s+=`<path d="M43-80L47-68M45 86L33 94" stroke="${C.amber}" stroke-width="5" stroke-linecap="round"/>`;
  return s+'</g>';
}

export function rider({x=0,y=0,heading=0,scale=1,time=0,opacity=1}={}){
  return `<g transform="translate(${x} ${y}) rotate(${heading}) scale(${scale})" opacity="${opacity}">
  <ellipse cy="6" rx="33" ry="67" fill="#03070d" opacity=".4"/>
  ${rect(-6,-65,12,37,'#111b27',6,'stroke="#6d7b88" stroke-width="2"')}${rect(-6,31,12,37,'#111b27',6,'stroke="#6d7b88" stroke-width="2"')}
  <path d="M0-42L-9 38H9L0-42" fill="#a1b8c8" stroke="#c0d1d9" stroke-width="2"/>
  ${rect(-11,15,22,38,'#d4ad64',9)}${line(-24,-37,24,-37,'#b0bfc9',5,'stroke-linecap="round"')}
  <path d="M-15 4Q-26-2-25-31M15 4Q26-2 25-31" fill="none" stroke="#deb56f" stroke-width="10" stroke-linecap="round"/>
  <path d="M-12 18L-19 ${42+Math.sin(time*8)*3}M12 18L19 ${42-Math.sin(time*8)*3}" fill="none" stroke="#53667d" stroke-width="10" stroke-linecap="round"/>
  <ellipse cy="9" rx="21" ry="25" fill="#d0a45a" stroke="#eed09a" stroke-width="1.5"/>
  ${rect(-12,-1,24,28,'#b68d4c',7)}${circle(0,-16,15,'#e6d2a8','stroke="#f6e7c5" stroke-width="1.5"')}
  <path d="M-10-20Q0-27 10-20" fill="none" stroke="#fff5d7" stroke-width="2"/>
  ${line(-6,54,6,54,C.red,3)}</g>`;
}

/** 1000×1000 logical world. Vehicles and trajectories share this coordinate space. */
export function roadWorld({time=0,mode='urban',motion=1,height=1000}={}){
  if(!['urban','construction','narrow'].includes(mode))throw Error(`Unsupported world ${mode}`);
  const off=(time*31*motion)%240;let s=rect(0,0,1000,height,'#131f2b',0);
  for(const side of [0,1]){
    const x=side?888:0;
    for(let i=-1;i<Math.ceil(height/245)+1;i++){
      const y=i*245+(time*18*motion)%245;
      s+=rect(x+10,y+10,92,205,'#1a2a36',12,'stroke="#334250" stroke-opacity=".45"');
      s+=rect(x+19,y+24,74,175,'#1d303c',7);
      s+=line(x+25,y+40,x+85,y+40,'#6c8392',2,'opacity=".2"');
    }
    s+=rect(side?814:108,0,78,height,'#2e3941',0);
    for(let i=-1;i<Math.ceil(height/86)+1;i++){const y=i*86+off%86;s+=rect(side?814:172,y,14,40,i%2?'#83908f':'#43535c',2,'opacity=".55"');}
    for(let i=0;i<Math.ceil(height/270);i++){const y=i*270+off%270;const xx=side?855:145;s+=circle(xx,y,22,'#28423d','stroke="#3b5c4e" stroke-width="2"')+circle(xx-5,y-5,12,'#35564a','opacity=".6"');}
  }
  s+=rect(186,0,628,height,'url(#road-sheen)',0)+rect(186,0,628,height,'url(#road-grain)',0);
  s+=line(205,0,205,height,'#9baaa9',3,'opacity=".65"')+line(795,0,795,height,'#9baaa9',3,'opacity=".65"');
  if(mode!=='narrow'){
    for(let i=-1;i<Math.ceil(height/180)+1;i++){const y=i*180+off%180;s+=line(500,y,500,y+79,'#c0c6c2',4,'opacity=".55"');}
    for(const x of [350,650])s+=`<path d="M${x} 110v-48m-19 20l19-20 19 20" fill="none" stroke="#c2cece" stroke-width="7" opacity=".09"/>`;
  }else{
    for(const x of [212,705])for(const y of [190,440,760])s+=rect(x,y,84,205,'none',3,'stroke="#6c7a80" stroke-width="2" stroke-dasharray="7 9" opacity=".4"');
  }
  return s;
}
export function worldFrame(id,x,y,w,h,body){const H=1000*h/w;return `<defs><clipPath id="${esc(id)}"><rect width="1000" height="${H}" rx="28"/></clipPath></defs><g transform="translate(${x} ${y}) scale(${w/1000})"><g clip-path="url(#${esc(id)})">${body}</g>${rect(0,0,1000,H,'none',28,`stroke="#52677d" stroke-opacity=".4" stroke-width="1.5"`)}</g>`;}

export function trajectory({points,color=C.green,time=0,progress=1,dashed=false,width=7,opacity=1,flow=true}={}){
  const p=clamp(progress);if(p===0)return '';
  // De Casteljau prefix: browsers and Resvg reveal the same true geometry;
  // no dependence on differing SVG pathLength/dash normalization support.
  const lerp=(a,b)=>a.map((x,i)=>mix(x,b[i],p)),a=lerp(points[0],points[1]),b=lerp(points[1],points[2]);
  const d=curve([points[0],a,lerp(a,b),cubic(points,p)]);
  let s=`<g opacity="${opacity}"><path d="${d}" fill="none" stroke="${color}" stroke-width="${width*5}" stroke-opacity=".09" stroke-linecap="round"/>
  <path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" ${dashed?'stroke-dasharray="9 11"':''}/>`;
  if(flow)for(let i=0;i<4;i++){const t=((time*.19+i/4)%1)*p,q=pose(points,t);s+=`<path d="M-7 7L0-3 7 7" transform="translate(${q.x} ${q.y}) rotate(${q.heading})" fill="none" stroke="${color}" stroke-width="2.5" opacity="${.3+.7*t}"/>`;}
  const end=cubic(points,p);s+=circle(end[0],end[1],6,color)+circle(end[0],end[1],13,'none',`stroke="${color}" stroke-width="1.5" stroke-opacity=".5"`);
  return s+'</g>';
}
export function sensorField({x,y,heading=0,time=0,scale=1,opacity=1}={}){
  let s=`<g transform="translate(${x} ${y}) rotate(${heading}) scale(${scale})" opacity="${opacity}"><path d="M0 0L-280-570Q0-660 280-570Z" fill="url(#sensor-fade)"/>`;
  for(const r of [210,365,520])s+=`<path d="M${-.43*r} ${-.9*r}Q0 ${-1.08*r} ${.43*r} ${-.9*r}" fill="none" stroke="${C.blue}" stroke-opacity=".2" stroke-width="1.5"/>`;
  const a=(-.36+.72*((time*.22)%1)),sx=Math.sin(a)*590,sy=-Math.cos(a)*590;
  s+=line(0,0,sx,sy,C.blue,1.5,'opacity=".24"')+circle(0,0,12,C.blue,'opacity=".15"');return s+'</g>';
}
export function trackingBox({x,y,width=90,height=145,label='',color=C.blue,opacity=1}={}){
  let s=`<g opacity="${opacity}">${rect(x-width/2,y-height/2,width,height,color,12,'fill-opacity=".04"')}`;
  const a=x-width/2,b=y-height/2,L=15;
  for(const [xx,yy,dx,dy] of [[a,b,1,1],[a+width,b,-1,1],[a,b+height,1,-1],[a+width,b+height,-1,-1]])s+=`<path d="M${xx} ${yy+dy*L}V${yy}H${xx+dx*L}" fill="none" stroke="${color}" stroke-width="2.5"/>`;
  if(label)s+=text(a,b-13,label,22,color);return s+'</g>';
}
export function barrier(x,y,width=145,height=75){let s=rect(x,y,width,height,'#574c3e',8,'stroke="#d9ac68" stroke-width="2"');for(let i=0;i<width/26;i++)s+=`<path d="M${x+8+i*26} ${y+10}l-8 ${height-20}" stroke="#dfbd7e" stroke-width="8" opacity=".85"/>`;return s;}
export function modelCore({x=0,y=0,width=260,height=250,time=0,label='模型',color=C.purple}={}){
  let s=rect(x,y,width,height,'#131f30',20,`stroke="${color}" stroke-width="2"`);
  for(let i=0;i<8;i++){const xx=x+25+i*(width-50)/7;s+=line(xx,y-12,xx,y,color,2,'opacity=".55"')+line(xx,y+height,xx,y+height+12,color,2,'opacity=".55"');}
  for(let i=0;i<6;i++){const yy=y+25+i*(height-60)/5;s+=line(x-12,yy,x,yy,color,2,'opacity=".45"')+line(x+width,yy,x+width+12,yy,color,2,'opacity=".45"');}
  s+=rect(x+13,y+13,width-26,height-66,'#091421',10,`stroke="${color}" stroke-opacity=".16"`);
  const cell=Math.min((width-64)/6,(height-86)/5),left=x+(width-cell*6)/2,top=y+26;
  for(let r=0;r<5;r++)for(let c=0;c<6;c++){
    const a=.1+.38*Math.pow((Math.sin(time*2-r*.6-c*.4)+1)/2,3),xx=left+c*cell,yy=top+r*cell;
    s+=rect(xx,yy,cell-5,cell-5,color,3,`opacity="${a}"`);
    s+=line(xx+4,yy+cell*.43,xx+cell-10,yy+cell*.43,color,.7,'opacity=".22"')+circle(xx+cell*.55,yy+cell*.68,1.2,color,'opacity=".5"');
  }
  const q=(time*.2)%1,ny=top+cell*2.5;
  s+=`<path d="M${x} ${ny}H${left+cell}l${cell} ${-cell}h${cell*2}l${cell} ${cell}H${x+width}" fill="none" stroke="${color}" stroke-width="1.6" stroke-opacity=".65"/>`;
  s+=circle(left+cell*6*q,ny,3,color,'opacity=".8"');
  s+=text(x+width/2,y+height-25,label,25,C.white,'text-anchor="middle"');return s;
}
export function phaseRail({x=54,y=365,width=620,items=['识别','预测','决策'],active=0,time=0,colors=[C.blue,C.amber,C.green]}={}){
  let s='';const step=width/items.length;
  items.forEach((item,i)=>{const xx=x+i*step,color=colors[i%colors.length];s+=circle(xx+14,y,7,i<=active?color:'#344457')+text(xx,y+41,item,25,i===active?C.white:C.muted,i===active?'font-weight="600"':'');if(i<items.length-1)s+=line(xx+30,y,xx+step-13,y,i<active?color:C.line,2);});
  const q=(time*.24)%1;s+=circle(x+15+q*(width-step+3),y,3,C.white,'opacity=".55"');return s;
}
export function feedbackCircuit({points,color=C.purple,time=0,progress=1}={}){return trajectory({points,color,time,progress,width:3,opacity:.8});}
