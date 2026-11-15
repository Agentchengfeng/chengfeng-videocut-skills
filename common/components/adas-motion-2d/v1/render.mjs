// Standalone resource renderer, not a Product editor/export replacement.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {renderKitDemoSVG} from './examples.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url);
const value=(flag,fallback)=>{const i=process.argv.indexOf(flag);return i<0?fallback:process.argv[i+1];};
const out=value('--out');if(!out)throw Error('--out /absolute/path/demo.mp4 required');
const width=Number(value('--width',1080)),height=Number(value('--height',1920)),fps=60,n=960;
if(width%2||height%2||width<200||height<200)throw Error('Even output dimensions >= 200 required');
const {Resvg}=require(require.resolve('@resvg/resvg-js',{paths:[path.resolve(dir,'../../../../automotive-video')]}));
const fonts=['Regular','Medium','Bold'].map(x=>path.join(process.env.HOME,'Library/Fonts',`NotoSansCJKsc-${x}.otf`)).filter(p=>fs.existsSync(p));
const raster=f=>new Resvg(renderKitDemoSVG(f,{fps,width,height}),{font:{fontFiles:fonts,loadSystemFonts:fonts.length===0}}).render().pixels;
fs.mkdirSync(path.dirname(out),{recursive:true});
const child=spawn('ffmpeg',['-v','error','-y','-f','rawvideo','-pix_fmt','rgba','-video_size',`${width}x${height}`,'-framerate',String(fps),'-i','pipe:0',
  '-an','-vf','scale=out_color_matrix=bt601:out_range=tv,format=yuv420p,setsar=1','-c:v','libx264','-threads','2',
  '-preset','fast','-crf','17','-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt470bg',
  '-video_track_timescale','90000','-movflags','+faststart','-frames:v',String(n),out],{stdio:['pipe','ignore','pipe']});
let error='';child.stderr.on('data',d=>error=(error+d).slice(-4000));
const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code?reject(Error(error)):resolve());});
for(let f=0;f<n;f++){
  if(!child.stdin.write(raster(f)))await new Promise(resolve=>child.stdin.once('drain',resolve));
  if(f%240===0)console.log(JSON.stringify({frame:f,total:n}));
}
child.stdin.end();await done;
const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',out]));
const video=probe.streams.find(s=>s.codec_type==='video');
if(Number(video.nb_read_frames)!==n||video.width!==width||video.height!==height||probe.streams.length!==1)throw Error('Actual encoded parameters differ');
execFileSync('ffmpeg',['-xerror','-v','error','-threads','2','-i',out,'-f','null','-']);
for(const f of [90,330,570,810])execFileSync('ffmpeg',['-v','error','-y','-ss',String(f/fps),'-i',out,'-frames:v','1',out.replace(/\.mp4$/i,`-${f}.png`)]);
fs.writeFileSync(out.replace(/\.mp4$/i,'.verification.json'),JSON.stringify({width,height,fps,actualDecodedFrames:n,audioTracks:0,strictDecode:'PASS',visualInspection:'UNVERIFIED',kind:'standalone-generic-resource-demo'},null,2)+'\n');
console.log(`Rendered and decoded ${out}`);
