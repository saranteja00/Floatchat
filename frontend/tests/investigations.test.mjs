import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePlan,parseInvestigations,serializeInvestigations} from '../src/investigations.ts';
const plan={snapshot_id:'snapshot-a',float_ids:['1902676'],start_date:'2025-05-01',end_date:'2025-05-31',min_depth:200,max_depth:1000,variables:['temperature','salinity'],qc:'strict',bounds:null};
const entry={id:'bookmark',name:'May profiles',saved_at:'2026-09-20T00:00:00Z',plan};
test('bookmark roundtrip preserves snapshot and drops unrelated fields',()=>{
 const [r]=parseInvestigations(serializeInvestigations([{...entry,secret:'never store',plan:{...plan,secret:'drop'}}]));
 assert.equal(r.plan.snapshot_id,plan.snapshot_id);assert.equal(r.plan.min_depth,200);assert.equal(r.secret,undefined);assert.equal(r.plan.secret,undefined);
});
test('reject malformed dates, reversed ranges and invalid selections',()=>{
 for(const patch of [{start_date:'2025-02-30'},{end_date:'2024-01-01'},{max_depth:100},{min_depth:NaN},{float_ids:['bad']},{variables:[]},{variables:['oxygen']},{qc:'anything'},{bounds:{west:0,east:20,south:30,north:10}}])assert.throws(()=>validatePlan({...plan,...patch}));
});
test('date-line bounds remain valid and explicit',()=>{assert.equal(validatePlan({...plan,bounds:{west:170,east:-170,south:-10,north:10}}).bounds.east,-170);});
test('imports reject duplicate ids, unsupported schema and size limits',()=>{
 for(const text of ['bad json',JSON.stringify({version:2,investigations:[]}),serializeInvestigations([entry,entry]),serializeInvestigations(Array.from({length:21},(_,i)=>({...entry,id:String(i)}))),' '.repeat(200001)])assert.throws(()=>parseInvestigations(text));
});
