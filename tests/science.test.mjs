import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {loadData,sample,jd,utcToTdb,dateUTC,scenePoint,AU,C,START,END} from '../src/trajectory.js';
import {resolveEvents,shots,shotAt} from '../src/timeline.js';
const manifest=JSON.parse(readFileSync('public/data/manifest.json','utf-8'));
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
test('all datasets have the recorded hash, shape, time endpoints and strictly increasing epochs',()=>{
 for(const [name,spec] of Object.entries(manifest.datasets)){
  const b=readFileSync('public/data/'+spec.file);
  assert.equal(hash(b),spec.sha256,name);
  assert.equal(b.length,spec.rows*spec.columns*8,name);
  assert.equal(b.readDoubleLE(0),spec.start_jd_tdb,name);
  assert.equal(b.readDoubleLE(b.length-spec.columns*8),spec.stop_jd_tdb,name);
  let previous=-Infinity;
  for(let offset=0;offset<b.length;offset+=spec.columns*8){
   const value=b.readDoubleLE(offset);
   assert.ok(value>previous,name);
   previous=value;
   for(let i=1;i<spec.columns;i++)assert.ok(Number.isFinite(b.readDoubleLE(offset+i*8)),name);
  }
 }
});
test('interpolation remains in bounds and preserves exact endpoints',()=>{
 const table=new Float64Array([1,10,20,2,12,24,3,16,29]);
 assert.deepEqual(sample(table,1,3),[10,20]);
 assert.deepEqual(sample(table,1.5,3),[11,22]);
 assert.deepEqual(sample(table,3,3),[16,29]);
 assert.equal(sample(table,3.1,3),null);
 assert.deepEqual(scenePoint([AU,AU,2*AU]),[1,2,-1]);
});
test('UTC round trips and offsets change at known leap dates',()=>{
 for(const time of ['1977-08-20T14:29:00Z','2000-01-01T12:00:00Z','2026-11-18T10:16:00Z']){
  const t=jd(time);
  assert.ok(Math.abs(dateUTC(utcToTdb(t)).getTime()-Date.parse(time))<3);
 }
 assert.ok(Math.abs((utcToTdb(jd('2026-01-01'))-jd('2026-01-01'))*86400-69.184)<.004);
});
test('real Voyager data covers all shots and brackets the calculated light-day milestone',async()=>{
 const previousFetch=globalThis.fetch;
 globalThis.fetch=async path=>new Response(readFileSync('public/'+path));
 try{
  const data=await loadData('');
  const chapters=resolveEvents(data);
  assert.equal(chapters.length,10);
  assert.equal(data.state(1,START),null);
  assert.equal(data.state(0,START),null);
  assert.equal(chapters.at(-1).date,'2026-11-18');
  assert.ok(Math.abs(data.distance(0,data.milestone)/C-86400)<.0001);
  assert.ok(data.distance(0,data.milestone-1/24)<C*86400);
  assert.ok(data.distance(0,data.milestone+1/24)>C*86400);
  const flyby=data.jupiterFlyby;
  assert.equal(flyby.samples.length,145);
  assert.equal(dateUTC(flyby.closest.time).toISOString().slice(0,10),'1979-03-05');
  assert.ok(flyby.closest.range>347000&&flyby.closest.range<350000);
  const {time}=flyby.closest;
  assert.ok(Math.hypot(...flyby.relative(time-.5))>flyby.closest.range*2.5);
  assert.ok(Math.hypot(...flyby.relative(time+.5))>flyby.closest.range*2.5);
  assert.equal(shots.reduce((sum,s)=>sum+s.seconds,0),90);
  assert.deepEqual(shotAt(40.125,chapters),shotAt(40.125,chapters));
  for(let t=0;t<90;t+=.2){
   const shot=shotAt(t,chapters);
   assert.ok(data.state(shot.event.target,shot.time),'missing shot state at '+t);
   assert.ok(data.planet('earth',shot.time),'missing Earth state at '+t);
  }
  for(let i=0;i<2;i++){
   const r=Math.hypot(...data.state(i,END).slice(0,3))/AU;
   assert.ok(r>140&&r<175);
  }
 }finally{globalThis.fetch=previousFetch;}
});
