import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import path from 'node:path';import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {renderExample,EXAMPLES} from './examples.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url),{Resvg}=require(require.resolve('@resvg/resvg-js',{paths:[path.resolve(dir,'../../../../automotive-video')]}));
const fonts=['Regular','Medium','Bold'].map(x=>path.join(process.env.HOME,'Library/Fonts',`NotoSansCJKsc-${x}.otf`)).filter(f=>fs.existsSync(f));
const raster=s=>new Resvg(s,{font:{loadSystemFonts:fonts.length===0,fontFiles:fonts}}).render().pixels,hash=b=>crypto.createHash('sha256').update(b).digest('hex');let count=0;
for(const name of EXAMPLES)for(const size of [[540,960],[960,540]])for(const time of [0,1.8,3.99]){
 const options={width:size[0],height:size[1]},svg=renderExample(name,time,options),a=raster(svg);renderExample(name,3,options);assert.equal(hash(a),hash(raster(renderExample(name,time,options))));
 assert.equal(a.length,size[0]*size[1]*4);assert.doesNotMatch(svg,/\b(?:width|height|r)="-\d|NaN|undefined|Infinity/);count++;
}
const alpha=raster(renderExample('cpu-gpu',1,{width:540,height:960,transparent:true}));let empty=0,solid=0;for(let i=3;i<alpha.length;i+=4){if(alpha[i]===0)empty++;if(alpha[i]===255)solid++}assert.ok(empty>100&&solid>100);console.log(JSON.stringify({status:'PASS',rasterStates:count,transparentAlpha:'PASS',arbitrarySeek:'PASS'}));
