import test from 'node:test';
import assert from 'node:assert/strict';
import { observationTimes, throughTime, replayFrame, colorFraction, displayHeight } from '../src/exploration.ts';
const profiles = [
 {id:'c',timestamp:'2025-05-03T12:00:00Z'},
 {id:'b',timestamp:'2025-05-01T12:00:00Z'},
 {id:'a',timestamp:'2025-05-01T12:00:00Z'},
];
test('replay groups simultaneous observations and orders actual instants',()=>assert.deepEqual(observationTimes(profiles),['2025-05-01T12:00:00Z','2025-05-03T12:00:00Z']));
test('first frame excludes future profiles and selects deterministically',()=>{
 const frame=replayFrame(profiles,0);
 assert.equal(frame.selected,'a');
 assert.deepEqual(throughTime(profiles,frame.timestamp).map(p=>p.id),['b','a']);
});
test('replay clamps endpoints without creating simulated frames',()=>{
 assert.equal(replayFrame(profiles,-1).selected,'a');
 assert.equal(replayFrame(profiles,99).selected,'c');
 assert.equal(throughTime(profiles,null).length,3);
});
test('empty query remains empty',()=>{
 assert.deepEqual(replayFrame([],0),{timestamp:null,selected:''});
 assert.deepEqual(throughTime([],null),[]);
});
test('missing measurements remain missing and fixed scales clip extremes',()=>{
 assert.equal(colorFraction(null,'temperature'),null);
 assert.equal(colorFraction(NaN,'salinity'),null);
 assert.equal(colorFraction(16,'temperature'),.5);
 assert.equal(colorFraction(34.5,'salinity'),.5);
 assert.equal(colorFraction(-2,'temperature'),0);
 assert.equal(colorFraction(40,'salinity'),1);
});
test('exaggeration only transforms display height and rejects invalid values',()=>{
 assert.equal(displayHeight(123.45,100),-12345);
 assert.equal(displayHeight(123.45,1),-123.45);
 assert.throws(()=>displayHeight(-1,100));
 assert.throws(()=>displayHeight(20,2));
});
