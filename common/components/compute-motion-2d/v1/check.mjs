import assert from 'node:assert/strict';import {test} from 'node:test';
import * as K from './index.mjs';import {renderExample,EXAMPLES} from './examples.mjs';
test('polyline arc-length, reverse direction, repeated points and degenerate input',()=>{
 assert.deepEqual(K.pointAlong([[0,0],[10,0],[10,20]],.5),{x:10,y:5,heading:90});
 assert.equal(K.pointAlong([[10,0],[0,0]],.25).x,7.5);
 assert.deepEqual(K.pointAlong([[0,0],[0,0],[10,0]],0),{x:0,y:0,heading:0});
 assert.deepEqual(K.pointAlong([[0,0],[10,0],[10,0]],1),{x:10,y:0,heading:0});
 assert.throws(()=>K.pointAlong([[0,0],[0,0]],.4));assert.throws(()=>K.pointAlong([[0,0],[NaN,2]],.2));
});
test('public objects reject invalid time, dimensions and normalized state',()=>{
 for(const key of ['cpu','gpu','chipPackage','memoryBank','cacheBuffer','computeTile','modelNetwork','cameraSensor','memoryWall','dataflowFabric'])assert.throws(()=>K[key]({time:NaN}),key);
 for(const key of ['cpu','gpu','memoryBank','cacheBuffer','computeTile'])assert.throws(()=>K[key]({width:-1}),key);
 assert.throws(()=>K.cpu({load:NaN}));assert.throws(()=>K.cacheBuffer({fill:NaN}));assert.throws(()=>K.dataflowFabric({columns:1}));
 assert.throws(()=>K.dataBus({points:[[0,0],[10,10]],count:-1}));assert.throws(()=>K.defs('bad id'));
});
test('distinct CPU/GPU, composite reuse and independent namespaces',()=>{
 assert.notEqual(K.cpu({time:1}),K.gpu({time:1}));assert.notEqual(K.cpu({stalled:true}),K.cpu({stalled:false}));
 assert.match(K.memoryWall({time:1}),/等待|共享缓存/);assert.match(K.dataflowFabric({columns:2,rows:2}),/计算单元/);
 const defs=K.defs('a')+K.defs('b'),ids=[...defs.matchAll(/id="([^"]+)"/g)].map(x=>x[1]);assert.equal(new Set(ids).size,ids.length);
});
test('independent composition, negative-time phase and arbitrary seek are deterministic',()=>{
 for(const name of EXAMPLES){const expected=renderExample(name,1.3);for(const t of [3.8,0,-2,2.1]){renderExample(name,t);assert.equal(expected,renderExample(name,1.3))}assert.doesNotMatch(expected,/NaN|undefined|Infinity|\b(?:width|height|r)="-\d/);assert.notEqual(expected,renderExample(name,1.6));}
 assert.ok(K.phase(-5)>=0&&K.phase(-5)<1);
});
