import { useMemo, useState } from 'react';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-basic-dist-min';
import type { PlotMouseEvent, PlotlyHTMLElement } from 'plotly.js';
import { sectionPoints, sectionStations } from '../analysis';
import { coordinates, type QueryResult, type Variable, type Observation, type ProfileResult } from '../types';
import Evidence from './Evidence';
const Plot = createPlotlyComponent(Plotly);
type Point = { result: ProfileResult; a: Observation; b?: Observation; depth: number; value: number };

export default function DepthSection({ query }: { query: QueryResult }) {
  const [lens, setLens] = useState<Variable>('temperature');
  const [mode, setMode] = useState<'observed' | 'gradient'>('observed');
  const [float, setFloat] = useState('all');
  const [axis, setAxis] = useState<'time' | 'distance'>('time');
  const [gap, setGap] = useState(50);
  const [selected, setSelected] = useState<Point | null>(null);
  const [evidence, setEvidence] = useState<Observation | null>(null);
  const variable = query.plan.variables.includes(lens) ? lens : query.plan.variables[0];
  const floats = [...new Set(query.profiles.map(r => r.profile.wmo))].sort();
  const results = useMemo(() => query.profiles.filter(r => float === 'all' || r.profile.wmo === float).sort((a,b) => a.profile.timestamp.localeCompare(b.profile.timestamp)), [query, float]);
  const stations = useMemo(() => sectionStations(results), [results]);
  const distanceAvailable = results.length > 0 && stations.length === results.length;
  const distanceView = axis === 'distance' && distanceAvailable;
  const stationById = new Map(stations.map(s => [s.profile_id, s]));
  const points = useMemo<Point[]>(() => sectionPoints(results, variable, mode, gap), [results, variable, gap, mode]);
  const units = `${variable === 'temperature' ? '°C' : 'PSS-78'}${mode === 'gradient' ? '/m' : ''}`;
  const limit = points.reduce((max,p) => Math.max(max, Math.abs(p.value)), 0.001);
  const inspect = (e:PlotMouseEvent) => { const p=points[e.points[0]?.pointIndex]; if(p) {setSelected(p);setEvidence(null);} };
  const bind = (graph:PlotlyHTMLElement) => {graph.removeAllListeners('plotly_click');graph.on('plotly_click',inspect);};
  const reset = () => {setSelected(null);setEvidence(null);};
  const download = () => {
    const payload = { method:distanceView?'observed-distance-depth-section-v1':'observed-time-depth-section-v1', axis:distanceView?'distance':'time', distance_method:distanceView?'Cumulative spherical great-circle endpoint separations; mean Earth radius 6371.0088 km. Retained query profiles only; not a measured underwater path.':null, stations:distanceView?stations:[], query_id:query.query_id, snapshot_id:query.snapshot_id, plan:query.plan, variable, mode, float, max_gradient_gap_m:gap, note:'No interpolation. Gradients are signed differences across consecutive source levels, at least 2 m apart. Gradient markers use interval midpoint depths. Time is UTC; positions vary between profiles.', profiles:results, points:points.map(p=>({profile_id:p.result.profile.id,source_level:p.a.source_level,end_source_level:p.b?.source_level??null,depth_m:p.depth,value:p.value,units,...(distanceView?{distance_km:stationById.get(p.result.profile.id)!.cumulative_km}:{})})) };
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=`floatchat-section-${query.query_id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <section className="profile-detail depth-section" aria-labelledby="section-title">
    <div className="detail-heading"><div><div className="eyebrow">ACROSS THE OBSERVATIONS</div><h2 id="section-title">Depth cross-section</h2><p>Explore the full query through depth, time, and distance.</p></div><button className="button secondary" onClick={download} disabled={!points.length}>Export section JSON</button></div>
    <div className="section-controls">
      <label>Variable<select aria-label="Section variable" value={variable} onChange={e=>{setLens(e.target.value as Variable);reset();}}>{query.plan.variables.map(v=><option key={v} value={v}>{v === 'temperature' ? 'Temperature' : 'Salinity'}</option>)}</select></label>
      <label>View<select aria-label="Section view" value={mode} onChange={e=>{setMode(e.target.value as typeof mode);reset();}}><option value="observed">Observed values</option><option value="gradient">Vertical gradient</option></select></label>
      <label>Float<select aria-label="Section float" value={float} onChange={e=>{setFloat(e.target.value);reset();}}><option value="all">All queried floats</option>{floats.map(f=><option key={f}>{f}</option>)}</select></label>
      <label>Horizontal axis<select aria-label="Section horizontal axis" value={distanceView?'distance':'time'} onChange={e=>{setAxis(e.target.value as typeof axis);reset();}}><option value="time">Observation time</option><option value="distance" disabled={!distanceAvailable}>Endpoint distance (one float)</option></select></label>
      {mode==='gradient' && <label>Maximum depth gap<select aria-label="Section maximum depth gap" value={gap} onChange={e=>{setGap(Number(e.target.value));reset();}}>{[25,50,100].map(n=><option key={n} value={n}>{n} m</option>)}</select></label>}
    </div>
    <p className="section-note">{results.length} profiles · {points.length} {mode==='gradient'?'valid intervals':'observed values'} · {query.plan.qc==='strict'?'QC 1':'QC 1 + 2'}. Full query scope; map replay and search do not filter this section.</p>
    {points.length ? <Plot data={[{type:'scatter',mode:'markers',x:points.map(p=>distanceView?stationById.get(p.result.profile.id)!.cumulative_km:p.result.profile.timestamp),y:points.map(p=>p.depth),text:points.map(p=>`Float ${p.result.profile.wmo} · cycle ${p.result.profile.cycle}<br>${p.result.profile.timestamp}<br>${coordinates(p.result.profile.latitude,p.result.profile.longitude)}<br>${p.value.toFixed(4)} ${units}${p.b?`<br>Interval ${p.a.depth_m.toFixed(1)}–${p.b.depth_m.toFixed(1)} m`:''}`),marker:{size:mode==='gradient'?7:6,symbol:mode==='gradient'?'diamond':'square',color:points.map(p=>p.value),colorscale:mode==='gradient'?'RdBu':'Viridis',showscale:true,...(mode==='gradient'?{cmin:-limit,cmax:limit}:{}),colorbar:{title:{text:units},thickness:12}},hovertemplate:distanceView?'%{text}<br>Endpoint distance %{x:.2f} km<br>Depth %{y:.1f} m<extra></extra>':'%{text}<br>Depth %{y:.1f} m<extra></extra>'}]} layout={{autosize:true,height:420,margin:{l:60,r:75,t:15,b:65},paper_bgcolor:'transparent',plot_bgcolor:'#f6fafb',font:{family:'Segoe UI, sans-serif',color:'#526d7a',size:11},xaxis:{type:distanceView?'linear':'date',title:{text:distanceView?'Cumulative endpoint distance (km)':'Observation time (UTC)'},gridcolor:'#e4edef'},yaxis:{title:{text:'Depth (m)'},range:[query.plan.max_depth,query.plan.min_depth],gridcolor:'#e4edef'},hovermode:'closest',dragmode:'zoom'}} config={{responsive:true,displayModeBar:false}} style={{width:'100%',height:420}} useResizeHandler onInitialized={(_,g)=>bind(g as PlotlyHTMLElement)} onUpdate={(_,g)=>bind(g as PlotlyHTMLElement)}/> : <div className="chart-empty">No valid {mode==='gradient'?'gradient intervals':'observations'} for these settings. Change the float, variable, or gap limit.</div>}
    <p className="section-note">Blank space is unsampled. {distanceView?'Distance sums great-circle separations between this float’s retained query positions. It depends on query coverage, including unsampled time gaps, and is not a measured underwater path or fixed-location transect.':'Positions vary: this is a time–depth view, not a fixed-location transect. Select one float to enable endpoint distance.'} Colors rescale to this selection. Drag to zoom; double-click to reset. {mode==='gradient'?'Diamonds mark interval midpoints, not additional measurements. Missing values, rejected levels and large gaps break gradients.':'Each marker is an original retained sample.'}</p>
    {distanceView && <details><summary>Distance stations and sampling gaps ({stations.length})</summary><div style={{overflowX:'auto'}}><table><thead><tr><th scope="col">Observation (UTC)</th><th scope="col">Position</th><th scope="col">Cumulative km</th><th scope="col">Segment km</th><th scope="col">Days since previous</th></tr></thead><tbody>{stations.map(s=><tr key={s.profile_id}><td>{s.timestamp}</td><td>{coordinates(s.latitude,s.longitude)}</td><td>{s.cumulative_km.toFixed(2)}</td><td>{s.segment_km.toFixed(2)}</td><td>{s.gap_days.toFixed(2)}</td></tr>)}</tbody></table></div></details>}
    <details><summary>Inspect a profile without using the chart</summary><div className="section-profile-links">{results.map(r=><button className="text-link" key={r.profile.id} disabled={!points.some(p=>p.result.profile.id===r.profile.id)} onClick={()=>{const p=points.find(p=>p.result.profile.id===r.profile.id);setSelected(p??null);setEvidence(null);}}>{r.profile.wmo} / cycle {r.profile.cycle}</button>)}</div></details>
    {selected && <div className="section-inspection"><strong>Float {selected.result.profile.wmo} · cycle {selected.result.profile.cycle} · {selected.value.toFixed(4)} {units}</strong><p>{selected.result.profile.timestamp} · {coordinates(selected.result.profile.latitude,selected.result.profile.longitude)}</p><button className="button secondary" onClick={()=>setEvidence(selected.a)}>Source level {selected.a.source_level} · {selected.a.depth_m.toFixed(1)} m</button>{selected.b && <button className="button secondary" onClick={()=>setEvidence(selected.b!)}>Source level {selected.b.source_level} · {selected.b.depth_m.toFixed(1)} m</button>}</div>}
    <Evidence result={selected?.result??null} sample={evidence} open={!!evidence} onClose={()=>setEvidence(null)}/>
  </section>;
}
