import { useMemo, useState } from 'react';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-basic-dist-min';
import { depthTargetSamples } from '../analysis';
import { floatColor, type QueryResult, type Variable } from '../types';
import Evidence from './Evidence';
const Plot = createPlotlyComponent(Plotly);

export default function DepthTimeSeries({query}:{query:QueryResult}) {
  const [target,setTarget]=useState('200');
  const [tolerance,setTolerance]=useState(10);
  const [lens,setLens]=useState<Variable>('temperature');
  const [float,setFloat]=useState('all');
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const variable=query.plan.variables.includes(lens)?lens:query.plan.variables[0];
  const depth=target.trim()===''?NaN:Number(target);
  const valid=Number.isFinite(depth)&&depth>=query.plan.min_depth&&depth<=query.plan.max_depth;
  const floats=[...new Set(query.profiles.map(r=>r.profile.wmo))].sort();
  const results=useMemo(()=>query.profiles.filter(r=>float==='all'||r.profile.wmo===float),[query,float]);
  const rows=useMemo(()=>valid?depthTargetSamples(results,variable,depth,tolerance):[],[results,variable,depth,tolerance,valid]);
  const selected=rows.find(r=>r.result.profile.id===selectedId);
  const matches=rows.filter(r=>r.observation);
  const unit=variable==='temperature'?'°C':'PSS-78';
  const reset=()=>setSelectedId(null);
  const download=()=>{
    const payload={method:'nearest-observed-depth-v1',query_id:query.query_id,snapshot_id:query.snapshot_id,plan:query.plan,variable,target_depth_m:depth,tolerance_m:tolerance,float,
      note:'One nearest finite retained sample per profile, within inclusive tolerance. Ties prefer shallower depth then source level. No interpolation or trend inference. Unmatched profiles remain explicit.',
      profiles:results,samples:rows.map(r=>({profile_id:r.result.profile.id,source_level:r.observation?.source_level??null,actual_depth_m:r.observation?.depth_m??null,offset_m:r.offset_m,value:r.observation?.[variable]??null,unit}))};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=`floatchat-depth-series-${query.query_id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <section className="profile-detail depth-time-series" aria-label="Depth-target time series">
    <div className="detail-heading"><div><div className="eyebrow">COMPARE AT A CHOSEN DEPTH</div><h2>Depth-target time series</h2><p>One nearest observed sample per profile, with its actual depth preserved.</p></div><button className="button secondary" disabled={!valid||!rows.length} onClick={download}>Export depth series</button></div>
    <div className="section-controls">
      <label>Target depth (m)<input aria-label="Time series target depth" type="number" min={query.plan.min_depth} max={query.plan.max_depth} value={target} onChange={e=>{setTarget(e.target.value);reset();}}/></label>
      <label>Depth tolerance<select aria-label="Time series tolerance" value={tolerance} onChange={e=>{setTolerance(Number(e.target.value));reset();}}>{[1,5,10,25,50].map(n=><option key={n} value={n}>±{n} m</option>)}</select></label>
      <label>Variable<select aria-label="Time series variable" value={variable} onChange={e=>{setLens(e.target.value as Variable);reset();}}>{query.plan.variables.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
      <label>Float<select aria-label="Time series float" value={float} onChange={e=>{setFloat(e.target.value);reset();}}><option value="all">All queried floats</option>{floats.map(f=><option key={f}>{f}</option>)}</select></label>
    </div>
    {!valid?<p role="alert">Enter a depth within the executed query: {query.plan.min_depth}–{query.plan.max_depth} m.</p>:<>
      <p className="section-note">{matches.length} matched / {rows.length} profiles · {rows.length-matches.length} without an eligible sample. Full query scope; independent of map replay and search.</p>
      {matches.length?<Plot data={floats.filter(f=>float==='all'||f===float).map(f=>{
        const samples=matches.filter(r=>r.result.profile.wmo===f);
        return {type:'scatter' as const,mode:'markers' as const,name:f,x:samples.map(r=>r.result.profile.timestamp),y:samples.map(r=>r.observation![variable]!),
          marker:{color:floatColor(f),size:9},text:samples.map(r=>`Float ${f} · cycle ${r.result.profile.cycle}<br>Actual depth ${r.observation!.depth_m.toFixed(2)} m<br>Offset ${r.offset_m!.toFixed(2)} m · source level ${r.observation!.source_level}`),
          hovertemplate:`%{text}<br>%{x}<br>%{y:.3f} ${unit}<extra></extra>`};
      })} layout={{autosize:true,height:340,margin:{l:65,r:20,t:20,b:90},paper_bgcolor:'transparent',plot_bgcolor:'#f6fafb',xaxis:{type:'date',title:{text:'Observation time (UTC)'}},yaxis:{title:{text:`${variable} (${unit})`}},legend:{orientation:'h',y:-0.3}}} config={{responsive:true,displayModeBar:false}} style={{width:'100%',height:340}} useResizeHandler/>:<p className="chart-empty">No sample falls within this depth tolerance. Change the target or tolerance.</p>}
      <p className="section-note">Markers are original measurements at potentially different depths and moving locations. No connecting lines, interpolation, or climate-trend inference. Missing variables and samples outside the tolerance stay unmatched. Ties prefer the shallower sample.</p>
      <details><summary>Inspect matches and unmatched profiles ({rows.length})</summary><div className="science-table"><table className="data-table"><thead><tr><th scope="col">Float / cycle</th><th scope="col">UTC</th><th scope="col">Actual depth</th><th scope="col">Offset</th><th scope="col">Value ({unit})</th><th scope="col">Evidence</th></tr></thead><tbody>{rows.map(r=><tr key={r.result.profile.id}><td>{r.result.profile.wmo} / {r.result.profile.cycle}</td><td>{r.result.profile.timestamp}</td><td>{r.observation?`${r.observation.depth_m.toFixed(2)} m`:'—'}</td><td>{r.offset_m===null?'—':`${r.offset_m.toFixed(2)} m`}</td><td>{r.observation?.[variable]?.toFixed(3)??'No eligible sample'}</td><td><button className="text-link" disabled={!r.observation} onClick={()=>setSelectedId(r.result.profile.id)}>Source sample</button></td></tr>)}</tbody></table></div></details>
    </>}
    <Evidence result={selected?.result??null} sample={selected?.observation??null} open={!!selected?.observation} onClose={reset}/>
  </section>;
}
