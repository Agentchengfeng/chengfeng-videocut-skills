#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const {render,validate,prepareImages}=require(path.join(root,'assets/scene.js'));
// Reuse this repository's existing native SVG renderer. No browser or remote assets.
const kitRequire=createRequire(path.resolve(root,'../../../automotive-video/package.json'));
const {Resvg}=kitRequire('@resvg/resvg-js');
const args=process.argv.slice(2);
const value=(key,fallback)=>{const i=args.indexOf(key);if(i<0)return fallback;if(!args[i+1]||args[i+1].startsWith('--'))throw Error(`Missing ${key} value`);return args[i+1]};
const configPath=path.resolve(value('--config',path.join(root,'assets/config.json')));
const sourceConfig=validate(JSON.parse(fs.readFileSync(configPath,'utf8')));
const imageAssets=[];
const config=await prepareImages(sourceConfig,async src=>{
  const file=path.resolve(path.dirname(configPath),src),data=fs.readFileSync(file);
  const mime=/\.png$/i.test(src)?'image/png':/\.webp$/i.test(src)?'image/webp':'image/jpeg';
  imageAssets.push({path:src,sha256:createHash('sha256').update(data).digest('hex')});
  return `data:${mime};base64,${data.toString('base64')}`;
});
const out=path.resolve(value('--out',path.join(root,'output')));
const width=Number(value('--width',1080)),fps=Number(value('--fps',config.fps));
if(![540,1080].includes(width)||!Number.isInteger(fps)||fps<1||fps>120)throw Error('Use width 540/1080 and integer fps 1–120');
const height=width*16/9,frames=Math.ceil(config.duration*fps);
const fontDir=value('--font-dir',path.join(homedir(),'Library/Fonts'));
const fontFiles=['NotoSansCJKsc-Regular.otf','NotoSansCJKsc-Medium.otf','NotoSansCJKsc-Bold.otf'].map(f=>path.join(fontDir,f)).filter(f=>fs.existsSync(f));
const font={loadSystemFonts:fontFiles.length===0,fontFiles,defaultFontFamily:'Noto Sans CJK SC'};
const raster=t=>new Resvg(render(t,config),{fitTo:{mode:'width',value:width},font}).render();
fs.mkdirSync(out,{recursive:true});
const output=path.join(out,'adas-standard-intro-01.mp4'),tmp=path.join(out,'adas-standard-intro-01.part.mp4');
const ff=spawn('ffmpeg',['-v','error','-y','-f','rawvideo','-pixel_format','rgba','-video_size',`${width}x${height}`,'-framerate',String(fps),'-i','pipe:0','-c:v','libx264','-preset','medium','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart','-an','-frames:v',String(frames),tmp],{stdio:['pipe','ignore','pipe']});
let tail='',pipeError;
ff.stderr.on('data',d=>{tail=(tail+d).slice(-5000)});
ff.stdin.on('error',e=>{pipeError=e});
const done=new Promise((resolve,reject)=>{ff.on('error',reject);ff.on('close',code=>code===0?resolve():reject(Error(`ffmpeg ${code}: ${tail}`)))});
done.catch(()=>{});
try {
  for(let i=0;i<frames;i++) {
    if(pipeError)throw pipeError;
    const buffer=raster(i/fps).pixels;
    if(!ff.stdin.write(buffer))await Promise.race([once(ff.stdin,'drain'),done.then(()=>{throw Error('Encoder stopped early')})]);
    if(i%120===0)console.log(`Rendering ${i}/${frames}`);
  }
  ff.stdin.end();await done;fs.renameSync(tmp,output);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',output],{encoding:'utf8'}));
  const v=probe.streams.find(s=>s.codec_type==='video');
  if(v.width!==width||v.height!==height||Number(v.nb_read_frames)!==frames||v.r_frame_rate!==`${fps}/1`||probe.streams.some(s=>s.codec_type==='audio'))throw Error('Encoded video does not match expected silent animation');
  const anchors=config.styleVersion===2?[.30,.70,1.10,1.8,2.45,3.6,4.6,5.2,6.1,7.2,9.5,12.3,15.8,16.25]:[.9,3.8,7.2,9.5,12.3,16.1];
  const samples=anchors.map(t=>t/16.333*config.duration);
  const tiles=[];
  for(let i=0;i<samples.length;i++) {
    const name=`frame-${String(i+1).padStart(2,'0')}.png`,file=path.join(out,name);
    // Inspect the encoded output, rather than a second render of its configuration.
    execFileSync('ffmpeg',['-v','error','-y','-ss',String(samples[i]),'-i',output,'-frames:v','1',file]);
    tiles.push({time:samples[i],file:name});
  }
  const sheetH=Math.ceil(tiles.length/3)*600+20;
  const sheet=`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="${sheetH}"><rect width="960" height="${sheetH}" fill="#06101a"/>${tiles.map((q,i)=>`<g transform="translate(${15+i%3*315} ${15+Math.floor(i/3)*600})"><image width="300" height="534" href="data:image/png;base64,${fs.readFileSync(path.join(out,q.file)).toString('base64')}"/><text x="10" y="565" fill="#b5d3e5" font-family="sans-serif" font-size="20">${q.time.toFixed(2)}s</text></g>`).join('')}</svg>`;
  fs.writeFileSync(path.join(out,'contact-sheet.png'),new Resvg(sheet,{font:{loadSystemFonts:true}}).render().asPng());
  const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  execFileSync('ffmpeg',['-v','error','-i',output,'-f','null','-']);
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({kind:'standalone-silent-animation',styleVersion:config.styleVersion??1,output,config:configPath,configSha256:hash(configPath),sceneSha256:hash(path.join(root,'assets/scene.js')),videoSha256:hash(output),imageAssets,width,height,fps,frames,fontFiles,requestedDuration:config.duration,encodedDuration:Number(probe.format.duration),audio:'none supplied; none generated',encoding:'PASS',fullDecode:'PASS',decodedFrames:tiles,visualInspection:'UNVERIFIED',humanListening:'UNVERIFIED',productIntegration:'NOT_PERFORMED'},null,2)+'\n');
  console.log(JSON.stringify({output,width,height,fps,frames,duration:Number(probe.format.duration),bytes:fs.statSync(output).size}));
} catch(e) { ff.kill('SIGTERM');if(fs.existsSync(tmp))fs.unlinkSync(tmp);throw e }
