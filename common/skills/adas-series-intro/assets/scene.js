/* One deterministic 2D scene shared by browser, seek module and native renderer. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AdasIntro = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const ease = v => 1 - Math.pow(1 - clamp(v), 3);
  const mix = (a, b, p) => a + (b - a) * p;
  const esc = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const text = (x,y,label,size=32,color='#f1f5f8',extra='') => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" ${extra}>${esc(label)}</text>`;
  const center = (y,label,size=32,color,extra='') => text(540,y,label,size,color,`text-anchor="middle" ${extra}`);
  const line = (x1,y1,x2,y2,color,width=2,extra='') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${extra}/>`;
  const rect = (x,y,w,h,color,rx=0,extra='') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${color}" ${extra}/>`;
  const group = (s,x=0,y=0,opacity=1,scale=1) => `<g transform="translate(${x} ${y}) scale(${scale})" opacity="${clamp(opacity)}">${s}</g>`;
  const path = (d,c,w=3,extra='') => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
  const reveal = (d,c,p,w=3) => path(d,c,w,`pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1-clamp(p)}"`);
  const circle = (x,y,r,c,extra='') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" ${extra}/>`;
  function validate(c) {
    if (c.schemaVersion !== 1 || c.width !== 1080 || c.height !== 1920) throw Error('Expected schema v1 and 1080×1920 design canvas');
    if (!Number.isFinite(c.duration) || c.duration <= 0 || !Number.isFinite(c.fps) || c.fps <= 0 || c.fps > 120) throw Error('Invalid duration/fps');
    if (!Array.isArray(c.cues) || c.cues.length !== 10) throw Error('Opening 01 needs the ten semantic cues');
    c.cues.forEach((q,i) => {
      if (typeof q.text !== 'string' || !q.text || !Number.isFinite(q.start) || !Number.isFinite(q.end) || q.start < 0 || q.end <= q.start || q.end > c.duration + 0.001 || (i && Math.abs(q.start-c.cues[i-1].end)>0.001)) throw Error(`Invalid or discontinuous cue ${i+1}`);
    });
    if (c.cues[0].start !== 0 || Math.abs(c.cues[9].end-c.duration)>0.001) throw Error('Cues must cover the full opening');
    for (const key of ['background','cyan','amber','mint','purple']) if (!/^#[0-9a-f]{6}$/i.test(c.colors?.[key])) throw Error(`Invalid color ${key}`);
    if (typeof c.disclaimer !== 'string') throw Error('Missing framework disclaimer');
    if (![1,2].includes(c.styleVersion ?? 1)) throw Error('Unsupported styleVersion');
    if (c.styleVersion === 2) {
      if (!['labels','chips'].includes(c.tierPresentation??'labels')) throw Error('Invalid tierPresentation');
      if (!Array.isArray(c.openingSlots) || c.openingSlots.length !== 4) throw Error('V2 needs four openingSlots');
      c.openingSlots.forEach((s,i) => {
        if (typeof s.label !== 'string' || !s.label.trim() || s.label.length > 24) throw Error(`Invalid slot label ${i+1}`);
        if (s.image !== null && (typeof s.image !== 'string' || !s.image || /^(?:[a-z]+:|\/|\\)/i.test(s.image) || !/\.(?:png|jpe?g|webp)$/i.test(s.image))) throw Error(`Slot ${i+1}: use a relative PNG/JPEG/WebP path or null`);
      });
      if (!Array.isArray(c.tierEntries)) throw Error('V2 needs tierEntries');
      const ep=c.currentEpisode;
      if (!ep || typeof ep.name !== 'string' || typeof ep.revealed !== 'boolean') throw Error('V2 needs currentEpisode name/revealed');
      const entries=[...c.tierEntries,...(ep.revealed?[ep]:[])];
      const buckets={};
      for (const e of entries) {
        if (typeof e.name !== 'string' || !e.name.trim() || e.name.length > 24 || !/^[SABCD]$/.test(e.tier) || !['upper','middle','lower'].includes(e.position)) throw Error('Invalid tier entry: name/tier/position');
        const key=e.tier+e.position;
        if ((buckets[key]=(buckets[key]||0)+1)>2) throw Error(`Too many entries at ${key}; at most two fit side by side`);
        if(e.image!=null&&(typeof e.image!=='string'||!e.image||/^(?:[a-z]+:|\/|\\)/i.test(e.image)||!/\.(?:png|jpe?g|webp)$/i.test(e.image)))throw Error('Use a relative chip image path');
        if(![1,2].includes(e.chipCount??1))throw Error('chipCount must be 1 or 2');
      }
      if(c.tierPresentation==='chips'&&chipRowHeights(entries).reduce((a,b)=>a+b,96)>1000)throw Error('Chip board is too crowded; split the displayed schemes before rendering');
    }
    return c;
  }
  async function prepareImages(config, readImage) {
    validate(config);
    if (config.styleVersion !== 2) return config;
    const cache=new Map();
    async function prepare(s) {
      if(s.image==null)return {...s,imageData:null};
      if(!cache.has(s.image))cache.set(s.image,Promise.resolve().then(()=>readImage(s.image)));
      const imageData=await cache.get(s.image);
      if(typeof imageData!=='string'||!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(imageData))throw Error(`Invalid image data: ${s.image}`);
      return {...s,imageData};
    }
    const openingSlots=await Promise.all(config.openingSlots.map(prepare));
    const tierEntries=await Promise.all(config.tierEntries.map(prepare));
    const currentEpisode=config.currentEpisode.revealed?await prepare(config.currentEpisode):config.currentEpisode;
    return {...config,openingSlots,tierEntries,currentEpisode};
  }
  function car(color, rotation=0) {
    let s = `<path d="M-165 25 L-156-12 Q-151-26-111-31 L-62-73 Q-49-82-17-82 L67-78 Q88-74 112-36 L158-19 Q177-12 181 13 L179 30 H145 Q140-7 111-7 Q80-7 74 30 H-76 Q-82-7-113-7 Q-145-7-150 30Z" fill="#101f2d" stroke="${color}" stroke-width="3"/>`;
    s += `<path d="M-91-34 L-48-67 H-16 V-34Z M-3-67 H61 Q76-64 93-34 H-3Z" fill="${color}" fill-opacity=".16" stroke="${color}" stroke-opacity=".65" stroke-width="2"/>`;
    s += line(-3,-29,-3,19,color,1.5)+line(-63,21,67,21,color,1.5)+line(156,-9,176,-3,color,5);
    for (const x of [-113,111]) {
      s += circle(x,28,28,'#050b12',`stroke="${color}" stroke-width="2"`)+circle(x,28,17,'#152736',`stroke="${color}" stroke-width="1.5"`);
      s += `<g transform="rotate(${rotation} ${x} 28)">${[0,60,120].map(a=>`<g transform="rotate(${a} ${x} 28)">${line(x-15,28,x+15,28,color,2)}</g>`).join('')}</g>`;
    }
    return s;
  }
  function chip(color, t=0, size=1) {
    let s=rect(-48,-48,96,96,'#0c1d2a',10,`stroke="${color}" stroke-width="3"`)+rect(-28,-28,56,56,color,4,'fill-opacity=".13"');
    for(let i=-30;i<=30;i+=20) s+=line(i,-68,i,-48,color,4)+line(i,48,i,68,color,4)+line(-68,i,-48,i,color,4)+line(48,i,68,i,color,4);
    s+=path('M-18 13 L-18-13 L1 13 L1-13 M12 13 V-13',color,3);
    s+=rect(-24,-25+50*((t*.65)%1),48,3,color,1,'opacity=".6"');
    return group(s,0,0,1,size);
  }
  function sensor(color,t=0) {
    let s=circle(0,0,22,'#0f2632',`stroke="${color}" stroke-width="3"`)+circle(0,0,8,color);
    for(let i=0;i<3;i++) {
      const r=37+((t*.5+i/3)%1)*58;
      s+=path(`M${-r*.65} ${-r*.76} A${r} ${r} 0 0 1 ${r*.65} ${-r*.76}`,color,2,`opacity="${.85-(r-37)/75}"`);
    }
    return s+line(-30,35,30,35,color,3)+line(0,22,0,35,color,3);
  }
  function model(color,t=0) {
    const nodes=[[-62,-45],[-62,45],[0,-65],[0,0],[0,65],[62,-30],[62,30]];
    let s='';
    for(const [a,b] of [[0,2],[0,3],[1,3],[1,4],[2,5],[3,5],[3,6],[4,6]]) {
      const p=nodes[a],q=nodes[b],k=(t*.7+a*.13)%1;
      s+=line(...p,...q,color,2,'opacity=".35"')+circle(mix(p[0],q[0],k),mix(p[1],q[1],k),3.5,color);
    }
    return s+nodes.map(([x,y],i)=>circle(x,y,8+i%2*2,'#0c1d2a',`stroke="${color}" stroke-width="3"`)).join('');
  }
  function control(color,t=0) {
    const angle=18*Math.sin(t*2.5);
    return `<g transform="rotate(${angle})">${circle(0,0,58,'none',`stroke="${color}" stroke-width="5"`)}${circle(0,0,17,'#10232e',`stroke="${color}" stroke-width="3"`)}${line(-57,-7,-16,-4,color,5)}${line(57,-7,16,-4,color,5)}${line(0,18,0,57,color,5)}</g>`+path('M-84 60 V-60 M-92-47 L-84-60 L-76-47',color,2,'opacity=".5"');
  }
  const names=['芯片','感知','算法','执行'];
  const en=['CHIP','SENSE','MODEL','CONTROL'];
  const desc=['硬件底座','环境信息','模型路线','控制闭环'];
  function header(kicker,title,subtitle,accent) {
    return text(76,94,'EV EVOLUTION INDEX',21,'#8fa4b5','letter-spacing="4"')+text(1004,94,kicker,19,accent,'text-anchor="end" letter-spacing="2"')+line(76,124,1004,124,'#29404f',1)+center(245,title,66,undefined,'font-weight="700"')+center(315,subtitle,29,'#9baebd');
  }
  function hook(t,c) {
    const p=ease(t/.6),a=c.colors.cyan,b=c.colors.amber;
    let s=header('SERIES INTRO / 01','同样几十万','高阶辅助驾驶',a);
    s+=center(438,'买到的升级空间，一样吗？',36,b,'font-weight="600"');
    s+=rect(510,523,60,60,'#112633',30)+center(566,'=',44,a);
    const ys=[735,1135];
    ys.forEach((y,i)=>{
      const color=i?b:a,x=mix(-260,540,p);
      s+=text(104,y-117,i?'方案 B':'方案 A',24,color,'letter-spacing="3"');
      s+=line(104,y+76,976,y+76,'#29404f',2);
      for(let j=0;j<12;j++)s+=line(110+j*76-((t*80)%76),y+110,144+j*76-((t*80)%76),y+110,'#263b49',2);
      s+=group(car(color,t*180),x,y,1,1.6);
      s+=text(970,y-20,'¥',68,color,'text-anchor="end" font-weight="300"');
    });
    s+=center(1450,'相近的购车投入',28,'#9baebd');
    return s;
  }
  function divergence(t,c) {
    const a=c.colors.cyan,b=c.colors.amber,q=c.cues;
    const begin=q[1].start,up=q[2].start,block=q[3].start,sense=q[4].start;
    const year=Math.round(2*ease((t-begin)/(up-begin)));
    let s=header('TWO YEARS LATER','两年后的分化','同一段时间，不同的升级路径',a);
    s+=center(484,`${String(year).padStart(2,'0')} 年`,105,'#f4f7fa','font-weight="300" letter-spacing="10"');
    const go=ease((t-up)/3.1),stop=ease((t-up)/1.7);
    s+=text(100,660,'持续进化',43,c.colors.mint,'font-weight="650"');
    s+=text(100,710,'OTA 继续向前',26,'#9baebd');
    s+=line(110,885,970,885,'#1b3544',5);
    s+=reveal('M110 885 H970',a,go,5);
    for(let i=0;i<4;i++) {
      const x=185+i*220,on=clamp((go*860-(x-110))/50);
      s+=rect(x,873,20,24,'#294452',5)+rect(x,873,20,24,a,5,`opacity="${on}"`);
      if(on>0)s+=text(x+10,947,`v${i+1}.0`,22,a,'text-anchor="middle"');
    }
    s+=group(car(a,t*180),mix(180,850,go),815,1,.73);
    s+=text(100,1130,'可能先受限',43,b,'font-weight="650"');
    s+=line(110,1355,970,1355,'#2d2928',5)+reveal('M110 1355 H663',b,stop,5);
    s+=group(car(b,Math.min(t,block+.5)*180),mix(180,568,stop),1285,1,.73);
    const gate=ease((t-block)/.45);
    s+=group(line(0,-115,0,50,b,8),706,1310,gate);
    s+=group(chip(b,t,.6),820,1210,gate);
    s+=text(820,1308,'芯片',25,b,`text-anchor="middle" opacity="${gate}"`);
    const scan=ease((t-sense)/.38);
    s+=group(sensor(b,t),820,1446,scan,.65)+text(820,1530,'传感器',25,b,`text-anchor="middle" opacity="${scan}"`);
    s+=text(100,1440,t>=sense?'硬件条件，可能成为边界':'硬件条件',27,'#9baebd');
    return s;
  }
  function page(x,y,scale,opacity,title,kind,t,color) {
    let s=rect(-184,-252,368,504,'#e8eef0',5)+rect(-160,-226,49,7,color,2);
    s+=text(-160,-178,title,23,'#0e2330','font-weight="700"')+text(-160,-140,'PUBLIC RESEARCH',10,'#5d707d','letter-spacing="1"');
    for(let i=0;i<6;i++)s+=rect(-160,-110+i*13,290-(i%3)*25,3,'#9caeb8',1);
    if(kind===0) {
      s+=path('M-134 111 V-5 M-134 111 H134','#768b99',1.5);
      s+=reveal('M-130 95 C-50 94-25 29 25 34 S89-26 132-34','#257d9e',clamp((t-.3)/.8),4);
      s+=reveal('M-130 94 C-76 89-2 71 44 54 S100 56 132 42','#d58b3e',clamp((t-.5)/.8),3);
    } else s+=group(kind===1?model('#2a718b',t):sensor('#2a718b',t),0,50,1,.8);
    for(let i=0;i<6;i++)s+=rect(-160,151+i*12,290-(i%2)*37,3,'#9caeb8',1);
    return group(s,x,y,opacity,scale);
  }
  function research(t,c) {
    const local=t-c.cues[5].start,a=c.colors.cyan;
    let s=header('PUBLIC RESEARCH','辅助驾驶论文','以公开研究，拆解技术路线',a);
    const slide=ease((local-.25)/1.1),scan=clamp((local-.65)/1.1);
    s+=page(140-100*slide,885,.88,.36,'感知与计算',1,local,a);
    s+=page(680-140*slide,885,1.65,1,'辅助驾驶 · 技术研究',0,local,a);
    s+=page(1210-170*slide,885,.88,.36,'模型与控制',2,local,a);
    s+=rect(233,470+scan*830,614,3,a,1,'opacity=".7"');
    const labels=['芯片','感知','算法','执行'];
    labels.forEach((v,i)=>{const p=ease((local-.8-i*.14)/.4);s+=group(circle(0,0,5,a)+text(0,44,v,26,a,'text-anchor="middle"'),280+i*173,1430+25*(1-p),p);});
    s+=center(1560,'文献检索示意 · 非论文原文或研究结论',22,'#71899a');
    return s;
  }
  function dimensions(t,c) {
    const local=t-c.cues[7].start,cols=[c.colors.cyan,c.colors.mint,c.colors.purple,c.colors.amber];
    let s=header('FOUR DIMENSIONS','四个维度，看升级空间','芯片 · 感知 · 算法 · 执行',cols[0]);
    const xy=[[302,690],[778,690],[302,1200],[778,1200]];
    s+=line(540,478,540,1445,'#263747',1)+line(125,966,955,966,'#263747',1);
    xy.forEach(([x,y],i)=>{
      const p=ease((local-i*.36)/.45),color=cols[i];
      let cell=text(-110,-120,en[i],23,color,'letter-spacing="3"');
      cell+=group([chip,sensor,model,control][i](color,local),0,0,1,.95);
      cell+=text(0,151,names[i],54,undefined,'text-anchor="middle" font-weight="650"')+text(0,204,desc[i],27,'#90a5b6','text-anchor="middle"');
      s+=group(cell,x,y+34*(1-p),p);
    });
    s+=center(1565,'把技术差异，放进同一套评价框架',27,'#9baebd');
    return s;
  }
  function tiers(t,c) {
    const local=t-c.cues[8].start,start=c.cues[9].start-c.cues[8].start;
    const colors=[c.colors.cyan,'#92c6f8',c.colors.purple,'#bba9d9','#9aaabd'];
    const heads=[272,480,688,896];
    let s=header('FIVE TIERS',t<c.cues[9].start?'国内车企，统一坐标':'S · A · B · C · D','辅助驾驶方案 · 五档框架',colors[0]);
    heads.forEach((x,i)=>{
      const p=ease((local-i*.08)/.35);
      s+=group(text(0,0,names[i],30,'#b2c2cd','text-anchor="middle"'),x,457+20*(1-p),p);
    });
    for(let row=0;row<5;row++) {
      const y=545+row*192,p=ease((local-start-row*.12)/.42),color=colors[row];
      s+=rect(77,y,926,160,'#0b1722',19,`stroke="#2b414f" stroke-width="1.5"`);
      s+=line(190,y+22,190,y+138,'#2b414f',1);
      s+=text(131,y+108,'SABCD'[row],72,color,`text-anchor="middle" font-weight="600" opacity="${p}"`);
      heads.forEach((x,col)=>{
        s+=rect(x-75,y+57,150,49,'#07121c',10,`stroke="#3b5264" stroke-width="1.5"`);
        for(let j=0;j<5;j++) {
          s+=rect(x-62+j*25,y+68,18,27,'#203242',4);
          const v=clamp((p*(5-row)-j)*2);
          if(j<5-row)s+=rect(x-62+j*25,y+68,18,27,color,4,`opacity="${v}"`);
        }
      });
    }
    s+=center(1578,c.disclaimer,25,'#8fa6b7');
    return s;
  }
  function hookV2(t,c) {
    const a=c.colors.cyan;
    let s=header('SERIES INTRO / 01','同样几十万','高阶辅助驾驶',a);
    s+=center(438,'两年后，升级空间为何不同？',36,c.colors.amber,'font-weight="600"');
    c.openingSlots.forEach((slot,i)=>{
      const p=ease((t-(.10+i*.38))/.36);
      if(p===0)return;
      const x=i%2?560:76,y=i<2?538:962,w=444,h=372;
      const clip=`slot-${i}`,yOffset=24*(1-p);
      s+=`<defs><clipPath id="${clip}">${rect(x,y,w,h*p,'white',20)}</clipPath><clipPath id="${clip}-image">${rect(x+2,y+2,w-4,282,'white',18)}</clipPath></defs>`;
      let cell=rect(x,y,w,h,'#0b1926',21,`stroke="#426071" stroke-width="1.8"`);
      if(slot.image!==null) {
        if(!slot.imageData)throw Error(`Load image before rendering: ${slot.image}`);
        cell+=`<image href="${esc(slot.imageData)}" x="${x+2}" y="${y+2}" width="${w-4}" height="282" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip}-image)"/>`;
      } else {
        cell+=rect(x+23,y+23,w-46,235,'#091520',12,'stroke="#284452" stroke-width="1.4" stroke-dasharray="7 9"');
        cell+=group(path('M-38 25 V-25 H38 V25Z M-38 15 L-12-7 L6 8 L20-4 L38 15',a,2)+circle(19,-13,5,a,'opacity=".6"'),x+w/2,y+120,.55);
        cell+=text(x+w/2,y+209,'预留车型图片',25,'#718c9e','text-anchor="middle"');
      }
      cell+=line(x+25,y+285,x+w-25,y+285,'#2c4455',1);
      cell+=text(x+28,y+340,slot.label,slot.label.length>14?25:35,'#edf5fa','font-weight="650"');
      cell+=text(x+w-28,y+340,String(i+1).padStart(2,'0'),23,a,'text-anchor="end" letter-spacing="3"');
      s+=`<g data-slot="${i+1}" opacity="${p}" transform="translate(0 ${yOffset})" clip-path="url(#${clip})">${cell}</g>`;
    });
    s+=center(1460,'同一笔购车投入，不同的进化潜力',27,'#8fa7b9');
    return s;
  }

  const errorRed='#ff4f63';
  function topCar(color,phase,t,failed=false) {
    const camera=clamp(phase),radar=clamp(phase-1),plan=clamp(phase-2);
    let s='';
    // Roof radar and cameras exist at every stage; activation illustrates capability.
    if(camera>0) {
      const sweep=Math.sin(t*3)*18;
      for(const side of [-1,1]) {
        s+=`<g transform="scale(1 ${side})">${path('M0 62 L-75 117 Q0 151 75 117Z',color,1.2,`style="fill:${color}" fill-opacity="${failed ? .025 : .055*camera}" stroke-opacity="${.3*camera}"`)}${line(0,62,sweep,139,color,2,`opacity="${failed ? .1 : .65*camera}"`)}</g>`;
      }
    }
    if(radar>0) {
      s+=path('M150 0 L327-98 A202 202 0 0 1 327 98Z',color,1,`style="fill:${color}" fill-opacity="${.035*radar}" stroke-opacity="${.24*radar}"`);
      for(let i=0;i<3;i++) {
        const p=(t*.7+i/3)%1,r=35+p*168;
        s+=path(`M${150+r*.88} ${-r*.48} A${r} ${r} 0 0 1 ${150+r*.88} ${r*.48}`,color,2,`opacity="${radar*(1-p)*.8}"`);
      }
      const theta=Math.sin(t*2.1)*.5;
      s+=line(150,0,150+192*Math.cos(theta),192*Math.sin(theta),color,2,`opacity="${radar*.7}"`);
    }
    s+=rect(-111,-76,48,17,'#02090e',6,`stroke="${color}" stroke-opacity=".4"`)+rect(65,-76,48,17,'#02090e',6,`stroke="${color}" stroke-opacity=".4"`);
    s+=rect(-111,59,48,17,'#02090e',6,`stroke="${color}" stroke-opacity=".4"`)+rect(65,59,48,17,'#02090e',6,`stroke="${color}" stroke-opacity=".4"`);
    s+=`<path d="M-143-61 Q-170-53-172-22 V22 Q-170 53-143 61 H85 Q132 60 152 38 L166 22 Q175 0 166-22 L152-38 Q132-60 85-61Z" fill="#102334" stroke="${color}" stroke-width="3"/>`;
    s+=path('M-153-45 H75 Q130-42 143-20 M-153 45 H75 Q130 42 143 20',color,1.2,'opacity=".45"');
    s+=`<path d="M-66-45 H67 L93-31 V31 L67 45 H-66 L-91 30 V-30Z" fill="#06111c" stroke="${color}" stroke-width="1.5" stroke-opacity=".7"/>`;
    s+=`<path d="M63-41 L87-28 V28 L63 41 L49 29 V-29Z M-66-41 L-84-28 V28 L-66 41 L-51 29 V-29Z" fill="${color}" fill-opacity="${.1+camera*.11}"/>`;
    s+=rect(-45,-32,86,64,'#163046',10,`stroke="${color}" stroke-opacity="${.2+.5*camera}"`);
    s+=line(-45,0,41,0,color,1,'opacity=".3"')+line(-2,-32,-2,32,color,1,'opacity=".3"');
    s+=path('M108-40 L127-30 M108 40 L127 30',color,5);
    s+=path('M-155-36 V-17 M-155 17 V36',failed?errorRed:'#9a5961',4);
    for(const side of [-1,1])s+=circle(0,side*59,5,camera>0?color:'#274454',`stroke="${color}" stroke-opacity=".5"`);
    s+=circle(117,0,12,radar>0?color:'#223c4c',`stroke="${color}" stroke-opacity=".55"`)+circle(117,0,5,'#0b1b29');
    s+=circle(-111,0,5,'#284554');
    if(plan>0) {
      s+=group(chip(color,t,.25),-2,0,plan);
      for(const [x,y] of [[0,-55],[0,55],[115,0],[-109,0]]) {
        s+=line(x,y,0,0,color,1.4,`opacity="${plan*.6}"`);
        const p=(t*1.4+Math.abs(x+y)*.005)%1;
        s+=circle(x*(1-p),y*(1-p),3,color,`opacity="${plan}"`);
      }
    }
    return s;
  }
  function versionRail(y,phase,color,failed=false) {
    let s=line(120,y,970,y,'#213645',4)+line(120,y,120+850*(phase+1)/4,y,color,4);
    for(let i=0;i<4;i++) {
      const x=120+(i+1)*850/4,on=phase>=i-.001;
      s+=rect(x-8,y-9,16,18,on?color:'#263e4c',4);
      s+=text(x,y+49,`v${i+1}.0`,27,on?color:'#536b7b','text-anchor="middle"');
    }
    if(failed)s+=text(545,y-28,'升级中止',23,color,'text-anchor="middle" font-weight="650"');
    return s;
  }
  function road(y,t,color) {
    let s=rect(95,y-99,900,198,'#0a1721',24)+line(110,y-93,980,y-93,'#203340',1)+line(110,y+93,980,y+93,'#203340',1);
    for(let j=0;j<13;j++)s+=line(110+j*70-(t*53%70),y,140+j*70-(t*53%70),y,color,2,'opacity=".12"');
    return s;
  }
  function hardwareError(x,y,kind,t,start) {
    const age=t-start,p=ease(age/.23);
    if(p===0)return '';
    const shake=Math.sin(age*75)*6*Math.exp(-age*2.6),glow=.09+.05*Math.sin(age*8);
    let s=rect(-69,-61,138,132,errorRed,18,`fill-opacity="${glow}" stroke="${errorRed}" stroke-opacity=".3"`);
    s+=group(kind==='chip'?chip(errorRed,Math.max(0,age),.52):sensor(errorRed,0),0,-8,1,kind==='chip'?1:.52);
    s+=text(0,55,kind==='chip'?'芯片':'传感器',24,errorRed,'text-anchor="middle" font-weight="600"');
    s+=text(0,91,'ERROR',22,errorRed,'text-anchor="middle" font-weight="700" letter-spacing="3"');
    return `<g data-hardware-error="${kind}">${group(s,x+shake,y,p)}</g>`;
  }
  function divergenceV2(t,c) {
    const q=c.cues,a=c.colors.cyan,up=q[2].start,block=q[3].start,sense=q[4].start;
    const phase=clamp((t-up)/((q[5].start-up)*.74),0,1)*3;
    const lowerPhase=clamp((t-up)/(block-up)),failed=t>=block;
    const lowerT=failed?block:t,age=Math.max(0,t-block),lowerColor=failed?errorRed:c.colors.amber;
    const lowerShake=failed?Math.sin(age*66)*8*Math.exp(-age*3):0;
    let s=header('TWO YEARS LATER','两年后的分化','同一段时间，不同的升级路径',a);
    const year=Math.round(2*ease((t-q[1].start)/(up-q[1].start)));
    s+=center(445,`${String(year).padStart(2,'0')} 年`,76,'#e9f2f7','font-weight="300" letter-spacing="8"');
    s+=text(100,550,'持续进化',39,c.colors.mint,'font-weight="650"')+text(100,596,'OTA · 能力层逐级激活',24,'#91aabd');
    s+=road(780,t,a);
    const cam=clamp(phase),lidar=clamp(phase-1),planning=clamp(phase-2);
    s+=`<g data-upper-version="${Math.min(4,Math.floor(phase+.0001)+1)}">${group(topCar(a,phase,t),450,780)}</g>`;
    if(lidar>0)s+=group(rect(-24,-17,48,34,'#173746',7,`stroke="${a}" stroke-width="1.5"`)+path('M-32-25 H-42 V-15 M32-25 H42 V-15 M-32 25 H-42 V15 M32 25 H42 V15',a,2),910,735,lidar);
    if(planning>0)s+=group(reveal('M615 785 C710 785 738 818 800 817 S909 780 973 780',a,planning,3)+circle(973,780,4,a),0,0,planning);
    s+=text(970,650,`v${Math.min(4,Math.floor(phase+.0001)+1)}.0`,38,a,'text-anchor="end" font-weight="650"');
    const pulse=1-clamp((phase%1)/.22);
    s+=group(rect(-180,-81,360,162,'none',44,`stroke="${a}" stroke-width="2" stroke-opacity="${pulse*.55}"`),450,780);
    if(cam>0)s+=text(122,910,'摄像头',21,a,`opacity="${cam}"`);
    if(lidar>0)s+=text(685,910,'激光雷达',21,a,`opacity="${lidar}"`);
    s+=versionRail(962,phase,a);
    s+=text(100,1092,'可能先受限',39,lowerColor,'font-weight="650"')+text(100,1137,failed?'v2.0 · 硬件边界触发':'同样开始升级',25,failed?errorRed:'#91aabd');
    s+=road(1300,lowerT,lowerColor);
    if(failed)s+=rect(253,1195,390,210,errorRed,46,`fill-opacity="${.035+.025*Math.sin(age*8)}"`);
    s+=`<g data-lower-version="${Math.floor(lowerPhase)+1}" data-stopped="${failed}">${group(topCar(lowerColor,lowerPhase,lowerT,failed),450+lowerShake,1300)}</g>`;
    s+=versionRail(1510,lowerPhase,lowerColor,failed);
    s+=hardwareError(865,1220,'chip',t,block)+hardwareError(865,1412,'sensor',t,sense);
    if(failed)s+=text(450,1452,'ERROR',26,errorRed,'text-anchor="middle" font-weight="700" letter-spacing="5"');
    s+=center(1621,'能力进化示意 · 不代表 OTA 新增硬件',21,'#6d8799');
    return s;
  }

  function paperV2(x,y,scale,opacity,kind,t,color) {
    const ink='#203544',grey='#82939e';
    let s=rect(-174,-237,368,504,'#01060b',4,'opacity=".5"')+rect(-180,-247,368,504,'#a9b7bc',3)+rect(-184,-252,368,504,'#f4f2eb',3,'stroke="#c4cdd0" stroke-width="1"');
    for(let i=0;i<34;i++)s+=line(-181,-246+i*14,181,-246+i*14,'#9daeb2',.4,'opacity=".09"');
    s+=line(-160,-228,160,-228,ink,1.5);
    s+=text(0,-205,kind===1?'PERCEPTION AND COMPUTING':kind===2?'MODELS AND CONTROL':'ASSISTED DRIVING SYSTEMS',13,ink,'text-anchor="middle" font-weight="700" font-family="serif"');
    s+=text(0,-184,'Perception, learning and control',10,ink,'text-anchor="middle" font-family="serif"');
    s+=text(0,-165,'RESEARCH SCHEMATIC · NOT A REAL PAPER',6,grey,'text-anchor="middle" letter-spacing=".7"');
    s+=text(0,-143,'Abstract',9,ink,'text-anchor="middle" font-family="serif" font-weight="700"');
    for(let i=0;i<5;i++)s+=rect(-144,-132+i*6.5,288-(i%3)*16,1.8,grey,.4,'opacity=".65"');
    const cols=[-160,9];
    cols.forEach((xx,col)=>{
      s+=text(xx,-79,col?'2. MODEL AND EVALUATION':'1. SYSTEM OVERVIEW',7.5,ink,'font-family="serif" font-weight="700"');
      for(let i=0;i<15;i++)s+=rect(xx,-69+i*6,147-((i+kind+col)%5)*5,1.6,grey,.35,'opacity=".68"');
      for(let i=0;i<10;i++)s+=rect(xx,139+i*6,147-((i+kind)%4)*6,1.6,grey,.35,'opacity=".68"');
    });
    s+=rect(-159,28,147,90,'#eaf0ef',1,'stroke="#cad5d7" stroke-width=".6"');
    s+=path('M-146 103 V40 M-146 103 H-24',grey,.8);
    for(let i=0;i<3;i++)s+=line(-146,54+i*16,-25,54+i*16,'#c6d4d7',.5);
    s+=reveal('M-143 99 C-105 97-115 73-84 73 S-56 45-26 42','#277993',clamp((t-.3)/.85),2);
    s+=reveal('M-143 98 C-100 95-94 84-68 84 S-43 76-26 68','#b87b42',clamp((t-.5)/.85),1.6);
    s+=group(kind===1?sensor('#326f82',t):model('#326f82',t),82,71,1,.45);
    s+=text(-157,129,'Fig. 1. Illustrative capability curves.',6.3,ink,'font-family="serif"');
    s+=text(11,129,'Fig. 2. System representation.',6.3,ink,'font-family="serif"');
    s+=text(-160,215,'REFERENCES · ILLUSTRATION ONLY',6.5,ink,'font-family="serif" font-weight="700"');
    for(let i=0;i<3;i++)s+=rect(-160,223+i*5,310-i*16,1.5,grey,.3,'opacity=".6"');
    s+=text(0,245,String(kind+1),7,ink,'text-anchor="middle" font-family="serif"');
    return group(s,x,y,opacity,scale);
  }
  function researchV2(t,c) {
    const local=t-c.cues[5].start,a=c.colors.cyan;
    let s=header('PUBLIC RESEARCH','辅助驾驶论文','以公开研究，拆解技术路线',a);
    const slide=ease((local-.25)/1.1),scan=clamp((local-.65)/1.1);
    s+=paperV2(140-100*slide,885,.88,.45,1,local,a);
    s+=paperV2(1210-170*slide,885,.88,.45,2,local,a);
    s+=paperV2(680-140*slide,885,1.65,1,0,local,a);
    s+=rect(237,470+scan*830,606,2,a,1,'opacity=".65"');
    names.forEach((v,i)=>{const p=ease((local-.8-i*.14)/.4);s+=group(circle(0,0,5,a)+text(0,44,v,26,a,'text-anchor="middle"'),280+i*173,1430+25*(1-p),p);});
    s+=center(1560,'文献检索示意 · 非论文原文或研究结论',22,'#71899a');
    return s;
  }

  function tiersV2(t,c) {
    if(c.tierPresentation==='chips')return tiersWithChips(t,c);
    const local=t-c.cues[8].start,start=c.cues[9].start-c.cues[8].start;
    const colors=[c.colors.cyan,'#92c6f8',c.colors.purple,'#bba9d9','#9aaabd'];
    const heads=[234,342,450,558];
    let s=header('FIVE TIERS',t<c.cues[9].start?'国内车企，统一坐标':'S · A · B · C · D','辅助驾驶方案 · 五档框架',colors[0]);
    heads.forEach((x,i)=>{const p=ease((local-i*.08)/.35);s+=group(text(0,0,names[i],26,'#b2c2cd','text-anchor="middle"'),x,457+20*(1-p),p);});
    s+=text(832,457,'已讲方案',27,'#b2c2cd','text-anchor="middle"');
    const entries=[...c.tierEntries,...(c.currentEpisode.revealed?[c.currentEpisode]:[])];
    for(let row=0;row<5;row++) {
      const tier='SABCD'[row],y=545+row*192,p=ease((local-start-row*.12)/.42),color=colors[row];
      s+=rect(77,y,926,160,'#0b1722',19,'stroke="#2b414f" stroke-width="1.5"');
      s+=line(162,y+22,162,y+138,'#2b414f',1)+line(646,y+16,646,y+144,'#304b5b',1);
      s+=text(118,y+108,tier,64,color,`text-anchor="middle" font-weight="600" opacity="${p}"`);
      heads.forEach(x=>{
        s+=rect(x-42,y+60,84,42,'#07121c',8,'stroke="#3b5264" stroke-width="1.3"');
        for(let j=0;j<5;j++) {
          s+=rect(x-33+j*14,y+69,10,24,'#203242',2.8);
          if(j<5-row)s+=rect(x-33+j*14,y+69,10,24,color,2.8,`opacity="${clamp((p*(5-row)-j)*2)}"`);
        }
      });
      for(const position of ['upper','middle','lower']) {
        const groupEntries=entries.filter(e=>e.tier===tier&&e.position===position);
        groupEntries.forEach((e,i)=>{
          const count=groupEntries.length,w=count===1?302:148,x=count===1?681:670+i*164,yy=y+{upper:35,middle:88,lower:141}[position];
          const units=[...e.name].reduce((n,ch)=>n+(ch.charCodeAt(0)>255?1:.56),0);
          const font=Math.min(26,(w-24)/units);
          let tag=rect(x,yy-29,w,39,color,7,`fill-opacity=".07" stroke="${color}" stroke-opacity=".42"`);
          tag+=text(x+w/2,yy,e.name,font,'#e6f2fa','text-anchor="middle" font-weight="550"');
          s+=`<g data-tier="${tier}" data-position="${position}" data-name="${esc(e.name)}" opacity="${p}">${tag}</g>`;
        });
      }
    }
    s+=center(1575,c.currentEpisode.revealed?`本期方案：${c.currentEpisode.name}`:'本期方案：待揭晓',26,c.colors.amber);
    s+=center(1623,c.disclaimer,21,'#8fa6b7');
    return s;
  }

  function chipPortrait(e,x,y,size) {
    if(e.image!=null) {
      if(!e.imageData)throw Error(`Load chip image before rendering: ${e.image}`);
      return `<image data-chip-image="${esc(e.name)}" href="${esc(e.imageData)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;
    }
    return `<g data-chip-schematic="${esc(e.name)}">${group(chip('#9db7ca',0),x+size/2,y+size/2,1,size/150)}</g>`;
  }
  function chipRowHeights(entries) {
    return [...'SABCD'].map(tier=>{
      const list=entries.filter(e=>e.tier===tier);
      return list.some(e=>e.position!=='middle')?272:list.length?192:120;
    });
  }
  function tiersWithChips(t,c) {
    const local=t-c.cues[8].start,start=c.cues[9].start-c.cues[8].start;
    const colors=[c.colors.cyan,'#92c6f8',c.colors.purple,'#bba9d9','#9aaabd'];
    const heads=[234,342,450,558];
    let s=header('FIVE TIERS',t<c.cues[9].start?'国内车企，统一坐标':'S · A · B · C · D','辅助驾驶方案 · 五档框架',colors[0]);
    heads.forEach((x,i)=>{const p=ease((local-i*.08)/.35);s+=group(text(0,0,names[i],26,'#b2c2cd','text-anchor="middle"'),x,457+20*(1-p),p);});
    s+=text(832,457,'已讲方案',27,'#b2c2cd','text-anchor="middle"');
    const entries=[...c.tierEntries,...(c.currentEpisode.revealed?[c.currentEpisode]:[])];
    const heights=chipRowHeights(entries);
    let y=545;
    for(let row=0;row<5;row++) {
      const tier='SABCD'[row],h=heights[row],middle=y+h/2,p=ease((local-start-row*.12)/.42),color=colors[row];
      s+=rect(77,y,926,h,'#0b1722',19,'stroke="#2b414f" stroke-width="1.5"');
      s+=line(162,y+18,162,y+h-18,'#2b414f',1)+line(646,y+16,646,y+h-16,'#304b5b',1);
      s+=text(118,middle+23,tier,64,color,`text-anchor="middle" font-weight="600" opacity="${p}"`);
      heads.forEach(x=>{
        s+=rect(x-42,middle-21,84,42,'#07121c',8,'stroke="#3b5264" stroke-width="1.3"');
        for(let j=0;j<5;j++) {
          s+=rect(x-33+j*14,middle-12,10,24,'#203242',2.8);
          if(j<5-row)s+=rect(x-33+j*14,middle-12,10,24,color,2.8,`opacity="${clamp((p*(5-row)-j)*2)}"`);
        }
      });
      const activePositions=new Set(entries.filter(e=>e.tier===tier).map(e=>e.position)).size;
      for(const position of ['upper','middle','lower']) {
        const same=entries.filter(e=>e.tier===tier&&e.position===position);
        same.forEach((e,i)=>{
          const cy=y+h*{upper:.18,middle:.5,lower:.82}[position],copies=e.chipCount??1;
          let art='';
          if(same.length===1) {
            const size=Math.min(80,h*.27),step=size+5,areaCenter=748;
            for(let n=0;n<copies;n++)art+=chipPortrait(e,areaCenter-(copies*size+(copies-1)*5)/2+n*step,cy-size/2,size);
            const units=[...e.name].reduce((n,ch)=>n+(ch.charCodeAt(0)>255?1:.56),0);
            art+=text(914,cy+9,e.name,Math.min(27,142/units),'#e6f2fa','text-anchor="middle" font-weight="550"');
          } else {
            const cx=744+i*164,room=h/(activePositions===1?1:3),size=Math.min(copies===2?61:84,room*.45),total=copies*size+(copies-1)*4;
            const imageY=cy-size/2-12;
            for(let n=0;n<copies;n++)art+=chipPortrait(e,cx-total/2+n*(size+4),imageY,size);
            const units=[...e.name].reduce((n,ch)=>n+(ch.charCodeAt(0)>255?1:.56),0);
            art+=text(cx,cy+size/2+20,e.name,Math.min(25,142/units),'#e6f2fa','text-anchor="middle" font-weight="550"');
          }
          s+=`<g data-tier="${tier}" data-position="${position}" data-name="${esc(e.name)}" data-chip-count="${copies}" data-row-y="${y}" data-row-height="${h}" opacity="${p}">${art}</g>`;
        });
      }
      y+=h+24;
    }
    s+=center(1575,c.currentEpisode.revealed?`本期方案：${c.currentEpisode.name}`:'本期方案：待揭晓',26,c.colors.amber);
    s+=center(1623,c.disclaimer,21,'#8fa6b7');
    return s;
  }

  function render(time,c) {
    const t=clamp(Number(time)||0,0,c.duration-0.00001),q=c.cues;
    const v2=c.styleVersion===2;
    let s=t<q[1].start?(v2?hookV2:hook)(t,c):t<q[5].start?(v2?divergenceV2:divergence)(t,c):t<q[7].start?(v2?researchV2:research)(t,c):t<q[8].start?dimensions(t,c):(v2?tiersV2:tiers)(t,c);
    const caption=c.captions?q.find(v=>t>=v.start&&t<v.end):null;
    if(caption)s+=center(1730,caption.text,caption.text.length>16?43:48,'#ffffff','font-weight="700"');
    s+=line(76,1810,1004,1810,'#233746',1)+text(76,1855,'辅助驾驶技术路线系列',22,'#728a9d')+text(1004,1855,'工程示意 / 2D',19,'#728a9d','text-anchor="end" letter-spacing="2"');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><defs><radialGradient id="bg"><stop stop-color="#0d1e2b"/><stop offset="1" stop-color="${c.colors.background}"/></radialGradient></defs><rect width="1080" height="1920" fill="url(#bg)"/><g font-family="Noto Sans CJK SC, PingFang SC, sans-serif" style="font-variant-numeric:tabular-nums">${s}</g></svg>`;
  }
  return {render,validate,prepareImages};
});
