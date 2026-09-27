import test from 'node:test';
import assert from 'node:assert/strict';
import {gradients,thermocline,compareProfiles} from '../src/analysis.ts';
const sample=(source_level,depth_m,temperature,salinity=35)=>({source_level,depth_m,temperature,salinity});
const result=observations=>({snapshot_id:'s',method_version:'m',plan:{qc:'strict'},observations});
test('known cooling layer identified with signed finite difference',()=>{
 const {strongest,intervals}=thermocline([sample(0,0,28),sample(1,10,28),sample(2,30,24),sample(3,50,23)]);
 assert.equal(intervals,3);assert.equal(strongest.a.depth_m,10);assert.equal(strongest.b.depth_m,30);assert.equal(strongest.gradient,-.2);
});
test('gaps, missing, duplicated depths and rejected source levels are not bridged',()=>{
 for(const obs of [[sample(0,0,28),sample(1,70,20)],[sample(0,0,28),sample(1,20,null),sample(2,40,20)],[sample(0,20,28),sample(1,20,20)],[sample(0,0,28),sample(2,20,20)]])assert.equal(gradients(obs,'temperature').length,0);
});
test('warming and missing temperature cannot create a cooling candidate',()=>{
 assert.equal(thermocline([sample(0,0,20),sample(1,10,22)]).strongest,null);
 assert.equal(thermocline([]).strongest,null);
});
test('gap setting changes accepted intervals explicitly',()=>assert.equal(gradients([sample(0,0,28),sample(1,70,20)],'temperature',100).length,1));
test('comparison preserves values, sign and exact depth mismatch',()=>{
 const x=compareProfiles(result([sample(0,10,25)]),result([sample(4,12,23)]),'temperature',5);
 assert.equal(x.pairs[0].delta,2);assert.equal(x.pairs[0].depthOffset,-2);assert.equal(x.pairs[0].b.source_level,4);
});
test('comparison respects tolerance, missing values and no reference reuse',()=>{
 const a=result([sample(0,10,25),sample(1,11,24),sample(2,50,null),sample(3,80,22)]);
 const b=result([sample(0,12,23),sample(1,50,24)]);
 assert.equal(compareProfiles(a,b,'temperature',5).pairs.length,1);
 assert.equal(compareProfiles(a,b,'temperature',1).pairs.length,1);
 assert.equal(compareProfiles(result([]),b,'temperature').pairs.length,0);
});
test('incompatible QC, snapshot and method refuse comparison',()=>{
 const a=result([sample(0,10,25)]);
 for(const b of [{...a,snapshot_id:'other'},{...a,method_version:'other'},{...a,plan:{qc:'expanded'}}])assert.ok(compareProfiles(a,b,'temperature').error);
});

import {comparisonContext} from '../src/analysis.ts';
const contextResult=(latitude,longitude,timestamp)=>({profile:{latitude,longitude,timestamp}});
test('separation handles identical points, antimeridian and signed dates',()=>{
 const a=contextResult(0,179,'2025-05-02T00:00:00Z'),b=contextResult(0,-179,'2025-05-01T12:00:00Z');
 assert.equal(comparisonContext(a,a).distance_km,0);
 assert.ok(Math.abs(comparisonContext(a,b).distance_km-222.39016)<.01);
 assert.equal(comparisonContext(a,b).signed_days,.5);
 assert.equal(comparisonContext(b,a).signed_days,-.5);
});
test('antipodal separation remains finite',()=>{
 const a=contextResult(0,0,'2025-05-01'),b=contextResult(0,180,'2025-05-01');
 assert.ok(Math.abs(comparisonContext(a,b).distance_km-20015.11444)<.01);
});

import {sectionPoints} from '../src/analysis.ts';
test('section preserves sample identity and never bridges profiles',()=>{
 const a=result([sample(0,10,25)]),b=result([sample(1,20,20)]);
 assert.equal(sectionPoints([a,b],'temperature','gradient').length,0);
 const points=sectionPoints([a,b],'temperature','observed');
 assert.equal(points[0].a,a.observations[0]);assert.equal(points[1].result,b);
 assert.deepEqual(points.map(p=>p.value),[25,20]);
});
test('section interval midpoint and signed value retain both source endpoints',()=>{
 const r=result([sample(0,10,25),sample(1,30,21),sample(3,40,20)]);
 const [p,...rest]=sectionPoints([r],'temperature','gradient');
 assert.equal(rest.length,0);assert.equal(p.depth,20);assert.equal(p.value,-.2);
 assert.equal(p.a,r.observations[0]);assert.equal(p.b,r.observations[1]);
});
test('section excludes unavailable variables and handles empty queries',()=>{
 assert.deepEqual(sectionPoints([],'salinity','observed'),[]);
 assert.deepEqual(sectionPoints([result([sample(0,10,null)])],'temperature','observed'),[]);
});

import {temperatureSalinityPoints} from '../src/analysis.ts';
test('TS pairs use the same source level and preserve provenance',()=>{
 const r=result([sample(0,10,25,35),sample(1,20,null,36),sample(2,30,24,null)]);
 const points=temperatureSalinityPoints([r]);assert.equal(points.length,1);assert.equal(points[0].result,r);assert.equal(points[0].observation,r.observations[0]);
});
test('TS pairing excludes nonfinite values and never matches across profiles',()=>{
 assert.deepEqual(temperatureSalinityPoints([result([sample(0,10,null,35)]),result([sample(0,10,25,null)])]),[]);
 assert.deepEqual(temperatureSalinityPoints([result([sample(0,10,NaN,35),sample(1,Infinity,20,35)])]),[]);
 assert.deepEqual(temperatureSalinityPoints([]),[]);
});

import {sectionStations} from '../src/analysis.ts';
const station=(id,longitude,timestamp,wmo='a',latitude=0)=>({profile:{id,longitude,latitude,timestamp,wmo}});
test('section distance sorts stations without mutation and sums endpoint separation',()=>{
 const rows=[station('c',2,'2025-01-03'),station('a',0,'2025-01-01'),station('b',1,'2025-01-02')];
 const s=sectionStations(rows);
 assert.deepEqual(s.map(x=>x.profile_id),['a','b','c']);assert.equal(rows[0].profile.id,'c');
 assert.equal(s[0].cumulative_km,0);assert.ok(Math.abs(s[1].segment_km-111.19508)<.001);
 assert.ok(Math.abs(s[2].cumulative_km-222.39016)<.001);assert.equal(s[2].gap_days,1);
});
test('section stations handle dateline, stationary positions and timestamp ties',()=>{
 const s=sectionStations([station('b',-179,'2025-01-02'),station('c',-179,'2025-01-02'),station('a',179,'2025-01-01')]);
 assert.ok(Math.abs(s[1].segment_km-222.39016)<.001);assert.equal(s[2].segment_km,0);assert.equal(s[2].gap_days,0);
 assert.equal(s[2].cumulative_km,s[1].cumulative_km);
});
test('section stations refuse mixed floats and invalid coordinates or times',()=>{
 assert.deepEqual(sectionStations([]),[]);
 assert.deepEqual(sectionStations([station('a',0,'2025-01-01'),station('b',1,'2025-01-02','b')]),[]);
 for(const row of [station('a',NaN,'2025-01-01'),station('a',181,'2025-01-01'),station('a',0,'bad'),station('a',0,'2025-01-01','a',91)])assert.deepEqual(sectionStations([row]),[]);
});

import {depthTargetSamples} from '../src/analysis.ts';
const targetProfile=(id,observations)=>({...result(observations),profile:{id,timestamp:'2025-01-01'}});
test('depth target preserves nearest original sample and signed depth offset',()=>{
 const r=targetProfile('a',[sample(0,95,25),sample(1,102,24)]);
 const [p]=depthTargetSamples([r],'temperature',100,5);
 assert.equal(p.observation,r.observations[1]);assert.equal(p.offset_m,2);
 assert.equal(r.observations[0].depth_m,95);
});
test('target ties prefer shallow then source level, tolerance is inclusive',()=>{
 const r=targetProfile('a',[sample(4,105,24),sample(3,95,25),sample(2,95,26)]);
 assert.equal(depthTargetSamples([r],'temperature',100,5)[0].observation.source_level,2);
 assert.equal(depthTargetSamples([r],'temperature',100,4)[0].observation,null);
});
test('depth target retains unmatched profiles and excludes missing or nonfinite values',()=>{
 const r=targetProfile('a',[sample(0,100,null),sample(1,101,NaN),sample(2,Infinity,25)]);
 assert.equal(depthTargetSamples([r],'temperature',100,10)[0].observation,null);
 assert.equal(depthTargetSamples([r],'temperature',100,10)[0].offset_m,null);
 assert.deepEqual(depthTargetSamples([r],'temperature',NaN,10),[]);
 assert.deepEqual(depthTargetSamples([r],'temperature',100,-1),[]);
 assert.deepEqual(depthTargetSamples([],'salinity',100,5),[]);
});

import {rankDepartures} from '../src/analysis.ts';
const departure=(profile_id,source_level,value,status='matched')=>({profile_id,source_level,departure:value,status});
test('departure review ranks signed magnitudes without mutating source order',()=>{
 const rows=[departure('b',2,-3),departure('a',3,3),departure('a',1,3),departure('c',0,1)];
 const ranked=rankDepartures(rows,3);
 assert.deepEqual(ranked.map(r=>[r.profile_id,r.source_level]),[['a',1],['a',3],['b',2]]);
 assert.equal(rows[0].profile_id,'b');assert.equal(ranked[2],rows[0]);
 assert.deepEqual(rankDepartures(rows,3,'below'),[rows[0]]);
 assert.equal(rankDepartures(rows,3,'above').length,2);
});
test('departure review rejects unavailable values and invalid thresholds',()=>{
 const rows=[departure('a',0,null),departure('a',1,NaN),departure('a',2,Infinity),departure('a',3,9,'reference_masked'),departure('a',4,0)];
 assert.deepEqual(rankDepartures(rows,0),[rows[4]]);
 assert.deepEqual(rankDepartures(rows,0,'above'),[]);
 assert.deepEqual(rankDepartures(rows,-1),[]);
 assert.deepEqual(rankDepartures(rows,NaN),[]);
});
