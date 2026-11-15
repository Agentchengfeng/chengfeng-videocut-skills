import assert from 'node:assert/strict';
import {createHash}from'node:crypto';
import {createRequire}from'node:module';
import {renderExample}from'./examples.mjs';
import {occupancyCells,engineeringDefs}from'./index.mjs';
const require=createRequire(import.meta.url);
const {Resvg}=require('../../../../automotive-video/node_modules/@resvg/resvg-js');
const font={loadSystemFonts:false,fontFiles:['/Users/I564407/Library/Fonts/NotoSansCJKsc-Regular.otf']};
const digest=s=>createHash('sha256').update(s).digest('hex');
assert.throws(()=>occupancyCells({states:[3]}),/Invalid/);
assert.throws(()=>occupancyCells({columns:2,rows:2,states:[1,2]}),/Invalid/);
assert.throws(()=>engineeringDefs('not valid'),/Invalid/);
const baseline=new Map([0,.7,2.5,4].map(t=>[t,digest(renderExample(t))]));
for(const t of [4,.7,0,2.5,0])assert.equal(digest(renderExample(t)),baseline.get(t));
assert.notEqual(baseline.get(0),baseline.get(2.5));
for(const [width,height]of [[1280,900],[1080,1920],[1920,1080]])for(const t of [0,2.5,4]){
 const image=new Resvg(renderExample(t,{width,height}),{font}).render();assert.equal(image.width,width);assert.equal(image.height,height);assert(image.asPng().length>5000);
}
console.log(JSON.stringify({contract:'PASS',invalidInputs:3,seekOrder:'PASS',rasterCases:9,scope:'Generic engineering objects; not an episode or vehicle validation'}));
