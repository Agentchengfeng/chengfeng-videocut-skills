import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFileSync}from'node:child_process';
import {createRequire}from'node:module';
import {renderExample}from'./examples.mjs';
const require=createRequire(import.meta.url),{Resvg}=require('../../../../automotive-video/node_modules/@resvg/resvg-js');
const output=process.argv[process.argv.indexOf('--out')+1];
if(!output||!process.argv.includes('--out'))throw Error('Pass --out /absolute/path/demo.mp4');
fs.mkdirSync(path.dirname(output),{recursive:true});
const font={loadSystemFonts:false,fontFiles:['/Users/I564407/Library/Fonts/NotoSansCJKsc-Regular.otf'],defaultFontFamily:'Noto Sans CJK SC'},cache=new Map();
const ff=spawn('ffmpeg',['-v','error','-y','-f','rawvideo','-pix_fmt','rgba','-video_size','1280x900','-framerate','30','-i','-','-an','-frames:v','120','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p',output],{stdio:['pipe','inherit','inherit']});
const done=new Promise((resolve,reject)=>{ff.on('error',reject);ff.on('close',c=>c===0?resolve():reject(Error(`ffmpeg ${c}`)));});
for(let frame=0;frame<120;frame++){
 const svg=renderExample(frame/30).replace(/<text\b[^>]*>[\s\S]*?<\/text>/g,node=>{
  if(!cache.has(node)){const s=new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="900" font-family="Noto Sans CJK SC">${node}</svg>`,{font}).toString();cache.set(node,s.replace(/^.*?<svg[^>]*>/s,'').replace(/<\/svg>\s*$/,''));}return cache.get(node);
 });
 const bytes=new Resvg(svg,{font:{loadSystemFonts:false}}).render().pixels;
 if(!ff.stdin.write(bytes))await new Promise(r=>ff.stdin.once('drain',r));
}
ff.stdin.end();await done;
execFileSync('ffmpeg',['-v','error','-i',output,'-f','null','-']);
console.log(JSON.stringify({file:output,frames:120,fps:30,width:1280,height:900,fullDecode:'PASS',audio:false}));
