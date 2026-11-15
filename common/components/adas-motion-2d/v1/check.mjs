import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {vehicle,cubic,pose,worldFrame,trajectory,svgDoc} from './index.mjs';
import {renderKitDemoSVG} from './examples.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url);
const {Resvg}=require(require.resolve('@resvg/resvg-js',{paths:[path.resolve(dir,'../../../../automotive-video')]}));
assert.deepEqual(cubic([[0,0],[0,-1],[1,-1],[1,-2]],0),[0,0]);
assert.deepEqual(cubic([[0,0],[0,-1],[1,-1],[1,-2]],1),[1,-2]);
assert.equal(pose([[0,0],[0,-1],[0,-2],[0,-3]],.5).heading,0);
assert.throws(()=>vehicle({kind:'unknown'}),/Unsupported/);
assert.throws(()=>vehicle({paint:'unknown'}),/Unsupported/);
assert.throws(()=>svgDoc('',{namespace:'bad id'}),/namespace/);
assert.match(svgDoc('',{namespace:'one'}),/id="one-glass"/);
assert.match(svgDoc('',{namespace:'two'}),/id="two-glass"/);
assert.equal(renderKitDemoSVG(300,{fps:60}),renderKitDemoSVG(150,{fps:30}));
assert.match(worldFrame('one',0,0,462,825,''),/scale\(0.462\)/,'No anisotropic model stretching');
const points=[[0,0],[0,-100],[100,-100],[100,-200]];
assert.notEqual(trajectory({points,progress:.2}),trajectory({points,progress:.8}));
const before=renderKitDemoSVG(307),after=renderKitDemoSVG(307);
for(const f of [900,0,530,2,959,240])renderKitDemoSVG(f);
assert.equal(renderKitDemoSVG(307),before);assert.equal(before,after);
const hashes=[];
for(const f of [0,119,240,359,480,599,720,839,959]){
  for(const size of [[540,960],[960,540]]){
    const svg=renderKitDemoSVG(f,{width:size[0],height:size[1]});
    const png=new Resvg(svg).render().asPng();
    hashes.push(crypto.createHash('sha256').update(png).digest('hex'));
    assert.equal(svg,renderKitDemoSVG(f,{width:size[0],height:size[1]}));
  }
}
assert.equal(new Set(hashes).size,hashes.length,'Start/mid/end raster states must change in both layouts');
const src=fs.readFileSync(path.join(dir,'index.mjs'),'utf8')+fs.readFileSync(path.join(dir,'examples.mjs'),'utf8');
assert.doesNotMatch(src,/Math\.random|Date\.now|setInterval|requestAnimationFrame|three\.js|ThreeCanvas/);
console.log('PASS: geometry, uniform model scale, invalid inputs, namespace isolation, arbitrary seek and 18 distinct portrait/landscape raster samples. Visual review is separate.');
