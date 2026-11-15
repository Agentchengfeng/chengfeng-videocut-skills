import {P,engineeringDefs,box,tx,instrumentPanel,tableElevation,occupancyCells,brakeAssembly,damperSection} from './index.mjs';
/** A brand-neutral second composition; no episode, cue, rating or vehicle data. */
export function renderExample(time,{width=1280,height=900}={}){
 const a=Math.sin(time*2.5)*.5+.5;
 let s=engineeringDefs()+box(0,0,1280,900,P.bg,0)+tx(48,64,'ENGINEERING / TWO-DIMENSIONAL MOTION',29,P.text);
 s+=instrumentPanel({x:40,y:115,width:565,height:720})+instrumentPanel({x:635,y:115,width:605,height:720});
 s+=tableElevation({x:90,y:220,width:465,height:340});
 const states=Array.from({length:18*14},(_,i)=>{const x=i%18,y=Math.floor(i/18);return y<2||x>0&&x<3||x>14&&x<17?2:1});
 s+=occupancyCells({x:90,y:220,columns:18,rows:14,cell:26,states,time,reveal:1,opacity:a*.75});
 s+=tx(78,790,'Geometry / occupied and free space',25,P.cyan);
 s+=brakeAssembly({x:815,y:405,scale:1.05,time,clampAmount:a});
 s+=damperSection({x:1100,y:235,scale:1.1,time,travel:Math.sin(time*2)});
 s+=tx(675,790,'Mechanical clamp / active strut',25,P.orange);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1280 900" font-family="Noto Sans CJK SC, sans-serif">${s}</svg>`;
}
