/** Orthographic engineering objects. SVG pixels, seconds and normalized states.
 * Generic spatial/mechanical illustrations; no control interface or benchmark.
 * No wall clock, random state, autoplay, perspective or external dependencies.
 */
export const VERSION='1.0.0';
export const P={bg:'#080f1b',panel:'#101e2c',edge:'#3a5268',text:'#edf5fa',muted:'#8ca5ba',cyan:'#61d6e7',purple:'#b6a0f3',orange:'#f0b578',red:'#e77583',green:'#6fd0b0'};
export const clamp=x=>Math.max(0,Math.min(1,x));
export const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export const tx=(x,y,s,size=26,color=P.text,anchor='start',extra='')=>`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" text-anchor="${anchor}" ${extra}>${esc(s)}</text>`;
export const box=(x,y,w,h,fill=P.panel,r=12,extra='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
export const ln=(x1,y1,x2,y2,color=P.edge,width=2,extra='')=>`<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${width}" ${extra}/>`;
export function engineeringDefs(id='eng'){
 if(!/^[a-zA-Z][\w-]*$/.test(id))throw Error('Invalid definition namespace');
 return `<defs>
 <linearGradient id="${id}-metal"><stop stop-color="#233447"/><stop offset=".22" stop-color="#4c647b"/><stop offset=".48" stop-color="#26394c"/><stop offset="1" stop-color="#111f2c"/></linearGradient>
 <linearGradient id="${id}-dark" x2=".7" y2="1"><stop stop-color="#1c3043"/><stop offset=".5" stop-color="#101d2b"/><stop offset="1" stop-color="#172738"/></linearGradient>
 <linearGradient id="${id}-die"><stop stop-color="#201b39"/><stop offset=".5" stop-color="#746295"/><stop offset="1" stop-color="#29203f"/></linearGradient>
 <linearGradient id="${id}-wood" x2="0" y2="1"><stop stop-color="#cfad7b"/><stop offset=".32" stop-color="#b98f5b"/><stop offset="1" stop-color="#73593d"/></linearGradient>
 <linearGradient id="${id}-steel"><stop stop-color="#44566b"/><stop offset=".45" stop-color="#d0d9dd"/><stop offset=".58" stop-color="#8195a7"/><stop offset="1" stop-color="#304256"/></linearGradient>
 <radialGradient id="${id}-halo"><stop stop-color="#32536e" stop-opacity=".28"/><stop offset="1" stop-color="#080f1b" stop-opacity="0"/></radialGradient>
 <pattern id="${id}-grain" width="37" height="43" patternUnits="userSpaceOnUse"><path d="M2 7h1M19 16h2M12 33h1M30 39h1" stroke="#a7c5dc" stroke-opacity=".1"/></pattern>
 <pattern id="${id}-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#8eabc2" stroke-opacity=".07"/></pattern>
 </defs>`;
}
export function instrumentPanel({x=0,y=0,width=1000,height=900,id='eng',grid=true}={}){
 return box(x,y,width,height,`url(#${id}-dark)`,24,`stroke="#33495e" stroke-width="1.5"`)+
 box(x+2,y+2,width-4,height-4,`url(#${id}-grain)`,22)+
 (grid?box(x+2,y+2,width-4,height-4,`url(#${id}-grid)`,22):'')+
 ln(x+25,y+15,x+width-25,y+15,'#8cabc2',1,'opacity=".12"');
}
export function tableElevation({x=0,y=0,width=620,height=420,id='eng',opacity=1}={}){
 let s=`<g transform="translate(${x} ${y})" opacity="${opacity}">`;
 s+=box(35,48,54,height-48,`url(#${id}-wood)`,4,'stroke="#dfbd8c" stroke-width="1.5"')+box(width-89,48,54,height-48,`url(#${id}-wood)`,4,'stroke="#dfbd8c" stroke-width="1.5"');
 s+=box(0,0,width,52,`url(#${id}-wood)`,7,'stroke="#e4c89f" stroke-width="2"');
 for(let i=0;i<7;i++)s+=`<path d="M16 ${8+i*5}Q${width*.3} ${4+i*5} ${width*.5} ${10+i*5}T${width-16} ${8+i*5}" fill="none" stroke="#5a3825" stroke-width="1" opacity=".22"/>`;
 s+=ln(90,78,width-90,78,'#98734f',13)+ln(6,45,width-6,45,'#f0d3a9',2,'opacity=".45"');
 return s+'</g>';
}
/** Cell states: 0 unknown, 1 free, 2 occupied. There are no performance units. */
export function occupancyCells({x=0,y=0,columns=12,rows=12,cell=36,states,time=0,reveal=1,opacity=.7}={}){
 if(states.length!==columns*rows||states.some(v=>![0,1,2].includes(v)))throw Error('Invalid occupancy states');
 let s='';for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
  const state=states[row*columns+col],p=clamp(reveal*1.8-(row+col)/(rows+columns));
  const fill=[P.panel,P.cyan,P.red][state];
  s+=box(x+col*cell,y+row*cell,cell-3,cell-3,fill,2,`fill-opacity="${p*opacity*(state===1?.24:state===2?.75:.04)}" stroke="#86b5cc" stroke-opacity="${.08+p*.15}" stroke-width="1"`);
 }
 return s;
}
/** Front elevation plus axial section. Pads clamp through rotor thickness,
 * never radially in the disc plane. Exaggerated gaps are explanatory only. */
export function brakeAssembly({x=0,y=0,scale=1,time=0,clampAmount=0,id='eng'}={}){
 const squeeze=clamp(clampAmount)*14;
 let s=`<g transform="translate(${x} ${y}) scale(${scale})">`;
 s+=`<circle r="118" fill="#070e17" stroke="#243648" stroke-width="4"/><circle r="105" fill="url(#${id}-metal)" stroke="#97afbf" stroke-width="2"/>`;
 s+=`<g transform="rotate(${time*42*(1-clamp(clampAmount)*.8)})">`;
 for(let i=0;i<24;i++){const a=i*Math.PI/12;s+=`<path d="M${Math.cos(a)*74} ${Math.sin(a)*74}L${Math.cos(a+.12)*97} ${Math.sin(a+.12)*97}" stroke="#102333" stroke-width="4"/>`;}
 s+=`<circle r="53" fill="#23364a" stroke="#718698" stroke-width="3"/>`;
 for(let i=0;i<5;i++){const a=i*Math.PI*2/5;s+=`<circle cx="${Math.cos(a)*36}" cy="${Math.sin(a)*36}" r="6" fill="#99aab8"/>`;}
 s+='</g>';
 // The frontal caliper body remains fixed. Its axial piston is shown below.
 s+=box(69,-67,69,134,`url(#${id}-steel)`,13,'stroke="#acc0cd" stroke-width="2"')+box(80,-49,46,98,'#1a2d3d',9)+ln(87,-40,118,-40,P.orange,4)+ln(87,40,118,40,P.orange,4);
 s+=box(124,-42,63,42,`url(#${id}-dark)`,8,'stroke="#8a9eb0" stroke-width="2"');
 s+=tx(-120,-137,'FRONT',13,P.muted)+tx(-120,143,'AXIAL SECTION',13,P.muted);
 const cy=180;
 s+=box(-14,cy-30,28,60,`url(#${id}-metal)`,2,'stroke="#a5bbc8" stroke-width="1.5"');
 for(const side of [-1,1]){
  const px=side*(43-squeeze);
  s+=box(px-8,cy-23,16,46,P.orange,2)+box(px-17,cy-27,side<0?9:8,54,`url(#${id}-steel)`,2);
 }
 // Motor / lead screw pushes the right pad along the rotor axis.
 s+=box(111,cy-23,60,46,`url(#${id}-dark)`,7,'stroke="#8a9eb0" stroke-width="1.5"');
 s+=ln(53-squeeze,cy,111,cy,P.orange,7);
 for(let i=0;i<7;i++)s+=ln(63+i*6,cy-5,67+i*6,cy+5,'#28394c',1.4);
 s+=`<path d="M-76 ${cy-44}H85V${cy+44}H-76" fill="none" stroke="#657e91" stroke-width="6"/>`;
 s+=`<path d="M-98 ${cy}h35m-9-6 9 6-9 6M98 ${cy}H63m9-6-9 6 9 6" fill="none" stroke="${P.orange}" stroke-width="2"/>`;
 return s+'</g>';
}
export function damperSection({x=0,y=0,scale=1,travel=0,time=0,id='eng'}={}){
 const d=clamp((travel+1)/2)*50;
 let s=`<g transform="translate(${x} ${y}) scale(${scale})">`;
 s+=box(-95,-35,190,28,`url(#${id}-metal)`,6,'stroke="#8097aa" stroke-width="1.5"');
 s+=box(-15,-10,30,88+d,`url(#${id}-steel)`,3);
 s+=box(-36,72+d,72,156,`url(#${id}-metal)`,8,'stroke="#a5bbc8" stroke-width="2"');
 s+=box(-23,84+d,46,82,P.orange,4,'fill-opacity=".28"')+ln(-28,116+d,28,116+d,P.orange,7);
 let coil='M-54 4';for(let i=0;i<10;i++)coil+=`L${i%2?54:-54} ${12+i*(15+d/10)}`;
 s+=`<path d="${coil}" fill="none" stroke="#ccbba5" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`;
 s+=box(-68,190+d,136,18,`url(#${id}-steel)`,4)+ln(0,225,0,280+d,'#839aad',17);
 s+=`<circle cy="${302+d}" r="54" fill="#0b1420" stroke="#7c91a6" stroke-width="4"/><circle cy="${302+d}" r="29" fill="url(#${id}-metal)"/>`;
 for(let i=0;i<3;i++)s+=box(58,85+d+i*31,7,13,P.orange,2,`opacity="${.3+.7*(.5+.5*Math.sin(time*4-i))}"`);
 return s+'</g>';
}
