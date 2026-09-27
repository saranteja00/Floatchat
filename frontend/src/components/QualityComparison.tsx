import { useEffect, useRef, useState } from 'react';
import { postJSON } from '../api';
import type { QueryResult, Variable } from '../types';
import Evidence from './Evidence';
interface Added {profile_id:string;source_level:number;variable:Variable;value:number;depth_m:number;flags:Record<string,string>}
interface Comparison {method:string;snapshot_id:string;strict:QueryResult;expanded:QueryResult;added_values:Added[];added_levels:number;note:string}
export default function QualityComparison({result}:{result:QueryResult}) {
  const [comparison,setComparison]=useState<Comparison|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [choice,setChoice]=useState('');
  const [open,setOpen]=useState(false);
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  const compare=async()=>{controller.current?.abort();const c=new AbortController();controller.current=c;setBusy(true);setError('');try{setComparison(await postJSON<Comparison>('/api/query/quality-comparison',result.plan,c.signal));setChoice('');}catch(e){if(e instanceof Error&&e.name!=='AbortError')setError(e.message);}finally{if(!c.signal.aborted)setBusy(false);}};
  const added=choice!==''?comparison?.added_values[Number(choice)]:undefined;
  const profile=added?comparison?.expanded.profiles.find(r=>r.profile.id===added.profile_id):undefined;
  const sample=profile?.observations.find(o=>o.source_level===added?.source_level);
  const exportComparison=()=>{if(!comparison)return;const url=URL.createObjectURL(new Blob([JSON.stringify(comparison,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`floatchat-qc-${result.query_id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const range=(data:QueryResult,v:Variable)=>{const r=data.ranges[v];return r?`${r.min.toFixed(3)}–${r.max.toFixed(3)} (${r.count} values)`:'Unavailable';};
  return <section className="qc-comparison" aria-label="QC sensitivity comparison"><h3>How much does quality policy change the result?</h3><p>Compare QC 1 (good) with QC 1 + 2 (good and probably good), using the completed query filters. Your current result stays unchanged.</p><button className="button secondary" disabled={busy} onClick={()=>void compare()}>{busy?'Comparing quality policies…':'Compare QC policies'}</button>{error&&<p className="query-error" role="alert">{error}</p>}
    {comparison&&<><p role="status"><strong>{comparison.added_levels.toLocaleString()} additional source levels · {comparison.added_values.length.toLocaleString()} additional variable values</strong></p><div className="audit-table"><table className="data-table"><thead><tr><th>Measure</th><th>QC 1</th><th>QC 1 + 2</th></tr></thead><tbody><tr><td>Usable profiles</td><td>{comparison.strict.counts.usable_profiles}</td><td>{comparison.expanded.counts.usable_profiles}</td></tr><tr><td>Retained levels</td><td>{comparison.strict.counts.observations}</td><td>{comparison.expanded.counts.observations}</td></tr>{result.plan.variables.map(v=><tr key={v}><td>{v} range · {v==='temperature'?'°C':'PSS-78'}</td><td>{range(comparison.strict,v)}</td><td>{range(comparison.expanded,v)}</td></tr>)}</tbody></table></div><p>{comparison.note}</p>{!comparison.added_values.length?<p>No additional values for these filters. Both quality policies return the same usable observations.</p>:<><label className="ts-sample-picker">Inspect an additional value<select aria-label="Additional QC value" value={choice} onChange={e=>setChoice(e.target.value)}><option value="">Choose a source sample</option>{comparison.added_values.map((a,i)=><option key={`${a.profile_id}:${a.source_level}:${a.variable}`} value={i}>{a.profile_id} · level {a.source_level} · {a.variable} {a.value.toFixed(3)} · {a.depth_m.toFixed(1)} m</option>)}</select></label>{added&&<p>QC flags: position {added.flags.position}, time {added.flags.time}, pressure {added.flags.pressure}, variable {added.flags.variable}. QC 2 on any of these can explain inclusion.</p>}<button className="button secondary" disabled={!sample} onClick={()=>setOpen(true)}>Inspect expanded-policy source</button></>}<button className="button secondary" onClick={exportComparison}>Export QC comparison</button></>}
    <Evidence result={profile??null} sample={sample??null} open={open} onClose={()=>setOpen(false)}/>
  </section>;
}
