import {useEffect,useRef,useState} from 'react';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-basic-dist-min';
import type {PlotMouseEvent,PlotlyHTMLElement} from 'plotly.js';
const Plot=createPlotlyComponent(Plotly);
import {renderDepartureReport} from '../departureReport';
import {rankDepartures} from '../analysis';
import {postJSON} from '../api';
import type {QueryResult,Variable} from '../types';
import Evidence from './Evidence';
interface Row {profile_id:string;source_level:number;variable:Variable;observed:number;depth_m:number;month:number;baseline:number|null;departure:number|null;status:string;reference:null|{source_id:string;latitude:number;longitude:number;depth_m:number;depth_offset_m:number;latitude_offset_degrees:number;longitude_offset_degrees:number}}
interface Analysis {analysis_id:string;reference_id:string|null;query:QueryResult;period:string;depth_tolerance_m:number;note:string;counts:Record<string,number>;rows:Row[];sources:Record<string,{url:string;download_url?:string|null;archive?:string;filename:string;sha256:string;variable:string;title:string}>}
export default function AnomalyExplorer({query}:{query:QueryResult}){
 const [data,setData]=useState<Analysis|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [tolerance,setTolerance]=useState(25),[variable,setVariable]=useState<Variable>(query.plan.variables[0]),[selection,setSelection]=useState(''),[open,setOpen]=useState(false);
 const [threshold,setThreshold]=useState('0');
 const [reviewFloat,setReviewFloat]=useState('all');
 const [direction,setDirection]=useState<'both'|'above'|'below'>('both');
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 const run=async()=>{controller.current?.abort();const c=new AbortController();controller.current=c;setBusy(true);setError('');setData(null);setSelection('');setOpen(false);
 try{setData(await postJSON<Analysis>('/api/query/anomalies',{plan:query.plan,depth_tolerance_m:tolerance},c.signal));}
 catch(e){if(e instanceof Error&&e.name!=='AbortError')setError(e.message);}
 finally{if(!c.signal.aborted)setBusy(false);}};
 const rows=data?.rows.filter(r=>r.variable===variable)??[];
 const matches=rows.filter(r=>r.status==='matched');
 const limit=matches.reduce((n,r)=>Math.max(n,Math.abs(r.departure!)),0.001);
 const profileById=new Map(data?.query.profiles.map(p=>[p.profile.id,p.profile]));
 const magnitude=threshold.trim()===''?NaN:Number(threshold);
 const validThreshold=Number.isFinite(magnitude)&&magnitude>=0;
 const ranked=rankDepartures(matches.filter(r=>reviewFloat==='all'||profileById.get(r.profile_id)?.wmo===reviewFloat),magnitude,direction);
 const floats=[...new Set(query.profiles.map(p=>p.profile.wmo))].sort();
 const exportReview=()=>{
   if(!data||!validThreshold)return;
   const body={method:'departure-review-v1',analysis_id:data.analysis_id,reference_id:data.reference_id,filters:{variable,float:reviewFloat,minimum_absolute_departure:magnitude,direction},note:'Inclusive magnitude filter; descending absolute departure. A review threshold, not statistical significance or heatwave detection. All qualifying rows exported, including those beyond the displayed top 20.',ranked_samples:ranked,analysis:data};
   const url=URL.createObjectURL(new Blob([JSON.stringify(body,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='floatchat-departure-review-'+data.analysis_id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const inspect=(e:PlotMouseEvent)=>{const row=matches[e.points[0]?.pointIndex];if(row&&data){setSelection(String(data.rows.indexOf(row)));setOpen(false);}};
 const bind=(g:PlotlyHTMLElement)=>{g.removeAllListeners('plotly_click');g.on('plotly_click',inspect);};
 const chosen=selection===''?undefined:data?.rows[Number(selection)];
 const profile=chosen?data?.query.profiles.find(p=>p.profile.id===chosen.profile_id):undefined;
 const observation=profile?.observations.find(o=>o.source_level===chosen?.source_level);
 const source=chosen?.reference?data?.sources[chosen.reference.source_id]:undefined;
 const report=()=>{if(!data)return;const url=URL.createObjectURL(new Blob([renderDepartureReport(data)],{type:'text/html;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='floatchat-climatology-'+data.analysis_id+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const download=()=>{if(!data)return;const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=`floatchat-anomalies-${data.analysis_id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
 return <section className="profile-detail anomaly-explorer" aria-label="Climatology departures">
 <div className="detail-heading"><div><div className="eyebrow">OBSERVATIONS AGAINST A REFERENCE</div><h2>Climatology departures</h2><p>Compare with NOAA WOA23 monthly 1991–2020 normals.</p></div></div>
 <p className="section-note">Observed temperature or salinity minus the objectively analyzed monthly mean in the nearest 1° cell, at the nearest standard depth. This is an exploratory departure, not a marine-heatwave detection or statistical significance test. <a href="https://www.ncei.noaa.gov/products/world-ocean-atlas" target="_blank" rel="noreferrer">About NOAA World Ocean Atlas ↗</a></p>
 <div className="section-controls"><label>Maximum depth mismatch<select aria-label="Climatology depth tolerance" value={tolerance} disabled={busy} onChange={e=>{setTolerance(Number(e.target.value));setData(null);setSelection('');setOpen(false);}}>{[5,10,25,50].map(n=><option key={n} value={n}>±{n} m</option>)}</select></label><button className="button secondary" disabled={busy} onClick={()=>void run()}>{busy?'Comparing reference…':'Compare with climatology'}</button></div>
 {error&&<p role="alert" className="query-error">{error}</p>}
 {data&&<>
 {!data.reference_id&&<div role="status" className="inline-warning"><strong>Reference data is not installed.</strong><p>No anomaly values were calculated. NOAA reference files must be downloaded and validated before comparisons are available. Existing Argo exploration continues to work.</p><details><summary>Reference setup</summary><p>From the project terminal, run:</p><code>python -m backend.reference_import --archive ncar --months 5 6 7 8 9</code><p>This prepares temperature and salinity for those months at cached float locations. It downloads NOAA files from the NCAR archive. Then click Compare with climatology again.</p></details></div>}
 <div className="science-table"><table className="data-table"><caption>Coverage across all requested variables</caption><thead><tr><th>Status</th><th>Values</th></tr></thead><tbody>{Object.entries(data.counts).map(([k,v])=><tr key={k}><td>{k.replaceAll('_',' ')}</td><td>{v.toLocaleString()}</td></tr>)}</tbody></table></div>
 <div className="section-controls"><label>Variable<select aria-label="Climatology variable" value={variable} onChange={e=>{setVariable(e.target.value as Variable);setThreshold('0');setSelection('');setOpen(false);}}>{query.plan.variables.map(v=><option key={v}>{v}</option>)}</select></label><button className="button secondary" onClick={download}>Export departure evidence</button><button className="button secondary" onClick={report}>Download climatology report</button></div>
 <p className="section-note">{matches.length} matched {variable} values · {variable==='temperature'?'°C':'PSS-78'} · tolerance ±{data.depth_tolerance_m} m. Monthly coverage ends at the source file’s deepest standard level; no annual fallback or vertical extrapolation.</p>
 {!!matches.length&&<p>Observed departure range: {Math.min(...matches.map(r=>r.departure!)).toFixed(3)} to {Math.max(...matches.map(r=>r.departure!)).toFixed(3)} {variable==='temperature'?'°C':'PSS-78'}. This range summarizes matched samples, not a regional average.</p>}
 {!!matches.length&&<><Plot data={[{type:'scatter',mode:'markers',x:matches.map(r=>profileById.get(r.profile_id)!.timestamp),y:matches.map(r=>r.depth_m),text:matches.map(r=>`${r.profile_id}<br>Observed ${r.observed.toFixed(3)} · reference ${r.baseline!.toFixed(3)}<br>Departure ${r.departure!.toFixed(3)}<br>Reference depth ${r.reference!.depth_m} m`),marker:{size:6,symbol:'square',color:matches.map(r=>r.departure!),colorscale:[[0,'#2166ac'],[0.5,'#f7f7f7'],[1,'#b2182b']],cmin:-limit,cmax:limit,showscale:true,colorbar:{title:{text:variable==='temperature'?'Δ °C':'Δ PSS-78'},thickness:12}},hovertemplate:'%{text}<br>%{x}<br>Observed depth %{y:.1f} m<extra></extra>'}]} layout={{autosize:true,height:400,margin:{l:60,r:90,t:15,b:60},paper_bgcolor:'transparent',plot_bgcolor:'#f6fafb',xaxis:{type:'date',title:{text:'Observation time (UTC)'}},yaxis:{title:{text:'Depth (m)'},range:[query.plan.max_depth,query.plan.min_depth]}}} config={{responsive:true,displayModeBar:false}} style={{width:'100%',height:400}} useResizeHandler onInitialized={(_,g)=>bind(g as PlotlyHTMLElement)} onUpdate={(_,g)=>bind(g as PlotlyHTMLElement)}/><p className="section-note">Red is above the monthly mean; blue is below it. The scale is symmetric around zero and adapts to the selected variable. Blank space has no matched sample. Click a marker for both sources.</p></>}
 <section aria-label="Ranked departure review" className="departure-review"><h3>Review the largest departures</h3>
 <div className="section-controls"><label>Minimum absolute departure ({variable==='temperature'?'°C':'PSS-78'})<input aria-label="Departure review threshold" type="number" min="0" step="any" value={threshold} onChange={e=>setThreshold(e.target.value)}/></label><label>Float<select aria-label="Departure review float" value={reviewFloat} onChange={e=>setReviewFloat(e.target.value)}><option value="all">All queried floats</option>{floats.map(f=><option key={f}>{f}</option>)}</select></label><label>Direction<select aria-label="Departure review direction" value={direction} onChange={e=>setDirection(e.target.value as typeof direction)}><option value="both">Above and below</option><option value="above">Above monthly mean</option><option value="below">Below monthly mean</option></select></label><button className="button secondary" disabled={!validThreshold} onClick={exportReview}>Export ranked review</button></div>
 {!validThreshold?<p role="alert">Enter a finite, nonnegative magnitude.</p>:<><p className="section-note">{ranked.length} qualifying samples across {new Set(ranked.map(r=>r.profile_id)).size} profiles. Showing the largest {Math.min(20,ranked.length)} by absolute departure. Threshold includes equality; variable changes reset it to zero. These filters affect this review only, not the chart or full evidence export. Multiple depths from one profile are not independent events.</p>
 {ranked.length?<div className="science-table"><table className="data-table"><thead><tr><th scope="col">Float / cycle</th><th scope="col">UTC</th><th scope="col">Depth</th><th scope="col">Observed</th><th scope="col">Baseline</th><th scope="col">Departure</th><th scope="col">Evidence</th></tr></thead><tbody>{ranked.slice(0,20).map(r=><tr key={r.profile_id+':'+r.source_level}><td>{profileById.get(r.profile_id)?.wmo} / {profileById.get(r.profile_id)?.cycle}</td><td>{profileById.get(r.profile_id)?.timestamp}</td><td>{r.depth_m.toFixed(1)} m</td><td>{r.observed.toFixed(3)}</td><td>{r.baseline!.toFixed(3)}</td><td>{r.departure!>0?'+':''}{r.departure!.toFixed(3)}</td><td><button className="text-link" onClick={()=>{setSelection(String(data.rows.indexOf(r)));setOpen(false);}}>Review sources</button></td></tr>)}</tbody></table></div>:<p>No matched samples meet these review filters.</p>}</>}
 </section>
 <label className="ts-sample-picker">Inspect a comparison or exclusion<select aria-label="Climatology sample" value={selection} onChange={e=>{setSelection(e.target.value);setOpen(false);}}><option value="">Choose a sample</option>{data.rows.map((r,i)=>r.variable===variable?<option key={i} value={i}>{r.profile_id} · level {r.source_level} · {r.depth_m.toFixed(1)} m · {r.status.replaceAll('_',' ')}</option>:null)}</select></label>
 {chosen&&<div className="section-inspection"><strong>{chosen.profile_id} · source level {chosen.source_level}</strong><p>Observed: {chosen.observed.toFixed(3)} · monthly reference: {chosen.baseline?.toFixed(3)??'Unavailable'} · departure: {chosen.departure?.toFixed(3)??'Not calculated'}</p>{chosen.reference&&<p>Reference cell: {chosen.reference.latitude}°, {chosen.reference.longitude}° · standard depth {chosen.reference.depth_m} m · observed depth offset {chosen.reference.depth_offset_m.toFixed(2)} m. Spatial offsets: {chosen.reference.latitude_offset_degrees.toFixed(3)}° latitude, {chosen.reference.longitude_offset_degrees.toFixed(3)}° longitude.</p>}{source&&<p><a href={source.url} target="_blank" rel="noreferrer">{source.filename} ↗</a> · {source.variable}{source.download_url&&<> · <a href={source.download_url} target="_blank" rel="noreferrer">Download archive ({source.archive}) ↗</a></>}<br/>SHA-256: <code style={{overflowWrap:'anywhere'}}>{source.sha256}</code></p>}<button className="button secondary" disabled={!observation} onClick={()=>setOpen(true)}>Inspect Argo source</button></div>}
 <p className="section-note">{data.note} Real-time Argo values are preliminary. The baseline is not an independent validation dataset: its historical inputs can include Argo observations.</p>
 </>}
 <Evidence result={profile??null} sample={observation??null} open={open} onClose={()=>setOpen(false)}/>
 </section>;
}
