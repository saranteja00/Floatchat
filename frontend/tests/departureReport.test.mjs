import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderDepartureReport} from '../src/departureReport.ts';
const fixture=()=>({analysis_id:'analysis',reference_id:'ref',period:'1991-2020',depth_tolerance_m:25,note:'No heatwave inference.',counts:{matched:2},sources:{hash:{url:'https://example.org/woa.nc',filename:'woa.nc',sha256:'hash'}},query:{query_id:'query',snapshot_id:'snap',plan:{variables:['temperature'],start_date:'2025-05-01',end_date:'2025-05-31',min_depth:0,max_depth:100,qc:'strict'},profiles:[{profile:{id:'p',wmo:'1902674',cycle:1,timestamp:'2025-05-01',data_mode:'R'},source:{url:'https://example.org/argo.nc',filename:'argo.nc',sha256:'argohash',profile_index:0}}]},rows:[{profile_id:'p',source_level:0,variable:'temperature',observed:23,depth_m:10,baseline:20,departure:3,status:'matched',reference:{source_id:'hash',depth_m:10,depth_offset_m:0}}]});
test('report preserves identities, values, source hashes and explicit scope',()=>{
 const html=renderDepartureReport(fixture());
 for(const value of ['23.000','20.000','3.000','argohash','woa.nc','1991-2020','departure-report-v1','ranked-review','No statistical significance'])assert.ok(html.includes(value),value);
 assert.ok(!html.includes('<script'));assert.ok(html.includes('@media print'));
});
test('report escapes metadata and refuses non-HTTPS links',()=>{
 const data=fixture();data.note='<img src=x onerror=alert(1)>';data.sources.hash.url='javascript:alert(1)';data.sources.hash.filename='<script>alert(1)</script>';
 const html=renderDepartureReport(data);assert.ok(!html.includes('<img'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('href="javascript:'));assert.ok(html.includes('&lt;script&gt;'));
});
test('missing reference and empty results are explicit rather than zeros',()=>{
 const data=fixture();data.reference_id=null;data.rows=[];data.sources={};data.counts={matched:0,baseline_unavailable:1};
 const html=renderDepartureReport(data);assert.ok(html.includes('No anomaly values calculated'));assert.ok(html.includes('No matched departures'));
});
test('report separates units and shows at most twenty rows per variable',()=>{
 const data=fixture();data.rows=Array.from({length:25},(_,i)=>({...data.rows[0],source_level:i,departure:i}));
 const html=renderDepartureReport(data);assert.ok(html.includes('Largest 20'));assert.ok(html.includes('24.000'));assert.ok(!html.includes('salinity departures'));
});
